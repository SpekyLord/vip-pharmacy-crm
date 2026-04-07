/**
 * Petty Cash Routes — Phase 19
 *
 * Fund management, transactions, ceiling checks, remittance/replenishment docs.
 * Module-level erpAccessCheck applied in index.js; sub-access gating here as needed.
 *
 * Authorization:
 *   Fund CRUD: president/admin/finance only (BDMs view only)
 *   Transactions: custodian + president/admin/finance
 *   Post/Sign/Process: president/admin/finance only
 */
const express = require('express');
const router = express.Router();
const { roleCheck } = require('../../middleware/roleCheck');
const c = require('../controllers/pettyCashController');

// ═══ Funds ═══
router.get('/funds', c.getFunds);                                                    // All: view funds
router.get('/funds/:id', c.getFundById);                                              // All: view fund detail
router.post('/funds', roleCheck('admin', 'finance', 'president'), c.createFund);      // Admin/Finance/President: create
router.put('/funds/:id', roleCheck('admin', 'finance', 'president'), c.updateFund);   // Admin/Finance/President: edit
router.delete('/funds/:id', roleCheck('president'), c.deleteFund);                    // President only: delete

// ═══ Transactions ═══
router.get('/transactions', c.getTransactions);                                        // All: view transactions
router.post('/transactions', c.createTransaction);                                     // Custodian + admin (checked in controller)
router.post('/transactions/:id/post', roleCheck('admin', 'finance', 'president'), c.postTransaction);  // Admin/Finance/President: post

// ═══ Ceiling Check ═══
router.get('/ceiling/:fundId', c.checkCeiling);

// ═══ Remittance & Replenishment ═══
router.post('/remittances/generate', c.generateRemittance);
router.post('/replenishments/generate', c.generateReplenishment);

// ═══ Documents ═══
router.get('/documents', c.getDocuments);
router.post('/documents/:id/sign', roleCheck('admin', 'finance', 'president'), c.signDocument);
router.post('/documents/:id/process', roleCheck('admin', 'finance', 'president'), c.processDocument);

module.exports = router;
