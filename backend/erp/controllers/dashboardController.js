/**
 * Dashboard Controller — ERP Dashboard KPIs + Report Summaries
 *
 * PRD §13.5: Summary cards, MTD, PNL-YTD, product stock, hospitals, audit logs
 */
const mongoose = require('mongoose');
const { catchAsync } = require('../../middleware/errorHandler');
const { getSummary, getMtd, getPnlYtd, getProductStockLevels } = require('../services/dashboardService');
const { generateExpenseSummary } = require('../services/expenseSummary');
const Hospital = require('../models/Hospital');
const ErpAuditLog = require('../models/ErpAuditLog');
const MonthlyArchive = require('../models/MonthlyArchive');
const SalesLine = require('../models/SalesLine');
const Collection = require('../models/Collection');

// ═══════════════════════════════════════════
// DASHBOARD KPI ENDPOINTS
// ═══════════════════════════════════════════

/**
 * GET /api/erp/dashboard/summary
 * Summary cards: Total Sales, AR, Stock Value, Engagements
 */
const getDashboardSummary = catchAsync(async (req, res) => {
  const data = await getSummary(req.entityId, req.bdmId, req.isAdmin || req.isPresident);
  res.json({ success: true, data });
});

/**
 * GET /api/erp/dashboard/mtd
 * Month-to-Date: Sales, Collections, Engagements, Income
 */
const getDashboardMtd = catchAsync(async (req, res) => {
  const data = await getMtd(req.entityId, req.bdmId, req.isAdmin || req.isPresident);
  res.json({ success: true, data });
});

/**
 * GET /api/erp/dashboard/pnl-ytd
 * Year-to-Date PNL: Total Sales - Total Expenses
 */
const getDashboardPnlYtd = catchAsync(async (req, res) => {
  const data = await getPnlYtd(req.entityId, req.bdmId, req.isAdmin || req.isPresident);
  res.json({ success: true, data });
});

/**
 * GET /api/erp/dashboard/products
 * Product Master with stock levels (bottom nav tab 1)
 */
const getDashboardProducts = catchAsync(async (req, res) => {
  const data = await getProductStockLevels(req.entityId, req.bdmId, req.isAdmin || req.isPresident);
  res.json({ success: true, data });
});

/**
 * GET /api/erp/dashboard/hospitals
 * Hospital list with HEAT fields (bottom nav tab 2)
 * BDMs see only their tagged hospitals (same filter as hospitalController)
 */
const getDashboardHospitals = catchAsync(async (req, res) => {
  const filter = {};
  // BDM sees only their tagged hospitals; admin/president/finance see all
  const bdmRoles = ['employee'];
  if (bdmRoles.includes(req.user?.role)) {
    filter.tagged_bdms = {
      $elemMatch: { bdm_id: req.user._id, is_active: { $ne: false } }
    };
  }

  const hospitals = await Hospital.find(filter)
    .select('hospital_name hospital_type bed_capacity engagement_level key_decision_maker address bdm_tags')
    .sort({ hospital_name: 1 })
    .lean();
  res.json({ success: true, data: hospitals });
});

// ═══════════════════════════════════════════
// REPORT ENDPOINTS
// ═══════════════════════════════════════════

/**
 * GET /api/erp/dashboard/sales-summary
 * Sales summary grouped by hospital for a given period
 */
const getSalesSummary = catchAsync(async (req, res) => {
  const { period } = req.query;
  const filter = { ...req.tenantFilter, status: 'POSTED' };

  if (period) {
    const [y, m] = period.split('-').map(Number);
    filter.csi_date = { $gte: new Date(y, m - 1, 1), $lt: new Date(y, m, 1) };
  }

  const result = await SalesLine.aggregate([
    { $match: filter },
    {
      $group: {
        _id: '$hospital_id',
        total_invoices: { $sum: 1 },
        total_sales: { $sum: '$invoice_total' },
        total_vat: { $sum: '$total_vat' },
        total_net: { $sum: '$total_net_of_vat' }
      }
    },
    {
      $lookup: {
        from: 'erp_hospitals',
        localField: '_id',
        foreignField: '_id',
        as: 'hospital'
      }
    },
    { $unwind: { path: '$hospital', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        hospital_id: '$_id',
        hospital_name: { $ifNull: ['$hospital.hospital_name', 'Unknown'] },
        total_invoices: 1,
        total_sales: { $round: ['$total_sales', 2] },
        total_vat: { $round: ['$total_vat', 2] },
        total_net: { $round: ['$total_net', 2] }
      }
    },
    { $sort: { total_sales: -1 } }
  ]);

  res.json({ success: true, data: result });
});

/**
 * GET /api/erp/dashboard/collection-summary
 * Collection summary grouped by hospital for a given period
 */
const getCollectionSummary = catchAsync(async (req, res) => {
  const { period } = req.query;
  const filter = { ...req.tenantFilter, status: 'POSTED' };

  if (period) {
    const [y, m] = period.split('-').map(Number);
    filter.cr_date = { $gte: new Date(y, m - 1, 1), $lt: new Date(y, m, 1) };
  }

  const result = await Collection.aggregate([
    { $match: filter },
    {
      $group: {
        _id: '$hospital_id',
        total_crs: { $sum: 1 },
        total_collected: { $sum: '$cr_amount' },
        total_commission: { $sum: '$total_commission' },
        total_rebates: { $sum: '$total_partner_rebates' }
      }
    },
    {
      $lookup: {
        from: 'erp_hospitals',
        localField: '_id',
        foreignField: '_id',
        as: 'hospital'
      }
    },
    { $unwind: { path: '$hospital', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        hospital_id: '$_id',
        hospital_name: { $ifNull: ['$hospital.hospital_name', 'Unknown'] },
        total_crs: 1,
        total_collected: { $round: ['$total_collected', 2] },
        total_commission: { $round: ['$total_commission', 2] },
        total_rebates: { $round: ['$total_rebates', 2] }
      }
    },
    { $sort: { total_collected: -1 } }
  ]);

  res.json({ success: true, data: result });
});

/**
 * GET /api/erp/dashboard/expense-summary
 * Expense summary for a period + cycle
 */
const getExpenseSummaryEndpoint = catchAsync(async (req, res) => {
  const { period, cycle } = req.query;
  if (!period) return res.status(400).json({ success: false, message: 'period is required' });

  const data = await generateExpenseSummary(
    req.entityId, req.bdmId, period, cycle || 'MONTHLY'
  );
  res.json({ success: true, data });
});

/**
 * GET /api/erp/dashboard/audit-logs
 * Searchable audit log viewer
 */
const getAuditLogs = catchAsync(async (req, res) => {
  const filter = {};
  if (req.entityId) filter.entity_id = new mongoose.Types.ObjectId(req.entityId);
  if (req.query.log_type) filter.log_type = req.query.log_type;
  if (req.query.target_model) filter.target_model = req.query.target_model;
  if (req.query.changed_by) filter.changed_by = new mongoose.Types.ObjectId(req.query.changed_by);

  if (req.query.from || req.query.to) {
    filter.changed_at = {};
    if (req.query.from) filter.changed_at.$gte = new Date(req.query.from);
    if (req.query.to) filter.changed_at.$lte = new Date(req.query.to);
  }

  const page = parseInt(req.query.page) || 1;
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const skip = (page - 1) * limit;

  const [logs, total] = await Promise.all([
    ErpAuditLog.find(filter)
      .populate('changed_by', 'name email')
      .sort({ changed_at: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    ErpAuditLog.countDocuments(filter)
  ]);

  res.json({
    success: true,
    data: logs,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) }
  });
});

/**
 * GET /api/erp/dashboard/monthly-archive
 * Monthly archive list with snapshot data
 */
const getMonthlyArchives = catchAsync(async (req, res) => {
  const filter = { record_type: 'MONTHLY' };
  if (req.entityId) filter.entity_id = new mongoose.Types.ObjectId(req.entityId);

  const archives = await MonthlyArchive.find(filter)
    .populate('closed_by', 'name')
    .sort({ period: -1 })
    .lean();
  res.json({ success: true, data: archives });
});

/**
 * GET /api/erp/dashboard/system-health
 * System health: document counts, recent activity
 */
const getSystemHealth = catchAsync(async (req, res) => {
  const filter = req.tenantFilter || {};

  const [salesCount, collCount, draftSales, draftColl] = await Promise.all([
    SalesLine.countDocuments({ ...filter, status: 'POSTED' }),
    Collection.countDocuments({ ...filter, status: 'POSTED' }),
    SalesLine.countDocuments({ ...filter, status: 'DRAFT' }),
    Collection.countDocuments({ ...filter, status: 'DRAFT' })
  ]);

  res.json({
    success: true,
    data: {
      posted_sales: salesCount,
      posted_collections: collCount,
      draft_sales: draftSales,
      draft_collections: draftColl,
      server_time: new Date().toISOString()
    }
  });
});

module.exports = {
  getDashboardSummary,
  getDashboardMtd,
  getDashboardPnlYtd,
  getDashboardProducts,
  getDashboardHospitals,
  getSalesSummary,
  getCollectionSummary,
  getExpenseSummaryEndpoint,
  getAuditLogs,
  getMonthlyArchives,
  getSystemHealth
};
