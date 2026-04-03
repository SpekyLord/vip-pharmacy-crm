/**
 * Expense Routes — SMER, Car Logbook, ORE/ACCESS, PRF/CALF
 *
 * All routes require authentication via protect middleware (applied at router level in index.js)
 * All transactional documents follow DRAFT → VALID → ERROR → POSTED lifecycle
 * PRF/CALF posting requires admin/finance/president role (Finance processes payment)
 */
const express = require('express');
const { roleCheck } = require('../../middleware/roleCheck');
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
  validatePrfCalf, submitPrfCalf, reopenPrfCalf,
  // Summary
  getExpenseSummary
} = require('../controllers/expenseController');

const router = express.Router();

// ═══ Summary ═══
router.get('/summary', getExpenseSummary);

// ═══ SMER ═══
router.post('/smer', createSmer);
router.get('/smer', getSmerList);
router.get('/smer/crm-md-counts', getSmerCrmMdCounts);       // CRM bridge: auto-populate MD counts
router.get('/smer/crm-visits/:date', getSmerCrmVisitDetail);  // CRM bridge: drill-down visit detail
router.post('/smer/validate', validateSmer);
router.post('/smer/submit', submitSmer);
router.post('/smer/reopen', reopenSmer);
router.get('/smer/:id', getSmerById);
router.put('/smer/:id', updateSmer);
router.delete('/smer/:id', deleteDraftSmer);
router.post('/smer/:id/override-perdiem', roleCheck('admin', 'finance', 'president'), overridePerdiemDay);

// ═══ Car Logbook ═══
router.post('/car-logbook', createCarLogbook);
router.get('/car-logbook', getCarLogbookList);
router.post('/car-logbook/validate', validateCarLogbook);
router.post('/car-logbook/submit', submitCarLogbook);
router.post('/car-logbook/reopen', reopenCarLogbook);
router.get('/car-logbook/:id', getCarLogbookById);
router.put('/car-logbook/:id', updateCarLogbook);
router.delete('/car-logbook/:id', deleteDraftCarLogbook);

// ═══ ORE / ACCESS Expenses ═══
router.post('/ore-access', createExpense);
router.get('/ore-access', getExpenseList);
router.post('/ore-access/validate', validateExpenses);
router.post('/ore-access/submit', submitExpenses);
router.post('/ore-access/reopen', reopenExpenses);
router.get('/ore-access/:id', getExpenseById);
router.put('/ore-access/:id', updateExpense);
router.delete('/ore-access/:id', deleteDraftExpense);

// ═══ PRF / CALF ═══
// BDM creates, Finance posts (payment processed / liquidation confirmed)
router.post('/prf-calf', createPrfCalf);
router.get('/prf-calf', getPrfCalfList);
router.post('/prf-calf/validate', validatePrfCalf);
router.post('/prf-calf/submit', roleCheck('admin', 'finance', 'president'), submitPrfCalf);
router.post('/prf-calf/reopen', roleCheck('admin', 'finance', 'president'), reopenPrfCalf);
router.get('/prf-calf/:id', getPrfCalfById);
router.put('/prf-calf/:id', updatePrfCalf);
router.delete('/prf-calf/:id', deleteDraftPrfCalf);

module.exports = router;
