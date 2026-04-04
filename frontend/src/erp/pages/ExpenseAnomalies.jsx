/**
 * Expense Anomalies Page — Phase 14.7
 * Period-over-period anomaly detection + budget overrun tracking
 */
import { useState, useCallback } from 'react';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import { useAuth } from '../../hooks/useAuth';
import useReports from '../hooks/useReports';

const pageStyles = `
  .anomaly-page { background: var(--erp-bg, #f4f7fb); min-height: 100vh; }
  .anomaly-main { flex: 1; min-width: 0; overflow-y: auto; padding: 20px; max-width: 1200px; margin: 0 auto; }
  .anomaly-header h1 { font-size: 22px; color: var(--erp-text); margin: 0 0 4px; }
  .anomaly-header p { color: var(--erp-muted); font-size: 13px; margin: 0 0 16px; }
  .controls { display: flex; gap: 10px; align-items: center; margin-bottom: 16px; flex-wrap: wrap; }
  .controls input { padding: 8px 12px; border: 1px solid var(--erp-border); border-radius: 8px; font-size: 13px; background: var(--erp-panel); color: var(--erp-text); }
  .btn { padding: 8px 16px; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; }
  .btn-primary { background: #2563eb; color: white; }
  .btn:disabled { opacity: 0.5; }
  .tab-bar { display: flex; gap: 2px; margin-bottom: 16px; background: var(--erp-border); border-radius: 10px; padding: 3px; }
  .tab-btn { flex: 1; padding: 8px 16px; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; background: transparent; color: var(--erp-muted); }
  .tab-btn.active { background: var(--erp-panel); color: var(--erp-accent); box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
  .panel { background: var(--erp-panel); border: 1px solid var(--erp-border); border-radius: 14px; padding: 20px; overflow-x: auto; }
  .data-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .data-table th { text-align: left; padding: 8px 10px; background: var(--erp-accent-soft); font-weight: 600; }
  .data-table td { padding: 8px 10px; border-top: 1px solid var(--erp-border); }
  .data-table td.num { text-align: right; font-variant-numeric: tabular-nums; }
  .badge { display: inline-block; padding: 3px 8px; border-radius: 6px; font-size: 11px; font-weight: 600; }
  .badge-alert { background: #fef2f2; color: #991b1b; }
  .badge-normal { background: #dcfce7; color: #166534; }
  .badge-over { background: #fef2f2; color: #991b1b; border: 1px solid #fca5a5; }
  .badge-within { background: #dbeafe; color: #1e40af; }
  .loading { text-align: center; padding: 40px; color: var(--erp-muted); }
  @media(max-width: 768px) { .anomaly-main { padding: 12px; } }
`;

function fmt(n) { return '\u20B1' + (n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function getCurrentPeriod() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); }

export default function ExpenseAnomalies() {
  const { user } = useAuth();
  const rpt = useReports();
  const [tab, setTab] = useState('anomalies');
  const [period, setPeriod] = useState(getCurrentPeriod());
  const [anomalyData, setAnomalyData] = useState(null);
  const [budgetData, setBudgetData] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (tab === 'anomalies') {
        const res = await rpt.getExpenseAnomalies(period);
        setAnomalyData(res?.data || null);
      } else {
        const res = await rpt.getBudgetOverruns(period);
        setBudgetData(res?.data || null);
      }
    } catch {}
    setLoading(false);
  }, [period, tab]);

  return (
    <div className="anomaly-page">
      <style>{pageStyles}</style>
      <Navbar />
      <div style={{ display: 'flex' }}>
        <Sidebar />
        <div className="anomaly-main">
          <div className="anomaly-header">
            <h1>Expense Anomalies</h1>
            <p>Detect period-over-period expense changes and budget overruns</p>
          </div>

          <div className="tab-bar">
            <button className={`tab-btn ${tab === 'anomalies' ? 'active' : ''}`} onClick={() => setTab('anomalies')}>Anomalies</button>
            <button className={`tab-btn ${tab === 'budget' ? 'active' : ''}`} onClick={() => setTab('budget')}>Budget Overruns</button>
          </div>

          <div className="controls">
            <input type="month" value={period} onChange={e => setPeriod(e.target.value)} />
            <button className="btn btn-primary" onClick={load} disabled={loading}>Load</button>
          </div>

          {loading && <div className="loading">Loading...</div>}

          {tab === 'anomalies' && anomalyData && !loading && (
            <div className="panel">
              <div style={{ fontSize: 12, color: 'var(--erp-muted)', marginBottom: 10 }}>
                Comparing {anomalyData.period} vs {anomalyData.prior_period} | Threshold: {anomalyData.threshold}%
              </div>
              <table className="data-table">
                <thead>
                  <tr><th>Person</th><th>Component</th><th style={{ textAlign: 'right' }}>Prior</th><th style={{ textAlign: 'right' }}>Current</th><th style={{ textAlign: 'right' }}>Change %</th><th>Flag</th></tr>
                </thead>
                <tbody>
                  {(anomalyData.anomalies || []).map((r, i) => (
                    <tr key={r.person_id + '-' + r.component}>
                      <td style={{ fontWeight: 600 }}>{r.person_name}</td>
                      <td>{r.component}</td>
                      <td className="num">{fmt(r.prior_amount)}</td>
                      <td className="num">{fmt(r.current_amount)}</td>
                      <td className="num" style={{ color: Math.abs(r.change_pct) > anomalyData.threshold ? '#dc2626' : 'inherit' }}>{r.change_pct}%</td>
                      <td><span className={`badge ${r.flag === 'ALERT' ? 'badge-alert' : 'badge-normal'}`}>{r.flag}</span></td>
                    </tr>
                  ))}
                  {(!anomalyData.anomalies || anomalyData.anomalies.length === 0) && (
                    <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--erp-muted)' }}>No anomalies detected</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'budget' && budgetData && !loading && (
            <div className="panel">
              <table className="data-table">
                <thead>
                  <tr><th>Person</th><th>Component</th><th style={{ textAlign: 'right' }}>Budgeted</th><th style={{ textAlign: 'right' }}>Actual</th><th style={{ textAlign: 'right' }}>Variance</th><th style={{ textAlign: 'right' }}>Var %</th><th>Flag</th></tr>
                </thead>
                <tbody>
                  {(budgetData.overruns || []).map((r, i) => (
                    <tr key={r.person_id + '-' + r.component}>
                      <td style={{ fontWeight: 600 }}>{r.person_name}</td>
                      <td>{r.component}</td>
                      <td className="num">{fmt(r.budgeted_amount)}</td>
                      <td className="num">{fmt(r.actual_amount)}</td>
                      <td className="num" style={{ color: r.variance > 0 ? '#dc2626' : '#16a34a' }}>{fmt(r.variance)}</td>
                      <td className="num">{r.variance_pct}%</td>
                      <td><span className={`badge ${r.flag === 'OVER_BUDGET' ? 'badge-over' : 'badge-within'}`}>{r.flag}</span></td>
                    </tr>
                  ))}
                  {(!budgetData.overruns || budgetData.overruns.length === 0) && (
                    <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--erp-muted)' }}>No budget allocations for this period</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
