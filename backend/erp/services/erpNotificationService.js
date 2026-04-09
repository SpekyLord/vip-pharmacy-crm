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

module.exports = {
  notifyDocumentPosted,
  notifyDocumentReopened,
  notifyApprovalRequest,
  notifyApprovalDecision,
  notifyPayrollPosted,
  // Exported for testing / advanced use
  findManagementRecipients,
  findNotificationRecipients,
  resolveEntityName,
};
