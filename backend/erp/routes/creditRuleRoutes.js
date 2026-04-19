const express = require('express');
const router = express.Router();
const { erpAccessCheck, erpSubAccessCheck } = require('../middleware/erpAccessCheck');
const c = require('../controllers/creditRuleController');

/**
 * Credit Rule Routes — Phase SG-4 #22
 * Mount: /api/erp/credit-rules
 *
 * Module-level access: sales_goals (VIEW for reads, FULL+plan_manage for writes).
 * Engine-side calls (assign on SalesLine post) bypass these routes — they live
 * inside salesController.postSaleRow() and require no separate gating.
 */

// ── CreditRule CRUD ──
router.get('/', erpAccessCheck('sales_goals'), c.listRules);
router.get('/:id', erpAccessCheck('sales_goals'), c.getRuleById);
router.post('/', erpAccessCheck('sales_goals', 'FULL'), erpSubAccessCheck('sales_goals', 'plan_manage'), c.createRule);
router.put('/:id', erpAccessCheck('sales_goals', 'FULL'), erpSubAccessCheck('sales_goals', 'plan_manage'), c.updateRule);
router.delete('/:id', erpAccessCheck('sales_goals', 'FULL'), erpSubAccessCheck('sales_goals', 'plan_manage'), c.deleteRule);

// ── SalesCredit ledger (read-only) ──
// Mounted under credit-rules so admins find the audit trail in one place.
// Non-privileged users see only their own credits (Rule #21 enforced in controller).
router.get('/ledger/credits', erpAccessCheck('sales_goals'), c.listCredits);

// ── Engine reassignment (admin tool) ──
router.post('/reassign/:saleLineId', erpAccessCheck('sales_goals', 'FULL'), erpSubAccessCheck('sales_goals', 'plan_manage'), c.reassignSale);

module.exports = router;
