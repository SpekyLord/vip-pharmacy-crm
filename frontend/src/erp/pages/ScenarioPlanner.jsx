/**
 * ScenarioPlanner — Phase SG-5 #26
 *
 * What-if modeling for the active Sales Goal Plan. Admin/finance/president set
 * overrides (target revenue, baseline, per-driver weights, per-BDM attainment)
 * and see a side-by-side "current vs scenario" projection — incentive budget,
 * attainment %, tier placement per BDM. NO DB writes (simulation only).
 *
 * Wiring:
 *   Backend: POST /api/erp/sales-goals/plans/:id/simulate
 *   Hook:    useSalesGoals().simulatePlan(planId, overrides)
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import useSalesGoals from '../hooks/useSalesGoals';
import WorkflowGuide from '../components/WorkflowGuide';
import { showError } from '../utils/errorToast';

const php = (n) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 }).format(Number(n) || 0);
const pct = (n) => `${(Number(n) || 0).toFixed(1)}%`;

const styles = `
  .sp-page { background: var(--erp-bg, #f4f7fb); min-height: 100vh; }
  .sp-main { flex: 1; min-width: 0; overflow-y: auto; padding: 20px; max-width: 1400px; margin: 0 auto; }
  .sp-header { margin-bottom: 18px; }
  .sp-header h1 { font-size: 22px; color: var(--erp-text); margin: 0 0 4px; }
  .sp-header p { color: var(--erp-muted); font-size: 13px; margin: 0; }
  .sp-panel { background: var(--erp-panel,#fff); border: 1px solid var(--erp-border,#e5e7eb); border-radius: 14px; padding: 18px; margin-bottom: 14px; }
  .sp-panel h3 { margin: 0 0 12px; font-size: 15px; font-weight: 700; color: var(--erp-text); }
  .sp-grid2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px; }
  .sp-field label { display: block; font-size: 12px; color: var(--erp-muted); text-transform: uppercase; font-weight: 600; margin-bottom: 4px; }
  .sp-field input, .sp-field select { width: 100%; padding: 8px 10px; border: 1px solid var(--erp-border); border-radius: 8px; font-size: 13px; background: var(--erp-panel,#fff); color: var(--erp-text); }
  .sp-btn { padding: 9px 18px; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; background: var(--erp-accent,#2563eb); color: #fff; }
  .sp-btn.secondary { background: #f3f4f6; color: var(--erp-text); border: 1px solid var(--erp-border); }
  .sp-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .sp-actions { display: flex; gap: 10px; margin-top: 14px; flex-wrap: wrap; }
  .sp-summary-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px; margin-bottom: 14px; }
  .sp-summary-card { background: var(--erp-panel,#fff); border: 1px solid var(--erp-border); border-radius: 10px; padding: 14px; }
  .sp-summary-label { font-size: 11px; color: var(--erp-muted); text-transform: uppercase; font-weight: 600; margin-bottom: 4px; }
  .sp-summary-value { font-size: 18px; font-weight: 700; color: var(--erp-text); }
  .sp-summary-delta { font-size: 12px; margin-top: 4px; }
  .sp-summary-delta.up { color: #16a34a; }
  .sp-summary-delta.down { color: #dc2626; }
  .sp-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .sp-table th { text-align: left; padding: 8px; background: var(--erp-accent-soft,#eef2ff); font-weight: 600; font-size: 12px; color: var(--erp-text); white-space: nowrap; }
  .sp-table td { padding: 8px; border-top: 1px solid var(--erp-border); white-space: nowrap; color: var(--erp-text); }
  .sp-table td.num { text-align: right; font-variant-numeric: tabular-nums; }
  .sp-delta { font-size: 11px; padding: 2px 6px; border-radius: 6px; font-weight: 600; margin-left: 6px; }
  .sp-delta.up { background: #dcfce7; color: #166534; }
  .sp-delta.down { background: #fee2e2; color: #991b1b; }
  .sp-delta.flat { background: #f3f4f6; color: #6b7280; }
  .sp-help { font-size: 11px; color: var(--erp-muted); margin-top: 4px; }
  .sp-warning { background: #fef3c7; border: 1px solid #fde68a; color: #92400e; padding: 10px 14px; border-radius: 10px; font-size: 13px; margin-bottom: 14px; }
  .sp-split { display: grid; grid-template-columns: 1fr 1fr; gap: 0; border: 1px solid var(--erp-border); border-radius: 8px; overflow: hidden; }
  .sp-split > div { padding: 10px 12px; }
  .sp-split .cur { background: #f9fafb; }
  .sp-split .scn { background: var(--erp-panel,#fff); }
  .sp-col-head { font-size: 11px; text-transform: uppercase; font-weight: 700; color: var(--erp-muted); margin-bottom: 4px; }
  .loading { text-align: center; padding: 30px; color: var(--erp-muted); }
  @media(max-width: 768px) { .sp-main { padding: 12px; } .sp-split { grid-template-columns: 1fr; } }
  @media(max-width: 360px) {
    .sp-main { padding: 8px; }
    .sp-panel { padding: 12px; }
    .sp-btn { width: 100%; padding: 10px 14px; }
    .sp-table th, .sp-table td { padding: 5px; font-size: 11px; }
  }
`;

function deltaBadge(delta, unit = '') {
  if (!Number.isFinite(delta) || Math.abs(delta) < 0.001) {
    return <span className="sp-delta flat">±0{unit}</span>;
  }
  if (delta > 0) return <span className="sp-delta up">+{unit === '%' ? delta.toFixed(1) : php(delta)}{unit}</span>;
  return <span className="sp-delta down">{unit === '%' ? delta.toFixed(1) : php(delta)}{unit}</span>;
}

export default function ScenarioPlanner() {
  const sg = useSalesGoals();

  const [plan, setPlan] = useState(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [result, setResult] = useState(null);

  // Overrides (UI state; only sent to the API on Run)
  const [targetOverride, setTargetOverride] = useState('');
  const [baselineOverride, setBaselineOverride] = useState('');
  const [driverWeights, setDriverWeights] = useState({}); // { driver_code: weight }
  const [tierAttainment, setTierAttainment] = useState({}); // { bdm_id: pct }

  // Load the active plan for the current entity
  const loadPlan = useCallback(async () => {
    setPlanLoading(true);
    try {
      const res = await sg.getPlans({ status: 'ACTIVE' });
      const list = res?.data || [];
      const active = Array.isArray(list) ? list[0] : null;
      setPlan(active || null);
      // Seed defaults
      if (active) {
        const weights = {};
        (active.growth_drivers || []).forEach(d => { weights[d.driver_code] = Number(d.weight_pct) || 0; });
        setDriverWeights(weights);
      }
    } catch (err) {
      showError(err, 'Failed to load active plan');
    }
    setPlanLoading(false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadPlan(); }, [loadPlan]);

  const runSimulation = useCallback(async () => {
    if (!plan?._id) return;
    setSimulating(true);
    try {
      const overrides = {};
      if (targetOverride !== '' && !Number.isNaN(Number(targetOverride))) overrides.target_revenue_override = Number(targetOverride);
      if (baselineOverride !== '' && !Number.isNaN(Number(baselineOverride))) overrides.baseline_override = Number(baselineOverride);
      if (Object.keys(driverWeights).length) overrides.driver_weight_overrides = driverWeights;
      if (Object.keys(tierAttainment).length) {
        const clean = {};
        for (const [bdmId, v] of Object.entries(tierAttainment)) {
          const n = Number(v);
          if (Number.isFinite(n)) clean[bdmId] = n;
        }
        if (Object.keys(clean).length) overrides.tier_attainment_overrides = clean;
      }
      const res = await sg.simulatePlan(plan._id, overrides);
      setResult(res?.data || null);
    } catch (err) {
      showError(err, 'Simulation failed');
    }
    setSimulating(false);
  }, [plan, targetOverride, baselineOverride, driverWeights, tierAttainment]); // eslint-disable-line react-hooks/exhaustive-deps

  const resetAll = useCallback(() => {
    setTargetOverride('');
    setBaselineOverride('');
    setTierAttainment({});
    if (plan) {
      const weights = {};
      (plan.growth_drivers || []).forEach(d => { weights[d.driver_code] = Number(d.weight_pct) || 0; });
      setDriverWeights(weights);
    }
    setResult(null);
  }, [plan]);

  const rows = result?.rows || [];
  const summary = result?.summary;
  const drivers = result?.drivers || [];

  // Tag BDMs for the attainment override picker
  const bdmPickerRows = useMemo(() => {
    const base = plan?._id ? (result?.rows || []) : [];
    return base.map(r => ({ bdm_id: String(r.bdm_id), name: r.bdm_name }));
  }, [plan, result]);

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <style>{styles}</style>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <Navbar />
        <main className="sp-main">
          <div className="sp-header">
            <h1>Scenario Planner</h1>
            <p>{plan ? `${plan.plan_name} — FY ${plan.fiscal_year}` : 'What-if modeling for the active Sales Goal plan'}</p>
            <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
              <Link to="/erp/sales-goals" style={{ fontSize: 13, color: 'var(--erp-accent)' }}>← Goal Dashboard</Link>
              <Link to="/erp/sales-goals/incentives" style={{ fontSize: 13, color: 'var(--erp-accent)' }}>Incentive Tracker</Link>
            </div>
          </div>

          <WorkflowGuide pageKey="scenarioPlanner" />

          {planLoading && <div className="loading">Loading active plan…</div>}

          {!planLoading && !plan && (
            <div className="sp-panel">
              <p>No active plan found for this entity. <Link to="/erp/sales-goals/setup">Create or activate one</Link> first.</p>
            </div>
          )}

          {plan && (
            <>
              {/* Overrides form */}
              <div className="sp-panel">
                <h3>Scenario Overrides</h3>
                <p className="sp-help">Tweak any combination of the inputs below, then click <strong>Run Simulation</strong>. Nothing is written to the database until you rerun the live Compute KPIs action from the dashboard.</p>
                <div className="sp-grid2" style={{ marginTop: 12 }}>
                  <div className="sp-field">
                    <label>Target Revenue (PHP)</label>
                    <input type="number" min="0" step="1000" placeholder={String(plan.target_revenue || 0)}
                      value={targetOverride} onChange={e => setTargetOverride(e.target.value)} />
                    <div className="sp-help">Current: {php(plan.target_revenue)}</div>
                  </div>
                  <div className="sp-field">
                    <label>Baseline Revenue (PHP)</label>
                    <input type="number" min="0" step="1000" placeholder={String(plan.baseline_revenue || 0)}
                      value={baselineOverride} onChange={e => setBaselineOverride(e.target.value)} />
                    <div className="sp-help">Current: {php(plan.baseline_revenue)}</div>
                  </div>
                </div>

                {/* Driver weights */}
                {(plan.growth_drivers || []).length > 0 && (
                  <>
                    <h3 style={{ marginTop: 18 }}>Driver Weight Mix (%)</h3>
                    <div className="sp-grid2">
                      {(plan.growth_drivers || []).map(d => (
                        <div className="sp-field" key={d.driver_code}>
                          <label>{d.driver_label || d.driver_code}</label>
                          <input type="number" min="0" max="100" step="1"
                            value={driverWeights[d.driver_code] ?? ''}
                            onChange={e => setDriverWeights(w => ({ ...w, [d.driver_code]: e.target.value === '' ? '' : Number(e.target.value) }))} />
                          <div className="sp-help">Plan value: {d.weight_pct ?? 0}%</div>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {/* Per-BDM attainment overrides */}
                {bdmPickerRows.length > 0 && (
                  <>
                    <h3 style={{ marginTop: 18 }}>Per-BDM Attainment Overrides (optional)</h3>
                    <p className="sp-help">Force an attainment % for specific BDMs to preview tier placement. Leave blank to derive from their live actuals.</p>
                    <div className="sp-grid2" style={{ marginTop: 8 }}>
                      {bdmPickerRows.slice(0, 12).map(b => (
                        <div className="sp-field" key={b.bdm_id}>
                          <label>{b.name}</label>
                          <input type="number" min="0" step="1" placeholder="e.g. 115"
                            value={tierAttainment[b.bdm_id] ?? ''}
                            onChange={e => setTierAttainment(t => ({ ...t, [b.bdm_id]: e.target.value }))} />
                        </div>
                      ))}
                    </div>
                    {bdmPickerRows.length > 12 && (
                      <div className="sp-help" style={{ marginTop: 6 }}>Showing first 12 BDMs — re-run simulation once, pick a larger subset from the results if needed.</div>
                    )}
                  </>
                )}

                <div className="sp-actions">
                  <button className="sp-btn" onClick={runSimulation} disabled={simulating}>
                    {simulating ? 'Running…' : 'Run Simulation'}
                  </button>
                  <button className="sp-btn secondary" onClick={resetAll} disabled={simulating}>Reset</button>
                </div>
              </div>

              {/* Results */}
              {result && (
                <>
                  {result.plan_overrides?.weight_warning && (
                    <div className="sp-warning">
                      Scenario driver weights total {result.plan_overrides.total_weight_scenario}% — should sum to 100% for a balanced plan.
                    </div>
                  )}

                  <div className="sp-panel">
                    <h3>Company Summary</h3>
                    <div className="sp-summary-row">
                      <div className="sp-summary-card">
                        <div className="sp-summary-label">Target Revenue</div>
                        <div className="sp-split">
                          <div className="cur">
                            <div className="sp-col-head">Current</div>
                            <div>{php(result.plan_overrides.target_revenue_current)}</div>
                          </div>
                          <div className="scn">
                            <div className="sp-col-head">Scenario</div>
                            <div>{php(result.plan_overrides.target_revenue_scenario)}</div>
                          </div>
                        </div>
                      </div>
                      <div className="sp-summary-card">
                        <div className="sp-summary-label">Total Incentive Budget (YTD)</div>
                        <div className="sp-split">
                          <div className="cur">
                            <div className="sp-col-head">Current</div>
                            <div>{php(summary.current.total_incentive_budget)}</div>
                          </div>
                          <div className="scn">
                            <div className="sp-col-head">Scenario</div>
                            <div>{php(summary.scenario.total_incentive_budget)}</div>
                          </div>
                        </div>
                        <div className="sp-summary-delta">Δ {deltaBadge(summary.diff.total_incentive_budget)}</div>
                      </div>
                      <div className="sp-summary-card">
                        <div className="sp-summary-label">Attainment (Company)</div>
                        <div className="sp-split">
                          <div className="cur">
                            <div className="sp-col-head">Current</div>
                            <div>{pct(summary.current.attainment_pct)}</div>
                          </div>
                          <div className="scn">
                            <div className="sp-col-head">Scenario</div>
                            <div>{pct(summary.scenario.attainment_pct)}</div>
                          </div>
                        </div>
                      </div>
                      <div className="sp-summary-card">
                        <div className="sp-summary-label">BDMs Modeled</div>
                        <div className="sp-summary-value">{summary.bdm_count}</div>
                      </div>
                    </div>
                  </div>

                  {drivers.length > 0 && (
                    <div className="sp-panel" style={{ overflowX: 'auto' }}>
                      <h3>Driver Weight Projection</h3>
                      <table className="sp-table">
                        <thead>
                          <tr>
                            <th>Driver</th>
                            <th className="num">Weight (cur)</th>
                            <th className="num">Weight (scn)</th>
                            <th className="num">Revenue share (cur)</th>
                            <th className="num">Revenue share (scn)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {drivers.map(d => (
                            <tr key={d.driver_code}>
                              <td>{d.driver_label}</td>
                              <td className="num">{d.weight_current}%</td>
                              <td className="num">{d.weight_scenario}%{d.weight_scenario !== d.weight_current && deltaBadge(d.weight_scenario - d.weight_current, '%')}</td>
                              <td className="num">{php(d.revenue_share_current)}</td>
                              <td className="num">{php(d.revenue_share_scenario)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  <div className="sp-panel" style={{ overflowX: 'auto' }}>
                    <h3>Per-BDM Tier Projection</h3>
                    {rows.length === 0 ? (
                      <div style={{ color: 'var(--erp-muted)', fontSize: 13, textAlign: 'center', padding: 14 }}>
                        No BDM snapshots available yet. Run Compute KPIs on the Goal Dashboard first to populate the modeler.
                      </div>
                    ) : (
                      <table className="sp-table">
                        <thead>
                          <tr>
                            <th>BDM</th>
                            <th className="num">Target</th>
                            <th className="num">Actual</th>
                            <th className="num">Attainment (cur)</th>
                            <th className="num">Attainment (scn)</th>
                            <th>Tier (cur)</th>
                            <th>Tier (scn)</th>
                            <th className="num">Accel (cur)</th>
                            <th className="num">Accel (scn)</th>
                            <th className="num">Budget (cur)</th>
                            <th className="num">Budget (scn)</th>
                            <th className="num">Δ Budget</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map(r => (
                            <tr key={r.bdm_id}>
                              <td>{r.bdm_name}{r.bdm_code ? ` (${r.bdm_code})` : ''}</td>
                              <td className="num">{php(r.sales_target_scenario)}</td>
                              <td className="num">{php(r.sales_actual)}</td>
                              <td className="num">{pct(r.attainment_current)}</td>
                              <td className="num">{pct(r.attainment_scenario)}</td>
                              <td>{r.tier_current || '—'}</td>
                              <td>{r.tier_scenario || '—'}</td>
                              <td className="num">{(r.accelerator_current || 1).toFixed(2)}×</td>
                              <td className="num">{(r.accelerator_scenario || 1).toFixed(2)}×</td>
                              <td className="num">{php(r.tier_budget_current)}</td>
                              <td className="num">{php(r.tier_budget_scenario)}</td>
                              <td className="num">{deltaBadge(r.budget_delta)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
