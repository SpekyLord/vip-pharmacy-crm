/**
 * ERP Report Controller — Phase 14 New Reports & Analytics + Phase 15.1 Streak Detail
 */
const { catchAsync } = require('../../middleware/errorHandler');
const { getNetCashRanking, getMomTrend, getSalesTracker, getCollectionsTracker } = require('../services/performanceRankingService');
const { getConsolidatedConsignmentAging } = require('../services/consignmentReportService');
const { detectAnomalies, detectBudgetOverruns } = require('../services/expenseAnomalyService');
const { getFuelEfficiency } = require('../services/fuelEfficiencyService');
const { getCycleStatus } = require('../services/cycleStatusService');

// ═══ 14.1 — Performance Ranking ═══

const getPerformanceRanking = catchAsync(async (req, res) => {
  const data = await getNetCashRanking(req.entityId, req.params.period);
  res.json({ success: true, data });
});

const getPerformanceTrend = catchAsync(async (req, res) => {
  const periods = req.query.periods ? Number(req.query.periods) : 6;
  const data = await getMomTrend(req.entityId, req.params.personId, periods);
  res.json({ success: true, data });
});

const getSalesTrackerHandler = catchAsync(async (req, res) => {
  const data = await getSalesTracker(req.entityId, req.params.year);
  res.json({ success: true, data });
});

const getCollectionsTrackerHandler = catchAsync(async (req, res) => {
  const data = await getCollectionsTracker(req.entityId, req.params.year);
  res.json({ success: true, data });
});

// ═══ 14.2 — Consignment Aging ═══

const getConsignmentAging = catchAsync(async (req, res) => {
  const filters = {};
  // BDMs can only see their own data; admin/finance/president can query any BDM
  const canViewOther = req.isAdmin || req.isFinance || req.isPresident;
  if (req.query.bdm_id && canViewOther) filters.bdm_id = req.query.bdm_id;
  else if (!canViewOther && req.bdmId) filters.bdm_id = req.bdmId;
  if (req.query.hospital_id) filters.hospital_id = req.query.hospital_id;
  if (req.query.aging_status) filters.aging_status = req.query.aging_status;
  const data = await getConsolidatedConsignmentAging(req.entityId, filters);
  res.json({ success: true, data });
});

// ═══ 14.3 — Expense Anomalies ═══

const getExpenseAnomalies = catchAsync(async (req, res) => {
  const data = await detectAnomalies(req.entityId, req.params.period);
  res.json({ success: true, data });
});

const getBudgetOverruns = catchAsync(async (req, res) => {
  const data = await detectBudgetOverruns(req.entityId, req.params.period);
  res.json({ success: true, data });
});

// ═══ 14.4 — Fuel Efficiency ═══

const getFuelEfficiencyHandler = catchAsync(async (req, res) => {
  const data = await getFuelEfficiency(req.entityId, req.params.period);
  res.json({ success: true, data });
});

// ═══ 14.5 — Cycle Status ═══

const getCycleStatusHandler = catchAsync(async (req, res) => {
  const data = await getCycleStatus(req.entityId, req.params.period);
  res.json({ success: true, data });
});

// ═══ 15.1 — Product Streak Detail ═══

const getProductStreakDetail = catchAsync(async (req, res) => {
  const { getProductStreakDetail: getDetail } = require('../services/profitShareEngine');
  // BDMs can only query their own streak; admin/finance/president can query any
  const canViewOther = req.isAdmin || req.isFinance || req.isPresident;
  const bdmId = (canViewOther && req.query.bdm_id) ? req.query.bdm_id : req.bdmId;
  const data = await getDetail(req.entityId, bdmId, req.params.period);
  res.json({ success: true, data });
});

module.exports = {
  getPerformanceRanking,
  getPerformanceTrend,
  getSalesTracker: getSalesTrackerHandler,
  getCollectionsTracker: getCollectionsTrackerHandler,
  getConsignmentAging,
  getExpenseAnomalies,
  getBudgetOverruns,
  getFuelEfficiency: getFuelEfficiencyHandler,
  getCycleStatus: getCycleStatusHandler,
  getProductStreakDetail
};
