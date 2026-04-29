const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { roleCheck } = require('../../middleware/roleCheck');
const { erpSubAccessCheck } = require('../middleware/erpAccessCheck');
const Payslip = require('../models/Payslip');
const {
  canWritePayslipDeduction,
  getEffectiveRoster,
} = require('../utils/resolvePayslipProxy');
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
  // Phase G4.5bb — current-user roster preview
  getMyPayslipProxyRoster,
} = require('../controllers/payrollController');

// Phase G4.5aa (Apr 29, 2026) + Phase G4.5bb (Apr 29, 2026) — payslip
// deduction CRUD gate.
//
// Two-layer gate (in order):
//   1. Privileged (admin/finance/president) → always pass.
//   2. Staff with payroll.payslip_deduction_write sub-perm:
//      a. Pull the payslip's person_id + person_type from the route param.
//      b. Run canWritePayslipDeduction() against the PAYSLIP_PROXY_ROSTER
//         lookup row keyed on the caller's user._id. If the row is missing
//         or scope_mode='ALL', the clerk has entity-wide access (G4.5aa
//         behavior preserved). Otherwise the clerk is constrained to the
//         person_ids/person_types listed in metadata.
//
// The middleware does NOT widen scope by bdm_id — payslips are owned by
// person_id (PeopleMaster, an employee), NOT bdm_id. Tenant boundary remains
// req.entityId (already enforced inside the controller).
const payslipDeductionWriteGate = async (req, res, next) => {
  try {
    if (req.isAdmin || req.isFinance || req.isPresident) return next();
    const subs = req.user?.erp_access?.sub_permissions?.payroll;
    if (!subs || !subs.payslip_deduction_write) {
      return res.status(403).json({
        success: false,
        message: 'Payslip deduction write requires admin/finance/president role OR payroll.payslip_deduction_write sub-permission.'
      });
    }

    // Phase G4.5bb: enforce the per-clerk roster on top of the sub-perm.
    // Defense in depth — controller still re-checks status + period lock.
    const id = req.params.id;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid payslip id' });
    }
    // eslint-disable-next-line vip-tenant/require-entity-filter -- gate-only peek; controller re-checks entity_id on the actual mutation.
    const peek = await Payslip.findById(id)
      .select('person_id entity_id status')
      .populate('person_id', 'person_type')
      .lean();
    if (!peek) {
      return res.status(404).json({ success: false, message: 'Payslip not found' });
    }
    if (String(peek.entity_id) !== String(req.entityId)) {
      // Tenant guard — refuse to leak existence of cross-entity payslips.
      return res.status(404).json({ success: false, message: 'Payslip not found' });
    }
    const decision = await canWritePayslipDeduction(req, peek);
    if (!decision.allowed) {
      return res.status(403).json({
        success: false,
        message: decision.reason || 'Not on payslip-proxy roster.',
        scope_mode: decision.scope_mode || null,
      });
    }
    return next();
  } catch (err) {
    console.error('[payslipDeductionWriteGate] error:', err.message);
    return res.status(500).json({ success: false, message: 'Roster gate error' });
  }
};

// ═══ Payroll Operations (Finance/Admin) ═══
router.post('/compute', roleCheck('admin', 'finance', 'president'), computePayroll);
router.get('/staging', getPayrollStaging);
router.post('/:id/review', roleCheck('admin', 'finance', 'president'), reviewPayslip);
router.post('/:id/approve', roleCheck('admin', 'president'), approvePayslip);
router.post('/post', roleCheck('admin', 'finance', 'president'), postPayroll);
router.post('/thirteenth-month', roleCheck('admin', 'finance', 'president'), computeThirteenthMonth);

// Phase G4.5bb (Apr 29, 2026) — current-user payslip-proxy roster preview.
// Frontend calls this on PayrollRun + PayslipView to know whether to show the
// roster chip / read-only banner. Returns scope_mode ALL / PERSON_IDS /
// PERSON_TYPES OR { allowed: false } if the caller has no sub-perm.
// Position: BEFORE /:id route param so Express matches the literal first.
router.get('/proxy-roster/me', getMyPayslipProxyRoster);

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
