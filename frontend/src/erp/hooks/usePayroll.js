import useErpApi from './useErpApi';

export default function usePayroll() {
  const api = useErpApi();

  const computePayroll = (data) => api.post('/payroll/compute', data);
  const getPayrollStaging = (params) => api.get('/payroll/staging', { params });
  const reviewPayslip = (id) => api.post(`/payroll/${id}/review`);
  const approvePayslip = (id) => api.post(`/payroll/${id}/approve`);
  const postPayroll = (data) => api.post('/payroll/post', data);
  const getPayslip = (id) => api.get(`/payroll/${id}`);
  const getPayslipHistory = (personId, params) => api.get(`/payroll/history/${personId}`, { params });
  const computeThirteenthMonth = (data) => api.post('/payroll/thirteenth-month', data);

  return {
    ...api,
    computePayroll,
    getPayrollStaging,
    reviewPayslip,
    approvePayslip,
    postPayroll,
    getPayslip,
    getPayslipHistory,
    computeThirteenthMonth,
  };
}
