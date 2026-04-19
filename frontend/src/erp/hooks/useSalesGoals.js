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

  // ── Phase SG-4 #21 — Plan versioning ───────────────────────────────────
  // Returns { header, versions[] } where versions are SalesGoalPlan rows
  // sorted newest-first. Header.current_version_id points at the active row.
  const listPlanVersions = (planId) => api.get(`/sales-goals/plans/${planId}/versions`);
  // Mints v(N+1). Body may override baseline_revenue / target_revenue /
  // collection_target_pct / growth_drivers / incentive_programs /
  // effective_from. New version starts in DRAFT — caller must POST /activate
  // separately (also gated). The basis must be the latest version.
  const createNewPlanVersion = (basisPlanId, body) => api.post(`/sales-goals/plans/${basisPlanId}/new-version`, body || {});

  // ── Phase SG-4 #22 — Credit Rules (SAP Commissions pattern) ────────────
  const listCreditRules = (params) => api.get('/credit-rules', { params });
  const getCreditRule = (id) => api.get(`/credit-rules/${id}`);
  const createCreditRule = (data) => api.post('/credit-rules', data);
  const updateCreditRule = (id, data) => api.put(`/credit-rules/${id}`, data);
  const deactivateCreditRule = (id) => api.del(`/credit-rules/${id}`);
  // Read-only ledger of SalesCredit rows (audit trail of credit assignments).
  // BDMs see only their own credits; admins/finance/president see all.
  const listSalesCredits = (params) => api.get('/credit-rules/ledger/credits', { params });
  // Re-run the engine for a specific posted sale (admin tool).
  const reassignSaleCredits = (saleLineId) => api.post(`/credit-rules/reassign/${saleLineId}`);

  // ── Phase SG-4 #23 ext — Compensation Statement Archive + Dispatch ────
  const getCompStatementArchive = (params) => api.get('/incentive-payouts/statement/archive', { params });
  const dispatchCompStatements = (data) => api.post('/incentive-payouts/statements/dispatch', data || {});

  // ── Phase SG-5 #26 — What-if / scenario simulator (no DB writes) ───────
  // Body accepts any of: target_revenue_override, baseline_override,
  // driver_weight_overrides {driver_code→weight_pct},
  // tier_attainment_overrides {bdm_id→attainment_pct}.
  const simulatePlan = (planId, overrides) => api.post(`/sales-goals/plans/${planId}/simulate`, overrides || {});

  // ── Phase SG-5 #28 — YoY / QoQ trending (prior vs current fiscal year) ─
  const getTrending = (params) => api.get('/sales-goals/trending', { params });

  // ── Phase SG-5 #27 — Variance Alert Center (persisted alerts + digest) ─
  const listVarianceAlerts = (params) => api.get('/variance-alerts', { params });
  const getVarianceAlertStats = (params) => api.get('/variance-alerts/stats', { params });
  const resolveVarianceAlert = (id, data) => api.post(`/variance-alerts/${id}/resolve`, data || {});

  // ── Phase SG-6 #29 — SOX Control Matrix ────────────────────────────────
  // Read-only live view of every Sales Goal state change + live authorization
  // posture (from MODULE_DEFAULT_ROLES/ERP_SUB_PERMISSIONS/APPROVAL_MODULE
  // lookups) + audit activity + segregation-of-duties findings + integration
  // event registry. Admin/finance/president only.
  const getSoxControlMatrix = (params) => api.get('/sales-goals/sox-control-matrix', { params });
  const soxControlMatrixPrintUrl = (params = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
    });
    const base = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');
    return `${base}/erp/sales-goals/sox-control-matrix/print${qs.toString() ? `?${qs.toString()}` : ''}`;
  };

  // ── Phase SG-6 #31 — Mid-period target revision ────────────────────────
  // Opt-in per entity via MID_PERIOD_REVISION_ENABLED lookup. Returns the
  // updated target with the new TargetRevision entry pushed.
  const reviseTarget = (targetId, data) => api.post(`/sales-goals/targets/${targetId}/revise`, data || {});

  // ── Phase SG-4 #24 — Incentive Disputes (Oracle Fusion workflow) ───────
  const listDisputes = (params) => api.get('/incentive-disputes', { params });
  const getDispute = (id) => api.get(`/incentive-disputes/${id}`);
  const fileDispute = (data) => api.post('/incentive-disputes', data);
  const takeReviewDispute = (id, data) => api.post(`/incentive-disputes/${id}/take-review`, data || {});
  const resolveDispute = (id, data) => api.post(`/incentive-disputes/${id}/resolve`, data || {});
  const closeDispute = (id, data) => api.post(`/incentive-disputes/${id}/close`, data || {});
  const cancelDispute = (id, data) => api.post(`/incentive-disputes/${id}/cancel`, data || {});

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
    // Phase SG-4 #21
    listPlanVersions, createNewPlanVersion,
    // Phase SG-4 #22
    listCreditRules, getCreditRule, createCreditRule, updateCreditRule,
    deactivateCreditRule, listSalesCredits, reassignSaleCredits,
    // Phase SG-4 #23 ext
    getCompStatementArchive, dispatchCompStatements,
    // Phase SG-4 #24
    listDisputes, getDispute, fileDispute,
    takeReviewDispute, resolveDispute, closeDispute, cancelDispute,
    // Phase SG-5 #26, #27, #28
    simulatePlan,
    getTrending,
    listVarianceAlerts, getVarianceAlertStats, resolveVarianceAlert,
    // Phase SG-6 #29, #31
    getSoxControlMatrix, soxControlMatrixPrintUrl,
    reviseTarget,
  };
}
