/**
 * SalesGoalDashboard — Phase 28 Sales Goals & KPI command center.
 * Company progress, entity breakdown, BDM leaderboard, incentive tiers.
 */
import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import { useAuth } from '../../hooks/useAuth';
import useSalesGoals from '../hooks/useSalesGoals';
import WorkflowGuide from '../components/WorkflowGuide';
import { showError, showSuccess, showApprovalPending, isApprovalPending } from '../utils/errorToast';

const php = (n) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 }).format(n || 0);
const pct = (n) => `${(n || 0).toFixed(1)}%`;

const pageStyles = `
  .sgd-page { background: var(--erp-bg, #f4f7fb); min-height: 100vh; }
  .sgd-main { flex: 1; min-width: 0; overflow-y: auto; padding: 20px; max-width: 1400px; margin: 0 auto; }
  .sgd-header { margin-bottom: 20px; }
  .sgd-header h1 { font-size: 22px; color: var(--erp-text); margin: 0 0 4px; }
  .sgd-header p { color: var(--erp-muted); font-size: 13px; margin: 0; }
  .sgd-row { display: flex; gap: 16px; flex-wrap: wrap; margin-bottom: 16px; }
  .sgd-card { background: var(--erp-panel, #fff); border: 1px solid var(--erp-border, #e5e7eb); border-radius: 14px; padding: 20px; flex: 1; min-width: 200px; }
  .sgd-card-label { font-size: 11px; color: var(--erp-muted); text-transform: uppercase; font-weight: 600; margin-bottom: 4px; }
  .sgd-card-value { font-size: 22px; font-weight: 700; color: var(--erp-text); }
  .sgd-card-sub { font-size: 12px; color: var(--erp-muted); margin-top: 2px; }
  .sgd-progress-panel { background: var(--erp-panel, #fff); border: 1px solid var(--erp-border); border-radius: 14px; padding: 20px; margin-bottom: 16px; }
  .sgd-progress-label { display: flex; justify-content: space-between; font-size: 12px; color: var(--erp-muted); margin-bottom: 6px; }
  .sgd-progress-track { height: 24px; background: #f3f4f6; border-radius: 12px; overflow: hidden; position: relative; }
  .sgd-progress-fill { height: 100%; border-radius: 12px; transition: width 0.4s; }
  .sgd-progress-marker { position: absolute; top: 0; bottom: 0; width: 2px; background: var(--erp-text, #1e293b); }
  .sgd-progress-marker-label { position: absolute; top: -18px; font-size: 10px; color: var(--erp-muted); white-space: nowrap; transform: translateX(-50%); }
  .sgd-entity-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 12px; margin-bottom: 16px; }
  .sgd-entity-card { background: var(--erp-panel, #fff); border: 1px solid var(--erp-border); border-radius: 12px; padding: 16px; }
  .sgd-entity-name { font-size: 14px; font-weight: 600; color: var(--erp-text); margin-bottom: 8px; }
  .sgd-entity-bar-track { height: 8px; background: #f3f4f6; border-radius: 4px; overflow: hidden; margin-bottom: 4px; }
  .sgd-entity-bar-fill { height: 100%; border-radius: 4px; }
  .sgd-entity-nums { display: flex; justify-content: space-between; font-size: 11px; color: var(--erp-muted); }
  .sgd-driver-card { background: var(--erp-panel, #fff); border: 1px solid var(--erp-border); border-radius: 12px; padding: 16px; flex: 1; min-width: 220px; }
  .sgd-driver-label { font-size: 13px; font-weight: 600; color: var(--erp-text); margin-bottom: 6px; }
  .sgd-driver-range { font-size: 11px; color: var(--erp-muted); margin-bottom: 8px; }
  .sgd-driver-bar-track { height: 6px; background: #f3f4f6; border-radius: 3px; overflow: hidden; }
  .sgd-driver-bar-fill { height: 100%; border-radius: 3px; background: var(--erp-accent, #2563eb); }
  .sgd-panel { background: var(--erp-panel, #fff); border: 1px solid var(--erp-border); border-radius: 14px; padding: 20px; margin-bottom: 16px; overflow-x: auto; }
  .sgd-panel h3 { font-size: 15px; font-weight: 700; color: var(--erp-text); margin: 0 0 12px; }
  .sgd-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .sgd-table th { text-align: left; padding: 8px 10px; background: var(--erp-accent-soft, #eef2ff); font-weight: 600; white-space: nowrap; color: var(--erp-text); }
  .sgd-table td { padding: 8px 10px; border-top: 1px solid var(--erp-border); white-space: nowrap; color: var(--erp-text); }
  .sgd-table td.num { text-align: right; font-variant-numeric: tabular-nums; }
  .sgd-badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 600; }
  .sgd-tier-badge { display: inline-block; padding: 3px 10px; border-radius: 12px; font-size: 11px; font-weight: 700; }
  .sgd-btn { padding: 8px 16px; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; background: var(--erp-accent, #2563eb); color: white; }
  .sgd-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .sgd-section-title { font-size: 15px; font-weight: 700; color: var(--erp-text); margin: 0 0 12px; }
  .sgd-sort-btn { background: none; border: none; cursor: pointer; font-weight: 600; color: var(--erp-text); padding: 8px 10px; font-size: 13px; text-align: left; width: 100%; }
  .sgd-sort-btn:hover { color: var(--erp-accent); }
  .loading { text-align: center; padding: 40px; color: var(--erp-muted); }
  @media(max-width: 768px) { .sgd-main { padding: 12px; } .sgd-row { flex-direction: column; } }
  /* Phase SG-Q2 W3 — 360px phone breakpoint */
  @media(max-width: 360px) {
    .sgd-main { padding: 8px; }
    .sgd-header h1 { font-size: 18px; }
    .sgd-card { padding: 14px; min-width: 0; }
    .sgd-card-value { font-size: 18px; }
    .sgd-progress-panel, .sgd-panel { padding: 14px; }
    .sgd-entity-grid { grid-template-columns: 1fr; }
    .sgd-driver-card { min-width: 0; }
    .sgd-table th, .sgd-table td { padding: 6px; font-size: 11px; }
    .sgd-section-title, .sgd-panel h3 { font-size: 13px; }
    .sgd-btn { width: 100%; padding: 10px 14px; }
  }
`;

// Bucket attainment % into a STATUS_PALETTE code using GOAL_CONFIG thresholds.
// Codes match the bucket emitted by salesGoalController.getGoalDashboard().
function statusBucket(attPct, config) {
  if (attPct >= (config?.attainment_green ?? 90)) return 'ON_TRACK';
  if (attPct >= (config?.attainment_yellow ?? 70)) return 'NEEDS_ATTENTION';
  return 'AT_RISK';
}

// Lookup-driven STATUS_PALETTE: built from dashboard.palette (Control Center →
// Lookup Tables). Neutral grey fallback so an unseeded entity / new status
// code still renders without a crash.
const NEUTRAL_PALETTE = { bar: '#9ca3af', bg: '#f3f4f6', text: '#374151', label: '' };

function buildPaletteMap(palette) {
  const map = {};
  for (const p of palette || []) {
    if (!p?.code) continue;
    map[p.code.toUpperCase()] = {
      bar: p.bar_color || NEUTRAL_PALETTE.bar,
      bg: p.bg_color || NEUTRAL_PALETTE.bg,
      text: p.text_color || NEUTRAL_PALETTE.text,
      label: p.label || p.code,
    };
  }
  return map;
}

// Resolve palette by either the server-emitted lowercase status (`on_track`)
// or the bucket code (`ON_TRACK`). Falls back to neutral grey for unknowns.
function paletteFor(code, paletteMap) {
  const key = String(code || '').toUpperCase();
  return paletteMap[key] || { ...NEUTRAL_PALETTE, label: key || NEUTRAL_PALETTE.label };
}

// Convenience: resolve palette directly from attainment %.
function paletteForAttainment(attPct, config, paletteMap) {
  return paletteFor(statusBucket(attPct, config), paletteMap);
}

// tierColorMap built from API tiers data (Lookup-driven, not hardcoded)
function buildTierColorMap(tiers) {
  const map = {};
  if (tiers) {
    for (const t of tiers) {
      if (t.label) map[t.label.toLowerCase()] = { bg: t.bg_color || '#dbeafe', color: t.text_color || '#1e40af' };
    }
  }
  return map;
}

function tierColor(tier, colorMap) {
  const t = (tier || '').toLowerCase();
  return colorMap[t] || { bg: '#dbeafe', color: '#1e40af' };
}

export default function SalesGoalDashboard() {
  const { user: _user } = useAuth(); // eslint-disable-line no-unused-vars
  const sg = useSalesGoals();

  const [loading, setLoading] = useState(false);
  const [computing, setComputing] = useState(false);
  const [dashboard, setDashboard] = useState(null);
  const [sortField, setSortField] = useState('rank');
  const [sortDir, setSortDir] = useState('asc');
  // Phase SG-Q2 W2 — payout summary widget (YTD accrued / paid / pending)
  const [payoutSummary, setPayoutSummary] = useState(null);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const res = await sg.getGoalDashboard();
      setDashboard(res?.data || null);
    } catch (err) { showError(err, 'Failed to load sales goal dashboard'); }
    setLoading(false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadPayoutSummary = useCallback(async () => {
    try {
      // useErpApi unwraps to HTTP body → res is { success, data: [...], summary: {...} }
      const res = await sg.getPayouts({ fiscal_year: String(new Date().getFullYear()) });
      setPayoutSummary(res?.summary || null);
    } catch {
      setPayoutSummary(null);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadDashboard(); loadPayoutSummary(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleComputeSnapshots = useCallback(async () => {
    if (!dashboard?.plan?._id) return;
    setComputing(true);
    try {
      const res = await sg.computeSnapshots({ plan_id: dashboard.plan._id });
      if (isApprovalPending(res)) {
        showApprovalPending('KPI compute sent for approval.');
      } else {
        const count = res?.data?.count ?? res?.count ?? res?.data?.data?.length ?? 0;
        await loadDashboard();
        showSuccess(count ? `Computed ${count} BDM snapshot${count === 1 ? '' : 's'}` : 'KPIs computed');
      }
    } catch (err) {
      if (isApprovalPending(null, err)) showApprovalPending('KPI compute sent for approval.');
      else showError(err, 'Failed to compute KPI snapshots');
    }
    setComputing(false);
  }, [dashboard?.plan?._id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSort = (field) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  };

  const sortedLeaderboard = () => {
    const lb = dashboard?.leaderboard || [];
    return [...lb].sort((a, b) => {
      let va = a[sortField], vb = b[sortField];
      if (typeof va === 'string') va = va.toLowerCase();
      if (typeof vb === 'string') vb = vb.toLowerCase();
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  };

  const plan = dashboard?.plan;
  const summary = dashboard?.summary || {};
  const config = dashboard?.config || {};
  const entityTargets = dashboard?.entity_targets || [];
  const drivers = plan?.growth_drivers || [];
  const paletteMap = buildPaletteMap(dashboard?.palette);

  const baselineRevenue = plan?.baseline_revenue || 0;
  const targetRevenue = plan?.target_revenue || 0;
  const actualRevenue = summary?.total_sales_actual || 0;
  const maxBar = Math.max(targetRevenue, actualRevenue) * 1.1 || 1;
  const actualPct = Math.min((actualRevenue / maxBar) * 100, 100);
  const targetPct = Math.min((targetRevenue / maxBar) * 100, 100);
  const baselinePct = Math.min((baselineRevenue / maxBar) * 100, 100);

   
  const SortTh = ({ field, children }) => (
    <th>
      <button className="sgd-sort-btn" onClick={() => handleSort(field)}>
        {children} {sortField === field ? (sortDir === 'asc' ? '▲' : '▼') : ''}
      </button>
    </th>
  );
   

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <style>{pageStyles}</style>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <Navbar />
        <main className="sgd-main">
          <div className="sgd-header">
            <h1>Sales Goal Dashboard</h1>
            <p>{plan ? `${plan.plan_name} — FY ${plan.fiscal_year}` : 'Sales Goals & KPI Command Center'}</p>
            <div style={{ display: 'flex', gap: 10, marginTop: 10, alignItems: 'center' }}>
              <Link to="/erp/sales-goals/setup" style={{ fontSize: 13, color: 'var(--erp-accent)' }}>
                Setup Goals
              </Link>
              <Link to="/erp/sales-goals/incentives" style={{ fontSize: 13, color: 'var(--erp-accent)' }}>
                Incentive Tracker
              </Link>
              <button className="sgd-btn" onClick={handleComputeSnapshots} disabled={computing || !plan}>
                {computing ? 'Computing...' : 'Compute KPIs'}
              </button>
            </div>
          </div>

          <WorkflowGuide pageKey="salesGoalDashboard" />

          {loading && <div className="loading">Loading dashboard...</div>}

          {!loading && !plan && (
            <div className="sgd-panel" style={{ textAlign: 'center', padding: 40 }}>
              <p style={{ color: 'var(--erp-muted)', fontSize: 14 }}>
                No active sales goal plan found. <Link to="/erp/sales-goals/setup" style={{ color: 'var(--erp-accent)' }}>Create one</Link>
              </p>
            </div>
          )}

          {!loading && plan && (
            <>
              {/* Company Progress Bar */}
              <div className="sgd-progress-panel">
                <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--erp-text)', margin: '0 0 12px' }}>
                  Company Revenue Progress
                </h3>
                <div className="sgd-progress-label">
                  <span>Baseline: {php(baselineRevenue)}</span>
                  <span>Target: {php(targetRevenue)}</span>
                </div>
                <div className="sgd-progress-track">
                  <div className="sgd-progress-fill" style={{
                    width: `${actualPct}%`,
                    background: actualRevenue >= targetRevenue ? '#22c55e' : actualRevenue >= targetRevenue * 0.8 ? '#f59e0b' : '#3b82f6'
                  }} />
                  <div className="sgd-progress-marker" style={{ left: `${baselinePct}%` }}>
                    <span className="sgd-progress-marker-label">Baseline</span>
                  </div>
                  <div className="sgd-progress-marker" style={{ left: `${targetPct}%` }}>
                    <span className="sgd-progress-marker-label">Target</span>
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 13 }}>
                  <span style={{ color: 'var(--erp-text)', fontWeight: 600 }}>Actual: {php(actualRevenue)}</span>
                  <span style={{ color: 'var(--erp-muted)' }}>
                    {targetRevenue > 0 ? pct((actualRevenue / targetRevenue) * 100) : '0%'} attainment
                  </span>
                </div>
              </div>

              {/* Entity Breakdown */}
              {entityTargets.length > 0 && (
                <>
                  <h3 className="sgd-section-title">Entity Breakdown</h3>
                  <div className="sgd-entity-grid">
                    {entityTargets.map((et, i) => {
                      const attain = et.sales_target ? ((et.actual || 0) / et.sales_target) * 100 : 0;
                      const displayName = et.entity_name || `Entity ${i + 1}`;
                      return (
                        <div key={et._id || i} className="sgd-entity-card">
                          <div className="sgd-entity-name">
                            {displayName}{et.short_name ? ` (${et.short_name})` : ''}
                            {et.is_inactive && (
                              <span style={{ marginLeft: 6, fontSize: 10, padding: '2px 6px', borderRadius: 8, background: '#fef3c7', color: '#92400e', fontWeight: 600 }}>
                                INACTIVE
                              </span>
                            )}
                          </div>
                          <div className="sgd-entity-bar-track">
                            <div className="sgd-entity-bar-fill" style={{
                              width: `${Math.min(attain, 100)}%`,
                              background: paletteForAttainment(attain, config, paletteMap).bar
                            }} />
                          </div>
                          <div className="sgd-entity-nums">
                            <span>Actual: {php(et.actual)}</span>
                            <span>Target: {php(et.sales_target)}</span>
                            <span>{pct(attain)}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              {/* Summary Cards */}
              <div className="sgd-row">
                <div className="sgd-card">
                  <div className="sgd-card-label">Sales YTD vs Target</div>
                  <div className="sgd-card-value">{php(summary.total_sales_actual)}</div>
                  <div className="sgd-card-sub">Target: {php(targetRevenue)}</div>
                </div>
                <div className="sgd-card">
                  <div className="sgd-card-label">Collections YTD</div>
                  <div className="sgd-card-value">{php(summary.total_collections_actual)}</div>
                </div>
                <div className="sgd-card">
                  <div className="sgd-card-label">Attainment %</div>
                  <div className="sgd-card-value" style={{ color: paletteForAttainment(summary.overall_attainment_pct || 0, config, paletteMap).bar }}>
                    {pct(summary.overall_attainment_pct)}
                  </div>
                </div>
                <div className="sgd-card">
                  <div className="sgd-card-label">Collection Rate %</div>
                  <div className="sgd-card-value">{pct(summary.collection_rate_pct)}</div>
                </div>
                {payoutSummary ? (
                  <Link to="/erp/incentive-payouts" className="sgd-card" style={{ textDecoration: 'none', cursor: 'pointer' }}>
                    <div className="sgd-card-label">Incentive Ledger (YTD)</div>
                    <div className="sgd-card-value" style={{ color: '#16a34a' }}>{php((payoutSummary.paid || 0))}</div>
                    <div className="sgd-card-sub">
                      Accrued {php((payoutSummary.accrued || 0))} · Approved {php((payoutSummary.approved || 0))} · {payoutSummary.count} row(s)
                    </div>
                  </Link>
                ) : (
                  <Link to="/erp/incentive-payouts" className="sgd-card" style={{ textDecoration: 'none', cursor: 'pointer' }}>
                    <div className="sgd-card-label">Incentive Ledger</div>
                    <div className="sgd-card-value" style={{ color: 'var(--erp-muted)' }}>—</div>
                    <div className="sgd-card-sub">Open payout ledger →</div>
                  </Link>
                )}
              </div>

              {/* Growth Drivers */}
              {drivers.length > 0 && (
                <>
                  <h3 className="sgd-section-title">Growth Drivers</h3>
                  <div className="sgd-row">
                    {drivers.map((d, i) => {
                      const minVal = Number(d.revenue_target_min) || 0;
                      const maxVal = Number(d.revenue_target_max) || 0;
                      const hasTargetRange = minVal > 0 || maxVal > 0;
                      const mid = hasTargetRange ? ((minVal + maxVal) / 2 || 1) : 1;
                      const driverActual = Number(d.actual) || 0;
                      const driverPct = hasTargetRange ? Math.min((driverActual / mid) * 100, 100) : 0;
                      return (
                        <div key={d.driver_code || i} className="sgd-driver-card">
                          <div className="sgd-driver-label">{d.driver_label || d.driver_code}</div>
                          <div className="sgd-driver-range">
                            {hasTargetRange
                              ? `${php(minVal)} - ${php(maxVal)}`
                              : 'No target range set'}
                          </div>
                          <div className="sgd-driver-bar-track">
                            <div className="sgd-driver-bar-fill" style={{ width: `${driverPct}%` }} />
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--erp-muted)', marginTop: 4 }}>
                            Actual: {php(driverActual)}{hasTargetRange ? ` (${driverPct.toFixed(1)}%)` : ''}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              {/* BDM Leaderboard */}
              <div className="sgd-panel">
                <h3>BDM Leaderboard</h3>
                {(dashboard?.leaderboard || []).length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 20, color: 'var(--erp-muted)', fontSize: 13 }}>
                    <div style={{ marginBottom: 10 }}>
                      No BDM snapshots yet. Once BDM targets are assigned, click the button below to roll up their YTD sales, attainment, and incentive tier.
                    </div>
                    <button className="sgd-btn" onClick={handleComputeSnapshots} disabled={computing}>
                      {computing ? 'Computing...' : 'Compute KPIs now'}
                    </button>
                    <div style={{ marginTop: 8, fontSize: 12 }}>
                      Or <Link to="/erp/sales-goals/setup" style={{ color: 'var(--erp-accent)' }}>add BDM targets</Link> first if you haven&apos;t.
                    </div>
                  </div>
                ) : (
                  <table className="sgd-table">
                    <thead>
                      <tr>
                        <SortTh field="rank">Rank</SortTh>
                        <SortTh field="name">Name</SortTh>
                        <SortTh field="territory">Territory</SortTh>
                        <SortTh field="sales_target">Target</SortTh>
                        <SortTh field="sales_actual">Actual</SortTh>
                        <SortTh field="sales_attainment_pct">Attainment %</SortTh>
                        <SortTh field="incentive_tier">Tier</SortTh>
                        <th style={{ padding: '8px 10px', fontWeight: 600, fontSize: 13, background: 'var(--erp-accent-soft)' }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedLeaderboard().map((row, i) => {
                        // Resolve palette: server emits row.status (lowercase) — fall back to threshold bucket if missing.
                        const bucket = row.status ? row.status : statusBucket(row.sales_attainment_pct || 0, config);
                        const statusPal = paletteFor(bucket, paletteMap);
                        const tc = tierColor(row.incentive_tier, buildTierColorMap(dashboard?.tiers));
                        return (
                          <tr key={row.bdm_id || i}>
                            <td className="num">{row.rank || i + 1}</td>
                            <td>
                              <Link to={`/erp/sales-goals/bdm/${row.bdm_id}`} style={{ color: 'var(--erp-accent)', textDecoration: 'none', fontWeight: 600 }}>
                                {row.name || 'Unknown'}
                              </Link>
                            </td>
                            <td>{row.territory || '-'}</td>
                            <td className="num">{php(row.sales_target)}</td>
                            <td className="num">{php(row.sales_actual)}</td>
                            <td className="num" style={{ color: statusPal.bar, fontWeight: 600 }}>
                              {pct(row.sales_attainment_pct)}
                            </td>
                            <td>
                              <span className="sgd-tier-badge" style={{ background: tc.bg, color: tc.color }}>
                                {row.incentive_tier || 'N/A'}
                              </span>
                            </td>
                            <td>
                              <span className="sgd-badge" style={{
                                background: statusPal.bg,
                                color: statusPal.text
                              }}>
                                {statusPal.label || bucket}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Incentive Panel */}
              {(dashboard?.leaderboard || []).length > 0 && (
                <div className="sgd-panel">
                  <h3>Incentive Tier Overview</h3>
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    {(() => {
                      const tiers = {};
                      (dashboard?.leaderboard || []).forEach(b => {
                        const t = b.incentive_tier || 'Participant';
                        if (!tiers[t]) tiers[t] = 0;
                        tiers[t]++;
                      });
                      return Object.entries(tiers).map(([tier, count]) => {
                        const tc = tierColor(tier, buildTierColorMap(dashboard?.tiers));
                        return (
                          <div key={tier} style={{
                            background: tc.bg,
                            color: tc.color,
                            borderRadius: 12,
                            padding: '12px 20px',
                            textAlign: 'center',
                            minWidth: 100
                          }}>
                            <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase' }}>{tier}</div>
                            <div style={{ fontSize: 22, fontWeight: 700 }}>{count}</div>
                            <div style={{ fontSize: 11 }}>BDM{count !== 1 ? 's' : ''}</div>
                          </div>
                        );
                      });
                    })()}
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
