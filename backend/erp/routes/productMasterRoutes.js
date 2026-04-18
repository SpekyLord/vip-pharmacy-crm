const express = require('express');
const router = express.Router();
const multer = require('multer');
const { erpSubAccessCheck } = require('../middleware/erpAccessCheck');
const c = require('../controllers/productMasterController');

const xlsUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// Read — open to all authenticated ERP users
router.get('/', c.getAll);
router.get('/:id', c.getById);
router.get('/:id/warehouses', c.getProductWarehouses);

// Add & Edit — purchasing users with product_manage sub-permission
router.post('/', erpSubAccessCheck('purchasing', 'product_manage'), c.create);
router.put('/:id', erpSubAccessCheck('purchasing', 'product_manage'), c.update);
router.post('/tag-warehouse', erpSubAccessCheck('purchasing', 'product_manage'), c.tagToWarehouse);
router.patch('/:id/reorder-qty', erpSubAccessCheck('purchasing', 'product_manage'), c.updateReorderQty);

// Bulk operations — purchasing users with product_manage
router.get('/export-prices', erpSubAccessCheck('purchasing', 'product_manage'), c.exportPrices);
router.put('/import-prices', erpSubAccessCheck('purchasing', 'product_manage'), xlsUpload.single('file'), c.importPrices);
router.put('/refresh', erpSubAccessCheck('purchasing', 'product_manage'), xlsUpload.single('file'), c.refreshProducts);

// Deactivate & Delete — Phase 3c lookup-driven sub-perms.
// Deactivate is recoverable (Tier 2). Hard-delete is irreversible (Tier 1 baseline).
router.patch('/:id/deactivate', erpSubAccessCheck('master', 'product_deactivate'), c.deactivate);
router.delete('/:id', erpSubAccessCheck('master', 'product_delete'), c.deleteProduct);

module.exports = router;
