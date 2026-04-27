const express = require('express');
const router = express.Router();
const multer = require('multer');
const { erpSubAccessCheck, erpAnySubAccessCheck } = require('../middleware/erpAccessCheck');
const c = require('../controllers/productMasterController');

const xlsUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// Read — open to all authenticated ERP users
router.get('/', c.getAll);
router.get('/:id', c.getById);
router.get('/:id/warehouses', c.getProductWarehouses);

// Phase MD-1 (Apr 2026) — Add/Edit accept either MASTER__PRODUCT_MANAGE (the canonical
// Master Data grant) OR PURCHASING__PRODUCT_MANAGE (legacy grant kept for backwards
// compatibility with any existing access templates). New staff should be given
// `master.product_manage`; existing purchasing-template users keep their access without
// migration. Cross-entity write capability is governed by `master.cross_entity_write`
// inside the controller (filter.entity_id bypass + body.entity_id override on create).
router.post('/', erpAnySubAccessCheck(['master', 'product_manage'], ['purchasing', 'product_manage']), c.create);
router.put('/:id', erpAnySubAccessCheck(['master', 'product_manage'], ['purchasing', 'product_manage']), c.update);
router.post('/tag-warehouse', erpAnySubAccessCheck(['master', 'product_manage'], ['purchasing', 'product_manage']), c.tagToWarehouse);
router.patch('/:id/reorder-qty', erpAnySubAccessCheck(['master', 'product_manage'], ['purchasing', 'product_manage']), c.updateReorderQty);

// Bulk operations — same dual-accept pattern.
router.get('/export-prices', erpAnySubAccessCheck(['master', 'product_manage'], ['purchasing', 'product_manage']), c.exportPrices);
router.put('/import-prices', erpAnySubAccessCheck(['master', 'product_manage'], ['purchasing', 'product_manage']), xlsUpload.single('file'), c.importPrices);
router.put('/refresh', erpAnySubAccessCheck(['master', 'product_manage'], ['purchasing', 'product_manage']), xlsUpload.single('file'), c.refreshProducts);

// Deactivate & Delete — Phase 3c lookup-driven sub-perms.
// Deactivate is recoverable (Tier 2). Hard-delete is irreversible (Tier 1 baseline).
router.patch('/:id/deactivate', erpSubAccessCheck('master', 'product_deactivate'), c.deactivate);
router.delete('/:id', erpSubAccessCheck('master', 'product_delete'), c.deleteProduct);

module.exports = router;
