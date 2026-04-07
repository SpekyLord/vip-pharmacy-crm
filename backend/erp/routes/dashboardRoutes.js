/**
 * Dashboard Routes — ERP Dashboard KPIs, Reports, Audit Logs
 *
 * Mounted at /api/erp/dashboard
 * All routes require authentication (protect + tenantFilter applied at index.js)
 */
const express = require('express');
const {
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
} = require('../controllers/dashboardController');

const router = express.Router();

// ═══ KPI Endpoints (Dashboard Cards) ═══
router.get('/summary', getDashboardSummary);
router.get('/mtd', getDashboardMtd);
router.get('/pnl-ytd', getDashboardPnlYtd);

// ═══ Bottom Nav Tab Data ═══
router.get('/products', getDashboardProducts);
router.get('/hospitals', getDashboardHospitals);

// ═══ Report Summaries ═══
router.get('/sales-summary', getSalesSummary);
router.get('/collection-summary', getCollectionSummary);
router.get('/expense-summary', getExpenseSummaryEndpoint);

// ═══ Audit & System ═══
router.get('/audit-logs', getAuditLogs);
router.get('/monthly-archive', getMonthlyArchives);
router.get('/system-health', getSystemHealth);

module.exports = router;
