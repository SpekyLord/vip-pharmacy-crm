const express = require('express');
const router = express.Router();
const { roleCheck } = require('../../middleware/roleCheck');
const { erpSubAccessCheck } = require('../middleware/erpAccessCheck');
const { bankAccounts, paymentModes, expenseComponents } = require('../controllers/lookupController');

const adminFinance = roleCheck('admin', 'finance', 'president');
// Phase 3c — Tier 2 lookup-only danger key for destructive lookup-row deletes.
// Bank accounts, payment modes, and expense components may be referenced by posted
// transactions; deleting orphans them. Create/update remain role-gated.
const lookupDelete = erpSubAccessCheck('accounting', 'lookup_delete');

// Bank Accounts (protect + tenantFilter already applied at router level in index.js)
router.get('/bank-accounts/my-accounts', bankAccounts.getMyAccounts);
router.get('/bank-accounts', bankAccounts.getAll);
router.post('/bank-accounts', adminFinance, bankAccounts.create);
router.put('/bank-accounts/:id', adminFinance, bankAccounts.update);
router.delete('/bank-accounts/:id', lookupDelete, bankAccounts.remove);

// Payment Modes
router.get('/payment-modes', paymentModes.getAll);
router.post('/payment-modes', adminFinance, paymentModes.create);
router.put('/payment-modes/:id', adminFinance, paymentModes.update);
router.delete('/payment-modes/:id', lookupDelete, paymentModes.remove);

// Expense Components
router.get('/expense-components', expenseComponents.getAll);
router.post('/expense-components', adminFinance, expenseComponents.create);
router.put('/expense-components/:id', adminFinance, expenseComponents.update);
router.delete('/expense-components/:id', lookupDelete, expenseComponents.remove);

module.exports = router;
