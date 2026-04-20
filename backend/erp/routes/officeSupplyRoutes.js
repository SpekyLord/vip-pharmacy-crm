/**
 * Office Supply Routes — Phase 19 + Phase 31R-OS
 *
 * Supply inventory CRUD and transaction tracking with reorder alerts.
 * Module-level erpAccessCheck('inventory') applied in routes/index.js.
 * Sub-permission gated: requires inventory.office_supplies for CRUD
 * (access-template driven — not visible to all BDMs by default);
 * President-Reverse endpoints require accounting.reverse_posted (Phase 31R-OS).
 */
const express = require('express');
const router = express.Router();
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
const { erpSubAccessCheck } = require('../middleware/erpAccessCheck');
const c = require('../controllers/officeSupplyController');

const gate = erpSubAccessCheck('inventory', 'office_supplies');
// Phase 31R-OS — reversal gate reuses the existing accounting.reverse_posted
// danger sub-permission (president always passes; subscribers delegate via
// Access Templates without code changes).
const reversalGate = erpSubAccessCheck('accounting', 'reverse_posted');

// ═══ Supplies ═══
router.get('/export', gate, c.exportSupplies);
router.post('/import', gate, upload.single('file'), c.importSupplies);
router.get('/', gate, c.getSupplies);
router.get('/reorder-alerts', gate, c.getReorderAlerts);
router.get('/transactions', gate, c.getAllTransactions); // global transaction list
// Phase 31R-OS — transaction reversal MUST be declared before the generic
// `/:id/*` routes so Express matches `/transactions/:id/president-reverse`
// correctly (otherwise `:id` would swallow the literal `transactions`).
router.delete('/transactions/:id/president-reverse', reversalGate, c.presidentReverseSupplyTxn);
router.delete('/:id/president-reverse', reversalGate, c.presidentReverseSupply);
router.get('/:id', gate, c.getSupplyById);
router.post('/', gate, c.createSupply);
router.put('/:id', gate, c.updateSupply);

// ═══ Per-Supply Transactions ═══
router.post('/:id/transactions', gate, c.recordTransaction);
router.get('/:id/transactions', gate, c.getTransactions);

module.exports = router;
