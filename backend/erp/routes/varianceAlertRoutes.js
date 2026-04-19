const express = require('express');
const router = express.Router();
const { erpAccessCheck } = require('../middleware/erpAccessCheck');
const c = require('../controllers/varianceAlertController');

/**
 * Variance Alert Routes — Phase SG-5 #27
 * Mount: /api/erp/variance-alerts
 *
 * Access: sales_goals module VIEW is sufficient — BDMs see their own row via
 * the controller's Rule #21 scoping; privileged roles see the full queue.
 * No approval gate on resolve — acknowledging your own coaching signal is not
 * a financial action. Journal reversals (if ever needed) would live on the
 * Dispute Center, not here.
 */
router.get('/', erpAccessCheck('sales_goals', 'VIEW'), c.listVarianceAlerts);
router.get('/stats', erpAccessCheck('sales_goals', 'VIEW'), c.getVarianceAlertStats);
router.post('/:id/resolve', erpAccessCheck('sales_goals', 'VIEW'), c.resolveVarianceAlert);

module.exports = router;
