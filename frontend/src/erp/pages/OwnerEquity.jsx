import React, { useState, useEffect, useCallback } from 'react';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import { useAuth } from '../../hooks/useAuth';
import useAccounting from '../hooks/useAccounting';
import { showError } from '../utils/errorToast';
import WorkflowGuide from '../components/WorkflowGuide';

const pageStyles = `
  .oe-page { background: var(--erp-bg, #f4f7fb); min-height: 100vh; }
  .oe-main { flex: 1; min-width: 0; overflow-y: auto; padding: 20px; max-width: 1000px; margin: 0 auto; }
  .oe-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 8px; }
  .oe-header h2 { font-size: 20px; font-weight: 700; margin: 0; }
  .btn { padding: 6px 14px; border-radius: 6px; border: none; cursor: pointer; font-size: 13px; font-weight: 500; }
  .btn-primary { background: var(--erp-accent, #1e5eff); color: #fff; }
  .btn-danger { background: #dc2626; color: #fff; }
  .oe-table { width: 100%; border-collapse: collapse; font-size: 13px; background: var(--erp-panel); border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,.06); }
  .oe-table th { background: var(--erp-accent-soft, #e8efff); padding: 10px; text-align: left; font-size: 11px; font-weight: 600; }
  .oe-table td { padding: 10px; border-top: 1px solid var(--erp-border); }
  .badge-INFUSION { background: #dcfce7; color: #166534; padding: 2px 8px; border-radius: 999px; font-size: 11px; }
  .badge-DRAWING { background: #fee2e2; color: #dc2626; padding: 2px 8px; border-radius: 999px; font-size: 11px; }
  .oe-balance { font-size: 18px; font-weight: 700; margin-bottom: 16px; padding: 14px 20px; background: var(--erp-panel); border-radius: 10px; box-shadow: 0 1px 3px rgba(0,0,0,.06); }
  .oe-modal { position: fixed; inset: 0; background: rgba(0,0,0,.4); display: flex; align-items: center; justify-content: center; z-index: 100; }
  .oe-modal-body { background: var(--erp-panel, #fff); border-radius: 12px; padding: 24px; width: 420px; max-width: 95vw; }
  .form-group { margin-bottom: 12px; }
  .form-group label { display: block; font-size: 12px; font-weight: 600; margin-bottom: 4px; color: var(--erp-muted); }
  .form-group input, .form-group select, .form-group textarea { width: 100%; padding: 8px 10px; border-radius: 6px; border: 1px solid var(--erp-border); font-size: 13px; box-sizing: border-box; }
  .oe-empty { text-align: center; color: #64748b; padding: 40px; }
  @media(max-width: 768px) { .oe-main { padding: 12px; } }
`;

const fmt = (n) => `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;

export default function OwnerEquity() {
  const { user } = useAuth();
  const api = useAccounting();
  const isAdmin = ['admin', 'finance', 'president'].includes(user?.role);

  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [entryType, setEntryType] = useState('INFUSION');
  const [form, setForm] = useState({ amount: '', description: '', entry_date: new Date().toISOString().slice(0, 10), bank_coa_code: '1010', bank_name: 'RCBC Savings' });

  const loadEntries = useCallback(async () => {
    setLoading(true);
    try { const res = await api.getEquityLedger(); setEntries(res?.data || []); } catch (err) { showError(err, 'Could not load equity ledger'); }
    setLoading(false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadEntries(); }, [loadEntries]);

  const handleSubmit = async () => {
    const data = { ...form, amount: parseFloat(form.amount) };
    try {
      if (entryType === 'INFUSION') await api.recordInfusion(data);
      else await api.recordDrawing(data);
      setShowModal(false);
      setForm({ amount: '', description: '', entry_date: new Date().toISOString().slice(0, 10), bank_coa_code: '1010', bank_name: 'RCBC Savings' });
      loadEntries();
    } catch (err) { showError(err, 'Could not record equity entry'); }
  };

  const currentBalance = entries.length > 0 ? entries[entries.length - 1].running_balance : 0;

  return (
    <div className="oe-page">
      <style>{pageStyles}</style>
      <Navbar />
      <div style={{ display: 'flex', flex: 1 }}>
        <Sidebar />
        <main className="oe-main admin-main">
          <WorkflowGuide pageKey="owner-equity" />
          <div className="oe-header">
            <h2>Owner Equity</h2>
            {isAdmin && (
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary" onClick={() => { setEntryType('INFUSION'); setShowModal(true); }}>+ Infusion</button>
                <button className="btn btn-danger" onClick={() => { setEntryType('DRAWING'); setShowModal(true); }}>- Drawing</button>
              </div>
            )}
          </div>

          <div className="oe-balance">
            Running Balance: <span style={{ color: currentBalance >= 0 ? '#16a34a' : '#dc2626' }}>{fmt(currentBalance)}</span>
          </div>

          {loading ? <div className="oe-empty">Loading…</div> : entries.length === 0 ? <div className="oe-empty">No equity entries</div> : (
            <table className="oe-table">
              <thead><tr><th>Date</th><th>Type</th><th>Amount</th><th>Description</th><th>Running Bal</th></tr></thead>
              <tbody>
                {entries.map(e => (
                  <tr key={e._id}>
                    <td>{new Date(e.entry_date).toLocaleDateString()}</td>
                    <td><span className={`badge-${e.entry_type}`}>{e.entry_type}</span></td>
                    <td style={{ fontWeight: 600, color: e.entry_type === 'INFUSION' ? '#16a34a' : '#dc2626' }}>{e.entry_type === 'DRAWING' ? '-' : '+'}{fmt(e.amount)}</td>
                    <td>{e.description || '—'}</td>
                    <td style={{ fontWeight: 600 }}>{fmt(e.running_balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {showModal && (
            <div className="oe-modal" onClick={() => setShowModal(false)}>
              <div className="oe-modal-body" onClick={e => e.stopPropagation()}>
                <h3>{entryType === 'INFUSION' ? 'Record Infusion' : 'Record Drawing'}</h3>
                <div className="form-group"><label>Date</label><input type="date" value={form.entry_date} onChange={e => setForm({ ...form, entry_date: e.target.value })} /></div>
                <div className="form-group"><label>Amount</label><input type="number" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} /></div>
                <div className="form-group"><label>Description</label><input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
                <div className="form-group"><label>Bank Account</label><input value={form.bank_name} onChange={e => setForm({ ...form, bank_name: e.target.value })} /></div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button className="btn" onClick={() => setShowModal(false)}>Cancel</button>
                  <button className="btn btn-primary" onClick={handleSubmit}>{entryType === 'INFUSION' ? 'Record Infusion' : 'Record Drawing'}</button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
