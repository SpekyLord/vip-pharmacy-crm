/**
 * Payment Modes — Admin page for managing payment methods + COA mappings
 */
import { useState, useEffect, useCallback } from 'react';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import useErpApi from '../hooks/useErpApi';
import useAccounting from '../hooks/useAccounting';
import { useLookupOptions } from '../hooks/useLookups';
import { showError } from '../utils/errorToast';
import WorkflowGuide from '../components/WorkflowGuide';

const MODE_TYPES_FALLBACK = ['CASH', 'CHECK', 'BANK_TRANSFER', 'GCASH', 'CARD', 'OTHER'];

const pageStyles = `
  .pmode-page { background: var(--erp-bg, #f4f7fb); min-height: 100vh; }
  .pmode-main { flex: 1; min-width: 0; overflow-y: auto; padding: 20px; max-width: 1000px; margin: 0 auto; }
  .pmode-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 8px; }
  .pmode-header h2 { font-size: 20px; font-weight: 700; margin: 0; }
  .pmode-table { width: 100%; border-collapse: collapse; background: var(--erp-panel, #fff); border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,.06); }
  .pmode-table th { background: var(--erp-accent-soft, #e8efff); padding: 10px 12px; text-align: left; font-weight: 600; font-size: 12px; text-transform: uppercase; color: var(--erp-muted); }
  .pmode-table td { padding: 10px 12px; border-top: 1px solid var(--erp-border); font-size: 13px; }
  .pmode-table tr:hover { background: var(--erp-accent-soft); }
  .btn { padding: 6px 14px; border-radius: 6px; border: none; cursor: pointer; font-size: 13px; font-weight: 500; }
  .btn-primary { background: var(--erp-accent, #1e5eff); color: #fff; }
  .btn-sm { padding: 4px 10px; font-size: 12px; }
  .btn-outline { background: transparent; border: 1px solid var(--erp-border); color: var(--erp-text); }
  .btn-danger { background: #fef2f2; color: #991b1b; border: 1px solid #fecaca; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 600; }
  .badge-active { background: #dcfce7; color: #166534; }
  .badge-inactive { background: #fee2e2; color: #991b1b; }
  .badge-calf { background: #fef3c7; color: #92400e; }
  .pmode-modal { position: fixed; inset: 0; background: rgba(0,0,0,.4); display: flex; align-items: center; justify-content: center; z-index: 100; }
  .pmode-modal-body { background: var(--erp-panel, #fff); border-radius: 12px; padding: 24px; width: 480px; max-width: 95vw; }
  .pmode-modal-body h3 { margin: 0 0 16px; font-size: 16px; }
  .form-group { margin-bottom: 12px; }
  .form-group label { display: block; font-size: 12px; font-weight: 600; margin-bottom: 4px; color: var(--erp-muted); }
  .form-group input, .form-group select { width: 100%; padding: 8px 10px; border-radius: 6px; border: 1px solid var(--erp-border); font-size: 13px; box-sizing: border-box; }
  .pmode-empty { text-align: center; color: #64748b; padding: 40px; }
  @media(max-width: 768px) { .pmode-main { padding: 12px; padding-bottom: calc(80px + env(safe-area-inset-bottom, 0px)); } }
`;

const EMPTY_FORM = { mode_code: '', mode_label: '', mode_type: 'CASH', coa_code: '', requires_calf: false, is_active: true };

export function PaymentModesContent() {
  const api = useErpApi();
  const { listAccounts } = useAccounting();
  const { options: modeTypeOpts } = useLookupOptions('PAYMENT_MODE_TYPE');
  const MODE_TYPES = modeTypeOpts.length > 0 ? modeTypeOpts.map(o => o.code) : MODE_TYPES_FALLBACK;
  const [modes, setModes] = useState([]);
  const [coaAccounts, setCoaAccounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/lookups/payment-modes');
      setModes(res?.data || []);
    } catch (err) { showError(err, 'Could not load payment modes'); }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    listAccounts({ is_active: true }).then(res => {
      setCoaAccounts((res?.data || []).filter(a => ['ASSET', 'LIABILITY'].includes(a.account_type)));
    }).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const openCreate = () => { setEditing(null); setForm({ ...EMPTY_FORM }); setShowModal(true); };
  const openEdit = (m) => {
    setEditing(m);
    setForm({
      mode_code: m.mode_code, mode_label: m.mode_label, mode_type: m.mode_type,
      coa_code: m.coa_code || '', requires_calf: m.requires_calf || false, is_active: m.is_active !== false
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    try {
      if (editing) await api.put(`/lookups/payment-modes/${editing._id}`, form);
      else await api.post('/lookups/payment-modes', form);
      setShowModal(false);
      load();
    } catch (err) { showError(err, 'Could not save payment mode'); }
  };

  const handleDelete = async (id, label) => {
    if (!window.confirm(`Delete "${label}"?`)) return;
    try { await api.del(`/lookups/payment-modes/${id}`); load(); } catch (err) { showError(err, 'Could not delete payment mode'); }
  };

  const coaName = (code) => coaAccounts.find(a => a.account_code === code)?.account_name || '';

  return (
    <>
      <style>{pageStyles}</style>
      <div className="pmode-header">
        <h2>Payment Modes</h2>
        <button className="btn btn-primary" onClick={openCreate}>+ Add Payment Mode</button>
      </div>

      {loading ? <div className="pmode-empty">Loading...</div> : modes.length === 0 ? <div className="pmode-empty">No payment modes configured</div> : (
        <table className="pmode-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Label</th>
              <th>Type</th>
              <th>COA Account</th>
              <th>CALF Required</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {modes.map(m => (
              <tr key={m._id}>
                <td style={{ fontWeight: 600, fontFamily: 'monospace' }}>{m.mode_code}</td>
                <td>{m.mode_label}</td>
                <td>{m.mode_type}</td>
                <td>{m.coa_code ? <span><strong>{m.coa_code}</strong> — {coaName(m.coa_code)}</span> : '—'}</td>
                <td>{m.requires_calf ? <span className="badge badge-calf">Yes</span> : 'No'}</td>
                <td><span className={`badge ${m.is_active !== false ? 'badge-active' : 'badge-inactive'}`}>{m.is_active !== false ? 'Active' : 'Inactive'}</span></td>
                <td>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button className="btn btn-sm btn-outline" onClick={() => openEdit(m)}>Edit</button>
                    <button className="btn btn-sm btn-danger" onClick={() => handleDelete(m._id, m.mode_label)}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {showModal && (
        <div className="pmode-modal" onClick={() => setShowModal(false)}>
          <div className="pmode-modal-body" onClick={e => e.stopPropagation()}>
            <h3>{editing ? 'Edit Payment Mode' : 'New Payment Mode'}</h3>
            <div className="form-group">
              <label>Mode Code (unique key)</label>
              <input value={form.mode_code} onChange={e => setForm(f => ({ ...f, mode_code: e.target.value.toUpperCase() }))} placeholder="e.g. CC_BPI" disabled={!!editing} />
            </div>
            <div className="form-group">
              <label>Display Label</label>
              <input value={form.mode_label} onChange={e => setForm(f => ({ ...f, mode_label: e.target.value }))} placeholder="e.g. Credit Card (BPI)" />
            </div>
            <div className="form-group">
              <label>Mode Type</label>
              <select value={form.mode_type} onChange={e => setForm(f => ({ ...f, mode_type: e.target.value }))}>
                {MODE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>COA Account (payment account)</label>
              <select value={form.coa_code} onChange={e => setForm(f => ({ ...f, coa_code: e.target.value }))}>
                <option value="">— Select COA account —</option>
                {coaAccounts.map(a => (
                  <option key={a.account_code} value={a.account_code}>{a.account_code} — {a.account_name}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" checked={form.requires_calf} onChange={e => setForm(f => ({ ...f, requires_calf: e.target.checked }))} style={{ width: 'auto' }} />
                Requires CALF (Cash Advance Liquidation)
              </label>
            </div>
            <div className="form-group">
              <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} style={{ width: 'auto' }} />
                Active
              </label>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-outline" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave}>{editing ? 'Update' : 'Create'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default function PaymentModes() {
  return (
    <div className="pmode-page">
      <Navbar />
      <div style={{ display: 'flex', flex: 1 }}>
        <Sidebar />
        <main className="pmode-main">
          <WorkflowGuide pageKey="payment-modes" />
          <PaymentModesContent />
        </main>
      </div>
    </div>
  );
}
