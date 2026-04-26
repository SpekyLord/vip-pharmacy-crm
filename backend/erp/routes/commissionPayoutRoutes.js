/**
 * commissionPayoutRoutes — Phase VIP-1.B Phase 4. Mount: /api/erp/commission-payouts
 */
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/commissionPayoutController');

router.get('/', ctrl.list);
router.get('/summary', ctrl.summary);
router.get('/:id', ctrl.getById);

module.exports = router;
