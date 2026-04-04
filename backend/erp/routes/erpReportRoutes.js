/**
 * ERP Report Routes — Phase 14 New Reports & Analytics
 */
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/erpReportController');

// 14.1 — Performance Ranking (specific route before parameterized)
router.get('/performance-ranking/trend/:personId', ctrl.getPerformanceTrend);
router.get('/performance-ranking/:period', ctrl.getPerformanceRanking);
router.get('/sales-tracker/:year', ctrl.getSalesTracker);
router.get('/collections-tracker/:year', ctrl.getCollectionsTracker);

// 14.2 — Consignment Aging
router.get('/consignment-aging', ctrl.getConsignmentAging);

// 14.3 — Expense Anomalies
router.get('/expense-anomalies/:period', ctrl.getExpenseAnomalies);
router.get('/budget-overruns/:period', ctrl.getBudgetOverruns);

// 14.4 — Fuel Efficiency
router.get('/fuel-efficiency/:period', ctrl.getFuelEfficiency);

// 14.5 — Cycle Status
router.get('/cycle-status/:period', ctrl.getCycleStatus);

// 15.1 — Product Streak Detail
router.get('/product-streaks/:period', ctrl.getProductStreakDetail);

module.exports = router;
