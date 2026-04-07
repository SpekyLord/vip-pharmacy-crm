const express = require('express');
const router = express.Router();
const { roleCheck } = require('../../middleware/roleCheck');
const {
  computePayroll,
  getPayrollStaging,
  reviewPayslip,
  approvePayslip,
  postPayroll,
  getPayslip,
  getPayslipHistory,
  computeThirteenthMonth,
} = require('../controllers/payrollController');

// ═══ Payroll Operations (Finance/Admin) ═══
router.post('/compute', roleCheck('admin', 'finance', 'president'), computePayroll);
router.get('/staging', getPayrollStaging);
router.post('/:id/review', roleCheck('admin', 'finance', 'president'), reviewPayslip);
router.post('/:id/approve', roleCheck('admin', 'president'), approvePayslip);
router.post('/post', roleCheck('admin', 'finance', 'president'), postPayroll);
router.post('/thirteenth-month', roleCheck('admin', 'finance', 'president'), computeThirteenthMonth);

// ═══ Read ═══
router.get('/history/:personId', getPayslipHistory);
router.get('/:id', getPayslip);

module.exports = router;
