/**
 * Cycle Status Dashboard — Phase 14.7
 * Per-BDM payslip cycle progress tracking
 */
import { useState, useCallback } from 'react';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import { useAuth } from '../../hooks/useAuth';
import useReports from '../hooks/useReports';

const pageStyles = `
  .cycle-page { background: var(--erp-bg, #f4f7fb); min-height: 100vh; }
  .cycle-main { flex: 1; min-width: 0; overflow-y: auto; padding: 20px; max-width: 1200px; margin: 0 auto; }
  .cycle-header h1 { font-size: 22px; color: var(--erp-text); margin: 0 0 4px; }
  .cycle-header p { color: var(--erp-muted); font-size: 13px; margin: 0 0 16px; }
  .controls { display: flex; gap: 10px; align-items: center; margin-bottom: 16px; }
  .controls input { padding: 8px 12px; border: 1px solid var(--erp-border); border-radius: 8px; font-size: 13px; background: var(--erp-panel); color: var(--erp-text); }
  .btn { padding: 8px 16px; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; }
  .btn-primary { background: #2563eb; color: white; }
  .btn:disabled { opacity: 0.5; }
  .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(100px, 1fr)); gap: 10px; margin-bottom: 16px; }
  .summary-card { background: var(--erp-panel); border: 1px solid var(--erp-border); border-radius: 10px; padding: 14px; text-align: center; }
  .summary-card .value { font-size: 24px; font-weight: 700; color: var(--erp-text); }
  .summary-card .label { font-size: 10px; color: var(--erp-muted); text-transform: uppercase; margin-top: 2px; }
  .progress-bar { width: 100%; height: 24px; background: var(--erp-border); border-radius: 12px; overflow: hidden; margin-bottom: 16px; }
  .progress-fill { height: 100%; background: linear-gradient(90deg, #2563eb, #16a34a); border-radius: 12px; transition: width 0.3s; display: flex; align-items: center; justify-content: center; color: white; font-size: 12px; font-weight: 700; }
  .pipeline { display: flex; gap: 4px; margin-bottom: 16px; }
  .pipeline-step { flex: 1; text-align: center; padding: 10px 4px; border-radius: 8px; font-size: 11px; font-weight: 600; }
  .pipeline-step .count { font-size: 20px; font-weight: 700; display: block; margin-bottom: 2px; }
  .panel { background: var(--erp-panel); border: 1px solid var(--erp-border); border-radius: 14px; padding: 20px; overflow-x: auto; }
  .data-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .data-table th { text-align: left; padding: 8px 10px; background: var(--erp-accent-soft); font-weight: 600; }
  .data-table td { padding: 8px 10px; border-top: 1px solid var(--erp-border); }
  .badge { display: inline-block; padding: 3px 8px; border-radius: 6px; font-size: 11px; font-weight: 600; }
  .row-behind { background: rgba(239,68,68,0.06); }
  .loading { text-align: center; padding: 40px; color: var(--erp-muted); }
  @media(max-width: 768px) { .cycle-main { padding: 12px; } .pipeline { flex-wrap: wrap; } }
`;

const STATUS_COLORS = {
  NOT_STARTED: { bg: '#f1f5f9', text: '#475569' },
  DRAFT: { bg: '#e2e8f0', text: '#475569' },
  COMPUTED: { bg: '#dbeafe', text: '#1e40af' },
  REVIEWED: { bg: '#fef3c7', text: '#92400e' },
  APPROVED: { bg: '#d1fae5', text: '#065f46' },
  POSTED: { bg: '#dcfce7', text: '#166534' }
};

function getCurrentPeriod() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); }
function fmtDate(d) { return d ? new Date(d).toLocaleDateString() : '-'; }

export default function CycleStatusDashboard() {
  const { user } = useAuth();
  const rpt = useReports();
  const [period, setPeriod] = useState(getCurrentPeriod());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { const res = await rpt.getCycleStatus(period); setData(res?.data || null); } catch {}
    setLoading(false);
  }, [period]);

  const sc = data?.status_counts || {};

  return (
    <div className="cycle-page">
      <style>{pageStyles}</style>
      <Navbar />
      <div style={{ display: 'flex' }}>
        <Sidebar />
        <div className="cycle-main">
          <div className="cycle-header">
            <h1>Cycle Status Dashboard</h1>
            <p>Payslip cycle progress tracking by BDM</p>
          </div>

          <div className="controls">
            <input type="month" value={period} onChange={e => setPeriod(e.target.value)} />
            <button className="btn btn-primary" onClick={load} disabled={loading}>Load</button>
          </div>

          {loading && <div className="loading">Loading...</div>}

          {data && !loading && (
            <>
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${data.completion_pct}%` }}>
                  {data.completion_pct}% Complete
                </div>
              </div>

              <div className="pipeline">
                {['NOT_STARTED', 'DRAFT', 'COMPUTED', 'REVIEWED', 'APPROVED', 'POSTED'].map(s => {
                  const c = STATUS_COLORS[s];
                  const count = sc[s.toLowerCase()] || 0;
                  return (
                    <div key={s} className="pipeline-step" style={{ background: c.bg, color: c.text }}>
                      <span className="count">{count}</span>
                      {s.replace('_', ' ')}
                    </div>
                  );
                })}
              </div>

              {data.behind_schedule_list?.length > 0 && (
                <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 10, padding: '12px 16px', marginBottom: 16, fontSize: 13 }}>
                  <strong style={{ color: '#991b1b' }}>Behind Schedule ({data.behind_schedule_list.length}):</strong>{' '}
                  {data.behind_schedule_list.map(p => p.full_name).join(', ')}
                </div>
              )}

              <div className="panel">
                <table className="data-table">
                  <thead>
                    <tr><th>Name</th><th>Type</th><th>Status</th><th>Computed</th><th>Reviewed</th><th>Approved</th><th>Posted</th></tr>
                  </thead>
                  <tbody>
                    {(data.items || []).map(r => {
                      const c = STATUS_COLORS[r.payslip_status] || STATUS_COLORS.NOT_STARTED;
                      return (
                        <tr key={r.person_id} className={r.behind_schedule ? 'row-behind' : ''}>
                          <td style={{ fontWeight: 600 }}>{r.full_name}</td>
                          <td>{r.person_type}</td>
                          <td><span className="badge" style={{ background: c.bg, color: c.text }}>{r.payslip_status}</span></td>
                          <td>{fmtDate(r.computed_at)}</td>
                          <td>{fmtDate(r.reviewed_at)}</td>
                          <td>{fmtDate(r.approved_at)}</td>
                          <td>{fmtDate(r.posted_at)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
