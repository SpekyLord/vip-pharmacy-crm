/**
 * SalesGoalSetup — Phase 28 Plan & target configuration page.
 * President/admin creates plans, growth drivers, entity & BDM targets, incentive programs.
 */
import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import { useAuth } from '../../hooks/useAuth';
import useSalesGoals from '../hooks/useSalesGoals';
import WorkflowGuide from '../components/WorkflowGuide';
import { showError } from '../utils/errorToast';

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
  .sgs-table input { width: 100%; padding: 6px 8px; border: 1px solid var(--erp-border); border-radius: 6px; font-size: 13px; background: var(--erp-panel); color: var(--erp-text); box-sizing: border-box; }
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
  .sgs-kpi-row input { flex: 1; min-width: 120px; }
  .loading { text-align: center; padding: 40px; color: var(--erp-muted); }
  @media(max-width: 768px) { .sgs-main { padding: 12px; } .sgs-form-row { flex-direction: column; } .sgs-tab-bar { overflow-x: auto; } }
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

export default function SalesGoalSetup() {
  const { user } = useAuth();
  const sg = useSalesGoals();

  const [tab, setTab] = useState('plan');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [plans, setPlans] = useState([]);
  const [selectedPlanId, setSelectedPlanId] = useState(null);
  const [form, setForm] = useState({ ...emptyPlan });
  const [entityTargets, setEntityTargets] = useState([]);
  const [bdmTargets, setBdmTargets] = useState([]);

  const loadPlans = useCallback(async () => {
    setLoading(true);
    try {
      const res = await sg.getPlans();
      const list = res?.data || [];
      setPlans(list);
      // Auto-select the first DRAFT or ACTIVE plan
      const active = list.find(p => p.status === 'ACTIVE') || list.find(p => p.status === 'DRAFT') || list[0];
      if (active) selectPlan(active._id, list);
    } catch (err) { showError(err, 'Failed to load plans'); }
    setLoading(false);
  }, []);

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
      setEntityTargets(targets.filter(t => t.target_type === 'ENTITY'));
      setBdmTargets(targets.filter(t => t.target_type === 'BDM'));
    } catch (err) { showError(err, 'Failed to load targets'); }
  }, [plans]);

  useEffect(() => { loadPlans(); }, []);

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
      if (selectedPlanId) {
        await sg.updatePlan(selectedPlanId, payload);
      } else {
        const res = await sg.createPlan(payload);
        const newId = res?.data?._id;
        if (newId) setSelectedPlanId(newId);
      }
      await loadPlans();
    } catch (err) { showError(err, 'Failed to save plan'); }
    setSaving(false);
  }, [form, selectedPlanId]);

  // Activate / Close
  const handleActivate = useCallback(async () => {
    if (!selectedPlanId) return;
    try {
      await sg.activatePlan(selectedPlanId);
      await loadPlans();
    } catch (err) { showError(err, 'Failed to activate plan'); }
  }, [selectedPlanId]);

  const handleClose = useCallback(async () => {
    if (!selectedPlanId) return;
    try {
      await sg.closePlan(selectedPlanId);
      await loadPlans();
    } catch (err) { showError(err, 'Failed to close plan'); }
  }, [selectedPlanId]);

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

  const saveEntityTargets = useCallback(async () => {
    setSaving(true);
    try {
      for (const t of entityTargets) {
        const payload = {
          plan_id: selectedPlanId,
          target_type: 'ENTITY',
          entity_id: t.entity_id,
          entity_name: t.entity_name,
          sales_target: Number(t.sales_target) || 0,
        };
        if (t._id) await sg.updateTarget(t._id, payload);
        else await sg.createTarget(payload);
      }
      // Reload
      const tRes = await sg.getTargets({ plan_id: selectedPlanId });
      const targets = tRes?.data || [];
      setEntityTargets(targets.filter(t => t.target_type === 'ENTITY'));
    } catch (err) { showError(err, 'Failed to save entity targets'); }
    setSaving(false);
  }, [entityTargets, selectedPlanId]);

  // BDM Targets
  const addBdmTarget = () => {
    setBdmTargets(prev => [...prev, {
      _id: null, plan_id: selectedPlanId, target_type: 'BDM',
      bdm_id: '', bdm_name: '', territory: '', sales_target: '', collection_target: '', status: 'DRAFT'
    }]);
  };

  const updateBdmTarget = (idx, field, value) => {
    setBdmTargets(prev => {
      const list = [...prev];
      list[idx] = { ...list[idx], [field]: value };
      return list;
    });
  };

  const saveBdmTargets = useCallback(async () => {
    setSaving(true);
    try {
      for (const t of bdmTargets) {
        const payload = {
          plan_id: selectedPlanId,
          target_type: 'BDM',
          bdm_id: t.bdm_id,
          bdm_name: t.bdm_name,
          territory: t.territory,
          sales_target: Number(t.sales_target) || 0,
          collection_target: Number(t.collection_target) || 0,
        };
        if (t._id) await sg.updateTarget(t._id, payload);
        else await sg.createTarget(payload);
      }
      const tRes = await sg.getTargets({ plan_id: selectedPlanId });
      const targets = tRes?.data || [];
      setBdmTargets(targets.filter(t => t.target_type === 'BDM'));
    } catch (err) { showError(err, 'Failed to save BDM targets'); }
    setSaving(false);
  }, [bdmTargets, selectedPlanId]);

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
              {planStatus === 'DRAFT' && selectedPlanId && (
                <button className="sgs-btn sgs-btn-success" onClick={handleActivate}>Activate Plan</button>
              )}
              {planStatus === 'ACTIVE' && selectedPlanId && (
                <button className="sgs-btn sgs-btn-danger" onClick={handleClose}>Close Plan</button>
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
                  <div className="sgs-form-row">
                    <div className="sgs-field">
                      <label>Fiscal Year</label>
                      <input type="number" value={form.fiscal_year} onChange={e => handleFormChange('fiscal_year', e.target.value)} />
                    </div>
                    <div className="sgs-field">
                      <label>Plan Name</label>
                      <input type="text" value={form.plan_name} onChange={e => handleFormChange('plan_name', e.target.value)} placeholder="e.g., FY2026 Growth Plan" />
                    </div>
                  </div>
                  <div className="sgs-form-row">
                    <div className="sgs-field">
                      <label>Baseline Revenue (Last Year Actual)</label>
                      <input type="number" value={form.baseline_revenue} onChange={e => handleFormChange('baseline_revenue', e.target.value)} />
                    </div>
                    <div className="sgs-field">
                      <label>Target Revenue</label>
                      <input type="number" value={form.target_revenue} onChange={e => handleFormChange('target_revenue', e.target.value)} />
                    </div>
                    <div className="sgs-field">
                      <label>Collection Target (%)</label>
                      <input type="number" value={form.collection_target_pct} onChange={e => handleFormChange('collection_target_pct', e.target.value)} min="0" max="100" />
                    </div>
                  </div>
                  <button className="sgs-btn sgs-btn-primary" onClick={savePlan} disabled={saving}>
                    {saving ? 'Saving...' : selectedPlanId ? 'Update Plan' : 'Create Plan'}
                  </button>
                </div>
              )}

              {/* Growth Drivers Tab */}
              {tab === 'drivers' && (
                <div className="sgs-panel">
                  <h3>Growth Drivers</h3>
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
                          <input type="text" value={d.driver_code} onChange={e => updateDriver(di, 'driver_code', e.target.value)} placeholder="e.g., NEW_ACCOUNTS" />
                        </div>
                        <div className="sgs-field">
                          <label>Driver Label</label>
                          <input type="text" value={d.driver_label} onChange={e => updateDriver(di, 'driver_label', e.target.value)} placeholder="e.g., New Account Acquisition" />
                        </div>
                      </div>
                      <div className="sgs-form-row">
                        <div className="sgs-field">
                          <label>Revenue Target Min</label>
                          <input type="number" value={d.revenue_target_min} onChange={e => updateDriver(di, 'revenue_target_min', e.target.value)} />
                        </div>
                        <div className="sgs-field">
                          <label>Revenue Target Max</label>
                          <input type="number" value={d.revenue_target_max} onChange={e => updateDriver(di, 'revenue_target_max', e.target.value)} />
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
                            <input type="text" placeholder="KPI Code" value={kpi.kpi_code} onChange={e => updateKpi(di, ki, 'kpi_code', e.target.value)} />
                            <input type="text" placeholder="KPI Name" value={kpi.kpi_name} onChange={e => updateKpi(di, ki, 'kpi_name', e.target.value)} />
                            <input type="number" placeholder="Target" value={kpi.target_value} onChange={e => updateKpi(di, ki, 'target_value', e.target.value)} style={{ maxWidth: 100 }} />
                            <input type="text" placeholder="Unit" value={kpi.unit} onChange={e => updateKpi(di, ki, 'unit', e.target.value)} style={{ maxWidth: 80 }} />
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
                              return (
                                <tr key={t._id || i}>
                                  <td>{i + 1}</td>
                                  <td><input value={t.entity_name || ''} onChange={e => updateEntityTarget(i, 'entity_name', e.target.value)} placeholder="Entity name" /></td>
                                  <td><input type="number" value={t.sales_target || ''} onChange={e => updateEntityTarget(i, 'sales_target', e.target.value)} /></td>
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
                      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                        <button className="sgs-btn sgs-btn-outline" onClick={addEntityTarget}>+ Add Entity</button>
                        <button className="sgs-btn sgs-btn-primary" onClick={saveEntityTargets} disabled={saving}>
                          {saving ? 'Saving...' : 'Save Entity Targets'}
                        </button>
                      </div>
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
                                <td><input value={t.bdm_name || ''} onChange={e => updateBdmTarget(i, 'bdm_name', e.target.value)} placeholder="BDM name" /></td>
                                <td><input value={t.territory || ''} onChange={e => updateBdmTarget(i, 'territory', e.target.value)} placeholder="Territory" /></td>
                                <td><input type="number" value={t.sales_target || ''} onChange={e => updateBdmTarget(i, 'sales_target', e.target.value)} /></td>
                                <td><input type="number" value={t.collection_target || ''} onChange={e => updateBdmTarget(i, 'collection_target', e.target.value)} /></td>
                                <td><span className="sgs-status-badge" style={statusBadgeStyle(t.status || 'DRAFT')}>{t.status || 'DRAFT'}</span></td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr style={{ fontWeight: 700 }}>
                              <td colSpan={3}>Total</td>
                              <td className="num">{php(bdmSum)}</td>
                              <td className="num">{php(bdmTargets.reduce((s, t) => s + (Number(t.collection_target) || 0), 0))}</td>
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
                      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                        <button className="sgs-btn sgs-btn-outline" onClick={addBdmTarget}>+ Add BDM</button>
                        <button className="sgs-btn sgs-btn-primary" onClick={saveBdmTargets} disabled={saving}>
                          {saving ? 'Saving...' : 'Save BDM Targets'}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Incentive Programs Tab */}
              {tab === 'incentive' && (
                <div className="sgs-panel">
                  <h3>Incentive Programs</h3>
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
                          <input type="text" value={prog.program_code} onChange={e => updateIncentiveProgram(i, 'program_code', e.target.value)} placeholder="e.g., SALES_INCENTIVE_2026" />
                        </div>
                        <div className="sgs-field">
                          <label>Program Name</label>
                          <input type="text" value={prog.program_name} onChange={e => updateIncentiveProgram(i, 'program_name', e.target.value)} placeholder="e.g., Annual Sales Incentive" />
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
