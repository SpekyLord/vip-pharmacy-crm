const express = require('express');
const router = express.Router();
const { roleCheck } = require('../../middleware/roleCheck');
const ctrl = require('../controllers/bankingController');

// ═══ Bank Accounts ═══
router.get('/bank-accounts', ctrl.listBankAccounts);
router.post('/bank-accounts', roleCheck('admin', 'finance', 'president'), ctrl.createBankAccount);
router.put('/bank-accounts/:id', roleCheck('admin', 'finance', 'president'), ctrl.updateBankAccount);

// ═══ Bank Statements & Reconciliation ═══
router.post('/statements/import', roleCheck('admin', 'finance', 'president'), ctrl.importStatement);
router.get('/statements', ctrl.listStatements);
router.get('/statements/:id', ctrl.getStatement);
router.post('/statements/:id/auto-match', roleCheck('admin', 'finance', 'president'), ctrl.autoMatchStatement);
router.post('/statements/:id/manual-match', roleCheck('admin', 'finance', 'president'), ctrl.manualMatchEntry);
router.get('/statements/:id/recon', ctrl.getReconSummary);
router.post('/statements/:id/finalize', roleCheck('admin', 'finance', 'president'), ctrl.finalizeRecon);

// ═══ Credit Card Transactions & Payments ═══
router.get('/credit-cards/balances', ctrl.getCardBalances);
router.get('/credit-cards/:id/ledger', ctrl.getCardLedger);
router.post('/credit-cards/transactions', roleCheck('admin', 'finance', 'president'), ctrl.createCreditCardTransaction);
router.post('/credit-cards/:id/payment', roleCheck('admin', 'finance', 'president'), ctrl.recordCardPayment);

module.exports = router;
