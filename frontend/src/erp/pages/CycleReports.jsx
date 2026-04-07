/**
 * Cycle Reports Page — Phase 15.3
 * GENERATED -> REVIEWED -> BDM_CONFIRMED -> CREDITED workflow
 */
import { useState, useEffect, useCallback } from 'react';
import { showError } from '../utils/errorToast';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import { useAuth } from '../../hooks/useAuth';
import useReports from '../hooks/useReports';
import WorkflowGuide from '../components/WorkflowGuide';

import SelectField from '../../components/common/Select';

const pageStyles = `
  .cr-page { background: var(--erp-bg, #f4f7fb); min-height: 100vh; }
  .cr-main { flex: 1; min-width: 0; overflow-y: auto; padding: 20px; max-width: 1200px; margin: 0 auto; }
  .cr-header h1 { font-size: 22px; color: var(--erp-text); margin: 0 0 4px; }
  .cr-header p { color: var(--erp-muted); font-size: 13px; margin: 0 0 16px; }
  .controls { display: flex; gap: 10px; align-items: center; margin-bottom: 16px; flex-wrap: wrap; }
  .controls input, .controls select { padding: 8px 12px; border: 1px solid var(--erp-border); border-radius: 8px; font-size: 13px; background: var(--erp-panel); color: var(--erp-text); }
  .btn { padding: 8px 16px; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; }
  .btn-primary { background: #2563eb; color: white; }
  .btn-success { background: #16a34a; color: white; }
  .btn-warning { background: #d97706; color: white; }
  .btn-sm { padding: 5px 10px; font-size: 12px; }
  .btn:disabled { opacity: 0.5; }
  .panel { background: var(--erp-panel); border: 1px solid var(--erp-border); border-radius: 14px; padding: 20px; margin-bottom: 16px; overflow-x: auto; }
  .data-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .data-table th { text-align: left; padding: 8px 10px; background: var(--erp-accent-soft); font-weight: 600; }
  .data-table td { padding: 8px 10px; border-top: 1px solid var(--erp-border); }
  .data-table td.num { text-align: right; font-variant-numeric: tabular-nums; }
  .badge { display: inline-block; padding: 3px 8px; border-radius: 6px; font-size: 11px; font-weight: 600; }
  .loading { text-align: center; padding: 40px; color: var(--erp-muted); }
  @media(max-width: 768px) { .cr-main { padding: 12px; } }
`;

function fmt(n) { return '\u20B1' + (n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function getCurrentPeriod() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); }
function fmtDate(d) { return d ? new Date(d).toLocaleDateString() : '-'; }

const STATUS_COLORS = {
  GENERATED: { bg: '#dbeafe', text: '#1e40af' },
  REVIEWED: { bg: '#fef3c7', text: '#92400e' },
  BDM_CONFIRMED: { bg: '#d1fae5', text: '#065f46' },
  CREDITED: { bg: '#dcfce7', text: '#166534' }
};

export default function CycleReports() {
  const { user } = useAuth();
  const rpt = useReports();
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({ period: getCurrentPeriod(), status: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filters.period) params.period = filters.period;
      if (filters.status) params.status = filters.status;
      const res = await rpt.getCycleReports(params);
      setReports(res?.data || []);
    } catch (err) { console.error('[CycleReports] load error:', err.message); }
    setLoading(false);
  }, [filters]);

  useEffect(() => { load(); }, []);

  const handleAction = async (id, action, extraData = {}) => {
    try {
      if (action === 'review') await rpt.reviewCycleReport(id, extraData);
      else if (action === 'confirm') await rpt.confirmCycleReport(id, extraData);
      else if (action === 'credit') await rpt.creditCycleReport(id, extraData);
      load();
    } catch (err) { showError(err, 'Could not process cycle report'); }
  };

  return (
    <div className="cr-page">
      <style>{pageStyles}</style>
      <Navbar />
      <div style={{ display: 'flex' }}>
        <Sidebar />
        <div className="cr-main">
          <div className="cr-header">
            <h1>Cycle Reports</h1>
            <p>Generate, review, confirm, and credit cycle reports</p>
          </div>
          <WorkflowGuide pageKey="cycle-reports" />

          <div className="controls">
            <input type="month" value={filters.period} onChange={e => setFilters(f => ({ ...f, period: e.target.value }))} />
            <SelectField value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}>
              <option value="">All Status</option>
              <option value="GENERATED">Generated</option>
              <option value="REVIEWED">Reviewed</option>
              <option value="BDM_CONFIRMED">BDM Confirmed</option>
              <option value="CREDITED">Credited</option>
            </SelectField>
            <button className="btn btn-primary" onClick={load} disabled={loading}>Load</button>
          </div>

          {loading && <div className="loading">Loading...</div>}

          <div className="panel">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Period</th><th>Cycle</th>
                  <th style={{ textAlign: 'right' }}>Sales</th>
                  <th style={{ textAlign: 'right' }}>Collections</th>
                  <th style={{ textAlign: 'right' }}>Expenses</th>
                  <th style={{ textAlign: 'right' }}>Net Income</th>
                  <th>Status</th><th>Last Updated</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {reports.map(r => {
                  const c = STATUS_COLORS[r.status] || STATUS_COLORS.GENERATED;
                  return (
                    <tr key={r._id}>
                      <td style={{ fontWeight: 600 }}>{r.period}</td>
                      <td>{r.cycle}</td>
                      <td className="num">{fmt(r.sales_total)}</td>
                      <td className="num">{fmt(r.collections_total)}</td>
                      <td className="num">{fmt(r.expenses_total)}</td>
                      <td className="num" style={{ fontWeight: 700, color: r.net_income >= 0 ? '#16a34a' : '#dc2626' }}>{fmt(r.net_income)}</td>
                      <td><span className="badge" style={{ background: c.bg, color: c.text }}>{r.status}</span></td>
                      <td>{fmtDate(r.credited_at || r.bdm_confirmed_at || r.reviewed_at || r.generated_at)}</td>
                      <td style={{ display: 'flex', gap: 4 }}>
                        {r.status === 'GENERATED' && <button className="btn btn-warning btn-sm" onClick={() => handleAction(r._id, 'review')}>Review</button>}
                        {r.status === 'REVIEWED' && <button className="btn btn-primary btn-sm" onClick={() => handleAction(r._id, 'confirm')}>Confirm</button>}
                        {r.status === 'BDM_CONFIRMED' && <button className="btn btn-success btn-sm" onClick={() => handleAction(r._id, 'credit')}>Credit</button>}
                      </td>
                    </tr>
                  );
                })}
                {reports.length === 0 && !loading && (
                  <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--erp-muted)' }}>No cycle reports found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
