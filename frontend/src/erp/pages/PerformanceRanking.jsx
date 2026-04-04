/**
 * Performance Ranking Page — Phase 14.7
 * Net Cash ranking, MoM trend, Sales/Collections trackers
 */
import { useState, useEffect, useCallback } from 'react';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import { useAuth } from '../../hooks/useAuth';
import useReports from '../hooks/useReports';

const pageStyles = `
  .perf-page { background: var(--erp-bg, #f4f7fb); min-height: 100vh; }
  .perf-main { flex: 1; min-width: 0; overflow-y: auto; padding: 20px; max-width: 1400px; margin: 0 auto; }
  .perf-header { margin-bottom: 20px; }
  .perf-header h1 { font-size: 22px; color: var(--erp-text); margin: 0 0 4px; }
  .perf-header p { color: var(--erp-muted); font-size: 13px; margin: 0; }
  .controls { display: flex; gap: 10px; align-items: center; margin-bottom: 16px; flex-wrap: wrap; }
  .controls input, .controls select { padding: 8px 12px; border: 1px solid var(--erp-border); border-radius: 8px; font-size: 13px; background: var(--erp-panel); color: var(--erp-text); }
  .btn { padding: 8px 16px; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; }
  .btn-primary { background: #2563eb; color: white; }
  .btn:disabled { opacity: 0.5; }
  .tab-bar { display: flex; gap: 2px; margin-bottom: 16px; background: var(--erp-border); border-radius: 10px; padding: 3px; }
  .tab-btn { flex: 1; padding: 8px 16px; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; background: transparent; color: var(--erp-muted); transition: all 0.15s; }
  .tab-btn.active { background: var(--erp-panel); color: var(--erp-accent); box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
  .panel { background: var(--erp-panel); border: 1px solid var(--erp-border); border-radius: 14px; padding: 20px; margin-bottom: 16px; overflow-x: auto; }
  .data-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .data-table th { text-align: left; padding: 8px 10px; background: var(--erp-accent-soft); font-weight: 600; white-space: nowrap; }
  .data-table td { padding: 8px 10px; border-top: 1px solid var(--erp-border); white-space: nowrap; }
  .data-table td.num { text-align: right; font-variant-numeric: tabular-nums; }
  .rank-top { background: rgba(34,197,94,0.08); }
  .rank-bottom { background: rgba(239,68,68,0.08); }
  .trend-row { cursor: pointer; }
  .trend-row:hover { background: var(--erp-accent-soft); }
  .trend-detail { background: var(--erp-bg); padding: 12px; border-radius: 8px; margin: 4px 0 8px; }
  .trend-bar { display: inline-block; height: 18px; border-radius: 4px; min-width: 2px; }
  .loading { text-align: center; padding: 40px; color: var(--erp-muted); }
  @media(max-width: 768px) { .perf-main { padding: 12px; } }
`;

function fmt(n) { return '\u20B1' + (n || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 }); }
function getCurrentPeriod() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); }
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_KEYS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

export default function PerformanceRanking() {
  const { user } = useAuth();
  const rpt = useReports();
  const [tab, setTab] = useState('ranking');
  const [period, setPeriod] = useState(getCurrentPeriod());
  const [year, setYear] = useState(new Date().getFullYear());
  const [data, setData] = useState(null);
  const [trackerData, setTrackerData] = useState(null);
  const [trendData, setTrendData] = useState(null);
  const [expandedPerson, setExpandedPerson] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => { loadRanking(); }, []);

  const loadRanking = useCallback(async () => {
    setLoading(true);
    try { const res = await rpt.getPerformanceRanking(period); setData(res?.data || null); } catch {}
    setLoading(false);
  }, [period]);

  const loadTracker = useCallback(async (type) => {
    setLoading(true);
    try {
      const res = type === 'sales' ? await rpt.getSalesTracker(year) : await rpt.getCollectionsTracker(year);
      setTrackerData(res?.data || null);
    } catch {}
    setLoading(false);
  }, [year]);

  const loadTrend = useCallback(async (personId) => {
    if (expandedPerson === personId) { setExpandedPerson(null); return; }
    setExpandedPerson(personId);
    try { const res = await rpt.getPerformanceTrend(personId); setTrendData(res?.data || null); } catch {}
  }, [expandedPerson]);

  const handleTabChange = (t) => {
    setTab(t);
    setData(null); setTrackerData(null);
    if (t === 'ranking') loadRanking();
    else loadTracker(t === 'sales_tracker' ? 'sales' : 'collections');
  };

  return (
    <div className="perf-page">
      <style>{pageStyles}</style>
      <Navbar />
      <div style={{ display: 'flex' }}>
        <Sidebar />
        <div className="perf-main">
          <div className="perf-header">
            <h1>Performance Ranking</h1>
            <p>Net cash ranking, sales/collections trackers, and month-over-month trends</p>
          </div>

          <div className="tab-bar">
            <button className={`tab-btn ${tab === 'ranking' ? 'active' : ''}`} onClick={() => handleTabChange('ranking')}>Ranking</button>
            <button className={`tab-btn ${tab === 'sales_tracker' ? 'active' : ''}`} onClick={() => handleTabChange('sales_tracker')}>Sales Tracker</button>
            <button className={`tab-btn ${tab === 'collections_tracker' ? 'active' : ''}`} onClick={() => handleTabChange('collections_tracker')}>Collections Tracker</button>
          </div>

          {tab === 'ranking' && (
            <>
              <div className="controls">
                <input type="month" value={period} onChange={e => setPeriod(e.target.value)} />
                <button className="btn btn-primary" onClick={loadRanking} disabled={loading}>Load Ranking</button>
              </div>
              {loading && <div className="loading">Loading...</div>}
              {data && !loading && (
                <div className="panel">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>#</th><th>Name</th><th>Type</th>
                        <th style={{ textAlign: 'right' }}>Sales</th>
                        <th style={{ textAlign: 'right' }}>Collections</th>
                        <th style={{ textAlign: 'right' }}>Coll %</th>
                        <th style={{ textAlign: 'right' }}>Expenses</th>
                        <th style={{ textAlign: 'right' }}>Net Cash</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(data.rankings || []).map((r, i) => {
                        const total = data.rankings.length;
                        const cls = i < 3 ? 'rank-top' : (i >= total - 3 && total > 6 ? 'rank-bottom' : '');
                        return (
                          <tr key={r.person_id} className={`${cls} trend-row`} onClick={() => loadTrend(r.person_id)}>
                            <td>{r.rank}</td>
                            <td style={{ fontWeight: 600 }}>{r.full_name}</td>
                            <td>{r.person_type}</td>
                            <td className="num">{fmt(r.sales)}</td>
                            <td className="num">{fmt(r.collections)}</td>
                            <td className="num">{r.collection_pct}%</td>
                            <td className="num">{fmt(r.expenses)}</td>
                            <td className="num" style={{ fontWeight: 700, color: r.net_cash >= 0 ? '#16a34a' : '#dc2626' }}>{fmt(r.net_cash)}</td>
                          </tr>
                        );
                      })}
                      {(!data.rankings || data.rankings.length === 0) && (
                        <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--erp-muted)' }}>No data for this period</td></tr>
                      )}
                    </tbody>
                  </table>
                  {expandedPerson && trendData && (
                    <div className="trend-detail">
                      <strong>MoM Trend: {trendData.full_name}</strong>
                      <table className="data-table" style={{ marginTop: 8 }}>
                        <thead>
                          <tr><th>Period</th><th style={{ textAlign: 'right' }}>Sales</th><th style={{ textAlign: 'right' }}>Growth</th><th style={{ textAlign: 'right' }}>Collections</th><th style={{ textAlign: 'right' }}>Growth</th><th style={{ textAlign: 'right' }}>Expenses</th><th style={{ textAlign: 'right' }}>Growth</th></tr>
                        </thead>
                        <tbody>
                          {(trendData.trends || []).map(t => (
                            <tr key={t.period}>
                              <td>{t.period}</td>
                              <td className="num">{fmt(t.sales)}</td>
                              <td className="num" style={{ color: t.sales_growth_pct >= 0 ? '#16a34a' : '#dc2626' }}>{t.sales_growth_pct}%</td>
                              <td className="num">{fmt(t.collections)}</td>
                              <td className="num" style={{ color: t.collection_growth_pct >= 0 ? '#16a34a' : '#dc2626' }}>{t.collection_growth_pct}%</td>
                              <td className="num">{fmt(t.expenses)}</td>
                              <td className="num" style={{ color: t.expense_growth_pct <= 0 ? '#16a34a' : '#dc2626' }}>{t.expense_growth_pct}%</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {(tab === 'sales_tracker' || tab === 'collections_tracker') && (
            <>
              <div className="controls">
                <input type="number" value={year} onChange={e => setYear(Number(e.target.value))} min={2020} max={2030} style={{ width: 100 }} />
                <button className="btn btn-primary" onClick={() => loadTracker(tab === 'sales_tracker' ? 'sales' : 'collections')} disabled={loading}>Load</button>
              </div>
              {loading && <div className="loading">Loading...</div>}
              {trackerData && !loading && (
                <div className="panel">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        {MONTHS.map(m => <th key={m} style={{ textAlign: 'right' }}>{m}</th>)}
                        <th style={{ textAlign: 'right', fontWeight: 700 }}>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(trackerData.tracker || []).map(r => (
                        <tr key={r.bdm_id}>
                          <td style={{ fontWeight: 600 }}>{r.full_name}</td>
                          {MONTH_KEYS.map(m => <td key={m} className="num">{fmt(r[m] || 0)}</td>)}
                          <td className="num" style={{ fontWeight: 700 }}>{fmt(r.total || 0)}</td>
                        </tr>
                      ))}
                      {(!trackerData.tracker || trackerData.tracker.length === 0) && (
                        <tr><td colSpan={14} style={{ textAlign: 'center', color: 'var(--erp-muted)' }}>No data for {year}</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
