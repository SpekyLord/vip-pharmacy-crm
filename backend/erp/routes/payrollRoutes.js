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
  // Phase G1.4 — Finance per-line deduction CRUD
  financeAddDeductionLine,
  verifyDeductionLine,
  removeDeductionLine,
} = require('../controllers/payrollController');

// Phase G4.5aa (Apr 29, 2026) — payslip deduction CRUD gate.
// Allows the existing admin/finance/president path AND opens it to any staff
// user holding the payroll.payslip_deduction_write sub-permission. President
// always bypasses. Subscribers grant the sub-perm via Access Template when they
// want a non-management Finance operator (or a clerk) to add/verify/remove
// employee Payslip deduction lines without granting full PAYROLL module access.
//
// Note: this middleware does NOT widen scope by bdm_id — payslips are owned by
// person_id (PeopleMaster, an employee), NOT bdm_id. The existing entity_id
// scope filter in the controller stays the only tenant boundary.
const payslipDeductionWriteGate = (req, res, next) => {
  if (req.isAdmin || req.isFinance || req.isPresident) return next();
  const subs = req.user?.erp_access?.sub_permissions?.payroll;
  if (subs && subs.payslip_deduction_write) return next();
  return res.status(403).json({
    success: false,
    message: 'Payslip deduction write requires admin/finance/president role OR payroll.payslip_deduction_write sub-permission.'
  });
};

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

// Phase G1.4 — Finance per-line deduction CRUD. Routes are positioned before
// GET /:id and POST /:id/president-reverse so Express's param router resolves
// the longer literal prefix first.
// Role gating: admin | finance | president | staff with payroll.payslip_
// deduction_write sub-perm (Phase G4.5aa, Apr 29 2026 — opens delegation to a
// non-management clerk without granting full PAYROLL access). Period-lock +
// status gate enforced inside the controller.
router.post('/:id/deduction-line', payslipDeductionWriteGate, financeAddDeductionLine);
router.post('/:id/deduction-line/:lineId/verify', payslipDeductionWriteGate, verifyDeductionLine);
router.delete('/:id/deduction-line/:lineId', payslipDeductionWriteGate, removeDeductionLine);

router.get('/:id', getPayslip);

// Phase 31 — President SAP Storno reversal of a POSTED Payslip.
router.post('/:id/president-reverse', erpSubAccessCheck('accounting', 'reverse_posted'), presidentReversePayslip);

module.exports = router;
