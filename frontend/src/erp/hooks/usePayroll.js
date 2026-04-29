import useErpApi from './useErpApi';
import { useAuth } from '../../hooks/useAuth';
import { ROLE_SETS } from '../../constants/roles';

export default function usePayroll() {
  const api = useErpApi();
  const { user } = useAuth();

  // Phase G4.5cc (Apr 29, 2026) — derive whether the current user can drive the
  // clerk-run-payroll path. PRIVILEGED short-circuit (admin/finance/president)
  // OR explicit `payroll.run_proxy` sub-permission tick. Frontend uses these
  // booleans to decide whether to render Compute + Submit buttons + the purple
  // info banner above the period bar. The backend `payrollRunProxyGate` is the
  // authoritative gate; this hook only drives UI affordances.
  const isPrivileged = !!user && ROLE_SETS.MANAGEMENT.includes(user.role);
  const hasRunProxy = !!user?.erp_access?.sub_permissions?.payroll?.run_proxy;
  const canRunPayroll = isPrivileged || hasRunProxy;

  const computePayroll = (data) => api.post('/payroll/compute', data);
  const getPayrollStaging = (params) => api.get('/payroll/staging', { params });
  const reviewPayslip = (id) => api.post(`/payroll/${id}/review`);
  const approvePayslip = (id) => api.post(`/payroll/${id}/approve`);
  const postPayroll = (data) => api.post('/payroll/post', data);
  const getPayslip = (id) => api.get(`/payroll/${id}`);
  // Phase G1.3 — transparent payslip breakdown (Car Logbook entries, etc.)
  const getPayslipBreakdown = (id) => api.get(`/payroll/${id}/breakdown`);
  const getPayslipHistory = (personId, params) => api.get(`/payroll/history/${personId}`, { params });
  const computeThirteenthMonth = (data) => api.post('/payroll/thirteenth-month', data);

  // Phase G1.4 — Finance per-line deduction CRUD (parity with contractor Income).
  // data shape: { deduction_type, deduction_label, amount, description?, finance_note? }
  const addPayslipDeductionLine = (id, data) => api.post(`/payroll/${id}/deduction-line`, data);
  // action: 'verify' | 'correct' | 'reject'
  // data shape: { action, amount?, finance_note? }
  const verifyPayslipDeductionLine = (id, lineId, data) =>
    api.post(`/payroll/${id}/deduction-line/${lineId}/verify`, data);
  const removePayslipDeductionLine = (id, lineId) =>
    api.delete(`/payroll/${id}/deduction-line/${lineId}`);

  // Phase G4.5bb — current-user payslip-proxy roster preview. Returns:
  //   { allowed: true, privileged?, scope_mode: 'ALL'|'PERSON_IDS'|'PERSON_TYPES',
  //     has_row, person_ids, person_types, people, note }
  // OR { allowed: false, reason } when the caller has no sub-perm.
  const getMyPayslipProxyRoster = () => api.get('/payroll/proxy-roster/me');

  return {
    ...api,
    computePayroll,
    getPayrollStaging,
    reviewPayslip,
    approvePayslip,
    postPayroll,
    getPayslip,
    getPayslipBreakdown,
    getPayslipHistory,
    computeThirteenthMonth,
    // Phase G1.4
    addPayslipDeductionLine,
    verifyPayslipDeductionLine,
    removePayslipDeductionLine,
    // Phase G4.5bb
    getMyPayslipProxyRoster,
    // Phase G4.5cc — clerk-run authority surface (UI affordance only; backend gate is authoritative)
    isPrivileged,
    hasRunProxy,
    canRunPayroll,
  };
}
