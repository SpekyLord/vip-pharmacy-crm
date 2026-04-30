/**
 * SoxControlMatrix — Phase SG-6 #29
 *
 * Admin-facing page that enumerates every Sales Goal state change + who can
 * perform it + what's logged. Reads LIVE config from MODULE_DEFAULT_ROLES /
 * ERP_SUB_PERMISSIONS / APPROVAL_MODULE / APPROVAL_CATEGORY lookups plus
 * ErpAuditLog activity in a configurable window. Generates a printable
 * PDF via the browser (or puppeteer if PDF_RENDERER.BINARY_ENABLED is on).
 *
 * Wiring:
 *   Backend: GET /api/erp/sales-goals/sox-control-matrix[?window_days=]
 *   Print:   GET /api/erp/sales-goals/sox-control-matrix/print[?window_days=&format=pdf|html]
 *   Hook:    useSalesGoals().getSoxControlMatrix(params) / soxControlMatrixPrintUrl(params)
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import useSalesGoals from '../hooks/useSalesGoals';
import WorkflowGuide from '../components/WorkflowGuide';
import { showError } from '../utils/errorToast';

const styles = `
  .sox-page { background: var(--erp-bg, #f4f7fb); min-height: 100vh; }
  .sox-main { flex: 1; min-width: 0; padding: 20px; max-width: 1440px; margin: 0 auto; }
  .sox-header { margin-bottom: 18px; }
  .sox-header h1 { font-size: 22px; color: var(--erp-text); margin: 0 0 4px; }
  .sox-header p { color: var(--erp-muted); font-size: 13px; margin: 0; }
  .sox-panel { background: var(--erp-panel,#fff); border: 1px solid var(--erp-border,#e5e7eb); border-radius: 14px; padding: 18px; margin-bottom: 14px; }
  .sox-panel h3 { margin: 0 0 12px; font-size: 15px; font-weight: 700; color: var(--erp-text); }
  .sox-summary-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 10px; margin-bottom: 14px; }
  .sox-card { background: var(--erp-panel,#fff); border: 1px solid var(--erp-border); border-radius: 10px; padding: 12px; }
  .sox-card-label { font-size: 11px; color: var(--erp-muted); text-transform: uppercase; font-weight: 600; margin-bottom: 4px; }
  .sox-card-value { font-size: 20px; font-weight: 700; color: var(--erp-text); }
  .sox-card.warn .sox-card-value { color: #b91c1c; }
  .sox-controls-row { display: flex; gap: 12px; margin-bottom: 14px; align-items: flex-end; flex-wrap: wrap; }
  .sox-field label { display: block; font-size: 11px; color: var(--erp-muted); text-transform: uppercase; font-weight: 600; margin-bottom: 4px; }
  .sox-field input { width: 120px; padding: 8px 10px; border: 1px solid var(--erp-border); border-radius: 8px; font-size: 13px; background: var(--erp-panel,#fff); color: var(--erp-text); }
  .sox-btn { padding: 9px 16px; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; background: var(--erp-accent,#2563eb); color: #fff; }
  .sox-btn.secondary { background: #f3f4f6; color: var(--erp-text); border: 1px solid var(--erp-border); }
  .sox-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .sox-table { width: 100%; border-collapse: collapse; font-size: 12px; }
  .sox-table th { text-align: left; padding: 8px; background: var(--erp-accent-soft,#eef2ff); font-weight: 700; color: var(--erp-text); white-space: nowrap; font-size: 11px; text-transform: uppercase; }
  .sox-table td { padding: 8px; border-top: 1px solid var(--erp-border); vertical-align: top; color: var(--erp-text); }
  .sox-table tbody tr:hover { background: var(--erp-bg-hover, #fafbfd); }
  .sox-table .num { text-align: right; font-variant-numeric: tabular-nums; }
  .sox-badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 600; }
  .sox-badge.open { background: #dcfce7; color: #166534; }
  .sox-badge.roles { background: #dbeafe; color: #1e40af; }
  .sox-badge.danger { background: #fee2e2; color: #991b1b; }
  .sox-badge.auto { background: #fef3c7; color: #92400e; }
  .sox-badge.flat { background: #f3f4f6; color: #4b5563; }
  .loading { text-align: center; padding: 30px; color: var(--erp-muted); }
  .sox-actor-list { font-size: 11px; color: var(--erp-muted); }
  .sox-actor-list > span { display: block; }
  .sox-source { font-size: 10px; color: var(--erp-muted); margin-top: 2px; font-family: monospace; }
  .sox-notice { background: #eff6ff; border: 1px solid #bfdbfe; color: #1e40af; padding: 10px 14px; border-radius: 10px; font-size: 13px; margin-bottom: 14px; }
  @media(max-width: 768px) {
    .sox-main { padding: 12px; }
    .sox-panel { padding: 12px; }
    .sox-controls-row { flex-direction: column; align-items: stretch; }
    .sox-field input { width: 100%; }
    .sox-table { font-size: 11px; }
    .sox-table th, .sox-table td { padding: 6px; }
  }
  @media(max-width: 360px) {
    .sox-main { padding: 8px; }
    .sox-btn { width: 100%; padding: 10px 14px; }
    .sox-card-value { font-size: 16px; }
  }
`;

function rolesBadge(row) {
  if (row.allowed_roles === null && row.module_default_roles_code) {
    return <span className="sox-badge open">OPEN (no role gate)</span>;
  }
  if (Array.isArray(row.allowed_roles) && row.allowed_roles.length > 0) {
    return <span className="sox-badge roles">{row.allowed_roles.join(', ')}</span>;
  }
  if (row.automatic) return <span className="sox-badge auto">Automatic (system)</span>;
  if (!row.module_default_roles_code) return <span className="sox-badge flat">n/a</span>;
  return <span className="sox-badge danger">(unseeded)</span>;
}

export default function SoxControlMatrix() {
  const sg = useSalesGoals();

  const [windowDays, setWindowDays] = useState(90);
  const [matrix, setMatrix] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (days) => {
    setLoading(true);
    try {
      const res = await sg.getSoxControlMatrix({ window_days: days });
      setMatrix(res?.data || null);
    } catch (err) {
      showError(err, 'Failed to load SOX control matrix');
      setMatrix(null);
    }
    setLoading(false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(windowDays); }, [load]); // eslint-disable-line

  const applyWindow = () => {
    const n = Math.min(Math.max(Number(windowDays) || 90, 1), 365);
    setWindowDays(n);
    load(n);
  };

  const openPrint = () => {
    const url = sg.soxControlMatrixPrintUrl({ window_days: windowDays });
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  // Memoize the array projections so downstream useMemo/useCallback deps
  // stay stable across renders when `matrix` hasn't changed. Otherwise
  // `matrix?.controls || []` creates a fresh [] on every render and defeats
  // the dep array (react-hooks/exhaustive-deps lint warning).
  const controls = useMemo(() => matrix?.controls || [], [matrix]);
  const violations = useMemo(() => matrix?.segregation_violations || [], [matrix]);
  const events = useMemo(() => matrix?.integration_events || [], [matrix]);

  const dangerCount = useMemo(
    () => controls.filter(c => c.is_danger).length,
    [controls]
  );

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <style>{styles}</style>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <Navbar />
        <main className="sox-main">
          <div className="sox-header">
            <h1>SOX Control Matrix</h1>
            <p>Every Sales Goal state change, who can perform it, and what&apos;s logged — live from lookups + audit.</p>
            <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
              <Link to="/erp/sales-goals" style={{ fontSize: 13, color: 'var(--erp-accent)' }}>← Goal Dashboard</Link>
              <Link to="/erp/control-center?section=lookups" style={{ fontSize: 13, color: 'var(--erp-accent)' }}>Lookup Tables</Link>
              <Link to="/erp/approvals" style={{ fontSize: 13, color: 'var(--erp-accent)' }}>Approval Hub</Link>
            </div>
          </div>

          <WorkflowGuide pageKey="soxControlMatrix" />

          <div className="sox-controls-row">
            <div className="sox-field">
              <label>Audit window (days)</label>
              <input type="number" min="1" max="365" value={windowDays}
                onChange={e => setWindowDays(e.target.value)} />
            </div>
            <button className="sox-btn" onClick={applyWindow} disabled={loading}>
              {loading ? 'Loading…' : 'Refresh'}
            </button>
            <button className="sox-btn secondary" onClick={openPrint} disabled={!matrix}>
              Print / Save as PDF
            </button>
          </div>

          {loading && !matrix && <div className="loading">Loading SOX control matrix…</div>}

          {matrix && (
            <>
              <div className="sox-summary-row">
                <div className="sox-card">
                  <div className="sox-card-label">Controls</div>
                  <div className="sox-card-value">{matrix.totals.controls}</div>
                </div>
                <div className="sox-card">
                  <div className="sox-card-label">Audit entries (window)</div>
                  <div className="sox-card-value">{matrix.totals.audit_entries}</div>
                </div>
                <div className={`sox-card ${matrix.totals.sod_violations > 0 ? 'warn' : ''}`}>
                  <div className="sox-card-label">Segregation findings</div>
                  <div className="sox-card-value">{matrix.totals.sod_violations}</div>
                </div>
                <div className="sox-card">
                  <div className="sox-card-label">Plans tracked</div>
                  <div className="sox-card-value">{matrix.totals.plans}</div>
                </div>
                <div className="sox-card">
                  <div className="sox-card-label">Payouts tracked</div>
                  <div className="sox-card-value">{matrix.totals.payouts}</div>
                </div>
                <div className="sox-card">
                  <div className="sox-card-label">Danger controls</div>
                  <div className="sox-card-value">{dangerCount}</div>
                </div>
              </div>

              <div className="sox-notice">
                Matrix window: {windowDays} days (since {new Date(matrix.window_start).toLocaleDateString()}). Live config is read from MODULE_DEFAULT_ROLES, ERP_SUB_PERMISSIONS, APPROVAL_MODULE, APPROVAL_CATEGORY — edit those in Control Center → Lookup Tables to change authorization without a code change.
              </div>

              <div className="sox-panel">
                <h3>Control Matrix</h3>
                <div style={{ overflowX: 'auto' }}>
                  <table className="sox-table">
                    <thead>
                      <tr>
                        <th>Control</th>
                        <th>Description</th>
                        <th>Allowed Roles (live)</th>
                        <th>Approval Category</th>
                        <th>Sub-Permission</th>
                        <th className="num">Activity</th>
                        <th>Actors (window)</th>
                        <th>Event Emitted</th>
                      </tr>
                    </thead>
                    <tbody>
                      {controls.map(row => (
                        <tr key={row.op}>
                          <td>
                            <strong>{row.label}</strong>
                            <div className="sox-source">{row.op}</div>
                          </td>
                          <td>{row.description}</td>
                          <td>
                            {rolesBadge(row)}
                            {row.allowed_roles_source && <div className="sox-source">{row.allowed_roles_source}</div>}
                          </td>
                          <td>{row.approval_category || <span className="sox-badge flat">—</span>}</td>
                          <td>
                            {row.sub_permission_key || <span className="sox-badge flat">—</span>}
                            {row.is_danger && <div><span className="sox-badge danger">DANGER</span></div>}
                          </td>
                          <td className="num">{row.activity_count}</td>
                          <td>
                            <div className="sox-actor-list">
                              {row.actors.length === 0 && <em>No activity</em>}
                              {row.actors.slice(0, 5).map(a => (
                                <span key={a.user_id}>
                                  {a.name}{a.role ? ` (${a.role})` : ''} × {a.count}
                                </span>
                              ))}
                              {row.actors.length > 5 && <span><em>+{row.actors.length - 5} more</em></span>}
                            </div>
                          </td>
                          <td>{row.event_emitted || <span className="sox-badge flat">—</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="sox-panel">
                <h3>Segregation-of-Duties Findings</h3>
                <p style={{ fontSize: 12, color: 'var(--erp-muted)', marginTop: 0 }}>
                  Flags any user who both CREATED and POSTED/APPROVED/PAID/REVERSED the same document within the window. In a small team this may be legitimate — acknowledge knowingly.
                </p>
                {violations.length === 0 ? (
                  <div style={{ color: '#16a34a', fontSize: 13, padding: 10 }}>
                    ✓ No segregation-of-duties conflicts detected in the last {windowDays} days.
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table className="sox-table">
                      <thead>
                        <tr>
                          <th>Target Model</th>
                          <th>Document</th>
                          <th>Actor</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {violations.map((v, i) => (
                          <tr key={`${v.target_model}-${v.target_ref}-${v.user_id}-${i}`}>
                            <td>{v.target_model}</td>
                            <td><code style={{ fontSize: 11 }}>{v.target_ref}</code></td>
                            <td>{v.name}{v.role && <span className="sox-source">{v.role}</span>}</td>
                            <td>{v.actions.map(a => (
                              <span key={a} className="sox-badge danger" style={{ marginRight: 4 }}>{a}</span>
                            ))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="sox-panel">
                <h3>Integration Event Registry</h3>
                <p style={{ fontSize: 12, color: 'var(--erp-muted)', marginTop: 0 }}>
                  Lookup-driven event bus (Phase SG-6 #32). Subscribers register in-process listeners — Sales Goal never imports consumers. Admins see this registry to confirm which modules are wired.
                </p>
                <div style={{ overflowX: 'auto' }}>
                  <table className="sox-table">
                    <thead>
                      <tr>
                        <th>Code</th>
                        <th>Label</th>
                        <th className="num">Listeners</th>
                        <th>Enabled</th>
                        <th>Description</th>
                      </tr>
                    </thead>
                    <tbody>
                      {events.map(e => (
                        <tr key={e.code}>
                          <td><code style={{ fontSize: 11 }}>{e.code}</code></td>
                          <td>{e.label}</td>
                          <td className="num">
                            {e.listener_count}
                            {e.listener_count === 0 && <div><span className="sox-badge flat">none yet</span></div>}
                          </td>
                          <td>{e.enabled ? <span className="sox-badge open">Yes</span> : <span className="sox-badge danger">No</span>}</td>
                          <td style={{ fontSize: 11, color: 'var(--erp-muted)' }}>{e.description}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {!loading && !matrix && (
            <div className="sox-panel">
              <p>Failed to load the control matrix. Refresh to try again.</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
