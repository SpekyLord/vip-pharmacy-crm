import React, { useState, useCallback } from 'react';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import useAccounting from '../hooks/useAccounting';

const pageStyles = `
  .tb-page { background: var(--erp-bg, #f4f7fb); min-height: 100vh; }
  .tb-main { flex: 1; min-width: 0; overflow-y: auto; padding: 20px; max-width: 1200px; margin: 0 auto; }
  .tb-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 8px; }
  .tb-header h2 { font-size: 20px; font-weight: 700; margin: 0; }
  .tb-controls { display: flex; gap: 8px; align-items: center; margin-bottom: 14px; }
  .tb-controls input { padding: 6px 10px; border-radius: 6px; border: 1px solid var(--erp-border); font-size: 13px; }
  .btn { padding: 6px 14px; border-radius: 6px; border: none; cursor: pointer; font-size: 13px; font-weight: 500; }
  .btn-primary { background: var(--erp-accent, #1e5eff); color: #fff; }
  .tb-table { width: 100%; border-collapse: collapse; font-size: 13px; background: var(--erp-panel); border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,.06); }
  .tb-table th { background: var(--erp-accent-soft, #e8efff); padding: 10px; text-align: left; font-size: 11px; font-weight: 600; color: var(--erp-muted); }
  .tb-table td { padding: 10px; border-top: 1px solid var(--erp-border); }
  .tb-table .amt { text-align: right; font-family: monospace; }
  .tb-table .abnormal { background: #fee2e2; }
  .tb-footer { font-weight: 700; background: var(--erp-accent-soft); }
  .tb-balance { margin-top: 12px; padding: 12px 16px; border-radius: 8px; font-size: 14px; font-weight: 600; text-align: center; }
  .tb-balanced { background: #dcfce7; color: #166534; }
  .tb-unbalanced { background: #fee2e2; color: #dc2626; }
  .tb-empty { text-align: center; color: #64748b; padding: 40px; }
  @media(max-width: 768px) { .tb-main { padding: 12px; } }
`;

const getCurrentPeriod = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const fmt = (n) => `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;

export default function TrialBalance() {
  const api = useAccounting();
  const [period, setPeriod] = useState(getCurrentPeriod());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const generate = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getTrialBalance(period);
      setData(res?.data || null);
    } catch { /* */ }
    setLoading(false);
  }, [period]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="tb-page">
      <style>{pageStyles}</style>
      <Navbar />
      <div style={{ display: 'flex', flex: 1 }}>
        <Sidebar />
        <main className="tb-main admin-main">
          <div className="tb-header"><h2>Trial Balance</h2></div>
          <div className="tb-controls">
            <input type="month" value={period} onChange={e => setPeriod(e.target.value)} />
            <button className="btn btn-primary" onClick={generate} disabled={loading}>
              {loading ? 'Generating…' : 'Generate'}
            </button>
          </div>

          {!data ? <div className="tb-empty">Select a period and click Generate</div> : (
            <>
              <table className="tb-table">
                <thead>
                  <tr><th>Code</th><th>Account</th><th>Type</th><th className="amt">Debit</th><th className="amt">Credit</th><th className="amt">Net Balance</th><th>Dir</th></tr>
                </thead>
                <tbody>
                  {(data.accounts || []).map(a => (
                    <tr key={a.account_code} className={a.is_abnormal ? 'abnormal' : ''}>
                      <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{a.account_code}</td>
                      <td>{a.account_name}</td>
                      <td>{a.account_type}</td>
                      <td className="amt">{fmt(a.total_debit)}</td>
                      <td className="amt">{fmt(a.total_credit)}</td>
                      <td className="amt" style={{ fontWeight: 600 }}>{fmt(a.net_balance)}</td>
                      <td>{a.balance_direction} {a.is_abnormal ? '⚠' : ''}</td>
                    </tr>
                  ))}
                  <tr className="tb-footer">
                    <td colSpan={3}>TOTAL</td>
                    <td className="amt">{fmt(data.total_debit)}</td>
                    <td className="amt">{fmt(data.total_credit)}</td>
                    <td className="amt">{fmt(Math.abs(data.total_debit - data.total_credit))}</td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
              <div className={`tb-balance ${data.is_balanced ? 'tb-balanced' : 'tb-unbalanced'}`}>
                {data.is_balanced ? '✓ Trial Balance is BALANCED' : '✗ Trial Balance is UNBALANCED — check entries'}
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
