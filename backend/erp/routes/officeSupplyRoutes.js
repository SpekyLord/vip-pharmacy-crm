/**
 * Office Supply Routes — Phase 19
 *
 * Supply inventory CRUD and transaction tracking with reorder alerts.
 * Module-level erpAccessCheck('accounting') applied in index.js.
 * Sub-permission gated: requires inventory.office_supplies
 * (access-template driven — not visible to all BDMs by default)
 */
const express = require('express');
const router = express.Router();
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
const { erpSubAccessCheck } = require('../middleware/erpAccessCheck');
const c = require('../controllers/officeSupplyController');

const gate = erpSubAccessCheck('inventory', 'office_supplies');

// ═══ Supplies ═══
router.get('/export', gate, c.exportSupplies);
router.post('/import', gate, upload.single('file'), c.importSupplies);
router.get('/', gate, c.getSupplies);
router.get('/reorder-alerts', gate, c.getReorderAlerts);
router.get('/transactions', gate, c.getAllTransactions); // global transaction list
router.get('/:id', gate, c.getSupplyById);
router.post('/', gate, c.createSupply);
router.put('/:id', gate, c.updateSupply);

// ═══ Per-Supply Transactions ═══
router.post('/:id/transactions', gate, c.recordTransaction);
router.get('/:id/transactions', gate, c.getTransactions);

module.exports = router;
