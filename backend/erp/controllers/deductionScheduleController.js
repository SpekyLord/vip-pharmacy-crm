/**
 * Deduction Schedule Controller — Recurring & Non-Recurring Deduction Plans
 *
 * BDM (contractor) creates schedules. Finance approves/manages.
 * Installments auto-inject into payslips via incomeCalc.js.
 */
const DeductionSchedule = require('../models/DeductionSchedule');
const { catchAsync } = require('../../middleware/errorHandler');
const {
  createSchedule: createScheduleSvc,
  approveSchedule: approveScheduleSvc,
  rejectSchedule: rejectScheduleSvc,
  cancelSchedule: cancelScheduleSvc,
  earlyPayoff: earlyPayoffSvc,
  adjustInstallment: adjustInstallmentSvc
} = require('../services/deductionScheduleService');

// ═══ BDM Endpoints ═══

const createSchedule = catchAsync(async (req, res) => {
  const schedule = await createScheduleSvc(
    req.entityId, req.bdmId, req.body, req.user._id, false
  );
  res.status(201).json({ success: true, data: schedule });
});

const getMySchedules = catchAsync(async (req, res) => {
  const filter = { entity_id: req.entityId, bdm_id: req.bdmId };
  if (req.query.status) filter.status = req.query.status;
  if (req.query.deduction_type) filter.deduction_type = req.query.deduction_type;

  const schedules = await DeductionSchedule.find(filter)
    .populate('approved_by', 'name')
    .sort({ created_at: -1 })
    .lean();
  res.json({ success: true, data: schedules });
});

// ═══ Shared (own or admin) ═══

const getScheduleById = catchAsync(async (req, res) => {
  const filter = { _id: req.params.id, entity_id: req.entityId };
  // BDMs can only see their own
  const canViewOther = req.isAdmin || req.isFinance || req.isPresident;
  if (!canViewOther) filter.bdm_id = req.bdmId;

  const schedule = await DeductionSchedule.findOne(filter)
    .populate('bdm_id', 'name email')
    .populate('approved_by', 'name')
    .populate('installments.verified_by', 'name')
    .populate('created_by', 'name');

  if (!schedule) {
    return res.status(404).json({ success: false, message: 'Schedule not found' });
  }
  res.json({ success: true, data: schedule });
});

// ═══ Finance/Admin Endpoints ═══

const getScheduleList = catchAsync(async (req, res) => {
  const filter = { entity_id: req.entityId };
  if (req.query.status) filter.status = req.query.status;
  if (req.query.bdm_id) filter.bdm_id = req.query.bdm_id;
  if (req.query.deduction_type) filter.deduction_type = req.query.deduction_type;

  const schedules = await DeductionSchedule.find(filter)
    .populate('bdm_id', 'name email')
    .populate('approved_by', 'name')
    .sort({ created_at: -1 })
    .lean();
  res.json({ success: true, data: schedules });
});

const approveSchedule = catchAsync(async (req, res) => {
  const schedule = await approveScheduleSvc(req.params.id, req.user._id);
  res.json({ success: true, data: schedule, message: 'Schedule approved' });
});

const rejectSchedule = catchAsync(async (req, res) => {
  const schedule = await rejectScheduleSvc(req.params.id, req.user._id, req.body.reason);
  res.json({ success: true, data: schedule, message: 'Schedule rejected' });
});

const cancelSchedule = catchAsync(async (req, res) => {
  const schedule = await cancelScheduleSvc(req.params.id, req.user._id, req.body.reason);
  res.json({ success: true, data: schedule, message: 'Schedule cancelled' });
});

const earlyPayoff = catchAsync(async (req, res) => {
  const { payoff_period } = req.body;
  if (!payoff_period) {
    return res.status(400).json({ success: false, message: 'payoff_period is required (YYYY-MM)' });
  }
  const schedule = await earlyPayoffSvc(req.params.id, payoff_period, req.user._id);
  res.json({ success: true, data: schedule, message: 'Early payoff applied' });
});

const adjustInstallment = catchAsync(async (req, res) => {
  const { amount, note } = req.body;
  if (amount === undefined || typeof amount !== 'number' || amount < 0) {
    return res.status(400).json({ success: false, message: 'Valid amount is required' });
  }
  const schedule = await adjustInstallmentSvc(
    req.params.id, req.params.instId, amount, req.user._id, note
  );
  res.json({ success: true, data: schedule });
});

const financeCreateSchedule = catchAsync(async (req, res) => {
  const { bdm_id } = req.body;
  if (!bdm_id) {
    return res.status(400).json({ success: false, message: 'bdm_id is required' });
  }
  const schedule = await createScheduleSvc(
    req.entityId, bdm_id, req.body, req.user._id, true
  );
  res.status(201).json({ success: true, data: schedule });
});

module.exports = {
  createSchedule,
  getMySchedules,
  getScheduleById,
  getScheduleList,
  approveSchedule,
  rejectSchedule,
  cancelSchedule,
  earlyPayoff,
  adjustInstallment,
  financeCreateSchedule
};
