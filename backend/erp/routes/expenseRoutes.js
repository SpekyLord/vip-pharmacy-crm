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
  overridePerdiemDay, applyPerdiemOverride, getSmerCrmMdCounts, getSmerCrmVisitDetail,
  // Car Logbook
  createCarLogbook, updateCarLogbook, getCarLogbookList, getCarLogbookById, deleteDraftCarLogbook,
  validateCarLogbook, submitCarLogbook, reopenCarLogbook, getSmerDailyByDate,
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
  getRevolvingFundAmount,
  // Per Diem Config
  getPerdiemConfig,
  // President Reversal (lookup-driven sub-permission: accounting.reverse_posted)
  presidentReverseExpense, presidentReversePrfCalf
} = require('../controllers/expenseController');

const router = express.Router();

// ═══ Summary ═══
router.get('/summary', getExpenseSummary);

// ═══ Revolving Fund ═══
router.get('/revolving-fund-amount', getRevolvingFundAmount);

// ═══ Per Diem Config ═══
router.get('/perdiem-config', getPerdiemConfig);

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
router.post('/smer/:id/override-perdiem', overridePerdiemDay);
router.post('/smer/:id/apply-override', applyPerdiemOverride);

// ═══ Car Logbook ═══
router.post('/car-logbook', createCarLogbook);
router.get('/car-logbook', getCarLogbookList);
router.get('/car-logbook/smer-destination/:date', getSmerDailyByDate);
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

// President-only reverse (lookup-driven: accounting.reverse_posted; baseline = President).
// DRAFT/ERROR/VALID → hard delete; POSTED/DELETION_REQUESTED → SAP Storno (journals reversed,
// deletion_event_id set). Reversal entries land in current open period.
router.post('/ore-access/:id/president-reverse', erpSubAccessCheck('accounting', 'reverse_posted'), presidentReverseExpense);

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

// President-only reverse for CALF / PRF (lookup-driven: accounting.reverse_posted).
// Controller auto-dispatches to CALF or PRF handler based on doc.doc_type so the
// frontend only needs one URL per module (matches Sales/Collection ergonomics).
// CALF: clears linked_expense_id calf refs on non-POSTED expenses, reverses liquidation JE.
// PRF:  clears rebate_prf_id on linked Collection, reverses rebate JE.
// Dependent-doc blocker (checkCalfDependents/checkPrfDependents) runs first.
router.post('/prf-calf/:id/president-reverse', erpSubAccessCheck('accounting', 'reverse_posted'), presidentReversePrfCalf);

module.exports = router;
