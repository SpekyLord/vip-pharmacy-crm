/**
 * Income Controller — Income Reports, PNL, Profit Sharing, Archive & Year-End Close
 *
 * All endpoints use catchAsync, req.tenantFilter, req.entityId, req.bdmId
 * following the same patterns as expenseController.js
 */
const mongoose = require('mongoose');
const IncomeReport = require('../models/IncomeReport');
const PnlReport = require('../models/PnlReport');
const MonthlyArchive = require('../models/MonthlyArchive');
const { catchAsync } = require('../../middleware/errorHandler');
const { generateIncomeReport, transitionIncomeStatus } = require('../services/incomeCalc');
const {
  generatePnlReport, validateYearEndClose, executeYearEndClose, getFiscalYearStatus
} = require('../services/pnlCalc');
const { evaluateEligibility } = require('../services/profitShareEngine');

// ═══════════════════════════════════════════
// INCOME REPORT ENDPOINTS
// ═══════════════════════════════════════════

const generateIncome = catchAsync(async (req, res) => {
  const { bdm_id, period, cycle } = req.body;
  if (!bdm_id || !period || !cycle) {
    return res.status(400).json({ success: false, message: 'bdm_id, period, and cycle are required' });
  }
  const report = await generateIncomeReport(req.entityId, bdm_id, period, cycle, req.user._id);
  res.status(201).json({ success: true, data: report });
});

const getIncomeList = catchAsync(async (req, res) => {
  const filter = { ...req.tenantFilter };
  if (req.query.bdm_id) filter.bdm_id = req.query.bdm_id;
  if (req.query.period) filter.period = req.query.period;
  if (req.query.cycle) filter.cycle = req.query.cycle;
  if (req.query.status) filter.status = req.query.status;

  const reports = await IncomeReport.find(filter)
    .populate('bdm_id', 'firstName lastName email')
    .sort({ period: -1, cycle: -1 })
    .lean();
  res.json({ success: true, data: reports });
});

const getIncomeById = catchAsync(async (req, res) => {
  const report = await IncomeReport.findOne({ _id: req.params.id, ...req.tenantFilter })
    .populate('bdm_id', 'firstName lastName email')
    .populate('reviewed_by', 'firstName lastName')
    .populate('credited_by', 'firstName lastName');
  if (!report) return res.status(404).json({ success: false, message: 'Income report not found' });
  res.json({ success: true, data: report });
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
    .populate('bdm_id', 'firstName lastName email')
    .sort({ period: -1 })
    .lean();
  res.json({ success: true, data: reports });
});

const getPnlById = catchAsync(async (req, res) => {
  const report = await PnlReport.findOne({ _id: req.params.id, ...req.tenantFilter })
    .populate('bdm_id', 'firstName lastName email')
    .populate('posted_by', 'firstName lastName');
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
    .populate('closed_by', 'firstName lastName')
    .populate('fy_closed_by', 'firstName lastName')
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
  generateIncome, getIncomeList, getIncomeById, updateIncomeManual,
  reviewIncome, returnIncome, confirmIncome, creditIncome,
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
