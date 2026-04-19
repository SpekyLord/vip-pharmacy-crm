/**
 * SalesGoalBdmView — Phase 28 Individual BDM detail page.
 * Shows attainment ring, incentive tier, monthly trend, driver KPIs, and action items.
 */
import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import { useAuth } from '../../hooks/useAuth';
import useSalesGoals from '../hooks/useSalesGoals';
import WorkflowGuide from '../components/WorkflowGuide';
import { showError } from '../utils/errorToast';

const php = (n) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 }).format(n || 0);
const pct = (n) => `${(n || 0).toFixed(1)}%`;

const pageStyles = `
  .bdv-main { flex: 1; min-width: 0; overflow-y: auto; padding: 20px; max-width: 1200px; margin: 0 auto; }
  .bdv-header { margin-bottom: 20px; }
  .bdv-header h1 { font-size: 22px; color: var(--erp-text); margin: 0 0 4px; }
  .bdv-header p { color: var(--erp-muted); font-size: 13px; margin: 0; }
  .bdv-profile { display: flex; gap: 16px; align-items: center; margin-bottom: 20px; padding: 16px; background: var(--erp-panel, #fff); border: 1px solid var(--erp-border); border-radius: 14px; flex-wrap: wrap; }
  .bdv-profile-info { flex: 1; }
  .bdv-profile-name { font-size: 18px; font-weight: 700; color: var(--erp-text); }
  .bdv-profile-detail { font-size: 13px; color: var(--erp-muted); margin-top: 2px; }
  .bdv-badge { display: inline-block; padding: 3px 10px; border-radius: 10px; font-size: 11px; font-weight: 700; }
  .bdv-row { display: flex; gap: 16px; margin-bottom: 16px; flex-wrap: wrap; }
  .bdv-card { background: var(--erp-panel, #fff); border: 1px solid var(--erp-border); border-radius: 14px; padding: 20px; flex: 1; min-width: 260px; }
  .bdv-card h4 { font-size: 13px; font-weight: 700; color: var(--erp-text); margin: 0 0 12px; }
  .bdv-ring-wrap { display: flex; justify-content: center; align-items: center; margin-bottom: 12px; }
  .bdv-ring { position: relative; width: 120px; height: 120px; }
  .bdv-ring svg { transform: rotate(-90deg); }
  .bdv-ring-label { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; }
  .bdv-ring-pct { font-size: 24px; font-weight: 700; color: var(--erp-text); }
  .bdv-ring-sub { font-size: 10px; color: var(--erp-muted); }
  .bdv-stat { display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 4px; }
  .bdv-stat-label { color: var(--erp-muted); }
  .bdv-stat-value { font-weight: 600; color: var(--erp-text); }
  .bdv-tier-card { text-align: center; }
  .bdv-tier-badge { display: inline-block; padding: 6px 16px; border-radius: 16px; font-size: 14px; font-weight: 700; margin-bottom: 8px; }
  .bdv-tier-detail { font-size: 12px; color: var(--erp-muted); margin-bottom: 4px; }
  .bdv-next-tier { font-size: 13px; color: var(--erp-accent, #2563eb); font-weight: 600; margin-top: 8px; }
  .bdv-panel { background: var(--erp-panel, #fff); border: 1px solid var(--erp-border); border-radius: 14px; padding: 20px; margin-bottom: 16px; }
  .bdv-panel h3 { font-size: 15px; font-weight: 700; color: var(--erp-text); margin: 0 0 12px; }
  .bdv-chart { display: flex; align-items: flex-end; gap: 6px; height: 160px; padding-top: 10px; }
  .bdv-bar-group { display: flex; flex-direction: column; align-items: center; flex: 1; gap: 2px; }
  .bdv-bar-container { display: flex; gap: 3px; align-items: flex-end; height: 130px; width: 100%; justify-content: center; }
  .bdv-bar { border-radius: 3px 3px 0 0; min-width: 10px; max-width: 20px; flex: 1; transition: height 0.3s; }
  .bdv-bar-label { font-size: 10px; color: var(--erp-muted); text-align: center; }
  .bdv-driver-section { border: 1px solid var(--erp-border); border-radius: 10px; margin-bottom: 10px; overflow: hidden; }
  .bdv-driver-header { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; cursor: pointer; background: var(--erp-bg, #f4f7fb); }
  .bdv-driver-header:hover { background: var(--erp-accent-soft, #eef2ff); }
  .bdv-driver-name { font-size: 13px; font-weight: 600; color: var(--erp-text); }
  .bdv-driver-body { padding: 12px 16px; }
  .bdv-kpi-row { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
  .bdv-kpi-name { font-size: 12px; color: var(--erp-text); width: 140px; flex-shrink: 0; }
  .bdv-kpi-track { flex: 1; height: 8px; background: #f3f4f6; border-radius: 4px; overflow: hidden; }
  .bdv-kpi-fill { height: 100%; border-radius: 4px; }
  .bdv-kpi-nums { font-size: 11px; color: var(--erp-muted); width: 100px; text-align: right; flex-shrink: 0; }
  .bdv-actions-list { display: flex; flex-direction: column; gap: 8px; }
  .bdv-action-item { display: flex; align-items: center; gap: 10px; padding: 10px 14px; border: 1px solid var(--erp-border); border-radius: 10px; background: var(--erp-bg, #f4f7fb); }
  .bdv-action-status { font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 8px; }
  .bdv-action-title { flex: 1; font-size: 13px; color: var(--erp-text); }
  .bdv-action-meta { font-size: 11px; color: var(--erp-muted); }
  .bdv-form-row { display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap; }
  .bdv-form-row input, .bdv-form-row select { padding: 8px 10px; border: 1px solid var(--erp-border); border-radius: 8px; font-size: 13px; background: var(--erp-panel); color: var(--erp-text); }
  .bdv-btn { padding: 8px 16px; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; }
  .bdv-btn-primary { background: var(--erp-accent, #2563eb); color: white; }
  .bdv-btn-success { background: #22c55e; color: white; }
  .bdv-btn-sm { padding: 4px 10px; font-size: 12px; }
  .bdv-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .loading { text-align: center; padding: 40px; color: var(--erp-muted); }
  @media(max-width: 768px) { .bdv-main { padding: 12px; } .bdv-row { flex-direction: column; } }
`;

// Colors from Lookup config (database-driven, not hardcoded)
function attainColor(pctVal, config) {
  if (config?.attainment_green && pctVal >= config.attainment_green) return '#22c55e';
  if (config?.attainment_yellow && pctVal >= config.attainment_yellow) return '#f59e0b';
  return '#ef4444';
}

function buildTierColorMap(tiers) {
  const map = {};
  if (tiers) {
    for (const t of tiers) {
      if (t.label) map[t.label.toLowerCase()] = { bg: t.bg_color || '#dbeafe', color: t.text_color || '#1e40af' };
    }
  }
  return map;
}

function tierColorStyle(tier, colorMap) {
  const t = (tier || '').toLowerCase();
  return colorMap[t] || { bg: '#dbeafe', color: '#1e40af' };
}

function actionStatusStyle(status) {
  if (status === 'DONE') return { bg: '#dcfce7', color: '#166534' };
  if (status === 'IN_PROGRESS') return { bg: '#dbeafe', color: '#1e40af' };
  return { bg: '#fef9c3', color: '#854d0e' };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function SalesGoalBdmView() {
  const { bdmId } = useParams();
  const { user } = useAuth();
  const sg = useSalesGoals();

  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState(null);
  const [expandedDrivers, setExpandedDrivers] = useState({});
  const [actionForm, setActionForm] = useState({ title: '', driver_code: '', priority: 'MEDIUM', due_date: '' });
  const [savingAction, setSavingAction] = useState(false);

  const effectiveId = bdmId || user?._id || user?.id;

  const loadDetail = useCallback(async () => {
    if (!effectiveId) return;
    setLoading(true);
    try {
      const res = await sg.getBdmGoalDetail(effectiveId);
      setDetail(res?.data || null);
    } catch (err) { showError(err, 'Failed to load BDM goal detail'); }
    setLoading(false);
  }, [effectiveId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadDetail(); }, [effectiveId]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleDriver = (code) => {
    setExpandedDrivers(prev => ({ ...prev, [code]: !prev[code] }));
  };

  const handleCreateAction = useCallback(async () => {
    if (!actionForm.title.trim()) return;
    setSavingAction(true);
    try {
      await sg.createAction({
        bdm_id: effectiveId,
        title: actionForm.title,
        driver_code: actionForm.driver_code,
        priority: actionForm.priority,
        due_date: actionForm.due_date || undefined,
      });
      setActionForm({ title: '', driver_code: '', priority: 'MEDIUM', due_date: '' });
      await loadDetail();
    } catch (err) { showError(err, 'Failed to create action'); }
    setSavingAction(false);
  }, [actionForm, effectiveId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCompleteAction = useCallback(async (actionId) => {
    try {
      await sg.completeAction(actionId);
      await loadDetail();
    } catch (err) { showError(err, 'Failed to complete action'); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const person = detail?.person || {};
  const target = detail?.target || {};
  const ytdSnap = detail?.ytdSnapshot || {};
  const incentive = ytdSnap?.incentive_status?.[0] || {};
  const monthly = detail?.monthlyHistory || [];
  const drivers = ytdSnap?.driver_kpis || [];
  const planDrivers = detail?.plan?.growth_drivers || [];
  const actions = detail?.actions || [];
  const goalConfig = detail?.config || {};
  const colorMap = buildTierColorMap(detail?.tiers);

  const attainPct = ytdSnap.sales_attainment_pct || 0;
  const ringColor = attainColor(attainPct, goalConfig);
  const ringRadius = 50;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringOffset = ringCircumference - (Math.min(attainPct, 100) / 100) * ringCircumference;

  const maxMonthly = Math.max(...monthly.map(m => Math.max(m.actual || 0, m.target || 0)), 1);

  const tc = tierColorStyle(incentive.tier_label, colorMap);

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <style>{pageStyles}</style>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <Navbar />
        <main className="bdv-main">
          <div className="bdv-header">
            <h1>BDM Goal Detail</h1>
            <p>{person.full_name || 'My Sales Goals'}</p>
            <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
              <Link to="/erp/sales-goals" style={{ fontSize: 13, color: 'var(--erp-accent)' }}>
                Back to Dashboard
              </Link>
              <Link to={`/erp/partner-scorecard/${effectiveId}`} style={{ fontSize: 13, color: 'var(--erp-accent)' }}>
                Partner Scorecard
              </Link>
            </div>
          </div>

          <WorkflowGuide pageKey="salesGoalBdmView" />

          {loading && <div className="loading">Loading BDM detail...</div>}

          {!loading && !detail && (
            <div className="bdv-panel" style={{ textAlign: 'center', padding: 40 }}>
              <p style={{ color: 'var(--erp-muted)', fontSize: 14 }}>
                No goal data found for this BDM. Targets may not have been assigned yet.
              </p>
            </div>
          )}

          {!loading && detail && (
            <>
              {/* Profile Header */}
              <div className="bdv-profile">
                <div style={{
                  width: 48, height: 48, borderRadius: '50%', background: 'var(--erp-accent-soft, #eef2ff)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700,
                  fontSize: 18, color: 'var(--erp-accent, #2563eb)'
                }}>
                  {(person.full_name || 'B')[0]}
                </div>
                <div className="bdv-profile-info">
                  <div className="bdv-profile-name">{person.full_name || 'BDM'}</div>
                  <div className="bdv-profile-detail">{person.position || 'Business Development Manager'} | {person.territory || '-'}</div>
                </div>
                {person.bdm_stage && (
                  <span className="bdv-badge" style={{ background: '#dbeafe', color: '#1e40af' }}>
                    {person.bdm_stage}
                  </span>
                )}
              </div>

              {/* Target + Incentive Cards */}
              <div className="bdv-row">
                {/* Attainment Ring */}
                <div className="bdv-card">
                  <h4>Sales Attainment</h4>
                  <div className="bdv-ring-wrap">
                    <div className="bdv-ring">
                      <svg width="120" height="120" viewBox="0 0 120 120">
                        <circle cx="60" cy="60" r={ringRadius} fill="none" stroke="#f3f4f6" strokeWidth="10" />
                        <circle cx="60" cy="60" r={ringRadius} fill="none" stroke={ringColor} strokeWidth="10"
                          strokeDasharray={ringCircumference} strokeDashoffset={ringOffset}
                          strokeLinecap="round" />
                      </svg>
                      <div className="bdv-ring-label">
                        <div className="bdv-ring-pct" style={{ color: ringColor }}>{pct(attainPct)}</div>
                        <div className="bdv-ring-sub">Attainment</div>
                      </div>
                    </div>
                  </div>
                  <div className="bdv-stat"><span className="bdv-stat-label">Target</span><span className="bdv-stat-value">{php(target.sales_target)}</span></div>
                  <div className="bdv-stat"><span className="bdv-stat-label">Actual</span><span className="bdv-stat-value">{php(target.actual)}</span></div>
                  <div className="bdv-stat"><span className="bdv-stat-label">Remaining</span><span className="bdv-stat-value">{php(Math.max((target.sales_target || 0) - (target.actual || 0), 0))}</span></div>
                </div>

                {/* Incentive Tier */}
                <div className="bdv-card bdv-tier-card">
                  <h4>Incentive Tier</h4>
                  <div className="bdv-tier-badge" style={{ background: tc.bg, color: tc.color }}>
                    {incentive.tier_label || 'Participant'}
                  </div>
                  <div className="bdv-tier-detail">Budget Earned: {php(incentive.tier_budget)}</div>
                  {incentive.projected_tier_label && (
                    <div className="bdv-tier-detail">Projected: {incentive.projected_tier_label}</div>
                  )}
                  {incentive.amount_to_next_tier > 0 && (
                    <div className="bdv-next-tier">
                      {php(incentive.amount_to_next_tier)} more to reach {incentive.next_tier || 'next tier'}
                    </div>
                  )}
                </div>
              </div>

              {/* Monthly Trend */}
              {monthly.length > 0 && (
                <div className="bdv-panel">
                  <h3>Monthly Trend</h3>
                  <div style={{ display: 'flex', gap: 3, marginBottom: 8, fontSize: 11, color: 'var(--erp-muted)' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ width: 12, height: 8, background: '#3b82f6', borderRadius: 2, display: 'inline-block' }} /> Actual
                    </span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginLeft: 12 }}>
                      <span style={{ width: 12, height: 8, background: '#e5e7eb', borderRadius: 2, display: 'inline-block' }} /> Target
                    </span>
                  </div>
                  <div className="bdv-chart">
                    {monthly.map((m, i) => {
                      const aH = maxMonthly > 0 ? ((m.actual || 0) / maxMonthly) * 130 : 0;
                      const tH = maxMonthly > 0 ? ((m.target || 0) / maxMonthly) * 130 : 0;
                      return (
                        <div key={m.month || i} className="bdv-bar-group">
                          <div className="bdv-bar-container">
                            <div className="bdv-bar" style={{ height: tH, background: '#e5e7eb' }} title={`Target: ${php(m.target)}`} />
                            <div className="bdv-bar" style={{ height: aH, background: '#3b82f6' }} title={`Actual: ${php(m.actual)}`} />
                          </div>
                          <div className="bdv-bar-label">{MONTHS[m.month - 1] || m.month}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Driver KPIs */}
              {drivers.length > 0 && (
                <div className="bdv-panel">
                  <h3>Growth Driver KPIs</h3>
                  {drivers.map((d, di) => {
                    const isOpen = expandedDrivers[d.driver_code] !== false; // default open
                    return (
                      <div key={d.driver_code || di} className="bdv-driver-section">
                        <div className="bdv-driver-header" onClick={() => toggleDriver(d.driver_code)}>
                          <span className="bdv-driver-name">{d.driver_label || d.driver_code}</span>
                          <span style={{ fontSize: 12, color: 'var(--erp-muted)' }}>{isOpen ? '▼' : '▶'}</span>
                        </div>
                        {isOpen && (
                          <div className="bdv-driver-body">
                            {(d.kpis || []).length === 0 && (
                              <p style={{ color: 'var(--erp-muted)', fontSize: 12, margin: 0 }}>No KPIs defined for this driver.</p>
                            )}
                            {(d.kpis || []).map((kpi, ki) => {
                              const kpiPct = kpi.target_value ? ((kpi.actual_value || 0) / kpi.target_value) * 100 : 0;
                              return (
                                <div key={kpi.kpi_code || ki} className="bdv-kpi-row">
                                  <span className="bdv-kpi-name">{kpi.kpi_label || kpi.kpi_code}</span>
                                  <div className="bdv-kpi-track">
                                    <div className="bdv-kpi-fill" style={{
                                      width: `${Math.min(kpiPct, 100)}%`,
                                      background: attainColor(kpiPct, goalConfig)
                                    }} />
                                  </div>
                                  <span className="bdv-kpi-nums">
                                    {kpi.actual_value || 0} / {kpi.target_value || 0} {kpi.unit || ''}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Action Items */}
              <div className="bdv-panel">
                <h3>Action Items</h3>
                <div className="bdv-actions-list">
                  {actions.length === 0 && (
                    <p style={{ color: 'var(--erp-muted)', fontSize: 13, margin: 0 }}>No action items yet. Create one below.</p>
                  )}
                  {actions.map((a, i) => {
                    const as = actionStatusStyle(a.status);
                    return (
                      <div key={a._id || i} className="bdv-action-item">
                        <span className="bdv-action-status" style={{ background: as.bg, color: as.color }}>
                          {a.status || 'TODO'}
                        </span>
                        <span className="bdv-action-title">{a.title}</span>
                        <span className="bdv-action-meta">
                          {a.priority && <span style={{ marginRight: 8 }}>{a.priority}</span>}
                          {a.due_date && <span>{new Date(a.due_date).toLocaleDateString()}</span>}
                        </span>
                        {a.status !== 'DONE' && (
                          <button className="bdv-btn bdv-btn-success bdv-btn-sm" onClick={() => handleCompleteAction(a._id)}>
                            Done
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* New Action Form */}
                <div className="bdv-form-row">
                  <input
                    type="text" placeholder="Action title"
                    value={actionForm.title}
                    onChange={e => setActionForm(f => ({ ...f, title: e.target.value }))}
                    style={{ flex: 2 }}
                  />
                  <select
                    value={actionForm.driver_code}
                    onChange={e => setActionForm(f => ({ ...f, driver_code: e.target.value }))}
                    style={{ flex: 1 }}
                  >
                    <option value="">— Driver (optional) —</option>
                    {planDrivers.map(d => (
                      <option key={d.driver_code} value={d.driver_code}>
                        {d.driver_code}{d.driver_label ? ` — ${d.driver_label}` : ''}
                      </option>
                    ))}
                  </select>
                  <select value={actionForm.priority} onChange={e => setActionForm(f => ({ ...f, priority: e.target.value }))}>
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                  </select>
                  <input
                    type="date"
                    value={actionForm.due_date}
                    onChange={e => setActionForm(f => ({ ...f, due_date: e.target.value }))}
                  />
                  <button className="bdv-btn bdv-btn-primary" onClick={handleCreateAction} disabled={savingAction || !actionForm.title.trim()}>
                    {savingAction ? 'Adding...' : 'Add Action'}
                  </button>
                </div>
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
