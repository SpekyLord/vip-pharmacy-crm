/**
 * nonMdPartnerRebateRuleRoutes — Phase VIP-1.B Phase 4.
 * Mount: /api/erp/non-md-partner-rebate-rules
 */
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/nonMdPartnerRebateRuleController');

router.get('/', ctrl.list);
router.get('/:id', ctrl.getById);
router.post('/', ctrl.create);
router.put('/:id', ctrl.update);
router.delete('/:id', ctrl.deactivate);

module.exports = router;
