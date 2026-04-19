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
import { Bot, CheckCircle, AlertTriangle, XCircle, Clock, TrendingUp, Calendar, ShieldAlert, DollarSign, FileSearch, Package, CreditCard, FileWarning, Camera, MapPin, Zap, Wallet, LineChart, ShoppingBag, CalendarClock, Users, Database, PackageCheck, Rocket, Target, TrendingDown, BarChart3 } from 'lucide-react';
import WorkflowGuide from '../components/WorkflowGuide';
import { showError, showSuccess } from '../utils/errorToast';

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
  .agd-msg { padding: 12px 16px; background: var(--erp-bg); border-radius: 10px; border-left: 3px solid var(--erp-accent); }
  .agd-msg-title { font-size: 13px; font-weight: 600; color: var(--erp-text); margin-bottom: 4px; }
  .agd-msg-body { font-size: 12px; color: var(--erp-muted); line-height: 1.5; max-height: 80px; overflow: hidden; }
  .agd-msg-meta { font-size: 11px; color: #94a3b8; margin-top: 6px; }
  .agd-msg-cat { display: inline-block; padding: 1px 6px; border-radius: 4px; font-size: 10px; font-weight: 600; margin-right: 6px; }
  .agd-msg-cat-coaching { background: #dbeafe; color: #1e40af; }
  .agd-msg-cat-schedule { background: #dcfce7; color: #166534; }
  .agd-msg-cat-alert { background: #fee2e2; color: #991b1b; }

  .agd-tabs { display: flex; gap: 4px; margin-bottom: 14px; }
  .agd-tab { padding: 6px 14px; border-radius: 6px; border: none; cursor: pointer; font-size: 12px; font-weight: 600; background: var(--erp-bg); color: var(--erp-muted); }
  .agd-tab.active { background: var(--erp-accent); color: #fff; }

  .agd-empty { text-align: center; padding: 40px; color: var(--erp-muted); font-size: 13px; }
  .agd-loading { text-align: center; padding: 40px; color: var(--erp-muted); }

  @media(max-width: 768px) { .agd-main { padding: 16px; } .agd-cards { grid-template-columns: 1fr; } }
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
};
const DEFAULT_META = { icon: Bot, color: '#64748b', schedule: 'Scheduled' };

// Humanise backend AGENT_KEYS that have no pretty label.
// Registry already provides `label` — this is just a fallback.
function prettifyKey(k) {
  return String(k).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

const CAT_LABELS = { ai_coaching: 'Coaching', ai_schedule: 'Schedule', ai_alert: 'Alert' };
const CAT_CSS = { ai_coaching: 'coaching', ai_schedule: 'schedule', ai_alert: 'alert' };

 
function StatusBadge({ status }) {
  const cfg = { success: { icon: CheckCircle, css: 'success' }, error: { icon: XCircle, css: 'error' }, partial: { icon: AlertTriangle, css: 'partial' } };
  const c = cfg[status] || cfg.success;
  const Icon = c.icon;
  return <span className={`agd-badge agd-badge-${c.css}`}><Icon />{status}</span>;
}
 

function fmtDate(d) { return d ? new Date(d).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'; }

export default function AgentDashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [runs, setRuns] = useState([]);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msgTab, setMsgTab] = useState('all');
  const [runningAgent, setRunningAgent] = useState(null);
  // Phase G8 — agent list sourced from backend registry (no hardcoded list).
  // Each entry: { key, label, type: 'AI'|'FREE' }. UI metadata joined from
  // AGENT_META keyed by `key`, with DEFAULT_META fallback so unknown keys
  // still render (new agents auto-appear on the dashboard).
  const [registry, setRegistry] = useState([]);

  const isPresidentOrAdmin = [ROLES.PRESIDENT, ROLES.ADMIN].includes(user?.role);

  const handleRunNow = async (agentKey) => {
    if (runningAgent) return;
    setRunningAgent(agentKey);
    try {
      const res = await api.post(`/erp/agents/run/${agentKey}`);
      showSuccess(res.data?.message || `Agent "${agentKey}" completed`);
      load(); // refresh stats
    } catch (err) {
      showError(err, `Agent "${agentKey}" failed`);
    }
    setRunningAgent(null);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [statsRes, runsRes, msgRes, regRes] = await Promise.all([
        api.get('/erp/agents/runs/stats'),
        api.get('/erp/agents/runs?limit=10'),
        messageService.getAll({ category: 'ai_coaching,ai_schedule,ai_alert', limit: 20 }),
        api.get('/erp/agents/registry'),
      ]);
      setStats(statsRes.data?.data || null);
      setRuns(runsRes.data?.data || []);
      setMessages(msgRes.data || []);
      setRegistry(Array.isArray(regRes.data?.data) ? regRes.data.data : []);
    } catch (err) {
      console.error('[AgentDashboard]', err.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filteredMsgs = msgTab === 'all' ? messages : messages.filter(m => m.category === msgTab);

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
                  const schedule = meta.schedule;
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
                  const schedule = meta.schedule;
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
                <h2>Recent Agent Runs</h2>
                {runs.length === 0 ? (
                  <div className="agd-empty">No agent runs recorded yet. Runs will appear after the next scheduled execution.</div>
                ) : (
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
                )}
              </div>

              {/* Agent Messages Feed */}
              <div className="agd-section">
                <h2>Agent Messages</h2>
                <div className="agd-tabs">
                  {[['all', 'All'], ['ai_coaching', 'Coaching'], ['ai_schedule', 'Schedules'], ['ai_alert', 'Alerts']].map(([key, label]) => (
                    <button key={key} className={`agd-tab ${msgTab === key ? 'active' : ''}`} onClick={() => setMsgTab(key)}>{label}</button>
                  ))}
                </div>
                {filteredMsgs.length === 0 ? (
                  <div className="agd-empty">No agent messages yet.</div>
                ) : (
                  <div className="agd-msg-feed">
                    {filteredMsgs.slice(0, 10).map(m => (
                      <div className="agd-msg" key={m._id} style={{ borderLeftColor: m.category === 'ai_alert' ? '#ef4444' : m.category === 'ai_schedule' ? '#10b981' : '#6366f1' }}>
                        <div className="agd-msg-title">
                          <span className={`agd-msg-cat agd-msg-cat-${CAT_CSS[m.category] || 'coaching'}`}>{CAT_LABELS[m.category] || m.category}</span>
                          {m.title}
                        </div>
                        <div className="agd-msg-body">{m.body?.slice(0, 200)}{m.body?.length > 200 ? '...' : ''}</div>
                        <div className="agd-msg-meta">{fmtDate(m.createdAt)} • {m.recipientRole} {m.recipientUserId ? '(targeted)' : '(broadcast)'}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
