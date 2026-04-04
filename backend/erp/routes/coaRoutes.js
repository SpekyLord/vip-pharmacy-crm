/**
 * Chart of Accounts Routes — Phase 11, updated Phase 16 (sub-module access)
 */
const express = require('express');
const router = express.Router();
const { erpSubAccessCheck } = require('../middleware/erpAccessCheck');
const {
  listAccounts,
  createAccount,
  updateAccount,
  deactivateAccount,
} = require('../controllers/coaController');

// ═══ Chart of Accounts ═══
router.get('/', listAccounts);
router.post('/', erpSubAccessCheck('accounting', 'journal_entry'), createAccount);
router.put('/:id', erpSubAccessCheck('accounting', 'journal_entry'), updateAccount);
router.delete('/:id', erpSubAccessCheck('accounting', 'journal_entry'), deactivateAccount);

module.exports = router;
