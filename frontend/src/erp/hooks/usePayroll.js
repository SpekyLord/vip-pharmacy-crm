import useErpApi from './useErpApi';

export default function usePayroll() {
  const api = useErpApi();

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
  };
}
