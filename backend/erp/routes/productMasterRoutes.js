const express = require('express');
const router = express.Router();
const { roleCheck } = require('../../middleware/roleCheck');
const c = require('../controllers/productMasterController');

router.post('/tag-warehouse', roleCheck('admin', 'finance', 'president'), c.tagToWarehouse);
router.get('/', c.getAll);
router.get('/:id', c.getById);
router.get('/:id/warehouses', c.getProductWarehouses);
router.post('/', roleCheck('admin', 'finance', 'president'), c.create);
router.put('/:id', roleCheck('admin', 'finance', 'president'), c.update);
router.patch('/:id/deactivate', roleCheck('admin', 'finance', 'president'), c.deactivate);
router.patch('/:id/reorder-qty', roleCheck('admin', 'finance', 'president'), c.updateReorderQty);

module.exports = router;
