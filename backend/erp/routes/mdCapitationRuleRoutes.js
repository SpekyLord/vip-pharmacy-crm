/**
 * mdCapitationRuleRoutes — Phase VIP-1.B Phase 4. Mount: /api/erp/md-capitation-rules
 */
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/mdCapitationRuleController');

router.get('/', ctrl.list);
router.get('/:id', ctrl.getById);
router.get('/:id/excluded-products', ctrl.getExcludedProducts);
router.post('/', ctrl.create);
router.put('/:id', ctrl.update);
router.delete('/:id', ctrl.deactivate);

module.exports = router;
