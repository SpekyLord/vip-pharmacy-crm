import { useState, useEffect, useCallback } from 'react';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import { useAuth } from '../../hooks/useAuth';
import { ROLE_SETS } from '../../constants/roles';
import useAccounting from '../hooks/useAccounting';
import { showError, showSuccess } from '../utils/errorToast';
import WorkflowGuide from '../components/WorkflowGuide';

const pageStyles = `
  .rj-page { background: var(--erp-bg, #f4f7fb); min-height: 100vh; }
  .rj-main { flex: 1; min-width: 0; overflow-y: auto; padding: 20px; max-width: 1200px; margin: 0 auto; }
  .rj-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 8px; }
  .rj-header h2 { font-size: 20px; font-weight: 700; margin: 0; color: var(--erp-text); }
  .rj-actions { display: flex; gap: 8px; flex-wrap: wrap; }
  .btn { padding: 7px 14px; border-radius: 8px; border: none; cursor: pointer; font-size: 13px; font-weight: 600; }
  .btn-primary { background: var(--erp-accent, #2563eb); color: #fff; }
  .btn-success { background: #16a34a; color: #fff; }
  .btn-danger { background: #dc2626; color: #fff; }
  .btn-outline { background: transparent; border: 1px solid var(--erp-border); color: var(--erp-text); }
  .btn-sm { padding: 5px 10px; font-size: 12px; }
  .rj-table-wrap { overflow-x: auto; }
  .rj-table { width: 100%; border-collapse: collapse; font-size: 13px; background: var(--erp-panel); border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,.06); }
  .rj-table th { background: var(--erp-accent-soft, #e8efff); padding: 10px; text-align: left; font-size: 11px; font-weight: 600; color: var(--erp-muted); white-space: nowrap; }
  .rj-table td { padding: 10px; border-top: 1px solid var(--erp-border); }
  .rj-table tr:hover { background: var(--erp-accent-soft); }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 500; }
  .badge-active { background: #dcfce7; color: #166534; }
  .badge-inactive { background: #f3f4f6; color: #6b7280; }
  .rj-modal { position: fixed; inset: 0; background: rgba(0,0,0,.45); display: flex; align-items: center; justify-content: center; z-index: 100; }
  .rj-modal-body { background: var(--erp-panel, #fff); border-radius: 12px; padding: 24px; width: 700px; max-width: 95vw; max-height: 90vh; overflow-y: auto; }
  .rj-modal-body h3 { margin: 0 0 16px; font-size: 16px; color: var(--erp-text); }
  .form-group { margin-bottom: 12px; }
  .form-group label { display: block; font-size: 12px; font-weight: 600; margin-bottom: 4px; color: var(--erp-muted); }
  .form-group input, .form-group select { width: 100%; padding: 8px 10px; border-radius: 6px; border: 1px solid var(--erp-border); font-size: 13px; box-sizing: border-box; background: var(--erp-panel); color: var(--erp-text); }
  .rj-line-row { display: grid; grid-template-columns: 100px 1fr 100px 100px 40px; gap: 6px; align-items: center; margin-bottom: 6px; }
  .rj-line-row input { padding: 6px 8px; font-size: 12px; border: 1px solid var(--erp-border); border-radius: 6px; box-sizing: border-box; background: var(--erp-panel); color: var(--erp-text); }
  .balance-ok { color: #16a34a; font-weight: 600; }
  .balance-err { color: #dc2626; font-weight: 600; }
  .rj-empty { text-align: center; color: var(--erp-muted); padding: 40px; }
  .upload-input { display: none; }
  @media(max-width: 768px) {
    .rj-main { padding: 12px; padding-bottom: calc(80px + env(safe-area-inset-bottom, 0px)); }
    .rj-line-row { grid-template-columns: 1fr; }
  }
  @media(max-width: 375px) {
    .rj-main { padding: 8px; padding-bottom: calc(80px + env(safe-area-inset-bottom, 0px)); }
    .btn { font-size: 12px; }
    .form-group input, .form-group select { font-size: 16px; }
  }
`;

const EMPTY_LINE = { account_code: '', account_name: '', debit: '', credit: '', description: '' };
const fmt = (n) => `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;

export function RecurringJournalsContent() {
  const { user } = useAuth();
  const api = useAccounting();
  const isAdmin = ROLE_SETS.MANAGEMENT.includes(user?.role);

  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(null);

  const [form, setForm] = useState({ name: '', description: '', frequency: 'MONTHLY', day_of_month: 1, auto_post: false, source_module: 'MANUAL' });
  const [lines, setLines] = useState([{ ...EMPTY_LINE }, { ...EMPTY_LINE }]);

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.listRecurringTemplates();
      setTemplates(res?.data || []);
    } catch (err) { showError(err, 'Recurring journals operation failed'); }
    setLoading(false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadTemplates(); }, [loadTemplates]);

  const totalDR = lines.reduce((s, l) => s + (parseFloat(l.debit) || 0), 0);
  const totalCR = lines.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0);
  const isBalanced = Math.abs(totalDR - totalCR) <= 0.01 && totalDR > 0;

  const openCreate = () => {
    setForm({ name: '', description: '', frequency: 'MONTHLY', day_of_month: 1, auto_post: false, source_module: 'MANUAL' });
    setLines([{ ...EMPTY_LINE }, { ...EMPTY_LINE }]);
    setEditing(null);
    setShowModal(true);
  };

  const openEdit = (tpl) => {
    setForm({ name: tpl.name, description: tpl.description || '', frequency: tpl.frequency, day_of_month: tpl.day_of_month, auto_post: tpl.auto_post, source_module: tpl.source_module || 'MANUAL' });
    setLines((tpl.lines || []).map(l => ({ account_code: l.account_code, account_name: l.account_name, debit: l.debit || '', credit: l.credit || '', description: l.description || '' })));
    setEditing(tpl._id);
    setShowModal(true);
  };

  const handleSave = async () => {
    const cleanLines = lines.filter(l => l.account_code && (parseFloat(l.debit) > 0 || parseFloat(l.credit) > 0))
      .map(l => ({ account_code: l.account_code, account_name: l.account_name || l.account_code, debit: parseFloat(l.debit) || 0, credit: parseFloat(l.credit) || 0, description: l.description }));
    if (cleanLines.length < 2) { showError(null, 'At least 2 journal lines required'); return; }
    setSaving(true);
    try {
      const payload = { ...form, lines: cleanLines };
      if (editing) await api.updateRecurringTemplate(editing, payload);
      else await api.createRecurringTemplate(payload);
      setShowModal(false);
      loadTemplates();
    } catch (err) { showError(err, 'Recurring journals operation failed'); }
    setSaving(false);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this template?')) return;
    try { await api.deleteRecurringTemplate(id); loadTemplates(); } catch (err) { showError(err, 'Recurring journals operation failed'); }
  };

  const handleRunNow = async (id) => {
    if (!window.confirm('Run this template now? A journal entry will be created.')) return;
    setRunning(id);
    try {
      const res = await api.runRecurringTemplate(id);
      showSuccess(`${res?.data?.je_number} created (${res?.data?.status})`);
      loadTemplates();
    } catch (err) { showError(err, 'Recurring journals operation failed'); }
    setRunning(null);
  };

  const handleRunAllDue = async () => {
    if (!window.confirm('Run all due templates?')) return;
    setRunning('all');
    try {
      const res = await api.runAllDueTemplates();
      showSuccess(res?.message || 'Done');
      loadTemplates();
    } catch (err) { showError(err, 'Recurring journals operation failed'); }
    setRunning(null);
  };

  const handleExport = async () => {
    try {
      const res = await api.get('/recurring-journals/export', { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([res]));
      const a = document.createElement('a'); a.href = url; a.download = 'recurring-journal-templates.xlsx'; a.click();
      URL.revokeObjectURL(url);
    } catch (err) { showError(err, 'Recurring journals operation failed'); }
  };

  const handleImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    try {
      const res = await api.post('/recurring-journals/import', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      showSuccess(res?.message || 'Import complete');
      loadTemplates();
    } catch (err) { showError(err, 'Recurring journals operation failed'); }
    e.target.value = '';
  };

  return (
    <>
      <style>{pageStyles}</style>
      <div className="rj-header">
        <h2>Recurring Journal Templates</h2>
        <div className="rj-actions">
          <button className="btn btn-outline" onClick={handleExport}>Export Excel</button>
          {isAdmin && <>
            <label className="btn btn-outline" style={{ cursor: 'pointer' }}>Import Excel<input type="file" accept=".xlsx,.xls,.csv" className="upload-input" onChange={handleImport} /></label>
            <button className="btn btn-success" onClick={handleRunAllDue} disabled={running === 'all'}>{running === 'all' ? 'Running...' : 'Run All Due'}</button>
            <button className="btn btn-primary" onClick={openCreate}>+ New Template</button>
          </>}
        </div>
      </div>

      {loading ? <div className="rj-empty">Loading...</div> : templates.length === 0 ? <div className="rj-empty">No recurring templates. Create one to automate journal entries.</div> : (
        <div className="rj-table-wrap">
          <table className="rj-table">
            <thead><tr><th>Name</th><th>Frequency</th><th>Day</th><th>Auto Post</th><th>Next Run</th><th>Last Run</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {templates.map(t => (
                <tr key={t._id}>
                  <td style={{ fontWeight: 600 }}>{t.name}</td>
                  <td>{t.frequency}</td>
                  <td>{t.day_of_month}</td>
                  <td>{t.auto_post ? 'Yes' : 'No'}</td>
                  <td>{t.next_run_date ? new Date(t.next_run_date).toLocaleDateString() : '—'}</td>
                  <td>{t.last_run_date ? new Date(t.last_run_date).toLocaleDateString() : '—'}</td>
                  <td><span className={`badge ${t.is_active ? 'badge-active' : 'badge-inactive'}`}>{t.is_active ? 'Active' : 'Inactive'}</span></td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {isAdmin && t.is_active && <button className="btn btn-success btn-sm" onClick={() => handleRunNow(t._id)} disabled={running === t._id}>{running === t._id ? '...' : 'Run'}</button>}
                      {isAdmin && <button className="btn btn-outline btn-sm" onClick={() => openEdit(t)}>Edit</button>}
                      {isAdmin && <button className="btn btn-danger btn-sm" onClick={() => handleDelete(t._id)}>Del</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="rj-modal" onClick={() => setShowModal(false)}>
          <div className="rj-modal-body" onClick={e => e.stopPropagation()}>
            <h3>{editing ? 'Edit' : 'New'} Recurring Template</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group"><label>Name</label><input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
              <div className="form-group"><label>Source Module</label><input value={form.source_module} onChange={e => setForm(f => ({ ...f, source_module: e.target.value }))} /></div>
              <div className="form-group"><label>Frequency</label>
                <select value={form.frequency} onChange={e => setForm(f => ({ ...f, frequency: e.target.value }))}>
                  <option value="MONTHLY">Monthly</option><option value="QUARTERLY">Quarterly</option><option value="ANNUALLY">Annually</option>
                </select>
              </div>
              <div className="form-group"><label>Day of Month (1-28)</label><input type="number" min={1} max={28} value={form.day_of_month} onChange={e => setForm(f => ({ ...f, day_of_month: parseInt(e.target.value) || 1 }))} /></div>
            </div>
            <div className="form-group"><label>Description</label><input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
            <div className="form-group" style={{ flexDirection: 'row', display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" checked={form.auto_post} onChange={e => setForm(f => ({ ...f, auto_post: e.target.checked }))} style={{ width: 'auto' }} />
              <label style={{ margin: 0, fontSize: 13 }}>Auto-post after creation</label>
            </div>

            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--erp-muted)', display: 'block', marginTop: 12, marginBottom: 6 }}>Journal Lines</label>
            {lines.map((l, i) => (
              <div key={i} className="rj-line-row">
                <input placeholder="Code" value={l.account_code} onChange={e => { const n = [...lines]; n[i].account_code = e.target.value; setLines(n); }} />
                <input placeholder="Account name" value={l.account_name} onChange={e => { const n = [...lines]; n[i].account_name = e.target.value; setLines(n); }} />
                <input type="number" placeholder="DR" value={l.debit} onChange={e => { const n = [...lines]; n[i].debit = e.target.value; setLines(n); }} />
                <input type="number" placeholder="CR" value={l.credit} onChange={e => { const n = [...lines]; n[i].credit = e.target.value; setLines(n); }} />
                <button className="btn btn-sm" style={{ background: '#fee2e2', color: '#dc2626' }} onClick={() => { if (lines.length > 2) setLines(lines.filter((_, j) => j !== i)); }}>✕</button>
              </div>
            ))}
            <button className="btn btn-sm btn-outline" style={{ marginBottom: 12 }} onClick={() => setLines([...lines, { ...EMPTY_LINE }])}>+ Add Line</button>
            <div style={{ display: 'flex', gap: 16, fontSize: 13, marginBottom: 8 }}>
              <span>DR: {fmt(totalDR)}</span>
              <span>CR: {fmt(totalCR)}</span>
              <span className={isBalanced ? 'balance-ok' : 'balance-err'}>{isBalanced ? '✓ Balanced' : '✗ Unbalanced'}</span>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-outline" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" disabled={!isBalanced || saving} onClick={handleSave}>{saving ? 'Saving...' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default function RecurringJournals() {
  return (
    <div className="rj-page">
      <Navbar />
      <div style={{ display: 'flex', flex: 1 }}>
        <Sidebar />
        <main className="rj-main admin-main">
          <WorkflowGuide pageKey="recurring-journals" />
          <RecurringJournalsContent />
        </main>
      </div>
    </div>
  );
}
