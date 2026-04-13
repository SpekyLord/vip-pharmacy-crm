/**
 * Universal Approval Controller — Approval Hub endpoints
 *
 * GET /universal-pending — all pending items across all modules
 * POST /universal-approve — approve/reject any item from the hub (routes to module's own logic)
 */
const { catchAsync } = require('../../middleware/errorHandler');
const { getUniversalPending } = require('../services/universalApprovalService');

// Module-specific approval handlers (lazy-loaded to avoid circular deps)
const approvalHandlers = {
  approval_request: async (id, action, userId, reason) => {
    const { processDecision } = require('../services/approvalService');
    return processDecision(id, action === 'approve' ? 'APPROVED' : 'REJECTED', userId, reason);
  },

  deduction_schedule: async (id, action, userId, reason) => {
    const svc = require('../services/deductionScheduleService');
    if (action === 'approve') return svc.approveSchedule(id, userId);
    if (action === 'reject') return svc.rejectSchedule(id, userId, reason || 'Rejected from Approval Hub');
    throw new Error(`Unknown action: ${action}`);
  },

  income_report: async (id, action, userId) => {
    const { transitionIncomeStatus } = require('../services/incomeCalc');
    // action maps: review → GENERATED→REVIEWED, credit → BDM_CONFIRMED→CREDITED
    return transitionIncomeStatus(id, action, userId);
  },

  grn: async (id, action, userId, reason) => {
    const GrnEntry = require('../models/GrnEntry');
    const grn = await GrnEntry.findById(id);
    if (!grn) throw new Error('GRN not found');
    if (grn.status !== 'PENDING') throw new Error(`GRN not in PENDING status`);

    if (action === 'approve') {
      grn.status = 'APPROVED';
      grn.reviewed_by = userId;
      grn.reviewed_at = new Date();
    } else {
      grn.status = 'REJECTED';
      grn.reviewed_by = userId;
      grn.reviewed_at = new Date();
      grn.rejection_reason = reason || 'Rejected from Approval Hub';
    }
    await grn.save();
    return grn;
  },

  payslip: async (id, action, userId) => {
    const Payslip = require('../models/Payslip');
    const payslip = await Payslip.findById(id);
    if (!payslip) throw new Error('Payslip not found');

    if (action === 'review') {
      if (payslip.status !== 'COMPUTED') throw new Error('Payslip not in COMPUTED status');
      payslip.status = 'REVIEWED';
      payslip.reviewed_by = userId;
      payslip.reviewed_at = new Date();
    } else if (action === 'approve') {
      if (payslip.status !== 'REVIEWED') throw new Error('Payslip not in REVIEWED status');
      payslip.status = 'APPROVED';
      payslip.approved_by = userId;
      payslip.approved_at = new Date();
    }
    await payslip.save();
    return payslip;
  },

  kpi_rating: async (id, action, userId) => {
    const KpiSelfRating = require('../models/KpiSelfRating');
    const rating = await KpiSelfRating.findById(id);
    if (!rating) throw new Error('KPI rating not found');

    if (action === 'review') {
      if (rating.status !== 'SUBMITTED') throw new Error('Rating not in SUBMITTED status');
      rating.status = 'REVIEWED';
      rating.reviewed_at = new Date();
    } else if (action === 'approve') {
      if (rating.status !== 'REVIEWED') throw new Error('Rating not in REVIEWED status');
      rating.status = 'APPROVED';
      rating.approved_by = userId;
      rating.approved_at = new Date();
    }
    await rating.save();
    return rating;
  }
};

/**
 * GET /api/erp/approvals/universal-pending
 */
const getUniversalPendingEndpoint = catchAsync(async (req, res) => {
  // Pass user's entity_ids for cross-entity support (president sees all, multi-entity users see their entities)
  const entityIds = req.user.entity_ids || (req.user.entity_id ? [req.user.entity_id] : []);
  const items = await getUniversalPending(req.entityId, req.user._id, req.user.role, entityIds);
  res.json({ success: true, data: items, count: items.length });
});

/**
 * POST /api/erp/approvals/universal-approve
 * Body: { type, id, action, reason? }
 * type: 'approval_request' | 'deduction_schedule' | 'income_report' | 'grn' | 'payslip' | 'kpi_rating'
 * action: 'approve' | 'reject' | 'review' | 'credit'
 */
const universalApprove = catchAsync(async (req, res) => {
  const { type, id, action, reason } = req.body;

  if (!type || !id || !action) {
    return res.status(400).json({ success: false, message: 'type, id, and action are required' });
  }

  const handler = approvalHandlers[type];
  if (!handler) {
    return res.status(400).json({ success: false, message: `Unknown approval type: ${type}` });
  }

  const result = await handler(id, action, req.user._id, reason);
  res.json({ success: true, data: result, message: `${action} successful` });
});

module.exports = {
  getUniversalPendingEndpoint,
  universalApprove
};
