/**
 * AgentSettings - Control Center Intelligence panel
 * Enable/disable agents, configure notification routing, run on demand.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../../services/api';
import { Bot, Clock, Play, Zap } from 'lucide-react';
import { showError, showSuccess } from '../utils/errorToast';

const AGENT_META = {
  smart_collection: { label: 'Smart Collection', schedule: 'Weekdays 7 AM', type: 'AI' },
  performance_coach: { label: 'BDM Performance Coach', schedule: 'Mon 6 AM', type: 'AI' },
  bir_filing: { label: 'BIR Filing Review', schedule: '15th monthly', type: 'AI' },
  visit_planner: { label: 'Smart Visit Planner', schedule: 'Sun 6 PM', type: 'AI' },
  engagement_decay: { label: 'Engagement Decay', schedule: 'Mon 7 AM', type: 'AI' },
  org_intelligence: { label: 'Org Intelligence', schedule: 'Mon 5:30 AM', type: 'AI' },
  expense_anomaly: { label: 'Expense Anomaly', schedule: 'Daily 6 AM', type: 'Free' },
  inventory_reorder: { label: 'Inventory Reorder', schedule: 'Daily 6:30 AM', type: 'Free' },
  credit_risk: { label: 'Credit Risk Scoring', schedule: 'Sun 11 PM', type: 'Free' },
  document_expiry: { label: 'Document Expiry', schedule: 'Daily 7:30 AM', type: 'Free' },
  visit_compliance: { label: 'Visit Compliance', schedule: 'Wed + Fri', type: 'Free' },
  photo_audit: { label: 'Photo Audit', schedule: 'Daily 8:30 AM', type: 'Free' },
  system_integrity: { label: 'System Integrity', schedule: 'Mon 5:00 AM', type: 'Free' },
};

const NOTIFY_OPTIONS = ['president', 'admin', 'finance'];

const styles = {
  panel: { fontSize: 13 },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: {
    textAlign: 'left',
    padding: '10px 12px',
    background: '#f0f4ff',
    fontWeight: 600,
    fontSize: 11,
    textTransform: 'uppercase',
    color: '#64748b',
    borderBottom: '2px solid #e5e7eb',
  },
  td: { padding: '10px 12px', borderTop: '1px solid #e5e7eb', verticalAlign: 'middle' },
  toggle: (on) => ({
    width: 40,
    height: 22,
    borderRadius: 11,
    border: 'none',
    cursor: 'pointer',
    background: on ? '#16a34a' : '#d1d5db',
    position: 'relative',
    transition: 'background .2s',
  }),
  toggleDot: (on) => ({
    position: 'absolute',
    top: 3,
    left: on ? 21 : 3,
    width: 16,
    height: 16,
    borderRadius: '50%',
    background: '#fff',
    transition: 'left .2s',
  }),
  btn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 11,
    fontWeight: 600,
    padding: '4px 12px',
    borderRadius: 6,
    border: '1px solid #dbe4f0',
    background: '#fff',
    cursor: 'pointer',
  },
  badge: (type) => ({
    fontSize: 10,
    fontWeight: 700,
    padding: '2px 6px',
    borderRadius: 4,
    background: type === 'AI' ? '#e0e7ff' : '#dcfce7',
    color: type === 'AI' ? '#6366f1' : '#166534',
  }),
  runningPill: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '3px 8px',
    borderRadius: 999,
    fontSize: 10,
    fontWeight: 700,
    background: '#dbeafe',
    color: '#1d4ed8',
  },
};

export function AgentSettingsContent() {
  const [configs, setConfigs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);
  const [startingAgents, setStartingAgents] = useState([]);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);

    try {
      const res = await api.get('/erp/agents/config');
      setConfigs(res.data?.data || []);
    } catch (err) {
      showError(err, 'Could not load agent configs');
      setConfigs([]);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const hasRunningAgents = useMemo(
    () => startingAgents.length > 0 || configs.some((config) => config.is_running),
    [configs, startingAgents]
  );

  useEffect(() => {
    if (!hasRunningAgents) return undefined;

    const intervalId = window.setInterval(() => {
      load({ silent: true });
    }, 5000);

    return () => window.clearInterval(intervalId);
  }, [hasRunningAgents, load]);

  const isAgentRunning = useCallback(
    (agentKey) => startingAgents.includes(agentKey) || configs.some((config) => config.agent_key === agentKey && config.is_running),
    [configs, startingAgents]
  );

  const handleToggle = async (agentKey, currentEnabled) => {
    setSaving(agentKey);
    try {
      await api.put(`/erp/agents/config/${agentKey}`, { enabled: !currentEnabled });
      setConfigs((prev) =>
        prev.map((config) => (
          config.agent_key === agentKey ? { ...config, enabled: !currentEnabled } : config
        ))
      );
    } catch (err) {
      showError(err, 'Could not update agent setting');
    } finally {
      setSaving(null);
    }
  };

  const handleNotifyChange = async (agentKey, role, checked) => {
    const config = configs.find((entry) => entry.agent_key === agentKey);
    const current = config?.notify_roles || ['president'];
    const updated = checked
      ? [...new Set([...current, role])]
      : current.filter((item) => item !== role);

    setSaving(agentKey);
    try {
      await api.put(`/erp/agents/config/${agentKey}`, { notify_roles: updated });
      setConfigs((prev) =>
        prev.map((entry) => (
          entry.agent_key === agentKey ? { ...entry, notify_roles: updated } : entry
        ))
      );
    } catch (err) {
      showError(err, 'Could not update notification settings');
    } finally {
      setSaving(null);
    }
  };

  const handleRunNow = async (agentKey) => {
    if (isAgentRunning(agentKey)) return;

    setStartingAgents((prev) => [...new Set([...prev, agentKey])]);
    try {
      const res = await api.post(`/erp/agents/run/${agentKey}`);
      showSuccess(res.data?.message || `Agent "${agentKey}" started in background`);
      await load({ silent: true });
    } catch (err) {
      showError(err, `Agent "${agentKey}" failed`);
    } finally {
      setStartingAgents((prev) => prev.filter((key) => key !== agentKey));
    }
  };

  const freeAgents = Object.keys(AGENT_META).filter((key) => AGENT_META[key].type === 'Free');
  const aiAgents = Object.keys(AGENT_META).filter((key) => AGENT_META[key].type === 'AI');

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
            {agentKeys.map((key) => {
              const meta = AGENT_META[key];
              const config = configs.find((entry) => entry.agent_key === key) || {
                enabled: true,
                notify_roles: ['president'],
                is_running: false,
              };
              const running = isAgentRunning(key);
              const disabledForSave = saving === key;

              return (
                <tr key={key}>
                  <td style={styles.td}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <div style={{ fontWeight: 600 }}>{meta.label}</div>
                      {running && (
                        <span style={styles.runningPill}>
                          <Clock style={{ width: 11, height: 11 }} />
                          Running
                        </span>
                      )}
                    </div>
                    <span style={styles.badge(meta.type)}>{meta.type === 'AI' ? 'AI' : 'FREE'}</span>
                  </td>
                  <td style={styles.td}>
                    <span style={{ fontSize: 12, color: '#64748b', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <Clock style={{ width: 12, height: 12 }} />
                      {meta.schedule}
                    </span>
                  </td>
                  <td style={styles.td}>
                    <button
                      style={styles.toggle(config.enabled)}
                      onClick={() => handleToggle(key, config.enabled)}
                      disabled={disabledForSave}
                      title={config.enabled ? 'Enabled for scheduled runs' : 'Disabled for scheduled runs'}
                    >
                      <div style={styles.toggleDot(config.enabled)} />
                    </button>
                  </td>
                  <td style={styles.td}>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {NOTIFY_OPTIONS.map((role) => (
                        <label key={role} style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 3, cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={(config.notify_roles || []).includes(role)}
                            onChange={(event) => handleNotifyChange(key, role, event.target.checked)}
                            disabled={disabledForSave}
                            style={{ width: 'auto' }}
                          />
                          {role}
                        </label>
                      ))}
                    </div>
                  </td>
                  <td style={styles.td}>
                    <button
                      style={{
                        ...styles.btn,
                        color: running ? '#1d4ed8' : '#1e5eff',
                        background: running ? '#eff6ff' : '#fff',
                        cursor: running ? 'not-allowed' : 'pointer',
                      }}
                      onClick={() => handleRunNow(key)}
                      disabled={running}
                    >
                      {running ? (
                        <>
                          <Clock style={{ width: 12, height: 12 }} />
                          Running...
                        </>
                      ) : (
                        <>
                          <Play style={{ width: 12, height: 12 }} />
                          Run Now
                        </>
                      )}
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

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Loading agent configuration...</div>;
  }

  return (
    <div style={styles.panel}>
      <h2 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 8px' }}>Agent Intelligence</h2>
      <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 6px' }}>
        Enable or disable scheduled runs, configure who receives notifications, or trigger an instant run.
      </p>
      <p style={{ fontSize: 12, color: '#94a3b8', margin: '0 0 20px' }}>
        Disabled agents are skipped by the scheduler, but you can still start them manually with Run Now.
      </p>
      {renderTable(freeAgents, 'Rule-Based Agents', <Bot size={16} style={{ color: '#10b981' }} />)}
      {renderTable(aiAgents, 'Claude AI Agents', <Zap size={16} style={{ color: '#6366f1' }} />)}
    </div>
  );
}

export default function AgentSettings() {
  return <AgentSettingsContent />;
}
