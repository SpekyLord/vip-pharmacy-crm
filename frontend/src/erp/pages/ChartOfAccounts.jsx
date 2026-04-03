import React, { useState, useEffect, useCallback } from 'react';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import { useAuth } from '../../hooks/useAuth';
import useAccounting from '../hooks/useAccounting';

const pageStyles = `
  .coa-page { background: var(--erp-bg, #f4f7fb); min-height: 100vh; }
  .coa-main { flex: 1; min-width: 0; overflow-y: auto; padding: 20px; max-width: 1200px; margin: 0 auto; }
  .coa-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 8px; }
  .coa-header h2 { font-size: 20px; font-weight: 700; margin: 0; }
  .coa-controls { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 14px; }
  .coa-controls input, .coa-controls select { padding: 6px 10px; border-radius: 6px; border: 1px solid var(--erp-border); font-size: 13px; }
  .btn { padding: 6px 14px; border-radius: 6px; border: none; cursor: pointer; font-size: 13px; font-weight: 500; }
  .btn-primary { background: var(--erp-accent, #1e5eff); color: #fff; }
  .btn-sm { padding: 4px 10px; font-size: 12px; }
  .coa-table { width: 100%; border-collapse: collapse; font-size: 13px; background: var(--erp-panel); border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,.06); }
  .coa-table th { background: var(--erp-accent-soft, #e8efff); padding: 10px; text-align: left; font-size: 11px; font-weight: 600; color: var(--erp-muted); }
  .coa-table td { padding: 10px; border-top: 1px solid var(--erp-border); }
  .coa-table tr:hover { background: var(--erp-accent-soft); }
  .type-badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 500; }
  .type-ASSET { background: #dbeafe; color: #1e40af; }
  .type-LIABILITY { background: #fef3c7; color: #92400e; }
  .type-EQUITY { background: #e0e7ff; color: #3730a3; }
  .type-REVENUE { background: #dcfce7; color: #166534; }
  .type-EXPENSE { background: #fee2e2; color: #dc2626; }
  .coa-modal { position: fixed; inset: 0; background: rgba(0,0,0,.4); display: flex; align-items: center; justify-content: center; z-index: 100; }
  .coa-modal-body { background: var(--erp-panel, #fff); border-radius: 12px; padding: 24px; width: 420px; max-width: 95vw; }
  .coa-modal-body h3 { margin: 0 0 16px; font-size: 16px; }
  .form-group { margin-bottom: 12px; }
  .form-group label { display: block; font-size: 12px; font-weight: 600; margin-bottom: 4px; color: var(--erp-muted); }
  .form-group input, .form-group select { width: 100%; padding: 8px 10px; border-radius: 6px; border: 1px solid var(--erp-border); font-size: 13px; box-sizing: border-box; }
  .coa-empty { text-align: center; color: #64748b; padding: 40px; }
  @media(max-width: 768px) { .coa-main { padding: 12px; } }
`;

const ACCOUNT_TYPES = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'];

export default function ChartOfAccounts() {
  const { user } = useAuth();
  const api = useAccounting();
  const isAdmin = ['admin', 'finance', 'president'].includes(user?.role);

  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ account_code: '', account_name: '', account_type: 'ASSET', normal_balance: 'DEBIT', account_subtype: '', bir_flag: 'BOTH' });

  const loadAccounts = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (search) params.search = search;
      if (typeFilter) params.account_type = typeFilter;
      const res = await api.listAccounts(params);
      setAccounts(res?.data || []);
    } catch { /* hook handles */ }
    setLoading(false);
  }, [search, typeFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadAccounts(); }, [loadAccounts]);

  const handleCreate = async () => {
    try {
      await api.createAccount(form);
      setShowModal(false);
      setForm({ account_code: '', account_name: '', account_type: 'ASSET', normal_balance: 'DEBIT', account_subtype: '', bir_flag: 'BOTH' });
      loadAccounts();
    } catch { /* hook handles */ }
  };

  return (
    <div className="coa-page">
      <style>{pageStyles}</style>
      <Navbar />
      <div style={{ display: 'flex', flex: 1 }}>
        <Sidebar />
        <main className="coa-main admin-main">
          <div className="coa-header">
            <h2>Chart of Accounts</h2>
            {isAdmin && <button className="btn btn-primary" onClick={() => setShowModal(true)}>+ Add Account</button>}
          </div>

          <div className="coa-controls">
            <input placeholder="Search code or name…" value={search} onChange={e => setSearch(e.target.value)} />
            <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
              <option value="">All Types</option>
              {ACCOUNT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          {loading ? <div className="coa-empty">Loading…</div> : accounts.length === 0 ? <div className="coa-empty">No accounts found</div> : (
            <table className="coa-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Account Name</th>
                  <th>Type</th>
                  <th>Subtype</th>
                  <th>Normal Bal</th>
                  <th>BIR Flag</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map(a => (
                  <tr key={a._id}>
                    <td style={{ fontWeight: 600, fontFamily: 'monospace' }}>{a.account_code}</td>
                    <td>{a.account_name}</td>
                    <td><span className={`type-badge type-${a.account_type}`}>{a.account_type}</span></td>
                    <td>{a.account_subtype || '—'}</td>
                    <td>{a.normal_balance}</td>
                    <td>{a.bir_flag}</td>
                    <td>{a.is_active ? '✓ Active' : '✗ Inactive'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {showModal && (
            <div className="coa-modal" onClick={() => setShowModal(false)}>
              <div className="coa-modal-body" onClick={e => e.stopPropagation()}>
                <h3>New Account</h3>
                <div className="form-group">
                  <label>Account Code</label>
                  <input value={form.account_code} onChange={e => setForm({ ...form, account_code: e.target.value })} placeholder="e.g. 1015" />
                </div>
                <div className="form-group">
                  <label>Account Name</label>
                  <input value={form.account_name} onChange={e => setForm({ ...form, account_name: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Account Type</label>
                  <select value={form.account_type} onChange={e => setForm({ ...form, account_type: e.target.value })}>
                    {ACCOUNT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Normal Balance</label>
                  <select value={form.normal_balance} onChange={e => setForm({ ...form, normal_balance: e.target.value })}>
                    <option value="DEBIT">DEBIT</option>
                    <option value="CREDIT">CREDIT</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Subtype</label>
                  <input value={form.account_subtype} onChange={e => setForm({ ...form, account_subtype: e.target.value })} placeholder="e.g. Bank, Receivable" />
                </div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button className="btn" onClick={() => setShowModal(false)}>Cancel</button>
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
