/**
 * rebatePayoutRoutes — Phase VIP-1.B Phase 4. Mount: /api/erp/rebate-payouts
 *
 * Read-only ledger + status transitions. No POST (rows are written by
 * autoPrfRouting + rebateAccrualEngine only).
 */
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/rebatePayoutController');

router.get('/', ctrl.list);
router.get('/summary', ctrl.summary);
router.get('/:id', ctrl.getById);
router.post('/:id/ready-to-pay', ctrl.markReadyToPay);
router.post('/:id/paid', ctrl.markPaid);
router.post('/:id/void', ctrl.voidPayout);

module.exports = router;
