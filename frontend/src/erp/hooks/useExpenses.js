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
  const applyPerdiemOverride = (smerId, data) => api.post(`/expenses/smer/${smerId}/apply-override`, data);

  // ═══ Car Logbook ═══
  const getCarLogbookList = (params) => api.get('/expenses/car-logbook', { params });
  const getCarLogbookById = (id) => api.get(`/expenses/car-logbook/${id}`);
  const createCarLogbook = (data) => api.post('/expenses/car-logbook', data);
  const updateCarLogbook = (id, data) => api.put(`/expenses/car-logbook/${id}`, data);
  const deleteDraftCarLogbook = (id, params) => api.del(`/expenses/car-logbook/${id}`, params ? { params } : undefined);
  // Phase 33: validate/submit accept { period, cycle } to scope to a single wrapper cycle
  const validateCarLogbook = (scope) => api.post('/expenses/car-logbook/validate', scope || {});
  const submitCarLogbook = (scope) => api.post('/expenses/car-logbook/submit', scope || {});
  // Reopen defaults to cycle wrapper ids (CarLogbookCycle._id). Pass kind='day' to
  // reopen legacy per-day CarLogbookEntry ids (backward-compat).
  const reopenCarLogbook = (ids, kind = 'cycle') => {
    const body = kind === 'cycle' ? { cycle_ids: ids } : { logbook_ids: ids };
    return api.post('/expenses/car-logbook/reopen', body);
  };
  // Per-fuel-entry approval (mirrors per-diem override). Submits one fuel_entries[i]
  // for independent Approval Hub routing.
  const submitFuelForApproval = (dayId, fuelId, body) => api.post(`/expenses/car-logbook/${dayId}/fuel/${fuelId}/submit`, body || {});
  // Linked expenses audit under a CALF (fuel + expense lines that reference it).
  const getLinkedExpenses = (calfId) => api.get(`/expenses/prf-calf/${calfId}/linked-expenses`);
  const getSmerDestinationByDate = (date) => api.get(`/expenses/car-logbook/smer-destination/${date}`);
  const getSmerDestinationsBatch = (dates) => api.get('/expenses/car-logbook/smer-destinations', { params: { dates: dates.join(',') } });

  // ═══ ORE / ACCESS ═══
  const getExpenseList = (params) => api.get('/expenses/ore-access', { params });
  const getExpenseById = (id) => api.get(`/expenses/ore-access/${id}`);
  const createExpense = (data) => api.post('/expenses/ore-access', data);
  const updateExpense = (id, data) => api.put(`/expenses/ore-access/${id}`, data);
  const deleteDraftExpense = (id) => api.del(`/expenses/ore-access/${id}`);
  const validateExpenses = () => api.post('/expenses/ore-access/validate', {});
  const submitExpenses = () => api.post('/expenses/ore-access/submit', {});
  const reopenExpenses = (ids) => api.post('/expenses/ore-access/reopen', { expense_ids: ids });

  // ═══ Batch Upload (President/Admin) ═══
  const batchUploadExpenses = (formData) => api.post('/expenses/ore-access/batch-upload', formData, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 180000 });
  const saveBatchExpenses = (data) => api.post('/expenses/ore-access/batch-save', data);

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

  // ═══ Revolving Fund ═══
  const getRevolvingFundAmount = () => api.get('/expenses/revolving-fund-amount');

  // ═══ Per Diem Config ═══
  const getPerdiemConfig = () => api.get('/expenses/perdiem-config');

  // ═══ President Reverse (lookup-driven: accounting.reverse_posted) ═══
  // POSTED/DELETION_REQUESTED → SAP Storno; DRAFT/ERROR/VALID → hard delete.
  // Backend returns { success, message, data: { doc_type, doc_id, mode, ... } }.
  // 409 with `dependents[]` when blocked (e.g., CALF funds POSTED expense).
  const presidentReverseExpense = (id, { reason, confirm }) =>
    api.post(`/expenses/ore-access/${id}/president-reverse`, { reason, confirm });
  const presidentReversePrfCalf = (id, { reason, confirm }) =>
    api.post(`/expenses/prf-calf/${id}/president-reverse`, { reason, confirm });

  return {
    ...api,
    getExpenseSummary,
    // SMER
    getSmerList, getSmerById, createSmer, updateSmer, deleteDraftSmer,
    validateSmer, submitSmer, reopenSmer,
    getSmerCrmMdCounts, getSmerCrmVisitDetail, overridePerdiemDay, applyPerdiemOverride,
    // Car Logbook
    getCarLogbookList, getCarLogbookById, createCarLogbook, updateCarLogbook, deleteDraftCarLogbook,
    validateCarLogbook, submitCarLogbook, reopenCarLogbook, submitFuelForApproval,
    getSmerDestinationByDate, getSmerDestinationsBatch,
    // Phase 33 — CALF linked-expenses audit
    getLinkedExpenses,
    // ORE/ACCESS
    getExpenseList, getExpenseById, createExpense, updateExpense, deleteDraftExpense,
    validateExpenses, submitExpenses, reopenExpenses,
    // PRF/CALF
    getPrfCalfList, getPrfCalfById, createPrfCalf, updatePrfCalf, deleteDraftPrfCalf,
    validatePrfCalf, submitPrfCalf, reopenPrfCalf, getPendingPartnerRebates, getPendingCalfLines,
    // Batch Upload
    batchUploadExpenses, saveBatchExpenses,
    // Revolving Fund
    getRevolvingFundAmount,
    // Per Diem Config
    getPerdiemConfig,
    // President Reverse
    presidentReverseExpense, presidentReversePrfCalf
  };
}
