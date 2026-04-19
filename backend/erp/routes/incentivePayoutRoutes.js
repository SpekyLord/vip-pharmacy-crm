const express = require('express');
const router = express.Router();
const { erpAccessCheck, erpSubAccessCheck } = require('../middleware/erpAccessCheck');
const periodLockCheck = require('../middleware/periodLockCheck');
const c = require('../controllers/incentivePayoutController');

/**
 * Incentive Payout Routes — Phase SG-Q2 Week 2
 * Mount: /api/erp/incentive-payouts
 *
 * Accrual is automatic (inside salesGoalService.computeBdmSnapshot); there
 * is NO public create endpoint. All lifecycle routes are gated:
 *   - erpAccessCheck('sales_goals', 'FULL') — module-level access
 *   - erpSubAccessCheck(module, key)         — specific sub-permission
 *   - periodLockCheck('INCENTIVE_PAYOUT')    — refuse settlement in locked period
 *   - gateApproval(module: 'INCENTIVE_PAYOUT')  — Authority Matrix + Default-Roles
 *
 * Viewer access (BDM's own payouts) falls back to VIEW level.
 */

// ── Reads (VIEW level — BDMs can see their own via automatic bdm_id filter) ──
router.get('/payable', erpAccessCheck('sales_goals', 'VIEW'), erpSubAccessCheck('sales_goals', 'payout_view'), c.getPayable);
router.get('/mine', erpAccessCheck('sales_goals', 'VIEW'), c.myPayouts);
router.get('/:id', erpAccessCheck('sales_goals', 'VIEW'), c.getPayoutById);
router.get('/', erpAccessCheck('sales_goals', 'VIEW'), c.listPayouts);

// ── Lifecycle actions ────────────────────────────────────────────────────
router.post('/:id/approve',
  erpAccessCheck('sales_goals', 'FULL'),
  erpSubAccessCheck('sales_goals', 'payout_approve'),
  c.approvePayout
);
router.post('/:id/pay',
  erpAccessCheck('sales_goals', 'FULL'),
  erpSubAccessCheck('sales_goals', 'payout_pay'),
  periodLockCheck('INCENTIVE_PAYOUT'),
  c.payPayout
);
router.post('/:id/reverse',
  erpAccessCheck('sales_goals', 'FULL'),
  erpSubAccessCheck('sales_goals', 'payout_reverse'),
  periodLockCheck('INCENTIVE_PAYOUT'),
  c.reversePayout
);

module.exports = router;
