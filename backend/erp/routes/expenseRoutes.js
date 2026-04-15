/**
 * Expense Routes — SMER, Car Logbook, ORE/ACCESS, PRF/CALF
 *
 * All routes require authentication via protect middleware (applied at router level in index.js)
 * All transactional documents follow DRAFT → VALID → ERROR → POSTED lifecycle
 * PRF/CALF posting requires admin/finance/president role (Finance processes payment)
 */
const express = require('express');
const { roleCheck } = require('../../middleware/roleCheck');
const { erpSubAccessCheck } = require('../middleware/erpAccessCheck');
const periodLockCheck = require('../middleware/periodLockCheck');
const { uploadMultiple } = require('../../middleware/upload');
const {
  // SMER
  createSmer, updateSmer, getSmerList, getSmerById, deleteDraftSmer,
  validateSmer, submitSmer, reopenSmer,
  overridePerdiemDay, getSmerCrmMdCounts, getSmerCrmVisitDetail,
  // Car Logbook
  createCarLogbook, updateCarLogbook, getCarLogbookList, getCarLogbookById, deleteDraftCarLogbook,
  validateCarLogbook, submitCarLogbook, reopenCarLogbook,
  // Expenses (ORE/ACCESS)
  createExpense, updateExpense, getExpenseList, getExpenseById, deleteDraftExpense,
  validateExpenses, submitExpenses, reopenExpenses,
  // PRF/CALF
  createPrfCalf, updatePrfCalf, getPrfCalfList, getPrfCalfById, deleteDraftPrfCalf,
  validatePrfCalf, submitPrfCalf, reopenPrfCalf, getPendingPartnerRebates, getPendingCalfLines,
  // Batch Upload
  batchUploadExpenses, saveBatchExpenses,
  // Summary
  getExpenseSummary,
  // Revolving Fund
  getRevolvingFundAmount
} = require('../controllers/expenseController');

const router = express.Router();

// ═══ Summary ═══
router.get('/summary', getExpenseSummary);

// ═══ Revolving Fund ═══
router.get('/revolving-fund-amount', getRevolvingFundAmount);

// ═══ SMER ═══
router.post('/smer', createSmer);
router.get('/smer', getSmerList);
router.get('/smer/crm-md-counts', getSmerCrmMdCounts);       // CRM bridge: auto-populate MD counts
router.get('/smer/crm-visits/:date', getSmerCrmVisitDetail);  // CRM bridge: drill-down visit detail
router.post('/smer/validate', validateSmer);
router.post('/smer/submit', periodLockCheck('EXPENSE'), submitSmer);
router.post('/smer/reopen', periodLockCheck('EXPENSE'), reopenSmer);
router.get('/smer/:id', getSmerById);
router.put('/smer/:id', updateSmer);
router.delete('/smer/:id', deleteDraftSmer);  // DRAFT only — backend enforces status check
router.post('/smer/:id/override-perdiem', roleCheck('admin', 'finance', 'president'), overridePerdiemDay);

// ═══ Car Logbook ═══
router.post('/car-logbook', createCarLogbook);
router.get('/car-logbook', getCarLogbookList);
router.post('/car-logbook/validate', validateCarLogbook);
router.post('/car-logbook/submit', periodLockCheck('EXPENSE'), submitCarLogbook);
router.post('/car-logbook/reopen', periodLockCheck('EXPENSE'), reopenCarLogbook);
router.get('/car-logbook/:id', getCarLogbookById);
router.put('/car-logbook/:id', updateCarLogbook);
router.delete('/car-logbook/:id', deleteDraftCarLogbook);  // DRAFT only

// ═══ Batch Upload (requires expenses.batch_upload sub-permission) ═══
router.post('/ore-access/batch-upload', erpSubAccessCheck('expenses', 'batch_upload'), uploadMultiple('photos', 20), batchUploadExpenses);
router.post('/ore-access/batch-save', erpSubAccessCheck('expenses', 'batch_upload'), saveBatchExpenses);

// ═══ ORE / ACCESS Expenses ═══
router.post('/ore-access', createExpense);
router.get('/ore-access', getExpenseList);
router.post('/ore-access/validate', validateExpenses);
router.post('/ore-access/submit', periodLockCheck('EXPENSE'), submitExpenses);
router.post('/ore-access/reopen', periodLockCheck('EXPENSE'), reopenExpenses);
router.get('/ore-access/:id', getExpenseById);
router.put('/ore-access/:id', updateExpense);
router.delete('/ore-access/:id', deleteDraftExpense);  // DRAFT only

// ═══ PRF / CALF ═══
// BDMs can post CALF (liquidation) and personal PRF. Partner rebate PRF still requires Finance.
// Re-open requires admin/finance/president.
router.get('/prf-calf/pending-rebates', getPendingPartnerRebates);
router.get('/prf-calf/pending-calf', getPendingCalfLines);
router.post('/prf-calf', createPrfCalf);
router.get('/prf-calf', getPrfCalfList);
router.post('/prf-calf/validate', validatePrfCalf);
router.post('/prf-calf/submit', periodLockCheck('EXPENSE'), submitPrfCalf);
router.post('/prf-calf/reopen', periodLockCheck('EXPENSE'), roleCheck('admin', 'finance', 'president'), reopenPrfCalf);
router.get('/prf-calf/:id', getPrfCalfById);
router.put('/prf-calf/:id', periodLockCheck('EXPENSE'), updatePrfCalf);
router.delete('/prf-calf/:id', deleteDraftPrfCalf);  // DRAFT only

module.exports = router;
