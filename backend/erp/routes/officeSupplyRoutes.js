/**
 * Office Supply Routes — Phase 19
 *
 * Supply inventory CRUD and transaction tracking with reorder alerts.
 * Module-level erpAccessCheck applied in index.js.
 */
const express = require('express');
const router = express.Router();
const c = require('../controllers/officeSupplyController');

// ═══ Supplies ═══
router.get('/', c.getSupplies);
router.get('/reorder-alerts', c.getReorderAlerts);
router.get('/transactions', c.getAllTransactions); // global transaction list
router.get('/:id', c.getSupplyById);
router.post('/', c.createSupply);
router.put('/:id', c.updateSupply);

// ═══ Per-Supply Transactions ═══
router.post('/:id/transactions', c.recordTransaction);
router.get('/:id/transactions', c.getTransactions);

module.exports = router;
