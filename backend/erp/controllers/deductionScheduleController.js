/**
 * Deduction Schedule Controller — Recurring & Non-Recurring Deduction Plans
 *
 * BDM (contractor) creates schedules. Finance approves/manages.
 * Installments auto-inject into payslips via incomeCalc.js.
 */
const DeductionSchedule = require('../models/DeductionSchedule');
const { catchAsync } = require('../../middleware/errorHandler');
const { gateApproval } = require('../services/approvalService');
const {
  createSchedule: createScheduleSvc,
  approveSchedule: approveScheduleSvc,
  rejectSchedule: rejectScheduleSvc,
  cancelSchedule: cancelScheduleSvc,
  earlyPayoff: earlyPayoffSvc,
  adjustInstallment: adjustInstallmentSvc,
  withdrawSchedule: withdrawScheduleSvc,
  editPendingSchedule: editPendingScheduleSvc
} = require('../services/deductionScheduleService');
const { resolveOwnerForWrite, widenFilterForProxy, canProxyEntry } = require('../utils/resolveOwnerScope');

// Phase G4.5aa (Apr 29, 2026) — proxy entry on Deduction Schedule (BDM cash
// advance / loan amortization plans). Sub-perm `payroll.deduction_schedule_proxy`
// + PROXY_ENTRY_ROLES.DEDUCTION_SCHEDULE (admin/finance/president by default;
// subscribers append 'staff' for eBDMs in Control Center). VALID_OWNER_ROLES.
// DEDUCTION_SCHEDULE defaults to 'staff' — admin/finance/president can never own
// a per-BDM deduction schedule (it would corrupt the BDM's payslip injection).
//
// NOTE: This module's namespace is `payroll` for the sub-perm metadata (matches
// the page where Deduction Schedule lives — the Income page Schedules tab) but
// the lookup code is DEDUCTION_SCHEDULE so subscribers can configure proxy
// rosters independently from Income proxy.
const DEDUCTION_PROXY_OPTS = { subKey: 'deduction_schedule_proxy', lookupCode: 'DEDUCTION_SCHEDULE' };

// ═══ BDM Endpoints ═══

const createSchedule = catchAsync(async (req, res) => {
  // Phase G4.5aa — proxy resolver. Self-flow: staff caller with no assigned_to →
  // owner = self (req.user._id, which equals req.bdmId for staff). Proxy flow:
  // staff with payroll.deduction_schedule_proxy + body.assigned_to → owner =
  // target BDM, created_by = proxy. Throws 400 (Rule #21) if a non-BDM caller
  // omits assigned_to and 403 if proxy gate fails.
  let owner;
  try {
    owner = await resolveOwnerForWrite(req, 'payroll', DEDUCTION_PROXY_OPTS);
  } catch (err) {
    if (err.statusCode === 400 || err.statusCode === 403) {
      return res.status(err.statusCode).json({ success: false, message: err.message });
    }
    throw err;
  }
  // BDM self-service path — explicit owner disambiguation (object form) so the
  // XOR invariant is machine-checked in the service. For proxy, owner.ownerId
  // is the TARGET BDM. The service's bdm_id field gets stamped accordingly;
  // installments will inject into the target's IncomeReport on payroll cycles.
  const schedule = await createScheduleSvc(
    req.entityId, { bdm_id: owner.ownerId }, req.body, req.user._id, false
  );

  // Phase G4.2 — unify with the Approval Hub. Route a PENDING_APPROVAL schedule
  // through the lookup-driven Default-Roles Gate so the decision is recorded on
  // ApprovalRequest (status PENDING → APPROVED/REJECTED) and surfaces in the
  // Approval History tab. The raw DeductionSchedule query in MODULE_QUERIES
  // (universalApprovalService.js:102-128) still surfaces the pending schedule in
  // the All Pending tab; the by-doc_id dedup (lines 1342-1371) drops the mirror
  // ApprovalRequest row so there is no double-listing.
  //
  // gateApproval sends HTTP 202 with approval_pending:true when a PENDING
  // ApprovalRequest is created. The schedule itself already exists in
  // PENDING_APPROVAL status — the frontend surfaces it via showApprovalPending
  // and the BDM can withdraw/edit from My Schedules.
  const gated = await gateApproval({
    entityId: req.entityId,
    module: 'DEDUCTION_SCHEDULE',
    docType: schedule.term_months === 1 ? 'ONE_TIME' : 'INSTALLMENT',
    docId: schedule._id,
    docRef: schedule.schedule_code,
    amount: schedule.total_amount,
    description: `${schedule.deduction_label}${schedule.term_months > 1 ? ` · ₱${schedule.installment_amount}/mo × ${schedule.term_months}` : ''} · ${schedule.target_cycle}`,
    requesterId: req.user._id,
    requesterName: req.user.name,
  }, res);
  if (gated) return;

  // Fallback — requester's role was in MODULE_DEFAULT_ROLES.DEDUCTION_SCHEDULE
  // (admin/finance/president) so no ApprovalRequest was needed. roleCheck on the
  // BDM route only admits `contractor`, so this branch is effectively unreachable
  // today; keeping the 201 reply preserves the response contract if the route
  // is ever opened up. Finance/Admin auto-activate flow remains on POST /finance-create.
  res.status(201).json({ success: true, data: schedule });
});

const getMySchedules = catchAsync(async (req, res) => {
  const filter = { entity_id: req.entityId, bdm_id: req.bdmId };
  // Phase G4.5aa — staff with payroll.deduction_schedule_proxy + 'staff' added to
  // PROXY_ENTRY_ROLES.DEDUCTION_SCHEDULE see all BDMs in their entity. Caller can
  // narrow back via ?bdm_id=<target> to focus on a specific BDM's plan list.
  const { canProxy } = await canProxyEntry(req, 'payroll', DEDUCTION_PROXY_OPTS);
  if (canProxy) {
    if (req.query.bdm_id) filter.bdm_id = req.query.bdm_id;
    else delete filter.bdm_id;
  }
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
    .populate('person_id', 'full_name person_type department')
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
  // Phase G1.4 — Finance can filter to employee-owner schedules too. Either
  // filter narrows independently; supplying both returns schedules owned by
  // that specific bdm AND person (unlikely but safe — no collision thanks to
  // the XOR invariant).
  if (req.query.person_id) filter.person_id = req.query.person_id;
  // owner_type=BDM | EMPLOYEE — convenience flag for list views that want one
  // tab per owner class without knowing individual ids.
  if (req.query.owner_type === 'BDM') filter.bdm_id = { $exists: true };
  else if (req.query.owner_type === 'EMPLOYEE') filter.person_id = { $exists: true };
  if (req.query.deduction_type) filter.deduction_type = req.query.deduction_type;

  const schedules = await DeductionSchedule.find(filter)
    .populate('bdm_id', 'name email')
    .populate('person_id', 'full_name person_type department')
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
  const { bdm_id, person_id } = req.body;
  // Phase G1.4 — Finance can create either a BDM schedule (installments inject
  // into IncomeReport) or an Employee schedule (installments inject into
  // Payslip). XOR enforced both in the service and at the model level.
  if (!bdm_id && !person_id) {
    return res.status(400).json({ success: false, message: 'bdm_id (contractor) or person_id (employee) is required' });
  }
  if (bdm_id && person_id) {
    return res.status(400).json({ success: false, message: 'Provide exactly one of bdm_id or person_id, not both' });
  }
  const schedule = await createScheduleSvc(
    req.entityId,
    bdm_id ? { bdm_id } : { person_id },
    req.body,
    req.user._id,
    true
  );
  res.status(201).json({ success: true, data: schedule });
});

// ═══ BDM Self-Service ═══

const withdrawSchedule = catchAsync(async (req, res) => {
  // Phase G4.5aa — for proxy callers, peek the schedule's bdm_id and pass that
  // as the ownership param so the service's strict ownership guard
  // (schedule.bdm_id === bdmId) accepts the proxy. The proxy gate is enforced
  // here at the controller level via canProxyEntry; only proxy-eligible callers
  // can override req.bdmId.
  const { canProxy } = await canProxyEntry(req, 'payroll', DEDUCTION_PROXY_OPTS);
  let bdmId = req.bdmId;
  if (canProxy) {
    const peek = await DeductionSchedule.findOne({ _id: req.params.id, entity_id: req.entityId }).select('bdm_id').lean();
    if (peek?.bdm_id) bdmId = peek.bdm_id;
  }
  const schedule = await withdrawScheduleSvc(req.params.id, bdmId, req.entityId);
  res.json({ success: true, data: schedule, message: 'Schedule withdrawn' });
});

const editPendingSchedule = catchAsync(async (req, res) => {
  // Phase G4.5aa — same pattern as withdrawSchedule. Proxy callers can edit a
  // PENDING_APPROVAL schedule on behalf of the target BDM.
  const { canProxy } = await canProxyEntry(req, 'payroll', DEDUCTION_PROXY_OPTS);
  let bdmId = req.bdmId;
  if (canProxy) {
    const peek = await DeductionSchedule.findOne({ _id: req.params.id, entity_id: req.entityId }).select('bdm_id').lean();
    if (peek?.bdm_id) bdmId = peek.bdm_id;
  }
  const schedule = await editPendingScheduleSvc(req.params.id, bdmId, req.entityId, req.body);
  res.json({ success: true, data: schedule, message: 'Schedule updated' });
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
  financeCreateSchedule,
  withdrawSchedule,
  editPendingSchedule
};
