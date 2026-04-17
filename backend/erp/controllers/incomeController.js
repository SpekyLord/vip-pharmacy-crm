/**
 * Income Controller — Income Reports, PNL, Profit Sharing, Archive & Year-End Close
 *
 * All endpoints use catchAsync, req.tenantFilter, req.entityId, req.bdmId
 * following the same patterns as expenseController.js
 *
 * Deduction lines: BDM enters via addDeductionLine / removeDeductionLine
 * Finance verifies via verifyDeductionLine (verify / correct / reject)
 */
const mongoose = require('mongoose');
const IncomeReport = require('../models/IncomeReport');
const PnlReport = require('../models/PnlReport');
const MonthlyArchive = require('../models/MonthlyArchive');
const { catchAsync } = require('../../middleware/errorHandler');
const { generateIncomeReport, projectIncome, transitionIncomeStatus, getIncomeBreakdown: fetchIncomeBreakdown } = require('../services/incomeCalc');
const {
  generatePnlReport, validateYearEndClose, executeYearEndClose, getFiscalYearStatus
} = require('../services/pnlCalc');
const { evaluateEligibility } = require('../services/profitShareEngine');
const { syncInstallmentStatus } = require('../services/deductionScheduleService');

// ═══════════════════════════════════════════
// INCOME REPORT ENDPOINTS
// ═══════════════════════════════════════════

const generateIncome = catchAsync(async (req, res) => {
  const { bdm_id, period, cycle } = req.body;
  if (!bdm_id || !period || !cycle) {
    return res.status(400).json({ success: false, message: 'bdm_id, period, and cycle are required' });
  }
  // BDMs can only generate for themselves; admin/finance/president can generate for any BDM in their entity
  const canViewOther = req.isAdmin || req.isFinance || req.isPresident;
  if (!canViewOther && bdm_id !== req.bdmId?.toString()) {
    return res.status(403).json({ success: false, message: 'Cannot generate income report for another BDM' });
  }
  const report = await generateIncomeReport(req.entityId, bdm_id, period, cycle, req.user._id);
  res.status(201).json({ success: true, data: report });
});

const getIncomeProjection = catchAsync(async (req, res) => {
  const { period, cycle } = req.query;
  if (!period || !cycle) {
    return res.status(400).json({ success: false, message: 'period and cycle are required' });
  }
  const canViewOther = req.isAdmin || req.isFinance || req.isPresident;
  const bdmId = (canViewOther && req.query.bdm_id) ? req.query.bdm_id : req.bdmId;
  if (!bdmId) {
    return res.status(400).json({ success: false, message: 'bdm_id is required' });
  }
  const projection = await projectIncome(req.entityId, bdmId, period, cycle);
  res.json({ success: true, data: projection });
});

const requestIncomeGeneration = catchAsync(async (req, res) => {
  const { period, cycle } = req.body;
  if (!period || !cycle) {
    return res.status(400).json({ success: false, message: 'period and cycle are required' });
  }
  if (!req.bdmId) {
    return res.status(400).json({ success: false, message: 'No BDM profile linked to this user' });
  }

  // Check if report already exists and is past BDM-editable status
  const existing = await IncomeReport.findOne({
    entity_id: req.entityId, bdm_id: req.bdmId, period, cycle
  }).lean();

  if (existing && ['BDM_CONFIRMED', 'CREDITED'].includes(existing.status)) {
    return res.status(400).json({
      success: false,
      message: `Cannot regenerate \u2014 payslip is ${existing.status}. Use Income Projection to see updated numbers.`
    });
  }

  // BDM can generate/regenerate when: no report, GENERATED, RETURNED, or REVIEWED
  const report = await generateIncomeReport(req.entityId, req.bdmId, period, cycle, req.user._id);
  res.status(201).json({ success: true, data: report });
});

const getIncomeList = catchAsync(async (req, res) => {
  const filter = { ...req.tenantFilter };
  // BDMs only see their own income reports
  const canViewOther = req.isAdmin || req.isFinance || req.isPresident;
  if (req.query.bdm_id && canViewOther) filter.bdm_id = req.query.bdm_id;
  else if (!canViewOther && req.bdmId) filter.bdm_id = req.bdmId;
  if (req.query.period) filter.period = req.query.period;
  if (req.query.cycle) filter.cycle = req.query.cycle;
  if (req.query.status) filter.status = req.query.status;

  const reports = await IncomeReport.find(filter)
    .populate('bdm_id', 'name email')
    .sort({ period: -1, cycle: -1 })
    .lean();
  res.json({ success: true, data: reports });
});

const getIncomeById = catchAsync(async (req, res) => {
  const report = await IncomeReport.findOne({ _id: req.params.id, ...req.tenantFilter })
    .populate('bdm_id', 'name email')
    .populate('reviewed_by', 'name')
    .populate('credited_by', 'name')
    .populate('deduction_lines.entered_by', 'name')
    .populate('deduction_lines.verified_by', 'name');
  if (!report) return res.status(404).json({ success: false, message: 'Income report not found' });
  res.json({ success: true, data: report });
});

const getIncomeBreakdown = catchAsync(async (req, res) => {
  const report = await IncomeReport.findOne({ _id: req.params.id, ...req.tenantFilter })
    .populate('bdm_id', 'name email')
    .lean();
  if (!report) {
    return res.status(404).json({ success: false, message: 'Income report not found' });
  }
  // BDM can only see their own breakdown
  const canViewOther = req.isAdmin || req.isFinance || req.isPresident;
  if (!canViewOther && report.bdm_id?._id?.toString() !== req.bdmId?.toString()) {
    return res.status(403).json({ success: false, message: 'Cannot view breakdown for another BDM' });
  }
  const breakdown = await fetchIncomeBreakdown(report);
  res.json({ success: true, data: breakdown });
});

const updateIncomeManual = catchAsync(async (req, res) => {
  const report = await IncomeReport.findOne({
    _id: req.params.id, ...req.tenantFilter,
    status: { $in: ['GENERATED', 'REVIEWED'] }
  });
  if (!report) {
    return res.status(404).json({ success: false, message: 'Editable income report not found' });
  }

  // Only allow updating manual fields
  const { earnings, deductions, notes } = req.body;
  if (earnings) {
    if (earnings.bonus !== undefined) report.earnings.bonus = earnings.bonus;
    if (earnings.reimbursements !== undefined) report.earnings.reimbursements = earnings.reimbursements;
  }
  if (deductions) {
    const allowed = ['credit_card_payment', 'credit_payment', 'purchased_goods', 'other_deductions', 'over_payment'];
    for (const field of allowed) {
      if (deductions[field] !== undefined) report.deductions[field] = deductions[field];
    }
  }
  if (notes !== undefined) report.notes = notes;

  await report.save(); // pre-save recomputes totals
  res.json({ success: true, data: report });
});

// ═══════════════════════════════════════════
// BDM DEDUCTION LINE ENDPOINTS
// ═══════════════════════════════════════════

/**
 * BDM adds a deduction line to their own income report.
 * Only when status is GENERATED (report exists, BDM can enter deductions before Finance reviews).
 */
const addDeductionLine = catchAsync(async (req, res) => {
  const { deduction_type, deduction_label, amount, description } = req.body;

  if (!deduction_type || !deduction_label || amount === undefined) {
    return res.status(400).json({
      success: false,
      message: 'deduction_type, deduction_label, and amount are required'
    });
  }
  if (deduction_type === 'CASH_ADVANCE') {
    return res.status(400).json({ success: false, message: 'CASH_ADVANCE is auto-computed from CALF — cannot be entered manually' });
  }
  if (typeof amount !== 'number' || amount < 0) {
    return res.status(400).json({ success: false, message: 'amount must be a non-negative number' });
  }

  const report = await IncomeReport.findOne({
    _id: req.params.id,
    entity_id: req.entityId,
    bdm_id: req.bdmId,
    status: 'GENERATED'
  });

  if (!report) {
    return res.status(404).json({
      success: false,
      message: 'Income report not found, not yours, or not in GENERATED status'
    });
  }

  report.deduction_lines.push({
    deduction_type,
    deduction_label,
    amount: Math.round(amount * 100) / 100,
    description: description || '',
    entered_by: req.user._id,
    entered_at: new Date(),
    status: 'PENDING',
    auto_source: null
  });

  await report.save();

  // Re-fetch with populates
  const updated = await IncomeReport.findById(report._id)
    .populate('bdm_id', 'name email')
    .populate('deduction_lines.entered_by', 'name')
    .populate('deduction_lines.verified_by', 'name');

  res.status(201).json({ success: true, data: updated });
});

/**
 * BDM removes a PENDING deduction line they entered.
 * Only their own lines, only PENDING status, only when report is GENERATED.
 */
const removeDeductionLine = catchAsync(async (req, res) => {
  const { lineId } = req.params;

  const report = await IncomeReport.findOne({
    _id: req.params.id,
    entity_id: req.entityId,
    bdm_id: req.bdmId,
    status: 'GENERATED'
  });

  if (!report) {
    return res.status(404).json({
      success: false,
      message: 'Income report not found, not yours, or not in GENERATED status'
    });
  }

  const line = report.deduction_lines.id(lineId);
  if (!line) {
    return res.status(404).json({ success: false, message: 'Deduction line not found' });
  }
  if (line.auto_source) {
    return res.status(400).json({ success: false, message: 'Cannot remove auto-generated deduction lines' });
  }
  if (line.status !== 'PENDING') {
    return res.status(400).json({ success: false, message: 'Can only remove PENDING deduction lines' });
  }
  if (line.entered_by?.toString() !== req.user._id.toString()) {
    return res.status(403).json({ success: false, message: 'Can only remove your own deduction lines' });
  }

  report.deduction_lines.pull(lineId);
  await report.save();

  const updated = await IncomeReport.findById(report._id)
    .populate('bdm_id', 'name email')
    .populate('deduction_lines.entered_by', 'name')
    .populate('deduction_lines.verified_by', 'name');

  res.json({ success: true, data: updated });
});

// ═══════════════════════════════════════════
// FINANCE DEDUCTION VERIFICATION ENDPOINTS
// ═══════════════════════════════════════════

/**
 * Finance verifies, corrects, or rejects a deduction line.
 * Actions: verify (accept as-is), correct (change amount + note), reject (with reason)
 */
const verifyDeductionLine = catchAsync(async (req, res) => {
  const { lineId } = req.params;
  const { action, amount, finance_note } = req.body;

  if (!['verify', 'correct', 'reject'].includes(action)) {
    return res.status(400).json({ success: false, message: 'action must be verify, correct, or reject' });
  }

  const report = await IncomeReport.findOne({
    _id: req.params.id,
    entity_id: req.entityId,
    status: { $in: ['GENERATED', 'REVIEWED'] }
  });

  if (!report) {
    return res.status(404).json({
      success: false,
      message: 'Income report not found or not in editable status'
    });
  }

  const line = report.deduction_lines.id(lineId);
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

  await report.save();

  // Sync schedule installment status if this is a schedule-sourced line
  if (line.auto_source === 'SCHEDULE' && line.schedule_ref?.schedule_id) {
    try {
      const newInstStatus = action === 'reject' ? 'CANCELLED' : 'VERIFIED';
      await syncInstallmentStatus(
        line.schedule_ref.schedule_id,
        line.schedule_ref.installment_id,
        newInstStatus,
        report._id,
        line._id
      );
    } catch (syncErr) {
      console.error('Schedule sync error (non-blocking):', syncErr.message);
    }
  }

  const updated = await IncomeReport.findById(report._id)
    .populate('bdm_id', 'name email')
    .populate('deduction_lines.entered_by', 'name')
    .populate('deduction_lines.verified_by', 'name');

  res.json({ success: true, data: updated });
});

/**
 * Finance adds a deduction line that BDM missed.
 * Finance can add at GENERATED or REVIEWED status.
 */
const financeAddDeductionLine = catchAsync(async (req, res) => {
  const { deduction_type, deduction_label, amount, description, finance_note } = req.body;

  if (!deduction_type || !deduction_label || amount === undefined) {
    return res.status(400).json({
      success: false,
      message: 'deduction_type, deduction_label, and amount are required'
    });
  }

  const report = await IncomeReport.findOne({
    _id: req.params.id,
    entity_id: req.entityId,
    status: { $in: ['GENERATED', 'REVIEWED'] }
  });

  if (!report) {
    return res.status(404).json({
      success: false,
      message: 'Income report not found or not in editable status'
    });
  }

  report.deduction_lines.push({
    deduction_type,
    deduction_label,
    amount: Math.round(amount * 100) / 100,
    description: description || '',
    entered_by: req.user._id,
    entered_at: new Date(),
    status: 'VERIFIED',
    finance_note: finance_note || 'Added by Finance',
    verified_by: req.user._id,
    verified_at: new Date(),
    auto_source: null
  });

  await report.save();

  const updated = await IncomeReport.findById(report._id)
    .populate('bdm_id', 'name email')
    .populate('deduction_lines.entered_by', 'name')
    .populate('deduction_lines.verified_by', 'name');

  res.status(201).json({ success: true, data: updated });
});

// ═══════════════════════════════════════════
// WORKFLOW ENDPOINTS
// ═══════════════════════════════════════════

const reviewIncome = catchAsync(async (req, res) => {
  const report = await transitionIncomeStatus(req.params.id, 'review', req.user._id);
  res.json({ success: true, data: report });
});

const returnIncome = catchAsync(async (req, res) => {
  const report = await transitionIncomeStatus(req.params.id, 'return', req.user._id, {
    reason: req.body.reason
  });
  res.json({ success: true, data: report });
});

const confirmIncome = catchAsync(async (req, res) => {
  // BDM can only confirm their own report
  const report = await IncomeReport.findById(req.params.id);
  if (!report) return res.status(404).json({ success: false, message: 'Income report not found' });

  if (report.bdm_id.toString() !== req.bdmId?.toString() && req.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Can only confirm your own income report' });
  }

  const updated = await transitionIncomeStatus(req.params.id, 'confirm', req.user._id);
  res.json({ success: true, data: updated });
});

const creditIncome = catchAsync(async (req, res) => {
  const report = await transitionIncomeStatus(req.params.id, 'credit', req.user._id);

  // Sync all SCHEDULE deduction lines' installments to POSTED
  const fullReport = await IncomeReport.findById(req.params.id);
  if (fullReport) {
    const scheduleLines = (fullReport.deduction_lines || []).filter(
      l => l.auto_source === 'SCHEDULE' && l.schedule_ref?.schedule_id
    );
    for (const line of scheduleLines) {
      try {
        await syncInstallmentStatus(
          line.schedule_ref.schedule_id,
          line.schedule_ref.installment_id,
          'POSTED',
          fullReport._id,
          line._id
        );
      } catch (syncErr) {
        console.error('Schedule credit sync error (non-blocking):', syncErr.message);
      }
    }
  }

  res.json({ success: true, data: report });
});

// ═══════════════════════════════════════════
// PNL REPORT ENDPOINTS
// ═══════════════════════════════════════════

const generatePnl = catchAsync(async (req, res) => {
  const { bdm_id, period } = req.body;
  if (!bdm_id || !period) {
    return res.status(400).json({ success: false, message: 'bdm_id and period are required' });
  }
  const report = await generatePnlReport(req.entityId, bdm_id, period, req.user._id);
  res.status(201).json({ success: true, data: report });
});

const getPnlList = catchAsync(async (req, res) => {
  const filter = { ...req.tenantFilter };
  if (req.query.bdm_id) filter.bdm_id = req.query.bdm_id;
  if (req.query.period) filter.period = req.query.period;
  if (req.query.status) filter.status = req.query.status;

  const reports = await PnlReport.find(filter)
    .populate('bdm_id', 'name email')
    .sort({ period: -1 })
    .lean();
  res.json({ success: true, data: reports });
});

const getPnlById = catchAsync(async (req, res) => {
  const report = await PnlReport.findOne({ _id: req.params.id, ...req.tenantFilter })
    .populate('bdm_id', 'name email')
    .populate('posted_by', 'name');
  if (!report) return res.status(404).json({ success: false, message: 'PNL report not found' });
  res.json({ success: true, data: report });
});

const updatePnlManual = catchAsync(async (req, res) => {
  const report = await PnlReport.findOne({
    _id: req.params.id, ...req.tenantFilter,
    status: { $in: ['GENERATED', 'REVIEWED'] },
    locked: { $ne: true }
  });
  if (!report) {
    return res.status(404).json({ success: false, message: 'Editable PNL report not found' });
  }

  // Only allow updating manual fields
  const { expenses } = req.body;
  if (expenses) {
    if (expenses.depreciation !== undefined) report.expenses.depreciation = expenses.depreciation;
    if (expenses.loan_amortization !== undefined) report.expenses.loan_amortization = expenses.loan_amortization;
  }

  await report.save(); // pre-save recomputes totals
  res.json({ success: true, data: report });
});

const postPnl = catchAsync(async (req, res) => {
  const report = await PnlReport.findOne({
    _id: req.params.id, ...req.tenantFilter,
    locked: { $ne: true }
  });
  if (!report) {
    return res.status(404).json({ success: false, message: 'PNL report not found or locked' });
  }
  if (!['GENERATED', 'REVIEWED'].includes(report.status)) {
    return res.status(400).json({ success: false, message: `Cannot post from status ${report.status}` });
  }

  // Period lock check
  const { checkPeriodOpen } = require('../utils/periodLock');
  if (report.period) await checkPeriodOpen(req.entityId, report.period);

  // Authority matrix gate
  const { gateApproval } = require('../services/approvalService');
  const gated = await gateApproval({
    entityId: req.entityId,
    module: 'INCOME',
    docType: 'PNL_REPORT',
    docId: report._id,
    docRef: `PNL ${report.period || ''}`.trim(),
    amount: report.net_income || 0,
    description: `PNL report for ${report.period || 'unknown period'}`,
    requesterId: req.user._id,
    requesterName: req.user.name || req.user.email,
  }, res);
  if (gated) return;

  report.status = 'POSTED';
  report.posted_at = new Date();
  report.posted_by = req.user._id;
  await report.save();
  res.json({ success: true, data: report });
});

// ═══════════════════════════════════════════
// PROFIT SHARING ENDPOINTS
// ═══════════════════════════════════════════

const getProfitShareStatus = catchAsync(async (req, res) => {
  const { bdm_id, period } = req.query;
  if (!period) {
    return res.status(400).json({ success: false, message: 'period is required' });
  }

  const targetBdmId = bdm_id || req.bdmId;
  if (!targetBdmId) {
    return res.status(400).json({ success: false, message: 'bdm_id is required' });
  }

  // Try to get from existing PNL report first
  const pnl = await PnlReport.findOne({
    entity_id: req.entityId, bdm_id: targetBdmId, period
  }).lean();

  if (pnl?.profit_sharing) {
    return res.json({ success: true, data: pnl.profit_sharing, source: 'pnl_report' });
  }

  // Compute on-the-fly
  const result = await evaluateEligibility(req.entityId, targetBdmId, period);
  res.json({ success: true, data: result, source: 'computed' });
});

const getProfitShareDetail = catchAsync(async (req, res) => {
  const { period, bdm_id } = req.query;
  if (!period) {
    return res.status(400).json({ success: false, message: 'period is required' });
  }

  const targetBdmId = bdm_id || req.bdmId;
  const pnl = await PnlReport.findOne({
    entity_id: req.entityId, bdm_id: targetBdmId, period
  }).lean();

  const product = pnl?.profit_sharing?.ps_products?.find(
    p => p.product_id?.toString() === req.params.productId
  );

  if (!product) {
    return res.status(404).json({ success: false, message: 'Product not found in profit sharing data' });
  }

  res.json({ success: true, data: product });
});

// ═══════════════════════════════════════════
// MONTHLY ARCHIVE / PERIOD CONTROL
// ═══════════════════════════════════════════

const closePeriod = catchAsync(async (req, res) => {
  const { period } = req.body;
  if (!period) {
    return res.status(400).json({ success: false, message: 'period is required' });
  }

  // Verify all PNL reports for this period exist and are POSTED
  const pnlReports = await PnlReport.find({
    entity_id: req.entityId, period
  }).lean();

  const unposted = pnlReports.filter(p => p.status !== 'POSTED' && p.status !== 'LOCKED');
  if (unposted.length > 0) {
    return res.status(400).json({
      success: false,
      message: `${unposted.length} PNL report(s) not yet POSTED for period ${period}`,
      data: { unposted_count: unposted.length }
    });
  }

  // Aggregate snapshot data from PNL reports
  const snapshot = {
    total_sales: 0, total_collections: 0, total_cogs: 0,
    total_expenses: 0, total_net_income: 0, bdm_summaries: []
  };

  for (const pnl of pnlReports) {
    snapshot.total_sales += pnl.revenue?.gross_sales || 0;
    snapshot.total_collections += pnl.revenue?.collections_net_of_vat || 0;
    snapshot.total_cogs += pnl.cogs?.total_cogs || 0;
    snapshot.total_expenses += pnl.total_expenses || 0;
    snapshot.total_net_income += pnl.net_income || 0;
    snapshot.bdm_summaries.push({
      bdm_id: pnl.bdm_id,
      sales: pnl.revenue?.gross_sales || 0,
      collections: pnl.revenue?.collections_net_of_vat || 0,
      cogs: pnl.cogs?.total_cogs || 0,
      expenses: pnl.total_expenses || 0,
      net_income: pnl.net_income || 0,
      commission: 0, // available from income reports
      profit_sharing: pnl.profit_sharing?.bdm_share || 0
    });
  }

  // Round snapshot totals
  for (const key of ['total_sales', 'total_collections', 'total_cogs', 'total_expenses', 'total_net_income']) {
    snapshot[key] = Math.round(snapshot[key] * 100) / 100;
  }

  const archive = await MonthlyArchive.findOneAndUpdate(
    { entity_id: req.entityId, period, record_type: 'MONTHLY' },
    {
      entity_id: req.entityId,
      period,
      record_type: 'MONTHLY',
      period_status: 'CLOSED',
      closed_at: new Date(),
      closed_by: req.user._id,
      snapshot,
      created_by: req.user._id
    },
    { upsert: true, new: true }
  );

  res.json({ success: true, data: archive, message: `Period ${period} closed successfully` });
});

const getPeriodStatus = catchAsync(async (req, res) => {
  const { period } = req.query;
  if (!period) {
    return res.status(400).json({ success: false, message: 'period is required' });
  }

  const archive = await MonthlyArchive.findOne({
    entity_id: req.entityId, period, record_type: 'MONTHLY'
  }).lean();

  res.json({
    success: true,
    data: {
      period,
      status: archive?.period_status || 'OPEN',
      closed_at: archive?.closed_at || null,
      closed_by: archive?.closed_by || null
    }
  });
});

const reopenPeriod = catchAsync(async (req, res) => {
  const { period } = req.body;
  if (!period) {
    return res.status(400).json({ success: false, message: 'period is required' });
  }

  const archive = await MonthlyArchive.findOne({
    entity_id: req.entityId, period, record_type: 'MONTHLY'
  });

  if (!archive) {
    return res.status(404).json({ success: false, message: `No archive found for period ${period}` });
  }

  if (archive.period_status === 'LOCKED') {
    return res.status(400).json({
      success: false,
      message: `Period ${period} is LOCKED by year-end close. Cannot re-open.`
    });
  }

  if (archive.period_status === 'OPEN') {
    return res.json({ success: true, data: archive, message: `Period ${period} is already OPEN` });
  }

  archive.period_status = 'OPEN';
  archive.closed_at = undefined;
  archive.closed_by = undefined;
  await archive.save();

  res.json({ success: true, data: archive, message: `Period ${period} re-opened successfully` });
});

const getArchiveList = catchAsync(async (req, res) => {
  const filter = { entity_id: req.entityId };
  if (req.query.record_type) filter.record_type = req.query.record_type;
  if (req.query.fiscal_year) filter.fiscal_year = parseInt(req.query.fiscal_year);

  const archives = await MonthlyArchive.find(filter)
    .populate('closed_by', 'name')
    .populate('fy_closed_by', 'name')
    .sort({ period: -1 })
    .lean();
  res.json({ success: true, data: archives });
});

// ═══════════════════════════════════════════
// YEAR-END CLOSE ENDPOINTS
// ═══════════════════════════════════════════

const validateYearEnd = catchAsync(async (req, res) => {
  const fiscalYear = parseInt(req.query.fiscal_year);
  if (!fiscalYear) {
    return res.status(400).json({ success: false, message: 'fiscal_year is required' });
  }
  const result = await validateYearEndClose(req.entityId, fiscalYear);
  res.json({ success: true, data: result });
});

const executeYearEnd = catchAsync(async (req, res) => {
  const { fiscal_year } = req.body;
  if (!fiscal_year) {
    return res.status(400).json({ success: false, message: 'fiscal_year is required' });
  }

  const archive = await executeYearEndClose(req.entityId, parseInt(fiscal_year), req.user._id);
  res.json({
    success: true,
    data: archive,
    message: `Fiscal year ${fiscal_year} closed successfully`
  });
});

const getFiscalYearStatusEndpoint = catchAsync(async (req, res) => {
  const fiscalYear = parseInt(req.query.fiscal_year);
  if (!fiscalYear) {
    return res.status(400).json({ success: false, message: 'fiscal_year is required' });
  }
  const result = await getFiscalYearStatus(req.entityId, fiscalYear);
  res.json({ success: true, data: result });
});

module.exports = {
  // Income
  generateIncome, getIncomeProjection, requestIncomeGeneration,
  getIncomeList, getIncomeById, getIncomeBreakdown, updateIncomeManual,
  reviewIncome, returnIncome, confirmIncome, creditIncome,
  // BDM Deduction Lines
  addDeductionLine, removeDeductionLine,
  // Finance Deduction Verification
  verifyDeductionLine, financeAddDeductionLine,
  // PNL
  generatePnl, getPnlList, getPnlById, updatePnlManual, postPnl,
  // Profit Sharing
  getProfitShareStatus, getProfitShareDetail,
  // Archive
  closePeriod, reopenPeriod, getPeriodStatus, getArchiveList,
  // Year-End
  validateYearEnd, executeYearEnd,
  getFiscalYearStatus: getFiscalYearStatusEndpoint
};
