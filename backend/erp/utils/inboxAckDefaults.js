/**
 * Phase G9.R8 — Inbox acknowledgement defaults (Apr 2026).
 *
 * Decides whether a message should default to must_acknowledge=true based on
 * per-entity lookup rules. Subscribers edit the rules via Control Center →
 * Lookup Tables → INBOX_ACK_DEFAULTS without a code deploy (Rule #3).
 *
 * Evaluation order (first match wins):
 *   1. category ∈ ack-required-categories (default: AI_AGENT_REPORT family)
 *   2. requires_action === true (tasks / approvals — user explicitly expected to do something)
 *   3. sender role ∈ ack-broadcast-roles (default: president, admin) AND recipient is a broadcast
 *
 * Caller semantics:
 *   - The MessageInbox pre-save hook only invokes this when must_acknowledge
 *     was NOT set explicitly on the doc (admin override wins).
 *   - Returns true/false — never throws; on lookup failure returns false so
 *     writes never fail due to a config miss.
 *
 * Mirrors the lazy-seed pattern used in inboxLookups.js (NOTIFICATION_CHANNELS,
 * MESSAGE_FOLDERS etc.) — new entities inherit defaults automatically on first
 * read.
 */

const Lookup = require('../models/Lookup');
const { CATEGORY_TO_FOLDER } = require('./inboxLookups');

// ─── Rule defaults (per Apr 2026 user decision) ──────────────────────────
// Canonical source for the first-time seed. Control Center edits override
// these per-entity; the lookup rows are authoritative once they exist.
//
// NOTE: these are the CATEGORY / ROLE DEFAULTS. The lookup rows expose each
// rule as a metadata.value so an admin can toggle a single rule off without
// affecting the others.
const DEFAULTS_MAP = {
  // Rule 1: category-based ack enforcement.
  //   Any category whose folder is AI_AGENT_REPORTS requires ack by default —
  //   the point of an agent finding is that the BDM saw and processed it.
  CATEGORY_AI_AGENT_REPORT: {
    label: 'Require ack for AI agent reports',
    metadata: { value: true, folders: ['AI_AGENT_REPORTS'] },
  },
  // Rule 1 (continued): broadcast / admin-to-all messages.
  //   Paired with BROADCAST_ROLES for sender-role gating.
  CATEGORY_BROADCAST: {
    label: 'Require ack for broadcasts (recipientUserId=null)',
    metadata: { value: true, categories: ['announcement', 'policy', 'system'] },
  },
  // Rule 2: requires_action rows. Anything where the UI shows an action
  //   button should require ack before the button enables.
  REQUIRES_ACTION: {
    label: 'Require ack when requires_action is true',
    metadata: { value: true },
  },
  // Rule 3: sender-role scoped broadcasts. Only these roles' broadcasts
  //   carry the ack requirement. Subscribers can drop / add roles without
  //   deploying code.
  BROADCAST_ROLES: {
    label: 'Sender roles whose broadcasts need ack',
    metadata: { value: ['president', 'admin'] },
  },
};

// ─── Seeder ──────────────────────────────────────────────────────────────
async function seedAndLoad(entityId) {
  if (!entityId) {
    // No entity context — return in-memory defaults as rows.
    return Object.entries(DEFAULTS_MAP).map(([code, d]) => ({
      code, label: d.label, metadata: d.metadata, is_active: true,
    }));
  }
  try {
    let rows = await Lookup.find({ entity_id: entityId, category: 'INBOX_ACK_DEFAULTS', is_active: true })
      .sort({ sort_order: 1 })
      .lean();
    if (rows.length === 0) {
      const ops = Object.entries(DEFAULTS_MAP).map(([code, d], idx) => ({
        updateOne: {
          filter: { entity_id: entityId, category: 'INBOX_ACK_DEFAULTS', code },
          update: {
            $setOnInsert: {
              entity_id: entityId,
              category: 'INBOX_ACK_DEFAULTS',
              code,
              label: d.label,
              sort_order: idx + 1,
              is_active: true,
              metadata: d.metadata,
            },
          },
          upsert: true,
        },
      }));
      try {
        await Lookup.bulkWrite(ops, { ordered: false });
      } catch (err) {
        // Duplicate key race is fine — another request seeded first.
        console.warn('[inboxAckDefaults] seed conflict (likely safe):', err.message);
      }
      rows = await Lookup.find({ entity_id: entityId, category: 'INBOX_ACK_DEFAULTS', is_active: true })
        .sort({ sort_order: 1 })
        .lean();
    }
    return rows;
  } catch (err) {
    // Read failure → return in-memory defaults (never block writes).
    console.warn('[inboxAckDefaults] read failed:', err.message);
    return Object.entries(DEFAULTS_MAP).map(([code, d]) => ({
      code, label: d.label, metadata: d.metadata, is_active: true,
    }));
  }
}

// ─── Public API ──────────────────────────────────────────────────────────
/**
 * Returns true if this message should default to must_acknowledge=true.
 *
 * Never throws. Falsy on lookup failure.
 *
 * @param {Object}  ctx
 * @param {ObjectId|null} ctx.entity_id
 * @param {string}  ctx.category
 * @param {boolean} ctx.requires_action
 * @param {string}  ctx.senderRole
 */
async function evaluateAckDefault({ entity_id, category, requires_action, senderRole }) {
  const rows = await seedAndLoad(entity_id);
  // Build quick lookup by code → metadata
  const rules = {};
  for (const r of rows) rules[r.code] = r.metadata || {};

  // Rule 2 — requires_action takes precedence (most explicit signal).
  if (requires_action === true && rules.REQUIRES_ACTION?.value === true) {
    return true;
  }

  // Rule 1a — category maps to an ACK-required folder.
  if (rules.CATEGORY_AI_AGENT_REPORT?.value === true) {
    const folder = CATEGORY_TO_FOLDER[String(category || '').toLowerCase()];
    const folders = Array.isArray(rules.CATEGORY_AI_AGENT_REPORT.folders)
      ? rules.CATEGORY_AI_AGENT_REPORT.folders
      : ['AI_AGENT_REPORTS'];
    if (folder && folders.includes(folder)) return true;
  }

  // Rule 1b — specific broadcast categories (announcement, policy, system) + sender role gating.
  if (rules.CATEGORY_BROADCAST?.value === true) {
    const cats = Array.isArray(rules.CATEGORY_BROADCAST.categories)
      ? rules.CATEGORY_BROADCAST.categories.map((c) => String(c).toLowerCase())
      : ['announcement', 'policy', 'system'];
    const cat = String(category || '').toLowerCase();
    if (cats.includes(cat)) {
      // Check sender role — broadcasts from non-privileged roles don't auto-require ack.
      const ackRoles = Array.isArray(rules.BROADCAST_ROLES?.value)
        ? rules.BROADCAST_ROLES.value.map((r) => String(r).toLowerCase())
        : ['president', 'admin'];
      if (ackRoles.includes(String(senderRole || '').toLowerCase())) return true;
    }
  }

  return false;
}

module.exports = {
  evaluateAckDefault,
  DEFAULTS_MAP,
  // Exported for the retention/preview admin UI so it can render the same
  // rules the runtime sees.
  loadAckDefaults: seedAndLoad,
};
