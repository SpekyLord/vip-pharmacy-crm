/**
 * Income Routes — Income Reports, PNL, Profit Sharing, Archive & Year-End Close
 *
 * All routes require authentication via protect middleware (applied at router level in index.js)
 * Finance/Admin operations are role-gated via roleCheck.
 */
const express = require('express');
const { roleCheck } = require('../../middleware/roleCheck');
const {
  // Income
  generateIncome, getIncomeList, getIncomeById, updateIncomeManual,
  reviewIncome, returnIncome, confirmIncome, creditIncome,
  // PNL
  generatePnl, getPnlList, getPnlById, updatePnlManual, postPnl,
  // Profit Sharing
  getProfitShareStatus, getProfitShareDetail,
  // Archive
  closePeriod, getPeriodStatus, getArchiveList,
  // Year-End
  validateYearEnd, executeYearEnd, getFiscalYearStatus
} = require('../controllers/incomeController');

const router = express.Router();

// ═══ Income Reports ═══
router.post('/income/generate', roleCheck('admin', 'finance', 'president'), generateIncome);
router.get('/income', getIncomeList);
router.get('/income/:id', getIncomeById);
router.put('/income/:id', roleCheck('admin', 'finance', 'president'), updateIncomeManual);
router.post('/income/:id/review', roleCheck('admin', 'finance', 'president'), reviewIncome);
router.post('/income/:id/return', roleCheck('admin', 'finance', 'president'), returnIncome);
router.post('/income/:id/confirm', confirmIncome);  // BDM self-confirm
router.post('/income/:id/credit', roleCheck('admin', 'finance', 'president'), creditIncome);

// ═══ PNL Reports ═══
router.post('/pnl/generate', roleCheck('admin', 'finance', 'president'), generatePnl);
router.get('/pnl', getPnlList);
router.get('/pnl/:id', getPnlById);
router.put('/pnl/:id', roleCheck('admin', 'finance', 'president'), updatePnlManual);
router.post('/pnl/:id/post', roleCheck('admin', 'finance', 'president'), postPnl);

// ═══ Profit Sharing ═══
router.get('/profit-sharing', getProfitShareStatus);
router.get('/profit-sharing/:productId', getProfitShareDetail);

// ═══ Archive & Period Control ═══
router.post('/archive/close-period', roleCheck('admin', 'finance', 'president'), closePeriod);
router.get('/archive/period-status', getPeriodStatus);
router.get('/archive', getArchiveList);

// ═══ Year-End Close ═══
router.get('/archive/year-end/validate', roleCheck('admin', 'finance', 'president'), validateYearEnd);
router.post('/archive/year-end/close', roleCheck('admin', 'finance', 'president'), executeYearEnd);
router.get('/archive/year-end/status', getFiscalYearStatus);

module.exports = router;
