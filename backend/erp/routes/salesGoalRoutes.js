const express = require('express');
const router = express.Router();
const multer = require('multer');
const { erpAccessCheck, erpSubAccessCheck } = require('../middleware/erpAccessCheck');
const c = require('../controllers/salesGoalController');

// Phase SG-3R — xlsx upload for /targets/import (in-memory, 5 MB cap,
// single-file). The handler validates MIME/extension itself to keep route
// wiring simple and avoid multer fileFilter overhead for a tiny admin feature.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

/**
 * Sales Goal Routes — Phase 28
 * Mount: /api/erp/sales-goals
 *
 * Access: sales_goals module (VIEW for reads, FULL for writes)
 * Sub-permissions: plan_manage, kpi_compute, action_manage_all, incentive_manage, manual_kpi_all
 */

// ═══ Plans ═══
router.get('/plans', c.getPlans);
router.get('/plans/:id', c.getPlanById);
router.post('/plans', erpAccessCheck('sales_goals', 'FULL'), erpSubAccessCheck('sales_goals', 'plan_manage'), c.createPlan);
router.put('/plans/:id', erpAccessCheck('sales_goals', 'FULL'), erpSubAccessCheck('sales_goals', 'plan_manage'), c.updatePlan);
router.post('/plans/:id/activate', erpAccessCheck('sales_goals', 'FULL'), erpSubAccessCheck('sales_goals', 'plan_manage'), c.activatePlan);
router.post('/plans/:id/reopen', erpAccessCheck('sales_goals', 'FULL'), erpSubAccessCheck('sales_goals', 'plan_manage'), c.reopenPlan);
router.post('/plans/:id/close', erpAccessCheck('sales_goals', 'FULL'), erpSubAccessCheck('sales_goals', 'plan_manage'), c.closePlan);
// Phase SG-3R — President-Reverse (SAP Storno cascade to targets, snapshots,
// IncentivePayouts, journals). Gated by accounting.reverse_posted (baseline
// danger sub-perm, never inherited from FULL). President bypasses automatically.
router.post('/plans/:id/president-reverse', erpSubAccessCheck('accounting', 'reverse_posted'), c.presidentReversePlan);

// ═══ Targets ═══
router.get('/targets', c.getTargets);
router.get('/targets/mine', c.getMyTarget);
router.post('/targets', erpAccessCheck('sales_goals', 'FULL'), erpSubAccessCheck('sales_goals', 'plan_manage'), c.createTarget);
router.post('/targets/bulk', erpAccessCheck('sales_goals', 'FULL'), erpSubAccessCheck('sales_goals', 'plan_manage'), c.bulkCreateTargets);
// Phase SG-3R — Excel import endpoint. Mounted BEFORE /targets/:id so
// the string literal "import" is never captured as a param.
router.post('/targets/import', erpAccessCheck('sales_goals', 'FULL'), erpSubAccessCheck('sales_goals', 'plan_manage'), upload.single('file'), c.importTargets);
router.put('/targets/:id', erpAccessCheck('sales_goals', 'FULL'), erpSubAccessCheck('sales_goals', 'plan_manage'), c.updateTarget);

// ═══ KPI Snapshots ═══
router.post('/snapshots/compute', erpAccessCheck('sales_goals', 'FULL'), erpSubAccessCheck('sales_goals', 'kpi_compute'), c.computeSnapshots);
router.get('/snapshots', c.getSnapshots);
router.get('/snapshots/mine', c.getMySnapshot);

// ═══ Dashboard ═══
router.get('/dashboard', c.getGoalDashboard);
router.get('/dashboard/bdm/:bdmId', c.getBdmGoalDetail);
router.get('/dashboard/drivers', c.getDriverSummary);
router.get('/dashboard/incentives', c.getIncentiveBoard);

// ═══ Action Items ═══
router.get('/actions', c.getActions);
router.get('/actions/mine', c.getMyActions);
router.post('/actions', c.createAction);
router.put('/actions/:id', c.updateAction);
router.post('/actions/:id/complete', c.completeAction);

// ═══ Manual KPI Entry ═══
router.post('/kpi/manual', c.enterManualKpi);

module.exports = router;
