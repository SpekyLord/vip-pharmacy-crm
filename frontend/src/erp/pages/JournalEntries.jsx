import { useState, useEffect, useCallback } from 'react';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import { useAuth } from '../../hooks/useAuth';
import { ROLE_SETS } from '../../constants/roles';
import useAccounting from '../hooks/useAccounting';
import { showError, showApprovalPending } from '../utils/errorToast';

import SelectField from '../../components/common/Select';
import WorkflowGuide from '../components/WorkflowGuide';

const pageStyles = `
  .je-page { background: var(--erp-bg, #f4f7fb); min-height: 100vh; }
  .je-main { flex: 1; min-width: 0; overflow-y: auto; padding: 20px; max-width: 1200px; margin: 0 auto; }
  .je-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 8px; }
  .je-header h2 { font-size: 20px; font-weight: 700; margin: 0; }
  .je-controls { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 14px; }
  .je-controls input, .je-controls select { padding: 6px 10px; border-radius: 6px; border: 1px solid var(--erp-border); font-size: 13px; }
  .btn { padding: 6px 14px; border-radius: 6px; border: none; cursor: pointer; font-size: 13px; font-weight: 500; }
  .btn-primary { background: var(--erp-accent, #1e5eff); color: #fff; }
  .btn-success { background: #16a34a; color: #fff; }
  .btn-danger { background: #dc2626; color: #fff; }
  .btn-sm { padding: 4px 10px; font-size: 12px; }
  .je-table { width: 100%; border-collapse: collapse; font-size: 13px; background: var(--erp-panel); border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,.06); }
  .je-table th { background: var(--erp-accent-soft, #e8efff); padding: 10px; text-align: left; font-size: 11px; font-weight: 600; color: var(--erp-muted); }
  .je-table td { padding: 10px; border-top: 1px solid var(--erp-border); }
  .je-table tr:hover { background: var(--erp-accent-soft); }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 500; }
  .badge-DRAFT { background: #fef3c7; color: #92400e; }
  .badge-POSTED { background: #dcfce7; color: #166534; }
  .badge-VOID { background: #fee2e2; color: #dc2626; }
  .je-detail { background: var(--erp-panel); border-radius: 12px; padding: 20px; box-shadow: 0 1px 3px rgba(0,0,0,.06); }
  .je-lines-table { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 12px; }
  .je-lines-table th { padding: 8px; text-align: left; font-size: 11px; font-weight: 600; border-bottom: 2px solid var(--erp-border); }
  .je-lines-table td { padding: 8px; border-top: 1px solid var(--erp-border); }
  .je-lines-table .dr { color: #1e40af; font-weight: 600; }
  .je-lines-table .cr { color: #dc2626; font-weight: 600; }
  .je-totals { display: flex; gap: 24px; margin-top: 12px; font-size: 14px; font-weight: 600; }
  .je-modal { position: fixed; inset: 0; background: rgba(0,0,0,.4); display: flex; align-items: center; justify-content: center; z-index: 100; }
  .je-modal-body { background: var(--erp-panel, #fff); border-radius: 12px; padding: 24px; width: 700px; max-width: 95vw; max-height: 90vh; overflow-y: auto; }
  .form-group { margin-bottom: 12px; }
  .form-group label { display: block; font-size: 12px; font-weight: 600; margin-bottom: 4px; color: var(--erp-muted); }
  .form-group input, .form-group select, .form-group textarea { width: 100%; padding: 8px 10px; border-radius: 6px; border: 1px solid var(--erp-border); font-size: 13px; box-sizing: border-box; }
  .je-line-row { display: grid; grid-template-columns: 100px 1fr 100px 100px 40px; gap: 6px; align-items: center; margin-bottom: 6px; }
  .je-line-row input { padding: 6px 8px; font-size: 12px; }
  .balance-ok { color: #16a34a; }
  .balance-err { color: #dc2626; }
  .je-empty { text-align: center; color: #64748b; padding: 40px; }
  .je-back { cursor: pointer; font-size: 13px; color: var(--erp-accent); margin-bottom: 12px; display: inline-block; }
  .je-batch-bar { display: flex; gap: 8px; align-items: center; padding: 10px 14px; background: #eff6ff; border-radius: 8px; margin-bottom: 10px; font-size: 13px; color: #1e40af; flex-wrap: wrap; }
  .je-batch-bar strong { font-weight: 700; }
  .je-chk { width: 16px; height: 16px; cursor: pointer; accent-color: var(--erp-accent); }
  .je-batch-result { position: fixed; inset: 0; background: rgba(0,0,0,.4); display: flex; align-items: center; justify-content: center; z-index: 100; }
  .je-batch-result-body { background: var(--erp-panel, #fff); border-radius: 12px; padding: 24px; width: 420px; max-width: 95vw; max-height: 80vh; overflow-y: auto; }
  @media(max-width: 768px) { .je-main { padding: 12px; padding-bottom: calc(80px + env(safe-area-inset-bottom, 0px)); } .je-line-row { grid-template-columns: 1fr; } }
  @media(max-width: 375px) { .je-main { padding: 8px; padding-bottom: calc(80px + env(safe-area-inset-bottom, 0px)); } .form-group input, .form-group select { font-size: 16px; } }
`;

const getCurrentPeriod = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const fmt = (n) => `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;

const EMPTY_LINE = { account_code: '', account_name: '', debit: '', credit: '', description: '' };

export default function JournalEntries() {
  const { user } = useAuth();
  const api = useAccounting();
  const isAdmin = ROLE_SETS.MANAGEMENT.includes(user?.role);

  const [view, setView] = useState('list');
  const [journals, setJournals] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);
  const [period, setPeriod] = useState(getCurrentPeriod());
  const [statusFilter, setStatusFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  // Batch post state
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [batchPosting, setBatchPosting] = useState(false);
  const [batchResults, setBatchResults] = useState(null);

  // Create form
  const [jeForm, setJeForm] = useState({ je_date: new Date().toISOString().slice(0, 10), description: '', bir_flag: 'BOTH' });
  const [lines, setLines] = useState([{ ...EMPTY_LINE }, { ...EMPTY_LINE }]);

  const loadJournals = useCallback(async () => {
    setLoading(true);
    try {
      const params = { period };
      if (statusFilter) params.status = statusFilter;
      const res = await api.listJournals(params);
      setJournals(res?.data || []);
    } catch (err) { showError(err, 'Could not load journals'); }
    setLoading(false);
  }, [period, statusFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadJournals(); }, [loadJournals]);

  const totalDR = lines.reduce((s, l) => s + (parseFloat(l.debit) || 0), 0);
  const totalCR = lines.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0);
  const isBalanced = Math.abs(totalDR - totalCR) <= 0.01 && totalDR > 0;

  const handleCreate = async () => {
    const cleanLines = lines.filter(l => l.account_code && (parseFloat(l.debit) > 0 || parseFloat(l.credit) > 0))
      .map(l => ({ account_code: l.account_code, account_name: l.account_name || l.account_code, debit: parseFloat(l.debit) || 0, credit: parseFloat(l.credit) || 0, description: l.description }));
    try {
      await api.createJournal({ ...jeForm, period, lines: cleanLines });
      setShowCreate(false);
      setLines([{ ...EMPTY_LINE }, { ...EMPTY_LINE }]);
      loadJournals();
    } catch (err) { showError(err, 'Could not create journal entry'); }
  };

  const handlePost = async (id) => {
    try {
      const res = await api.postJournal(id);
      if (res?.approval_pending) { showApprovalPending(res.message); }
      loadJournals(); if (selected?._id === id) viewDetail(id);
    } catch (err) {
      if (err?.response?.data?.approval_pending) { showApprovalPending(err.response.data.message); loadJournals(); }
      else showError(err, 'Could not post journal');
    }
  };

  const draftIds = journals.filter(j => j.status === 'DRAFT').map(j => j._id);
  const toggleSelect = (id) => setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleSelectAll = () => {
    if (draftIds.every(id => selectedIds.has(id))) setSelectedIds(new Set());
    else setSelectedIds(new Set(draftIds));
  };

  const handleBatchPost = async () => {
    if (!selectedIds.size) return;
    if (!window.confirm(`Post ${selectedIds.size} journal entries? This action cannot be undone.`)) return;
    setBatchPosting(true);
    try {
      const res = await api.batchPostJournals([...selectedIds]);
      if (res?.approval_pending) { showApprovalPending(res.message); }
      else { setBatchResults(res?.data?.results || []); setSelectedIds(new Set()); }
      loadJournals();
    } catch (err) {
      if (err?.response?.data?.approval_pending) { showApprovalPending(err.response.data.message); loadJournals(); }
      else { setBatchResults(err?.response?.data?.data?.results || [{ success: false, reason: err?.message || 'Error' }]); }
    }
    setBatchPosting(false);
  };

  const handleReverse = async (id) => {
    const reason = prompt('Reversal reason:');
    if (!reason) return;
    try { await api.reverseJournal(id, { reason }); loadJournals(); } catch (err) { showError(err, 'Could not reverse journal'); }
  };

  const viewDetail = async (id) => {
    try {
      const res = await api.getJournal(id);
      setSelected(res?.data || null);
      setView('detail');
    } catch (err) { showError(err, 'Could not load journal details'); }
  };

  return (
    <div className="je-page">
      <style>{pageStyles}</style>
      <Navbar />
      <div style={{ display: 'flex', flex: 1 }}>
        <Sidebar />
        <main className="je-main admin-main">
          <WorkflowGuide pageKey="journal-entries" />
          {view === 'list' ? (
            <>
              <div className="je-header">
                <h2>Journal Entries</h2>
                {isAdmin && <button className="btn btn-primary" onClick={() => setShowCreate(true)}>+ Manual JE</button>}
              </div>
              <div className="je-controls">
                <input type="month" value={period} onChange={e => setPeriod(e.target.value)} />
                <SelectField value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                  <option value="">All Status</option>
                  <option value="DRAFT">DRAFT</option>
                  <option value="POSTED">POSTED</option>
                  <option value="VOID">VOID</option>
                </SelectField>
              </div>
              {selectedIds.size > 0 && (
                <div className="je-batch-bar">
                  <strong>{selectedIds.size}</strong> draft(s) selected
                  <button className="btn btn-success btn-sm" onClick={handleBatchPost} disabled={batchPosting}>
                    {batchPosting ? 'Posting...' : `Batch Post (${selectedIds.size})`}
                  </button>
                  <button className="btn btn-sm" style={{ background: '#fee2e2', color: '#dc2626' }} onClick={() => setSelectedIds(new Set())}>Clear</button>
                </div>
              )}
              {loading ? <div className="je-empty">Loading…</div> : journals.length === 0 ? <div className="je-empty">No journal entries</div> : (
                <div className="govr-table-wrap" style={{ overflowX: 'auto' }}>
                <table className="je-table">
                  <thead><tr>
                    {isAdmin && draftIds.length > 0 && <th style={{ width: 36 }}><input type="checkbox" className="je-chk" checked={draftIds.length > 0 && draftIds.every(id => selectedIds.has(id))} onChange={toggleSelectAll} title="Select all drafts" /></th>}
                    <th>JE#</th><th>Date</th><th>Description</th><th>Source</th><th>DR</th><th>CR</th><th>Status</th><th>Actions</th>
                  </tr></thead>
                  <tbody>
                    {journals.map(j => (
                      <tr key={j._id} style={{ cursor: 'pointer' }} onClick={() => viewDetail(j._id)}>
                        {isAdmin && draftIds.length > 0 && (
                          <td onClick={e => e.stopPropagation()}>
                            {j.status === 'DRAFT' && <input type="checkbox" className="je-chk" checked={selectedIds.has(j._id)} onChange={() => toggleSelect(j._id)} />}
                          </td>
                        )}
                        <td style={{ fontWeight: 600 }}>{j.je_number}</td>
                        <td>{new Date(j.je_date).toLocaleDateString()}</td>
                        <td>{j.description || '—'}</td>
                        <td>{j.source_module}</td>
                        <td>{fmt(j.total_debit)}</td>
                        <td>{fmt(j.total_credit)}</td>
                        <td><span className={`badge badge-${j.status}`}>{j.status}</span></td>
                        <td onClick={e => e.stopPropagation()}>
                          {j.status === 'DRAFT' && isAdmin && <button className="btn btn-success btn-sm" onClick={() => handlePost(j._id)}>Post</button>}
                          {j.status === 'POSTED' && isAdmin && <button className="btn btn-danger btn-sm" onClick={() => handleReverse(j._id)}>Reverse</button>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              )}
            </>
          ) : (
            <>
              <span className="je-back" onClick={() => { setView('list'); setSelected(null); }}>← Back to list</span>
              {selected && (
                <div className="je-detail">
                  <h2>JE #{selected.je_number}</h2>
                  <p><strong>Date:</strong> {new Date(selected.je_date).toLocaleDateString()} &nbsp; <strong>Period:</strong> {selected.period} &nbsp; <strong>Source:</strong> {selected.source_module} &nbsp; <span className={`badge badge-${selected.status}`}>{selected.status}</span></p>
                  <p>{selected.description}</p>
                  {selected.is_reversal && <p style={{ color: '#dc2626' }}>↩ This is a reversal entry</p>}
                  <table className="je-lines-table">
                    <thead><tr><th>Account</th><th>Name</th><th>Debit</th><th>Credit</th><th>Description</th></tr></thead>
                    <tbody>
                      {(selected.lines || []).map((l, i) => (
                        <tr key={i}>
                          <td style={{ fontFamily: 'monospace' }}>{l.account_code}</td>
                          <td>{l.account_name}</td>
                          <td className="dr">{l.debit > 0 ? fmt(l.debit) : ''}</td>
                          <td className="cr">{l.credit > 0 ? fmt(l.credit) : ''}</td>
                          <td>{l.description || ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="je-totals">
                    <span>Total DR: {fmt(selected.total_debit)}</span>
                    <span>Total CR: {fmt(selected.total_credit)}</span>
                    <span className={Math.abs(selected.total_debit - selected.total_credit) <= 0.01 ? 'balance-ok' : 'balance-err'}>
                      {Math.abs(selected.total_debit - selected.total_credit) <= 0.01 ? '✓ Balanced' : '✗ Unbalanced'}
                    </span>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Batch Post Results */}
          {batchResults && (
            <div className="je-batch-result" onClick={() => setBatchResults(null)}>
              <div className="je-batch-result-body" onClick={e => e.stopPropagation()}>
                <h3>Batch Post Results</h3>
                <div style={{ marginBottom: 12 }}>
                  <span style={{ color: '#16a34a', fontWeight: 600 }}>{batchResults.filter(r => r.success).length} posted</span>
                  {batchResults.some(r => !r.success) && <span style={{ color: '#dc2626', fontWeight: 600, marginLeft: 12 }}>{batchResults.filter(r => !r.success).length} failed</span>}
                </div>
                {batchResults.filter(r => !r.success).map((r, i) => (
                  <div key={i} style={{ fontSize: 12, color: '#dc2626', marginBottom: 4 }}>JE #{r.je_number || r.id}: {r.reason}</div>
                ))}
                <div style={{ textAlign: 'right', marginTop: 16 }}>
                  <button className="btn btn-primary" onClick={() => setBatchResults(null)}>Close</button>
                </div>
              </div>
            </div>
          )}

          {showCreate && (
            <div className="je-modal" onClick={() => setShowCreate(false)}>
              <div className="je-modal-body" onClick={e => e.stopPropagation()}>
                <h3>Create Manual Journal Entry</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="form-group"><label>Date</label><input type="date" value={jeForm.je_date} onChange={e => setJeForm({ ...jeForm, je_date: e.target.value })} /></div>
                  <div className="form-group"><label>BIR Flag</label>
                    <SelectField value={jeForm.bir_flag} onChange={e => setJeForm({ ...jeForm, bir_flag: e.target.value })}>
                      <option value="BOTH">BOTH</option><option value="INTERNAL">INTERNAL</option><option value="BIR">BIR</option>
                    </SelectField>
                  </div>
                </div>
                <div className="form-group"><label>Description</label><input value={jeForm.description} onChange={e => setJeForm({ ...jeForm, description: e.target.value })} /></div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--erp-muted)' }}>Lines</label>
                {lines.map((l, i) => (
                  <div key={i} className="je-line-row">
                    <input placeholder="Code" value={l.account_code} onChange={e => { const n = [...lines]; n[i].account_code = e.target.value; setLines(n); }} />
                    <input placeholder="Account name" value={l.account_name} onChange={e => { const n = [...lines]; n[i].account_name = e.target.value; setLines(n); }} />
                    <input type="number" placeholder="DR" value={l.debit} onChange={e => { const n = [...lines]; n[i].debit = e.target.value; setLines(n); }} />
                    <input type="number" placeholder="CR" value={l.credit} onChange={e => { const n = [...lines]; n[i].credit = e.target.value; setLines(n); }} />
                    <button className="btn btn-sm" style={{ background: '#fee2e2', color: '#dc2626' }} onClick={() => { if (lines.length > 2) setLines(lines.filter((_, j) => j !== i)); }}>✕</button>
                  </div>
                ))}
                <button className="btn btn-sm" style={{ marginBottom: 12 }} onClick={() => setLines([...lines, { ...EMPTY_LINE }])}>+ Add Line</button>
                <div className="je-totals">
                  <span>DR: {fmt(totalDR)}</span>
                  <span>CR: {fmt(totalCR)}</span>
                  <span className={isBalanced ? 'balance-ok' : 'balance-err'}>{isBalanced ? '✓ Balanced' : '✗ Unbalanced'}</span>
                </div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
                  <button className="btn" onClick={() => setShowCreate(false)}>Cancel</button>
                  <button className="btn btn-primary" disabled={!isBalanced} onClick={handleCreate}>Create JE</button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
