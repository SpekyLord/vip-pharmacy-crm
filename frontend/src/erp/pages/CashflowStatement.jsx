import { useState, useCallback } from 'react';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import useAccounting from '../hooks/useAccounting';
import { showError } from '../utils/errorToast';
import WorkflowGuide from '../components/WorkflowGuide';

const pageStyles = `
  .cf-page { background: var(--erp-bg, #f4f7fb); min-height: 100vh; }
  .cf-main { flex: 1; min-width: 0; padding: 20px; max-width: 1000px; margin: 0 auto; }
  .cf-header h2 { font-size: 20px; font-weight: 700; margin: 0 0 16px; }
  .cf-controls { display: flex; gap: 8px; align-items: center; margin-bottom: 14px; }
  .cf-controls input { padding: 6px 10px; border-radius: 6px; border: 1px solid var(--erp-border); font-size: 13px; }
  .btn { padding: 6px 14px; border-radius: 6px; border: none; cursor: pointer; font-size: 13px; font-weight: 500; }
  .btn-primary { background: var(--erp-accent, #1e5eff); color: #fff; }
  .cf-card { background: var(--erp-panel); border-radius: 12px; padding: 20px; box-shadow: 0 1px 3px rgba(0,0,0,.06); margin-bottom: 16px; }
  .cf-section { margin-bottom: 16px; }
  .cf-section-title { font-size: 14px; font-weight: 700; margin-bottom: 8px; border-bottom: 2px solid var(--erp-border); padding-bottom: 4px; }
  .cf-row { display: flex; justify-content: space-between; padding: 4px 12px; font-size: 13px; }
  .cf-subtotal { display: flex; justify-content: space-between; padding: 8px 0; font-weight: 700; border-top: 1px solid var(--erp-border); }
  .cf-highlight { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin-top: 16px; }
  .cf-highlight-card { background: var(--erp-accent-soft, #e8efff); border-radius: 10px; padding: 14px; text-align: center; }
  .cf-highlight-card .lbl { font-size: 11px; color: var(--erp-muted); }
  .cf-highlight-card .val { font-size: 18px; font-weight: 700; }
  .cf-empty { text-align: center; color: #64748b; padding: 40px; }
  @media(max-width: 768px) { .cf-main { padding: 12px; } .cf-highlight { grid-template-columns: 1fr; } }
`;

const getCurrentPeriod = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const fmt = (n) => `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;

export default function CashflowStatement() {
  const api = useAccounting();
  const [period, setPeriod] = useState(getCurrentPeriod());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const generate = useCallback(async () => {
    setLoading(true);
    try { const res = await api.getCashflow(period); setData(res?.data || null); } catch (err) { showError(err, 'Could not load cashflow statement'); }
    setLoading(false);
  }, [period]); // eslint-disable-line react-hooks/exhaustive-deps

  const renderSection = (title, section) => (
    <div className="cf-section">
      <div className="cf-section-title">{title}</div>
      {(section?.lines || []).map((l, i) => (
        <div key={i} className="cf-row"><span>{l.label}</span><span style={{ fontFamily: 'monospace' }}>{fmt(l.amount)}</span></div>
      ))}
      <div className="cf-subtotal"><span>Total {title}</span><span>{fmt(section?.total)}</span></div>
    </div>
  );

  return (
    <div className="cf-page">
      <style>{pageStyles}</style>
      <Navbar />
      <div style={{ display: 'flex', flex: 1 }}>
        <Sidebar />
        <main className="cf-main admin-main">
          <WorkflowGuide pageKey="cashflow-statement" />
          <div className="cf-header"><h2>Cashflow Statement</h2></div>
          <div className="cf-controls">
            <input type="month" value={period} onChange={e => setPeriod(e.target.value)} />
            <button className="btn btn-primary" onClick={generate} disabled={loading}>{loading ? 'Generating…' : 'Generate'}</button>
          </div>
          {!data ? <div className="cf-empty">Select a period and click Generate</div> : (
            <div className="cf-card">
              {renderSection('Operating Activities', data.operating)}
              {renderSection('Investing Activities', data.investing)}
              {renderSection('Financing Activities', data.financing)}
              <div className="cf-highlight">
                <div className="cf-highlight-card"><div className="lbl">Opening Cash</div><div className="val">{fmt(data.opening_cash)}</div></div>
                <div className="cf-highlight-card"><div className="lbl">Net Change</div><div className="val" style={{ color: data.net_change >= 0 ? '#16a34a' : '#dc2626' }}>{fmt(data.net_change)}</div></div>
                <div className="cf-highlight-card"><div className="lbl">Closing Cash</div><div className="val">{fmt(data.closing_cash)}</div></div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
