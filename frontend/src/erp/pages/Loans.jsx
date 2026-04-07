import React, { useState, useEffect, useCallback } from 'react';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import { useAuth } from '../../hooks/useAuth';
import useAccounting from '../hooks/useAccounting';

const pageStyles = `
  .ln-page { background: var(--erp-bg, #f4f7fb); min-height: 100vh; }
  .ln-main { flex: 1; min-width: 0; overflow-y: auto; padding: 20px; max-width: 1200px; margin: 0 auto; }
  .ln-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 8px; }
  .ln-header h2 { font-size: 20px; font-weight: 700; margin: 0; }
  .btn { padding: 6px 14px; border-radius: 6px; border: none; cursor: pointer; font-size: 13px; font-weight: 500; }
  .btn-primary { background: var(--erp-accent, #1e5eff); color: #fff; }
  .btn-success { background: #16a34a; color: #fff; }
  .btn-sm { padding: 4px 10px; font-size: 12px; }
  .ln-table { width: 100%; border-collapse: collapse; font-size: 13px; background: var(--erp-panel); border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,.06); }
  .ln-table th { background: var(--erp-accent-soft, #e8efff); padding: 10px; text-align: left; font-size: 11px; font-weight: 600; }
  .ln-table td { padding: 10px; border-top: 1px solid var(--erp-border); }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 500; }
  .badge-ACTIVE { background: #dcfce7; color: #166534; }
  .badge-PAID { background: #dbeafe; color: #1e40af; }
  .ln-staging { background: var(--erp-panel); border-radius: 12px; padding: 20px; margin-top: 16px; box-shadow: 0 1px 3px rgba(0,0,0,.06); }
  .ln-controls { display: flex; gap: 8px; align-items: center; margin-bottom: 14px; flex-wrap: wrap; }
  .ln-controls input { padding: 6px 10px; border-radius: 6px; border: 1px solid var(--erp-border); font-size: 13px; }
  .ln-modal { position: fixed; inset: 0; background: rgba(0,0,0,.4); display: flex; align-items: center; justify-content: center; z-index: 100; }
  .ln-modal-body { background: var(--erp-panel, #fff); border-radius: 12px; padding: 24px; width: 500px; max-width: 95vw; }
  .form-group { margin-bottom: 12px; }
  .form-group label { display: block; font-size: 12px; font-weight: 600; margin-bottom: 4px; color: var(--erp-muted); }
  .form-group input { width: 100%; padding: 8px 10px; border-radius: 6px; border: 1px solid var(--erp-border); font-size: 13px; box-sizing: border-box; }
  .ln-empty { text-align: center; color: #64748b; padding: 40px; }
  .ln-msg { font-size: 13px; margin-top: 8px; padding: 8px 12px; border-radius: 8px; background: #dcfce7; color: #166534; }
  @media(max-width: 768px) { .ln-main { padding: 12px; } }
`;

const fmt = (n) => `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
const getCurrentPeriod = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };

export default function Loans() {
  const { user } = useAuth();
  const api = useAccounting();
  const isAdmin = ['admin', 'finance', 'president'].includes(user?.role);

  const [loans, setLoans] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ loan_code: '', lender: '', purpose: '', principal: '', annual_rate: '0.12', term_months: '12', start_date: '' });
  const [period, setPeriod] = useState(getCurrentPeriod());
  const [staging, setStaging] = useState([]);
  const [msg, setMsg] = useState('');

  const handleExport = async () => {
    try { const res = await api.exportLoans(); const url = URL.createObjectURL(new Blob([res])); const a = document.createElement('a'); a.href = url; a.download = 'loans-export.xlsx'; a.click(); URL.revokeObjectURL(url); } catch { /* */ }
  };
  const handleImport = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    const fd = new FormData(); fd.append('file', file);
    try { const res = await api.importLoans(fd); alert(res?.message || 'Import complete'); loadLoans(); } catch { /* */ }
    e.target.value = '';
  };

  const loadLoans = useCallback(async () => {
    setLoading(true);
    try { const res = await api.listLoans(); setLoans(res?.data || []); } catch { /* */ }
    setLoading(false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadLoans(); }, [loadLoans]);

  const handleCreate = async () => {
    try {
      await api.createLoan({ ...form, principal: parseFloat(form.principal), annual_rate: parseFloat(form.annual_rate), term_months: parseInt(form.term_months) });
      setShowAdd(false); loadLoans();
    } catch { /* */ }
  };

  const handleCompute = async () => { try { await api.computeInterest({ period }); loadStaging(); } catch { /* */ } };
  const loadStaging = async () => { try { const res = await api.getInterestStaging(period); setStaging(res?.data || []); } catch { /* */ } };
  const handleApproveAll = async () => { try { await api.approveInterest({ entry_ids: staging.map(s => s.entry_id) }); setMsg('Approved'); loadStaging(); } catch { /* */ } };
  const handlePost = async () => { try { const res = await api.postInterest({ period }); setMsg(`Posted ${res?.data?.length || 0} JEs`); loadStaging(); loadLoans(); } catch { /* */ } };

  return (
    <div className="ln-page">
      <style>{pageStyles}</style>
      <Navbar />
      <div style={{ display: 'flex', flex: 1 }}>
        <Sidebar />
        <main className="ln-main admin-main">
          <div className="ln-header">
            <h2>Loans & Amortization</h2>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn" style={{ background: 'transparent', border: '1px solid var(--erp-border)', color: 'var(--erp-text)' }} onClick={handleExport}>Export Excel</button>
              {isAdmin && <label className="btn" style={{ background: 'transparent', border: '1px solid var(--erp-border)', color: 'var(--erp-text)', cursor: 'pointer' }}>Import Excel<input type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={handleImport} /></label>}
              {isAdmin && <button className="btn btn-primary" onClick={() => setShowAdd(true)}>+ Add Loan</button>}
            </div>
          </div>

          {loading ? <div className="ln-empty">Loading…</div> : loans.length === 0 ? <div className="ln-empty">No loans</div> : (
            <table className="ln-table">
              <thead><tr><th>Code</th><th>Lender</th><th>Principal</th><th>Rate</th><th>Term</th><th>Monthly</th><th>Outstanding</th><th>Status</th></tr></thead>
              <tbody>
                {loans.map(l => (
                  <tr key={l._id}>
                    <td style={{ fontWeight: 600 }}>{l.loan_code}</td><td>{l.lender}</td>
                    <td>{fmt(l.principal)}</td><td>{(l.annual_rate * 100).toFixed(1)}%</td>
                    <td>{l.term_months}mo</td><td>{fmt(l.monthly_payment)}</td>
                    <td>{fmt(l.outstanding_balance)}</td>
                    <td><span className={`badge badge-${l.status}`}>{l.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {isAdmin && (
            <div className="ln-staging">
              <h3>Interest Staging</h3>
              <div className="ln-controls">
                <input type="month" value={period} onChange={e => setPeriod(e.target.value)} />
                <button className="btn btn-primary" onClick={handleCompute}>Compute</button>
                <button className="btn" onClick={loadStaging}>Load</button>
                {staging.length > 0 && <>
                  <button className="btn btn-success" onClick={handleApproveAll}>Approve All</button>
                  <button className="btn btn-primary" onClick={handlePost}>Post JEs</button>
                </>}
              </div>
              {msg && <div className="ln-msg">{msg}</div>}
              {staging.length > 0 && (
                <table className="ln-table" style={{ marginTop: 8 }}>
                  <thead><tr><th>Loan</th><th>Interest</th><th>Principal</th><th>Balance</th><th>Status</th></tr></thead>
                  <tbody>
                    {staging.map(s => (
                      <tr key={s.entry_id}><td>{s.loan_code}</td><td>{fmt(s.interest_amount)}</td><td>{fmt(s.principal_amount)}</td><td>{fmt(s.outstanding_balance)}</td><td>{s.status}</td></tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {showAdd && (
            <div className="ln-modal" onClick={() => setShowAdd(false)}>
              <div className="ln-modal-body" onClick={e => e.stopPropagation()}>
                <h3>Add Loan</h3>
                {['loan_code', 'lender', 'purpose'].map(f => (
                  <div key={f} className="form-group"><label>{f.replace('_', ' ')}</label><input value={form[f]} onChange={e => setForm({ ...form, [f]: e.target.value })} /></div>
                ))}
                <div className="form-group"><label>Start Date</label><input type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} /></div>
                <div className="form-group"><label>Principal</label><input type="number" value={form.principal} onChange={e => setForm({ ...form, principal: e.target.value })} /></div>
                <div className="form-group"><label>Annual Rate (decimal, e.g. 0.12 = 12%)</label><input type="number" step="0.01" value={form.annual_rate} onChange={e => setForm({ ...form, annual_rate: e.target.value })} /></div>
                <div className="form-group"><label>Term (months)</label><input type="number" value={form.term_months} onChange={e => setForm({ ...form, term_months: e.target.value })} /></div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button className="btn" onClick={() => setShowAdd(false)}>Cancel</button>
                  <button className="btn btn-primary" onClick={handleCreate}>Create</button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
