/**
 * AgentDashboard — Phase 24 (Agent Intelligence)
 *
 * Admin/president view of all AI agent activity.
 * Shows: agent status cards, recent runs, latest agent messages.
 */
import { useState, useEffect, useCallback } from 'react';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import { useAuth } from '../../hooks/useAuth';
import { ROLES } from '../../constants/roles';
import api from '../../services/api';
import messageService from '../../services/messageInboxService';
import { Bot, CheckCircle, AlertTriangle, XCircle, Clock, TrendingUp, Calendar, ShieldAlert, DollarSign, FileSearch, Package, CreditCard, FileWarning, Camera, MapPin, Zap, Wallet, LineChart, ShoppingBag, CalendarClock, Users, Database, PackageCheck, Rocket, Target, TrendingDown, BarChart3, Mail, X, ExternalLink } from 'lucide-react';
import WorkflowGuide from '../components/WorkflowGuide';
import { showError, showSuccess } from '../utils/errorToast';
import Pagination from '../../components/common/Pagination';
import { useLookupOptions } from '../hooks/useLookups';

const pageStyles = `
  .agd-page { background: var(--erp-bg, #f4f7fb); min-height: 100vh; }
  .agd-main { flex: 1; min-width: 0; overflow-y: auto; padding: 24px; max-width: 1300px; margin: 0 auto; }
  .agd-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; flex-wrap: wrap; gap: 12px; }
  .agd-header h1 { font-size: 24px; font-weight: 700; color: var(--erp-text, #132238); margin: 0; display: flex; align-items: center; gap: 10px; }
  .agd-header h1 svg { color: var(--erp-accent, #1e5eff); }

  .agd-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 16px; margin-bottom: 24px; }
  .agd-card { background: var(--erp-panel, #fff); border: 1px solid var(--erp-border, #dbe4f0); border-radius: 14px; padding: 20px; position: relative; overflow: hidden; }
  .agd-card-accent { position: absolute; top: 0; left: 0; right: 0; height: 3px; }
  .agd-card-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; }
  .agd-card h3 { font-size: 14px; font-weight: 700; color: var(--erp-text); margin: 0; display: flex; align-items: center; gap: 6px; }
  .agd-card h3 svg { width: 16px; height: 16px; }
  .agd-card-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .agd-stat { }
  .agd-stat-value { font-size: 20px; font-weight: 800; color: var(--erp-accent); }
  .agd-stat-label { font-size: 11px; color: var(--erp-muted, #64748b); }

  .agd-badge { display: inline-flex; align-items: center; gap: 4px; padding: 3px 10px; border-radius: 6px; font-size: 11px; font-weight: 600; }
  .agd-badge-success { background: #dcfce7; color: #166534; }
  .agd-badge-error { background: #fee2e2; color: #991b1b; }
  .agd-badge-partial { background: #fef3c7; color: #92400e; }
  .agd-badge svg { width: 12px; height: 12px; }

  .agd-section { background: var(--erp-panel, #fff); border: 1px solid var(--erp-border); border-radius: 14px; padding: 20px; margin-bottom: 20px; }
  .agd-section h2 { font-size: 16px; font-weight: 700; margin: 0 0 14px; color: var(--erp-text); }

  .agd-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .agd-table th { text-align: left; padding: 8px 12px; background: var(--erp-accent-soft, #e8efff); font-weight: 600; font-size: 11px; text-transform: uppercase; color: var(--erp-muted); }
  .agd-table td { padding: 8px 12px; border-top: 1px solid var(--erp-border); }
  .agd-table tr:hover { background: var(--erp-accent-soft); }

  .agd-findings { display: flex; flex-direction: column; gap: 2px; font-size: 12px; color: var(--erp-muted); }
  .agd-finding { display: flex; align-items: center; gap: 4px; }
  .agd-finding::before { content: '•'; color: var(--erp-accent); font-weight: 700; }

  .agd-msg-feed { display: flex; flex-direction: column; gap: 10px; }
  .agd-msg { padding: 12px 16px; background: var(--erp-bg); border-radius: 10px; border-left: 3px solid var(--erp-accent); cursor: pointer; transition: background 0.12s, transform 0.12s; position: relative; }
  .agd-msg:hover { background: var(--erp-accent-soft, #e8efff); transform: translateX(2px); }
  .agd-msg-unread { font-weight: 700; }
  .agd-msg-unread::after { content: ''; position: absolute; top: 14px; right: 14px; width: 8px; height: 8px; border-radius: 50%; background: var(--erp-accent, #1e5eff); }
  .agd-msg-title { font-size: 13px; font-weight: 600; color: var(--erp-text); margin-bottom: 4px; padding-right: 18px; }
  .agd-msg-body { font-size: 12px; color: var(--erp-muted); line-height: 1.5; max-height: 80px; overflow: hidden; }
  .agd-msg-meta { font-size: 11px; color: #94a3b8; margin-top: 6px; }
  .agd-msg-cat { display: inline-block; padding: 1px 6px; border-radius: 4px; font-size: 10px; font-weight: 600; margin-right: 6px; }

  .agd-helper-note { font-size: 12px; color: var(--erp-muted); margin: -6px 0 12px; padding: 8px 12px; background: var(--erp-accent-soft, #e8efff); border-radius: 6px; border-left: 3px solid var(--erp-accent, #1e5eff); }
  .agd-helper-note a { color: var(--erp-accent); text-decoration: underline; }

  .agd-modal-overlay { position: fixed; inset: 0; background: rgba(15, 23, 42, 0.55); display: flex; align-items: flex-start; justify-content: center; z-index: 100; padding: 40px 16px; overflow-y: auto; }
  .agd-modal { background: #fff; border-radius: 14px; max-width: 640px; width: 100%; box-shadow: 0 20px 50px rgba(0, 0, 0, 0.25); display: flex; flex-direction: column; max-height: calc(100vh - 80px); }
  .agd-modal-header { padding: 18px 22px 14px; border-bottom: 1px solid var(--erp-border); display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
  .agd-modal-header h3 { margin: 0; font-size: 16px; font-weight: 700; color: var(--erp-text); line-height: 1.4; }
  .agd-modal-close { background: transparent; border: none; cursor: pointer; padding: 4px; border-radius: 6px; color: var(--erp-muted); flex-shrink: 0; }
  .agd-modal-close:hover { background: var(--erp-bg); color: var(--erp-text); }
  .agd-modal-meta { display: flex; flex-wrap: wrap; gap: 8px; padding: 10px 22px; border-bottom: 1px solid var(--erp-border); background: var(--erp-bg); font-size: 12px; color: var(--erp-muted); }
  .agd-modal-meta strong { color: var(--erp-text); font-weight: 600; }
  .agd-modal-body { padding: 18px 22px; overflow-y: auto; font-size: 13px; line-height: 1.6; color: var(--erp-text); white-space: pre-wrap; word-break: break-word; }
  .agd-modal-footer { padding: 12px 22px; border-top: 1px solid var(--erp-border); display: flex; justify-content: flex-end; gap: 8px; }
  .agd-modal-footer .agd-link-btn { display: inline-flex; align-items: center; gap: 6px; padding: 7px 14px; border-radius: 6px; border: 1px solid var(--erp-border); background: #fff; color: var(--erp-accent); font-size: 12px; font-weight: 600; text-decoration: none; cursor: pointer; }
  .agd-modal-footer .agd-link-btn:hover { background: var(--erp-accent-soft); }

  .agd-empty { text-align: center; padding: 40px; color: var(--erp-muted); font-size: 13px; }
  .agd-loading { text-align: center; padding: 40px; color: var(--erp-muted); }

  .agd-filters { display: flex; gap: 8px; flex-wrap: wrap; align-items: flex-end; margin-bottom: 12px; padding: 12px; background: var(--erp-bg, #f4f7fb); border-radius: 8px; border: 1px solid var(--erp-border, #dbe4f0); }
  .agd-filter { display: flex; flex-direction: column; gap: 4px; }
  .agd-filter label { font-size: 10px; font-weight: 600; color: var(--erp-muted); text-transform: uppercase; }
  .agd-filter select, .agd-filter input { padding: 5px 8px; border: 1px solid var(--erp-border); border-radius: 6px; font-size: 12px; background: #fff; min-width: 140px; }
  .agd-filter-btn { padding: 6px 12px; border: 1px solid var(--erp-border); border-radius: 6px; font-size: 12px; font-weight: 600; background: #fff; color: var(--erp-muted); cursor: pointer; }
  .agd-filter-btn:hover { background: var(--erp-accent-soft, #e8efff); color: var(--erp-accent); }

  @media(max-width: 768px) { .agd-main { padding: 16px; } .agd-cards { grid-template-columns: 1fr; } .agd-filter select, .agd-filter input { min-width: 110px; } }
`;

// ─────────────────────────────────────────────────────────────────────
// Phase G8 — AGENT_CONFIG is now display metadata ONLY.
//
// The list of agents rendered on this page comes from the backend registry
// via GET /erp/agents/registry (which reads agentRegistry.AGENT_DEFINITIONS).
// This map provides icon/color/schedule-copy per known key. Keys not in this
// map fall back to DEFAULT_META so a newly-registered agent auto-surfaces
// without a frontend code change (Rule #3 — no hardcoded list of agents).
// ─────────────────────────────────────────────────────────────────────
const AGENT_META = {
  // Claude AI agents (paid)
  smart_collection:   { icon: DollarSign,  color: '#2563eb', schedule: 'Weekdays 7:00 AM' },
  performance_coach:  { icon: TrendingUp,  color: '#6366f1', schedule: 'Mon 6:00 AM' },
  bir_filing:         { icon: FileSearch,  color: '#0891b2', schedule: '15th monthly 9 AM' },
  visit_planner:      { icon: Calendar,    color: '#10b981', schedule: 'Sun 6:00 PM' },
  engagement_decay:   { icon: ShieldAlert, color: '#ef4444', schedule: 'Mon 7:00 AM' },
  org_intelligence:   { icon: TrendingUp,  color: '#0d9488', schedule: 'Mon 5:30 AM' },
  daily_briefing:     { icon: Zap,         color: '#6366f1', schedule: 'Weekdays 7:00 AM' },
  // Rule-based FREE agents
  expense_anomaly:    { icon: FileWarning, color: '#f59e0b', schedule: 'Daily 6:00 AM' },
  inventory_reorder:  { icon: Package,     color: '#8b5cf6', schedule: 'Daily 6:30 AM' },
  credit_risk:        { icon: CreditCard,  color: '#ec4899', schedule: 'Sun 11:00 PM' },
  document_expiry:    { icon: Clock,       color: '#64748b', schedule: 'Daily 7:30 AM' },
  visit_compliance:   { icon: MapPin,      color: '#14b8a6', schedule: 'Wed + Fri' },
  photo_audit:        { icon: Camera,      color: '#a855f7', schedule: 'Daily 8:30 AM' },
  system_integrity:   { icon: ShieldAlert, color: '#0f766e', schedule: 'Mon 5:00 AM' },
  // Sales Goal (Phase SG-Q2 W2/W3, SG-4, SG-5)
  kpi_snapshot:       { icon: Target,        color: '#0ea5e9', schedule: 'Monthly day 1 5 AM' },
  kpi_variance:       { icon: TrendingDown,  color: '#f43f5e', schedule: 'Monthly day 2 6 AM' },
  kpi_variance_digest:{ icon: BarChart3,     color: '#f97316', schedule: 'Mon 7:00 AM' },
  dispute_sla:        { icon: AlertTriangle, color: '#b91c1c', schedule: 'Daily 6:30 AM' },
  // Phase G8 — 8 new rule-based agents
  treasury:              { icon: Wallet,        color: '#0369a1', schedule: 'Weekdays 5:30 AM' },
  fpa_forecast:          { icon: LineChart,     color: '#6d28d9', schedule: 'Mon 6:00 AM' },
  procurement_scorecard: { icon: ShoppingBag,   color: '#9333ea', schedule: 'Tue 7:00 AM' },
  compliance_calendar:   { icon: CalendarClock, color: '#0d9488', schedule: 'Mon 5:00 AM' },
  internal_audit_sod:    { icon: Users,         color: '#be123c', schedule: 'Wed 8:00 AM' },
  data_quality:          { icon: Database,      color: '#0284c7', schedule: 'Daily 9:00 AM' },
  fefo_audit:            { icon: PackageCheck,  color: '#dc2626', schedule: 'Daily 7:30 AM' },
  expansion_readiness:   { icon: Rocket,        color: '#7c3aed', schedule: '1st of month 10 AM' },
  // Phase G9.R1
  task_overdue:          { icon: Clock,         color: '#ea580c', schedule: 'Weekdays 6:15 AM' },
  // Phase P1 — Proxy SLA Escalator (#PX)
  proxy_sla:             { icon: Clock,         color: '#f59e0b', schedule: 'Every 4 hours' },
  // Phase G9.R8 — Inbox Retention (#MR)
  message_retention:     { icon: Mail,          color: '#475569', schedule: 'Daily 2:00 AM' },
  // Day-4.5 #3 — Orphan Owner Audit
  orphan_audit:          { icon: ShieldAlert,   color: '#9f1239', schedule: 'Mon 5:15 AM' },
  // VIP-1.B follow-up — Orphan Ledger Audit
  orphan_ledger_audit:   { icon: ShieldAlert,   color: '#7f1d1d', schedule: 'Daily 3:00 AM' },
  // Apr 2026 follow-up — Accounting Integrity (TB / sub-ledger / IC / period-close)
  accounting_integrity:  { icon: ShieldAlert,   color: '#1e3a8a', schedule: 'Daily 4:00 AM' },
};
const DEFAULT_META = { icon: Bot, color: '#64748b', schedule: 'Scheduled' };

// Humanise backend AGENT_KEYS that have no pretty label.
// Registry already provides `label` — this is just a fallback.
function prettifyKey(k) {
  return String(k).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// Phase G9.R10 — category display metadata is lookup-driven via the
// AGENT_MESSAGE_CATEGORIES Lookup category (Rule #3 — subscription-ready).
// CAT_FALLBACK is the static safety net so a Lookup outage never leaves the
// page with unlabelled / uncolored category pills. Codes match the
// MessageInbox.category enum exactly.
const CAT_FALLBACK = {
  ai_coaching: { label: 'Coaching', bg: '#dbeafe', fg: '#1e40af', leftBorder: '#6366f1' },
  ai_schedule: { label: 'Schedule', bg: '#dcfce7', fg: '#166534', leftBorder: '#10b981' },
  ai_alert:    { label: 'Alert',    bg: '#fee2e2', fg: '#991b1b', leftBorder: '#ef4444' },
};
const ALL_AGENT_CATEGORIES = Object.keys(CAT_FALLBACK).join(',');

function getCatMeta(code, lookupOptions) {
  const fromLookup = lookupOptions?.find((o) => o.code === code);
  if (fromLookup) {
    const m = fromLookup.metadata || {};
    return {
      label: fromLookup.label || CAT_FALLBACK[code]?.label || code,
      bg: m.bg || CAT_FALLBACK[code]?.bg || '#f1f5f9',
      fg: m.fg || CAT_FALLBACK[code]?.fg || '#475569',
      leftBorder: m.fg || CAT_FALLBACK[code]?.leftBorder || '#94a3b8',
    };
  }
  return CAT_FALLBACK[code] || { label: code, bg: '#f1f5f9', fg: '#475569', leftBorder: '#94a3b8' };
}

 
function StatusBadge({ status }) {
  const cfg = { success: { icon: CheckCircle, css: 'success' }, error: { icon: XCircle, css: 'error' }, partial: { icon: AlertTriangle, css: 'partial' } };
  const c = cfg[status] || cfg.success;
  const Icon = c.icon;
  return <span className={`agd-badge agd-badge-${c.css}`}><Icon />{status}</span>;
}
 

function fmtDate(d) { return d ? new Date(d).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'; }

const RUNS_PER_PAGE = 20;
const EMPTY_FILTERS = { agent_key: '', status: '', from: '', to: '' };

// Phase G9.R10 — message-feed pagination + filters, parallel to runs.
const MSGS_PER_PAGE = 15;
const EMPTY_MSG_FILTERS = { category: '', from: '', to: '' };

export default function AgentDashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [runs, setRuns] = useState([]);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [runningAgent, setRunningAgent] = useState(null);
  // Phase G8 — agent list sourced from backend registry (no hardcoded list).
  // Each entry: { key, label, type: 'AI'|'FREE' }. UI metadata joined from
  // AGENT_META keyed by `key`, with DEFAULT_META fallback so unknown keys
  // still render (new agents auto-appear on the dashboard).
  const [registry, setRegistry] = useState([]);

  const [runFilters, setRunFilters] = useState(EMPTY_FILTERS);
  const [runPage, setRunPage] = useState(1);
  const [runTotal, setRunTotal] = useState(0);
  const [runsLoading, setRunsLoading] = useState(false);

  // Phase G9.R10 — messages section now mirrors runs: server-side filter +
  // pagination + click-to-view modal. msgTab is replaced by msgFilters.category
  // (server-side filter) so the source of truth is one query string.
  const [msgFilters, setMsgFilters] = useState(EMPTY_MSG_FILTERS);
  const [msgPage, setMsgPage] = useState(1);
  const [msgTotal, setMsgTotal] = useState(0);
  const [msgLoading, setMsgLoading] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState(null);

  // Lookup-driven category metadata (Rule #3). Falls back to CAT_FALLBACK
  // when the category is empty (Lookup outage / fresh tenant).
  const { options: catLookupOptions } = useLookupOptions('AGENT_MESSAGE_CATEGORIES');

  const isPresidentOrAdmin = [ROLES.PRESIDENT, ROLES.ADMIN].includes(user?.role);

  const loadRuns = useCallback(async (page, filters) => {
    setRunsLoading(true);
    try {
      const params = { page, limit: RUNS_PER_PAGE };
      if (filters.agent_key) params.agent_key = filters.agent_key;
      if (filters.status) params.status = filters.status;
      if (filters.from) params.from = filters.from;
      if (filters.to) params.to = filters.to;
      const res = await api.get('/erp/agents/runs', { params });
      setRuns(res.data?.data || []);
      setRunTotal(res.data?.pagination?.total || 0);
    } catch (err) {
      console.error('[AgentDashboard.loadRuns]', err.message);
      setRuns([]);
      setRunTotal(0);
    }
    setRunsLoading(false);
  }, []);

  // Phase G9.R10 — agent messages loader. Mirrors loadRuns but hits
  // /api/messages with the agent-category multi-filter as the constant base.
  // The user-controlled filters (category single-select, date range) layer on
  // top. If category single-select is empty we fall back to the full set so
  // "All" shows ai_coaching + ai_schedule + ai_alert.
  const loadMessages = useCallback(async (page, filters) => {
    setMsgLoading(true);
    try {
      const params = {
        page,
        limit: MSGS_PER_PAGE,
        category: filters.category || ALL_AGENT_CATEGORIES,
      };
      if (filters.from) params.from = filters.from;
      if (filters.to) params.to = filters.to;
      const res = await messageService.getAll(params);
      setMessages(res?.data || []);
      setMsgTotal(res?.pagination?.total || 0);
    } catch (err) {
      console.error('[AgentDashboard.loadMessages]', err.message);
      setMessages([]);
      setMsgTotal(0);
    }
    setMsgLoading(false);
  }, []);

  const handleRunNow = async (agentKey) => {
    if (runningAgent) return;
    setRunningAgent(agentKey);
    try {
      const res = await api.post(`/erp/agents/run/${agentKey}`);
      showSuccess(res.data?.message || `Agent "${agentKey}" completed`);
      load(); // refresh stats
      loadRuns(runPage, runFilters);
    } catch (err) {
      showError(err, `Agent "${agentKey}" failed`);
    }
    setRunningAgent(null);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [statsRes, regRes] = await Promise.all([
        api.get('/erp/agents/runs/stats'),
        api.get('/erp/agents/registry'),
      ]);
      setStats(statsRes.data?.data || null);
      setRegistry(Array.isArray(regRes.data?.data) ? regRes.data.data : []);
    } catch (err) {
      console.error('[AgentDashboard]', err.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadRuns(runPage, runFilters); }, [loadRuns, runPage, runFilters]);
  useEffect(() => { loadMessages(msgPage, msgFilters); }, [loadMessages, msgPage, msgFilters]);

  const updateFilter = (key, value) => {
    setRunPage(1);
    setRunFilters((prev) => ({ ...prev, [key]: value }));
  };
  const resetFilters = () => {
    setRunPage(1);
    setRunFilters(EMPTY_FILTERS);
  };
  const hasActiveFilters = runFilters.agent_key || runFilters.status || runFilters.from || runFilters.to;
  const runPages = Math.max(1, Math.ceil(runTotal / RUNS_PER_PAGE));

  // Phase G9.R10 — message filter + modal handlers.
  const updateMsgFilter = (key, value) => {
    setMsgPage(1);
    setMsgFilters((prev) => ({ ...prev, [key]: value }));
  };
  const resetMsgFilters = () => {
    setMsgPage(1);
    setMsgFilters(EMPTY_MSG_FILTERS);
  };
  const hasActiveMsgFilters = msgFilters.category || msgFilters.from || msgFilters.to;
  const msgPages = Math.max(1, Math.ceil(msgTotal / MSGS_PER_PAGE));

  const openMessage = async (m) => {
    setSelectedMessage(m);
    // Mark as read when opening — matches inbox UX. Best-effort; if the user
    // is already in readBy or the call fails, we still show the modal.
    if (!m.read) {
      try {
        await messageService.markRead(m._id);
        setMessages((prev) => prev.map((x) => (x._id === m._id ? { ...x, read: true } : x)));
      } catch (err) {
        // Silent — read state is cosmetic on a monitor view
        console.warn('[AgentDashboard.markRead]', err.message);
      }
    }
  };
  const closeMessage = () => setSelectedMessage(null);

  return (
    <div className="agd-page">
      <style>{pageStyles}</style>
      <Navbar />
      <div style={{ display: 'flex', flex: 1 }}>
        <Sidebar />
        <main className="agd-main">
          <WorkflowGuide pageKey="agent-dashboard" />
          <div className="agd-header">
            <h1><Bot size={28} /> AI Agent Intelligence</h1>
          </div>

          {loading ? <div className="agd-loading">Loading agent data...</div> : (
            <>
              {/* AI-Powered Agents */}
              <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Zap size={18} style={{ color: '#6366f1' }} /> Claude AI Agents
                <span style={{ fontSize: 11, fontWeight: 500, color: '#64748b', background: '#f1f5f9', padding: '2px 8px', borderRadius: 4 }}>Requires ANTHROPIC_API_KEY</span>
              </h2>
              <div className="agd-cards">
                {registry.filter((r) => r.type === 'AI').map((r) => {
                  const meta = AGENT_META[r.key] || DEFAULT_META;
                  const Icon = meta.icon;
                  const color = meta.color;
                  // Phase G9.R9 — prefer backend-provided schedule (agentRegistry)
                  // so newly-registered agents surface with correct copy without
                  // a frontend edit. Falls back to AGENT_META, then DEFAULT_META.
                  const schedule = r.schedule || meta.schedule;
                  const label = r.label || prettifyKey(r.key);
                  const agent = stats?.agents?.find((a) => a._id === r.key);
                  return (
                    <div className="agd-card" key={r.key}>
                      <div className="agd-card-accent" style={{ background: color }} />
                      <div className="agd-card-header">
                        <h3><Icon style={{ color }} /> {label}</h3>
                        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                          <span style={{ fontSize: 9, fontWeight: 700, color: '#6366f1', background: '#e0e7ff', padding: '1px 6px', borderRadius: 4 }}>AI</span>
                          {agent ? <StatusBadge status={agent.last_status} /> : <span className="agd-badge" style={{ background: '#f1f5f9', color: '#64748b' }}>Awaiting run</span>}
                        </div>
                      </div>
                      <div className="agd-card-stats">
                        <div className="agd-stat"><div className="agd-stat-value">{agent?.total_runs || 0}</div><div className="agd-stat-label">Total Runs</div></div>
                        <div className="agd-stat"><div className="agd-stat-value">{agent?.total_messages || 0}</div><div className="agd-stat-label">Messages Sent</div></div>
                        <div className="agd-stat"><div className="agd-stat-value">{agent?.total_alerts || 0}</div><div className="agd-stat-label">Alerts</div></div>
                        <div className="agd-stat"><div className="agd-stat-value" style={{ fontSize: 13 }}>{fmtDate(agent?.last_run)}</div><div className="agd-stat-label">Last Run</div></div>
                      </div>
                      {agent?.last_summary?.key_findings?.length > 0 && (
                        <div className="agd-findings" style={{ marginTop: 10 }}>
                          {agent.last_summary.key_findings.slice(0, 2).map((f, i) => <div key={i} className="agd-finding">{f}</div>)}
                        </div>
                      )}
                      <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 11, color: '#94a3b8' }}><Clock style={{ width: 12, height: 12, verticalAlign: 'middle' }} /> {schedule}</span>
                        {isPresidentOrAdmin && (
                          <button
                            onClick={() => handleRunNow(r.key)}
                            disabled={!!runningAgent}
                            style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 6, border: '1px solid #dbe4f0', background: runningAgent === r.key ? '#f1f5f9' : '#fff', color: runningAgent === r.key ? '#94a3b8' : color, cursor: runningAgent ? 'not-allowed' : 'pointer' }}
                          >
                            {runningAgent === r.key ? 'Running...' : 'Run Now'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Free Rule-Based Agents */}
              <h2 style={{ fontSize: 16, fontWeight: 700, margin: '24px 0 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Bot size={18} style={{ color: '#10b981' }} /> Rule-Based Agents
                <span style={{ fontSize: 11, fontWeight: 500, color: '#64748b', background: '#f1f5f9', padding: '2px 8px', borderRadius: 4 }}>Always active</span>
              </h2>
              <div className="agd-cards">
                {registry.filter((r) => r.type === 'FREE' || r.type === 'Free').map((r) => {
                  const meta = AGENT_META[r.key] || DEFAULT_META;
                  const Icon = meta.icon;
                  const color = meta.color;
                  // Phase G9.R9 — see AI-loop comment above.
                  const schedule = r.schedule || meta.schedule;
                  const label = r.label || prettifyKey(r.key);
                  const agent = stats?.agents?.find((a) => a._id === r.key);
                  return (
                    <div className="agd-card" key={r.key}>
                      <div className="agd-card-accent" style={{ background: color }} />
                      <div className="agd-card-header">
                        <h3><Icon style={{ color }} /> {label}</h3>
                        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                          <span style={{ fontSize: 9, fontWeight: 700, color: '#10b981', background: '#dcfce7', padding: '1px 6px', borderRadius: 4 }}>FREE</span>
                          {agent ? <StatusBadge status={agent.last_status} /> : <span className="agd-badge" style={{ background: '#f1f5f9', color: '#64748b' }}>Awaiting run</span>}
                        </div>
                      </div>
                      <div className="agd-card-stats">
                        <div className="agd-stat"><div className="agd-stat-value">{agent?.total_runs || 0}</div><div className="agd-stat-label">Total Runs</div></div>
                        <div className="agd-stat"><div className="agd-stat-value">{agent?.total_messages || 0}</div><div className="agd-stat-label">Messages Sent</div></div>
                        <div className="agd-stat"><div className="agd-stat-value">{agent?.total_alerts || 0}</div><div className="agd-stat-label">Alerts</div></div>
                        <div className="agd-stat"><div className="agd-stat-value" style={{ fontSize: 13 }}>{fmtDate(agent?.last_run)}</div><div className="agd-stat-label">Last Run</div></div>
                      </div>
                      {agent?.last_summary?.key_findings?.length > 0 && (
                        <div className="agd-findings" style={{ marginTop: 10 }}>
                          {agent.last_summary.key_findings.slice(0, 2).map((f, i) => <div key={i} className="agd-finding">{f}</div>)}
                        </div>
                      )}
                      <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 11, color: '#94a3b8' }}><Clock style={{ width: 12, height: 12, verticalAlign: 'middle' }} /> {schedule}</span>
                        {isPresidentOrAdmin && (
                          <button
                            onClick={() => handleRunNow(r.key)}
                            disabled={!!runningAgent}
                            style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 6, border: '1px solid #dbe4f0', background: runningAgent === r.key ? '#f1f5f9' : '#fff', color: runningAgent === r.key ? '#94a3b8' : color, cursor: runningAgent ? 'not-allowed' : 'pointer' }}
                          >
                            {runningAgent === r.key ? 'Running...' : 'Run Now'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Recent Runs Table */}
              <div className="agd-section">
                <h2>Recent Agent Runs {runTotal > 0 && <span style={{ fontSize: 12, fontWeight: 500, color: '#64748b' }}>({runTotal} total)</span>}</h2>

                <div className="agd-filters">
                  <div className="agd-filter">
                    <label htmlFor="agd-f-agent">Agent</label>
                    <select id="agd-f-agent" value={runFilters.agent_key} onChange={(e) => updateFilter('agent_key', e.target.value)}>
                      <option value="">All agents</option>
                      {registry.map((r) => (
                        <option key={r.key} value={r.key}>{r.label || prettifyKey(r.key)}</option>
                      ))}
                    </select>
                  </div>
                  <div className="agd-filter">
                    <label htmlFor="agd-f-status">Status</label>
                    <select id="agd-f-status" value={runFilters.status} onChange={(e) => updateFilter('status', e.target.value)}>
                      <option value="">All statuses</option>
                      <option value="success">Success</option>
                      <option value="partial">Partial</option>
                      <option value="error">Error</option>
                    </select>
                  </div>
                  <div className="agd-filter">
                    <label htmlFor="agd-f-from">From</label>
                    <input id="agd-f-from" type="date" value={runFilters.from} onChange={(e) => updateFilter('from', e.target.value)} />
                  </div>
                  <div className="agd-filter">
                    <label htmlFor="agd-f-to">To</label>
                    <input id="agd-f-to" type="date" value={runFilters.to} onChange={(e) => updateFilter('to', e.target.value)} />
                  </div>
                  {hasActiveFilters && (
                    <button type="button" className="agd-filter-btn" onClick={resetFilters}>Reset</button>
                  )}
                </div>

                {runsLoading ? (
                  <div className="agd-loading">Loading runs...</div>
                ) : runs.length === 0 ? (
                  <div className="agd-empty">
                    {hasActiveFilters
                      ? 'No agent runs match the current filters.'
                      : 'No agent runs recorded yet. Runs will appear after the next scheduled execution.'}
                  </div>
                ) : (
                  <>
                    <table className="agd-table">
                      <thead>
                        <tr>
                          <th>Agent</th>
                          <th>Date</th>
                          <th>Status</th>
                          <th>BDMs</th>
                          <th>Messages</th>
                          <th>Alerts</th>
                          <th>Findings</th>
                        </tr>
                      </thead>
                      <tbody>
                        {runs.map(r => (
                          <tr key={r._id}>
                            <td style={{ fontWeight: 600 }}>{r.agent_label}</td>
                            <td>{fmtDate(r.run_date)}</td>
                            <td><StatusBadge status={r.status} /></td>
                            <td>{r.summary?.bdms_processed || 0}</td>
                            <td>{r.summary?.messages_sent || 0}</td>
                            <td>{r.summary?.alerts_generated || 0}</td>
                            <td>
                              <div className="agd-findings">
                                {(r.summary?.key_findings || []).slice(0, 2).map((f, i) => (
                                  <div key={i} className="agd-finding">{f}</div>
                                ))}
                                {r.error_msg && <div style={{ color: '#dc2626', fontSize: 11 }}>{r.error_msg}</div>}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <Pagination
                      page={runPage}
                      pages={runPages}
                      total={runTotal}
                      onPageChange={setRunPage}
                    />
                  </>
                )}
              </div>

              {/* Agent Messages Feed */}
              <div className="agd-section">
                <h2>
                  Agent Messages
                  {msgTotal > 0 && <span style={{ fontSize: 12, fontWeight: 500, color: '#64748b', marginLeft: 8 }}>({msgTotal} total)</span>}
                </h2>

                <div className="agd-helper-note">
                  Read-only mirror of agent-generated alerts in your inbox. Click any row to read the full message — opening will mark it read.
                  {' '}
                  Use the <a href="/erp/inbox">Inbox</a> to acknowledge, reply, or archive.
                </div>

                <div className="agd-filters">
                  <div className="agd-filter">
                    <label htmlFor="agd-mf-cat">Category</label>
                    <select id="agd-mf-cat" value={msgFilters.category} onChange={(e) => updateMsgFilter('category', e.target.value)}>
                      <option value="">All categories</option>
                      {Object.keys(CAT_FALLBACK).map((code) => {
                        const meta = getCatMeta(code, catLookupOptions);
                        return <option key={code} value={code}>{meta.label}</option>;
                      })}
                    </select>
                  </div>
                  <div className="agd-filter">
                    <label htmlFor="agd-mf-from">From</label>
                    <input id="agd-mf-from" type="date" value={msgFilters.from} onChange={(e) => updateMsgFilter('from', e.target.value)} />
                  </div>
                  <div className="agd-filter">
                    <label htmlFor="agd-mf-to">To</label>
                    <input id="agd-mf-to" type="date" value={msgFilters.to} onChange={(e) => updateMsgFilter('to', e.target.value)} />
                  </div>
                  {hasActiveMsgFilters && (
                    <button type="button" className="agd-filter-btn" onClick={resetMsgFilters}>Reset</button>
                  )}
                </div>

                {msgLoading ? (
                  <div className="agd-loading">Loading messages...</div>
                ) : messages.length === 0 ? (
                  <div className="agd-empty">
                    {hasActiveMsgFilters
                      ? 'No agent messages match the current filters.'
                      : 'No agent messages yet. They will appear here as agents run on schedule.'}
                  </div>
                ) : (
                  <>
                    <div className="agd-msg-feed">
                      {messages.map((m) => {
                        const meta = getCatMeta(m.category, catLookupOptions);
                        const isUnread = !m.read;
                        return (
                          <div
                            className={`agd-msg ${isUnread ? 'agd-msg-unread' : ''}`}
                            key={m._id}
                            style={{ borderLeftColor: meta.leftBorder }}
                            role="button"
                            tabIndex={0}
                            onClick={() => openMessage(m)}
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openMessage(m); } }}
                          >
                            <div className="agd-msg-title">
                              <span className="agd-msg-cat" style={{ background: meta.bg, color: meta.fg }}>{meta.label}</span>
                              {m.title}
                            </div>
                            <div className="agd-msg-body">{m.body?.slice(0, 200)}{m.body?.length > 200 ? '...' : ''}</div>
                            <div className="agd-msg-meta">
                              {fmtDate(m.createdAt)} • {m.recipientRole}
                              {m.recipientUserId ? ' (targeted)' : ' (broadcast)'}
                              {' • '}
                              <span style={{ color: m.priority === 'high' || m.priority === 'urgent' ? '#dc2626' : '#94a3b8' }}>
                                {m.priority || 'normal'}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <Pagination
                      page={msgPage}
                      pages={msgPages}
                      total={msgTotal}
                      onPageChange={setMsgPage}
                    />
                  </>
                )}
              </div>

              {/* Phase G9.R10 — Click-to-view modal. Read-only on this page;
                   for ack/reply/archive the user goes to /erp/inbox. */}
              {selectedMessage && (() => {
                const meta = getCatMeta(selectedMessage.category, catLookupOptions);
                return (
                  <div
                    className="agd-modal-overlay"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="agd-modal-title"
                    onClick={(e) => { if (e.target === e.currentTarget) closeMessage(); }}
                  >
                    <div className="agd-modal">
                      <div className="agd-modal-header">
                        <div>
                          <span className="agd-msg-cat" style={{ background: meta.bg, color: meta.fg, marginRight: 8 }}>
                            {meta.label}
                          </span>
                          <h3 id="agd-modal-title" style={{ display: 'inline' }}>{selectedMessage.title}</h3>
                        </div>
                        <button type="button" className="agd-modal-close" onClick={closeMessage} aria-label="Close">
                          <X size={18} />
                        </button>
                      </div>
                      <div className="agd-modal-meta">
                        <div><strong>From:</strong> {selectedMessage.senderName || '—'}{selectedMessage.senderRole ? ` (${selectedMessage.senderRole})` : ''}</div>
                        <div><strong>To:</strong> {selectedMessage.recipientRole}{selectedMessage.recipientUserId ? ' — targeted' : ' — broadcast'}</div>
                        <div><strong>Sent:</strong> {fmtDate(selectedMessage.createdAt)}</div>
                        <div><strong>Priority:</strong> {selectedMessage.priority || 'normal'}</div>
                      </div>
                      <div className="agd-modal-body">{selectedMessage.body || '(no body)'}</div>
                      <div className="agd-modal-footer">
                        <a className="agd-link-btn" href="/erp/inbox" target="_blank" rel="noreferrer">
                          <ExternalLink size={14} /> Open in Inbox
                        </a>
                        <button type="button" className="agd-link-btn" onClick={closeMessage}>Close</button>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
