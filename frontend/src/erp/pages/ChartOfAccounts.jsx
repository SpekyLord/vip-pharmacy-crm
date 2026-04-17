import { useState, useEffect, useCallback } from 'react';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import { useAuth } from '../../hooks/useAuth';
import { ROLE_SETS } from '../../constants/roles';
import useAccounting from '../hooks/useAccounting';
import useErpApi from '../hooks/useErpApi';

import SelectField from '../../components/common/Select';
import { useLookupOptions } from '../hooks/useLookups';
import { showError, showSuccess } from '../utils/errorToast';
import WorkflowGuide from '../components/WorkflowGuide';

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
  .upload-input { display: none; }
  @media(max-width: 768px) { .coa-main { padding: 12px; padding-bottom: calc(80px + env(safe-area-inset-bottom, 0px)); } }
  @media(max-width: 375px) { .coa-main { padding: 8px; padding-bottom: calc(80px + env(safe-area-inset-bottom, 0px)); } .form-group input, .form-group select { font-size: 16px; } }
`;

export function ChartOfAccountsContent() {
  const { user } = useAuth();
  const api = useAccounting();
  const erpApi = useErpApi();
  const isAdmin = ROLE_SETS.MANAGEMENT.includes(user?.role);
  const { options: acctTypeOpts } = useLookupOptions('ACCOUNT_TYPE');
  const ACCOUNT_TYPES = acctTypeOpts.map(o => o.code);

  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ account_code: '', account_name: '', account_type: 'ASSET', normal_balance: 'DEBIT', account_subtype: '', bir_flag: 'BOTH' });

  const loadAccounts = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (search) params.search = search;
      if (typeFilter) params.account_type = typeFilter;
      const res = await api.listAccounts(params);
      setAccounts(res?.data || []);
    } catch (err) { console.error(err); }
    setLoading(false);
  }, [search, typeFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadAccounts(); }, [loadAccounts]);

  const handleExport = async () => {
    try {
      const res = await api.exportAccounts();
      const url = URL.createObjectURL(new Blob([res]));
      const a = document.createElement('a'); a.href = url; a.download = 'coa-export.xlsx'; a.click();
      URL.revokeObjectURL(url);
    } catch (err) { console.error(err); }
  };

  const handleImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    try {
      const res = await api.importAccounts(fd);
      showSuccess(res?.message || 'Import complete');
      loadAccounts();
    } catch (err) { console.error(err); }
    e.target.value = '';
  };

  const handleSeedCOA = async () => {
    if (!confirm('This will create default COA accounts for this entity. Existing accounts will not be overwritten. Continue?')) return;
    try {
      const res = await erpApi.post('/coa/seed');
      showSuccess(res?.message || 'COA seed complete');
      loadAccounts();
    } catch (err) {
      showError(err, 'Could not seed chart of accounts');
    }
  };

  const resetForm = () => setForm({ account_code: '', account_name: '', account_type: 'ASSET', normal_balance: 'DEBIT', account_subtype: '', bir_flag: 'BOTH' });

  const handleCreate = async () => {
    try {
      await api.createAccount(form);
      setShowModal(false);
      setEditingId(null);
      resetForm();
      loadAccounts();
    } catch (err) { console.error(err); }
  };

  const openEdit = (acct) => {
    setEditingId(acct._id);
    setForm({
      account_code: acct.account_code,
      account_name: acct.account_name,
      account_type: acct.account_type,
      normal_balance: acct.normal_balance,
      account_subtype: acct.account_subtype || '',
      bir_flag: acct.bir_flag || 'BOTH',
    });
    setShowModal(true);
  };

  const handleUpdate = async () => {
    try {
      await api.updateAccount(editingId, {
        account_name: form.account_name,
        normal_balance: form.normal_balance,
        account_subtype: form.account_subtype,
        bir_flag: form.bir_flag,
      });
      setShowModal(false);
      setEditingId(null);
      resetForm();
      loadAccounts();
    } catch (err) { console.error(err); }
  };

  const handleToggleActive = async (acct) => {
    try {
      await api.updateAccount(acct._id, { is_active: !acct.is_active });
      loadAccounts();
    } catch (err) { console.error(err); }
  };

  return (
    <>
      <style>{pageStyles}</style>
      <div className="coa-header">
        <h2>Chart of Accounts</h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {isAdmin && accounts.length === 0 && <button className="btn btn-success" onClick={handleSeedCOA}>Seed Default COA</button>}
          <button className="btn btn-outline" onClick={handleExport}>Export Excel</button>
          {isAdmin && <label className="btn btn-outline" style={{ cursor: 'pointer' }}>Import Excel<input type="file" accept=".xlsx,.xls,.csv" className="upload-input" onChange={handleImport} /></label>}
          {isAdmin && <button className="btn btn-primary" onClick={() => { setEditingId(null); resetForm(); setShowModal(true); }}>+ Add Account</button>}
        </div>
      </div>

      <div className="coa-controls">
        <input placeholder="Search code or name…" value={search} onChange={e => setSearch(e.target.value)} />
        <SelectField value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
          <option value="">All Types</option>
          {ACCOUNT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </SelectField>
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
              {isAdmin && <th></th>}
            </tr>
          </thead>
          <tbody>
            {accounts.map(a => (
              <tr key={a._id} style={{ opacity: a.is_active ? 1 : 0.5 }}>
                <td style={{ fontWeight: 600, fontFamily: 'monospace' }}>{a.account_code}</td>
                <td>{a.account_name}</td>
                <td><span className={`type-badge type-${a.account_type}`}>{a.account_type}</span></td>
                <td>{a.account_subtype || '—'}</td>
                <td>{a.normal_balance}</td>
                <td>{a.bir_flag}</td>
                <td>{a.is_active ? '✓ Active' : '✗ Inactive'}</td>
                {isAdmin && (
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn btn-sm" style={{ background: 'var(--erp-accent-soft)', color: 'var(--erp-accent)', marginRight: 4 }} onClick={() => openEdit(a)}>Edit</button>
                    <button className="btn btn-sm" style={{ background: a.is_active ? '#fee2e2' : '#dcfce7', color: a.is_active ? '#991b1b' : '#166534' }} onClick={() => handleToggleActive(a)}>
                      {a.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {showModal && (
        <div className="coa-modal" onClick={() => { setShowModal(false); setEditingId(null); resetForm(); }}>
          <div className="coa-modal-body" onClick={e => e.stopPropagation()}>
            <h3>{editingId ? 'Edit Account' : 'New Account'}</h3>
            <div className="form-group">
              <label>Account Code</label>
              <input value={form.account_code} onChange={e => setForm({ ...form, account_code: e.target.value })} placeholder="e.g. 1015" disabled={!!editingId} />
            </div>
            <div className="form-group">
              <label>Account Name</label>
              <input value={form.account_name} onChange={e => setForm({ ...form, account_name: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Account Type</label>
              <SelectField value={form.account_type} onChange={e => setForm({ ...form, account_type: e.target.value })} disabled={!!editingId}>
                {ACCOUNT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </SelectField>
            </div>
            <div className="form-group">
              <label>Normal Balance</label>
              <SelectField value={form.normal_balance} onChange={e => setForm({ ...form, normal_balance: e.target.value })}>
                <option value="DEBIT">DEBIT</option>
                <option value="CREDIT">CREDIT</option>
              </SelectField>
            </div>
            <div className="form-group">
              <label>Subtype</label>
              <input value={form.account_subtype} onChange={e => setForm({ ...form, account_subtype: e.target.value })} placeholder="e.g. Bank, Receivable" />
            </div>
            <div className="form-group">
              <label>BIR Flag</label>
              <SelectField value={form.bir_flag} onChange={e => setForm({ ...form, bir_flag: e.target.value })}>
                <option value="BOTH">BOTH</option>
                <option value="INTERNAL">INTERNAL</option>
                <option value="BIR">BIR</option>
              </SelectField>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn" onClick={() => { setShowModal(false); setEditingId(null); resetForm(); }}>Cancel</button>
              <button className="btn btn-primary" onClick={editingId ? handleUpdate : handleCreate}>
                {editingId ? 'Save Changes' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default function ChartOfAccounts() {
  return (
    <div className="coa-page">
      <Navbar />
      <div style={{ display: 'flex', flex: 1 }}>
        <Sidebar />
        <main className="coa-main admin-main">
          <WorkflowGuide pageKey="chart-of-accounts" />
          <ChartOfAccountsContent />
        </main>
      </div>
    </div>
  );
}
