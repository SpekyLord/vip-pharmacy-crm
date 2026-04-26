/**
 * mdProductRebateRoutes — Phase VIP-1.B Phase 4. Mount: /api/erp/md-product-rebates
 *
 * Auth + tenant filter come from parent router. Lookup-driven role gate enforced
 * inside the controller (REBATE_ROLES.MANAGE_MD_MATRIX).
 */
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/mdProductRebateController');

router.get('/', ctrl.list);
router.get('/:id', ctrl.getById);
router.post('/', ctrl.create);
router.put('/:id', ctrl.update);
router.delete('/:id', ctrl.deactivate); // soft-delete via is_active=false

module.exports = router;
