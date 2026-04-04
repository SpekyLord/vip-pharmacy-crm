/**
 * Petty Cash Routes — Phase 19
 *
 * Fund management, transactions, ceiling checks, remittance/replenishment docs.
 * Module-level erpAccessCheck applied in index.js; sub-access gating here as needed.
 */
const express = require('express');
const router = express.Router();
const c = require('../controllers/pettyCashController');

// ═══ Funds ═══
router.get('/funds', c.getFunds);
router.get('/funds/:id', c.getFundById);
router.post('/funds', c.createFund);
router.put('/funds/:id', c.updateFund);

// ═══ Transactions ═══
router.get('/transactions', c.getTransactions);
router.post('/transactions', c.createTransaction);
router.post('/transactions/:id/post', c.postTransaction);

// ═══ Ceiling Check ═══
router.get('/ceiling/:fundId', c.checkCeiling);

// ═══ Remittance & Replenishment ═══
router.post('/remittances/generate', c.generateRemittance);
router.post('/replenishments/generate', c.generateReplenishment);

// ═══ Documents ═══
router.get('/documents', c.getDocuments);
router.post('/documents/:id/sign', c.signDocument);
router.post('/documents/:id/process', c.processDocument);

module.exports = router;
