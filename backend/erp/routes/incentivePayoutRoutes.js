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
// Phase SG-Q2 W3 — Compensation Statement (BDM view + printable HTML/PDF).
// MUST be declared before `/:id` so Express does not match these as IDs.
// VIEW gate (BDM scope is enforced inside the controller via _resolveStatementScope —
// non-privileged callers can only ever see their own statement).
router.get('/statement', erpAccessCheck('sales_goals', 'VIEW'), c.getCompensationStatement);
router.get('/statement/print', erpAccessCheck('sales_goals', 'VIEW'), c.printCompensationStatement);
// Phase SG-4 #23 ext — BDM statement archive (per-period rollup) + admin
// mass-dispatch on period close. Archive is read-only (BDM-scoped via
// _resolveStatementScope); dispatch is gated by the FULL access + the
// gateApproval('INCENTIVE_PAYOUT', 'STATEMENT_DISPATCH') call inside the
// controller, so authority controls who can mass-mail BDMs.
router.get('/statement/archive', erpAccessCheck('sales_goals', 'VIEW'), c.getStatementArchive);
router.post('/statements/dispatch', erpAccessCheck('sales_goals', 'FULL'), erpSubAccessCheck('sales_goals', 'payout_approve'), c.dispatchStatementsForPeriod);
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
