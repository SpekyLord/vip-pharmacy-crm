/**
 * Phase G9.A — inbox lookup helpers.
 *
 * Mirrors the lazy-seed pattern used by erpNotificationService.getChannelConfig
 * (NOTIFICATION_CHANNELS). All three categories are subscription-ready: each
 * new entity inherits the defaults on first read, and admin can edit rows in
 * Control Center without a code deploy.
 *
 * Categories managed here:
 *   - MESSAGE_FOLDERS              — inbox folder taxonomy (tabs + sidebar counts)
 *   - MESSAGE_ACTIONS              — action button row on each inbox item (label/
 *                                    variant/confirm/api_path)
 *   - MESSAGE_ACCESS_ROLES         — per-role DM / broadcast matrix (who can
 *                                    message whom). Works WITH the messaging.*
 *                                    ERP_ACCESS sub-permissions for the
 *                                    two-layer Phase-3c gate.
 *   - INBOX_HIDDEN_FOLDERS_BY_ROLE — per-role list of folder codes to hide
 *                                    from the left rail / Inbox view / counts.
 *                                    Default seed hides APPROVALS for
 *                                    president (already covered by Approval
 *                                    Hub). Admin extends via Control Center.
 *
 * All three are read on demand; none are required on application boot. A
 * missing entity_id (cross-tenant caller, for instance) falls through to
 * in-memory defaults.
 */

const Lookup = require('../models/Lookup');

// ─── Folder taxonomy ────────────────────────────────────────────────────
// Keep in sync with the UI's InboxFolderNav (Phase G9.E) and with
// backend/scripts/backfillMessageInboxEntityId.js CATEGORY_TO_FOLDER.
const FOLDER_DEFAULTS = [
  { code: 'INBOX',             label: 'Inbox',            sort_order: 1, metadata: { virtual: true,  description: 'Everything — all categories combined' } },
  { code: 'ACTION_REQUIRED',   label: 'Action Required',  sort_order: 2, metadata: { virtual: true,  description: 'Items awaiting your click ([Approve]/[Resolve]/etc.)' } },
  { code: 'APPROVALS',         label: 'Approvals',        sort_order: 3, metadata: { virtual: false, description: 'Approval requests + decisions + document-posted events' } },
  { code: 'TASKS',             label: 'Tasks / To-Do',    sort_order: 4, metadata: { virtual: false, description: 'Tasks assigned / reassigned / overdue / completed' } },
  { code: 'AI_AGENT_REPORTS',  label: 'AI Agents',        sort_order: 5, metadata: { virtual: false, description: 'Findings from rule-based and AI agents (KPI variance, daily briefing, OCR, etc.)' } },
  { code: 'ANNOUNCEMENTS',     label: 'Announcements',    sort_order: 6, metadata: { virtual: false, description: 'Broadcasts from admin / HR / system' } },
  { code: 'CHAT',              label: 'Chat',             sort_order: 7, metadata: { virtual: false, description: 'Direct messages and threaded conversations' } },
  { code: 'SENT',              label: 'Sent',             sort_order: 8, metadata: { virtual: true,  description: 'Messages you sent (not a real folder — sender filter)' } },
  { code: 'ARCHIVE',           label: 'Archive',          sort_order: 9, metadata: { virtual: true,  description: 'Archived items (per-recipient via archivedBy)' } },
];

// Category → Folder mapping. Canonical source. backfillMessageInboxEntityId.js
// MUST stay in sync.
const CATEGORY_TO_FOLDER = {
  announcement: 'ANNOUNCEMENTS',
  system: 'ANNOUNCEMENTS',
  policy: 'ANNOUNCEMENTS',

  payroll: 'APPROVALS',
  leave: 'APPROVALS',
  approval_request: 'APPROVALS',
  approval_decision: 'APPROVALS',
  document_posted: 'APPROVALS',

  compliance_alert: 'AI_AGENT_REPORTS',
  ai_coaching: 'AI_AGENT_REPORTS',
  ai_schedule: 'AI_AGENT_REPORTS',
  ai_alert: 'AI_AGENT_REPORTS',
  ai_agent_finding: 'AI_AGENT_REPORTS',
  briefing: 'AI_AGENT_REPORTS',
  compensation: 'AI_AGENT_REPORTS',
  kpiVariance: 'AI_AGENT_REPORTS',

  task_assigned: 'TASKS',
  task_overdue: 'TASKS',
  task_completed: 'TASKS',
  task_reassigned: 'TASKS',
  task_comment: 'TASKS',

  chat: 'CHAT',
  reply: 'CHAT',
};

function folderForCategory(category) {
  if (!category) return 'INBOX';
  return CATEGORY_TO_FOLDER[String(category)] || 'INBOX';
}

// ─── Action affordance taxonomy ────────────────────────────────────────
// Each action row's metadata.api_path is a template with `:token` placeholders
// that POST /api/messages/:id/action (G9.C) substitutes from action_payload.
// variant maps to Tailwind button style: primary (blue), secondary (grey),
// danger (red), success (green).
const ACTION_DEFAULTS = [
  {
    code: 'approve', label: 'Approve', sort_order: 1,
    metadata: { variant: 'primary', confirm: false, api_path: '/erp/approvals/universal-approve/:approval_request_id', label_action_done: 'Approved' },
  },
  {
    code: 'reject', label: 'Reject', sort_order: 2,
    metadata: { variant: 'danger', confirm: true, reason_required: true, api_path: '/erp/approvals/universal-reject/:approval_request_id', label_action_done: 'Rejected' },
  },
  {
    code: 'resolve', label: 'Resolve', sort_order: 3,
    metadata: { variant: 'primary', confirm: true, reason_required: true, api_path: '/erp/variance-alerts/:variance_alert_id/resolve', label_action_done: 'Resolved' },
  },
  {
    code: 'acknowledge', label: 'Acknowledge', sort_order: 4,
    metadata: { variant: 'secondary', confirm: false, api_path: null, label_action_done: 'Acknowledged' },
  },
  {
    code: 'reply', label: 'Reply', sort_order: 5,
    metadata: { variant: 'primary', confirm: false, api_path: '/api/messages/:id/reply', label_action_done: 'Replied' },
  },
  {
    code: 'open_link', label: 'Open', sort_order: 6,
    metadata: { variant: 'secondary', confirm: false, api_path: null, label_action_done: 'Opened' },
  },
];

// ─── Access matrix (who can DM whom) ───────────────────────────────────
// Works alongside ERP_ACCESS.messaging.* sub-permissions: these lookup rows
// are the DEFAULT role-based fallback when a user has no explicit
// per-module Access Template grant. Subscribers edit the metadata to adjust
// defaults without a code deploy.
const ACCESS_ROLES_DEFAULTS = [
  {
    code: 'president', label: 'President',
    sort_order: 1,
    metadata: { can_dm_roles: ['*'], can_broadcast: true, can_cross_entity: true },
  },
  {
    code: 'ceo', label: 'CEO',
    sort_order: 2,
    metadata: { can_dm_roles: ['*'], can_broadcast: true, can_cross_entity: true },
  },
  {
    code: 'admin', label: 'Admin',
    sort_order: 3,
    metadata: { can_dm_roles: ['*'], can_broadcast: true, can_cross_entity: false },
  },
  {
    code: 'finance', label: 'Finance',
    sort_order: 4,
    metadata: { can_dm_roles: ['*'], can_broadcast: false, can_cross_entity: false },
  },
  {
    code: 'staff', label: 'Staff / BDM',
    sort_order: 5,
    metadata: { can_dm_roles: ['admin', 'finance', 'president', 'ceo'], can_broadcast: false, can_cross_entity: false, can_dm_direct_reports: true },
  },
];

// ─── Per-role hidden-folders matrix ────────────────────────────────────
// Defaults: president has the dedicated Approval Hub at /erp/approvals — the
// APPROVALS folder would just duplicate it. Other roles see all folders.
// Admin can edit/extend via Control Center → Lookup Tables (e.g. add a `ceo`
// row, or hide TASKS for finance, etc.). `metadata.hidden_folders` is the
// authoritative array; missing/empty array → role sees everything.
const HIDDEN_FOLDERS_BY_ROLE_DEFAULTS = [
  {
    code: 'president', label: 'President',
    sort_order: 1,
    metadata: {
      hidden_folders: ['APPROVALS'],
      description: 'President uses Approval Hub (/erp/approvals); APPROVALS folder would duplicate.',
    },
  },
];

// ─── Generic lazy-seed helper ──────────────────────────────────────────
async function seedAndLoad(category, defaults, entityId) {
  if (!entityId) {
    // No entity context → return in-memory defaults as if they were rows.
    return defaults.map(d => ({ ...d, category, entity_id: null, is_active: true }));
  }
  try {
    let rows = await Lookup.find({ entity_id: entityId, category, is_active: true })
      .sort({ sort_order: 1 })
      .lean();
    if (rows.length === 0) {
      const ops = defaults.map(d => ({
        updateOne: {
          filter: { entity_id: entityId, category, code: d.code },
          update: {
            $setOnInsert: {
              entity_id: entityId,
              category,
              code: d.code,
              label: d.label,
              sort_order: d.sort_order,
              is_active: true,
              metadata: d.metadata || {},
            },
          },
          upsert: true,
        },
      }));
      try {
        await Lookup.bulkWrite(ops, { ordered: false });
      } catch (err) {
        console.warn(`[inboxLookups] ${category} lazy-seed failed:`, err.message);
      }
      rows = await Lookup.find({ entity_id: entityId, category, is_active: true })
        .sort({ sort_order: 1 })
        .lean();
    }
    // Fallback: defaults if DB read returned nothing (e.g., DB blip).
    if (rows.length === 0) return defaults.map(d => ({ ...d, category, entity_id: entityId, is_active: true }));
    return rows;
  } catch (err) {
    console.warn(`[inboxLookups] ${category} read failed:`, err.message);
    return defaults.map(d => ({ ...d, category, entity_id: entityId, is_active: true }));
  }
}

async function getFoldersConfig(entityId) {
  return seedAndLoad('MESSAGE_FOLDERS', FOLDER_DEFAULTS, entityId);
}

async function getActionsConfig(entityId) {
  return seedAndLoad('MESSAGE_ACTIONS', ACTION_DEFAULTS, entityId);
}

async function getAccessRolesConfig(entityId) {
  return seedAndLoad('MESSAGE_ACCESS_ROLES', ACCESS_ROLES_DEFAULTS, entityId);
}

async function getHiddenFoldersConfig(entityId) {
  return seedAndLoad('INBOX_HIDDEN_FOLDERS_BY_ROLE', HIDDEN_FOLDERS_BY_ROLE_DEFAULTS, entityId);
}

/**
 * Resolve the list of folder codes to hide from the inbox UI for a given role.
 * Always returns an UPPERCASE string array (folder codes are uppercase by
 * convention — see FOLDER_DEFAULTS). Empty array means "show all folders".
 * Null/empty role short-circuits to [] so callers can pass req.user.role
 * blindly without guarding.
 */
async function getHiddenFoldersForRole({ entityId, role }) {
  if (!role) return [];
  const rows = await getHiddenFoldersConfig(entityId);
  const row = rows.find((r) => String(r.code).toLowerCase() === String(role).toLowerCase());
  if (!row || !row.metadata) return [];
  const list = Array.isArray(row.metadata.hidden_folders) ? row.metadata.hidden_folders : [];
  return list
    .filter((c) => typeof c === 'string' && c.length > 0)
    .map((c) => c.toUpperCase());
}

/**
 * Evaluate whether a sender role may DM a given recipient role in this entity.
 * Checks MESSAGE_ACCESS_ROLES first (role-level defaults); does NOT consult
 * ERP_ACCESS.messaging.* — that gate is enforced in the controller before
 * calling this helper. Returns { ok, reason } so the caller can surface a
 * specific error code to the client.
 */
async function canDm({ entityId, senderRole, recipientRole, isDirectReport = false, crossEntity = false }) {
  if (!senderRole) return { ok: false, reason: 'no_sender_role' };
  const rows = await getAccessRolesConfig(entityId);
  const row = rows.find(r => String(r.code).toLowerCase() === String(senderRole).toLowerCase());
  const meta = row?.metadata || {};
  const allowed = Array.isArray(meta.can_dm_roles) ? meta.can_dm_roles : [];
  const wildcardOk = allowed.includes('*');
  const targetOk = wildcardOk || allowed.map(String).map(s => s.toLowerCase()).includes(String(recipientRole).toLowerCase());
  if (!targetOk && !(isDirectReport && meta.can_dm_direct_reports)) {
    return { ok: false, reason: 'role_denied' };
  }
  if (crossEntity && !meta.can_cross_entity) {
    return { ok: false, reason: 'cross_entity_denied' };
  }
  return { ok: true };
}

async function canBroadcast({ entityId, senderRole }) {
  if (!senderRole) return { ok: false, reason: 'no_sender_role' };
  const rows = await getAccessRolesConfig(entityId);
  const row = rows.find(r => String(r.code).toLowerCase() === String(senderRole).toLowerCase());
  if (!row?.metadata?.can_broadcast) return { ok: false, reason: 'broadcast_denied' };
  return { ok: true };
}

module.exports = {
  FOLDER_DEFAULTS,
  ACTION_DEFAULTS,
  ACCESS_ROLES_DEFAULTS,
  HIDDEN_FOLDERS_BY_ROLE_DEFAULTS,
  CATEGORY_TO_FOLDER,
  folderForCategory,
  getFoldersConfig,
  getActionsConfig,
  getAccessRolesConfig,
  getHiddenFoldersConfig,
  getHiddenFoldersForRole,
  canDm,
  canBroadcast,
};
