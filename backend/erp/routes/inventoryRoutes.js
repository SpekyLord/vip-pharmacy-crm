const express = require('express');
const router = express.Router();
const { protect } = require('../../middleware/auth');
const c = require('../controllers/inventoryController');

router.get('/my-stock', protect, c.getMyStock);
router.get('/batches/:productId', protect, c.getBatches);
router.get('/ledger/:productId', protect, c.getLedger);
router.get('/variance', protect, c.getVariance);
router.post('/physical-count', protect, c.recordPhysicalCount);

module.exports = router;
