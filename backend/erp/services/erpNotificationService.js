/**
 * ERP Notification Service
 *
 * Sends email notifications on document status changes (posted, reopened, approval).
 * All sends are non-blocking (fire-and-forget) — notification failure never breaks
 * business logic.
 *
 * Notification recipients are resolved dynamically from:
 *   - User model (role + entity_id + erp_access)
 *   - NotificationPreference model (user-level opt-in/out)
 *   - Settings.ENFORCE_AUTHORITY_MATRIX (controls whether approval notifications fire)
 *
 * No hardcoded recipient lists — all resolved from database at send time.
 */

const { ROLE_SETS } = require('../../constants/roles');
const User = require('../../models/User');
const Entity = require('../models/Entity');
const Settings = require('../models/Settings');
const Lookup = require('../models/Lookup');
const EmailLog = require('../../models/EmailLog');
const MessageInbox = require('../../models/MessageInbox');
const { sendEmail } = require('../../config/ses');
const {
  documentPostedTemplate,
  documentReopenedTemplate,
  approvalRequestTemplate,
  approvalDecisionTemplate,
  payrollPostedTemplate,
  // Phase SG-Q2 W3
  salesGoalPlanLifecycleTemplate,
  tierReachedTemplate,
  kpiVarianceAlertTemplate,
  // Phase SG-4 #23 ext
  compensationStatementReadyTemplate,
} = require('../../templates/erpEmails');

// ─── Helpers ────────────────────────────────────────────────────────

/**
 * Resolve entity name for email context.
 * Cached per request to avoid repeated DB calls.
 */
const entityNameCache = new Map();
const ENTITY_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const resolveEntityName = async (entityId) => {
  if (!entityId) return 'N/A';
  const key = entityId.toString();
  const cached = entityNameCache.get(key);
  if (cached && Date.now() < cached.expiry) return cached.name;

  try {
    const entity = await Entity.findById(entityId).select('name short_name').lean();
    const name = entity?.short_name || entity?.name || 'Unknown Entity';
    entityNameCache.set(key, { name, expiry: Date.now() + ENTITY_CACHE_TTL });
    return name;
  } catch {
    return 'Unknown Entity';
  }
};

/**
 * Find users who should receive notifications for a given entity and role filter.
 * Respects: isActive, entity scope, and email existence.
 *
 * @param {ObjectId} entityId
 * @param {Object} filter - additional query filters (e.g., { role: { $in: ['admin', 'finance'] } })
 * @returns {Promise<Array<{_id, email, name}>>}
 */
const findNotificationRecipients = async (entityId, filter = {}) => {
  try {
    const query = {
      isActive: true,
      email: { $exists: true, $ne: '' },
      ...filter,
    };

    // Multi-entity users: check entity_ids array; single-entity: check entity_id
    if (entityId) {
      query.$or = [
        { entity_id: entityId },
        { entity_ids: entityId },
        { role: { $in: ROLE_SETS.PRESIDENT_ROLES } }, // president/CEO see all entities
      ];
    }

    // `phone` is included so multi-channel SMS dispatch can use it (Phase
    // SG-Q2 W3 follow-ups). Callers that don't need SMS simply ignore it.
    return await User.find(query).select('_id email name role phone').lean();
  } catch (err) {
    console.error('Failed to find notification recipients:', err.message);
    return [];
  }
};

/**
 * Find management users for a given entity (the typical "notify management" audience).
 * Reads NOTIFICATION_RECIPIENT_ROLES from Settings — configurable by admin.
 */
const findManagementRecipients = async (entityId) => {
  let roles;
  try {
    const settings = await Settings.getSettings();
    roles = settings.NOTIFICATION_RECIPIENT_ROLES;
  } catch {
    // fallback if settings unavailable
  }
  if (!roles || !roles.length) roles = ROLE_SETS.MANAGEMENT;

  return findNotificationRecipients(entityId, {
    role: { $in: roles },
  });
};

/**
 * Find the user who owns a document (by userId).
 */
const findDocumentOwner = async (userId) => {
  if (!userId) return null;
  try {
    return await User.findById(userId).select('_id email name role').lean();
  } catch {
    return null;
  }
};

/**
 * Log email send attempt (matches existing EmailLog schema).
 */
const logEmail = async (recipient, recipientUserId, emailType, subject, status, messageId, errorMessage) => {
  try {
    await EmailLog.create({
      recipient,
      recipientUserId,
      emailType,
      subject,
      status,
      sesMessageId: messageId,
      errorMessage,
    });
  } catch (err) {
    console.error('Failed to log ERP email:', err.message);
  }
};

/**
 * Send email to a list of recipients (non-blocking, catches all errors).
 */
const sendToRecipients = async (recipients, templateFn, templateData, emailType) => {
  for (const recipient of recipients) {
    try {
      const data = { ...templateData, recipientName: recipient.name || 'User' };
      const { subject, html, text } = templateFn(data);
      const { messageId } = await sendEmail({ to: recipient.email, subject, html, text });
      await logEmail(recipient.email, recipient._id, emailType, subject, 'sent', messageId);
    } catch (err) {
      console.error(`ERP notification failed for ${recipient.email}:`, err.message);
      const subject = `VIP ERP - ${emailType}`;
      await logEmail(recipient.email, recipient._id, emailType, subject, 'failed', null, err.message);
    }
  }
};

// ─── Public API ─────────────────────────────────────────────────────

/**
 * Notify management when a document is posted.
 * Non-blocking — call without await in controllers.
 *
 * @param {Object} opts
 * @param {ObjectId} opts.entityId
 * @param {string} opts.module - 'Sales', 'Collections', 'Expenses', 'Purchasing'
 * @param {string} opts.docType - 'CSI', 'CR', 'SMER', 'ORE/ACCESS', etc.
 * @param {string} opts.docRef - document reference
 * @param {string} opts.postedBy - name of poster
 * @param {number} [opts.amount] - total amount
 * @param {string} [opts.period] - YYYY-MM
 */
const notifyDocumentPosted = async (opts) => {
  try {
    const entityName = await resolveEntityName(opts.entityId);
    const recipients = await findManagementRecipients(opts.entityId);
    if (!recipients.length) return;

    // Phase G9.B — dispatchMultiChannel persists an in-app MessageInbox row
    // in addition to the email, so management sees POSTED events inside the
    // inbox Approvals folder (badge + acknowledge action). Email kill-switch
    // and per-user preferences are honoured by dispatchMultiChannel.
    await dispatchMultiChannel(recipients, {
      templateFn: documentPostedTemplate,
      templateData: {
        module: opts.module,
        docType: opts.docType,
        docRef: opts.docRef,
        postedBy: opts.postedBy,
        entityName,
        amount: opts.amount,
        period: opts.period,
      },
      emailType: 'ERP_DOCUMENT_POSTED',
      category: 'document_posted',
      entityId: opts.entityId,
      inAppCategory: 'document_posted',
      inAppFolder: 'APPROVALS',
      inAppPriority: 'normal',
      inAppRequiresAction: false,
      inAppActionType: 'acknowledge',
      inAppActionPayload: { module: opts.module, doc_type: opts.docType, doc_ref: opts.docRef, deep_link: `/erp/${String(opts.module || '').toLowerCase()}` },
    });
  } catch (err) {
    console.error('notifyDocumentPosted failed:', err.message);
  }
};

/**
 * Notify management when a document is reopened (reversal).
 */
const notifyDocumentReopened = async (opts) => {
  try {
    const entityName = await resolveEntityName(opts.entityId);
    const recipients = await findManagementRecipients(opts.entityId);
    if (!recipients.length) return;

    // Phase G9.B — also surfaces in-app so auditors see reversals in their
    // Approvals folder (critical for SOX reviewers).
    await dispatchMultiChannel(recipients, {
      templateFn: documentReopenedTemplate,
      templateData: {
        module: opts.module,
        docType: opts.docType,
        docRef: opts.docRef,
        reopenedBy: opts.reopenedBy,
        entityName,
        reason: opts.reason,
      },
      emailType: 'ERP_DOCUMENT_REOPENED',
      category: 'document_reopened',
      entityId: opts.entityId,
      inAppCategory: 'document_posted',
      inAppFolder: 'APPROVALS',
      inAppPriority: 'high',
      inAppRequiresAction: false,
      inAppActionType: 'acknowledge',
      inAppActionPayload: { module: opts.module, doc_type: opts.docType, doc_ref: opts.docRef, reversal: true },
    });
  } catch (err) {
    console.error('notifyDocumentReopened failed:', err.message);
  }
};

/**
 * Notify approvers when a document needs approval.
 * @param {Object} opts
 * @param {ObjectId} opts.entityId
 * @param {string} opts.module
 * @param {string} opts.docType
 * @param {string} opts.docRef
 * @param {string} opts.requestedBy - name of requester
 * @param {number} [opts.amount]
 * @param {string} [opts.description]
 * @param {Array<{_id, email, name}>} [opts.approvers] - explicit approver list (if authority matrix resolves them)
 */
const notifyApprovalRequest = async (opts) => {
  try {
    const entityName = await resolveEntityName(opts.entityId);
    // Use explicit approvers if provided, otherwise fall back to management
    const recipients = opts.approvers?.length
      ? opts.approvers
      : await findManagementRecipients(opts.entityId);
    if (!recipients.length) return;

    // Phase G9.B — approvers see a red-dot [Approve]/[Reject] row in their
    // inbox. Thread-id = ApprovalRequest._id so approve + decision + reopen
    // events fold into the same conversation.
    await dispatchMultiChannel(recipients, {
      templateFn: approvalRequestTemplate,
      templateData: {
        module: opts.module,
        docType: opts.docType,
        docRef: opts.docRef,
        requestedBy: opts.requestedBy,
        entityName,
        amount: opts.amount,
        description: opts.description,
      },
      emailType: 'ERP_APPROVAL_REQUEST',
      category: 'approval_request',
      entityId: opts.entityId,
      inAppCategory: 'approval_request',
      inAppFolder: 'APPROVALS',
      inAppPriority: 'high',
      inAppThreadId: opts.approvalRequestId || null,
      inAppRequiresAction: true,
      inAppActionType: 'approve',
      inAppActionPayload: {
        approval_request_id: opts.approvalRequestId ? String(opts.approvalRequestId) : null,
        module: opts.module,
        doc_type: opts.docType,
        doc_ref: opts.docRef,
        amount: opts.amount,
        deep_link: '/erp/approvals',
      },
    });
  } catch (err) {
    console.error('notifyApprovalRequest failed:', err.message);
  }
};

/**
 * Notify the document owner when their approval request is decided.
 */
const notifyApprovalDecision = async (opts) => {
  try {
    const entityName = await resolveEntityName(opts.entityId);
    const owner = await findDocumentOwner(opts.ownerId);
    if (!owner?.email) return;

    // Phase G9.B — submitter sees their verdict inside the same thread as
    // the original approval request (thread_id = ApprovalRequest._id).
    await dispatchMultiChannel([owner], {
      templateFn: approvalDecisionTemplate,
      templateData: {
        module: opts.module,
        docType: opts.docType,
        docRef: opts.docRef,
        decision: opts.decision,
        decidedBy: opts.decidedBy,
        entityName,
        reason: opts.reason,
      },
      emailType: 'ERP_APPROVAL_DECISION',
      category: 'approval_decision',
      entityId: opts.entityId,
      inAppCategory: 'approval_decision',
      inAppFolder: 'APPROVALS',
      inAppPriority: opts.decision === 'REJECTED' ? 'high' : 'normal',
      inAppThreadId: opts.approvalRequestId || null,
      inAppRequiresAction: false,
      inAppActionType: 'acknowledge',
      inAppActionPayload: {
        approval_request_id: opts.approvalRequestId ? String(opts.approvalRequestId) : null,
        module: opts.module,
        doc_type: opts.docType,
        doc_ref: opts.docRef,
        decision: opts.decision,
        reason: opts.reason || null,
      },
    });
  } catch (err) {
    console.error('notifyApprovalDecision failed:', err.message);
  }
};

/**
 * Notify management when payroll is posted.
 */
const notifyPayrollPosted = async (opts) => {
  try {
    const entityName = await resolveEntityName(opts.entityId);
    const recipients = await findManagementRecipients(opts.entityId);
    if (!recipients.length) return;

    // Phase G9.B — also in-app in the Approvals folder so payroll postings
    // surface next to expense approvals (same reviewer audience).
    await dispatchMultiChannel(recipients, {
      templateFn: payrollPostedTemplate,
      templateData: {
        period: opts.period,
        cycle: opts.cycle,
        postedCount: opts.postedCount,
        totalNetPay: opts.totalNetPay,
        postedBy: opts.postedBy,
        entityName,
      },
      emailType: 'ERP_PAYROLL_POSTED',
      category: 'document_posted',
      entityId: opts.entityId,
      inAppCategory: 'document_posted',
      inAppFolder: 'APPROVALS',
      inAppPriority: 'normal',
      inAppRequiresAction: false,
      inAppActionType: 'acknowledge',
      inAppActionPayload: { module: 'Payroll', period: opts.period, cycle: opts.cycle, deep_link: '/erp/payroll' },
    });
  } catch (err) {
    console.error('notifyPayrollPosted failed:', err.message);
  }
};

// ─── Phase SG-Q2 Week 3 — Sales Goal lifecycle + tier-reached + variance ───

/**
 * Filter a recipient list by NotificationPreference opt-in for a given category.
 * Falls open (does NOT filter) on read errors — better to over-notify than to
 * silently drop alerts when the preferences collection is unavailable.
 *
 * Categories used:
 *   - 'compensation' — plan lifecycle + tier milestones (BDM-impacting)
 *   - 'kpiVariance'  — KPI deviation alerts (BDM + manager)
 *
 * NotificationPreference schema is permissive (Mixed metadata), so we look at
 * `compensationAlerts` / `kpiVarianceAlerts` boolean flags first, then fall
 * back to the broader `emailNotifications` master switch.
 */
const filterByPreference = async (recipients, category) => {
  if (!recipients || recipients.length === 0) return [];
  let prefs = [];
  try {
    const NotificationPreference = require('../../models/NotificationPreference');
    prefs = await NotificationPreference.find({
      user: { $in: recipients.map(r => r._id) },
    }).lean();
  } catch (err) {
    console.warn('[notify] NotificationPreference unavailable — sending to all recipients:', err.message);
    return recipients;
  }
  const prefsByUser = new Map(prefs.map(p => [String(p.user), p]));
  return recipients.filter(r => {
    const pref = prefsByUser.get(String(r._id));
    if (!pref) return true; // no pref doc → opt-in by default
    if (pref.emailNotifications === false) return false;
    // Category-specific opt-in (when admin defined it). Missing = use master switch.
    if (category === 'compensation' && pref.compensationAlerts === false) return false;
    if (category === 'kpiVariance' && pref.kpiVarianceAlerts === false) return false;
    return true;
  });
};

// ─── SG-Q2 W3 follow-ups — Multi-channel + Multi-hop escalation ─────────
//
// Three follow-ups closed here:
//   (1a) In-app channel — persist a MessageInbox row per recipient so the
//        notification surfaces inside the ERP UI, not only by email.
//   (1b) SMS channel — reuse the Semaphore dispatcher from
//        backend/agents/notificationService.js when SEMAPHORE_API_KEY is set
//        and the recipient has a phone on their User profile.
//   (2)  Multi-hop reports_to chain — walk PeopleMaster.reports_to up to N
//        hops instead of a single hop, with cycle detection. Depth is
//        lookup-driven per entity via NOTIFICATION_ESCALATION lookup.
//
// All three knobs are subscription-ready via Lookup categories (Rule #3):
//   - NOTIFICATION_ESCALATION  — per-entity escalation behavior
//   - NOTIFICATION_CHANNELS    — per-entity channel kill-switches
// Both lazy-seed on first read so a fresh subsidiary inherits sane defaults.

const ESCALATION_DEFAULTS = {
  REPORTS_TO_MAX_HOPS: 3,
};

const CHANNEL_DEFAULTS = {
  // Master kill-switches. Users still opt in per-category via their
  // NotificationPreference (emailNotifications / inAppAlerts / smsNotifications).
  EMAIL: true,
  IN_APP: true,
  SMS: false, // opt-in — requires SEMAPHORE_API_KEY env + user.phone field
};

/**
 * Lazy-seed + read NOTIFICATION_ESCALATION config. Returns `{ reportsToMaxHops }`.
 * Defaults: 3 hops. Subscribers override by editing the lookup row in Control
 * Center — no code deploy needed.
 */
async function getEscalationConfig(entityId) {
  if (!entityId) return { reportsToMaxHops: ESCALATION_DEFAULTS.REPORTS_TO_MAX_HOPS };
  try {
    let rows = await Lookup.find({
      entity_id: entityId,
      category: 'NOTIFICATION_ESCALATION',
      is_active: true,
    }).lean();

    if (rows.length === 0) {
      try {
        await Lookup.updateOne(
          { entity_id: entityId, category: 'NOTIFICATION_ESCALATION', code: 'REPORTS_TO_MAX_HOPS' },
          {
            $setOnInsert: {
              label: 'Max hops up the reports_to chain when escalating notifications',
              sort_order: 0,
              is_active: true,
              metadata: { value: ESCALATION_DEFAULTS.REPORTS_TO_MAX_HOPS },
            },
          },
          { upsert: true }
        );
        rows = await Lookup.find({
          entity_id: entityId,
          category: 'NOTIFICATION_ESCALATION',
          is_active: true,
        }).lean();
      } catch (err) {
        console.warn('[notify] NOTIFICATION_ESCALATION lazy-seed failed:', err.message);
        return { reportsToMaxHops: ESCALATION_DEFAULTS.REPORTS_TO_MAX_HOPS };
      }
    }

    const byCode = new Map(rows.map(r => [String(r.code).toUpperCase(), r]));
    const maxHopsRow = byCode.get('REPORTS_TO_MAX_HOPS');
    const maxHops = Number(maxHopsRow?.metadata?.value);
    return {
      reportsToMaxHops: Number.isFinite(maxHops) && maxHops > 0
        ? Math.min(maxHops, 10) // hard safety cap
        : ESCALATION_DEFAULTS.REPORTS_TO_MAX_HOPS,
    };
  } catch (err) {
    console.warn('[notify] getEscalationConfig failed:', err.message);
    return { reportsToMaxHops: ESCALATION_DEFAULTS.REPORTS_TO_MAX_HOPS };
  }
}

/**
 * Lazy-seed + read NOTIFICATION_CHANNELS config. Returns `{ email, in_app, sms }`
 * booleans — org-wide kill-switches that sit between user preference and the
 * dispatcher. Admin can disable a channel for the whole entity without
 * touching every user preference document.
 */
async function getChannelConfig(entityId) {
  const fallback = {
    email: CHANNEL_DEFAULTS.EMAIL,
    in_app: CHANNEL_DEFAULTS.IN_APP,
    sms: CHANNEL_DEFAULTS.SMS,
  };
  if (!entityId) return fallback;
  try {
    let rows = await Lookup.find({
      entity_id: entityId,
      category: 'NOTIFICATION_CHANNELS',
      is_active: true,
    }).lean();

    if (rows.length === 0) {
      try {
        const ops = Object.entries(CHANNEL_DEFAULTS).map(([code, enabled], idx) => ({
          updateOne: {
            filter: { entity_id: entityId, category: 'NOTIFICATION_CHANNELS', code },
            update: {
              $setOnInsert: {
                label: `${code} notification channel`,
                sort_order: idx,
                is_active: true,
                metadata: { enabled },
              },
            },
            upsert: true,
          },
        }));
        await Lookup.bulkWrite(ops, { ordered: false });
        rows = await Lookup.find({
          entity_id: entityId,
          category: 'NOTIFICATION_CHANNELS',
          is_active: true,
        }).lean();
      } catch (err) {
        console.warn('[notify] NOTIFICATION_CHANNELS lazy-seed failed:', err.message);
        return fallback;
      }
    }

    const byCode = new Map(rows.map(r => [String(r.code).toUpperCase(), r]));
    return {
      email: byCode.get('EMAIL')?.metadata?.enabled !== false,
      in_app: byCode.get('IN_APP')?.metadata?.enabled !== false,
      sms: byCode.get('SMS')?.metadata?.enabled === true, // SMS is opt-in
    };
  } catch (err) {
    console.warn('[notify] getChannelConfig failed:', err.message);
    return fallback;
  }
}

/**
 * Walk PeopleMaster.reports_to up to `maxDepth` hops. Returns the User docs
 * (_id, email, name, role, phone) of each manager in the chain, skipping
 * duplicates (cycle-safe) and missing-user links.
 *
 * Deliberately not circular-aware across entities — reports_to spans intra-
 * entity hierarchy only. Cross-entity escalation is out of scope (use
 * presidents-always-notified pattern already in the callers).
 */
async function resolveReportsToChain(userId, { maxDepth = ESCALATION_DEFAULTS.REPORTS_TO_MAX_HOPS } = {}) {
  const chain = [];
  if (!userId || maxDepth <= 0) return chain;

  try {
    const PeopleMaster = require('../models/PeopleMaster');
    const visited = new Set(); // PeopleMaster _id strings
    let cursor = await PeopleMaster.findOne({ user_id: userId, is_active: true })
      .select('_id reports_to').lean();
    if (!cursor) return chain;
    visited.add(String(cursor._id));

    let hops = 0;
    while (cursor?.reports_to && hops < maxDepth) {
      const nextId = String(cursor.reports_to);
      if (visited.has(nextId)) break; // cycle guard
      visited.add(nextId);

      const manager = await PeopleMaster.findById(cursor.reports_to)
        .select('_id user_id reports_to is_active').lean();
      if (!manager) break;

      if (manager.user_id && manager.is_active !== false) {
        const mgrUser = await User.findById(manager.user_id)
          .select('_id email name role phone').lean();
        if (mgrUser && mgrUser.email) chain.push(mgrUser);
      }
      cursor = manager;
      hops += 1;
    }
  } catch (err) {
    console.warn('[notify] resolveReportsToChain failed:', err.message);
  }
  return chain;
}

/**
 * Build the BDM-tier audience: BDM + reports_to chain (N hops, lookup-driven)
 * + all presidents. De-duplicated by _id. Used by notifyTierReached +
 * notifyKpiVariance.
 */
async function buildBdmEscalationAudience({ entityId, bdmId }) {
  const { reportsToMaxHops } = await getEscalationConfig(entityId);

  const recipients = [];
  const seen = new Set();
  const addUnique = (u) => {
    if (!u || !u._id || !u.email) return;
    const key = String(u._id);
    if (seen.has(key)) return;
    seen.add(key);
    recipients.push(u);
  };

  // BDM themselves
  try {
    const bdmUser = await User.findById(bdmId).select('_id email name role phone').lean();
    addUnique(bdmUser);
  } catch { /* skip */ }

  // Manager chain (N hops)
  const chain = await resolveReportsToChain(bdmId, { maxDepth: reportsToMaxHops });
  for (const mgr of chain) addUnique(mgr);

  // Presidents (always notified for compensation/variance — they own the program)
  try {
    const presidents = await User.find({
      role: { $in: ROLE_SETS.PRESIDENT_ROLES },
      isActive: true,
      email: { $exists: true, $ne: '' },
    }).select('_id email name role phone').lean();
    for (const p of presidents) addUnique(p);
  } catch (err) {
    console.warn('[notify] president resolve failed:', err.message);
  }

  return recipients;
}

/**
 * Philippine-format phone sanity check — accept +63 or 09 prefix with 10+
 * digits, allowing the punctuation set used by the User.js schema regex.
 * Returns the digits-only form (Semaphore accepts `09171234567` or
 * `639171234567`). Returns null if unparseable.
 */
function normalizePhoneForSms(phone) {
  if (!phone || typeof phone !== 'string') return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 10) return null;
  return digits;
}

/**
 * Persist an in-app MessageInbox row for a single recipient.
 * Non-blocking: catches and logs its own errors.
 *
 * Phase G9.A: extended with entity_id / folder / thread / action affordance
 * fields. Folder is derived from category when not explicitly provided. All
 * new params are optional to keep legacy callers working.
 */
async function persistInApp(recipient, {
  title,
  body,
  category,
  priority,
  entityId = null,
  folder = null,
  threadId = null,
  parentMessageId = null,
  requiresAction = false,
  actionType = null,
  actionPayload = null,
  senderName = 'VIP ERP',
  senderRole = 'system',
  senderUserId = null,
}) {
  try {
    if (!recipient?._id) return { ok: false, reason: 'no_recipient' };
    // Derive folder from category if caller didn't specify. Keeps callers simple.
    let resolvedFolder = folder;
    if (!resolvedFolder) {
      try {
        const { folderForCategory } = require('../utils/inboxLookups');
        resolvedFolder = folderForCategory(category);
      } catch {
        resolvedFolder = 'INBOX';
      }
    }
    await MessageInbox.create({
      title: title || 'VIP ERP Notification',
      body: body || title || 'See the ERP for details.',
      category: category || 'system',
      priority: priority || 'normal',
      recipientRole: recipient.role || 'admin',
      recipientUserId: recipient._id,
      senderName,
      senderRole,
      senderUserId,
      entity_id: entityId || recipient.entity_id || null,
      folder: resolvedFolder,
      thread_id: threadId,
      parent_message_id: parentMessageId,
      requires_action: !!requiresAction,
      action_type: actionType,
      action_payload: actionPayload,
    });
    return { ok: true };
  } catch (err) {
    console.warn(`[notify] in-app create failed for ${recipient.email}:`, err.message);
    return { ok: false, error: err.message };
  }
}

/**
 * Dispatch an SMS via Semaphore if SEMAPHORE_API_KEY is set. Mirrors the
 * dispatcher in backend/agents/notificationService.js so the two pipelines
 * share observable behavior. Returns quickly on config-missing (never throws).
 */
async function dispatchSms(recipient, { subject, text, body }) {
  const phone = normalizePhoneForSms(recipient?.phone);
  if (!phone) return { ok: false, reason: 'no_phone' };
  const apiKey = process.env.SEMAPHORE_API_KEY;
  if (!apiKey) return { ok: false, reason: 'no_api_key' };

  try {
    const https = require('https');
    const url = require('url');
    const message = `${subject ? subject + ': ' : ''}${text || body || ''}`.substring(0, 160);
    const params = new URLSearchParams({
      apikey: apiKey,
      number: phone,
      message,
      sendername: process.env.SEMAPHORE_SENDER || 'VIP_ERP',
    });

    return await new Promise((resolve) => {
      const parsed = url.parse('https://api.semaphore.co/api/v4/messages');
      const req = https.request({
        hostname: parsed.hostname,
        path: parsed.path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(params.toString()),
        },
      }, (res) => {
        // Drain response; Semaphore returns 200 on accept, 4xx on error.
        res.on('data', () => {});
        res.on('end', () => resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode }));
      });
      req.on('error', (err) => resolve({ ok: false, error: err.message }));
      req.write(params.toString());
      req.end();
    });
  } catch (err) {
    console.warn('[notify] SMS dispatch failed:', err.message);
    return { ok: false, error: err.message };
  }
}

/**
 * Decide which channels a user will receive a given category on. Applies
 * both the per-entity channel config (NOTIFICATION_CHANNELS lookup) and the
 * user-level NotificationPreference in one place. Category is the high-level
 * notion ('compensation', 'kpiVariance', etc) and is already filtered for
 * email by filterByPreference(). Here we compute per-channel decisions.
 */
function pickChannelsForRecipient(pref, category, channelConfig) {
  const hasPref = !!pref;
  const masterEmailOff = hasPref && pref.emailNotifications === false;
  const masterInAppOff = hasPref && pref.inAppAlerts === false;
  const masterSmsOff = hasPref && pref.smsNotifications === false;
  const catCompOff = hasPref && pref.compensationAlerts === false;
  const catVarOff = hasPref && pref.kpiVarianceAlerts === false;

  const applyCategoryGate = (base) => {
    if (category === 'compensation' && catCompOff) return false;
    if (category === 'kpiVariance' && catVarOff) return false;
    return base;
  };

  return {
    email: !!channelConfig.email && applyCategoryGate(!masterEmailOff),
    in_app: !!channelConfig.in_app && applyCategoryGate(!masterInAppOff),
    // SMS is opt-in both per-entity AND per-user: require pref to be explicitly
    // true (default pref is smsNotifications=false), otherwise suppress.
    sms: !!channelConfig.sms && applyCategoryGate(hasPref ? pref.smsNotifications === true : false),
  };
}

/**
 * Unified dispatcher for the Phase SG-Q2 W3 notification paths.
 *
 * For each recipient:
 *   - Renders the email template (subject/html/text) once.
 *   - Sends the email via Resend (logs to EmailLog).
 *   - Persists a MessageInbox row (so the ERP inbox UI shows the alert).
 *   - Sends an SMS via Semaphore if enabled + user has phone.
 * Per-channel decisions come from pickChannelsForRecipient() (entity config +
 * user preference). All sends are fault-tolerant — a failure on one channel
 * never blocks the other channels.
 */
async function dispatchMultiChannel(recipients, {
  templateFn,
  templateData,
  emailType,
  category,
  entityId,
  inAppCategory = 'system',
  inAppPriority = 'normal',
  // Phase G9.B — action affordance + threading forwarded to persistInApp
  inAppFolder = null,
  inAppThreadId = null,
  inAppParentMessageId = null,
  inAppRequiresAction = false,
  inAppActionType = null,
  inAppActionPayload = null,
  inAppSender = null, // { name, role, userId }
}) {
  if (!recipients || recipients.length === 0) return;

  const channelConfig = await getChannelConfig(entityId);

  // Preload user preferences once per batch
  let prefsByUser = new Map();
  try {
    const NotificationPreference = require('../../models/NotificationPreference');
    const prefs = await NotificationPreference.find({
      user: { $in: recipients.map(r => r._id) },
    }).lean();
    prefsByUser = new Map(prefs.map(p => [String(p.user), p]));
  } catch (err) {
    console.warn('[notify] preferences batch load failed — using defaults:', err.message);
  }

  for (const recipient of recipients) {
    const pref = prefsByUser.get(String(recipient._id));
    const decisions = pickChannelsForRecipient(pref, category, channelConfig);

    // Render once per recipient to personalize the greeting
    const data = { ...templateData, recipientName: recipient.name || 'User' };
    let subject, html, text;
    try {
      ({ subject, html, text } = templateFn(data));
    } catch (err) {
      console.error(`[notify] template render failed for ${emailType}:`, err.message);
      continue;
    }

    // Email
    if (decisions.email && recipient.email) {
      try {
        const { messageId } = await sendEmail({ to: recipient.email, subject, html, text });
        await logEmail(recipient.email, recipient._id, emailType, subject, 'sent', messageId);
      } catch (err) {
        console.error(`[notify] email failed for ${recipient.email}:`, err.message);
        await logEmail(recipient.email, recipient._id, emailType, subject || emailType, 'failed', null, err.message);
      }
    }

    // In-app (MessageInbox)
    if (decisions.in_app) {
      await persistInApp(recipient, {
        title: subject,
        body: text || (html ? html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 2000) : subject),
        category: inAppCategory,
        priority: inAppPriority,
        entityId,
        folder: inAppFolder,
        threadId: inAppThreadId,
        parentMessageId: inAppParentMessageId,
        requiresAction: inAppRequiresAction,
        actionType: inAppActionType,
        actionPayload: inAppActionPayload,
        senderName: inAppSender?.name || 'VIP ERP',
        senderRole: inAppSender?.role || 'system',
        senderUserId: inAppSender?.userId || null,
      });
    }

    // SMS
    if (decisions.sms) {
      await dispatchSms(recipient, { subject, text, body: html });
    }
  }
}

/**
 * Notify when a Sales Goal Plan is activated, closed, or reopened.
 *
 * Audience:
 *   - Management (configured via NOTIFICATION_RECIPIENT_ROLES Settings)
 *   - All BDMs assigned to the plan (so they see when their target activates
 *     or a closed plan stops accruing)
 *
 * Non-blocking: never throws; never blocks the controller flow.
 */
const notifySalesGoalPlanLifecycle = async ({ entityId, planId, planRef, planName, fiscalYear, event, triggeredBy, enrollmentCount }) => {
  try {
    const entityName = await resolveEntityName(entityId);
    const management = await findManagementRecipients(entityId);

    // Pull BDMs assigned to the plan — they're the ones the activation/closure
    // most directly affects. Use SalesGoalTarget → bdm_id (User._id) → User.
    // `phone` is selected so SMS dispatch works when enabled per-entity +
    // per-user (Phase SG-Q2 W3 follow-up).
    let bdms = [];
    try {
      const SalesGoalTarget = require('../models/SalesGoalTarget');
      const targets = await SalesGoalTarget.find({
        plan_id: planId,
        target_type: 'BDM',
        bdm_id: { $exists: true, $ne: null },
      }).select('bdm_id').lean();
      const bdmIds = [...new Set(targets.map(t => String(t.bdm_id)))];
      if (bdmIds.length > 0) {
        bdms = await User.find({
          _id: { $in: bdmIds },
          isActive: true,
          email: { $exists: true, $ne: '' },
        }).select('_id email name role phone').lean();
      }
    } catch (err) {
      console.warn('[notifySalesGoalPlanLifecycle] failed to resolve BDM list:', err.message);
    }

    // De-dupe management ∪ bdms by _id
    const seen = new Set();
    const recipients = [...management, ...bdms].filter(r => {
      const key = String(r._id);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (!recipients.length) return;

    await dispatchMultiChannel(recipients, {
      templateFn: salesGoalPlanLifecycleTemplate,
      templateData: {
        event,
        planRef,
        planName,
        fiscalYear,
        entityName,
        triggeredBy,
        enrollmentCount,
      },
      emailType: `ERP_SALES_GOAL_${event}`,
      category: 'compensation',
      entityId,
      inAppCategory: 'compensation',
      inAppPriority: event === 'ACTIVATED' ? 'important' : 'normal',
    });
  } catch (err) {
    console.error('notifySalesGoalPlanLifecycle failed:', err.message);
  }
};

/**
 * Notify when a BDM reaches an incentive tier (called from accrueIncentive).
 *
 * Audience:
 *   - The BDM directly (motivating)
 *   - The BDM's reports_to chain via PeopleMaster (manager visibility)
 *   - President (always — they own the incentive program)
 *
 * Suppresses noise: only fires once per (plan, bdm, period, tier) combination
 * — guaranteed by accrueIncentive checking `existing` before calling.
 */
const notifyTierReached = async ({ entityId, bdmId, bdmLabel, planRef, fiscalYear, period, periodType, tierCode, tierLabel, tierBudget, attainmentPct }) => {
  try {
    const entityName = await resolveEntityName(entityId);

    // BDM + N-hop reports_to chain + presidents (Phase SG-Q2 W3 follow-up #2:
    // multi-hop escalation via NOTIFICATION_ESCALATION lookup, cycle-safe).
    const recipients = await buildBdmEscalationAudience({ entityId, bdmId });
    if (!recipients.length) return;

    await dispatchMultiChannel(recipients, {
      templateFn: tierReachedTemplate,
      templateData: {
        bdmName: bdmLabel || 'BDM',
        tierLabel: tierLabel || tierCode,
        tierBudget,
        attainmentPct,
        period,
        fiscalYear,
        planRef,
        entityName,
      },
      emailType: 'ERP_TIER_REACHED',
      category: 'compensation',
      entityId,
      inAppCategory: 'compensation',
      inAppFolder: 'AI_AGENT_REPORTS',
      inAppPriority: 'important', // tier milestones are meaningful BDM events
      inAppRequiresAction: false,
      inAppActionType: 'acknowledge',
      inAppActionPayload: { bdm_id: bdmId ? String(bdmId) : null, tier: tierCode, plan_ref: planRef, deep_link: '/erp/my-compensation' },
    });
  } catch (err) {
    console.error('notifyTierReached failed:', err.message);
  }
};

/**
 * Notify when KPI variance crosses a configured threshold (called from
 * kpiVarianceAgent on each affected BDM).
 *
 * Audience: BDM + reports_to chain + president.
 * Filtered by NotificationPreference.kpiVarianceAlerts (opt-in).
 */
const notifyKpiVariance = async ({ entityId, bdmId, bdmLabel, fiscalYear, period, alerts }) => {
  try {
    if (!alerts || alerts.length === 0) return;
    const entityName = await resolveEntityName(entityId);

    // BDM + N-hop reports_to chain + presidents (Phase SG-Q2 W3 follow-up #2).
    const recipients = await buildBdmEscalationAudience({ entityId, bdmId });
    if (!recipients.length) return;

    // Promote priority when at least one alert is critical.
    const hasCritical = alerts.some(a => String(a.severity).toLowerCase() === 'critical');

    await dispatchMultiChannel(recipients, {
      templateFn: kpiVarianceAlertTemplate,
      templateData: {
        bdmName: bdmLabel || 'BDM',
        fiscalYear,
        period,
        entityName,
        alerts,
      },
      emailType: 'ERP_KPI_VARIANCE',
      category: 'kpiVariance',
      entityId,
      inAppCategory: 'compliance_alert',
      inAppFolder: 'AI_AGENT_REPORTS',
      inAppPriority: hasCritical ? 'high' : 'important',
      inAppRequiresAction: true,
      inAppActionType: 'resolve',
      inAppActionPayload: {
        bdm_id: bdmId ? String(bdmId) : null,
        fiscal_year: fiscalYear,
        period,
        variance_alert_ids: alerts.map(a => a.variance_alert_id).filter(Boolean).map(String),
        deep_link: '/erp/variance-alerts',
      },
    });
  } catch (err) {
    console.error('notifyKpiVariance failed:', err.message);
  }
};

/**
 * Compensation Statement Ready — Phase SG-4 #23 ext.
 *
 * Targets a single BDM (their email + in-app inbox + SMS opt-in). Reads
 * COMP_STATEMENT_TEMPLATE lookup overrides (HEADER_TITLE / DISCLAIMER /
 * EMAIL_ON_PERIOD_CLOSE) so admins can customize brand chrome without code.
 *
 * The EMAIL_ON_PERIOD_CLOSE row's `metadata.enabled` flag (defaults to true
 * when missing) gates whether the email actually sends — admins can mute
 * the mass-send while still allowing the BDM to view the statement on demand.
 */
const notifyCompensationStatement = async ({
  entityId,
  bdmId,
  bdmName,
  fiscalYear,
  period,
  totals,
}) => {
  try {
    if (!entityId || !bdmId) return;
    const entityName = await resolveEntityName(entityId);

    // Template overrides — entity-scoped lookup, optional.
    let templateOverrides = {};
    let emailEnabled = true;
    try {
      const tplRows = await Lookup.find({
        entity_id: entityId,
        category: 'COMP_STATEMENT_TEMPLATE',
        is_active: true,
      }).lean();
      for (const r of tplRows) {
        const value = (r.metadata && r.metadata.value) || r.label || '';
        templateOverrides[r.code] = value;
        if (r.code === 'EMAIL_ON_PERIOD_CLOSE') {
          // Strict opt-out: only when explicitly disabled (string 'false' or
          // metadata.enabled === false) do we skip the email.
          if (r.metadata?.enabled === false) emailEnabled = false;
          if (typeof value === 'string' && value.toLowerCase() === 'false') emailEnabled = false;
        }
      }
    } catch (lookupErr) {
      console.warn('[notifyCompensationStatement] template lookup unavailable:', lookupErr.message);
    }
    if (!emailEnabled) return;

    // Recipient is the BDM only (per-BDM statement). dispatchMultiChannel
    // handles email + in-app + SMS-opt-in via NotificationPreference.
    // BDMs without an associated User record are skipped.
    const userRows = await User.find({ _id: bdmId, isActive: true })
      .select('_id name email phone')
      .lean();
    if (!userRows.length) return;

    const appBaseUrl = process.env.FRONTEND_URL || '';

    await dispatchMultiChannel(userRows, {
      templateFn: compensationStatementReadyTemplate,
      templateData: {
        bdmName: bdmName || 'BDM',
        fiscalYear,
        period,
        entityName,
        totals,
        appBaseUrl,
        templateOverrides,
      },
      emailType: 'ERP_COMP_STATEMENT_READY',
      category: 'compensationAlerts',
      entityId,
      inAppCategory: 'compensation',
      inAppPriority: 'normal',
    });
  } catch (err) {
    console.error('notifyCompensationStatement failed:', err.message);
  }
};

// ─── Phase G9.B.2 — Task lifecycle inbox notifications ─────────────────
// Task events (assigned / reassigned / completed / commented / overdue) are
// pushed to the recipient's `TASKS` folder as MessageInbox rows via the
// same dispatchMultiChannel pipe (email + in-app + SMS), honouring
// NOTIFICATION_CHANNELS + NotificationPreference. One recipient per call.
// Minimal body, no templateFn — the inbox row IS the message.
const notifyTaskEvent = async ({
  entityId,
  event,                    // 'assigned' | 'reassigned' | 'completed' | 'commented' | 'overdue'
  recipientUserId,          // who gets the row (assignee, or creator for 'completed')
  actorName,                // who triggered it (e.g., task creator or the person who marked DONE)
  taskId,
  taskTitle,
  dueDate,
  priority,
  comment,                  // optional — for 'commented'
}) => {
  try {
    if (!recipientUserId) return;
    const recipient = await User.findById(recipientUserId)
      .select('_id email name role phone entity_id').lean();
    if (!recipient) return;

    const EVENT_CONFIG = {
      assigned:   { subject: 'New task assigned',     category: 'task_assigned',   priority: 'normal', action: 'open_link', requiresAction: true  },
      reassigned: { subject: 'Task reassigned to you', category: 'task_reassigned', priority: 'normal', action: 'open_link', requiresAction: true  },
      completed:  { subject: 'Task completed',         category: 'task_completed',  priority: 'normal', action: 'acknowledge', requiresAction: false },
      commented:  { subject: 'New comment on your task', category: 'task_comment', priority: 'normal', action: 'reply',    requiresAction: false },
      overdue:    { subject: 'Task overdue',           category: 'task_overdue',    priority: 'high',   action: 'open_link', requiresAction: true  },
    };
    const cfg = EVENT_CONFIG[event];
    if (!cfg) return;

    const dueLine = dueDate ? `  Due: ${new Date(dueDate).toLocaleDateString('en-PH')}` : '';
    const prioLine = priority ? `  Priority: ${priority}` : '';
    const subject = `${cfg.subject}: ${taskTitle || 'Untitled task'}`;
    const text = [
      `${actorName || 'Someone'} ${event} a task for you:`,
      `  "${taskTitle || 'Untitled task'}"`,
      dueLine,
      prioLine,
      comment ? `  Comment: ${comment}` : '',
    ].filter(Boolean).join('\n');
    const html = `<p>${actorName || 'Someone'} ${event} a task for you:</p>
      <p><strong>${taskTitle || 'Untitled task'}</strong></p>
      ${dueDate ? `<p>Due: ${new Date(dueDate).toLocaleDateString('en-PH')}</p>` : ''}
      ${priority ? `<p>Priority: ${priority}</p>` : ''}
      ${comment ? `<p><em>${String(comment).substring(0, 400)}</em></p>` : ''}
      <p><a href="${process.env.FRONTEND_URL || ''}/erp/tasks?id=${taskId}">Open task</a></p>`;

    // Template fn — inlined because task body is short and doesn't need an
    // HTML email template file.
    const templateFn = () => ({ subject, html, text });

    await dispatchMultiChannel([recipient], {
      templateFn,
      templateData: {},
      emailType: 'ERP_TASK_EVENT',
      category: 'task',
      entityId: entityId || recipient.entity_id,
      inAppCategory: cfg.category,
      inAppFolder: 'TASKS',
      inAppPriority: cfg.priority,
      inAppThreadId: taskId || null,
      inAppRequiresAction: cfg.requiresAction,
      inAppActionType: cfg.action,
      inAppActionPayload: {
        task_id: taskId ? String(taskId) : null,
        event,
        deep_link: taskId ? `/erp/tasks?id=${taskId}` : '/erp/tasks',
      },
    });
  } catch (err) {
    console.error(`notifyTaskEvent[${event}] failed:`, err.message);
  }
};

module.exports = {
  notifyDocumentPosted,
  notifyDocumentReopened,
  notifyApprovalRequest,
  notifyApprovalDecision,
  notifyPayrollPosted,
  // Phase SG-Q2 W3
  notifySalesGoalPlanLifecycle,
  notifyTierReached,
  notifyKpiVariance,
  // Phase SG-4 #23 ext
  notifyCompensationStatement,
  // Phase G9.B.2 — task inbox events
  notifyTaskEvent,
  // Exported for testing / advanced use
  findManagementRecipients,
  findNotificationRecipients,
  resolveEntityName,
  // SG-Q2 W3 follow-ups (Items 1a/1b/2) — exposed for tests and for reuse by
  // other future notification paths (document-posted etc. may migrate here).
  getEscalationConfig,
  getChannelConfig,
  resolveReportsToChain,
  buildBdmEscalationAudience,
  dispatchMultiChannel,
};
