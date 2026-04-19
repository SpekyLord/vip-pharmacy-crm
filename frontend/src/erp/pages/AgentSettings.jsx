/**
 * AgentSettings — Control Center Intelligence panel
 * Enable/disable agents, configure notification routing, run on demand.
 *
 * Phase G6.10 — adds an "AI Cowork" tab for president to manage Claude-powered
 * approval/rejection assists (AI_COWORK_FEATURES lookup category). Subscription
 * opt-in: rows seed as is_active: false; toggling on enables the buttons in
 * RejectionBanner / ApprovalManager for the entity.
 */
import { useState, useEffect, useCallback } from 'react';
import api from '../../services/api';
import { Bot, Zap, Play, Clock, Sparkles, Wrench, DollarSign } from 'lucide-react';
import { showError, showSuccess } from '../utils/errorToast';
import { ROLES, ROLE_SETS } from '../../constants/roles';
import { useAuth } from '../../hooks/useAuth';
import { invalidateAiCoworkCache } from '../hooks/useAiCoworkFeature';
import { getAiCoworkUsage, invokeAiCoworkFeature } from '../services/aiCoworkService';
import { getCopilotUsage } from '../services/copilotService';

const AGENT_META = {
  smart_collection:   { label: 'Smart Collection',      schedule: 'Weekdays 7 AM',  type: 'AI' },
  performance_coach:  { label: 'BDM Performance Coach', schedule: 'Mon 6 AM',       type: 'AI' },
  bir_filing:         { label: 'BIR Filing Review',     schedule: '15th monthly',    type: 'AI' },
  visit_planner:      { label: 'Smart Visit Planner',   schedule: 'Sun 6 PM',        type: 'AI' },
  engagement_decay:   { label: 'Engagement Decay',      schedule: 'Mon 7 AM',        type: 'AI' },
  org_intelligence:   { label: 'Org Intelligence',      schedule: 'Mon 5:30 AM',     type: 'AI' },
  daily_briefing:     { label: 'Daily Briefing (Copilot)', schedule: 'Weekdays 7 AM',  type: 'AI' },
  expense_anomaly:    { label: 'Expense Anomaly',       schedule: 'Daily 6 AM',      type: 'Free' },
  inventory_reorder:  { label: 'Inventory Reorder',     schedule: 'Daily 6:30 AM',   type: 'Free' },
  credit_risk:        { label: 'Credit Risk Scoring',   schedule: 'Sun 11 PM',       type: 'Free' },
  document_expiry:    { label: 'Document Expiry',       schedule: 'Daily 7:30 AM',   type: 'Free' },
  visit_compliance:   { label: 'Visit Compliance',      schedule: 'Wed + Fri',       type: 'Free' },
  photo_audit:        { label: 'Photo Audit',           schedule: 'Daily 8:30 AM',   type: 'Free' },
  system_integrity:   { label: 'System Integrity',     schedule: 'Mon 5:00 AM',     type: 'Free' },
};

const NOTIFY_OPTIONS = [...ROLE_SETS.MANAGEMENT];

const styles = {
  panel: { fontSize: 13 },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: { textAlign: 'left', padding: '10px 12px', background: '#f0f4ff', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', color: '#64748b', borderBottom: '2px solid #e5e7eb' },
  td: { padding: '10px 12px', borderTop: '1px solid #e5e7eb', verticalAlign: 'middle' },
  toggle: (on) => ({ width: 40, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer', background: on ? '#16a34a' : '#d1d5db', position: 'relative', transition: 'background .2s' }),
  toggleDot: (on) => ({ position: 'absolute', top: 3, left: on ? 21 : 3, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left .2s' }),
  btn: { fontSize: 11, fontWeight: 600, padding: '4px 12px', borderRadius: 6, border: '1px solid #dbe4f0', background: '#fff', cursor: 'pointer' },
  badge: (type) => ({ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: type === 'AI' ? '#e0e7ff' : '#dcfce7', color: type === 'AI' ? '#6366f1' : '#166534' }),
};

export function AgentSettingsContent() {
  const [configs, setConfigs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [runningAgent, setRunningAgent] = useState(null);
  const [saving, setSaving] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/erp/agents/config');
      setConfigs(res.data?.data || []);
    } catch (err) { showError(err, 'Could not load agent configs'); setConfigs([]); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleToggle = async (agentKey, currentEnabled) => {
    setSaving(agentKey);
    try {
      await api.put(`/erp/agents/config/${agentKey}`, { enabled: !currentEnabled });
      setConfigs(prev => prev.map(c => c.agent_key === agentKey ? { ...c, enabled: !currentEnabled } : c));
    } catch (err) { showError(err, 'Could not update agent setting'); }
    setSaving(null);
  };

  const handleNotifyChange = async (agentKey, role, checked) => {
    const config = configs.find(c => c.agent_key === agentKey);
    const current = config?.notify_roles || [ROLES.PRESIDENT];
    const updated = checked ? [...new Set([...current, role])] : current.filter(r => r !== role);
    setSaving(agentKey);
    try {
      await api.put(`/erp/agents/config/${agentKey}`, { notify_roles: updated });
      setConfigs(prev => prev.map(c => c.agent_key === agentKey ? { ...c, notify_roles: updated } : c));
    } catch (err) { showError(err, 'Could not update notification settings'); }
    setSaving(null);
  };

  const handleRunNow = async (agentKey) => {
    if (runningAgent) return;
    setRunningAgent(agentKey);
    try {
      const res = await api.post(`/erp/agents/run/${agentKey}`);
      showSuccess(res.data?.message || 'Agent completed');
    } catch (err) { showError(err, 'Agent run failed'); }
    setRunningAgent(null);
  };

  const freeAgents = Object.keys(AGENT_META).filter(k => AGENT_META[k].type === 'Free');
  const aiAgents = Object.keys(AGENT_META).filter(k => AGENT_META[k].type === 'AI');

  const renderTable = (agentKeys, title, icon) => (
    <div style={{ marginBottom: 24 }}>
      <h3 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
        {icon} {title}
      </h3>
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Agent</th>
              <th style={styles.th}>Schedule</th>
              <th style={styles.th}>Enabled</th>
              <th style={styles.th}>Notify</th>
              <th style={styles.th}>Action</th>
            </tr>
          </thead>
          <tbody>
            {agentKeys.map(key => {
              const meta = AGENT_META[key];
              const config = configs.find(c => c.agent_key === key) || { enabled: true, notify_roles: [ROLES.PRESIDENT] };
              return (
                <tr key={key}>
                  <td style={styles.td}>
                    <div style={{ fontWeight: 600 }}>{meta.label}</div>
                    <span style={styles.badge(meta.type)}>{meta.type}</span>
                  </td>
                  <td style={styles.td}>
                    <span style={{ fontSize: 12, color: '#64748b' }}><Clock style={{ width: 12, height: 12, verticalAlign: 'middle' }} /> {meta.schedule}</span>
                  </td>
                  <td style={styles.td}>
                    <button style={styles.toggle(config.enabled)} onClick={() => handleToggle(key, config.enabled)} disabled={saving === key}>
                      <div style={styles.toggleDot(config.enabled)} />
                    </button>
                  </td>
                  <td style={styles.td}>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {NOTIFY_OPTIONS.map(role => (
                        <label key={role} style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 3, cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={(config.notify_roles || []).includes(role)}
                            onChange={e => handleNotifyChange(key, role, e.target.checked)}
                            disabled={saving === key}
                            style={{ width: 'auto' }}
                          />
                          {role}
                        </label>
                      ))}
                    </div>
                  </td>
                  <td style={styles.td}>
                    <button
                      style={{ ...styles.btn, color: runningAgent === key ? '#94a3b8' : '#1e5eff' }}
                      onClick={() => handleRunNow(key)}
                      disabled={!!runningAgent}
                    >
                      {runningAgent === key ? 'Running...' : <><Play style={{ width: 12, height: 12 }} /> Run Now</>}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Loading agent configuration...</div>;

  return (
    <div style={styles.panel}>
      <h2 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 8px' }}>Agent Intelligence</h2>
      <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 20px' }}>
        Enable/disable agents, configure who receives notifications, or trigger an instant run.
      </p>
      {renderTable(freeAgents, 'Rule-Based Agents', <Bot size={16} style={{ color: '#10b981' }} />)}
      {renderTable(aiAgents, 'Claude AI Agents', <Zap size={16} style={{ color: '#6366f1' }} />)}
    </div>
  );
}

// ── Phase G6.10 — AI Cowork tab content (lookup-driven feature management) ──
function AiCoworkContent() {
  const { user } = useAuth();
  const [features, setFeatures] = useState([]);
  const [usage, setUsage] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(null);
  const [dryRunResult, setDryRunResult] = useState(null);
  const [dryRunLoading, setDryRunLoading] = useState(null);

  const isPresident = user?.role === ROLES.PRESIDENT || user?.role === ROLES.CEO;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Read AI_COWORK_FEATURES rows — lookupValues endpoint auto-seeds + returns full metadata
      const res = await api.get('/erp/lookup-values/AI_COWORK_FEATURES');
      setFeatures(res.data?.data || []);
    } catch (err) {
      showError(err, 'Could not load AI Cowork features');
      setFeatures([]);
    }
    try {
      const u = await getAiCoworkUsage(30);
      setUsage(u);
    } catch { /* non-fatal */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleToggle = async (row) => {
    if (!isPresident) return;
    setSaving(row._id);
    try {
      await api.put(`/erp/lookup-values/${row._id}`, { is_active: !row.is_active });
      setFeatures(prev => prev.map(f => f._id === row._id ? { ...f, is_active: !row.is_active } : f));
      invalidateAiCoworkCache();
      showSuccess(`${row.label} ${!row.is_active ? 'enabled' : 'disabled'}`);
    } catch (err) {
      showError(err, 'Could not toggle feature');
    }
    setSaving(null);
  };

  const handleSaveEdit = async () => {
    if (!editing || !isPresident) return;
    setSaving(editing._id);
    try {
      await api.put(`/erp/lookup-values/${editing._id}`, {
        metadata: editing.metadata,
        label: editing.label,
      });
      setFeatures(prev => prev.map(f => f._id === editing._id ? editing : f));
      invalidateAiCoworkCache();
      setEditing(null);
      showSuccess('Saved');
    } catch (err) {
      showError(err, 'Could not save feature');
    }
    setSaving(null);
  };

  const handleDryRun = async (row) => {
    setDryRunLoading(row.code);
    setDryRunResult(null);
    try {
      const sampleContext = {
        module: 'SAMPLE',
        doc_ref: 'SAMPLE-0001',
        reason: 'Sample rejection reason for prompt-tuning preview.',
        summary: 'Sample document summary used for dry-run preview.',
        errors: ['Field A is missing', 'Amount exceeds threshold'],
      };
      const res = await invokeAiCoworkFeature(row.code, sampleContext);
      setDryRunResult({ code: row.code, text: res?.data?.text || '(no text)', cost: res?.data?.cost });
    } catch (err) {
      setDryRunResult({ code: row.code, error: err?.response?.data?.message || err.message });
    }
    setDryRunLoading(null);
  };

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Loading AI Cowork features...</div>;

  return (
    <div style={styles.panel}>
      <h2 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 8px' }}>AI Cowork — Approval Assists</h2>
      <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 12px' }}>
        Claude-powered helper buttons that appear inside RejectionBanner and the Approval Hub reject dialog.
        {isPresident
          ? ' Toggle each feature on/off, edit prompts, and dry-run before exposing to your team. New AI features = new lookup rows, no code change.'
          : ' Read-only view (president manages prompts and toggles).'}
      </p>

      {/* Usage summary */}
      {usage.length > 0 && (
        <div style={{ marginBottom: 16, padding: 12, background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 8 }}>
            Last 30 days — usage by feature
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 8 }}>
            {usage.map(u => (
              <div key={u._id} style={{ background: '#fff', padding: 10, borderRadius: 6, border: '1px solid #e5e7eb' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#111827' }}>{u._id}</div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                  {u.calls} calls · ${u.total_cost_usd?.toFixed(4) || '0.0000'} · {(u.total_input + u.total_output).toLocaleString()} tokens
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Feature</th>
              <th style={styles.th}>Surface</th>
              <th style={styles.th}>Model</th>
              <th style={styles.th}>Roles</th>
              <th style={styles.th}>Enabled</th>
              <th style={styles.th}>Action</th>
            </tr>
          </thead>
          <tbody>
            {features.length === 0 && (
              <tr><td colSpan={6} style={{ padding: 20, textAlign: 'center', color: '#94a3b8' }}>
                No AI Cowork features configured. Defaults seed on first read; refresh the page if empty.
              </td></tr>
            )}
            {features.map(row => {
              const md = row.metadata || {};
              return (
                <tr key={row._id}>
                  <td style={styles.td}>
                    <div style={{ fontWeight: 600 }}>{row.label}</div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>{md.description || row.code}</div>
                  </td>
                  <td style={styles.td}>
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: md.surface === 'approver' ? '#fef3c7' : '#dbeafe', color: md.surface === 'approver' ? '#92400e' : '#1e40af' }}>
                      {md.surface || '—'}
                    </span>
                  </td>
                  <td style={styles.td}><span style={{ fontSize: 11, fontFamily: 'monospace' }}>{md.model || '—'}</span></td>
                  <td style={styles.td}>
                    <span style={{ fontSize: 11, color: '#64748b' }}>{(md.allowed_roles || []).join(', ') || 'all'}</span>
                  </td>
                  <td style={styles.td}>
                    <button style={styles.toggle(row.is_active)} onClick={() => handleToggle(row)} disabled={!isPresident || saving === row._id}>
                      <div style={styles.toggleDot(row.is_active)} />
                    </button>
                  </td>
                  <td style={styles.td}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {isPresident && (
                        <button style={styles.btn} onClick={() => setEditing({ ...row, metadata: { ...row.metadata } })}>Edit</button>
                      )}
                      <button
                        style={{ ...styles.btn, color: dryRunLoading === row.code ? '#94a3b8' : '#2563eb' }}
                        onClick={() => handleDryRun(row)}
                        disabled={!!dryRunLoading || !row.is_active}
                        title={!row.is_active ? 'Enable the feature first' : 'Send a sample payload to Claude'}
                      >
                        {dryRunLoading === row.code ? 'Running…' : 'Dry-run'}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Dry-run output */}
      {dryRunResult && (
        <div style={{ marginTop: 12, padding: 12, background: dryRunResult.error ? '#fef2f2' : '#f0fdf4', border: `1px solid ${dryRunResult.error ? '#fca5a5' : '#bbf7d0'}`, borderRadius: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: dryRunResult.error ? '#991b1b' : '#166534', marginBottom: 6 }}>
            Dry-run result — {dryRunResult.code}{dryRunResult.cost ? ` · $${dryRunResult.cost.toFixed(4)}` : ''}
          </div>
          <div style={{ fontSize: 12, whiteSpace: 'pre-wrap', color: dryRunResult.error ? '#991b1b' : '#1f2937' }}>
            {dryRunResult.error || dryRunResult.text}
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editing && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setEditing(null)}>
          <div onClick={e => e.stopPropagation()} style={{ width: '92%', maxWidth: 720, maxHeight: '90vh', overflowY: 'auto', background: '#fff', borderRadius: 12, padding: 20 }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 16 }}>Edit — {editing.label}</h3>
            <div style={{ display: 'grid', gap: 10, fontSize: 12 }}>
              <label>Label
                <input type="text" value={editing.label} onChange={e => setEditing({ ...editing, label: e.target.value })}
                  style={{ width: '100%', padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13 }} />
              </label>
              <label>System prompt
                <textarea value={editing.metadata.system_prompt || ''} onChange={e => setEditing({ ...editing, metadata: { ...editing.metadata, system_prompt: e.target.value } })}
                  rows={5} style={{ width: '100%', padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 12, fontFamily: 'monospace' }} />
              </label>
              <label>User template (Mustache: {`{{var}}`})
                <textarea value={editing.metadata.user_template || ''} onChange={e => setEditing({ ...editing, metadata: { ...editing.metadata, user_template: e.target.value } })}
                  rows={5} style={{ width: '100%', padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 12, fontFamily: 'monospace' }} />
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <label>Model
                  <input type="text" value={editing.metadata.model || ''} onChange={e => setEditing({ ...editing, metadata: { ...editing.metadata, model: e.target.value } })}
                    style={{ width: '100%', padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 12, fontFamily: 'monospace' }} />
                </label>
                <label>Button label
                  <input type="text" value={editing.metadata.button_label || ''} onChange={e => setEditing({ ...editing, metadata: { ...editing.metadata, button_label: e.target.value } })}
                    style={{ width: '100%', padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13 }} />
                </label>
                <label>Max tokens
                  <input type="number" value={editing.metadata.max_tokens || 600} onChange={e => setEditing({ ...editing, metadata: { ...editing.metadata, max_tokens: Number(e.target.value) } })}
                    style={{ width: '100%', padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13 }} />
                </label>
                <label>Rate limit (calls/min)
                  <input type="number" value={editing.metadata.rate_limit_per_min || 5} onChange={e => setEditing({ ...editing, metadata: { ...editing.metadata, rate_limit_per_min: Number(e.target.value) } })}
                    style={{ width: '100%', padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13 }} />
                </label>
              </div>
              <label>Allowed roles (comma-separated)
                <input type="text" value={(editing.metadata.allowed_roles || []).join(',')} onChange={e => setEditing({ ...editing, metadata: { ...editing.metadata, allowed_roles: e.target.value.split(',').map(r => r.trim()).filter(Boolean) } })}
                  style={{ width: '100%', padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 12, fontFamily: 'monospace' }} />
              </label>
            </div>
            <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button style={{ ...styles.btn, padding: '6px 14px' }} onClick={() => setEditing(null)}>Cancel</button>
              <button style={{ ...styles.btn, padding: '6px 14px', background: '#2563eb', color: '#fff', borderColor: '#2563eb' }} onClick={handleSaveEdit} disabled={saving === editing._id}>
                {saving === editing._id ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Phase G7.4 — Copilot Tools tab (lookup-driven tool registry management) ──
function CopilotToolsContent() {
  const { user } = useAuth();
  const [tools, setTools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);
  const [editing, setEditing] = useState(null);
  const [usage, setUsage] = useState([]);

  const isPresident = user?.role === ROLES.PRESIDENT || user?.role === ROLES.CEO;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/erp/lookup-values/COPILOT_TOOLS');
      setTools(res.data?.data || []);
    } catch (err) {
      showError(err, 'Could not load Copilot tools');
      setTools([]);
    }
    try {
      const u = await getCopilotUsage(30);
      setUsage(u);
    } catch { /* non-fatal */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleToggle = async (row) => {
    if (!isPresident) return;
    setSaving(row._id);
    try {
      await api.put(`/erp/lookup-values/${row._id}`, { is_active: !row.is_active });
      setTools((prev) => prev.map((t) => (t._id === row._id ? { ...t, is_active: !row.is_active } : t)));
      showSuccess(`${row.label} ${!row.is_active ? 'enabled' : 'disabled'}`);
    } catch (err) { showError(err, 'Could not toggle tool'); }
    setSaving(null);
  };

  const handleSaveEdit = async () => {
    if (!editing || !isPresident) return;
    setSaving(editing._id);
    try {
      await api.put(`/erp/lookup-values/${editing._id}`, {
        metadata: editing.metadata,
        label: editing.label,
      });
      setTools((prev) => prev.map((t) => (t._id === editing._id ? editing : t)));
      setEditing(null);
      showSuccess('Saved');
    } catch (err) { showError(err, 'Could not save tool'); }
    setSaving(null);
  };

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Loading Copilot tools...</div>;

  return (
    <div style={styles.panel}>
      <h2 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 8px' }}>Copilot Tools</h2>
      <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 16px' }}>
        Each row is a capability the President&apos;s Copilot can call. Disable any tool to hide it from Claude — the widget and Cmd+K palette will refuse to use it.
        {!isPresident && ' Read-only view (president manages toggles and allowed roles).'}
      </p>

      {usage.length > 0 && (
        <div style={{ marginBottom: 16, padding: 12, background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 8 }}>
            Last 30 days — Copilot usage by tool
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8 }}>
            {usage.map((u) => (
              <div key={u._id} style={{ background: '#fff', padding: 10, borderRadius: 6, border: '1px solid #e5e7eb' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#111827' }}>{u._id}</div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                  {u.calls} calls · ${u.total_cost_usd?.toFixed(4) || '0.0000'}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Tool</th>
              <th style={styles.th}>Type</th>
              <th style={styles.th}>Handler</th>
              <th style={styles.th}>Allowed Roles</th>
              <th style={styles.th}>Enabled</th>
              <th style={styles.th}>Action</th>
            </tr>
          </thead>
          <tbody>
            {tools.length === 0 && (
              <tr><td colSpan={6} style={{ padding: 20, textAlign: 'center', color: '#94a3b8' }}>
                No Copilot tools configured. Defaults seed on first read; refresh the page if empty.
              </td></tr>
            )}
            {tools.map((row) => {
              const md = row.metadata || {};
              return (
                <tr key={row._id}>
                  <td style={styles.td}>
                    <div style={{ fontWeight: 600 }}>{row.label}</div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>{md.description_for_claude || row.code}</div>
                  </td>
                  <td style={styles.td}>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: md.tool_type === 'write_confirm' ? '#fef3c7' : '#dbeafe', color: md.tool_type === 'write_confirm' ? '#92400e' : '#1e40af' }}>
                      {md.tool_type || 'read'}
                    </span>
                  </td>
                  <td style={styles.td}><span style={{ fontSize: 11, fontFamily: 'monospace' }}>{md.handler_key || '—'}</span></td>
                  <td style={styles.td}>
                    <span style={{ fontSize: 11, color: '#64748b' }}>{(md.allowed_roles || []).join(', ') || 'all'}</span>
                  </td>
                  <td style={styles.td}>
                    <button style={styles.toggle(row.is_active)} onClick={() => handleToggle(row)} disabled={!isPresident || saving === row._id}>
                      <div style={styles.toggleDot(row.is_active)} />
                    </button>
                  </td>
                  <td style={styles.td}>
                    {isPresident && (
                      <button style={styles.btn} onClick={() => setEditing({ ...row, metadata: { ...row.metadata } })}>Edit</button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editing && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setEditing(null)}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: '92%', maxWidth: 640, maxHeight: '90vh', overflowY: 'auto', background: '#fff', borderRadius: 12, padding: 20 }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 16 }}>Edit Tool — {editing.label}</h3>
            <div style={{ display: 'grid', gap: 10, fontSize: 12 }}>
              <label>Label
                <input type="text" value={editing.label} onChange={(e) => setEditing({ ...editing, label: e.target.value })}
                  style={{ width: '100%', padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13 }} />
              </label>
              <label>Description for Claude
                <textarea value={editing.metadata.description_for_claude || ''} onChange={(e) => setEditing({ ...editing, metadata: { ...editing.metadata, description_for_claude: e.target.value } })}
                  rows={3} style={{ width: '100%', padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 12 }} />
              </label>
              <label>Allowed roles (comma-separated)
                <input type="text" value={(editing.metadata.allowed_roles || []).join(',')} onChange={(e) => setEditing({ ...editing, metadata: { ...editing.metadata, allowed_roles: e.target.value.split(',').map((r) => r.trim()).filter(Boolean) } })}
                  style={{ width: '100%', padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 12, fontFamily: 'monospace' }} />
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <label>Rate limit (calls/min)
                  <input type="number" value={editing.metadata.rate_limit_per_min || 30} onChange={(e) => setEditing({ ...editing, metadata: { ...editing.metadata, rate_limit_per_min: Number(e.target.value) } })}
                    style={{ width: '100%', padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13 }} />
                </label>
                <label>Entity scoped
                  <select value={editing.metadata.entity_scoped ? 'true' : 'false'} onChange={(e) => setEditing({ ...editing, metadata: { ...editing.metadata, entity_scoped: e.target.value === 'true' } })}
                    style={{ width: '100%', padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13 }}>
                    <option value="true">Yes</option>
                    <option value="false">No</option>
                  </select>
                </label>
              </div>
              <div style={{ padding: 10, background: '#f8fafc', borderRadius: 6, fontSize: 11, color: '#64748b' }}>
                <strong>Handler:</strong> {editing.metadata.handler_key} (code-registered, not editable)<br />
                <strong>JSON schema:</strong> <em>input shape Claude sees — edit via Lookup Manager</em>
              </div>
            </div>
            <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button style={{ ...styles.btn, padding: '6px 14px' }} onClick={() => setEditing(null)}>Cancel</button>
              <button style={{ ...styles.btn, padding: '6px 14px', background: '#2563eb', color: '#fff', borderColor: '#2563eb' }} onClick={handleSaveEdit} disabled={saving === editing._id}>
                {saving === editing._id ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Phase G7.8 — AI Budget tab (spend caps + per-feature overrides) ──
function AiBudgetContent() {
  const { user } = useAuth();
  const [row, setRow] = useState(null);
  const [spend, setSpend] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const isPresident = user?.role === ROLES.PRESIDENT || user?.role === ROLES.CEO;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get('/erp/lookup-values/AI_SPEND_CAPS');
      const monthly = (r.data?.data || []).find((x) => x.code === 'MONTHLY');
      setRow(monthly || null);
    } catch (err) { showError(err, 'Could not load AI budget'); }

    try {
      const s = await api.get('/erp/copilot/status');
      setSpend(s.data?.data?.spend || null);
    } catch { /* non-fatal */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async (patch) => {
    if (!row || !isPresident) return;
    setSaving(true);
    const next = { ...row, ...patch };
    try {
      await api.put(`/erp/lookup-values/${row._id}`, {
        is_active: next.is_active,
        metadata: next.metadata,
      });
      setRow(next);
      showSuccess('AI budget saved');
    } catch (err) { showError(err, 'Save failed'); }
    setSaving(false);
  };

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Loading AI budget...</div>;

  const md = row?.metadata || {};
  const monthlyBudget = Number(md.monthly_budget_usd || 150);

  return (
    <div style={styles.panel}>
      <h2 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 8px' }}>AI Budget</h2>
      <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 16px' }}>
        Monthly Anthropic API cap for this entity. Spend includes OCR, AI Cowork, Copilot, and paid agents.
        {!isPresident && ' Read-only view (president manages the budget).'}
      </p>

      {spend && row?.is_active && (
        <div style={{
          padding: 16, marginBottom: 16, borderRadius: 10,
          background: spend.pct >= 100 ? '#fef2f2' : spend.pct >= (md.notify_at_pct || 80) ? '#fffbeb' : '#f0fdf4',
          border: `1px solid ${spend.pct >= 100 ? '#fca5a5' : spend.pct >= (md.notify_at_pct || 80) ? '#fcd34d' : '#bbf7d0'}`,
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 4 }}>
            This month
          </div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>
            ${(spend.spend || 0).toFixed(2)} <span style={{ fontSize: 14, color: '#64748b' }}>/ ${(spend.cap || monthlyBudget).toFixed(2)}</span>
          </div>
          <div style={{ height: 8, background: '#e5e7eb', borderRadius: 4, marginTop: 8, overflow: 'hidden' }}>
            <div style={{ width: `${Math.min(100, spend.pct || 0)}%`, height: '100%', background: spend.pct >= 100 ? '#ef4444' : spend.pct >= (md.notify_at_pct || 80) ? '#f59e0b' : '#22c55e' }} />
          </div>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 6 }}>{spend.pct || 0}% used</div>
        </div>
      )}

      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16 }}>
        {!row ? (
          <div style={{ color: '#94a3b8' }}>No cap row. Defaults seed on first access.</div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <button
                style={styles.toggle(!!row.is_active)}
                onClick={() => handleSave({ is_active: !row.is_active })}
                disabled={!isPresident || saving}
              >
                <div style={styles.toggleDot(!!row.is_active)} />
              </button>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13 }}>
                  {row.is_active ? 'Enforced — over-cap calls will be blocked' : 'Disabled — unlimited spend (default)'}
                </div>
                <div style={{ fontSize: 11, color: '#64748b' }}>
                  Toggle off to disable all caps for this entity.
                </div>
              </div>
            </div>
            <div style={{ display: 'grid', gap: 10, fontSize: 12, maxWidth: 480 }}>
              <label>Monthly budget (USD)
                <input type="number" step="1" min="0" value={md.monthly_budget_usd || 0} disabled={!isPresident || saving}
                  onChange={(e) => setRow((r) => ({ ...r, metadata: { ...r.metadata, monthly_budget_usd: Number(e.target.value) } }))}
                  onBlur={(e) => handleSave({ metadata: { ...md, monthly_budget_usd: Number(e.target.value) } })}
                  style={{ width: '100%', padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13 }}
                />
              </label>
              <label>Notify at (%)
                <input type="number" step="1" min="10" max="100" value={md.notify_at_pct || 80} disabled={!isPresident || saving}
                  onChange={(e) => setRow((r) => ({ ...r, metadata: { ...r.metadata, notify_at_pct: Number(e.target.value) } }))}
                  onBlur={(e) => handleSave({ metadata: { ...md, notify_at_pct: Number(e.target.value) } })}
                  style={{ width: '100%', padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13 }}
                />
              </label>
              <label>When reached
                <select value={md.action_when_reached || 'disable'} disabled={!isPresident || saving}
                  onChange={(e) => handleSave({ metadata: { ...md, action_when_reached: e.target.value } })}
                  style={{ width: '100%', padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13 }}
                >
                  <option value="disable">Block new AI calls</option>
                  <option value="warn_only">Warn only (allow to continue)</option>
                </select>
              </label>
            </div>
            <div style={{ marginTop: 16, padding: 10, background: '#f8fafc', borderRadius: 6, fontSize: 11, color: '#64748b' }}>
              <strong>Per-feature overrides:</strong> edit via Control Center → Lookup Tables → <code>AI_SPEND_CAPS/MONTHLY</code> → metadata.feature_overrides.
              Example: <code>{JSON.stringify({ OCR: { monthly_budget_usd: 30, action_when_reached: 'disable' } })}</code>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Tabbed shell wrapping legacy AgentSettings + G6.10 Cowork + G7 tabs ──
const TABS = [
  { key: 'agents', label: 'Agents',        icon: <Zap size={14} /> },
  { key: 'cowork', label: 'AI Cowork',     icon: <Sparkles size={14} /> },
  { key: 'tools',  label: 'Copilot Tools', icon: <Wrench size={14} /> },
  { key: 'budget', label: 'AI Budget',     icon: <DollarSign size={14} /> },
];

export default function AgentSettings() {
  const [tab, setTab] = useState('agents');
  return (
    <div>
      <div style={{ display: 'flex', borderBottom: '2px solid #e5e7eb', marginBottom: 16, overflowX: 'auto' }}>
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: '8px 16px', background: 'transparent', border: 'none',
              borderBottom: tab === t.key ? '2px solid #2563eb' : '2px solid transparent',
              marginBottom: -2, fontSize: 13, fontWeight: tab === t.key ? 700 : 500,
              color: tab === t.key ? '#2563eb' : '#64748b', cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
            }}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>
      {tab === 'agents' && <AgentSettingsContent />}
      {tab === 'cowork' && <AiCoworkContent />}
      {tab === 'tools'  && <CopilotToolsContent />}
      {tab === 'budget' && <AiBudgetContent />}
    </div>
  );
}
