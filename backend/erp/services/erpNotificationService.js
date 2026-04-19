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
const EmailLog = require('../../models/EmailLog');
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

    return await User.find(query).select('_id email name role').lean();
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

    await sendToRecipients(recipients, documentPostedTemplate, {
      module: opts.module,
      docType: opts.docType,
      docRef: opts.docRef,
      postedBy: opts.postedBy,
      entityName,
      amount: opts.amount,
      period: opts.period,
    }, 'ERP_DOCUMENT_POSTED');
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

    await sendToRecipients(recipients, documentReopenedTemplate, {
      module: opts.module,
      docType: opts.docType,
      docRef: opts.docRef,
      reopenedBy: opts.reopenedBy,
      entityName,
      reason: opts.reason,
    }, 'ERP_DOCUMENT_REOPENED');
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

    await sendToRecipients(recipients, approvalRequestTemplate, {
      module: opts.module,
      docType: opts.docType,
      docRef: opts.docRef,
      requestedBy: opts.requestedBy,
      entityName,
      amount: opts.amount,
      description: opts.description,
    }, 'ERP_APPROVAL_REQUEST');
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

    await sendToRecipients([owner], approvalDecisionTemplate, {
      module: opts.module,
      docType: opts.docType,
      docRef: opts.docRef,
      decision: opts.decision, // 'APPROVED' or 'REJECTED'
      decidedBy: opts.decidedBy,
      entityName,
      reason: opts.reason,
    }, 'ERP_APPROVAL_DECISION');
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

    await sendToRecipients(recipients, payrollPostedTemplate, {
      period: opts.period,
      cycle: opts.cycle,
      postedCount: opts.postedCount,
      totalNetPay: opts.totalNetPay,
      postedBy: opts.postedBy,
      entityName,
    }, 'ERP_PAYROLL_POSTED');
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
        }).select('_id email name role').lean();
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

    const filtered = await filterByPreference(recipients, 'compensation');
    if (!filtered.length) return;

    await sendToRecipients(filtered, salesGoalPlanLifecycleTemplate, {
      event,
      planRef,
      planName,
      fiscalYear,
      entityName,
      triggeredBy,
      enrollmentCount,
    }, `ERP_SALES_GOAL_${event}`);
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

    // Recipient set
    const recipients = [];
    const seen = new Set();
    const addUnique = (u) => {
      if (!u || !u._id || !u.email) return;
      const key = String(u._id);
      if (seen.has(key)) return;
      seen.add(key);
      recipients.push(u);
    };

    // The BDM themselves
    try {
      const bdmUser = await User.findById(bdmId).select('_id email name role').lean();
      addUnique(bdmUser);
    } catch { /* skip */ }

    // Manager chain via PeopleMaster.reports_to (single hop is usually enough;
    // expand to N hops here later if reports_to chains run deep).
    try {
      const PeopleMaster = require('../models/PeopleMaster');
      const person = await PeopleMaster.findOne({ user_id: bdmId, is_active: true }).select('reports_to').lean();
      if (person?.reports_to) {
        const manager = await PeopleMaster.findById(person.reports_to).select('user_id').lean();
        if (manager?.user_id) {
          const mgrUser = await User.findById(manager.user_id).select('_id email name role').lean();
          addUnique(mgrUser);
        }
      }
    } catch (err) {
      console.warn('[notifyTierReached] reports_to lookup failed:', err.message);
    }

    // President(s) — always notified
    const presidents = await User.find({
      role: { $in: ROLE_SETS.PRESIDENT_ROLES },
      isActive: true,
      email: { $exists: true, $ne: '' },
    }).select('_id email name role').lean();
    for (const p of presidents) addUnique(p);

    const filtered = await filterByPreference(recipients, 'compensation');
    if (!filtered.length) return;

    await sendToRecipients(filtered, tierReachedTemplate, {
      bdmName: bdmLabel || 'BDM',
      tierLabel: tierLabel || tierCode,
      tierBudget,
      attainmentPct,
      period,
      fiscalYear,
      planRef,
      entityName,
    }, 'ERP_TIER_REACHED');
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

    const recipients = [];
    const seen = new Set();
    const addUnique = (u) => {
      if (!u || !u._id || !u.email) return;
      const key = String(u._id);
      if (seen.has(key)) return;
      seen.add(key);
      recipients.push(u);
    };

    try {
      const bdmUser = await User.findById(bdmId).select('_id email name role').lean();
      addUnique(bdmUser);
    } catch { /* skip */ }

    try {
      const PeopleMaster = require('../models/PeopleMaster');
      const person = await PeopleMaster.findOne({ user_id: bdmId, is_active: true }).select('reports_to').lean();
      if (person?.reports_to) {
        const manager = await PeopleMaster.findById(person.reports_to).select('user_id').lean();
        if (manager?.user_id) {
          const mgrUser = await User.findById(manager.user_id).select('_id email name role').lean();
          addUnique(mgrUser);
        }
      }
    } catch (err) {
      console.warn('[notifyKpiVariance] reports_to lookup failed:', err.message);
    }

    const presidents = await User.find({
      role: { $in: ROLE_SETS.PRESIDENT_ROLES },
      isActive: true,
      email: { $exists: true, $ne: '' },
    }).select('_id email name role').lean();
    for (const p of presidents) addUnique(p);

    const filtered = await filterByPreference(recipients, 'kpiVariance');
    if (!filtered.length) return;

    await sendToRecipients(filtered, kpiVarianceAlertTemplate, {
      bdmName: bdmLabel || 'BDM',
      fiscalYear,
      period,
      entityName,
      alerts,
    }, 'ERP_KPI_VARIANCE');
  } catch (err) {
    console.error('notifyKpiVariance failed:', err.message);
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
  // Exported for testing / advanced use
  findManagementRecipients,
  findNotificationRecipients,
  resolveEntityName,
};
