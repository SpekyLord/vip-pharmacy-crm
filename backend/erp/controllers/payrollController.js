const PeopleMaster = require('../models/PeopleMaster');
const Payslip = require('../models/Payslip');
const CompProfile = require('../models/CompProfile');
const { catchAsync } = require('../../middleware/errorHandler');
const {
  generateEmployeePayslip,
  generateProfessionalFeePayslip,
  computeThirteenthMonth: compute13th,
  transitionPayslipStatus,
  getPayslipBreakdown: fetchPayslipBreakdown,
  backfillDeductionLines,
  deriveFlatFromLines,
} = require('../services/payslipCalc');
const { journalFromPayroll, resolveFundingCoa } = require('../services/autoJournal');
const { createAndPostJournal } = require('../services/journalEngine');
const { syncInstallmentStatusForPayslip } = require('../services/deductionScheduleService');
const { checkPeriodOpen } = require('../utils/periodLock');
const ErpAuditLog = require('../models/ErpAuditLog');
const { notifyPayrollPosted } = require('../services/erpNotificationService');

// BDMs use Income Reports, not payroll — excluded from GENERATOR_MAP
const GENERATOR_MAP = {
  EMPLOYEE: generateEmployeePayslip,
  CONSULTANT: generateEmployeePayslip,
  DIRECTOR: generateEmployeePayslip,
};

// ═══ Compute Payroll ═══
const computePayroll = catchAsync(async (req, res) => {
  const { period, cycle = 'MONTHLY' } = req.body;
  if (!period) {
    return res.status(400).json({ success: false, message: 'Period is required (YYYY-MM)' });
  }

  const entityId = req.entityId;
  // Only include payroll-eligible person types — BDMs use Income Reports, not payroll
  const PAYROLL_PERSON_TYPES = ['EMPLOYEE', 'CONSULTANT', 'DIRECTOR'];
  const people = await PeopleMaster.find({
    entity_id: entityId,
    is_active: true,
    status: 'ACTIVE',
    person_type: { $in: PAYROLL_PERSON_TYPES }
  }).lean();

  const results = [];
  const errors = [];

  // salary_type=PROFESSIONAL_FEE takes precedence over person_type for generator
  // selection — a CONSULTANT on a flat fee uses the professional-fee generator,
  // while a CONSULTANT on FIXED_SALARY still goes through the employee path.
  for (const person of people) {
    try {
      const comp = await CompProfile.getActiveProfile(person._id);
      const generator = (comp && comp.salary_type === 'PROFESSIONAL_FEE')
        ? generateProfessionalFeePayslip
        : (GENERATOR_MAP[person.person_type] || generateEmployeePayslip);
      await generator(entityId, person._id, period, cycle, req.user._id);
      results.push({ person_id: person._id, name: person.full_name, status: 'ok' });
    } catch (err) {
      errors.push({ person_id: person._id, name: person.full_name, error: err.message });
    }
  }

  res.json({
    success: true,
    message: `Computed ${results.length} payslips, ${errors.length} errors`,
    data: { computed: results, errors },
  });
});

// ═══ Get Payroll Staging ═══
const getPayrollStaging = catchAsync(async (req, res) => {
  const filter = { entity_id: req.entityId };
  if (req.query.period) filter.period = req.query.period;
  if (req.query.cycle) filter.cycle = req.query.cycle;
  if (req.query.status) {
    filter.status = req.query.status;
  } else {
    filter.status = { $in: ['COMPUTED', 'REVIEWED', 'APPROVED'] };
  }

  // Phase 6 — hide reversed rows by default; opt-in via ?include_reversed=true.
  if (req.query.include_reversed !== 'true') {
    filter.deletion_event_id = { $exists: false };
  }

  const payslips = await Payslip.find(filter)
    .populate('person_id', 'full_name person_type department')
    .sort({ 'person_id.full_name': 1 })
    .lean();

  // Compute totals
  let totalGross = 0, totalDeductions = 0, totalNet = 0, totalEmployer = 0;
  for (const ps of payslips) {
    totalGross += ps.total_earnings || 0;
    totalDeductions += ps.total_deductions || 0;
    totalNet += ps.net_pay || 0;
    const ec = ps.employer_contributions || {};
    totalEmployer += (ec.sss_employer || 0) + (ec.philhealth_employer || 0) + (ec.pagibig_employer || 0) + (ec.ec_employer || 0);
  }

  res.json({
    success: true,
    data: payslips,
    summary: {
      count: payslips.length,
      total_gross: Math.round(totalGross * 100) / 100,
      total_deductions: Math.round(totalDeductions * 100) / 100,
      total_net: Math.round(totalNet * 100) / 100,
      total_employer: Math.round(totalEmployer * 100) / 100,
    },
  });
});

// ═══ Workflow Actions ═══
const reviewPayslip = catchAsync(async (req, res) => {
  const payslip = await transitionPayslipStatus(req.params.id, 'review', req.user._id);
  res.json({ success: true, data: payslip });
});

const approvePayslip = catchAsync(async (req, res) => {
  const payslip = await transitionPayslipStatus(req.params.id, 'approve', req.user._id);
  res.json({ success: true, data: payslip });
});

const postPayroll = catchAsync(async (req, res) => {
  const { period, cycle = 'MONTHLY' } = req.body;
  const filter = { entity_id: req.entityId, status: 'APPROVED' };
  if (period) filter.period = period;
  if (cycle) filter.cycle = cycle;

  const approved = await Payslip.find(filter);

  // Authority matrix gate
  if (approved.length) {
    const { gateApproval } = require('../services/approvalService');
    const payrollTotal = approved.reduce((sum, ps) => sum + (ps.net_pay || 0), 0);
    const gated = await gateApproval({
      entityId: req.entityId,
      module: 'PAYROLL',
      docType: 'PAYSLIP',
      docId: approved[0]._id,
      docRef: `Payroll ${period || ''} ${cycle}`.trim(),
      amount: payrollTotal,
      description: `Post ${approved.length} payslip${approved.length === 1 ? '' : 's'} (total ₱${payrollTotal.toLocaleString()})`,
      requesterId: req.user._id,
      requesterName: req.user.name || req.user.email,
    }, res);
    if (gated) return;
  }

  // Period lock check — prevent posting payroll to closed periods
  if (period) {
    const { checkPeriodOpen } = require('../utils/periodLock');
    await checkPeriodOpen(req.entityId, period);
  }

  let posted = 0;
  const errors = [];

  for (const ps of approved) {
    try {
      const postedPs = await transitionPayslipStatus(ps._id, 'post', req.user._id);
      posted++;

      // Phase 11: Auto-journal for each posted payslip
      // Phase 35 — hoisted `fullPs` out of the inner try so the catch can still
      // reference it for audit logging (previously threw ReferenceError inside
      // the catch, which was itself swallowed by `.catch(() => {})`).
      let fullPs = null;
      try {
        // eslint-disable-next-line vip-tenant/require-entity-filter -- by-key re-fetch with populates; postedPs._id originated from entity-scoped Payslip.find(filter) at L132 (filter carries entity_id)
        fullPs = await Payslip.findById(postedPs._id)
          .populate('person_id', 'full_name')
          .lean();
        const bankCoa = await resolveFundingCoa({ payment_mode: 'BANK_TRANSFER' });
        const jeData = await journalFromPayroll(
          { ...fullPs, employee_name: fullPs.person_id?.full_name || '' },
          bankCoa.coa_code, bankCoa.coa_name, req.user._id
        );
        await createAndPostJournal(fullPs.entity_id, jeData);
      } catch (jeErr) {
        console.error('[AUTO_JOURNAL_FAILURE] Payslip', String(ps._id), jeErr.message);
        ErpAuditLog.logChange({
          entity_id: fullPs?.entity_id || ps.entity_id, log_type: 'LEDGER_ERROR',
          target_ref: ps._id?.toString(), target_model: 'JournalEntry',
          field_changed: 'auto_journal', new_value: jeErr.message,
          changed_by: req.user._id,
          note: `Auto-journal failed for payslip ${fullPs?.employee_name || ps._id}`
        }).catch(() => {});
      }
    } catch (err) {
      errors.push({ payslip_id: ps._id, error: err.message });
    }
  }

  res.json({
    success: true,
    message: `Posted ${posted} payslips, ${errors.length} errors`,
    data: { posted, errors },
  });

  // Non-blocking: notify management of posted payroll
  if (posted > 0) {
    const totalNetPay = approved
      .filter(ps => ps.status === 'POSTED' || true) // all were attempted
      .reduce((sum, ps) => sum + (ps.net_pay || 0), 0);
    notifyPayrollPosted({
      entityId: req.entityId,
      period: period || 'N/A',
      cycle,
      postedCount: posted,
      totalNetPay,
      postedBy: req.user.name || req.user.email,
    }).catch(err => console.error('Payroll post notification failed:', err.message));
  }
});

// ═══ Read ═══
const getPayslip = catchAsync(async (req, res) => {
  const entityScope = req.isPresident ? {} : { entity_id: req.entityId };
  const payslip = await Payslip.findOne({ _id: req.params.id, ...entityScope })
    .populate('person_id', 'full_name person_type department position')
    .populate('reviewed_by', 'name')
    .populate('approved_by', 'name')
    .populate('posted_by', 'name')
    .lean();

  if (!payslip) {
    return res.status(404).json({ success: false, message: 'Payslip not found' });
  }

  // Phase G1.3 — lazy backfill for historical POSTED payslips that predate the
  // deduction_lines[] array. Synthesises lines from the flat fields in memory
  // (no DB write) so PayslipView.jsx can render the transparent layout for
  // every payslip regardless of vintage. Safe for all statuses.
  if (!payslip.deduction_lines || payslip.deduction_lines.length === 0) {
    payslip.deduction_lines = backfillDeductionLines(payslip);
  }

  res.json({ success: true, data: payslip });
});

// Phase G1.3 — transparent payslip breakdown. Mirrors GET /income/:id/breakdown
// so PayslipView.jsx can reuse the Income.jsx expandable pattern.
const getPayslipBreakdown = catchAsync(async (req, res) => {
  const entityScope = req.isPresident ? {} : { entity_id: req.entityId };
  const payslip = await Payslip.findOne({ _id: req.params.id, ...entityScope })
    .populate('person_id', 'full_name person_type department')
    .lean();

  if (!payslip) {
    return res.status(404).json({ success: false, message: 'Payslip not found' });
  }

  const breakdown = await fetchPayslipBreakdown(payslip);
  res.json({ success: true, data: breakdown });
});

const getPayslipHistory = catchAsync(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;

  const filter = { person_id: req.params.personId };
  if (req.query.year) filter.period = { $regex: `^${req.query.year}-` };

  const [payslips, total] = await Promise.all([
    Payslip.find(filter)
      .sort({ period: -1, cycle: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Payslip.countDocuments(filter),
  ]);

  res.json({
    success: true,
    data: payslips,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});

// ═══ 13th Month ═══
const computeThirteenthMonth = catchAsync(async (req, res) => {
  const { year } = req.body;
  if (!year) {
    return res.status(400).json({ success: false, message: 'Year is required' });
  }

  const people = await PeopleMaster.find({ entity_id: req.entityId, is_active: true }).lean();
  const results = [];
  const errors = [];

  for (const person of people) {
    try {
      const ps = await compute13th(req.entityId, person._id, year, req.user._id);
      results.push({ person_id: person._id, name: person.full_name, thirteenth_month: ps.earnings?.thirteenth_month || 0 });
    } catch (err) {
      errors.push({ person_id: person._id, name: person.full_name, error: err.message });
    }
  }

  res.json({
    success: true,
    message: `Computed 13th month for ${results.length} people`,
    data: { results, errors },
  });
});

// ═══════════════════════════════════════════
// PHASE G1.4 — FINANCE PER-LINE DEDUCTION CRUD
// ═══════════════════════════════════════════
//
// Mirrors the contractor IncomeReport endpoints (incomeController.addDeductionLine /
// verifyDeductionLine / financeAddDeductionLine / removeDeductionLine) so that
// Finance has identical per-line tools on employee payslips:
//
//   POST /payroll/:id/deduction-line              → financeAddDeductionLine
//   POST /payroll/:id/deduction-line/:lineId/verify → verifyDeductionLine (verify/correct/reject)
//   DELETE /payroll/:id/deduction-line/:lineId    → removeDeductionLine (non-auto only)
//
// Guardrails (all three endpoints):
//   • Status must be COMPUTED or REVIEWED (cannot mutate APPROVED/POSTED — those go
//     through presidentReversePayslip instead).
//   • `checkPeriodOpen()` blocks mutations to closed periods (Rule #20 period lock).
//   • `deriveFlatFromLines()` runs on every mutation so the flat `deductions.*` fields
//     (consumed by autoJournal.journalFromPayroll) stay in sync. Protects the JE.
//   • SCHEDULE-sourced line corrections cascade to DeductionSchedule.installments
//     via syncInstallmentStatusForPayslip — same contract as the contractor path.
//
// Role: admin | finance | president (applied at the route layer).

// Finance adds a manual line that the auto-compute missed (e.g., HMO co-pay,
// uniform cost, one-off correction). Line is created status=VERIFIED — Finance
// is the authoritative entry path for employee payslip deductions; there's no
// BDM self-service equivalent for employees.
const financeAddDeductionLine = catchAsync(async (req, res) => {
  const { deduction_type, deduction_label, amount, description, finance_note } = req.body;

  if (!deduction_type || !deduction_label || amount === undefined) {
    return res.status(400).json({
      success: false,
      message: 'deduction_type, deduction_label, and amount are required'
    });
  }
  if (typeof amount !== 'number' || amount < 0) {
    return res.status(400).json({ success: false, message: 'amount must be a non-negative number' });
  }

  const entityScope = req.isPresident ? {} : { entity_id: req.entityId };
  const payslip = await Payslip.findOne({
    _id: req.params.id,
    ...entityScope,
    status: { $in: ['COMPUTED', 'REVIEWED'] }
  });

  if (!payslip) {
    return res.status(404).json({
      success: false,
      message: 'Payslip not found or not in editable status (must be COMPUTED or REVIEWED)'
    });
  }

  await checkPeriodOpen(payslip.entity_id, payslip.period);

  payslip.deduction_lines.push({
    deduction_type,
    deduction_label,
    amount: Math.round(amount * 100) / 100,
    description: description || '',
    entered_by: req.user._id,
    entered_at: new Date(),
    status: 'VERIFIED',
    verified_by: req.user._id,
    verified_at: new Date(),
    finance_note: finance_note || 'Added by Finance',
    auto_source: null,
  });

  // Keep flat fields in sync with the lines so the JE consumer stays correct.
  payslip.deductions = deriveFlatFromLines(payslip.deduction_lines);
  payslip.markModified('deduction_lines');
  payslip.markModified('deductions');
  await payslip.save();

  // eslint-disable-next-line vip-tenant/require-entity-filter -- by-key re-fetch with populates; payslip._id from entity-scoped findOne above (L350)
  const updated = await Payslip.findById(payslip._id)
    .populate('person_id', 'full_name person_type department')
    .populate('deduction_lines.entered_by', 'name')
    .populate('deduction_lines.verified_by', 'name')
    .lean();

  res.status(201).json({ success: true, data: updated });
});

// Finance verifies, corrects, or rejects an existing deduction line.
// SCHEDULE-sourced lines additionally sync the upstream installment status
// so the DeductionSchedule's audit trail reflects Finance's decision.
const verifyDeductionLine = catchAsync(async (req, res) => {
  const { lineId } = req.params;
  const { action, amount, finance_note } = req.body;

  if (!['verify', 'correct', 'reject'].includes(action)) {
    return res.status(400).json({ success: false, message: 'action must be verify, correct, or reject' });
  }

  const entityScope = req.isPresident ? {} : { entity_id: req.entityId };
  const payslip = await Payslip.findOne({
    _id: req.params.id,
    ...entityScope,
    status: { $in: ['COMPUTED', 'REVIEWED'] }
  });

  if (!payslip) {
    return res.status(404).json({
      success: false,
      message: 'Payslip not found or not in editable status (must be COMPUTED or REVIEWED)'
    });
  }

  await checkPeriodOpen(payslip.entity_id, payslip.period);

  const line = payslip.deduction_lines.id(lineId);
  if (!line) {
    return res.status(404).json({ success: false, message: 'Deduction line not found' });
  }

  switch (action) {
    case 'verify':
      line.status = 'VERIFIED';
      line.verified_by = req.user._id;
      line.verified_at = new Date();
      if (finance_note) line.finance_note = finance_note;
      break;
    case 'correct':
      if (amount === undefined || typeof amount !== 'number' || amount < 0) {
        return res.status(400).json({ success: false, message: 'Corrected amount is required and must be non-negative' });
      }
      line.original_amount = line.amount;
      line.amount = Math.round(amount * 100) / 100;
      line.status = 'CORRECTED';
      line.verified_by = req.user._id;
      line.verified_at = new Date();
      line.finance_note = finance_note || '';
      break;
    case 'reject':
      line.status = 'REJECTED';
      line.verified_by = req.user._id;
      line.verified_at = new Date();
      line.finance_note = finance_note || 'Rejected by Finance';
      break;
  }

  payslip.deductions = deriveFlatFromLines(payslip.deduction_lines);
  payslip.markModified('deduction_lines');
  payslip.markModified('deductions');
  await payslip.save();

  // Cascade SCHEDULE-sourced decisions to the DeductionSchedule installment
  // so the audit trail stays coherent (incomeController does the same on
  // the contractor side). Non-blocking — ledger integrity is already safe.
  if (line.auto_source === 'SCHEDULE' && line.schedule_ref?.schedule_id) {
    try {
      const newInstStatus = action === 'reject' ? 'CANCELLED' : 'VERIFIED';
      await syncInstallmentStatusForPayslip(
        line.schedule_ref.schedule_id,
        line.schedule_ref.installment_id,
        newInstStatus,
        payslip._id,
        line._id
      );
    } catch (syncErr) {
      console.error('Payslip schedule sync error (non-blocking):', syncErr.message);
    }
  }

  // eslint-disable-next-line vip-tenant/require-entity-filter -- by-key re-fetch with populates; payslip._id from entity-scoped findOne above (L406)
  const updated = await Payslip.findById(payslip._id)
    .populate('person_id', 'full_name person_type department')
    .populate('deduction_lines.entered_by', 'name')
    .populate('deduction_lines.verified_by', 'name')
    .lean();

  res.json({ success: true, data: updated });
});

// Finance removes a manual line (auto_source=null). Auto-generated lines
// (statutory, Personal Gas, SCHEDULE) cannot be removed — they rebuild on the
// next compute, so removing them is a reject action, not a delete.
const removeDeductionLine = catchAsync(async (req, res) => {
  const { lineId } = req.params;

  const entityScope = req.isPresident ? {} : { entity_id: req.entityId };
  const payslip = await Payslip.findOne({
    _id: req.params.id,
    ...entityScope,
    status: { $in: ['COMPUTED', 'REVIEWED'] }
  });

  if (!payslip) {
    return res.status(404).json({
      success: false,
      message: 'Payslip not found or not in editable status (must be COMPUTED or REVIEWED)'
    });
  }

  await checkPeriodOpen(payslip.entity_id, payslip.period);

  const line = payslip.deduction_lines.id(lineId);
  if (!line) {
    return res.status(404).json({ success: false, message: 'Deduction line not found' });
  }
  if (line.auto_source) {
    return res.status(400).json({
      success: false,
      message: `Cannot remove auto-generated lines (${line.auto_source}). Use the Reject action to exclude this line from the payslip.`
    });
  }

  payslip.deduction_lines.pull(lineId);
  payslip.deductions = deriveFlatFromLines(payslip.deduction_lines);
  payslip.markModified('deduction_lines');
  payslip.markModified('deductions');
  await payslip.save();

  // eslint-disable-next-line vip-tenant/require-entity-filter -- by-key re-fetch with populates; payslip._id from entity-scoped findOne above (L491)
  const updated = await Payslip.findById(payslip._id)
    .populate('person_id', 'full_name person_type department')
    .populate('deduction_lines.entered_by', 'name')
    .populate('deduction_lines.verified_by', 'name')
    .lean();

  res.json({ success: true, data: updated });
});

// President-only: SAP Storno reversal for a POSTED Payslip. Reverses the linked
// payroll JE (basic/allowances/SSS/PH/Pag-IBIG/WHT). Older payslips without
// event_id fall back to JE lookup by source_module='PAYROLL' + period match.
const { buildPresidentReverseHandler } = require('../services/documentReversalService');
const presidentReversePayslip = buildPresidentReverseHandler('PAYSLIP');

module.exports = {
  computePayroll,
  getPayrollStaging,
  reviewPayslip,
  approvePayslip,
  postPayroll,
  getPayslip,
  getPayslipBreakdown,
  presidentReversePayslip,
  getPayslipHistory,
  computeThirteenthMonth,
  // Phase G1.4 — Finance per-line deduction CRUD
  financeAddDeductionLine,
  verifyDeductionLine,
  removeDeductionLine,
};
