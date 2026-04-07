const express = require('express');
const router = express.Router();
const { protect } = require('../../middleware/auth');
const { roleCheck } = require('../../middleware/roleCheck');
const c = require('../controllers/salesController');

router.post('/', protect, c.createSale);
router.put('/:id', protect, c.updateSale);
router.delete('/draft/:id', protect, c.deleteDraftRow);
router.get('/', protect, c.getSales);
router.get('/:id', protect, c.getSaleById);
router.post('/validate', protect, c.validateSales);
router.post('/submit', protect, c.submitSales);
router.post('/reopen', protect, c.reopenSales);
router.post('/:id/request-deletion', protect, c.requestDeletion);
router.post('/:id/approve-deletion', protect, roleCheck('admin', 'finance'), c.approveDeletion);

module.exports = router;
