/**
 * Fuel Efficiency Page — Phase 14.7
 * Per-BDM fuel tracking with variance detection
 */
import { useState, useCallback } from 'react';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import { useAuth } from '../../hooks/useAuth';
import useReports from '../hooks/useReports';

const pageStyles = `
  .fuel-page { background: var(--erp-bg, #f4f7fb); min-height: 100vh; }
  .fuel-main { flex: 1; min-width: 0; overflow-y: auto; padding: 20px; max-width: 1200px; margin: 0 auto; }
  .fuel-header h1 { font-size: 22px; color: var(--erp-text); margin: 0 0 4px; }
  .fuel-header p { color: var(--erp-muted); font-size: 13px; margin: 0 0 16px; }
  .controls { display: flex; gap: 10px; align-items: center; margin-bottom: 16px; }
  .controls input { padding: 8px 12px; border: 1px solid var(--erp-border); border-radius: 8px; font-size: 13px; background: var(--erp-panel); color: var(--erp-text); }
  .btn { padding: 8px 16px; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; }
  .btn-primary { background: #2563eb; color: white; }
  .btn:disabled { opacity: 0.5; }
  .panel { background: var(--erp-panel); border: 1px solid var(--erp-border); border-radius: 14px; padding: 20px; overflow-x: auto; }
  .data-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .data-table th { text-align: left; padding: 8px 10px; background: var(--erp-accent-soft); font-weight: 600; white-space: nowrap; }
  .data-table td { padding: 8px 10px; border-top: 1px solid var(--erp-border); white-space: nowrap; }
  .data-table td.num { text-align: right; font-variant-numeric: tabular-nums; }
  .row-flagged { background: rgba(239,68,68,0.06); }
  .badge { display: inline-block; padding: 3px 8px; border-radius: 6px; font-size: 11px; font-weight: 600; }
  .badge-over { background: #fef2f2; color: #991b1b; }
  .badge-normal { background: #dcfce7; color: #166534; }
  .loading { text-align: center; padding: 40px; color: var(--erp-muted); }
  @media(max-width: 768px) { .fuel-main { padding: 12px; } }
`;

function fmt(n) { return '\u20B1' + (n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function getCurrentPeriod() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); }

export default function FuelEfficiency() {
  const { user } = useAuth();
  const rpt = useReports();
  const [period, setPeriod] = useState(getCurrentPeriod());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { const res = await rpt.getFuelEfficiency(period); setData(res?.data || null); } catch (err) { console.error('[FuelEfficiency] load error:', err.message); }
    setLoading(false);
  }, [period]);

  return (
    <div className="fuel-page">
      <style>{pageStyles}</style>
      <Navbar />
      <div style={{ display: 'flex' }}>
        <Sidebar />
        <div className="fuel-main">
          <div className="fuel-header">
            <h1>Fuel Efficiency Report</h1>
            <p>Per-BDM actual vs expected gas cost with variance detection</p>
          </div>

          <div className="controls">
            <input type="month" value={period} onChange={e => setPeriod(e.target.value)} />
            <button className="btn btn-primary" onClick={load} disabled={loading}>Load</button>
          </div>

          {loading && <div className="loading">Loading...</div>}

          {data && !loading && (
            <div className="panel">
              <div style={{ fontSize: 12, color: 'var(--erp-muted)', marginBottom: 10 }}>
                Variance threshold: {data.threshold}%
              </div>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>BDM</th>
                    <th style={{ textAlign: 'right' }}>Official KM</th>
                    <th style={{ textAlign: 'right' }}>Liters</th>
                    <th style={{ textAlign: 'right' }}>KM/L</th>
                    <th style={{ textAlign: 'right' }}>Actual Cost</th>
                    <th style={{ textAlign: 'right' }}>Expected Cost</th>
                    <th style={{ textAlign: 'right' }}>Variance</th>
                    <th style={{ textAlign: 'right' }}>Var %</th>
                    <th>Flag</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.items || []).map((r, i) => (
                    <tr key={r.bdm_id || i} className={r.flag === 'OVER_30_PCT' ? 'row-flagged' : ''}>
                      <td style={{ fontWeight: 600 }}>{r.bdm_name}</td>
                      <td className="num">{r.total_official_km.toLocaleString()}</td>
                      <td className="num">{r.total_actual_liters.toLocaleString()}</td>
                      <td className="num">{r.avg_km_per_liter}</td>
                      <td className="num">{fmt(r.actual_gas_cost)}</td>
                      <td className="num">{fmt(r.expected_gas_cost)}</td>
                      <td className="num" style={{ color: r.variance_amount > 0 ? '#dc2626' : '#16a34a' }}>{fmt(r.variance_amount)}</td>
                      <td className="num">{r.variance_pct}%</td>
                      <td><span className={`badge ${r.flag === 'OVER_30_PCT' ? 'badge-over' : 'badge-normal'}`}>{r.flag === 'OVER_30_PCT' ? 'OVER' : 'OK'}</span></td>
                    </tr>
                  ))}
                  {(!data.items || data.items.length === 0) && (
                    <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--erp-muted)' }}>No fuel data for this period</td></tr>
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
