const express = require('express');
const router = express.Router();
const { roleCheck } = require('../../middleware/roleCheck');
const periodLockCheck = require('../middleware/periodLockCheck');
const { ROLES } = require('../../constants/roles');
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
router.post('/:id/request-deletion', c.requestDeletion);
router.post('/:id/approve-deletion', roleCheck(ROLES.ADMIN, ROLES.FINANCE), c.approveDeletion);

module.exports = router;
