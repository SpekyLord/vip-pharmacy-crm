import React, { useState } from 'react';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import usePayroll from '../hooks/usePayroll';

const pageStyles = `
  .tm-page { background: var(--erp-bg, #f4f7fb); min-height: 100vh; }
  .tm-main { flex: 1; min-width: 0; overflow-y: auto; padding: 20px; max-width: 900px; margin: 0 auto; }
  .tm-header h2 { font-size: 20px; font-weight: 700; margin: 0 0 16px; }
  .tm-controls { display: flex; gap: 8px; align-items: center; margin-bottom: 16px; }
  .tm-controls input { padding: 6px 10px; border-radius: 6px; border: 1px solid var(--erp-border); font-size: 13px; }
  .btn { padding: 6px 14px; border-radius: 6px; border: none; cursor: pointer; font-size: 13px; font-weight: 500; }
  .btn-primary { background: var(--erp-accent, #1e5eff); color: #fff; }
  .tm-table { width: 100%; border-collapse: collapse; font-size: 13px; background: var(--erp-panel); border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,.06); }
  .tm-table th { background: var(--erp-accent-soft, #e8efff); padding: 10px 12px; text-align: left; font-size: 11px; font-weight: 600; color: var(--erp-muted); }
  .tm-table td { padding: 10px 12px; border-top: 1px solid var(--erp-border); }
  .tm-msg { font-size: 13px; padding: 8px 12px; border-radius: 8px; margin-bottom: 12px; }
  .tm-msg-ok { background: #dcfce7; color: #166534; }
  .tm-msg-err { background: #fee2e2; color: #dc2626; }
  .tm-empty { text-align: center; color: #64748b; padding: 40px; }
  @media(max-width: 768px) { .tm-main { padding: 12px; } }
`;

const fmt = (n) => `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;

export default function ThirteenthMonth() {
  const api = usePayroll();
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [results, setResults] = useState([]);
  const [msg, setMsg] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleCompute = async () => {
    setLoading(true);
    setMsg(null);
    try {
      const res = await api.computeThirteenthMonth({ year: parseInt(year) });
      setResults(res?.data?.results || []);
      setMsg({ type: 'ok', text: res?.message || 'Computed' });
    } catch (e) {
      setMsg({ type: 'err', text: e.response?.data?.message || 'Failed' });
    } finally { setLoading(false); }
  };

  return (
    <div className="admin-page erp-page tm-page">
      <style>{pageStyles}</style>
      <Navbar />
      <div className="admin-layout">
        <Sidebar />
        <main className="tm-main">
          <div className="tm-header"><h2>13th Month Pay</h2></div>

          <div className="tm-controls">
            <input type="number" min="2020" max="2030" value={year} onChange={e => setYear(e.target.value)} style={{ width: 100 }} />
            <button className="btn btn-primary" onClick={handleCompute} disabled={loading}>
              {loading ? 'Computing...' : 'Compute 13th Month'}
            </button>
          </div>

          {msg && <div className={`tm-msg ${msg.type === 'ok' ? 'tm-msg-ok' : 'tm-msg-err'}`}>{msg.text}</div>}

          {results.length > 0 ? (
            <table className="tm-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th style={{ textAlign: 'right' }}>13th Month Pay</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <tr key={r.emp_id || r.name}>
                    <td>{r.name}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(r.thirteenth_month)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="tm-empty">Select a year and click "Compute 13th Month" to generate.</div>
          )}
        </main>
      </div>
    </div>
  );
}
