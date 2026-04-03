import useErpApi from './useErpApi';

export default function useDashboard() {
  const api = useErpApi();

  const getSummary = () => api.get('/dashboard/summary');
  const getMtd = () => api.get('/dashboard/mtd');
  const getPnlYtd = () => api.get('/dashboard/pnl-ytd');
  const getProducts = () => api.get('/dashboard/products');
  const getHospitals = () => api.get('/dashboard/hospitals');
  const getSalesSummary = (params) => api.get('/dashboard/sales-summary', { params });
  const getCollectionSummary = (params) => api.get('/dashboard/collection-summary', { params });
  const getExpenseSummary = (params) => api.get('/dashboard/expense-summary', { params });
  const getAuditLogs = (params) => api.get('/dashboard/audit-logs', { params });
  const getMonthlyArchives = () => api.get('/dashboard/monthly-archive');
  const getSystemHealth = () => api.get('/dashboard/system-health');

  return {
    ...api,
    getSummary, getMtd, getPnlYtd,
    getProducts, getHospitals,
    getSalesSummary, getCollectionSummary, getExpenseSummary,
    getAuditLogs, getMonthlyArchives, getSystemHealth
  };
}
