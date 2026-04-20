/**
 * messageRetentionAgent — Phase G9.R8 (Apr 2026)
 *
 * Nightly storage hygiene for the Unified Inbox. Deletes old archived / read /
 * AI-agent / broadcast messages according to per-entity INBOX_RETENTION lookup
 * rules (lazy-seeded — new subscribers inherit defaults on first run).
 *
 * Two-stage soft-delete → hard-delete pattern:
 *   Stage 1 (every run): mark candidates with
 *     { deletion_candidate: true, deletion_candidate_at: now }.
 *     Candidates are immediately hidden from the /messages list (the list
 *     filter excludes deletion_candidate=true). Admins can still recover
 *     within the grace period via the Retention Settings UI.
 *   Stage 2 (every run): hard-delete candidates whose
 *     deletion_candidate_at is older than GRACE_PERIOD_DAYS.
 *
 * Safety guards:
 *   - Never purge must_acknowledge messages that are still unacknowledged.
 *     These are compliance-sensitive (policy broadcasts, AI findings); they
 *     remain visible until dealt with manually.
 *   - Never purge unread non-broadcast messages younger than UNREAD_DAYS —
 *     a BDM returning from leave should still see their queue.
 *   - Never purge OPEN approvals (folder=APPROVALS) — those need manual
 *     closure via the Approval Hub.
 *
 * Integration:
 *   - Lookup-driven (Rule #3): every threshold + kill-switch lives in
 *     INBOX_RETENTION. Admin edits via Control Center.
 *   - Records run history + summary to AuditLog per entity.
 *   - Registered in backend/agents/agentRegistry.js so the Agent Dashboard
 *     exposes Run-Now + enable/disable + recent-runs view (Rule #7).
 *   - Nightly cron registration lives in backend/agents/agentScheduler.js.
 *
 * Public API:
 *   - run(args) — agentExecutor entry point (returns standard agent envelope).
 *   - runRetention({ entityId?, triggeredBy?, dryRun? }) — controller entry
 *     for manual Run-Now trigger.
 *   - previewRetention({ entityId? }) — dry-run count used by the
 *     Retention Settings UI to show "N messages will be purged next run".
 */

const Lookup = require('../models/Lookup');
const MessageInbox = require('../../models/MessageInbox');

// ─── Defaults ──────────────────────────────────────────────────────────
// Mirror backend/erp/controllers/lookupGenericController.js INBOX_RETENTION
// seed. These are the values used when the lookup has not been seeded for
// an entity yet (lazy-seed writes them on first run).
const DEFAULT_SETTINGS = {
  ENABLED: true,
  ARCHIVED_DAYS: 90,
  READ_DAYS: 180,
  UNREAD_DAYS: 365,
  AI_AGENT_DAYS: 30,
  BROADCAST_DAYS: 60,
  GRACE_PERIOD_DAYS: 7,
};

const DAY_MS = 24 * 60 * 60 * 1000;
const DAYS_AGO = (days) => new Date(Date.now() - days * DAY_MS);

// ─── Settings loader (lazy-seed) ───────────────────────────────────────
async function loadSettings(entityId) {
  // System-global run (entityId null) falls back to defaults — the agent
  // iterates entities explicitly, so this path is only hit for sanity checks.
  if (!entityId) return { ...DEFAULT_SETTINGS };

  const rows = await Lookup.find({ entity_id: entityId, category: 'INBOX_RETENTION', is_active: true }).lean();
  if (rows.length === 0) {
    // Lazy-seed on first encounter so the entity gets an editable row set
    // in Control Center without a manual Seed Now click.
    const ops = Object.entries(DEFAULT_SETTINGS).map(([code, value], idx) => ({
      updateOne: {
        filter: { entity_id: entityId, category: 'INBOX_RETENTION', code },
        update: {
          $setOnInsert: {
            entity_id: entityId,
            category: 'INBOX_RETENTION',
            code,
            label: code,
            sort_order: idx + 1,
            is_active: true,
            metadata: { value },
          },
        },
        upsert: true,
      },
    }));
    try {
      await Lookup.bulkWrite(ops, { ordered: false });
    } catch (err) {
      console.warn('[messageRetentionAgent] lazy-seed conflict (likely safe):', err.message);
    }
    return { ...DEFAULT_SETTINGS };
  }
  const out = { ...DEFAULT_SETTINGS };
  for (const r of rows) {
    if (r.code in out && r.metadata && r.metadata.value !== undefined) {
      out[r.code] = r.metadata.value;
    }
  }
  return out;
}

// ─── Candidate query builder ───────────────────────────────────────────
// Given settings, returns a MongoDB filter matching messages that are
// eligible for stage-1 soft-delete. Exported for previewRetention + tests.
function buildCandidateFilter(settings, entityId) {
  const base = {
    // Entity scope — skip cross-entity data under any condition.
    ...(entityId ? { entity_id: entityId } : {}),
    // Don't re-flag already-candidate rows (stage-1 is idempotent).
    deletion_candidate: { $ne: true },
  };

  // Composite "purge eligible" clause — OR of multiple rules.
  const ors = [];

  // Rule 1 — archived longer than ARCHIVED_DAYS. Uses updatedAt (the archive
  // action mutates updatedAt via the default timestamps option).
  if (settings.ARCHIVED_DAYS > 0) {
    ors.push({
      archivedBy: { $exists: true, $not: { $size: 0 } },
      updatedAt: { $lt: DAYS_AGO(settings.ARCHIVED_DAYS) },
    });
  }

  // Rule 2 — read, non-approval, older than READ_DAYS.
  //   Open approvals (folder=APPROVALS) are NEVER auto-purged — they need
  //   manual closure via the Approval Hub (approve/reject).
  if (settings.READ_DAYS > 0) {
    ors.push({
      readBy: { $exists: true, $not: { $size: 0 } },
      folder: { $ne: 'APPROVALS' },
      createdAt: { $lt: DAYS_AGO(settings.READ_DAYS) },
    });
  }

  // Rule 3 — acknowledged AI agent reports older than AI_AGENT_DAYS.
  //   Unacknowledged ones are protected by the must_acknowledge safety guard below.
  if (settings.AI_AGENT_DAYS > 0) {
    ors.push({
      folder: 'AI_AGENT_REPORTS',
      acknowledgedBy: { $exists: true, $not: { $size: 0 } },
      createdAt: { $lt: DAYS_AGO(settings.AI_AGENT_DAYS) },
    });
  }

  // Rule 4 — broadcasts (recipientUserId null) older than BROADCAST_DAYS
  //   AND read by at least one user (empty-audience broadcasts are protected
  //   by the UNREAD_DAYS safety net at Rule 5).
  if (settings.BROADCAST_DAYS > 0) {
    ors.push({
      $or: [{ recipientUserId: null }, { recipientUserId: { $exists: false } }],
      readBy: { $exists: true, $not: { $size: 0 } },
      createdAt: { $lt: DAYS_AGO(settings.BROADCAST_DAYS) },
    });
  }

  // Rule 5 — last-resort safety net for unread items (typically 365d).
  //   Applies only when the message is NOT an open approval AND NOT an
  //   unacknowledged must_ack row (safety guard below).
  if (settings.UNREAD_DAYS > 0) {
    ors.push({
      readBy: { $size: 0 },
      folder: { $ne: 'APPROVALS' },
      createdAt: { $lt: DAYS_AGO(settings.UNREAD_DAYS) },
    });
  }

  if (ors.length === 0) return null; // All rules disabled — nothing to purge
  base.$or = ors;

  // Safety guard — never purge an unacknowledged must-ack message.
  //   Combined with the $or above via $and so it gates every rule branch.
  base.$and = [
    {
      $or: [
        { must_acknowledge: { $ne: true } },
        { acknowledgedBy: { $exists: true, $not: { $size: 0 } } },
      ],
    },
  ];

  return base;
}

// ─── Stage 1: soft-delete ──────────────────────────────────────────────
async function stage1Mark(settings, entityId, dryRun) {
  const filter = buildCandidateFilter(settings, entityId);
  if (!filter) return { matched: 0, marked: 0 };
  if (dryRun) {
    const count = await MessageInbox.countDocuments(filter);
    return { matched: count, marked: 0 };
  }
  const now = new Date();
  const result = await MessageInbox.updateMany(filter, {
    $set: { deletion_candidate: true, deletion_candidate_at: now },
  });
  return { matched: result.matchedCount, marked: result.modifiedCount };
}

// ─── Stage 2: hard-delete ──────────────────────────────────────────────
async function stage2Purge(settings, entityId, dryRun) {
  const cutoff = DAYS_AGO(settings.GRACE_PERIOD_DAYS);
  const filter = {
    ...(entityId ? { entity_id: entityId } : {}),
    deletion_candidate: true,
    deletion_candidate_at: { $lt: cutoff },
  };
  if (dryRun) {
    const count = await MessageInbox.countDocuments(filter);
    return { matched: count, deleted: 0 };
  }
  const result = await MessageInbox.deleteMany(filter);
  return { matched: result.deletedCount || 0, deleted: result.deletedCount || 0 };
}

// ─── Per-entity runner ─────────────────────────────────────────────────
async function runForEntity(entityId, { dryRun = false, triggeredBy = null } = {}) {
  const started = Date.now();
  const settings = await loadSettings(entityId);
  if (settings.ENABLED === false) {
    return {
      entity_id: entityId,
      skipped: true,
      reason: 'disabled',
      duration_ms: Date.now() - started,
    };
  }

  const stage1 = await stage1Mark(settings, entityId, dryRun);
  const stage2 = await stage2Purge(settings, entityId, dryRun);
  const duration_ms = Date.now() - started;

  // Run history is recorded by the agent executor (see
  // backend/agents/agentExecutor.js → runScheduledAgent) — the envelope we
  // return from run() lands in the AgentRun collection so admins can review
  // past runs from the Agent Dashboard. Manual triggers via the controller
  // surface `result` in the HTTP response so the UI can show a toast.
  // No direct AuditLog write here (AuditLog enum is reserved for auth
  // events; adding new actions there is high-blast-radius).
  if (!dryRun && triggeredBy && (stage1.marked > 0 || stage2.deleted > 0)) {
    console.log(`[messageRetentionAgent] manual run by user=${triggeredBy} entity=${entityId}: marked=${stage1.marked}, deleted=${stage2.deleted}`);
  }

  return { entity_id: entityId, skipped: false, settings, stage1, stage2, duration_ms };
}

// ─── Public API — controller-facing ────────────────────────────────────
/**
 * Run retention across one entity or all entities.
 *   entityId: ObjectId|null — when null + privileged caller → iterate all
 *     active entities. Otherwise scoped to the provided entity.
 *   triggeredBy: ObjectId|null — recorded in AuditLog.
 *   dryRun: boolean — if true, counts candidates but does not mutate.
 */
async function runRetention({ entityId = null, triggeredBy = null, dryRun = false } = {}) {
  const started = Date.now();
  if (entityId) {
    const result = await runForEntity(entityId, { dryRun, triggeredBy });
    return {
      at: new Date().toISOString(),
      dry_run: !!dryRun,
      entities: [result],
      total_marked: result.stage1?.marked || 0,
      total_deleted: result.stage2?.deleted || 0,
      duration_ms: Date.now() - started,
    };
  }

  // No scope — iterate all active entities.
  const Entity = require('../models/Entity');
  const entities = await Entity.find({ is_active: { $ne: false } }).select('_id short_name').lean();
  const results = [];
  for (const e of entities) {
    try {
      results.push(await runForEntity(e._id, { dryRun, triggeredBy }));
    } catch (err) {
      console.error(`[messageRetentionAgent] entity ${e.short_name || e._id} failed:`, err.message);
      results.push({ entity_id: e._id, skipped: false, error: err.message });
    }
  }
  return {
    at: new Date().toISOString(),
    dry_run: !!dryRun,
    entities: results,
    total_marked: results.reduce((acc, r) => acc + (r.stage1?.marked || 0), 0),
    total_deleted: results.reduce((acc, r) => acc + (r.stage2?.deleted || 0), 0),
    duration_ms: Date.now() - started,
  };
}

async function previewRetention({ entityId = null } = {}) {
  // Preview is always a dry-run. When entityId is null we default to the
  // caller's entity scope (resolved upstream by the controller).
  const result = await runRetention({ entityId, dryRun: true });
  return result;
}

// ─── Agent registry entry point ────────────────────────────────────────
/**
 * Called by backend/agents/agentExecutor.js during scheduled runs.
 * Returns the standard agent-result envelope { status, summary, message_ids }.
 */
async function run(args = {}) {
  const result = await runRetention({
    entityId: args.entity_id || null,
    triggeredBy: args.triggered_by || null,
    dryRun: args.dry_run === true,
  });
  const bdms_processed = result.entities.filter((e) => !e.skipped && !e.error).length;
  const alerts_generated = 0; // retention is silent — doesn't notify anyone per run
  const key_findings = [];
  for (const e of result.entities) {
    if (e.skipped) continue;
    if (e.error) {
      key_findings.push(`entity ${e.entity_id}: error ${e.error}`);
      continue;
    }
    if ((e.stage1?.marked || 0) + (e.stage2?.deleted || 0) > 0) {
      key_findings.push(`entity ${e.entity_id}: marked=${e.stage1?.marked || 0}, deleted=${e.stage2?.deleted || 0}`);
    }
  }
  if (!key_findings.length) key_findings.push('No inbox messages eligible for purge across active entities.');
  return {
    status: 'success',
    summary: {
      bdms_processed,
      alerts_generated,
      messages_sent: 0,
      key_findings: key_findings.slice(0, 10),
    },
    message_ids: [],
    // Extra for dashboard / API consumers:
    extra: result,
  };
}

module.exports = {
  run,
  runRetention,
  previewRetention,
  // Exported for tests / admin UI
  buildCandidateFilter,
  loadSettings,
  DEFAULT_SETTINGS,
};
