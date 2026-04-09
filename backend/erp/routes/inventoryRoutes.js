const express = require('express');
const router = express.Router();
const multer = require('multer');
const { protect } = require('../../middleware/auth');
const { roleCheck } = require('../../middleware/roleCheck');
const c = require('../controllers/inventoryController');

const csvUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// Phase 17 — Seed stock on hand from CSV
router.post('/seed-stock-on-hand', protect, roleCheck('admin', 'finance', 'president'), csvUpload.single('file'), c.seedStockOnHand);

// Phase 3 — Stock visibility
router.get('/my-stock', protect, c.getMyStock);
router.get('/batches/:productId', protect, c.getBatches);
router.get('/ledger/:productId', protect, c.getLedger);
router.get('/variance', protect, c.getVariance);
router.post('/physical-count', protect, c.recordPhysicalCount);

// Phase 4 — GRN workflow + alerts
router.post('/grn', protect, c.createGrn);
router.post('/grn/:id/approve', protect, roleCheck('admin', 'finance'), c.approveGrn);
router.get('/grn', protect, c.getGrnList);
router.get('/alerts', protect, c.getAlerts);

// Phase 25 — Expiry management dashboard + batch traceability
router.get('/expiry-dashboard', protect, c.getExpiryDashboard);
router.get('/batch-trace/:productId/:batchLotNo', protect, c.getBatchTrace);

module.exports = router;
