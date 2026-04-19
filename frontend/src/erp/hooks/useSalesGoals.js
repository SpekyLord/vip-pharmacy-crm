import useErpApi from './useErpApi';

export default function useSalesGoals() {
  const api = useErpApi();

  // Plans
  const getPlans = (params) => api.get('/sales-goals/plans', { params });
  const getPlan = (id) => api.get(`/sales-goals/plans/${id}`);
  const createPlan = (data) => api.post('/sales-goals/plans', data);
  const updatePlan = (id, data) => api.put(`/sales-goals/plans/${id}`, data);
  const activatePlan = (id) => api.post(`/sales-goals/plans/${id}/activate`);
  const reopenPlan = (id) => api.post(`/sales-goals/plans/${id}/reopen`);
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

  // ── Phase SG-Q2 W2 — Incentive Payouts ────────────────────────────────
  const getPayouts = (params) => api.get('/incentive-payouts', { params });
  const getPayout = (id) => api.get(`/incentive-payouts/${id}`);
  const getMyPayouts = (params) => api.get('/incentive-payouts/mine', { params });
  const getPayablePayouts = (params) => api.get('/incentive-payouts/payable', { params });
  const approvePayout = (id, data) => api.post(`/incentive-payouts/${id}/approve`, data || {});
  const payPayout = (id, data) => api.post(`/incentive-payouts/${id}/pay`, data || {});
  const reversePayout = (id, data) => api.post(`/incentive-payouts/${id}/reverse`, data || {});

  // ── Phase SG-3R — KPI Template library (reusable plan defaults) ───────
  // Templates are advisory; plan creation copies them. Backend is entity-scoped.
  const listKpiTemplates = (params) => api.get('/kpi-templates', { params });
  const getKpiTemplate = (id) => api.get(`/kpi-templates/${id}`);
  const createKpiTemplate = (data) => api.post('/kpi-templates', data);
  const updateKpiTemplate = (id, data) => api.put(`/kpi-templates/${id}`, data);
  // useErpApi exposes `del` (not `delete` — reserved word avoidance).
  const deleteKpiTemplate = (id) => api.del(`/kpi-templates/${id}`);
  const deleteKpiTemplateSet = (name) => api.del(`/kpi-templates/set/${encodeURIComponent(name)}`);

  // ── Phase SG-3R — Bulk Excel import of targets ─────────────────────────
  // POST multipart/form-data with field `file`. Returns per-row errors.
  const importTargets = (formData) => api.post('/sales-goals/targets/import', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });

  // ── Phase SG-3R — President-Reverse on a Sales Goal plan ───────────────
  const presidentReversePlan = (id, data) => api.post(`/sales-goals/plans/${id}/president-reverse`, data || {});

  // ── Phase SG-Q2 W3 — Compensation Statement (BDM-facing) ───────────────
  // Returns { bdm, plan, entity, fiscal_year, period, summary, periods, tier, rows }
  // BDMs see only their own; finance/admin/president pass ?bdm_id=. The print
  // route returns HTML that the browser turns into a PDF via window.print().
  const getCompensationStatement = (params) => api.get('/incentive-payouts/statement', { params });
  // Build the printable URL for window.open(). The print route returns HTML
  // that the browser turns into a PDF via the in-page Print button (window.print()).
  // Auth is cookie-based (httpOnly) so opening in a new window inherits the session
  // automatically — no token-passing needed.
  //
  // Base prefix mirrors api.js getApiUrl(): VITE_API_URL when set, else `/api`
  // so Vite's dev proxy resolves it to the backend.
  const compensationStatementPrintUrl = (params = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
    });
    const base = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');
    return `${base}/erp/incentive-payouts/statement/print${qs.toString() ? `?${qs.toString()}` : ''}`;
  };

  return {
    ...api,
    getPlans, getPlan, createPlan, updatePlan, activatePlan, reopenPlan, closePlan,
    getTargets, getMyTarget, createTarget, bulkCreateTargets, updateTarget,
    computeSnapshots, getSnapshots, getMySnapshot,
    getGoalDashboard, getBdmGoalDetail, getDriverSummary, getIncentiveBoard,
    getActions, getMyActions, createAction, updateAction, completeAction,
    enterManualKpi,
    getPayouts, getPayout, getMyPayouts, getPayablePayouts,
    approvePayout, payPayout, reversePayout,
    // Phase SG-Q2 W3
    getCompensationStatement, compensationStatementPrintUrl,
    // Phase SG-3R
    listKpiTemplates, getKpiTemplate, createKpiTemplate, updateKpiTemplate,
    deleteKpiTemplate, deleteKpiTemplateSet,
    importTargets, presidentReversePlan,
  };
}
