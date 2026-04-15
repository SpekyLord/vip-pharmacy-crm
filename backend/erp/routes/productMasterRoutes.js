const express = require('express');
const router = express.Router();
const multer = require('multer');
const { roleCheck } = require('../../middleware/roleCheck');
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

// Deactivate & Delete — president/admin/finance only (approval-level actions)
router.patch('/:id/deactivate', roleCheck('admin', 'finance', 'president'), c.deactivate);
router.delete('/:id', roleCheck('admin', 'finance', 'president'), c.deleteProduct);

module.exports = router;
