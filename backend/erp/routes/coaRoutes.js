/**
 * Chart of Accounts Routes — Phase 11, updated Phase 16 (sub-module access)
 */
const express = require('express');
const router = express.Router();
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
const { erpSubAccessCheck } = require('../middleware/erpAccessCheck');
const { roleCheck } = require('../../middleware/roleCheck');
const {
  listAccounts,
  createAccount,
  updateAccount,
  deactivateAccount,
  exportAccounts,
  importAccounts,
  seedDefaultCOA,
} = require('../controllers/coaController');

// ═══ Chart of Accounts ═══
router.post('/seed', roleCheck('admin', 'finance', 'president'), seedDefaultCOA);
router.get('/', listAccounts);
router.get('/export', erpSubAccessCheck('accounting', 'journal_entry'), exportAccounts);
router.post('/import', erpSubAccessCheck('accounting', 'journal_entry'), upload.single('file'), importAccounts);
router.post('/', erpSubAccessCheck('accounting', 'journal_entry'), createAccount);
router.put('/:id', erpSubAccessCheck('accounting', 'journal_entry'), updateAccount);
router.delete('/:id', erpSubAccessCheck('accounting', 'journal_entry'), deactivateAccount);

module.exports = router;
