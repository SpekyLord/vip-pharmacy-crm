const express = require('express');
const router = express.Router();
const multer = require('multer');
const { roleCheck } = require('../../middleware/roleCheck');
const c = require('../controllers/productMasterController');

const xlsUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

router.post('/tag-warehouse', roleCheck('admin', 'finance', 'president'), c.tagToWarehouse);
router.get('/export-prices', roleCheck('admin', 'finance', 'president'), c.exportPrices);
router.put('/import-prices', roleCheck('admin', 'finance', 'president'), xlsUpload.single('file'), c.importPrices);
router.put('/refresh', roleCheck('admin', 'finance', 'president'), xlsUpload.single('file'), c.refreshProducts);
router.get('/', c.getAll);
router.get('/:id', c.getById);
router.get('/:id/warehouses', c.getProductWarehouses);
router.post('/', roleCheck('admin', 'finance', 'president'), c.create);
router.put('/:id', roleCheck('admin', 'finance', 'president'), c.update);
router.patch('/:id/deactivate', roleCheck('admin', 'finance', 'president'), c.deactivate);
router.patch('/:id/reorder-qty', roleCheck('admin', 'finance', 'president'), c.updateReorderQty);

module.exports = router;
