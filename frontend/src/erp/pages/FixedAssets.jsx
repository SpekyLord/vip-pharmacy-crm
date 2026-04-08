import React, { useState, useEffect, useCallback } from 'react';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import { useAuth } from '../../hooks/useAuth';
import useAccounting from '../hooks/useAccounting';
import { showError, showSuccess } from '../utils/errorToast';
import WorkflowGuide from '../components/WorkflowGuide';

const pageStyles = `
  .fa-page { background: var(--erp-bg, #f4f7fb); min-height: 100vh; }
  .fa-main { flex: 1; min-width: 0; overflow-y: auto; padding: 20px; max-width: 1200px; margin: 0 auto; }
  .fa-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 8px; }
  .fa-header h2 { font-size: 20px; font-weight: 700; margin: 0; }
  .btn { padding: 6px 14px; border-radius: 6px; border: none; cursor: pointer; font-size: 13px; font-weight: 500; }
  .btn-primary { background: var(--erp-accent, #1e5eff); color: #fff; }
  .btn-success { background: #16a34a; color: #fff; }
  .btn-sm { padding: 4px 10px; font-size: 12px; }
  .fa-table { width: 100%; border-collapse: collapse; font-size: 13px; background: var(--erp-panel); border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,.06); }
  .fa-table th { background: var(--erp-accent-soft, #e8efff); padding: 10px; text-align: left; font-size: 11px; font-weight: 600; }
  .fa-table td { padding: 10px; border-top: 1px solid var(--erp-border); }
  .fa-table tr:hover { background: var(--erp-accent-soft); }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 500; }
  .badge-ACTIVE { background: #dcfce7; color: #166534; }
  .badge-DISPOSED { background: #fee2e2; color: #dc2626; }
  .badge-FULLY_DEPRECIATED { background: #f3f4f6; color: #6b7280; }
  .fa-modal { position: fixed; inset: 0; background: rgba(0,0,0,.4); display: flex; align-items: center; justify-content: center; z-index: 100; }
  .fa-modal-body { background: var(--erp-panel, #fff); border-radius: 12px; padding: 24px; width: 500px; max-width: 95vw; }
  .form-group { margin-bottom: 12px; }
  .form-group label { display: block; font-size: 12px; font-weight: 600; margin-bottom: 4px; color: var(--erp-muted); }
  .form-group input { width: 100%; padding: 8px 10px; border-radius: 6px; border: 1px solid var(--erp-border); font-size: 13px; box-sizing: border-box; }
  .fa-staging { background: var(--erp-panel); border-radius: 12px; padding: 20px; margin-top: 16px; box-shadow: 0 1px 3px rgba(0,0,0,.06); }
  .fa-controls { display: flex; gap: 8px; align-items: center; margin-bottom: 14px; flex-wrap: wrap; }
  .fa-controls input { padding: 6px 10px; border-radius: 6px; border: 1px solid var(--erp-border); font-size: 13px; }
  .fa-empty { text-align: center; color: #64748b; padding: 40px; }
  .fa-msg { font-size: 13px; margin-top: 8px; padding: 8px 12px; border-radius: 8px; background: #dcfce7; color: #166534; }
  @media(max-width: 768px) { .fa-main { padding: 12px; } }
`;

const fmt = (n) => `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
const getCurrentPeriod = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };

export function FixedAssetsContent() {
  const { user } = useAuth();
  const api = useAccounting();
  const isAdmin = ['admin', 'finance', 'president'].includes(user?.role);

  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ asset_code: '', asset_name: '', category: '', acquisition_date: '', acquisition_cost: '', useful_life_months: '60', salvage_value: '0' });
  const [period, setPeriod] = useState(getCurrentPeriod());
  const [staging, setStaging] = useState([]);
  const [msg, setMsg] = useState('');

  const handleExport = async () => {
    try {
      const res = await api.exportFixedAssets();
      const url = URL.createObjectURL(new Blob([res]));
      const a = document.createElement('a'); a.href = url; a.download = 'fixed-assets-export.xlsx'; a.click();
      URL.revokeObjectURL(url);
    } catch (err) { showError(err, 'Export failed'); }
  };
  const handleImport = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    const fd = new FormData(); fd.append('file', file);
    try { const res = await api.importFixedAssets(fd); showSuccess(res?.message || 'Import complete'); loadAssets(); } catch (err) { showError(err, 'Import failed'); }
    e.target.value = '';
  };

  const loadAssets = useCallback(async () => {
    setLoading(true);
    try { const res = await api.listFixedAssets(); setAssets(res?.data || []); } catch (err) { showError(err, 'Could not load fixed assets'); }
    setLoading(false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadAssets(); }, [loadAssets]);

  const handleCreate = async () => {
    try {
      await api.createFixedAsset({ ...form, acquisition_cost: parseFloat(form.acquisition_cost), useful_life_months: parseInt(form.useful_life_months), salvage_value: parseFloat(form.salvage_value) || 0 });
      setShowAdd(false);
      loadAssets();
    } catch (err) { showError(err, 'Could not create fixed asset'); }
  };

  const handleCompute = async () => {
    try { const res = await api.computeDepreciation({ period }); setMsg(`Computed: ${JSON.stringify(res?.data?.length || 0)} entries`); loadStaging(); } catch (err) { showError(err, 'Depreciation computation failed'); }
  };

  const loadStaging = async () => {
    try { const res = await api.getDepreciationStaging(period); setStaging(res?.data || []); } catch (err) { showError(err, 'Could not load depreciation staging'); }
  };

  const handleApproveAll = async () => {
    const ids = staging.map(s => s.entry_id);
    try { await api.approveDepreciation({ entry_ids: ids }); setMsg('Approved'); loadStaging(); } catch (err) { showError(err, 'Approval failed'); }
  };

  const handlePost = async () => {
    try { const res = await api.postDepreciation({ period }); setMsg(`Posted ${res?.data?.length || 0} JEs`); loadStaging(); loadAssets(); } catch (err) { showError(err, 'Post depreciation failed'); }
  };

  return (
    <>
      <style>{pageStyles}</style>
      <div className="fa-header">
        <h2>Fixed Assets</h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn" style={{ background: 'transparent', border: '1px solid var(--erp-border)', color: 'var(--erp-text)' }} onClick={handleExport}>Export Excel</button>
          {isAdmin && <label className="btn" style={{ background: 'transparent', border: '1px solid var(--erp-border)', color: 'var(--erp-text)', cursor: 'pointer' }}>Import Excel<input type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={handleImport} /></label>}
          {isAdmin && <button className="btn btn-primary" onClick={() => setShowAdd(true)}>+ Add Asset</button>}
        </div>
      </div>

      {loading ? <div className="fa-empty">Loading…</div> : assets.length === 0 ? <div className="fa-empty">No fixed assets</div> : (
        <table className="fa-table">
          <thead><tr><th>Code</th><th>Asset</th><th>Category</th><th>Cost</th><th>Accum. Depr.</th><th>NBV</th><th>Status</th></tr></thead>
          <tbody>
            {assets.map(a => (
              <tr key={a._id}>
                <td style={{ fontWeight: 600 }}>{a.asset_code}</td><td>{a.asset_name}</td><td>{a.category || '—'}</td>
                <td>{fmt(a.acquisition_cost)}</td><td>{fmt(a.accumulated_depreciation)}</td><td>{fmt(a.net_book_value)}</td>
                <td><span className={`badge badge-${a.status}`}>{a.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {isAdmin && (
        <div className="fa-staging">
          <h3>Depreciation Staging</h3>
          <div className="fa-controls">
            <input type="month" value={period} onChange={e => setPeriod(e.target.value)} />
            <button className="btn btn-primary" onClick={handleCompute}>Compute</button>
            <button className="btn" onClick={loadStaging}>Load Staging</button>
            {staging.length > 0 && <>
              <button className="btn btn-success" onClick={handleApproveAll}>Approve All</button>
              <button className="btn btn-primary" onClick={handlePost}>Post JEs</button>
            </>}
          </div>
          {msg && <div className="fa-msg">{msg}</div>}
          {staging.length > 0 && (
            <table className="fa-table" style={{ marginTop: 8 }}>
              <thead><tr><th>Asset</th><th>Amount</th><th>Status</th></tr></thead>
              <tbody>
                {staging.map(s => (
                  <tr key={s.entry_id}><td>{s.asset_name}</td><td>{fmt(s.amount)}</td><td>{s.status}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {showAdd && (
        <div className="fa-modal" onClick={() => setShowAdd(false)}>
          <div className="fa-modal-body" onClick={e => e.stopPropagation()}>
            <h3>Add Fixed Asset</h3>
            {['asset_code', 'asset_name', 'category'].map(f => (
              <div key={f} className="form-group"><label>{f.replace('_', ' ')}</label><input value={form[f]} onChange={e => setForm({ ...form, [f]: e.target.value })} /></div>
            ))}
            <div className="form-group"><label>Acquisition Date</label><input type="date" value={form.acquisition_date} onChange={e => setForm({ ...form, acquisition_date: e.target.value })} /></div>
            <div className="form-group"><label>Acquisition Cost</label><input type="number" value={form.acquisition_cost} onChange={e => setForm({ ...form, acquisition_cost: e.target.value })} /></div>
            <div className="form-group"><label>Useful Life (months)</label><input type="number" value={form.useful_life_months} onChange={e => setForm({ ...form, useful_life_months: e.target.value })} /></div>
            <div className="form-group"><label>Salvage Value</label><input type="number" value={form.salvage_value} onChange={e => setForm({ ...form, salvage_value: e.target.value })} /></div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn" onClick={() => setShowAdd(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleCreate}>Create</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default function FixedAssets() {
  return (
    <div className="fa-page">
      <Navbar />
      <div style={{ display: 'flex', flex: 1 }}>
        <Sidebar />
        <main className="fa-main admin-main">
          <WorkflowGuide pageKey="fixed-assets" />
          <FixedAssetsContent />
        </main>
      </div>
    </div>
  );
}
