/**
 * useReports — Frontend hook for Phase 14 Reports & Phase 15 features
 */
import useErpApi from './useErpApi';

export default function useReports() {
  const api = useErpApi();

  // ═══ Phase 14 — Reports & Analytics ═══
  const getPerformanceRanking = (period) => api.get(`/reports/performance-ranking/${period}`);
  const getPerformanceTrend = (personId, params) => api.get(`/reports/performance-ranking/trend/${personId}`, { params });
  const getSalesTracker = (year) => api.get(`/reports/sales-tracker/${year}`);
  const getCollectionsTracker = (year) => api.get(`/reports/collections-tracker/${year}`);
  const getConsignmentAging = (params) => api.get('/reports/consignment-aging', { params });
  const getExpenseAnomalies = (period) => api.get(`/reports/expense-anomalies/${period}`);
  const getBudgetOverruns = (period) => api.get(`/reports/budget-overruns/${period}`);
  const getFuelEfficiency = (period) => api.get(`/reports/fuel-efficiency/${period}`);
  const getCycleStatus = (period) => api.get(`/reports/cycle-status/${period}`);
  const getProductStreaks = (period, params) => api.get(`/reports/product-streaks/${period}`, { params });

  // ═══ Phase 15.2 — CSI Booklets ═══
  const getCsiBooklets = (params) => api.get('/csi-booklets', { params });
  const createBooklet = (data) => api.post('/csi-booklets', data);
  const allocateWeek = (bookletId, data) => api.post(`/csi-booklets/${bookletId}/allocate`, data);
  const validateCsiNumber = (params) => api.get('/csi-booklets/validate', { params });

  // ═══ Phase 15.3 — Cycle Reports ═══
  const getCycleReports = (params) => api.get('/cycle-reports', { params });
  const generateCycleReport = (data) => api.post('/cycle-reports/generate', data);
  const reviewCycleReport = (id, data) => api.patch(`/cycle-reports/${id}/review`, data);
  const confirmCycleReport = (id, data) => api.patch(`/cycle-reports/${id}/confirm`, data);
  const creditCycleReport = (id, data) => api.patch(`/cycle-reports/${id}/credit`, data);

  // ═══ Phase 15.5 — Cost Centers ═══
  const getCostCenters = (params) => api.get('/cost-centers', { params });
  const createCostCenter = (data) => api.post('/cost-centers', data);
  const updateCostCenter = (id, data) => api.put(`/cost-centers/${id}`, data);
  const getCostCenterTree = () => api.get('/cost-centers/tree');
  const exportCostCenters = () => api.get('/cost-centers/export', { responseType: 'blob' });
  const importCostCenters = (formData) => api.post('/cost-centers/import', formData, { headers: { 'Content-Type': 'multipart/form-data' } });

  // ═══ Gap 9 — Rx Correlation ═══
  const getRxCorrelationSummary = (period, params) => api.get(`/rx-correlation/summary/${period}`, { params });
  const getRxPartnerDetail = (period, params) => api.get(`/rx-correlation/partner-detail/${period}`, { params });
  const getRxHospitalStakeholders = (period, params) => api.get(`/rx-correlation/hospital-stakeholders/${period}`, { params });
  const getRxTerritoryDetail = (territoryId, period) => api.get(`/rx-correlation/territory/${territoryId}/${period}`);
  const getRxTimeSeries = (params) => api.get('/rx-correlation/time-series', { params });
  const getRxProgramEffectiveness = (period) => api.get(`/rx-correlation/program-effectiveness/${period}`);
  const getRxSupportEffectiveness = (period) => api.get(`/rx-correlation/support-effectiveness/${period}`);
  const getRxProductMappings = () => api.get('/rx-correlation/product-mappings');
  const createRxProductMapping = (data) => api.post('/rx-correlation/product-mappings', data);
  const deleteRxProductMapping = (id) => api.delete(`/rx-correlation/product-mappings/${id}`);
  const autoMapRxProducts = () => api.post('/rx-correlation/product-mappings/auto-map');
  const getUnmappedRxProducts = () => api.get('/rx-correlation/unmapped-products');

  // ═══ Budget Allocations ═══
  const getBudgetAllocations = (params) => api.get('/budget-allocations', { params });
  const createBudgetAllocation = (data) => api.post('/budget-allocations', data);
  const updateBudgetAllocation = (id, data) => api.put(`/budget-allocations/${id}`, data);
  const approveBudgetAllocation = (id) => api.post(`/budget-allocations/${id}/approve`);

  // ═══ Phase 15.8 — Data Archive ═══
  const triggerArchive = () => api.post('/archive/trigger');
  const getArchiveBatches = () => api.get('/archive/batches');
  const getArchiveBatchDetail = (batchId) => api.get(`/archive/batches/${batchId}`);
  const restoreBatch = (batchId, data) => api.post(`/archive/batches/${batchId}/restore`, data);

  return {
    ...api,
    // Phase 14
    getPerformanceRanking, getPerformanceTrend, getSalesTracker, getCollectionsTracker,
    getConsignmentAging, getExpenseAnomalies, getBudgetOverruns,
    getFuelEfficiency, getCycleStatus, getProductStreaks,
    // Phase 15.2
    getCsiBooklets, createBooklet, allocateWeek, validateCsiNumber,
    // Phase 15.3
    getCycleReports, generateCycleReport, reviewCycleReport, confirmCycleReport, creditCycleReport,
    // Phase 15.5
    getCostCenters, createCostCenter, updateCostCenter, getCostCenterTree, exportCostCenters, importCostCenters,
    // Phase 15.8
    triggerArchive, getArchiveBatches, getArchiveBatchDetail, restoreBatch,
    // Gap 9 — Rx Correlation
    getRxCorrelationSummary, getRxPartnerDetail, getRxHospitalStakeholders,
    getRxTerritoryDetail, getRxTimeSeries, getRxProgramEffectiveness,
    getRxSupportEffectiveness, getRxProductMappings, createRxProductMapping,
    deleteRxProductMapping, autoMapRxProducts, getUnmappedRxProducts,
    // Budget Allocations
    getBudgetAllocations, createBudgetAllocation, updateBudgetAllocation, approveBudgetAllocation
  };
}
