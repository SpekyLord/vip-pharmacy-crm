/**
 * VarianceAlertCenter — Phase SG-5 #27
 *
 * Lists every KPI variance alert fired by kpiVarianceAgent. BDMs see their own;
 * managers/admin/finance/president see the full queue. "Resolve" marks the
 * alert acknowledged (not a financial op — no approval gate). Cooldown windows
 * (VARIANCE_ALERT_COOLDOWN_DAYS) and digest window (VARIANCE_ALERT_DIGEST_
 * WINDOW_DAYS) are lookup-driven — admins retune from Control Center without
 * restart.
 */
import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import useSalesGoals from '../hooks/useSalesGoals';
import WorkflowGuide from '../components/WorkflowGuide';
import { useAuth } from '../../hooks/useAuth';
import { showError, showSuccess } from '../utils/errorToast';

const styles = `
  .va-main { flex: 1; min-width: 0; overflow-y: auto; padding: 20px; max-width: 1400px; margin: 0 auto; }
  .va-header { margin-bottom: 18px; }
  .va-header h1 { font-size: 22px; color: var(--erp-text); margin: 0 0 4px; }
  .va-header p { color: var(--erp-muted); font-size: 13px; margin: 0; }
  .va-stats-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; margin-bottom: 16px; }
  .va-stat { background: var(--erp-panel,#fff); border: 1px solid var(--erp-border); border-radius: 12px; padding: 14px; }
  .va-stat-label { font-size: 11px; color: var(--erp-muted); text-transform: uppercase; font-weight: 600; margin-bottom: 4px; }
  .va-stat-value { font-size: 22px; font-weight: 700; color: var(--erp-text); }
  .va-stat-sub { font-size: 11px; color: var(--erp-muted); margin-top: 4px; }
  .va-panel { background: var(--erp-panel,#fff); border: 1px solid var(--erp-border); border-radius: 14px; padding: 18px; margin-bottom: 14px; }
  .va-filters { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 12px; }
  .va-filters select, .va-filters input { padding: 7px 10px; border: 1px solid var(--erp-border); border-radius: 8px; font-size: 13px; background: var(--erp-panel,#fff); color: var(--erp-text); }
  .va-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .va-table th { text-align: left; padding: 8px 10px; background: var(--erp-accent-soft,#eef2ff); font-weight: 600; font-size: 12px; color: var(--erp-text); white-space: nowrap; }
  .va-table td { padding: 8px 10px; border-top: 1px solid var(--erp-border); white-space: nowrap; color: var(--erp-text); }
  .va-table td.num { text-align: right; font-variant-numeric: tabular-nums; }
  .va-severity { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 700; text-transform: uppercase; }
  .va-severity.warning { background: #fef3c7; color: #92400e; }
  .va-severity.critical { background: #fee2e2; color: #991b1b; }
  .va-status { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 600; }
  .va-status.open { background: #e0f2fe; color: #075985; }
  .va-status.resolved { background: #dcfce7; color: #166534; }
  .va-btn { padding: 6px 12px; border: none; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; background: var(--erp-accent,#2563eb); color: #fff; }
  .va-btn.secondary { background: #f3f4f6; color: var(--erp-text); border: 1px solid var(--erp-border); }
  .va-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .loading, .empty { text-align: center; padding: 30px; color: var(--erp-muted); font-size: 13px; }
  @media(max-width: 360px) {
    .va-main { padding: 8px; }
    .va-panel { padding: 12px; }
    .va-btn { width: 100%; padding: 8px 12px; }
    .va-table th, .va-table td { padding: 5px; font-size: 11px; }
  }
`;

function formatDate(d) {
  if (!d) return '';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return '';
  return dt.toLocaleString('en-PH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function VarianceAlertCenter() {
  const sg = useSalesGoals();
  const { user } = useAuth();
  const isPrivileged = user?.role === 'admin' || user?.role === 'president' || user?.role === 'finance';

  const [rows, setRows] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('OPEN');
  const [severityFilter, setSeverityFilter] = useState('');
  const [kpiFilter, setKpiFilter] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (statusFilter) params.status = statusFilter;
      if (severityFilter) params.severity = severityFilter;
      if (kpiFilter) params.kpi_code = kpiFilter;
      params.limit = 100;

      const [listRes, statsRes] = await Promise.all([
        sg.listVarianceAlerts(params),
        sg.getVarianceAlertStats({}),
      ]);
      setRows(Array.isArray(listRes?.data) ? listRes.data : []);
      setStats(statsRes?.data || null);
    } catch (err) {
      showError(err, 'Failed to load variance alerts');
    }
    setLoading(false);
  }, [statusFilter, severityFilter, kpiFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  const handleResolve = async (alertId) => {
    const note = window.prompt('Resolution note (optional):', '');
    if (note === null) return; // cancel
    try {
      await sg.resolveVarianceAlert(alertId, { note });
      showSuccess('Alert resolved');
      load();
    } catch (err) {
      showError(err, 'Failed to resolve alert');
    }
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <style>{styles}</style>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <Navbar />
        <main className="va-main">
          <div className="va-header">
            <h1>Variance Alert Center</h1>
            <p>KPI deviations flagged by the weekly agent. {isPrivileged ? 'Viewing all BDMs.' : 'Viewing your own alerts.'}</p>
            <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
              <Link to="/erp/sales-goals" style={{ fontSize: 13, color: 'var(--erp-accent)' }}>← Goal Dashboard</Link>
              <Link to="/erp/control-center?section=lookups" style={{ fontSize: 13, color: 'var(--erp-accent)' }}>Tune Thresholds (Control Center)</Link>
            </div>
          </div>

          <WorkflowGuide pageKey="varianceAlertCenter" />

          {stats && (
            <div className="va-stats-row">
              <div className="va-stat">
                <div className="va-stat-label">Open Critical</div>
                <div className="va-stat-value" style={{ color: '#991b1b' }}>{stats.open?.critical || 0}</div>
                <div className="va-stat-sub">Immediate attention</div>
              </div>
              <div className="va-stat">
                <div className="va-stat-label">Open Warning</div>
                <div className="va-stat-value" style={{ color: '#92400e' }}>{stats.open?.warning || 0}</div>
                <div className="va-stat-sub">Trending unfavorable</div>
              </div>
              <div className="va-stat">
                <div className="va-stat-label">Total Open</div>
                <div className="va-stat-value">{stats.total_open || 0}</div>
              </div>
              <div className="va-stat">
                <div className="va-stat-label">Total Resolved</div>
                <div className="va-stat-value" style={{ color: '#166534' }}>{stats.total_resolved || 0}</div>
              </div>
            </div>
          )}

          <div className="va-panel">
            <div className="va-filters">
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                <option value="">All statuses</option>
                <option value="OPEN">Open</option>
                <option value="RESOLVED">Resolved</option>
              </select>
              <select value={severityFilter} onChange={e => setSeverityFilter(e.target.value)}>
                <option value="">All severities</option>
                <option value="critical">Critical</option>
                <option value="warning">Warning</option>
              </select>
              <input type="text" placeholder="KPI code (e.g. PCT_HOSP_ACCREDITED)" value={kpiFilter}
                onChange={e => setKpiFilter(e.target.value)} style={{ minWidth: 240 }} />
              <button className="va-btn secondary" onClick={load} disabled={loading}>
                {loading ? 'Loading…' : 'Refresh'}
              </button>
            </div>

            {loading && <div className="loading">Loading alerts…</div>}

            {!loading && rows.length === 0 && (
              <div className="empty">No alerts match the current filters.</div>
            )}

            {!loading && rows.length > 0 && (
              <div style={{ overflowX: 'auto' }}>
                <table className="va-table">
                  <thead>
                    <tr>
                      <th>Fired</th>
                      <th>Status</th>
                      <th>Severity</th>
                      <th>BDM</th>
                      <th>Plan / Period</th>
                      <th>KPI</th>
                      <th className="num">Actual</th>
                      <th className="num">Target</th>
                      <th className="num">Deviation</th>
                      <th className="num">Threshold</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(r => (
                      <tr key={r._id}>
                        <td>{formatDate(r.fired_at)}</td>
                        <td><span className={`va-status ${String(r.status).toLowerCase()}`}>{r.status}</span></td>
                        <td><span className={`va-severity ${String(r.severity).toLowerCase()}`}>{r.severity}</span></td>
                        <td>{r.person_id?.full_name || '—'}{r.person_id?.bdm_code ? ` (${r.person_id.bdm_code})` : ''}</td>
                        <td>{r.plan_id?.reference || r.plan_id?.plan_name || ''} · {r.period}</td>
                        <td>{r.kpi_label || r.kpi_code}</td>
                        <td className="num">{Number(r.actual_value || 0).toLocaleString()}</td>
                        <td className="num">{Number(r.target_value || 0).toLocaleString()}</td>
                        <td className="num" style={{ color: r.severity === 'critical' ? '#991b1b' : '#92400e', fontWeight: 600 }}>
                          {(Number(r.deviation_pct) || 0).toFixed(1)}%
                        </td>
                        <td className="num">{(Number(r.threshold_pct) || 0).toFixed(0)}%</td>
                        <td>
                          {r.status === 'OPEN' ? (
                            <button className="va-btn" onClick={() => handleResolve(r._id)}>Resolve</button>
                          ) : (
                            <span style={{ fontSize: 11, color: 'var(--erp-muted)' }}>
                              {r.resolved_by?.name ? `by ${r.resolved_by.name}` : 'Resolved'}
                              {r.resolved_at ? ` · ${formatDate(r.resolved_at)}` : ''}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
