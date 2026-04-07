const express = require('express');
const router = express.Router();
const { roleCheck } = require('../../middleware/roleCheck');
const { bankAccounts, paymentModes, expenseComponents } = require('../controllers/lookupController');

const adminFinance = roleCheck('admin', 'finance', 'president');

// Bank Accounts (protect + tenantFilter already applied at router level in index.js)
router.get('/bank-accounts/my-accounts', bankAccounts.getMyAccounts);
router.get('/bank-accounts', bankAccounts.getAll);
router.post('/bank-accounts', adminFinance, bankAccounts.create);
router.put('/bank-accounts/:id', adminFinance, bankAccounts.update);
router.delete('/bank-accounts/:id', adminFinance, bankAccounts.remove);

// Payment Modes
router.get('/payment-modes', paymentModes.getAll);
router.post('/payment-modes', adminFinance, paymentModes.create);
router.put('/payment-modes/:id', adminFinance, paymentModes.update);
router.delete('/payment-modes/:id', adminFinance, paymentModes.remove);

// Expense Components
router.get('/expense-components', expenseComponents.getAll);
router.post('/expense-components', adminFinance, expenseComponents.create);
router.put('/expense-components/:id', adminFinance, expenseComponents.update);
router.delete('/expense-components/:id', adminFinance, expenseComponents.remove);

module.exports = router;
