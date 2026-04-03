const express = require('express');
const router = express.Router();
const { roleCheck } = require('../../middleware/roleCheck');
const {
  listAccounts,
  createAccount,
  updateAccount,
  deactivateAccount,
} = require('../controllers/coaController');

// ═══ Chart of Accounts ═══
router.get('/', listAccounts);
router.post('/', roleCheck('admin', 'finance', 'president'), createAccount);
router.put('/:id', roleCheck('admin', 'finance', 'president'), updateAccount);
router.delete('/:id', roleCheck('admin', 'finance', 'president'), deactivateAccount);

module.exports = router;
