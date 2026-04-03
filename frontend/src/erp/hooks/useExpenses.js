import useErpApi from './useErpApi';

export default function useExpenses() {
  const api = useErpApi();

  // ═══ Summary ═══
  const getExpenseSummary = (period, cycle) => api.get('/expenses/summary', { params: { period, cycle } });

  // ═══ SMER ═══
  const getSmerList = (params) => api.get('/expenses/smer', { params });
  const getSmerById = (id) => api.get(`/expenses/smer/${id}`);
  const createSmer = (data) => api.post('/expenses/smer', data);
  const updateSmer = (id, data) => api.put(`/expenses/smer/${id}`, data);
  const deleteDraftSmer = (id) => api.del(`/expenses/smer/${id}`);
  const validateSmer = () => api.post('/expenses/smer/validate', {});
  const submitSmer = () => api.post('/expenses/smer/submit', {});
  const reopenSmer = (ids) => api.post('/expenses/smer/reopen', { smer_ids: ids });
  const getSmerCrmMdCounts = (period, cycle) => api.get('/expenses/smer/crm-md-counts', { params: { period, cycle } });
  const getSmerCrmVisitDetail = (date) => api.get(`/expenses/smer/crm-visits/${date}`);
  const overridePerdiemDay = (smerId, data) => api.post(`/expenses/smer/${smerId}/override-perdiem`, data);

  // ═══ Car Logbook ═══
  const getCarLogbookList = (params) => api.get('/expenses/car-logbook', { params });
  const getCarLogbookById = (id) => api.get(`/expenses/car-logbook/${id}`);
  const createCarLogbook = (data) => api.post('/expenses/car-logbook', data);
  const updateCarLogbook = (id, data) => api.put(`/expenses/car-logbook/${id}`, data);
  const deleteDraftCarLogbook = (id) => api.del(`/expenses/car-logbook/${id}`);
  const validateCarLogbook = () => api.post('/expenses/car-logbook/validate', {});
  const submitCarLogbook = () => api.post('/expenses/car-logbook/submit', {});
  const reopenCarLogbook = (ids) => api.post('/expenses/car-logbook/reopen', { logbook_ids: ids });

  // ═══ ORE / ACCESS ═══
  const getExpenseList = (params) => api.get('/expenses/ore-access', { params });
  const getExpenseById = (id) => api.get(`/expenses/ore-access/${id}`);
  const createExpense = (data) => api.post('/expenses/ore-access', data);
  const updateExpense = (id, data) => api.put(`/expenses/ore-access/${id}`, data);
  const deleteDraftExpense = (id) => api.del(`/expenses/ore-access/${id}`);
  const validateExpenses = () => api.post('/expenses/ore-access/validate', {});
  const submitExpenses = () => api.post('/expenses/ore-access/submit', {});
  const reopenExpenses = (ids) => api.post('/expenses/ore-access/reopen', { expense_ids: ids });

  // ═══ PRF / CALF ═══
  const getPrfCalfList = (params) => api.get('/expenses/prf-calf', { params });
  const getPrfCalfById = (id) => api.get(`/expenses/prf-calf/${id}`);
  const createPrfCalf = (data) => api.post('/expenses/prf-calf', data);
  const updatePrfCalf = (id, data) => api.put(`/expenses/prf-calf/${id}`, data);
  const deleteDraftPrfCalf = (id) => api.del(`/expenses/prf-calf/${id}`);
  const validatePrfCalf = () => api.post('/expenses/prf-calf/validate', {});
  const submitPrfCalf = () => api.post('/expenses/prf-calf/submit', {});
  const reopenPrfCalf = (ids) => api.post('/expenses/prf-calf/reopen', { prf_calf_ids: ids });
  const getPendingPartnerRebates = () => api.get('/expenses/prf-calf/pending-rebates');
  const getPendingCalfLines = () => api.get('/expenses/prf-calf/pending-calf');

  return {
    ...api,
    getExpenseSummary,
    // SMER
    getSmerList, getSmerById, createSmer, updateSmer, deleteDraftSmer,
    validateSmer, submitSmer, reopenSmer,
    getSmerCrmMdCounts, getSmerCrmVisitDetail, overridePerdiemDay,
    // Car Logbook
    getCarLogbookList, getCarLogbookById, createCarLogbook, updateCarLogbook, deleteDraftCarLogbook,
    validateCarLogbook, submitCarLogbook, reopenCarLogbook,
    // ORE/ACCESS
    getExpenseList, getExpenseById, createExpense, updateExpense, deleteDraftExpense,
    validateExpenses, submitExpenses, reopenExpenses,
    // PRF/CALF
    getPrfCalfList, getPrfCalfById, createPrfCalf, updatePrfCalf, deleteDraftPrfCalf,
    validatePrfCalf, submitPrfCalf, reopenPrfCalf, getPendingPartnerRebates, getPendingCalfLines
  };
}
