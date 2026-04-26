/**
 * scpwdSalesBookRoutes — Phase VIP-1.H (Apr 2026)
 *
 * SC/PWD Sales Book + BIR exports. Mount path: /api/erp/scpwd-sales-book
 *
 * Auth + tenant filter come from the parent router (routes/index.js). Role
 * gates are enforced inside the controller via lookup-driven scpwdAccess.js
 * (Rule #3); we do NOT layer roleCheck/erpAccessCheck here because the
 * lookup-driven gates supersede module-level auth.
 *
 * Period-lock middleware applies on the post + create-direct-POSTED paths
 * — POST creating a row dated in a locked month is rejected at the gate.
 */

const express = require('express');
const router = express.Router();

const periodLockCheck = require('../middleware/periodLockCheck');
const ctrl = require('../controllers/scpwdSalesBookController');

// Reads
router.get('/', ctrl.list);
router.get('/summary', ctrl.summary);

// Exports — these come BEFORE /:id to avoid route shadowing
router.get('/export/monthly', ctrl.exportMonthly);
router.get('/export/vat-reclaim', ctrl.exportVatReclaim);

router.get('/:id', ctrl.getById);

// Writes (period-lock gated on create + post; void/update don't shift period)
router.post('/', periodLockCheck('SCPWD'), ctrl.create);
router.put('/:id', periodLockCheck('SCPWD'), ctrl.update);
router.post('/:id/post', periodLockCheck('SCPWD'), ctrl.post);
router.post('/:id/void', ctrl.voidRow);

module.exports = router;
