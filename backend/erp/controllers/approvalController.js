/**
 * Approval Controller — Phase 28 (Authority Matrix)
 *
 * CRUD for approval rules + approval request management.
 * Rules are admin-maintained via Control Center.
 * Requests are created automatically by approvalService when posting is attempted.
 */

const ApprovalRule = require('../models/ApprovalRule');
const ApprovalRequest = require('../models/ApprovalRequest');
const { catchAsync } = require('../../middleware/errorHandler');
const {
  processDecision,
  getPendingForApprover,
  isApprovalEnabled,
} = require('../services/approvalService');

// ═══ Approval Rules CRUD (admin-maintained) ═══

const listRules = catchAsync(async (req, res) => {
  const filter = { entity_id: req.entityId };
  if (req.query.module) filter.module = req.query.module;
  if (req.query.is_active != null) filter.is_active = req.query.is_active === 'true';

  const rules = await ApprovalRule.find(filter)
    .populate('approver_user_ids', 'name email')
    .populate('created_by', 'name')
    .sort({ module: 1, level: 1 })
    .lean();

  res.json({ success: true, data: rules });
});

const getRule = catchAsync(async (req, res) => {
  const rule = await ApprovalRule.findOne({ _id: req.params.id, entity_id: req.entityId })
    .populate('approver_user_ids', 'name email')
    .lean();
  if (!rule) return res.status(404).json({ success: false, message: 'Rule not found' });
  res.json({ success: true, data: rule });
});

const createRule = catchAsync(async (req, res) => {
  const rule = await ApprovalRule.create({
    ...req.body,
    entity_id: req.entityId,
    created_by: req.user._id,
  });
  res.status(201).json({ success: true, data: rule });
});

const updateRule = catchAsync(async (req, res) => {
  const rule = await ApprovalRule.findOneAndUpdate(
    { _id: req.params.id, entity_id: req.entityId },
    { $set: req.body },
    { new: true, runValidators: true }
  );
  if (!rule) return res.status(404).json({ success: false, message: 'Rule not found' });
  res.json({ success: true, data: rule });
});

const deleteRule = catchAsync(async (req, res) => {
  const rule = await ApprovalRule.findOneAndDelete({ _id: req.params.id, entity_id: req.entityId });
  if (!rule) return res.status(404).json({ success: false, message: 'Rule not found' });
  res.json({ success: true, message: 'Rule deleted' });
});

// ═══ Approval Requests (read + decide) ═══

const listRequests = catchAsync(async (req, res) => {
  const filter = { entity_id: req.entityId };
  if (req.query.status) filter.status = req.query.status;
  if (req.query.module) filter.module = req.query.module;

  const requests = await ApprovalRequest.find(filter)
    .populate('requested_by', 'name email')
    .populate('decided_by', 'name email')
    .populate('rule_id', 'description module level')
    .sort({ createdAt: -1 })
    .limit(Number(req.query.limit) || 100)
    .lean();

  res.json({ success: true, data: requests });
});

const getMyPendingApprovals = catchAsync(async (req, res) => {
  const requests = await getPendingForApprover(req.user._id, req.entityId);
  res.json({ success: true, data: requests });
});

const approveRequest = catchAsync(async (req, res) => {
  const result = await processDecision(
    req.params.id,
    'APPROVED',
    req.user._id,
    req.body.reason
  );
  res.json({ success: true, data: result });
});

const rejectRequest = catchAsync(async (req, res) => {
  if (!req.body.reason) {
    return res.status(400).json({ success: false, message: 'Rejection reason is required' });
  }
  const result = await processDecision(
    req.params.id,
    'REJECTED',
    req.user._id,
    req.body.reason
  );
  res.json({ success: true, data: result });
});

const cancelRequest = catchAsync(async (req, res) => {
  const request = await ApprovalRequest.findOne({
    _id: req.params.id,
    entity_id: req.entityId,
    status: 'PENDING',
  });
  if (!request) return res.status(404).json({ success: false, message: 'Pending request not found' });

  // Only the requester or admin can cancel
  const isRequester = request.requested_by.toString() === req.user._id.toString();
  const isAdmin = ['admin', 'president'].includes(req.user.role);
  if (!isRequester && !isAdmin) {
    return res.status(403).json({ success: false, message: 'Only the requester or admin can cancel' });
  }

  request.status = 'CANCELLED';
  request.decided_by = req.user._id;
  request.decided_at = new Date();
  request.decision_reason = req.body.reason || 'Cancelled by user';
  request.history.push({ status: 'CANCELLED', by: req.user._id, reason: req.body.reason || 'Cancelled' });
  await request.save();

  res.json({ success: true, data: request });
});

const getApprovalStatus = catchAsync(async (req, res) => {
  const enabled = await isApprovalEnabled();
  res.json({ success: true, data: { enabled } });
});

module.exports = {
  listRules,
  getRule,
  createRule,
  updateRule,
  deleteRule,
  listRequests,
  getMyPendingApprovals,
  approveRequest,
  rejectRequest,
  cancelRequest,
  getApprovalStatus,
};
