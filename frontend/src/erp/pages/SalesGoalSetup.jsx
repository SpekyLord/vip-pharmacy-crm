/**
 * SalesGoalSetup — Phase 28 Plan & target configuration page.
 * President/admin creates plans, growth drivers, entity & BDM targets, incentive programs.
 */
import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import { useAuth } from '../../hooks/useAuth';
import api from '../../services/api';
import useSalesGoals from '../hooks/useSalesGoals';
import useEntities from '../hooks/useEntities';
import { useLookupBatch } from '../hooks/useLookups';
import WorkflowGuide from '../components/WorkflowGuide';
import RejectionBanner from '../components/RejectionBanner';
import { showError, showSuccess, showApprovalPending, isApprovalPending } from '../utils/errorToast';

const php = (n) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 }).format(n || 0);

const pageStyles = `
  .sgs-page { background: var(--erp-bg, #f4f7fb); min-height: 100vh; }
  .sgs-main { flex: 1; min-width: 0; overflow-y: auto; padding: 20px; max-width: 1400px; margin: 0 auto; }
  .sgs-header { margin-bottom: 20px; }
  .sgs-header h1 { font-size: 22px; color: var(--erp-text); margin: 0 0 4px; }
  .sgs-header p { color: var(--erp-muted); font-size: 13px; margin: 0; }
  .sgs-actions { display: flex; gap: 8px; margin-top: 10px; align-items: center; flex-wrap: wrap; }
  .sgs-tab-bar { display: flex; gap: 2px; margin-bottom: 16px; background: var(--erp-border, #e5e7eb); border-radius: 10px; padding: 3px; }
  .sgs-tab { flex: 1; padding: 8px 12px; border: none; border-radius: 8px; font-size: 12px; font-weight: 600; cursor: pointer; background: transparent; color: var(--erp-muted); transition: all 0.15s; text-align: center; }
  .sgs-tab.active { background: var(--erp-panel, #fff); color: var(--erp-accent, #2563eb); box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
  .sgs-panel { background: var(--erp-panel, #fff); border: 1px solid var(--erp-border, #e5e7eb); border-radius: 14px; padding: 20px; margin-bottom: 16px; }
  .sgs-panel h3 { font-size: 15px; font-weight: 700; color: var(--erp-text); margin: 0 0 16px; }
  .sgs-form-row { display: flex; gap: 12px; margin-bottom: 12px; flex-wrap: wrap; }
  .sgs-field { display: flex; flex-direction: column; gap: 4px; flex: 1; min-width: 180px; }
  .sgs-field label { font-size: 12px; font-weight: 600; color: var(--erp-muted); }
  .sgs-field input, .sgs-field select, .sgs-field textarea { padding: 8px 12px; border: 1px solid var(--erp-border); border-radius: 8px; font-size: 13px; background: var(--erp-panel, #fff); color: var(--erp-text); }
  .sgs-field textarea { min-height: 60px; resize: vertical; }
  .sgs-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .sgs-table th { text-align: left; padding: 8px 10px; background: var(--erp-accent-soft, #eef2ff); font-weight: 600; white-space: nowrap; color: var(--erp-text); }
  .sgs-table td { padding: 8px 10px; border-top: 1px solid var(--erp-border); color: var(--erp-text); }
  .sgs-table td.num { text-align: right; font-variant-numeric: tabular-nums; }
  .sgs-table input, .sgs-table select { width: 100%; padding: 6px 8px; border: 1px solid var(--erp-border); border-radius: 6px; font-size: 13px; background: var(--erp-panel); color: var(--erp-text); box-sizing: border-box; }
  .sgs-btn { padding: 8px 16px; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; }
  .sgs-btn-primary { background: var(--erp-accent, #2563eb); color: white; }
  .sgs-btn-success { background: #22c55e; color: white; }
  .sgs-btn-danger { background: #ef4444; color: white; }
  .sgs-btn-outline { background: transparent; border: 1px solid var(--erp-border); color: var(--erp-text); }
  .sgs-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .sgs-btn-sm { padding: 4px 10px; font-size: 12px; }
  .sgs-validation { background: #fef9c3; border: 1px solid #fde68a; border-radius: 8px; padding: 10px 14px; font-size: 12px; color: #854d0e; margin-top: 8px; font-weight: 500; }
  .sgs-validation.ok { background: #dcfce7; border-color: #86efac; color: #166534; }
  .sgs-status-badge { display: inline-block; padding: 3px 10px; border-radius: 10px; font-size: 11px; font-weight: 700; text-transform: uppercase; }
  .sgs-driver-section { border: 1px solid var(--erp-border); border-radius: 10px; padding: 14px; margin-bottom: 12px; background: var(--erp-bg, #f4f7fb); }
  .sgs-kpi-row { display: flex; gap: 8px; align-items: center; margin-top: 6px; flex-wrap: wrap; }
  .sgs-kpi-row input, .sgs-kpi-row select { flex: 1; min-width: 120px; padding: 6px 8px; border: 1px solid var(--erp-border); border-radius: 6px; font-size: 13px; background: var(--erp-panel); color: var(--erp-text); box-sizing: border-box; }
  .loading { text-align: center; padding: 40px; color: var(--erp-muted); }
  @media(max-width: 768px) { .sgs-main { padding: 12px; } .sgs-form-row { flex-direction: column; } .sgs-tab-bar { overflow-x: auto; } }
  /* Phase SG-3R — 360px (small Android, Global Rule #18). Tabs scroll horizontally
     without hijacking the page; buttons go full-width; table cells compress. */
  @media(max-width: 360px) {
    .sgs-main { padding: 8px; }
    .sgs-header h1 { font-size: 18px; }
    .sgs-header p { font-size: 12px; }
    .sgs-actions { flex-direction: column; align-items: stretch; gap: 6px; }
    .sgs-actions button, .sgs-actions select, .sgs-actions label { width: 100%; }
    .sgs-tab-bar { overflow-x: auto; gap: 4px; padding: 2px; }
    .sgs-tab { flex: 0 0 auto; min-width: 90px; font-size: 11px; padding: 7px 10px; }
    .sgs-panel { padding: 12px; border-radius: 10px; }
    .sgs-panel h3 { font-size: 14px; margin-bottom: 12px; }
    .sgs-field input, .sgs-field select, .sgs-field textarea { font-size: 12px; }
    .sgs-btn { padding: 10px 12px; font-size: 13px; }
    .sgs-btn-sm { padding: 6px 8px; font-size: 11px; }
    .sgs-table { font-size: 11px; }
    .sgs-table th, .sgs-table td { padding: 6px 5px; }
    .sgs-table input, .sgs-table select { font-size: 11px; padding: 4px 6px; }
    .sgs-validation { font-size: 11px; padding: 8px 10px; }
    .sgs-driver-section { padding: 10px; }
    .sgs-kpi-row { flex-direction: column; gap: 4px; }
    .sgs-kpi-row input, .sgs-kpi-row select { flex: none; width: 100%; }
  }
`;

const TABS = [
  { key: 'plan', label: 'Plan Details' },
  { key: 'drivers', label: 'Growth Drivers' },
  { key: 'entity', label: 'Entity Targets' },
  { key: 'bdm', label: 'BDM Targets' },
  { key: 'incentive', label: 'Incentive Programs' },
];

const emptyPlan = {
  fiscal_year: new Date().getFullYear(),
  plan_name: '',
  baseline_revenue: '',
  target_revenue: '',
  collection_target_pct: '',
  growth_drivers: [],
  incentive_programs: [],
};

const emptyDriver = {
  driver_code: '',
  driver_label: '',
  revenue_target_min: '',
  revenue_target_max: '',
  description: '',
  kpi_definitions: [],
};

const emptyKpi = { kpi_code: '', kpi_name: '', target_value: '', unit: '' };

const idOf = (ref) => (ref && typeof ref === 'object' ? ref._id || '' : ref || '');

const normalizeEntityTarget = (t) => ({
  ...t,
  entity_id: idOf(t.target_entity_id),
  entity_name: (typeof t.target_entity_id === 'object' ? t.target_entity_id?.entity_name : '') || t.target_label || '',
});

const normalizeBdmTarget = (t) => ({
  ...t,
  bdm_id: idOf(t.bdm_id),
  person_id: idOf(t.person_id),
  territory_id: idOf(t.territory_id),
  bdm_name: (typeof t.person_id === 'object' ? t.person_id?.full_name : '') || t.target_label || '',
  territory: (typeof t.territory_id === 'object' ? t.territory_id?.territory_name : '') || t.territory || '',
});

export default function SalesGoalSetup() {
  const { user: _user } = useAuth(); // eslint-disable-line no-unused-vars
  const sg = useSalesGoals();
  const { data: lookups } = useLookupBatch(['GROWTH_DRIVER', 'KPI_CODE', 'KPI_UNIT', 'INCENTIVE_PROGRAM']);
  const driverOptions = lookups.GROWTH_DRIVER || [];
  const kpiOptions = lookups.KPI_CODE || [];
  const unitOptions = lookups.KPI_UNIT || [];
  const programOptions = lookups.INCENTIVE_PROGRAM || [];
  const { entities } = useEntities();
  const [bdmPeople, setBdmPeople] = useState([]);
  const [territories, setTerritories] = useState([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [pRes, tRes] = await Promise.all([
          api.get('/erp/people?person_type=BDM&is_active=true&limit=500'),
          api.get('/erp/territories?active_only=true'),
        ]);
        if (cancelled) return;
        setBdmPeople(pRes.data?.data || []);
        setTerritories(tRes.data?.data || []);
      } catch (err) {
        if (!cancelled) showError(err, 'Failed to load BDMs or territories');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const [tab, setTab] = useState('plan');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [plans, setPlans] = useState([]);
  const [selectedPlanId, setSelectedPlanId] = useState(null);
  const [form, setForm] = useState({ ...emptyPlan });
  const [entityTargets, setEntityTargets] = useState([]);
  const [bdmTargets, setBdmTargets] = useState([]);

  // Phase SG-3R — KPI Template picker + "use driver defaults". Declared before
  // savePlan() because it references these in its payload + deps array.
  const [templateSets, setTemplateSets] = useState([]);
  const [templateChoice, setTemplateChoice] = useState('');
  const [useDriverDefaults, setUseDriverDefaults] = useState(false);

  const loadPlans = useCallback(async (preserveId) => {
    setLoading(true);
    try {
      const res = await sg.getPlans();
      const list = res?.data || [];
      setPlans(list);
      // Preserve current/requested selection if still present; otherwise pick first ACTIVE/DRAFT
      const kept = preserveId && list.find(p => p._id === preserveId);
      const target = kept || list.find(p => p.status === 'ACTIVE') || list.find(p => p.status === 'DRAFT') || list[0];
      if (target) selectPlan(target._id, list);
    } catch (err) { showError(err, 'Failed to load plans'); }
    setLoading(false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const selectPlan = useCallback(async (id, planList) => {
    const list = planList || plans;
    setSelectedPlanId(id);
    const cached = list.find(p => p._id === id);
    if (cached) {
      setForm({
        fiscal_year: cached.fiscal_year || new Date().getFullYear(),
        plan_name: cached.plan_name || '',
        baseline_revenue: cached.baseline_revenue || '',
        target_revenue: cached.target_revenue || '',
        collection_target_pct: cached.collection_target_pct || '',
        growth_drivers: cached.growth_drivers || [],
        incentive_programs: cached.incentive_programs || [],
      });
    }
    // Load targets
    try {
      const tRes = await sg.getTargets({ plan_id: id });
      const targets = tRes?.data || [];
      setEntityTargets(targets.filter(t => t.target_type === 'ENTITY').map(normalizeEntityTarget));
      setBdmTargets(targets.filter(t => t.target_type === 'BDM').map(normalizeBdmTarget));
    } catch (err) { showError(err, 'Failed to load targets'); }
  }, [plans]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadPlans(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleFormChange = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  // Plan save
  const savePlan = useCallback(async () => {
    setSaving(true);
    try {
      const payload = {
        fiscal_year: Number(form.fiscal_year),
        plan_name: form.plan_name,
        baseline_revenue: Number(form.baseline_revenue) || 0,
        target_revenue: Number(form.target_revenue) || 0,
        collection_target_pct: Number(form.collection_target_pct) || 0,
        growth_drivers: form.growth_drivers,
        incentive_programs: form.incentive_programs,
      };
      // Phase SG-3R — advisory defaults expansion. Applied only on CREATE so
      // re-editing an existing plan never silently re-seeds its drivers.
      if (!selectedPlanId) {
        if (templateChoice) payload.template_name = templateChoice;
        if (useDriverDefaults) payload.use_driver_defaults = true;
      }
      let res;
      const wasNew = !selectedPlanId;
      if (selectedPlanId) {
        res = await sg.updatePlan(selectedPlanId, payload);
      } else {
        res = await sg.createPlan(payload);
        const newId = res?.data?._id;
        if (newId) setSelectedPlanId(newId);
      }
      if (isApprovalPending(res)) {
        showApprovalPending('Plan save sent for approval.');
      } else {
        showSuccess(wasNew ? 'Plan created' : 'Plan updated');
      }
      await loadPlans();
    } catch (err) {
      if (isApprovalPending(null, err)) {
        showApprovalPending('Plan save sent for approval.');
      } else {
        showError(err, 'Failed to save plan');
      }
    }
    setSaving(false);
  }, [form, selectedPlanId, templateChoice, useDriverDefaults]); // eslint-disable-line react-hooks/exhaustive-deps

  // Activate / Close
  const handleActivate = useCallback(async () => {
    if (!selectedPlanId) return;
    try {
      const res = await sg.activatePlan(selectedPlanId);
      if (isApprovalPending(res)) {
        showApprovalPending('Plan activation sent for approval.');
      } else {
        showSuccess('Plan activated');
      }
      await loadPlans();
    } catch (err) {
      if (isApprovalPending(null, err)) showApprovalPending('Plan activation sent for approval.');
      else showError(err, 'Failed to activate plan');
    }
  }, [selectedPlanId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleClose = useCallback(async () => {
    if (!selectedPlanId) return;
    try {
      const res = await sg.closePlan(selectedPlanId);
      if (isApprovalPending(res)) {
        showApprovalPending('Plan close sent for approval.');
      } else {
        showSuccess('Plan closed');
      }
      await loadPlans();
    } catch (err) {
      if (isApprovalPending(null, err)) showApprovalPending('Plan close sent for approval.');
      else showError(err, 'Failed to close plan');
    }
  }, [selectedPlanId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Phase SG-3R — KPI Template picker loader (state declared up-top) ──
  // Only applied on NEW plan create. Server ignores these keys on update.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await sg.listKpiTemplates();
        if (cancelled) return;
        setTemplateSets(res?.data?.sets || []);
      } catch (err) {
        // Non-critical — the rest of the page still works without templates.
        if (!cancelled) console.warn('[SalesGoalSetup] kpi-templates load failed:', err?.message);
      }
    })();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Phase SG-3R — Excel import of targets ──────────────────────────────
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);

  const handleImportTargets = useCallback(async (file) => {
    if (!file || !selectedPlanId) return;
    const fd = new FormData();
    fd.append('file', file);
    fd.append('plan_id', selectedPlanId);
    setImporting(true);
    setImportResult(null);
    try {
      const res = await sg.importTargets(fd);
      if (isApprovalPending(res)) {
        showApprovalPending('Excel import sent for approval.');
        setImportResult({ approval_pending: true });
      } else {
        setImportResult(res || null);
        const msg = res?.message || `Imported ${res?.imported_count || 0} target(s)`;
        if ((res?.error_count || 0) > 0) {
          showError(null, `${msg} — see the error list below the buttons`);
        } else {
          showSuccess(msg);
        }
        await selectPlan(selectedPlanId);  // refresh target lists
      }
    } catch (err) {
      if (isApprovalPending(null, err)) {
        showApprovalPending('Excel import sent for approval.');
      } else {
        const errors = err?.response?.data?.errors;
        if (Array.isArray(errors)) setImportResult({ error_count: errors.length, errors });
        showError(err, 'Excel import failed');
      }
    } finally {
      setImporting(false);
    }
  }, [selectedPlanId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Phase SG-3R — President-Reverse a plan (cascade) ────────────────────
  const handlePresidentReverse = useCallback(async () => {
    if (!selectedPlanId) return;
    const reason = window.prompt('Reason for reversing this plan? (required — this is audit-logged and cannot be undone)');
    if (!reason || !reason.trim()) return;
    if (!window.confirm('This will REVERSE the plan: all targets close, all snapshots delete, every IncentivePayout reverses (with SAP-Storno reversal JEs). Type DELETE in the next prompt to confirm.')) return;
    const confirm = window.prompt('Type DELETE to confirm:');
    if (confirm !== 'DELETE') { showError(null, 'Reversal cancelled — confirmation text did not match.'); return; }
    try {
      const res = await sg.presidentReversePlan(selectedPlanId, { reason: reason.trim(), confirm: 'DELETE' });
      const sideEffects = res?.data?.side_effects;
      showSuccess(res?.message || 'Plan reversed');
      if (Array.isArray(sideEffects) && sideEffects.length) {
        // Surface the cascade summary to the admin — they'll want to see what moved.
        console.info('[SalesGoalSetup] President reverse side effects:', sideEffects);
      }
      await loadPlans();
    } catch (err) {
      showError(err, 'Failed to reverse plan');
    }
  }, [selectedPlanId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleReopen = useCallback(async () => {
    if (!selectedPlanId) return;
    if (!window.confirm('Reopen this plan to DRAFT? All targets under it will also revert to DRAFT until you re-activate.')) return;
    try {
      const res = await sg.reopenPlan(selectedPlanId);
      if (isApprovalPending(res)) {
        showApprovalPending('Plan reopen sent for approval.');
      } else {
        showSuccess('Plan reopened to DRAFT — you can now edit.');
      }
      await loadPlans();
    } catch (err) {
      if (isApprovalPending(null, err)) showApprovalPending('Plan reopen sent for approval.');
      else showError(err, 'Failed to reopen plan');
    }
  }, [selectedPlanId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Growth Drivers
  const addDriver = () => {
    setForm(prev => ({
      ...prev,
      growth_drivers: [...prev.growth_drivers, { ...emptyDriver }]
    }));
  };

  const updateDriver = (idx, field, value) => {
    setForm(prev => {
      const drivers = [...prev.growth_drivers];
      drivers[idx] = { ...drivers[idx], [field]: value };
      return { ...prev, growth_drivers: drivers };
    });
  };

  const updateDriverFields = (idx, fields) => {
    setForm(prev => {
      const drivers = [...prev.growth_drivers];
      drivers[idx] = { ...drivers[idx], ...fields };
      return { ...prev, growth_drivers: drivers };
    });
  };

  const removeDriver = (idx) => {
    setForm(prev => ({
      ...prev,
      growth_drivers: prev.growth_drivers.filter((_, i) => i !== idx)
    }));
  };

  const addKpi = (driverIdx) => {
    setForm(prev => {
      const drivers = [...prev.growth_drivers];
      const kpis = [...(drivers[driverIdx].kpi_definitions || []), { ...emptyKpi }];
      drivers[driverIdx] = { ...drivers[driverIdx], kpi_definitions: kpis };
      return { ...prev, growth_drivers: drivers };
    });
  };

  const updateKpi = (driverIdx, kpiIdx, field, value) => {
    setForm(prev => {
      const drivers = [...prev.growth_drivers];
      const kpis = [...(drivers[driverIdx].kpi_definitions || [])];
      kpis[kpiIdx] = { ...kpis[kpiIdx], [field]: value };
      drivers[driverIdx] = { ...drivers[driverIdx], kpi_definitions: kpis };
      return { ...prev, growth_drivers: drivers };
    });
  };

  const updateKpiFields = (driverIdx, kpiIdx, fields) => {
    setForm(prev => {
      const drivers = [...prev.growth_drivers];
      const kpis = [...(drivers[driverIdx].kpi_definitions || [])];
      kpis[kpiIdx] = { ...kpis[kpiIdx], ...fields };
      drivers[driverIdx] = { ...drivers[driverIdx], kpi_definitions: kpis };
      return { ...prev, growth_drivers: drivers };
    });
  };

  const removeKpi = (driverIdx, kpiIdx) => {
    setForm(prev => {
      const drivers = [...prev.growth_drivers];
      const kpis = (drivers[driverIdx].kpi_definitions || []).filter((_, i) => i !== kpiIdx);
      drivers[driverIdx] = { ...drivers[driverIdx], kpi_definitions: kpis };
      return { ...prev, growth_drivers: drivers };
    });
  };

  // Entity Targets
  const addEntityTarget = () => {
    setEntityTargets(prev => [...prev, {
      _id: null, plan_id: selectedPlanId, target_type: 'ENTITY',
      entity_id: '', entity_name: '', sales_target: '', status: 'DRAFT'
    }]);
  };

  const updateEntityTarget = (idx, field, value) => {
    setEntityTargets(prev => {
      const list = [...prev];
      list[idx] = { ...list[idx], [field]: value };
      return list;
    });
  };

  const updateEntityTargetFields = (idx, fields) => {
    setEntityTargets(prev => {
      const list = [...prev];
      list[idx] = { ...list[idx], ...fields };
      return list;
    });
  };

  const saveEntityTargets = useCallback(async () => {
    setSaving(true);
    try {
      const plan = plans.find(p => p._id === selectedPlanId);
      const planEntityId = idOf(plan?.entity_id);
      let written = 0;
      let skipped = 0;
      let pendingApproval = false;
      for (const t of entityTargets) {
        if (!t.entity_id) { skipped++; continue; }
        const payload = {
          plan_id: selectedPlanId,
          entity_id: planEntityId || t.entity_id,
          target_type: 'ENTITY',
          target_entity_id: t.entity_id,
          target_label: t.entity_name || '',
          sales_target: Number(t.sales_target) || 0,
        };
        const res = t._id ? await sg.updateTarget(t._id, payload) : await sg.createTarget(payload);
        if (isApprovalPending(res)) pendingApproval = true;
        written++;
      }
      const tRes = await sg.getTargets({ plan_id: selectedPlanId });
      const targets = tRes?.data || [];
      setEntityTargets(targets.filter(t => t.target_type === 'ENTITY').map(normalizeEntityTarget));
      if (pendingApproval) {
        showApprovalPending('Entity targets sent for approval.');
      } else if (written > 0) {
        showSuccess(`Saved ${written} entity target${written === 1 ? '' : 's'}${skipped ? ` (${skipped} blank row${skipped === 1 ? '' : 's'} skipped)` : ''}`);
      } else {
        showError(null, 'No entity targets saved — pick an entity on each row first.');
      }
    } catch (err) {
      if (isApprovalPending(null, err)) {
        showApprovalPending('Entity targets sent for approval.');
      } else {
        showError(err, 'Failed to save entity targets');
      }
    }
    setSaving(false);
  }, [entityTargets, selectedPlanId, plans]); // eslint-disable-line react-hooks/exhaustive-deps

  // BDM Targets
  const addBdmTarget = () => {
    setBdmTargets(prev => [...prev, {
      _id: null, plan_id: selectedPlanId, target_type: 'BDM',
      bdm_id: '', bdm_name: '', person_id: '', territory_id: '', territory: '',
      sales_target: '', collection_target: '', status: 'DRAFT'
    }]);
  };

  const updateBdmTarget = (idx, field, value) => {
    setBdmTargets(prev => {
      const list = [...prev];
      list[idx] = { ...list[idx], [field]: value };
      return list;
    });
  };

  const updateBdmTargetFields = (idx, fields) => {
    setBdmTargets(prev => {
      const list = [...prev];
      list[idx] = { ...list[idx], ...fields };
      return list;
    });
  };

  const saveBdmTargets = useCallback(async () => {
    setSaving(true);
    try {
      const plan = plans.find(p => p._id === selectedPlanId);
      const planEntityId = idOf(plan?.entity_id) || idOf(entities[0]?._id);
      if (!planEntityId) {
        showError(null, 'Cannot save — no entity found on the plan or in the system.');
        setSaving(false);
        return;
      }
      const pct = Number(form.collection_target_pct) || 0;
      let written = 0;
      let skipped = 0;
      let pendingApproval = false;
      for (const t of bdmTargets) {
        if (!t.person_id && !t.bdm_id) { skipped++; continue; }
        const sales = Number(t.sales_target) || 0;
        const payload = {
          plan_id: selectedPlanId,
          entity_id: planEntityId,
          target_type: 'BDM',
          sales_target: sales,
          collection_target: Math.round(sales * pct / 100),
          target_label: t.bdm_name || '',
        };
        if (t.bdm_id) payload.bdm_id = t.bdm_id;
        if (t.person_id) payload.person_id = t.person_id;
        if (t.territory_id) payload.territory_id = t.territory_id;
        const res = t._id ? await sg.updateTarget(t._id, payload) : await sg.createTarget(payload);
        if (isApprovalPending(res)) pendingApproval = true;
        written++;
      }
      const tRes = await sg.getTargets({ plan_id: selectedPlanId });
      const targets = tRes?.data || [];
      setBdmTargets(targets.filter(t => t.target_type === 'BDM').map(normalizeBdmTarget));
      if (pendingApproval) {
        showApprovalPending('BDM targets sent for approval.');
      } else if (written > 0) {
        showSuccess(`Saved ${written} BDM target${written === 1 ? '' : 's'}${skipped ? ` (${skipped} blank row${skipped === 1 ? '' : 's'} skipped)` : ''}`);
      } else {
        showError(null, 'No BDM targets saved — pick a BDM on each row first.');
      }
    } catch (err) {
      if (isApprovalPending(null, err)) {
        showApprovalPending('BDM targets sent for approval.');
      } else {
        showError(err, 'Failed to save BDM targets');
      }
    }
    setSaving(false);
  }, [bdmTargets, selectedPlanId, plans, form, entities]); // eslint-disable-line react-hooks/exhaustive-deps

  // Incentive Programs
  const addIncentiveProgram = () => {
    setForm(prev => ({
      ...prev,
      incentive_programs: [...(prev.incentive_programs || []), {
        program_code: '', program_name: '', use_tiers: true,
      }]
    }));
  };

  const updateIncentiveProgram = (idx, field, value) => {
    setForm(prev => {
      const progs = [...(prev.incentive_programs || [])];
      progs[idx] = { ...progs[idx], [field]: value };
      return { ...prev, incentive_programs: progs };
    });
  };

  const removeIncentiveProgram = (idx) => {
    setForm(prev => ({
      ...prev,
      incentive_programs: (prev.incentive_programs || []).filter((_, i) => i !== idx)
    }));
  };

  // Validation helpers
  const entitySum = entityTargets.reduce((s, t) => s + (Number(t.sales_target) || 0), 0);
  const planTarget = Number(form.target_revenue) || 0;
  const entityMatch = Math.abs(entitySum - planTarget) < 1;

  const bdmSum = bdmTargets.reduce((s, t) => s + (Number(t.sales_target) || 0), 0);
  const bdmMatchEntity = Math.abs(bdmSum - entitySum) < 1;

  const currentPlan = plans.find(p => p._id === selectedPlanId);
  const planStatus = currentPlan?.status || form.status || 'DRAFT';

  const statusBadgeStyle = (s) => {
    if (s === 'ACTIVE') return { background: '#dcfce7', color: '#166534' };
    if (s === 'CLOSED') return { background: '#f1f5f9', color: '#475569' };
    if (s === 'REJECTED') return { background: '#fee2e2', color: '#b91c1c' };
    // Phase SG-3R — REVERSED styled distinct from REJECTED: lifecycle terminal,
    // not a validation failure.
    if (s === 'REVERSED') return { background: '#fce7f3', color: '#9d174d' };
    return { background: '#fef9c3', color: '#854d0e' };
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <style>{pageStyles}</style>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <Navbar />
        <main className="sgs-main">
          <div className="sgs-header">
            <h1>Sales Goal Setup</h1>
            <p>Create and configure sales goal plans, targets, and incentive programs</p>
            <div className="sgs-actions">
              <Link to="/erp/sales-goals" style={{ fontSize: 13, color: 'var(--erp-accent)' }}>
                Back to Dashboard
              </Link>
              {selectedPlanId && (
                <span className="sgs-status-badge" style={statusBadgeStyle(planStatus)}>
                  {planStatus}
                </span>
              )}
              {currentPlan && (
                <RejectionBanner
                  row={currentPlan}
                  moduleKey="SALES_GOAL_PLAN"
                  variant="row"
                />
              )}
              {planStatus === 'DRAFT' && selectedPlanId && (
                <button className="sgs-btn sgs-btn-success" onClick={handleActivate}>Activate Plan</button>
              )}
              {planStatus === 'ACTIVE' && selectedPlanId && (
                <>
                  <button className="sgs-btn sgs-btn-outline" onClick={handleReopen} title="Revert to DRAFT to edit header fields">Reopen to Draft</button>
                  <button className="sgs-btn sgs-btn-danger" onClick={handleClose}>Close Plan</button>
                </>
              )}
              {/* Phase SG-3R — Reverse-plan visible for ACTIVE/CLOSED/REJECTED. President-only
                  at the backend via accounting.reverse_posted danger sub-perm. Non-privileged
                  users will see a 403 rather than silently bypassing — that's the correct
                  failure mode for a destructive operation. */}
              {selectedPlanId && planStatus && !['DRAFT', 'REVERSED'].includes(planStatus) && (
                <button
                  className="sgs-btn sgs-btn-danger"
                  onClick={handlePresidentReverse}
                  title="President-only — cascades to targets, snapshots, incentive payouts, and journals"
                >
                  President Reverse
                </button>
              )}
              <select
                style={{ padding: '8px 12px', border: '1px solid var(--erp-border)', borderRadius: 8, fontSize: 13, background: 'var(--erp-panel)', color: 'var(--erp-text)' }}
                value={selectedPlanId || ''}
                onChange={(e) => {
                  if (e.target.value === '__new__') {
                    setSelectedPlanId(null);
                    setForm({ ...emptyPlan });
                    setEntityTargets([]);
                    setBdmTargets([]);
                  } else {
                    selectPlan(e.target.value);
                  }
                }}
              >
                <option value="" disabled>Select plan...</option>
                {plans.map(p => (
                  <option key={p._id} value={p._id}>
                    FY {p.fiscal_year} - {p.plan_name} ({p.status})
                  </option>
                ))}
                <option value="__new__">+ New Plan</option>
              </select>
            </div>
          </div>

          <WorkflowGuide pageKey="salesGoalSetup" />

          {loading && <div className="loading">Loading plans...</div>}

          {!loading && (
            <>
              <div className="sgs-tab-bar">
                {TABS.map(t => (
                  <button
                    key={t.key}
                    className={`sgs-tab ${tab === t.key ? 'active' : ''}`}
                    onClick={() => setTab(t.key)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {/* Plan Details Tab */}
              {tab === 'plan' && (
                <div className="sgs-panel">
                  <h3>Plan Details</h3>
                  {planStatus !== 'DRAFT' && selectedPlanId && (
                    <div className="sgs-validation" style={{ background: '#fef9c3', border: '1px solid #fde68a', color: '#854d0e', marginBottom: 12 }}>
                      Plan is <strong>{planStatus}</strong>. Header fields are locked to preserve performance history.
                      {planStatus === 'ACTIVE' && ' Click "Reopen to Draft" above to edit.'}
                      {' Targets (Entity / BDM tabs) can still be added on an ACTIVE plan.'}
                    </div>
                  )}
                  {(() => {
                    const planLocked = !!selectedPlanId && planStatus !== 'DRAFT';
                    return (
                      <>
                        <div className="sgs-form-row">
                          <div className="sgs-field">
                            <label>Fiscal Year</label>
                            <input type="number" value={form.fiscal_year ?? ''} onChange={e => handleFormChange('fiscal_year', e.target.value)} disabled={planLocked} />
                          </div>
                          <div className="sgs-field">
                            <label>Plan Name</label>
                            <input type="text" value={form.plan_name ?? ''} onChange={e => handleFormChange('plan_name', e.target.value)} placeholder="e.g., FY2026 Growth Plan" disabled={planLocked} />
                          </div>
                        </div>
                        <div className="sgs-form-row">
                          <div className="sgs-field">
                            <label>Baseline Revenue (Last Year Actual)</label>
                            <input type="number" value={form.baseline_revenue ?? ''} onChange={e => handleFormChange('baseline_revenue', e.target.value)} disabled={planLocked} />
                          </div>
                          <div className="sgs-field">
                            <label>Target Revenue</label>
                            <input type="number" value={form.target_revenue ?? ''} onChange={e => handleFormChange('target_revenue', e.target.value)} disabled={planLocked} />
                          </div>
                          <div className="sgs-field">
                            <label>Collection Target (%)</label>
                            <input type="number" value={form.collection_target_pct ?? ''} onChange={e => handleFormChange('collection_target_pct', e.target.value)} min="0" max="100" disabled={planLocked} />
                          </div>
                        </div>
                        <button className="sgs-btn sgs-btn-primary" onClick={savePlan} disabled={saving || planLocked}>
                          {saving ? 'Saving...' : selectedPlanId ? 'Update Plan' : 'Create Plan'}
                        </button>

                        {/* Phase SG-3R — Advisory defaults (new plan only).
                            Choice picks a KpiTemplate set name curated at /erp/kpi-templates;
                            the "Use driver defaults" checkbox additionally applies
                            GROWTH_DRIVER.metadata.default_kpi_codes to drivers that are empty. */}
                        {!selectedPlanId && (
                          <div style={{ marginTop: 16, padding: 12, border: '1px dashed var(--erp-border)', borderRadius: 8 }}>
                            <strong style={{ fontSize: 12, color: 'var(--erp-muted)', display: 'block', marginBottom: 8 }}>
                              Pre-populate defaults (optional)
                            </strong>
                            <div className="sgs-form-row">
                              <div className="sgs-field">
                                <label>KPI Template Set</label>
                                <select value={templateChoice} onChange={e => setTemplateChoice(e.target.value)}>
                                  <option value="">— none (define manually) —</option>
                                  {templateSets.map(s => (
                                    <option key={s.template_name} value={s.template_name}>
                                      {s.template_name} ({s.driver_count} driver(s), {s.kpi_count} KPI row(s))
                                    </option>
                                  ))}
                                </select>
                                <small style={{ fontSize: 11, color: 'var(--erp-muted)' }}>
                                  Curate sets at <Link to="/erp/kpi-templates" style={{ color: 'var(--erp-accent)' }}>KPI Templates</Link>.
                                </small>
                              </div>
                              <div className="sgs-field" style={{ alignSelf: 'flex-end' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <input type="checkbox" checked={useDriverDefaults} onChange={e => setUseDriverDefaults(e.target.checked)} />
                                  Seed KPIs from each driver&#39;s lookup metadata (default_kpi_codes)
                                </label>
                              </div>
                            </div>
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              )}

              {/* Growth Drivers Tab */}
              {tab === 'drivers' && (
                <div className="sgs-panel">
                  <h3>Growth Drivers</h3>
                  {planStatus !== 'DRAFT' && selectedPlanId && (
                    <div className="sgs-validation" style={{ background: '#fef9c3', border: '1px solid #fde68a', color: '#854d0e', marginBottom: 12 }}>
                      Plan is <strong>{planStatus}</strong>. Growth drivers are locked. Reopen the plan to edit.
                    </div>
                  )}
                  {(form.growth_drivers || []).length === 0 && (
                    <p style={{ color: 'var(--erp-muted)', fontSize: 13 }}>No growth drivers defined. Add one below.</p>
                  )}
                  {(form.growth_drivers || []).map((d, di) => (
                    <div key={di} className="sgs-driver-section">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <strong style={{ fontSize: 13, color: 'var(--erp-text)' }}>Driver #{di + 1}</strong>
                        <button className="sgs-btn sgs-btn-danger sgs-btn-sm" onClick={() => removeDriver(di)}>Remove</button>
                      </div>
                      <div className="sgs-form-row">
                        <div className="sgs-field">
                          <label>Driver Code</label>
                          <select
                            value={d.driver_code ?? ''}
                            onChange={e => {
                              const opt = driverOptions.find(o => o.code === e.target.value);
                              updateDriverFields(di, {
                                driver_code: opt?.code || '',
                                driver_label: opt?.label || '',
                              });
                            }}
                          >
                            <option value="">— Select driver —</option>
                            {driverOptions.map(o => (
                              <option key={o.code} value={o.code}>{o.code} — {o.label}</option>
                            ))}
                          </select>
                          {driverOptions.length === 0 && (
                            <small style={{ color: 'var(--erp-muted)', fontSize: 11 }}>
                              No drivers seeded. Add codes in Control Center → Lookup Tables → GROWTH_DRIVER.
                            </small>
                          )}
                        </div>
                        <div className="sgs-field">
                          <label>Driver Label</label>
                          <input type="text" value={d.driver_label || ''} readOnly placeholder="Auto-filled from lookup" />
                        </div>
                      </div>
                      <div className="sgs-form-row">
                        <div className="sgs-field">
                          <label>Revenue Target Min</label>
                          <input type="number" value={d.revenue_target_min ?? ''} onChange={e => updateDriver(di, 'revenue_target_min', e.target.value)} />
                        </div>
                        <div className="sgs-field">
                          <label>Revenue Target Max</label>
                          <input type="number" value={d.revenue_target_max ?? ''} onChange={e => updateDriver(di, 'revenue_target_max', e.target.value)} />
                        </div>
                      </div>
                      <div className="sgs-field" style={{ marginBottom: 8 }}>
                        <label>Description</label>
                        <textarea value={d.description || ''} onChange={e => updateDriver(di, 'description', e.target.value)} />
                      </div>
                      <div style={{ marginTop: 8 }}>
                        <strong style={{ fontSize: 12, color: 'var(--erp-muted)' }}>KPI Definitions</strong>
                        {(d.kpi_definitions || []).map((kpi, ki) => (
                          <div key={ki} className="sgs-kpi-row">
                            <select
                              value={kpi.kpi_code ?? ''}
                              onChange={e => {
                                const opt = kpiOptions.find(o => o.code === e.target.value);
                                updateKpiFields(di, ki, {
                                  kpi_code: opt?.code || '',
                                  kpi_name: opt?.label || '',
                                  unit: opt?.metadata?.unit || kpi.unit || '',
                                });
                              }}
                            >
                              <option value="">— Select KPI —</option>
                              {kpiOptions.map(o => (
                                <option key={o.code} value={o.code}>{o.code} — {o.label}</option>
                              ))}
                            </select>
                            <input type="text" placeholder="KPI Name" value={kpi.kpi_name || ''} readOnly />
                            <input type="number" placeholder="Target" value={kpi.target_value ?? ''} onChange={e => updateKpi(di, ki, 'target_value', e.target.value)} style={{ maxWidth: 100 }} />
                            <select
                              value={kpi.unit ?? ''}
                              onChange={e => updateKpi(di, ki, 'unit', e.target.value)}
                              style={{ maxWidth: 110 }}
                            >
                              <option value="">Unit…</option>
                              {unitOptions.map(o => (
                                <option key={o.code} value={o.code}>{o.code}</option>
                              ))}
                            </select>
                            <button className="sgs-btn sgs-btn-danger sgs-btn-sm" onClick={() => removeKpi(di, ki)}>X</button>
                          </div>
                        ))}
                        <button className="sgs-btn sgs-btn-outline sgs-btn-sm" onClick={() => addKpi(di)} style={{ marginTop: 6 }}>+ Add KPI</button>
                      </div>
                    </div>
                  ))}
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <button className="sgs-btn sgs-btn-outline" onClick={addDriver}>+ Add Driver</button>
                    <button className="sgs-btn sgs-btn-primary" onClick={savePlan} disabled={saving}>
                      {saving ? 'Saving...' : 'Save Drivers'}
                    </button>
                  </div>
                </div>
              )}

              {/* Entity Targets Tab */}
              {tab === 'entity' && (
                <div className="sgs-panel">
                  <h3>Entity Targets</h3>
                  {!selectedPlanId ? (
                    <p style={{ color: 'var(--erp-muted)', fontSize: 13 }}>Create or select a plan first.</p>
                  ) : (
                    <>
                      <div style={{ overflowX: 'auto' }}>
                        <table className="sgs-table">
                          <thead>
                            <tr>
                              <th>#</th>
                              <th>Entity Name</th>
                              <th>Sales Target</th>
                              <th>Collection Target (auto)</th>
                              <th>Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {entityTargets.map((t, i) => {
                              const collTarget = (Number(t.sales_target) || 0) * (Number(form.collection_target_pct) || 0) / 100;
                              const savedEntityMissing = t.entity_id && !entities.some(ent => ent._id === t.entity_id);
                              return (
                                <tr key={t._id || i}>
                                  <td>{i + 1}</td>
                                  <td>
                                    <select
                                      value={t.entity_id || ''}
                                      onChange={e => {
                                        const ent = entities.find(x => x._id === e.target.value);
                                        updateEntityTargetFields(i, {
                                          entity_id: ent?._id || '',
                                          entity_name: ent?.entity_name || ent?.name || '',
                                        });
                                      }}
                                    >
                                      <option value="">— Select entity —</option>
                                      {savedEntityMissing && (
                                        <option value={t.entity_id}>
                                          {(t.entity_name || t.entity_id) + ' (inactive)'}
                                        </option>
                                      )}
                                      {entities.map(ent => (
                                        <option key={ent._id} value={ent._id}>
                                          {ent.entity_name || ent.name}{ent.short_name ? ` (${ent.short_name})` : ''}
                                        </option>
                                      ))}
                                    </select>
                                    {savedEntityMissing && (
                                      <small style={{ color: '#b45309', fontSize: 11, display: 'block', marginTop: 2 }}>
                                        Saved entity is not ACTIVE — reactivate in Control Center → Entities.
                                      </small>
                                    )}
                                  </td>
                                  <td><input type="number" value={t.sales_target || ''} onChange={e => updateEntityTarget(i, 'sales_target', e.target.value)} placeholder="0" /></td>
                                  <td className="num">{php(collTarget)}</td>
                                  <td><span className="sgs-status-badge" style={statusBadgeStyle(t.status || 'DRAFT')}>{t.status || 'DRAFT'}</span></td>
                                </tr>
                              );
                            })}
                          </tbody>
                          <tfoot>
                            <tr style={{ fontWeight: 700 }}>
                              <td colSpan={2}>Total</td>
                              <td className="num">{php(entitySum)}</td>
                              <td className="num">{php(entitySum * (Number(form.collection_target_pct) || 0) / 100)}</td>
                              <td />
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                      <div className={`sgs-validation ${entityMatch ? 'ok' : ''}`}>
                        {entityMatch
                          ? 'Entity targets match the plan target.'
                          : `Entity sum (${php(entitySum)}) does not match plan target (${php(planTarget)}). Difference: ${php(Math.abs(entitySum - planTarget))}`
                        }
                      </div>
                      <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                        <button className="sgs-btn sgs-btn-outline" onClick={addEntityTarget}>+ Add Entity</button>
                        <button className="sgs-btn sgs-btn-primary" onClick={saveEntityTargets} disabled={saving}>
                          {saving ? 'Saving...' : 'Save Entity Targets'}
                        </button>
                        {/* Phase SG-3R — Excel import. Shared handler imports from ENTITY + BDM sheets
                            in one round trip; rendered on both tabs so admins can upload from either. */}
                        <label className="sgs-btn sgs-btn-outline" style={{ cursor: importing ? 'not-allowed' : 'pointer', opacity: importing ? 0.6 : 1 }}>
                          {importing ? 'Importing…' : 'Import Excel (ENTITY + BDM sheets)'}
                          <input
                            type="file"
                            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                            style={{ display: 'none' }}
                            disabled={importing}
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) handleImportTargets(f);
                              e.target.value = '';  // reset so same file can be re-picked
                            }}
                          />
                        </label>
                      </div>
                      {importResult && (importResult.imported_count > 0 || importResult.error_count > 0) && (
                        <div style={{ marginTop: 10 }}>
                          <div className={`sgs-validation ${(importResult.error_count || 0) === 0 ? 'ok' : ''}`}>
                            {importResult.imported_count || 0} row(s) imported · {importResult.error_count || 0} row(s) skipped
                          </div>
                          {Array.isArray(importResult.errors) && importResult.errors.length > 0 && (
                            <details style={{ marginTop: 6, background: 'var(--erp-bg)', padding: 8, borderRadius: 8, fontSize: 12 }}>
                              <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Show row-level errors ({importResult.errors.length})</summary>
                              <table className="sgs-table" style={{ marginTop: 6 }}>
                                <thead><tr><th>Sheet</th><th>Row</th><th>Error</th></tr></thead>
                                <tbody>
                                  {importResult.errors.map((e, i) => (
                                    <tr key={i}><td>{e.sheet}</td><td>{e.row_number}</td><td>{e.error}</td></tr>
                                  ))}
                                </tbody>
                              </table>
                            </details>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* BDM Targets Tab */}
              {tab === 'bdm' && (
                <div className="sgs-panel">
                  <h3>BDM Targets</h3>
                  {!selectedPlanId ? (
                    <p style={{ color: 'var(--erp-muted)', fontSize: 13 }}>Create or select a plan first.</p>
                  ) : (
                    <>
                      <div style={{ overflowX: 'auto' }}>
                        <table className="sgs-table">
                          <thead>
                            <tr>
                              <th>#</th>
                              <th>BDM Name</th>
                              <th>Territory</th>
                              <th>Sales Target</th>
                              <th>Collection Target</th>
                              <th>Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {bdmTargets.map((t, i) => (
                              <tr key={t._id || i}>
                                <td>{i + 1}</td>
                                <td>
                                  <select
                                    value={t.person_id || ''}
                                    onChange={e => {
                                      const person = bdmPeople.find(p => p._id === e.target.value);
                                      updateBdmTargetFields(i, {
                                        person_id: person?._id || '',
                                        bdm_id: person?.user_id?._id || person?.user_id || '',
                                        bdm_name: person?.full_name || '',
                                        territory_id: person?.territory_id?._id || t.territory_id || '',
                                        territory: person?.territory_id?.territory_name || t.territory || '',
                                      });
                                    }}
                                  >
                                    <option value="">— Select BDM —</option>
                                    {bdmPeople.map(p => (
                                      <option key={p._id} value={p._id}>
                                        {p.full_name}{p.bdm_code ? ` (${p.bdm_code})` : ''}
                                      </option>
                                    ))}
                                  </select>
                                </td>
                                <td>
                                  <select
                                    value={t.territory_id || ''}
                                    onChange={e => {
                                      const ter = territories.find(x => x._id === e.target.value);
                                      updateBdmTargetFields(i, {
                                        territory_id: ter?._id || '',
                                        territory: ter?.territory_name || '',
                                      });
                                    }}
                                  >
                                    <option value="">— Select territory —</option>
                                    {territories.map(ter => (
                                      <option key={ter._id} value={ter._id}>
                                        {ter.territory_name}{ter.territory_code ? ` (${ter.territory_code})` : ''}
                                      </option>
                                    ))}
                                  </select>
                                </td>
                                <td><input type="number" value={t.sales_target ?? ''} onChange={e => updateBdmTarget(i, 'sales_target', e.target.value)} placeholder="0" /></td>
                                <td className="num">{php((Number(t.sales_target) || 0) * (Number(form.collection_target_pct) || 0) / 100)}</td>
                                <td><span className="sgs-status-badge" style={statusBadgeStyle(t.status || 'DRAFT')}>{t.status || 'DRAFT'}</span></td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr style={{ fontWeight: 700 }}>
                              <td colSpan={3}>Total</td>
                              <td className="num">{php(bdmSum)}</td>
                              <td className="num">{php(bdmSum * (Number(form.collection_target_pct) || 0) / 100)}</td>
                              <td />
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                      <div className={`sgs-validation ${bdmMatchEntity ? 'ok' : ''}`}>
                        {bdmMatchEntity
                          ? 'BDM targets match entity target total.'
                          : `BDM sum (${php(bdmSum)}) does not match entity target sum (${php(entitySum)}). Difference: ${php(Math.abs(bdmSum - entitySum))}`
                        }
                      </div>
                      <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                        <button className="sgs-btn sgs-btn-outline" onClick={addBdmTarget}>+ Add BDM</button>
                        <button className="sgs-btn sgs-btn-primary" onClick={saveBdmTargets} disabled={saving}>
                          {saving ? 'Saving...' : 'Save BDM Targets'}
                        </button>
                        {/* Phase SG-3R — Excel import (same endpoint, both tabs). */}
                        <label className="sgs-btn sgs-btn-outline" style={{ cursor: importing ? 'not-allowed' : 'pointer', opacity: importing ? 0.6 : 1 }}>
                          {importing ? 'Importing…' : 'Import Excel (ENTITY + BDM sheets)'}
                          <input
                            type="file"
                            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                            style={{ display: 'none' }}
                            disabled={importing}
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) handleImportTargets(f);
                              e.target.value = '';
                            }}
                          />
                        </label>
                      </div>
                      {importResult && (importResult.imported_count > 0 || importResult.error_count > 0) && (
                        <div style={{ marginTop: 10 }}>
                          <div className={`sgs-validation ${(importResult.error_count || 0) === 0 ? 'ok' : ''}`}>
                            {importResult.imported_count || 0} row(s) imported · {importResult.error_count || 0} row(s) skipped
                          </div>
                          {Array.isArray(importResult.errors) && importResult.errors.length > 0 && (
                            <details style={{ marginTop: 6, background: 'var(--erp-bg)', padding: 8, borderRadius: 8, fontSize: 12 }}>
                              <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Show row-level errors ({importResult.errors.length})</summary>
                              <table className="sgs-table" style={{ marginTop: 6 }}>
                                <thead><tr><th>Sheet</th><th>Row</th><th>Error</th></tr></thead>
                                <tbody>
                                  {importResult.errors.map((e, i) => (
                                    <tr key={i}><td>{e.sheet}</td><td>{e.row_number}</td><td>{e.error}</td></tr>
                                  ))}
                                </tbody>
                              </table>
                            </details>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* Incentive Programs Tab */}
              {tab === 'incentive' && (
                <div className="sgs-panel">
                  <h3>Incentive Programs</h3>
                  {planStatus !== 'DRAFT' && selectedPlanId && (
                    <div className="sgs-validation" style={{ background: '#fef9c3', border: '1px solid #fde68a', color: '#854d0e', marginBottom: 12 }}>
                      Plan is <strong>{planStatus}</strong>. Incentive programs are locked. Reopen the plan to edit.
                    </div>
                  )}
                  {(form.incentive_programs || []).length === 0 && (
                    <p style={{ color: 'var(--erp-muted)', fontSize: 13 }}>No incentive programs defined yet.</p>
                  )}
                  {(form.incentive_programs || []).map((prog, i) => (
                    <div key={i} className="sgs-driver-section">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <strong style={{ fontSize: 13, color: 'var(--erp-text)' }}>Program #{i + 1}</strong>
                        <button className="sgs-btn sgs-btn-danger sgs-btn-sm" onClick={() => removeIncentiveProgram(i)}>Remove</button>
                      </div>
                      <div className="sgs-form-row">
                        <div className="sgs-field">
                          <label>Program Code</label>
                          <select
                            value={prog.program_code ?? ''}
                            onChange={e => {
                              const opt = programOptions.find(o => o.code === e.target.value);
                              setForm(prev => {
                                const progs = [...(prev.incentive_programs || [])];
                                progs[i] = { ...progs[i], program_code: opt?.code || '', program_name: opt?.label || '' };
                                return { ...prev, incentive_programs: progs };
                              });
                            }}
                          >
                            <option value="">— Select program —</option>
                            {programOptions.map(o => (
                              <option key={o.code} value={o.code}>{o.code} — {o.label}</option>
                            ))}
                          </select>
                          {programOptions.length === 0 && (
                            <small style={{ color: 'var(--erp-muted)', fontSize: 11 }}>
                              No programs seeded. Add codes in Control Center → Lookup Tables → INCENTIVE_PROGRAM.
                            </small>
                          )}
                        </div>
                        <div className="sgs-field">
                          <label>Program Name</label>
                          <input type="text" value={prog.program_name || ''} readOnly placeholder="Auto-filled from lookup" />
                        </div>
                        <div className="sgs-field" style={{ maxWidth: 140 }}>
                          <label>Use Tiers</label>
                          <select value={prog.use_tiers ? 'yes' : 'no'} onChange={e => updateIncentiveProgram(i, 'use_tiers', e.target.value === 'yes')}>
                            <option value="yes">Yes</option>
                            <option value="no">No</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  ))}
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <button className="sgs-btn sgs-btn-outline" onClick={addIncentiveProgram}>+ Add Program</button>
                    <button className="sgs-btn sgs-btn-primary" onClick={savePlan} disabled={saving}>
                      {saving ? 'Saving...' : 'Save Programs'}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
