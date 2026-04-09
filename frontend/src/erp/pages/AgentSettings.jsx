/**
 * AgentSettings — Control Center Intelligence panel
 * Enable/disable agents, configure notification routing, run on demand.
 */
import { useState, useEffect, useCallback } from 'react';
import api from '../../services/api';
import { Bot, Zap, CheckCircle, XCircle, Play, Clock } from 'lucide-react';
import { showError, showSuccess } from '../utils/errorToast';
import { ROLES, ROLE_SETS } from '../../constants/roles';

const AGENT_META = {
  smart_collection:   { label: 'Smart Collection',      schedule: 'Weekdays 7 AM',  type: 'AI' },
  performance_coach:  { label: 'BDM Performance Coach', schedule: 'Mon 6 AM',       type: 'AI' },
  bir_filing:         { label: 'BIR Filing Review',     schedule: '15th monthly',    type: 'AI' },
  visit_planner:      { label: 'Smart Visit Planner',   schedule: 'Sun 6 PM',        type: 'AI' },
  engagement_decay:   { label: 'Engagement Decay',      schedule: 'Mon 7 AM',        type: 'AI' },
  org_intelligence:   { label: 'Org Intelligence',      schedule: 'Mon 5:30 AM',     type: 'AI' },
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

export default function AgentSettings() {
  return <AgentSettingsContent />;
}
