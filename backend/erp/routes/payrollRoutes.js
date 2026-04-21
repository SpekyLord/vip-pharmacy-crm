const express = require('express');
const router = express.Router();
const { roleCheck } = require('../../middleware/roleCheck');
const { erpSubAccessCheck } = require('../middleware/erpAccessCheck');
const {
  computePayroll,
  getPayrollStaging,
  reviewPayslip,
  approvePayslip,
  postPayroll,
  getPayslip,
  getPayslipBreakdown,
  getPayslipHistory,
  computeThirteenthMonth,
  presidentReversePayslip,
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
// Phase G1.3 — transparent payslip breakdown. Must precede /:id to avoid the
// Express param match swallowing "breakdown" as an id.
router.get('/:id/breakdown', getPayslipBreakdown);
router.get('/:id', getPayslip);

// Phase 31 — President SAP Storno reversal of a POSTED Payslip.
router.post('/:id/president-reverse', erpSubAccessCheck('accounting', 'reverse_posted'), presidentReversePayslip);

module.exports = router;
