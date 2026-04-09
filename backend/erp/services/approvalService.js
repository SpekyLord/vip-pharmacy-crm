/**
 * Approval Service — Phase 28 (Authority Matrix)
 *
 * Provides the business logic for multi-level approval workflows.
 * Only active when Settings.ENFORCE_AUTHORITY_MATRIX is true.
 *
 * Key design decisions:
 *   - Rules are entity-scoped and database-driven (no hardcoded thresholds)
 *   - Multi-level: level 1 must approve before level 2 is evaluated
 *   - Approver resolution is dynamic (by role, specific user, or reporting chain)
 *   - Email notifications sent via erpNotificationService (non-blocking)
 *   - All decisions recorded in ApprovalRequest.history (immutable audit trail)
 */

const Settings = require('../models/Settings');
const ApprovalRule = require('../models/ApprovalRule');
const ApprovalRequest = require('../models/ApprovalRequest');
const User = require('../../models/User');
const PeopleMaster = require('../models/PeopleMaster');
const { notifyApprovalRequest, notifyApprovalDecision } = require('./erpNotificationService');

/**
 * Check whether the authority matrix is enabled for this entity.
 * @returns {Promise<boolean>}
 */
const isApprovalEnabled = async () => {
  const settings = await Settings.getSettings();
  return !!settings.ENFORCE_AUTHORITY_MATRIX;
};

/**
 * Find matching approval rules for a document.
 * Returns rules sorted by level (ascending).
 *
 * @param {ObjectId} entityId
 * @param {string} module - e.g., 'PURCHASING'
 * @param {string} docType - e.g., 'PO'
 * @param {number} [amount] - document amount for threshold matching
 * @returns {Promise<Array>} sorted rules
 */
const findMatchingRules = async (entityId, module, docType, amount) => {
  const query = {
    entity_id: entityId,
    module,
    is_active: true,
    $or: [
      { doc_type: null },     // module-wide rules
      { doc_type: docType },  // doc-type-specific rules
    ],
  };

  const rules = await ApprovalRule.find(query).sort({ level: 1 }).lean();

  // Filter by amount threshold
  return rules.filter(rule => {
    if (rule.amount_threshold == null) return true; // no threshold = always applies
    return (amount || 0) >= rule.amount_threshold;
  });
};

/**
 * Resolve the list of users who can approve at a given rule level.
 *
 * @param {Object} rule - ApprovalRule document
 * @param {ObjectId} entityId
 * @param {ObjectId} requesterId - the user requesting approval
 * @returns {Promise<Array<{_id, email, name}>>}
 */
const resolveApprovers = async (rule, entityId, requesterId) => {
  switch (rule.approver_type) {
    case 'ROLE': {
      return User.find({
        role: { $in: rule.approver_roles },
        isActive: true,
        email: { $exists: true, $ne: '' },
        $or: [
          { entity_id: entityId },
          { entity_ids: entityId },
          { role: { $in: ['president', 'ceo'] } },
        ],
      }).select('_id email name role').lean();
    }

    case 'USER': {
      return User.find({
        _id: { $in: rule.approver_user_ids },
        isActive: true,
      }).select('_id email name role').lean();
    }

    case 'REPORTS_TO': {
      // Find the requester's manager from PeopleMaster
      const person = await PeopleMaster.findOne({
        user_id: requesterId,
        entity_id: entityId,
        is_active: true,
      }).select('reports_to').lean();

      if (!person?.reports_to) return [];

      // reports_to references another PeopleMaster; find their User account
      const manager = await PeopleMaster.findById(person.reports_to)
        .select('user_id')
        .lean();

      if (!manager?.user_id) return [];

      const managerUser = await User.findOne({
        _id: manager.user_id,
        isActive: true,
      }).select('_id email name role').lean();

      return managerUser ? [managerUser] : [];
    }

    default:
      return [];
  }
};

/**
 * Check if a document requires approval before posting.
 * If approval is not enabled or no rules match, returns { required: false }.
 * If approval is required, creates ApprovalRequest(s) and returns { required: true, requests }.
 *
 * @param {Object} opts
 * @param {ObjectId} opts.entityId
 * @param {string} opts.module - 'SALES', 'PURCHASING', etc.
 * @param {string} opts.docType - 'CSI', 'PO', etc.
 * @param {ObjectId} opts.docId - the document's _id
 * @param {string} [opts.docRef] - human-readable reference
 * @param {number} [opts.amount]
 * @param {string} [opts.description]
 * @param {ObjectId} opts.requesterId - the user trying to post
 * @returns {Promise<{required: boolean, requests?: Array, message?: string}>}
 */
const checkApprovalRequired = async (opts) => {
  const enabled = await isApprovalEnabled();
  if (!enabled) return { required: false };

  const rules = await findMatchingRules(opts.entityId, opts.module, opts.docType, opts.amount);
  if (!rules.length) return { required: false };

  // Check if there's already a pending/approved request for this doc at the first level
  const existing = await ApprovalRequest.findOne({
    doc_id: opts.docId,
    status: { $in: ['PENDING', 'APPROVED'] },
  }).lean();

  if (existing?.status === 'APPROVED') {
    // Already approved — allow posting
    return { required: false };
  }

  if (existing?.status === 'PENDING') {
    // Already pending — return the existing request
    return {
      required: true,
      message: 'This document is pending approval',
      requests: [existing],
    };
  }

  // Create approval request for level 1
  const firstRule = rules[0];
  const approvers = await resolveApprovers(firstRule, opts.entityId, opts.requesterId);

  const request = await ApprovalRequest.create({
    entity_id: opts.entityId,
    rule_id: firstRule._id,
    module: opts.module,
    doc_type: opts.docType,
    doc_id: opts.docId,
    doc_ref: opts.docRef,
    amount: opts.amount,
    description: opts.description,
    level: firstRule.level,
    requested_by: opts.requesterId,
    status: 'PENDING',
    history: [{ status: 'PENDING', by: opts.requesterId, reason: 'Approval required by authority matrix' }],
  });

  // Non-blocking: notify approvers
  notifyApprovalRequest({
    entityId: opts.entityId,
    module: opts.module,
    docType: opts.docType,
    docRef: opts.docRef,
    requestedBy: opts.requesterName || 'User',
    amount: opts.amount,
    description: opts.description,
    approvers,
  }).catch(err => console.error('Approval request notification failed:', err.message));

  return {
    required: true,
    message: 'Approval required. Request has been submitted.',
    requests: [request],
  };
};

/**
 * Process an approval decision (approve or reject).
 *
 * @param {ObjectId} requestId - ApprovalRequest._id
 * @param {string} decision - 'APPROVED' or 'REJECTED'
 * @param {ObjectId} deciderId - User._id of the approver
 * @param {string} [reason] - optional reason
 * @returns {Promise<Object>} updated ApprovalRequest
 */
const processDecision = async (requestId, decision, deciderId, reason) => {
  const request = await ApprovalRequest.findById(requestId);
  if (!request) throw new Error('Approval request not found');
  if (request.status !== 'PENDING') throw new Error(`Request is already ${request.status}`);

  // Verify the decider is authorized
  const rule = await ApprovalRule.findById(request.rule_id).lean();
  if (rule) {
    const approvers = await resolveApprovers(rule, request.entity_id, request.requested_by);
    const isAuthorized = approvers.some(a => a._id.toString() === deciderId.toString());

    // Presidents can always approve
    const decider = await User.findById(deciderId).select('role').lean();
    if (!isAuthorized && decider?.role !== 'president') {
      throw new Error('You are not authorized to approve this request');
    }
  }

  request.status = decision;
  request.decided_by = deciderId;
  request.decided_at = new Date();
  request.decision_reason = reason;
  request.history.push({
    status: decision,
    by: deciderId,
    reason: reason || `${decision} by approver`,
  });
  await request.save();

  // Notify the requester of the decision
  const deciderUser = await User.findById(deciderId).select('name email').lean();
  notifyApprovalDecision({
    entityId: request.entity_id,
    module: request.module,
    docType: request.doc_type,
    docRef: request.doc_ref,
    decision,
    decidedBy: deciderUser?.name || 'Approver',
    ownerId: request.requested_by,
    reason,
  }).catch(err => console.error('Approval decision notification failed:', err.message));

  // If approved, check if there's a next level
  if (decision === 'APPROVED' && rule) {
    const nextRule = await ApprovalRule.findOne({
      entity_id: request.entity_id,
      module: request.module,
      is_active: true,
      level: { $gt: request.level },
      $or: [
        { doc_type: null },
        { doc_type: request.doc_type },
      ],
    }).sort({ level: 1 }).lean();

    if (nextRule) {
      // Amount check for next level
      const meetsThreshold = nextRule.amount_threshold == null || (request.amount || 0) >= nextRule.amount_threshold;

      if (meetsThreshold) {
        const nextApprovers = await resolveApprovers(nextRule, request.entity_id, request.requested_by);

        const nextRequest = await ApprovalRequest.create({
          entity_id: request.entity_id,
          rule_id: nextRule._id,
          module: request.module,
          doc_type: request.doc_type,
          doc_id: request.doc_id,
          doc_ref: request.doc_ref,
          amount: request.amount,
          description: request.description,
          level: nextRule.level,
          requested_by: request.requested_by,
          status: 'PENDING',
          history: [{ status: 'PENDING', by: deciderId, reason: `Escalated from level ${request.level}` }],
        });

        notifyApprovalRequest({
          entityId: request.entity_id,
          module: request.module,
          docType: request.doc_type,
          docRef: request.doc_ref,
          requestedBy: 'System (escalated)',
          amount: request.amount,
          description: request.description,
          approvers: nextApprovers,
        }).catch(err => console.error('Next-level approval notification failed:', err.message));

        return { request, nextLevel: nextRequest };
      }
    }
  }

  return { request };
};

/**
 * Check if a document has been fully approved (all levels).
 * @param {ObjectId} docId
 * @returns {Promise<boolean>}
 */
const isFullyApproved = async (docId) => {
  const pending = await ApprovalRequest.countDocuments({
    doc_id: docId,
    status: 'PENDING',
  });
  if (pending > 0) return false;

  const approved = await ApprovalRequest.countDocuments({
    doc_id: docId,
    status: 'APPROVED',
  });
  return approved > 0;
};

/**
 * Get pending approval requests for a user (as approver).
 * @param {ObjectId} userId
 * @param {ObjectId} entityId
 * @returns {Promise<Array>}
 */
const getPendingForApprover = async (userId, entityId) => {
  const user = await User.findById(userId).select('role').lean();
  if (!user) return [];

  // Find all rules where this user could be an approver
  const roleRules = await ApprovalRule.find({
    entity_id: entityId,
    is_active: true,
    approver_type: 'ROLE',
    approver_roles: user.role,
  }).select('_id').lean();

  const userRules = await ApprovalRule.find({
    entity_id: entityId,
    is_active: true,
    approver_type: 'USER',
    approver_user_ids: userId,
  }).select('_id').lean();

  const ruleIds = [...roleRules, ...userRules].map(r => r._id);

  // Presidents see all pending requests
  const query = user.role === 'president'
    ? { entity_id: entityId, status: 'PENDING' }
    : { entity_id: entityId, status: 'PENDING', rule_id: { $in: ruleIds } };

  return ApprovalRequest.find(query)
    .populate('requested_by', 'name email')
    .sort({ createdAt: -1 })
    .lean();
};

module.exports = {
  isApprovalEnabled,
  findMatchingRules,
  resolveApprovers,
  checkApprovalRequired,
  processDecision,
  isFullyApproved,
  getPendingForApprover,
};
