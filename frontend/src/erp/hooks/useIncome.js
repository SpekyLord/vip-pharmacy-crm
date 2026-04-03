import useErpApi from './useErpApi';

export default function useIncome() {
  const api = useErpApi();

  // ═══ Income Reports ═══
  const generateIncome = (data) => api.post('/income/generate', data);
  const getIncomeList = (params) => api.get('/income', { params });
  const getIncomeById = (id) => api.get(`/income/${id}`);
  const updateIncomeManual = (id, data) => api.put(`/income/${id}`, data);
  const reviewIncome = (id) => api.post(`/income/${id}/review`);
  const returnIncome = (id, reason) => api.post(`/income/${id}/return`, { reason });
  const confirmIncome = (id) => api.post(`/income/${id}/confirm`);
  const creditIncome = (id) => api.post(`/income/${id}/credit`);

  // ═══ PNL Reports ═══
  const generatePnl = (data) => api.post('/pnl/generate', data);
  const getPnlList = (params) => api.get('/pnl', { params });
  const getPnlById = (id) => api.get(`/pnl/${id}`);
  const updatePnlManual = (id, data) => api.put(`/pnl/${id}`, data);
  const postPnl = (id) => api.post(`/pnl/${id}/post`);

  // ═══ Profit Sharing ═══
  const getProfitShareStatus = (params) => api.get('/profit-sharing', { params });
  const getProfitShareDetail = (productId, params) => api.get(`/profit-sharing/${productId}`, { params });

  // ═══ Archive & Period Control ═══
  const closePeriod = (data) => api.post('/archive/close-period', data);
  const reopenPeriod = (data) => api.post('/archive/reopen-period', data);
  const getPeriodStatus = (params) => api.get('/archive/period-status', { params });
  const getArchiveList = (params) => api.get('/archive', { params });

  // ═══ Year-End Close ═══
  const validateYearEnd = (params) => api.get('/archive/year-end/validate', { params });
  const executeYearEnd = (data) => api.post('/archive/year-end/close', data);
  const getFiscalYearStatus = (params) => api.get('/archive/year-end/status', { params });

  return {
    ...api,
    generateIncome, getIncomeList, getIncomeById, updateIncomeManual,
    reviewIncome, returnIncome, confirmIncome, creditIncome,
    generatePnl, getPnlList, getPnlById, updatePnlManual, postPnl,
    getProfitShareStatus, getProfitShareDetail,
    closePeriod, reopenPeriod, getPeriodStatus, getArchiveList,
    validateYearEnd, executeYearEnd, getFiscalYearStatus
  };
}
