/**
 * SalesGoalBdmView — Phase 28 Individual BDM detail page.
 * Shows attainment ring, incentive tier, monthly trend, driver KPIs, and action items.
 */
import { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
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
  /* Phase SG-Q2 W3 — Tab strip + compensation summary cards */
  .bdv-tabs { display: flex; gap: 4px; margin-bottom: 16px; border-bottom: 2px solid var(--erp-border); }
  .bdv-tab { padding: 10px 18px; background: transparent; border: none; border-bottom: 3px solid transparent; margin-bottom: -2px; font-size: 13px; font-weight: 600; color: var(--erp-muted); cursor: pointer; transition: color 0.15s, border-color 0.15s; }
  .bdv-tab:hover { color: var(--erp-text); }
  .bdv-tab.active { color: var(--erp-accent, #2563eb); border-bottom-color: var(--erp-accent, #2563eb); }
  .bdv-summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 16px; }
  .bdv-summary-card { background: var(--erp-panel, #fff); border: 1px solid var(--erp-border); border-radius: 12px; padding: 14px 16px; }
  .bdv-summary-card.earned { border-left: 3px solid #1f2937; }
  .bdv-summary-card.accrued { border-left: 3px solid #2563eb; background: #eff6ff; }
  .bdv-summary-card.paid { border-left: 3px solid #16a34a; background: #f0fdf4; }
  .bdv-summary-card.adjusted { border-left: 3px solid #dc2626; background: #fef2f2; }
  .bdv-summary-label { font-size: 10px; font-weight: 600; text-transform: uppercase; color: var(--erp-muted); letter-spacing: 0.05em; }
  .bdv-summary-value { font-size: 20px; font-weight: 700; color: var(--erp-text); margin-top: 4px; font-variant-numeric: tabular-nums; }
  .bdv-comp-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .bdv-comp-table th { padding: 8px; text-align: left; background: var(--erp-accent-soft, #eef2ff); font-weight: 600; color: var(--erp-text); font-size: 12px; }
  .bdv-comp-table td { padding: 8px; border-top: 1px solid var(--erp-border); color: var(--erp-text); }
  .bdv-comp-table .num { text-align: right; font-variant-numeric: tabular-nums; }
  .bdv-print-btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 16px; background: var(--erp-accent, #2563eb); color: #fff; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; }
  .bdv-print-btn:hover { background: #1d4ed8; }
  .bdv-comp-toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 10px; }
  .bdv-comp-empty { padding: 28px; text-align: center; color: var(--erp-muted); font-size: 13px; }
  @media(max-width: 768px) { .bdv-main { padding: 12px; } .bdv-row { flex-direction: column; } .bdv-summary-grid { grid-template-columns: repeat(2, 1fr); } .bdv-tab { padding: 8px 12px; font-size: 12px; } }
  @media(max-width: 360px) {
    .bdv-main { padding: 8px; }
    .bdv-header h1 { font-size: 18px; }
    .bdv-profile { padding: 12px; gap: 10px; }
    .bdv-card, .bdv-panel { padding: 14px; min-width: 0; }
    .bdv-ring { width: 96px; height: 96px; }
    .bdv-ring svg { width: 96px; height: 96px; }
    .bdv-ring-pct { font-size: 20px; }
    .bdv-summary-grid { grid-template-columns: 1fr; gap: 8px; }
    .bdv-summary-value { font-size: 18px; }
    .bdv-tabs { overflow-x: auto; flex-wrap: nowrap; -webkit-overflow-scrolling: touch; }
    .bdv-tab { white-space: nowrap; padding: 8px 10px; font-size: 11px; flex-shrink: 0; }
    .bdv-form-row { flex-direction: column; }
    .bdv-form-row input, .bdv-form-row select, .bdv-btn { width: 100%; }
    .bdv-comp-table th, .bdv-comp-table td { padding: 6px 4px; font-size: 11px; }
    .bdv-comp-toolbar { flex-direction: column; align-items: stretch; }
    .bdv-print-btn { width: 100%; justify-content: center; }
  }
`;

// Lookup-driven STATUS_PALETTE — codes match the buckets emitted by
// salesGoalController (ON_TRACK / NEEDS_ATTENTION / AT_RISK). Subscribers
// re-brand bar/badge colors per entity from Control Center → Lookup Tables.
const NEUTRAL_PALETTE = { bar: '#9ca3af', bg: '#f3f4f6', text: '#374151', label: '' };

function statusBucket(attPct, config) {
  if (attPct >= (config?.attainment_green ?? 90)) return 'ON_TRACK';
  if (attPct >= (config?.attainment_yellow ?? 70)) return 'NEEDS_ATTENTION';
  return 'AT_RISK';
}

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

function paletteFor(code, paletteMap) {
  const key = String(code || '').toUpperCase();
  return paletteMap[key] || { ...NEUTRAL_PALETTE, label: key || NEUTRAL_PALETTE.label };
}

function attainColor(pctVal, config, paletteMap) {
  return paletteFor(statusBucket(pctVal, config), paletteMap).bar;
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
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const sg = useSalesGoals();

  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState(null);
  const [expandedDrivers, setExpandedDrivers] = useState({});
  const [actionForm, setActionForm] = useState({ title: '', driver_code: '', priority: 'MEDIUM', due_date: '' });
  const [savingAction, setSavingAction] = useState(false);
  // Phase SG-Q2 W2 — My Payouts section
  const [payouts, setPayouts] = useState([]);
  // Phase SG-Q2 W3 — Compensation tab + statement. `?tab=compensation` query
  // param lets the sidebar "My Compensation" entry land on the right tab.
  const initialTab = searchParams.get('tab') === 'compensation' ? 'compensation' : 'performance';
  const [activeTab, setActiveTab] = useState(initialTab); // 'performance' | 'compensation'
  const [statement, setStatement] = useState(null);
  const [statementLoading, setStatementLoading] = useState(false);
  const fiscalYear = new Date().getFullYear();

  const effectiveId = bdmId || user?._id || user?.id;
  const isSelfView = !bdmId || String(bdmId) === String(user?._id || user?.id);

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

  // Phase SG-Q2 W2 — pull payouts for the effective BDM (self-view uses /mine,
  // admin viewing another BDM uses the filtered ledger endpoint).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!effectiveId) return;
      try {
        const res = isSelfView
          ? await sg.getMyPayouts({})
          : await sg.getPayouts({ bdm_id: effectiveId });
        if (cancelled) return;
        // useErpApi unwraps to HTTP body → res is { success, data: [...] }
        const data = res?.data || [];
        setPayouts(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelled) setPayouts([]);
      }
    })();
    return () => { cancelled = true; };
  }, [effectiveId, isSelfView]); // eslint-disable-line react-hooks/exhaustive-deps

  // Phase SG-Q2 W3 — Compensation Statement (lazy: only loaded when the tab opens
  // for the first time, and refreshed if the BDM changes). Self-view passes no
  // bdm_id (backend uses req.user._id); admin views pass the explicit one.
  useEffect(() => {
    if (activeTab !== 'compensation') return;
    let cancelled = false;
    (async () => {
      if (!effectiveId) return;
      setStatementLoading(true);
      try {
        const params = { fiscal_year: fiscalYear };
        if (!isSelfView) params.bdm_id = effectiveId;
        const res = await sg.getCompensationStatement(params);
        if (!cancelled) setStatement(res?.data || null);
      } catch (err) {
        if (!cancelled) {
          showError(err, 'Failed to load compensation statement');
          setStatement(null);
        }
      } finally {
        if (!cancelled) setStatementLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [activeTab, effectiveId, isSelfView, fiscalYear]); // eslint-disable-line react-hooks/exhaustive-deps

  // Print handler — opens the printable HTML in a new tab; user clicks "Print /
  // Save as PDF" to produce the PDF (uses the same browser-print pattern as
  // sales receipts). Cookie-based auth carries over to the new window.
  const handlePrintStatement = useCallback(() => {
    const params = { fiscal_year: fiscalYear };
    if (!isSelfView) params.bdm_id = effectiveId;
    const url = sg.compensationStatementPrintUrl(params);
    window.open(url, '_blank', 'noopener,noreferrer');
  }, [effectiveId, isSelfView, fiscalYear]); // eslint-disable-line react-hooks/exhaustive-deps

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
  const paletteMap = buildPaletteMap(detail?.palette);

  const attainPct = ytdSnap.sales_attainment_pct || 0;
  const ringColor = attainColor(attainPct, goalConfig, paletteMap);
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
              {/* Phase SG-Q2 W3 — Tab strip (Performance | My Compensation) */}
              <div className="bdv-tabs" role="tablist">
                <button
                  type="button"
                  role="tab"
                  className={`bdv-tab ${activeTab === 'performance' ? 'active' : ''}`}
                  aria-selected={activeTab === 'performance'}
                  onClick={() => setActiveTab('performance')}
                >
                  Performance
                </button>
                <button
                  type="button"
                  role="tab"
                  className={`bdv-tab ${activeTab === 'compensation' ? 'active' : ''}`}
                  aria-selected={activeTab === 'compensation'}
                  onClick={() => setActiveTab('compensation')}
                >
                  My Compensation
                </button>
              </div>
            </>
          )}

          {!loading && detail && activeTab === 'performance' && (
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
                                      background: attainColor(kpiPct, goalConfig, paletteMap)
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

              {/* Phase SG-Q2 W2 — My Payouts */}
              <div className="bdv-panel">
                <h3>My Incentive Payouts</h3>
                {payouts.length === 0 ? (
                  <p style={{ color: 'var(--erp-muted)', fontSize: 13, margin: 0 }}>
                    No payouts yet. Hit a tier threshold on your YTD attainment and a payout will be accrued automatically.{' '}
                    <Link to="/erp/incentive-payouts" style={{ color: 'var(--erp-accent, #2563eb)' }}>Open Payout Ledger →</Link>
                  </p>
                ) : (
                  <>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr>
                          <th style={{ textAlign: 'left', padding: '6px 8px', background: 'var(--erp-accent-soft, #eef2ff)' }}>Period</th>
                          <th style={{ textAlign: 'left', padding: '6px 8px', background: 'var(--erp-accent-soft, #eef2ff)' }}>Tier</th>
                          <th style={{ textAlign: 'right', padding: '6px 8px', background: 'var(--erp-accent-soft, #eef2ff)' }}>Amount</th>
                          <th style={{ textAlign: 'left', padding: '6px 8px', background: 'var(--erp-accent-soft, #eef2ff)' }}>Status</th>
                          <th style={{ textAlign: 'left', padding: '6px 8px', background: 'var(--erp-accent-soft, #eef2ff)' }}>Paid</th>
                        </tr>
                      </thead>
                      <tbody>
                        {payouts.map(p => (
                          <tr key={p._id} style={{ borderTop: '1px solid var(--erp-border)' }}>
                            <td style={{ padding: '6px 8px' }}>{p.period}</td>
                            <td style={{ padding: '6px 8px' }}>{p.tier_label || p.tier_code}</td>
                            <td style={{ padding: '6px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{php(p.tier_budget)}</td>
                            <td style={{ padding: '6px 8px' }}>{p.status}</td>
                            <td style={{ padding: '6px 8px' }}>{p.paid_at ? new Date(p.paid_at).toLocaleDateString() : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div style={{ marginTop: 8 }}>
                      <Link to="/erp/incentive-payouts" style={{ color: 'var(--erp-accent, #2563eb)', fontSize: 12 }}>See full ledger →</Link>
                    </div>
                  </>
                )}
              </div>

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

          {/* Phase SG-Q2 W3 — My Compensation tab */}
          {!loading && detail && activeTab === 'compensation' && (
            <>
              <WorkflowGuide pageKey="salesGoalCompensation" />

              <div className="bdv-comp-toolbar">
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, color: 'var(--erp-text)' }}>
                    Fiscal Year {fiscalYear} Compensation Statement
                  </h3>
                  <p style={{ margin: '2px 0 0', color: 'var(--erp-muted)', fontSize: 12 }}>
                    Live read of your incentive ledger. Print to PDF for your records.
                  </p>
                </div>
                <button
                  type="button"
                  className="bdv-print-btn"
                  onClick={handlePrintStatement}
                  disabled={!effectiveId}
                  title="Open the printable statement — use the browser Print menu to save as PDF"
                >
                  <span aria-hidden="true">🖨</span> Print / Save as PDF
                </button>
              </div>

              {statementLoading && <div className="loading">Loading statement…</div>}

              {!statementLoading && statement && (
                <>
                  <div className="bdv-summary-grid">
                    <div className="bdv-summary-card earned">
                      <div className="bdv-summary-label">Earned</div>
                      <div className="bdv-summary-value">{php(statement.summary?.earned)}</div>
                    </div>
                    <div className="bdv-summary-card accrued">
                      <div className="bdv-summary-label">Accrued (pending)</div>
                      <div className="bdv-summary-value">{php(statement.summary?.accrued)}</div>
                    </div>
                    <div className="bdv-summary-card paid">
                      <div className="bdv-summary-label">Paid</div>
                      <div className="bdv-summary-value">{php(statement.summary?.paid)}</div>
                    </div>
                    <div className="bdv-summary-card adjusted">
                      <div className="bdv-summary-label">Adjustments</div>
                      <div className="bdv-summary-value">{php(statement.summary?.adjusted)}</div>
                    </div>
                  </div>

                  {statement.tier && (
                    <div className="bdv-row">
                      <div className="bdv-card">
                        <h4>YTD Attainment</h4>
                        <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--erp-text)' }}>
                          {pct(statement.tier.sales_attainment_pct)}
                        </div>
                        <div style={{ color: 'var(--erp-muted)', fontSize: 12, marginTop: 4 }}>
                          {php(statement.tier.sales_actual)} of {php(statement.tier.sales_target)}
                        </div>
                      </div>
                      <div className="bdv-card">
                        <h4>Current Tier</h4>
                        <div style={{ fontSize: 18, fontWeight: 700 }}>
                          {statement.tier.current_tier_label || statement.tier.current_tier_code || 'Participant'}
                        </div>
                        <div style={{ color: 'var(--erp-muted)', fontSize: 12, marginTop: 4 }}>
                          Budget: {php(statement.tier.current_tier_budget)}
                        </div>
                      </div>
                      <div className="bdv-card">
                        <h4>Projected Tier (FY-end)</h4>
                        <div style={{ fontSize: 18, fontWeight: 700 }}>
                          {statement.tier.projected_tier_label || statement.tier.projected_tier_code || '—'}
                        </div>
                        <div style={{ color: 'var(--erp-muted)', fontSize: 12, marginTop: 4 }}>
                          Projected: {php(statement.tier.projected_tier_budget)}
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="bdv-panel">
                    <h3>By Period</h3>
                    {(statement.periods || []).length === 0 ? (
                      <div className="bdv-comp-empty">No qualifying periods in FY {fiscalYear}.</div>
                    ) : (
                      <table className="bdv-comp-table">
                        <thead>
                          <tr>
                            <th>Period</th>
                            <th>Type</th>
                            <th className="num">Earned</th>
                            <th className="num">Accrued</th>
                            <th className="num">Paid</th>
                            <th className="num">Adjusted</th>
                          </tr>
                        </thead>
                        <tbody>
                          {statement.periods.map(p => (
                            <tr key={`${p.period}-${p.period_type}`}>
                              <td>{p.period}</td>
                              <td style={{ color: 'var(--erp-muted)', fontSize: 11 }}>{p.period_type || ''}</td>
                              <td className="num">{php(p.earned)}</td>
                              <td className="num" style={{ color: '#1e40af' }}>{php(p.accrued)}</td>
                              <td className="num" style={{ color: '#166534' }}>{php(p.paid)}</td>
                              <td className="num" style={{ color: '#991b1b' }}>{php(p.adjusted)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>

                  <div className="bdv-panel">
                    <h3>Detail Ledger</h3>
                    {(statement.rows || []).length === 0 ? (
                      <div className="bdv-comp-empty">
                        No incentive ledger entries for FY {fiscalYear} yet. Hit a tier threshold and a payout will accrue automatically.
                      </div>
                    ) : (
                      <table className="bdv-comp-table">
                        <thead>
                          <tr>
                            <th>Period</th>
                            <th>Tier</th>
                            <th className="num">Amount</th>
                            <th className="num">Attain%</th>
                            <th>Status</th>
                            <th>Accrual JE</th>
                          </tr>
                        </thead>
                        <tbody>
                          {statement.rows.map(r => (
                            <tr key={r._id}>
                              <td>{r.period}</td>
                              <td>
                                {r.tier_label || r.tier_code}
                                {Number(r.uncapped_budget) > Number(r.tier_budget) ? (
                                  <span title={`Uncapped: ${php(r.uncapped_budget)} — reduced by CompProfile cap`} style={{ color: 'var(--erp-muted)', fontSize: 10, marginLeft: 4 }}>⚠ capped</span>
                                ) : null}
                              </td>
                              <td className="num">{php(r.tier_budget)}</td>
                              <td className="num">{(Number(r.attainment_pct) || 0).toFixed(1)}%</td>
                              <td>{r.status}</td>
                              <td style={{ fontSize: 11 }}>
                                {r.journal_id?.je_number || r.journal_number || '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </>
              )}

              {!statementLoading && !statement && (
                <div className="bdv-panel">
                  <p style={{ color: 'var(--erp-muted)', fontSize: 13, margin: 0 }}>
                    No statement data available. The plan may not be active for FY {fiscalYear}, or no payouts have accrued yet.
                  </p>
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
