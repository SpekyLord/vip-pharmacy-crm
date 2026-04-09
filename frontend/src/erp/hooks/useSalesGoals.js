import useErpApi from './useErpApi';

export default function useSalesGoals() {
  const api = useErpApi();

  // Plans
  const getPlans = (params) => api.get('/sales-goals/plans', { params });
  const getPlan = (id) => api.get(`/sales-goals/plans/${id}`);
  const createPlan = (data) => api.post('/sales-goals/plans', data);
  const updatePlan = (id, data) => api.put(`/sales-goals/plans/${id}`, data);
  const activatePlan = (id) => api.post(`/sales-goals/plans/${id}/activate`);
  const closePlan = (id) => api.post(`/sales-goals/plans/${id}/close`);

  // Targets
  const getTargets = (params) => api.get('/sales-goals/targets', { params });
  const getMyTarget = (params) => api.get('/sales-goals/targets/mine', { params });
  const createTarget = (data) => api.post('/sales-goals/targets', data);
  const bulkCreateTargets = (data) => api.post('/sales-goals/targets/bulk', data);
  const updateTarget = (id, data) => api.put(`/sales-goals/targets/${id}`, data);

  // Snapshots
  const computeSnapshots = (data) => api.post('/sales-goals/snapshots/compute', data);
  const getSnapshots = (params) => api.get('/sales-goals/snapshots', { params });
  const getMySnapshot = (params) => api.get('/sales-goals/snapshots/mine', { params });

  // Dashboard
  const getGoalDashboard = (params) => api.get('/sales-goals/dashboard', { params });
  const getBdmGoalDetail = (bdmId, params) => api.get(`/sales-goals/dashboard/bdm/${bdmId}`, { params });
  const getDriverSummary = (params) => api.get('/sales-goals/dashboard/drivers', { params });
  const getIncentiveBoard = (params) => api.get('/sales-goals/dashboard/incentives', { params });

  // Actions
  const getActions = (params) => api.get('/sales-goals/actions', { params });
  const getMyActions = (params) => api.get('/sales-goals/actions/mine', { params });
  const createAction = (data) => api.post('/sales-goals/actions', data);
  const updateAction = (id, data) => api.put(`/sales-goals/actions/${id}`, data);
  const completeAction = (id, data) => api.post(`/sales-goals/actions/${id}/complete`, data);

  // Manual KPI
  const enterManualKpi = (data) => api.post('/sales-goals/kpi/manual', data);

  return {
    ...api,
    getPlans, getPlan, createPlan, updatePlan, activatePlan, closePlan,
    getTargets, getMyTarget, createTarget, bulkCreateTargets, updateTarget,
    computeSnapshots, getSnapshots, getMySnapshot,
    getGoalDashboard, getBdmGoalDetail, getDriverSummary, getIncentiveBoard,
    getActions, getMyActions, createAction, updateAction, completeAction,
    enterManualKpi,
  };
}
