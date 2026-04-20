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

const { ROLES, ROLE_SETS } = require('../../constants/roles');
const Settings = require('../models/Settings');
const ApprovalRule = require('../models/ApprovalRule');
const ApprovalRequest = require('../models/ApprovalRequest');
const Lookup = require('../models/Lookup');
const User = require('../../models/User');
const PeopleMaster = require('../models/PeopleMaster');
const { notifyApprovalRequest, notifyApprovalDecision } = require('./erpNotificationService');
const { getParentEntityIds } = require('../utils/parentEntityResolver');

// Module key aliases — controllers historically used inconsistent keys.
// Normalize to the canonical lookup code so the gate finds the right MODULE_DEFAULT_ROLES entry.
const MODULE_KEY_ALIASES = {
  COLLECTIONS: 'COLLECTION', // legacy controller spelling
};

/**
 * Get the lookup-driven list of roles allowed to POST documents in a module.
 * Returns null if no entry exists or roles is null (open — anyone can post).
 *
 * Self-seeds the requested entry from SEED_DEFAULTS on miss (subscription-ready):
 * a fresh subsidiary doesn't need the admin to open the Approval Hub before the
 * gate works — the first submit lazily seeds the missing entry.
 *
 * @param {ObjectId} entityId
 * @param {string} moduleKey - e.g. 'SALES', 'COLLECTION', 'EXPENSES'
 * @returns {Promise<string[]|null>}
 */
const getModulePostingRoles = async (entityId, moduleKey) => {
  // Uppercase first so the alias map handles any casing the controller passes.
  const upper = (moduleKey || '').toUpperCase();
  const code = MODULE_KEY_ALIASES[upper] || upper;
  if (!code || !entityId) return null;
  let entry = await Lookup.findOne({
    entity_id: entityId,
    category: 'MODULE_DEFAULT_ROLES',
    code,
    is_active: true,
  }).lean();

  // Lazy auto-seed: if no entry yet for this entity+module, upsert from SEED_DEFAULTS.
  // Mirrors the pattern in getUniversalPending — keeps both paths in sync without
  // requiring admins to open the Approval Hub before the gate becomes effective.
  if (!entry) {
    try {
      const { SEED_DEFAULTS } = require('../controllers/lookupGenericController');
      const seeds = SEED_DEFAULTS?.MODULE_DEFAULT_ROLES || [];
      const seed = seeds.find(s => (s.code || '').toUpperCase() === code);
      if (seed) {
        await Lookup.updateOne(
          { entity_id: entityId, category: 'MODULE_DEFAULT_ROLES', code },
          {
            $setOnInsert: {
              label: seed.label,
              sort_order: 0,
              is_active: true,
              metadata: seed.metadata || {},
            },
          },
          { upsert: true }
        );
        entry = await Lookup.findOne({
          entity_id: entityId,
          category: 'MODULE_DEFAULT_ROLES',
          code,
          is_active: true,
        }).lean();
      }
    } catch (seedErr) {
      console.error(`MODULE_DEFAULT_ROLES lazy-seed failed for ${code}:`, seedErr.message);
    }
  }

  if (!entry) return null;
  const roles = entry.metadata?.roles;
  if (roles == null) return null; // null = open
  return Array.isArray(roles) && roles.length > 0 ? roles : null;
};

/**
 * Phase G6 — Get the lookup-driven rejection config for a module.
 * Returns { rejected_status, reason_field, resubmit_allowed, editable_statuses,
 * banner_tone, description } or null if the module has no config.
 *
 * Self-seeds from SEED_DEFAULTS on miss — mirrors getModulePostingRoles so a fresh
 * subsidiary gets a working banner on first render without requiring admin to open
 * Control Center first. Keeps G4 (posting roles) and G6 (rejection surface) in sync.
 *
 * Frontend <RejectionBanner> calls this via GET /api/erp/lookups/module-rejection-config/:code.
 *
 * @param {ObjectId} entityId
 * @param {string} moduleKey - canonical MODULE_DEFAULT_ROLES code (e.g. 'SALES', 'INCOME')
 * @returns {Promise<Object|null>}
 */
const getModuleRejectionConfig = async (entityId, moduleKey) => {
  const upper = (moduleKey || '').toUpperCase();
  const code = MODULE_KEY_ALIASES[upper] || upper;
  if (!code || !entityId) return null;
  let entry = await Lookup.findOne({
    entity_id: entityId,
    category: 'MODULE_REJECTION_CONFIG',
    code,
    is_active: true,
  }).lean();

  if (!entry) {
    try {
      const { SEED_DEFAULTS } = require('../controllers/lookupGenericController');
      const seeds = SEED_DEFAULTS?.MODULE_REJECTION_CONFIG || [];
      const seed = seeds.find(s => (s.code || '').toUpperCase() === code);
      if (seed) {
        await Lookup.updateOne(
          { entity_id: entityId, category: 'MODULE_REJECTION_CONFIG', code },
          {
            $setOnInsert: {
              label: seed.label,
              sort_order: 0,
              is_active: true,
              metadata: seed.metadata || {},
            },
          },
          { upsert: true }
        );
        entry = await Lookup.findOne({
          entity_id: entityId,
          category: 'MODULE_REJECTION_CONFIG',
          code,
          is_active: true,
        }).lean();
      }
    } catch (seedErr) {
      console.error(`MODULE_REJECTION_CONFIG lazy-seed failed for ${code}:`, seedErr.message);
    }
  }

  if (!entry) return null;
  return entry.metadata || null;
};

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
      const parentEntityIds = await getParentEntityIds();
      return User.find({
        role: { $in: rule.approver_roles },
        isActive: true,
        email: { $exists: true, $ne: '' },
        $or: [
          { entity_id: entityId },
          { entity_ids: entityId },
          // Cross-entity escape: only presidents/CEOs of a PARENT entity —
          // subsidiary presidents are excluded so they see only their own
          // subsidiary's approvals (matched via entity_id above).
          { role: { $in: ROLE_SETS.PRESIDENT_ROLES }, entity_id: { $in: parentEntityIds } },
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
  // ── Layer 1: Default-Roles Gate (always enforced, lookup-driven, subscription-ready) ──
  // Governing principle: "Any person can CREATE, but authority POSTS."
  // Per-entity MODULE_DEFAULT_ROLES.metadata.roles defines who can post each module.
  // Subscribers configure via Control Center → Lookup Tables (no code change needed).
  // Setting metadata.roles = null on a module disables this gate (open-post).
  const requester = await User.findById(opts.requesterId).select('role name email').lean();
  const requesterRole = requester?.role;

  // President / CEO bypass (cross-entity superusers — they own the company)
  const isPresidentBypass = ROLE_SETS.PRESIDENT_ROLES.includes(requesterRole);

  if (!isPresidentBypass) {
    const allowedRoles = await getModulePostingRoles(opts.entityId, opts.module);
    if (allowedRoles && !allowedRoles.includes(requesterRole)) {
      // Requester not authorized to post → hold for Approval Hub.
      // Check for existing pending/approved request first (idempotent re-submit).
      const existingDefault = await ApprovalRequest.findOne({
        doc_id: opts.docId,
        status: { $in: ['PENDING', 'APPROVED'] },
      }).lean();

      if (existingDefault?.status === 'APPROVED') return { required: false };
      if (existingDefault?.status === 'PENDING') {
        return {
          required: true,
          message: 'This document is pending approval in the Approval Hub',
          requests: [existingDefault],
        };
      }

      // Create synthetic request (no rule_id — this is the default-roles gate, not a matrix rule).
      // level: 0 distinguishes from matrix rules (which start at level 1).
      const request = await ApprovalRequest.create({
        entity_id: opts.entityId,
        rule_id: null,
        module: opts.module,
        doc_type: opts.docType,
        doc_id: opts.docId,
        doc_ref: opts.docRef,
        amount: opts.amount,
        description: opts.description,
        metadata: { ...(opts.metadata || {}), gate: 'DEFAULT_ROLES', allowed_roles: allowedRoles },
        level: 0,
        requested_by: opts.requesterId,
        status: 'PENDING',
        history: [{
          status: 'PENDING',
          by: opts.requesterId,
          reason: `Posting authority required (submitter role: ${requesterRole}, allowed: ${allowedRoles.join(', ')})`,
        }],
      });

      // Resolve approvers: users with allowed roles in this entity, plus
      // parent-entity presidents/CEOs (true cross-entity superusers).
      // Subsidiary presidents are scoped to their own entity only — they
      // must NOT receive approval requests for unrelated entities.
      const parentEntityIds = await getParentEntityIds();
      const approvers = await User.find({
        role: { $in: allowedRoles },
        isActive: true,
        email: { $exists: true, $ne: '' },
        $or: [
          { entity_id: opts.entityId },
          { entity_ids: opts.entityId },
          { role: { $in: ROLE_SETS.PRESIDENT_ROLES }, entity_id: { $in: parentEntityIds } },
        ],
      }).select('_id email name role').lean();

      notifyApprovalRequest({
        entityId: opts.entityId,
        module: opts.module,
        docType: opts.docType,
        docRef: opts.docRef,
        requestedBy: opts.requesterName || requester?.name || 'User',
        amount: opts.amount,
        description: opts.description,
        approvers,
        approvalRequestId: request._id, // G9.B — thread linkage for inbox
      }).catch(err => console.error('Default-roles gate notification failed:', err.message));

      return {
        required: true,
        message: 'Posting authority required. Request submitted to Approval Hub.',
        requests: [request],
      };
    }
  }

  // ── Layer 2: Authority Matrix (existing escalation rules — only when enabled) ──
  // Even authorized posters may need additional approval for high-value transactions.
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
    metadata: opts.metadata,  // module-specific structured data (e.g., entry_id, override_tier for PERDIEM_OVERRIDE)
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
    approvalRequestId: request._id, // G9.B — thread linkage for inbox
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
    if (!isAuthorized && decider?.role !== ROLES.PRESIDENT) {
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
    approvalRequestId: request._id, // G9.B — thread continuity with original request
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
          approvalRequestId: nextRequest._id, // G9.B — thread linkage for escalated level
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
  const query = user.role === ROLES.PRESIDENT
    ? { entity_id: entityId, status: 'PENDING' }
    : { entity_id: entityId, status: 'PENDING', rule_id: { $in: ruleIds } };

  return ApprovalRequest.find(query)
    .populate('requested_by', 'name email')
    .sort({ createdAt: -1 })
    .lean();
};

/**
 * Convenience gate for controllers — checks approval and sends 202 if needed.
 * Returns true if the response was sent (caller should return early).
 *
 * Usage in any submit/post controller:
 *   const gated = await gateApproval({ entityId, module, docType, docId, ... }, res);
 *   if (gated) return;
 *   // ... proceed with normal posting
 *
 * @param {Object} opts - same as checkApprovalRequired
 * @param {import('express').Response} res
 * @returns {Promise<boolean>} true if 202 was sent (caller must return)
 */
const gateApproval = async (opts, res) => {
  const check = await checkApprovalRequired(opts);
  if (check.required) {
    res.status(202).json({
      success: true,
      message: check.message,
      approval_pending: true,
      requests: check.requests,
    });
    return true;
  }
  return false;
};

module.exports = {
  isApprovalEnabled,
  findMatchingRules,
  resolveApprovers,
  checkApprovalRequired,
  gateApproval,
  processDecision,
  isFullyApproved,
  getPendingForApprover,
  getModulePostingRoles,
  getModuleRejectionConfig,
  MODULE_KEY_ALIASES,
};
