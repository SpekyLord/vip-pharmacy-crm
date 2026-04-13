/**
 * Income Routes — Income Reports, PNL, Profit Sharing, Archive & Year-End Close
 *
 * All routes require authentication via protect middleware (applied at router level in index.js)
 * Finance/Admin operations are role-gated via roleCheck.
 *
 * BDM deduction line endpoints gated to 'contractor' role only.
 * Finance deduction verification endpoints gated to admin/finance/president.
 */
const express = require('express');
const { roleCheck } = require('../../middleware/roleCheck');
const periodLockCheck = require('../middleware/periodLockCheck');
const {
  // Income
  generateIncome, getIncomeProjection, requestIncomeGeneration,
  getIncomeList, getIncomeById, updateIncomeManual,
  reviewIncome, returnIncome, confirmIncome, creditIncome,
  // BDM Deduction Lines
  addDeductionLine, removeDeductionLine,
  // Finance Deduction Verification
  verifyDeductionLine, financeAddDeductionLine,
  // PNL
  generatePnl, getPnlList, getPnlById, updatePnlManual, postPnl,
  // Profit Sharing
  getProfitShareStatus, getProfitShareDetail,
  // Archive
  closePeriod, reopenPeriod, getPeriodStatus, getArchiveList,
  // Year-End
  validateYearEnd, executeYearEnd, getFiscalYearStatus
} = require('../controllers/incomeController');

const router = express.Router();

// ═══ Income Reports ═══
router.get('/income/projection', getIncomeProjection);  // Read-only projection (BDMs see own, admin sees any)
router.post('/income/request-generation', roleCheck('contractor'), requestIncomeGeneration);  // BDM self-service (repeatable)
router.post('/income/generate', roleCheck('admin', 'finance', 'president'), generateIncome);
router.get('/income', getIncomeList);
router.get('/income/:id', getIncomeById);
router.put('/income/:id', roleCheck('admin', 'finance', 'president'), updateIncomeManual);
router.post('/income/:id/review', roleCheck('admin', 'finance', 'president'), reviewIncome);
router.post('/income/:id/return', roleCheck('admin', 'finance', 'president'), returnIncome);
router.post('/income/:id/confirm', periodLockCheck('INCOME'), confirmIncome);  // BDM self-confirm
router.post('/income/:id/credit', roleCheck('admin', 'finance', 'president'), periodLockCheck('INCOME'), creditIncome);

// ═══ BDM Deduction Lines (contractor only — not employees) ═══
router.post('/income/:id/deductions', roleCheck('contractor'), addDeductionLine);
router.delete('/income/:id/deductions/:lineId', roleCheck('contractor'), removeDeductionLine);

// ═══ Finance Deduction Verification ═══
router.post('/income/:id/deductions/:lineId/verify', roleCheck('admin', 'finance', 'president'), verifyDeductionLine);
router.post('/income/:id/deductions/finance-add', roleCheck('admin', 'finance', 'president'), financeAddDeductionLine);

// ═══ PNL Reports ═══
router.post('/pnl/generate', roleCheck('admin', 'finance', 'president'), generatePnl);
router.get('/pnl', getPnlList);
router.get('/pnl/:id', getPnlById);
router.put('/pnl/:id', roleCheck('admin', 'finance', 'president'), updatePnlManual);
router.post('/pnl/:id/post', roleCheck('admin', 'finance', 'president'), periodLockCheck('INCOME'), postPnl);

// ═══ Profit Sharing ═══
router.get('/profit-sharing', getProfitShareStatus);
router.get('/profit-sharing/:productId', getProfitShareDetail);

// ═══ Archive & Period Control ═══
router.post('/archive/close-period', roleCheck('admin', 'finance', 'president'), closePeriod);
router.post('/archive/reopen-period', roleCheck('admin', 'finance', 'president'), reopenPeriod);
router.get('/archive/period-status', getPeriodStatus);
router.get('/archive', getArchiveList);

// ═══ Year-End Close ═══
router.get('/archive/year-end/validate', roleCheck('admin', 'finance', 'president'), validateYearEnd);
router.post('/archive/year-end/close', roleCheck('admin', 'finance', 'president'), executeYearEnd);
router.get('/archive/year-end/status', getFiscalYearStatus);

module.exports = router;
