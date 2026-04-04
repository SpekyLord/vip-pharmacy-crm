/**
 * Banking & Cash Routes — Phase 13, updated Phase 16 (sub-module access)
 *
 * Write operations gated by erpSubAccessCheck (replaces roleCheck).
 * Read routes rely on module-level erpAccessCheck at mount.
 */
const express = require('express');
const router = express.Router();
const { erpSubAccessCheck } = require('../middleware/erpAccessCheck');
const ctrl = require('../controllers/bankingController');

// ═══ Bank Accounts ═══
router.get('/bank-accounts', ctrl.listBankAccounts);
router.post('/bank-accounts', erpSubAccessCheck('banking', 'bank_accounts'), ctrl.createBankAccount);
router.put('/bank-accounts/:id', erpSubAccessCheck('banking', 'bank_accounts'), ctrl.updateBankAccount);

// ═══ Bank Statements & Reconciliation ═══
router.post('/statements/import', erpSubAccessCheck('banking', 'statement_import'), ctrl.importStatement);
router.get('/statements', ctrl.listStatements);
router.get('/statements/:id', ctrl.getStatement);
router.post('/statements/:id/auto-match', erpSubAccessCheck('banking', 'bank_recon'), ctrl.autoMatchStatement);
router.post('/statements/:id/manual-match', erpSubAccessCheck('banking', 'bank_recon'), ctrl.manualMatchEntry);
router.get('/statements/:id/recon', ctrl.getReconSummary);
router.post('/statements/:id/finalize', erpSubAccessCheck('banking', 'bank_recon'), ctrl.finalizeRecon);

// ═══ Credit Card Transactions & Payments ═══
router.get('/credit-cards/balances', ctrl.getCardBalances);
router.get('/credit-cards/:id/ledger', ctrl.getCardLedger);
router.post('/credit-cards/transactions', erpSubAccessCheck('banking', 'credit_card'), ctrl.createCreditCardTransaction);
router.post('/credit-cards/:id/payment', erpSubAccessCheck('banking', 'credit_card'), ctrl.recordCardPayment);

module.exports = router;
