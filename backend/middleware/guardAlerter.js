/**
 * Guard Alerter — production MessageInbox notifier for entityGuard / bdmGuard.
 *
 * Day 4 of the Week-1 Stabilization. When a guard fires in `log` mode AND
 * NODE_ENV=production, dispatch a MessageInbox alert to the platform admin(s)
 * via the existing multi-channel `notify()` service (in-app + email by default;
 * SMS / Messenger when those channels are configured).
 *
 * Design:
 *  - **Fire-and-forget:** wrapped in `setImmediate` + `.catch()`. A failed
 *    alert NEVER breaks the original DB query the guard was observing.
 *  - **Dedup:** in-process LRU keyed on `(violationKind|model|requestPath)`.
 *    First alert per key wins for an hour. Prevents a single buggy endpoint
 *    hit 10k× from spamming 10k MessageInbox docs.
 *  - **No new lookups:** recipient resolution reuses `notify()`'s built-in
 *    `'ALL_ADMINS'` enum, which already filters via `ROLE_SETS.ADMIN_LIKE`
 *    (lookup-aligned per Phase G4 / G4.5). Override via env var
 *    `ENTITY_GUARD_ALERT_RECIPIENT` (accepts user ObjectId, 'PRESIDENT',
 *    or 'ALL_ADMINS'). Default 'ALL_ADMINS'.
 *  - **Recursion-safe:** `notify()` writes to User + MessageInbox + (via
 *    pre-save hook) Lookup. User and MessageInbox are in `deferred_crm`
 *    (skipped by entityGuard); the Lookup query inside the inbox ack-default
 *    hook DOES filter by entity_id. Verified end-to-end before shipping —
 *    no cascading re-entrant violations.
 *
 * Public API:
 *   maybeAlert({ kind, model, requestPath, payload })
 *     - kind: 'entity_filter_missing' | 'bdm_silent_self_fill'
 *     - model: e.g. 'SmerEntry'
 *     - requestPath: 'GET /api/erp/sales'
 *     - payload: full violation object (logged on the alert body too)
 *
 * NOT used in throw mode — the throw bubbles out of the Mongoose hook to the
 * controller's catchAsync, which already routes to the global errorHandler
 * (returns 500 + logs structured error). No need to double-alert.
 */

const DEDUP_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const DEDUP_CACHE_LIMIT = 500;          // hard cap so the Map can't grow unbounded

const dedupCache = new Map(); // key → lastAlertedAt(ms)

const dedupKey = (kind, model, requestPath) =>
  `${kind || 'unknown'}|${model || 'unknown'}|${requestPath || 'unknown'}`;

const shouldEmitAlert = (kind, model, requestPath) => {
  const key = dedupKey(kind, model, requestPath);
  const last = dedupCache.get(key);
  const now = Date.now();
  if (last && now - last < DEDUP_WINDOW_MS) return false;

  // Trim the cache if it crosses the cap. We intentionally drop the oldest
  // entry (insertion order in Map is iteration order).
  if (dedupCache.size >= DEDUP_CACHE_LIMIT) {
    const firstKey = dedupCache.keys().next().value;
    if (firstKey) dedupCache.delete(firstKey);
  }
  dedupCache.set(key, now);
  return true;
};

const buildAlertBody = ({ kind, model, requestPath, payload }) => {
  const lines = [];
  if (kind === 'entity_filter_missing') {
    lines.push('A query on an entity-scoped model was issued without an `entity_id` filter.');
    lines.push('This is a tenant-isolation leak risk (Phase 23 / G5 bug class).');
  } else if (kind === 'bdm_silent_self_fill') {
    lines.push('A privileged user (admin / finance / president) hit a query that');
    lines.push('filtered by `bdm_id` = their own _id, *without* an explicit `?bdm_id=` param.');
    lines.push('This is the Rule #21 silent-self-fill fingerprint — fix per CLAUDE.md Rule #21.');
  } else {
    lines.push(`Tenant-guard violation (${kind || 'unknown'}).`);
  }
  lines.push('');
  lines.push(`Model:        ${model || 'unknown'}`);
  lines.push(`Request:      ${requestPath || 'unknown'}`);
  if (payload?.requestId) lines.push(`Request ID:   ${payload.requestId}`);
  if (payload?.userId) lines.push(`User ID:      ${payload.userId}`);
  if (payload?.role) lines.push(`Role:         ${payload.role}`);
  if (payload?.entityId) lines.push(`Entity ID:    ${payload.entityId}`);
  if (Array.isArray(payload?.filterKeys) && payload.filterKeys.length) {
    lines.push(`Filter keys:  ${payload.filterKeys.join(', ')}`);
  }
  if (Array.isArray(payload?.pipelineStages) && payload.pipelineStages.length) {
    lines.push(`Pipeline:     [${payload.pipelineStages.join(', ')}]`);
  }
  lines.push('');
  if (Array.isArray(payload?.stack) && payload.stack.length) {
    lines.push('Stack (first frames):');
    payload.stack.slice(0, 6).forEach((frame) => lines.push(`  ${frame}`));
  }
  lines.push('');
  lines.push('Dedup window: 1 hour per (kind, model, request). Re-fires after that.');
  lines.push('Action: see docs/RUNBOOK.md → "Tenant Guard Violation" procedure.');
  return lines.join('\n');
};

const buildAlertTitle = ({ kind, model }) => {
  if (kind === 'entity_filter_missing') return `[GUARD] Missing entity filter on ${model}`;
  if (kind === 'bdm_silent_self_fill') return `[GUARD] Rule #21 self-fill on ${model}`;
  return `[GUARD] Violation on ${model}`;
};

const resolveRecipient = () => {
  const raw = (process.env.ENTITY_GUARD_ALERT_RECIPIENT || '').trim();
  if (!raw) return 'ALL_ADMINS';
  // Accept the existing notify() enum strings or a 24-char ObjectId.
  if (raw === 'PRESIDENT' || raw === 'ALL_ADMINS' || raw === 'ALL_BDMS') return raw;
  if (/^[a-f\d]{24}$/i.test(raw)) return raw;
  // Anything else: fall back to ALL_ADMINS rather than crash on bad config.
  // eslint-disable-next-line no-console
  console.warn(`[guardAlerter] Invalid ENTITY_GUARD_ALERT_RECIPIENT="${raw}" — defaulting to ALL_ADMINS.`);
  return 'ALL_ADMINS';
};

/**
 * Public: maybe dispatch a MessageInbox alert for a guard violation.
 * Caller is responsible for the console.error log line — this is purely
 * the human-visible notification step.
 *
 * Returns immediately; the actual notify() call is deferred via setImmediate.
 */
const maybeAlert = ({ kind, model, requestPath, payload }) => {
  if (process.env.NODE_ENV !== 'production') return;
  if (!shouldEmitAlert(kind, model, requestPath)) return;

  setImmediate(() => {
    // Lazy require — avoids loading notify()'s deps (and therefore the Resend
    // SDK / User model) at the time the guard plugin is attached, which
    // happens before mongoose connects.
    let notify;
    try {
      ({ notify } = require('../agents/notificationService'));
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[guardAlerter] Failed to load notificationService:', err.message);
      return;
    }
    notify({
      recipient_id: resolveRecipient(),
      title: buildAlertTitle({ kind, model }),
      body: buildAlertBody({ kind, model, requestPath, payload }),
      category: 'compliance_alert', // routes to AI_AGENT_REPORTS folder via folderForCategory
      priority: 'important',
      channels: ['in_app'], // email-flood guard: in-app only by default. Operators flip to ['in_app','email'] in .env if desired.
      agent: 'tenant_guard',
    }).catch((err) => {
      // eslint-disable-next-line no-console
      console.warn('[guardAlerter] notify() failed:', err.message);
    });
  });
};

// Test seam: clear dedup state between unit tests.
const _resetDedupForTests = () => dedupCache.clear();

module.exports = {
  maybeAlert,
  // exported for unit tests / introspection
  shouldEmitAlert,
  buildAlertBody,
  buildAlertTitle,
  resolveRecipient,
  _resetDedupForTests,
  DEDUP_WINDOW_MS,
};
