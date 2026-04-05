import React, { useState, useEffect, useCallback } from 'react';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import { useAuth } from '../../hooks/useAuth';
import useBanking from '../hooks/useBanking';
import crmApi from '../../services/api';

const pageStyles = `
  .ba-container { background: var(--erp-bg, #f4f7fb); min-height: 100vh; display: flex; flex-direction: column; }
  .ba-main { flex: 1; min-width: 0; overflow-y: auto; padding: 20px; max-width: 1200px; margin: 0 auto; width: 100%; }
  .ba-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 8px; }
  .ba-header h2 { margin: 0; font-size: 20px; }
  .ba-table { width: 100%; border-collapse: collapse; background: var(--erp-panel, #fff); border-radius: 12px; overflow: hidden; box-shadow: 0 1px 4px rgba(0,0,0,.06); }
  .ba-table th { background: var(--erp-accent-soft, #e8efff); padding: 10px 12px; text-align: left; font-weight: 600; font-size: 12px; color: var(--erp-muted, #6b7280); text-transform: uppercase; letter-spacing: .3px; }
  .ba-table td { padding: 10px 12px; border-top: 1px solid var(--erp-border, #e5e7eb); font-size: 13px; }
  .ba-table tr:hover td { background: #f8fafc; }
  .ba-modal { position: fixed; inset: 0; background: rgba(0,0,0,.4); display: flex; align-items: center; justify-content: center; z-index: 100; }
  .ba-modal-body { background: var(--erp-panel, #fff); border-radius: 12px; padding: 24px; width: 520px; max-width: 95vw; max-height: 90vh; overflow-y: auto; }
  .ba-fg { margin-bottom: 12px; }
  .ba-fg label { display: block; font-size: 12px; font-weight: 600; margin-bottom: 4px; color: var(--erp-muted, #6b7280); }
  .ba-fg input, .ba-fg select { width: 100%; padding: 8px 10px; border-radius: 6px; border: 1px solid var(--erp-border, #e5e7eb); font-size: 13px; box-sizing: border-box; }
  .ba-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .btn { padding: 6px 14px; border-radius: 6px; border: none; cursor: pointer; font-size: 13px; font-weight: 500; }
  .btn-primary { background: var(--erp-accent, #1e5eff); color: #fff; }
  .btn-sm { padding: 4px 10px; font-size: 12px; }
  .btn-outline { background: transparent; border: 1px solid var(--erp-border, #e5e7eb); color: var(--erp-muted, #6b7280); }
  .badge-active { background: #dcfce7; color: #166534; padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 600; }
  .badge-inactive { background: #fee2e2; color: #dc2626; padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 600; }
  .ba-msg { padding: 8px 14px; border-radius: 8px; margin-bottom: 12px; font-size: 13px; }
  .ba-msg-ok { background: #dcfce7; color: #166534; }
  .ba-msg-err { background: #fee2e2; color: #dc2626; }
  .money { font-family: 'Courier New', monospace; text-align: right; }
  @media(max-width: 768px) { .ba-main { padding: 12px; } .ba-row { grid-template-columns: 1fr; } }
`;

const EMPTY_FORM = {
  bank_code: '', bank_name: '', account_no: '', account_type: 'SAVINGS',
  coa_code: '', opening_balance: 0, statement_import_format: 'CSV', assigned_users: []
};

export default function BankAccounts() {
  const { user } = useAuth();
  const api = useBanking();

  const [accounts, setAccounts] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [msg, setMsg] = useState(null);

  const f = (field, value) => setForm(prev => ({ ...prev, [field]: value }));
  const showMsg = (text, type = 'ok') => { setMsg({ text, type }); setTimeout(() => setMsg(null), 4000); };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [acctRes, usersRes] = await Promise.all([
        api.listBankAccounts(),
        crmApi.get('/users', { params: { limit: 0 } })
      ]);
      setAccounts(acctRes?.data || []);
      setUsers(usersRes?.data?.data || []);
    } catch (err) { console.error('[BankAccounts] load error:', err.message); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openNew = () => { setEditing(null); setForm(EMPTY_FORM); setShowModal(true); };
  const openEdit = (acct) => {
    setEditing(acct);
    setForm({
      bank_code: acct.bank_code || '',
      bank_name: acct.bank_name || '',
      account_no: acct.account_no || '',
      account_type: acct.account_type || 'SAVINGS',
      coa_code: acct.coa_code || '',
      opening_balance: acct.opening_balance || 0,
      statement_import_format: acct.statement_import_format || 'CSV',
      assigned_users: (acct.assigned_users || []).map(u => u._id || u)
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    try {
      const data = { ...form, opening_balance: parseFloat(form.opening_balance) || 0, assigned_users: form.assigned_users };
      if (editing) {
        await api.updateBankAccount(editing._id, data);
        showMsg('Bank account updated');
      } else {
        await api.createBankAccount(data);
        showMsg('Bank account created');
      }
      setShowModal(false);
      load();
    } catch (err) {
      showMsg(err.response?.data?.message || 'Save failed', 'err');
    }
  };

  const fmt = (n) => n != null ? Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00';

  return (
    <div className="ba-container">
      <style>{pageStyles}</style>
      <Navbar />
      <div style={{ display: 'flex', flex: 1 }}>
        <Sidebar />
        <main className="ba-main admin-main">
          <div className="ba-header">
            <h2>Bank Accounts</h2>
            <button className="btn btn-primary" onClick={openNew}>+ Add Bank Account</button>
          </div>

          {msg && <div className={`ba-msg ba-msg-${msg.type}`}>{msg.text}</div>}

          {loading ? <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>Loading...</div> :
            accounts.length === 0 ? <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>No bank accounts found</div> : (
            <table className="ba-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Bank Name</th>
                  <th>Account No.</th>
                  <th>Type</th>
                  <th>COA</th>
                  <th style={{ textAlign: 'right' }}>Opening Bal.</th>
                  <th style={{ textAlign: 'right' }}>Current Bal.</th>
                  <th>Format</th>
                  <th>Assigned To</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map(a => (
                  <tr key={a._id}>
                    <td><strong>{a.bank_code}</strong></td>
                    <td>{a.bank_name}</td>
                    <td>{a.account_no || '—'}</td>
                    <td>{a.account_type}</td>
                    <td>{a.coa_code || '—'}</td>
                    <td className="money">{fmt(a.opening_balance)}</td>
                    <td className="money">{fmt(a.current_balance)}</td>
                    <td>{a.statement_import_format || 'CSV'}</td>
                    <td style={{ fontSize: 12 }}>{a.assigned_users?.length ? a.assigned_users.map(u => u.name || u).join(', ') : <span style={{ color: '#9ca3af' }}>All</span>}</td>
                    <td><span className={a.is_active ? 'badge-active' : 'badge-inactive'}>{a.is_active ? 'Active' : 'Inactive'}</span></td>
                    <td><button className="btn btn-sm btn-primary" onClick={() => openEdit(a)}>Edit</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {showModal && (
            <div className="ba-modal" onClick={() => setShowModal(false)}>
              <div className="ba-modal-body" onClick={e => e.stopPropagation()}>
                <h3 style={{ marginTop: 0 }}>{editing ? 'Edit' : 'Add'} Bank Account</h3>
                <div className="ba-row">
                  <div className="ba-fg">
                    <label>Bank Code</label>
                    <input value={form.bank_code} onChange={e => f('bank_code', e.target.value)} disabled={!!editing} placeholder="e.g. RCBC_CA" />
                  </div>
                  <div className="ba-fg">
                    <label>Bank Name</label>
                    <input value={form.bank_name} onChange={e => f('bank_name', e.target.value)} placeholder="e.g. RCBC Current" />
                  </div>
                </div>
                <div className="ba-row">
                  <div className="ba-fg">
                    <label>Account Number</label>
                    <input value={form.account_no} onChange={e => f('account_no', e.target.value)} placeholder="Account number" />
                  </div>
                  <div className="ba-fg">
                    <label>Account Type</label>
                    <select value={form.account_type} onChange={e => f('account_type', e.target.value)}>
                      <option value="SAVINGS">Savings</option>
                      <option value="CHECKING">Checking</option>
                      <option value="CURRENT">Current</option>
                    </select>
                  </div>
                </div>
                <div className="ba-row">
                  <div className="ba-fg">
                    <label>COA Code</label>
                    <input value={form.coa_code} onChange={e => f('coa_code', e.target.value)} placeholder="e.g. 1010" />
                  </div>
                  <div className="ba-fg">
                    <label>Opening Balance</label>
                    <input type="number" step="0.01" value={form.opening_balance} onChange={e => f('opening_balance', e.target.value)} />
                  </div>
                </div>
                <div className="ba-fg">
                  <label>Statement Import Format</label>
                  <select value={form.statement_import_format} onChange={e => f('statement_import_format', e.target.value)}>
                    <option value="CSV">CSV</option>
                    <option value="OFX">OFX</option>
                    <option value="MT940">MT940</option>
                  </select>
                </div>
                <div className="ba-fg">
                  <label>Assign To (users who can deposit/use this account)</label>
                  <div style={{ maxHeight: 160, overflowY: 'auto', border: '1px solid var(--erp-border, #e5e7eb)', borderRadius: 6, padding: 6 }}>
                    {users.filter(u => u.isActive !== false).map(u => (
                      <label key={u._id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px', fontSize: 13, cursor: 'pointer' }}>
                        <input type="checkbox" checked={form.assigned_users.includes(u._id)} onChange={e => {
                          if (e.target.checked) f('assigned_users', [...form.assigned_users, u._id]);
                          else f('assigned_users', form.assigned_users.filter(id => id !== u._id));
                        }} style={{ width: 'auto' }} />
                        {u.name} <span style={{ color: '#9ca3af', fontSize: 11 }}>({u.role})</span>
                      </label>
                    ))}
                    {!users.length && <div style={{ padding: 8, color: '#9ca3af', fontSize: 12 }}>No users loaded</div>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
                  <button className="btn btn-outline" onClick={() => setShowModal(false)}>Cancel</button>
                  <button className="btn btn-primary" onClick={handleSave}>{editing ? 'Update' : 'Create'}</button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
