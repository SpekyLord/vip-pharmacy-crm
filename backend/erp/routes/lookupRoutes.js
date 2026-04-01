const express = require('express');
const router = express.Router();
const { protect } = require('../../middleware/auth');
const { roleCheck } = require('../../middleware/roleCheck');
const { bankAccounts, paymentModes, expenseComponents } = require('../controllers/lookupController');

const adminFinance = roleCheck('admin', 'finance');

// Bank Accounts
router.get('/bank-accounts', protect, bankAccounts.getAll);
router.post('/bank-accounts', protect, adminFinance, bankAccounts.create);
router.put('/bank-accounts/:id', protect, adminFinance, bankAccounts.update);
router.delete('/bank-accounts/:id', protect, adminFinance, bankAccounts.remove);

// Payment Modes
router.get('/payment-modes', protect, paymentModes.getAll);
router.post('/payment-modes', protect, adminFinance, paymentModes.create);
router.put('/payment-modes/:id', protect, adminFinance, paymentModes.update);
router.delete('/payment-modes/:id', protect, adminFinance, paymentModes.remove);

// Expense Components
router.get('/expense-components', protect, expenseComponents.getAll);
router.post('/expense-components', protect, adminFinance, expenseComponents.create);
router.put('/expense-components/:id', protect, adminFinance, expenseComponents.update);
router.delete('/expense-components/:id', protect, adminFinance, expenseComponents.remove);

module.exports = router;
