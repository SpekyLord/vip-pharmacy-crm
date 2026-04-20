/**
 * integrationHooks — Phase SG-6 #32
 *
 * Lookup-driven event bus for Sales Goal lifecycle events. Other ERP modules
 * (payroll batch, accounting close, HR, future integrations) SUBSCRIBE to these
 * events; Sales Goal NEVER imports those modules. Drop-in subscribers: add
 * code in the consuming module, register a listener at startup, done.
 *
 * Design:
 *  - Event NAMES are governed by the `INTEGRATION_EVENTS` Lookup category so
 *    subscribers can SEE what's available from Control Center → Lookup Tables.
 *    An emit() with an unknown event code still fires (never drops a real
 *    event because the lookup was deleted), but logs a warning.
 *  - Listeners are registered in-process via `on(event, handler)`. Payloads
 *    are plain JSON-serializable objects — NO mongoose docs (keep listeners
 *    agnostic of Sales Goal models).
 *  - Emit is FIRE-AND-FORGET. Handler errors are caught per-handler and
 *    logged; one bad listener never blocks the emitting module. This is the
 *    same posture as our notification service — integration contracts must
 *    never crash the primary flow.
 *  - Every emit is also written to ErpAuditLog (log_type: STATUS_CHANGE,
 *    target_model: 'IntegrationEvent') so admins can reconstruct the signal
 *    stream even if a subscriber hadn't registered at the time.
 *
 * Why this exists: without an explicit event bus, payroll/HR/finance have to
 * poll IncentivePayout / SalesGoalPlan for changes — tight coupling, noisy,
 * latency-sensitive. With it, those modules drop in a listener and ship.
 *
 * Reuse: matches the non-blocking pattern in erpNotificationService (notifyX
 * returns a Promise that callers don't await) + the lookup-driven registry
 * pattern from AGENT_CONFIG.
 */

const mongoose = require('mongoose');
const Lookup = require('../models/Lookup');
const ErpAuditLog = require('../models/ErpAuditLog');

// In-process subscriber table. Map<eventCode, Array<handler>>.
// Handlers are functions `(payload) => Promise|void`. Per-event array.
const listeners = new Map();

// Cached set of registered event codes (from INTEGRATION_EVENTS lookup).
// Refreshed on-demand; emit() still runs when the cache is stale so a
// subscriber-created event never silently drops.
let registryCache = null;
let registryCacheAt = 0;
const REGISTRY_TTL_MS = 60 * 1000; // 1 min — matches other ERP caches

// Canonical event codes. Seeded via lookupGenericController SEED_DEFAULTS so
// subscribers see them in Control Center. Adding new codes: extend this list
// AND the seed; legacy subscribers keep working because emit() is permissive.
const INTEGRATION_EVENTS = {
  PLAN_ACTIVATED:     'plan.activated',
  PLAN_CLOSED:        'plan.closed',
  PLAN_REOPENED:      'plan.reopened',
  PLAN_VERSIONED:     'plan.versioned',
  PAYOUT_ACCRUED:     'payout.accrued',
  PAYOUT_APPROVED:    'payout.approved',
  PAYOUT_PAID:        'payout.paid',
  PAYOUT_REVERSED:    'payout.reversed',
  DISPUTE_FILED:      'dispute.filed',
  DISPUTE_RESOLVED:   'dispute.resolved',
  TARGET_REVISED:     'target.revised',
  PERSON_AUTO_ENROLLED:      'person.auto_enrolled',
  PERSON_LIFECYCLE_CLOSED:   'person.lifecycle_closed',
};

/**
 * Refresh the registry cache from Lookup.
 * Never throws — a DB hiccup leaves the prior cache in place.
 */
async function loadRegistry(force = false) {
  const now = Date.now();
  if (!force && registryCache && (now - registryCacheAt) < REGISTRY_TTL_MS) return registryCache;
  try {
    const rows = await Lookup.find({
      category: 'INTEGRATION_EVENTS',
      is_active: true,
    }).select('code label metadata').lean();
    registryCache = new Map(rows.map(r => [String(r.code), r]));
    registryCacheAt = now;
    return registryCache;
  } catch (err) {
    console.warn('[integrationHooks] registry cache refresh failed:', err.message);
    return registryCache || new Map();
  }
}

/**
 * Register a listener for an event. Returns an `unsubscribe()` function.
 * Handlers must accept a single `payload` arg; return value is ignored.
 */
function on(eventCode, handler) {
  if (typeof handler !== 'function') {
    throw new Error(`[integrationHooks.on] handler for ${eventCode} must be a function`);
  }
  const code = String(eventCode);
  if (!listeners.has(code)) listeners.set(code, []);
  listeners.get(code).push(handler);
  return () => {
    const list = listeners.get(code) || [];
    const idx = list.indexOf(handler);
    if (idx >= 0) list.splice(idx, 1);
  };
}

/**
 * Emit an event to every registered listener. Non-blocking at the caller —
 * listeners run on the next microtask so emit() returns immediately.
 *
 * payload structure (contract — do NOT embed mongoose docs):
 *   {
 *     event: 'plan.activated',
 *     entity_id: ObjectId | string,
 *     actor_id?: ObjectId | string,
 *     ref?: string,       // e.g. plan.reference, payout._id
 *     data?: object,      // event-specific fields (flat, JSON-safe)
 *     at: ISO timestamp
 *   }
 *
 * ErpAuditLog best-effort: an audit-log failure never breaks emit.
 */
function emit(eventCode, payload = {}) {
  const code = String(eventCode);
  const fullPayload = {
    ...payload,
    event: code,
    at: payload.at || new Date().toISOString(),
  };

  // Audit trail (best-effort) — gives admins a replayable signal stream even
  // if no listener was registered at the time of emission.
  (async () => {
    try {
      if (!payload.entity_id) return;
      await ErpAuditLog.create({
        entity_id: payload.entity_id,
        log_type: 'STATUS_CHANGE',
        target_ref: String(payload.ref || code),
        target_model: 'IntegrationEvent',
        field_changed: 'event',
        old_value: null,
        new_value: code,
        changed_by: payload.actor_id || new mongoose.Types.ObjectId('000000000000000000000000'),
        note: `integration event ${code}: ${safeStringify(payload.data)}`,
      });
    } catch (err) {
      console.warn(`[integrationHooks] audit write skipped for ${code}:`, err.message);
    }
  })();

  // Warn if the event isn't in the registry (subscriber observability) but
  // ALWAYS dispatch — losing a real emit because the lookup row was deleted
  // would be far worse than a stderr line.
  loadRegistry().then((registry) => {
    if (!registry.has(code)) {
      console.warn(`[integrationHooks] emit: ${code} not registered in INTEGRATION_EVENTS lookup (listeners still fire)`);
    }
  }).catch(() => { /* swallow — logged inside loadRegistry */ });

  const handlers = listeners.get(code) || [];
  for (const handler of handlers) {
    // Defer to next microtask so emit() returns synchronously.
    Promise.resolve().then(async () => {
      try {
        await handler(fullPayload);
      } catch (err) {
        console.error(`[integrationHooks] listener for ${code} threw:`, err.message);
      }
    });
  }
}

/**
 * Inspection helper for admin UIs / the future SOX matrix. Returns:
 *   [{ code, label, description, listener_count, enabled }]
 */
async function describeRegistry() {
  const registry = await loadRegistry(true);
  const rows = [];
  for (const [code, entry] of registry.entries()) {
    rows.push({
      code,
      label: entry?.label || code,
      description: entry?.metadata?.description || '',
      listener_count: (listeners.get(code) || []).length,
      enabled: entry?.is_active !== false,
    });
  }
  // Include any built-in code that's missing from the lookup (legacy seeds).
  for (const code of Object.values(INTEGRATION_EVENTS)) {
    if (!registry.has(code)) {
      rows.push({
        code,
        label: code,
        description: '(not yet seeded in INTEGRATION_EVENTS lookup — run seedAllLookups or edit in Control Center)',
        listener_count: (listeners.get(code) || []).length,
        enabled: true,
      });
    }
  }
  rows.sort((a, b) => a.code.localeCompare(b.code));
  return rows;
}

/**
 * Test-only — flush all listeners. Never call from production paths.
 */
function _resetForTests() {
  listeners.clear();
  registryCache = null;
  registryCacheAt = 0;
}

function safeStringify(obj) {
  try { return JSON.stringify(obj).slice(0, 500); }
  catch { return '<unstringifiable>'; }
}

module.exports = {
  INTEGRATION_EVENTS,
  on,
  emit,
  describeRegistry,
  _resetForTests,
};
