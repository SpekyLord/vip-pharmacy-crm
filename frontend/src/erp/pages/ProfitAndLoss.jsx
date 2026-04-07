import React, { useState, useCallback } from 'react';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import useAccounting from '../hooks/useAccounting';

const pageStyles = `
  .pl-page { background: var(--erp-bg, #f4f7fb); min-height: 100vh; }
  .pl-main { flex: 1; min-width: 0; overflow-y: auto; padding: 20px; max-width: 1000px; margin: 0 auto; }
  .pl-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 8px; }
  .pl-header h2 { font-size: 20px; font-weight: 700; margin: 0; }
  .pl-controls { display: flex; gap: 8px; align-items: center; margin-bottom: 14px; flex-wrap: wrap; }
  .pl-controls input, .pl-controls select { padding: 6px 10px; border-radius: 6px; border: 1px solid var(--erp-border); font-size: 13px; }
  .btn { padding: 6px 14px; border-radius: 6px; border: none; cursor: pointer; font-size: 13px; font-weight: 500; }
  .btn-primary { background: var(--erp-accent, #1e5eff); color: #fff; }
  .pl-card { background: var(--erp-panel); border-radius: 12px; padding: 20px; box-shadow: 0 1px 3px rgba(0,0,0,.06); margin-bottom: 16px; }
  .pl-section { margin-bottom: 16px; }
  .pl-section-title { font-size: 14px; font-weight: 700; color: var(--erp-text); margin-bottom: 8px; border-bottom: 2px solid var(--erp-border); padding-bottom: 4px; }
  .pl-row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 13px; }
  .pl-row .name { color: var(--erp-text); padding-left: 12px; }
  .pl-row .amt { font-family: monospace; font-weight: 500; }
  .pl-subtotal { display: flex; justify-content: space-between; padding: 6px 0; font-size: 14px; font-weight: 700; border-top: 1px solid var(--erp-border); margin-top: 4px; }
  .pl-net { display: flex; justify-content: space-between; padding: 10px 0; font-size: 16px; font-weight: 700; border-top: 2px solid var(--erp-text); margin-top: 8px; }
  .pl-pct { font-size: 11px; color: var(--erp-muted); margin-left: 8px; }
  .pl-empty { text-align: center; color: #64748b; padding: 40px; }
  .pl-view-toggle { display: flex; gap: 4px; background: var(--erp-panel); border-radius: 8px; padding: 3px; }
  .pl-view-toggle button { padding: 6px 14px; border: none; border-radius: 6px; font-size: 12px; cursor: pointer; background: transparent; }
  .pl-view-toggle button.active { background: var(--erp-accent); color: #fff; }
  @media(max-width: 768px) { .pl-main { padding: 12px; padding-bottom: calc(80px + env(safe-area-inset-bottom, 0px)); } }
  @media(max-width: 375px) { .pl-main { padding: 8px; padding-bottom: calc(80px + env(safe-area-inset-bottom, 0px)); } .pl-main input, .pl-main select { font-size: 16px; } }
`;

const getCurrentPeriod = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const fmt = (n) => `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;

export default function ProfitAndLoss() {
  const api = useAccounting();
  const [period, setPeriod] = useState(getCurrentPeriod());
  const [viewType, setViewType] = useState('INTERNAL');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const generate = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getPnl(period, { view: viewType });
      setData(res?.data || null);
    } catch { /* */ }
    setLoading(false);
  }, [period, viewType]); // eslint-disable-line react-hooks/exhaustive-deps

  const renderSection = (title, section) => (
    <div className="pl-section">
      <div className="pl-section-title">{title}</div>
      {(section?.lines || []).map((l, i) => (
        <div key={i} className="pl-row">
          <span className="name">{l.account_code} — {l.account_name}</span>
          <span className="amt">{fmt(l.amount)}</span>
        </div>
      ))}
      <div className="pl-subtotal"><span>Total {title}</span><span>{fmt(section?.total)}</span></div>
    </div>
  );

  return (
    <div className="pl-page">
      <style>{pageStyles}</style>
      <Navbar />
      <div style={{ display: 'flex', flex: 1 }}>
        <Sidebar />
        <main className="pl-main admin-main">
          <div className="pl-header"><h2>Profit & Loss Statement</h2></div>
          <div className="pl-controls">
            <input type="month" value={period} onChange={e => setPeriod(e.target.value)} />
            <div className="pl-view-toggle">
              {['INTERNAL', 'BIR'].map(v => (
                <button key={v} className={viewType === v ? 'active' : ''} onClick={() => setViewType(v)}>{v}</button>
              ))}
            </div>
            <button className="btn btn-primary" onClick={generate} disabled={loading}>{loading ? 'Loading…' : 'Generate'}</button>
          </div>

          {!data ? <div className="pl-empty">Select period and view, then click Generate</div> : (
            <div className="pl-card">
              <h3 style={{ marginTop: 0 }}>P&L — {data.view || viewType} View ({data.period})</h3>
              {renderSection('Revenue', data.revenue)}
              {renderSection('Cost of Sales', data.cost_of_sales)}
              <div className="pl-subtotal">
                <span>Gross Profit <span className="pl-pct">({data.gross_profit_pct}%)</span></span>
                <span style={{ color: data.gross_profit >= 0 ? '#16a34a' : '#dc2626' }}>{fmt(data.gross_profit)}</span>
              </div>
              {renderSection('Operating Expenses', data.operating_expenses)}
              {data.non_operating_expenses?.lines?.length > 0 && renderSection('Non-Operating Expenses', data.non_operating_expenses)}
              {data.bir_only_deductions?.lines?.length > 0 && renderSection('BIR-Only Deductions', data.bir_only_deductions)}
              <div className="pl-subtotal">
                <span>Operating Income <span className="pl-pct">({data.operating_income_pct}%)</span></span>
                <span>{fmt(data.operating_income)}</span>
              </div>
              <div className="pl-net">
                <span>Net Income <span className="pl-pct">({data.net_income_pct}%)</span></span>
                <span style={{ color: data.net_income >= 0 ? '#16a34a' : '#dc2626' }}>{fmt(data.net_income)}</span>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
