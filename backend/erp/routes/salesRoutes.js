const express = require('express');
const router = express.Router();
const periodLockCheck = require('../middleware/periodLockCheck');
const { erpSubAccessCheck } = require('../middleware/erpAccessCheck');
const c = require('../controllers/salesController');

// Note: protect + tenantFilter already applied globally in erp/routes/index.js

router.post('/', c.createSale);
router.put('/:id', c.updateSale);
router.delete('/draft/:id', c.deleteDraftRow);
router.get('/', c.getSales);
router.get('/:id', c.getSaleById);
router.post('/validate', c.validateSales);
// Period lock for submit is checked per-row inside submitSales controller
// (body is { sale_ids } with no date field, so middleware can't extract period)
router.post('/submit', c.submitSales);
router.post('/reopen', periodLockCheck('SALES'), c.reopenSales);
// Received-CSI attachment (t=4 dunning proof). Period-lock is enforced
// inside the controller because it uses the sale's own csi_date, not the
// request body.
router.put('/:id/received-csi', c.attachReceivedCsi);

router.post('/:id/request-deletion', c.requestDeletion);
// Phase 3c — legacy approve-deletion path (President Reverse preferred). Tier 2 lookup-only.
router.post('/:id/approve-deletion', erpSubAccessCheck('accounting', 'approve_deletion'), c.approveDeletion);

// President-only delete + reverse (lookup-driven sub-permission; default: only President)
// SAP Storno for POSTED rows, hard delete for DRAFT/ERROR. Reversal entries post to current period.
router.post('/:id/president-reverse', erpSubAccessCheck('accounting', 'reverse_posted'), c.presidentReverseSale);

module.exports = router;
