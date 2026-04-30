/**
 * WarehouseManager — Phase 17
 *
 * Admin page to create, edit, and manage warehouses.
 * Shows list of warehouses with stock counts, manager, assigned users.
 * Create/edit modal for warehouse properties.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import { useAuth } from '../../hooks/useAuth';
import useWarehouses from '../hooks/useWarehouses';
import useEntities from '../hooks/useEntities';
import usePeople from '../hooks/usePeople';
import useErpApi from '../hooks/useErpApi';
import useErpSubAccess from '../hooks/useErpSubAccess';
import SelectField from '../../components/common/Select';
import { useLookupOptions } from '../hooks/useLookups';
import { showError, showSuccess } from '../utils/errorToast';
import WorkflowGuide from '../components/WorkflowGuide';

const TYPE_LABELS = { MAIN: 'Main Warehouse', TERRITORY: 'Territory', VIRTUAL: 'Virtual' };
const TYPE_COLORS = { MAIN: '#1e40af', TERRITORY: '#166534', VIRTUAL: '#64748b' };

const pageStyles = `
  .wm-page { background: var(--erp-bg, #f4f7fb); min-height: 100vh; }
  .wm-main { flex: 1; min-width: 0; padding: 20px; max-width: 1200px; margin: 0 auto; }
  .wm-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
  .wm-header h2 { font-size: 20px; font-weight: 700; color: var(--erp-text, #1a1a2e); margin: 0; }
  .wm-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 16px; }
  .wm-card { background: var(--erp-panel, #fff); border: 1px solid var(--erp-border, #dbe4f0); border-radius: 12px; padding: 16px; position: relative; }
  .wm-card-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px; }
  .wm-card h3 { font-size: 16px; font-weight: 700; margin: 0; color: var(--erp-text); }
  .wm-code { font-size: 11px; background: var(--erp-accent-soft, #e8efff); color: var(--erp-accent, #1e5eff); padding: 2px 8px; border-radius: 4px; font-weight: 600; }
  .wm-type { font-size: 10px; padding: 2px 6px; border-radius: 4px; font-weight: 600; color: #fff; }
  .wm-row { display: flex; gap: 4px; align-items: center; font-size: 12px; color: var(--erp-muted, #64748b); margin: 4px 0; }
  .wm-row strong { color: var(--erp-text); }
  .wm-tags { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 8px; }
  .wm-tag { font-size: 10px; padding: 2px 6px; border-radius: 4px; background: #f1f5f9; color: #475569; }
  .wm-tag-active { background: #dcfce7; color: #166534; }
  .wm-stats { display: flex; gap: 16px; margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--erp-border); }
  .wm-stat { text-align: center; }
  .wm-stat .v { font-size: 18px; font-weight: 700; color: var(--erp-text); }
  .wm-stat .l { font-size: 10px; color: var(--erp-muted); text-transform: uppercase; }
  .wm-btn { padding: 6px 14px; border-radius: 6px; border: none; cursor: pointer; font-size: 13px; font-weight: 500; }
  .wm-btn-primary { background: var(--erp-accent, #1e5eff); color: #fff; }
  .wm-btn-outline { background: transparent; border: 1px solid var(--erp-border, #d1d5db); }
  .wm-btn-sm { padding: 4px 10px; font-size: 12px; }
  .wm-modal { position: fixed; inset: 0; background: rgba(0,0,0,.5); z-index: 1000; display: flex; align-items: center; justify-content: center; }
  .wm-panel { background: var(--erp-panel, #fff); border-radius: 16px; padding: 24px; width: 95%; max-width: 560px; max-height: 85vh; overflow-y: auto; }
  .wm-panel h3 { margin: 0 0 16px; font-size: 16px; }
  .wm-field { margin-bottom: 12px; }
  .wm-field label { display: block; font-size: 12px; font-weight: 600; color: var(--erp-muted, #64748b); margin-bottom: 4px; }
  .wm-field input, .wm-field select { width: 100%; padding: 8px 10px; border-radius: 6px; border: 1px solid var(--erp-border, #d1d5db); font-size: 13px; box-sizing: border-box; }
  .wm-field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .wm-check { display: flex; align-items: center; gap: 6px; font-size: 13px; margin: 6px 0; }
  .wm-footer { display: flex; gap: 8px; justify-content: flex-end; margin-top: 16px; }
  @media(max-width: 768px) {
    .wm-page { padding-top: 12px; }
    .wm-main { padding: 76px 12px 96px; }
    .wm-header { flex-direction: column; align-items: flex-start; gap: 10px; }
    .wm-header .wm-btn { width: 100%; }
    .wm-grid { grid-template-columns: 1fr; }
    .wm-field-row { grid-template-columns: 1fr; }
    .wm-footer { flex-direction: column; }
    .wm-footer .wm-btn { width: 100%; }
    .wm-panel { padding: 18px; }
  }

  @media(max-width: 480px) {
    .wm-page { padding-top: 16px; }
    .wm-main { padding-top: 72px; padding-bottom: 104px; }
  }
`;

const emptyForm = () => ({
  warehouse_code: '', warehouse_name: '', warehouse_type: 'TERRITORY',
  location: { address: '', city: '', region: '' }, manager_id: '', draws_from: '', stock_type: 'PHARMA',
  contact_person: '', contact_phone: '',
  is_default_receiving: false, can_receive_grn: false, can_transfer_out: true,
});

export function WarehouseManagerContent() {
  useAuth();
  const whApi = useWarehouses();
  // Phase 3c — create/update gated by Tier 2 lookup-only inventory.warehouse_manage.
  // Mirrors backend warehouseRoutes POST / + PUT /:id.
  const { hasSubPermission } = useErpSubAccess();
  const canManageWarehouse = hasSubPermission('inventory', 'warehouse_manage');
  const { options: stockTypeOpts } = useLookupOptions('STOCK_TYPE');
  const STOCK_TYPES = stockTypeOpts.map(o => o.code);
  useEntities();
  const { getAsUsers } = usePeople();

  const [warehouses, setWarehouses] = useState([]);
  const [users, setUsers] = useState([]);
  const [editing, setEditing] = useState(null); // null | 'new' | warehouse object
  const [form, setForm] = useState(emptyForm());
  const [loading, setLoading] = useState(false);

  // Seed stock on hand
  const api = useErpApi();
  const seedFileRef = useRef(null);
  const [seeding, setSeeding] = useState(false);
  const [seedResult, setSeedResult] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [whRes, usersRes] = await Promise.all([
        whApi.getWarehouses(),
        getAsUsers()
      ]);
      setWarehouses(whRes?.data || []);
      setUsers(usersRes?.data || []);
    } catch (err) {
      console.error('[WarehouseManager] load failed:', err.message);
    } finally { setLoading(false); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  const openNew = () => { setForm(emptyForm()); setEditing('new'); };
  const openEdit = (wh) => {
    setForm({
      warehouse_code: wh.warehouse_code,
      warehouse_name: wh.warehouse_name,
      warehouse_type: wh.warehouse_type,
      location: wh.location || { address: '', city: '', region: '' },
      contact_person: wh.contact_person || '',
      contact_phone: wh.contact_phone || '',
      manager_id: wh.manager_id?._id || wh.manager_id || '',
      draws_from: wh.draws_from?._id || wh.draws_from || '',
      stock_type: wh.stock_type || 'PHARMA',
      is_default_receiving: !!wh.is_default_receiving,
      can_receive_grn: !!wh.can_receive_grn,
      can_transfer_out: wh.can_transfer_out !== false,
      is_active: wh.is_active !== false,
    });
    setEditing(wh);
  };

  const handleSave = async () => {
    try {
      // Clean empty-string ObjectId fields to null (Mongoose rejects '' as ObjectId)
      const payload = { ...form };
      if (!payload.manager_id) payload.manager_id = null;
      if (!payload.draws_from) payload.draws_from = null;
      if (editing === 'new') {
        await whApi.createWarehouse(payload);
      } else {
        await whApi.updateWarehouse(editing._id, payload);
      }
      setEditing(null);
      load();
    } catch (err) {
      showError(err, 'Could not save warehouse');
    }
  };

  const handleSeedStock = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!window.confirm('Import opening stock from CSV?\n\nThis will create OPENING_BALANCE entries for each product/batch/warehouse.\nDuplicate entries will be skipped.\nProducts not in Product Master will be skipped.')) {
      if (seedFileRef.current) seedFileRef.current.value = '';
      return;
    }
    setSeeding(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.post('/inventory/seed-stock-on-hand', formData, {
        headers: { 'Content-Type': undefined }
      });
      setSeedResult(res?.data || {});
      showSuccess(`Imported ${res?.data?.imported || 0} stock entries`);
    } catch (err) { showError(err, 'Could not import stock'); }
    finally { setSeeding(false); if (seedFileRef.current) seedFileRef.current.value = ''; }
  };

  return (
    <>
      <style>{pageStyles}</style>
          <div className="wm-header">
            <h2>Warehouse Management</h2>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="wm-btn wm-btn-primary" onClick={() => seedFileRef.current?.click()} disabled={seeding} style={{ background: '#059669' }}>
                {seeding ? 'Importing...' : 'Import Opening Stock'}
              </button>
              <input ref={seedFileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleSeedStock} style={{ display: 'none' }} />
              {canManageWarehouse && <button className="wm-btn wm-btn-primary" onClick={openNew}>+ New Warehouse</button>}
            </div>
          </div>

          {loading && !warehouses.length && <p style={{ color: '#64748b' }}>Loading...</p>}

          <div className="wm-grid">
            {warehouses.map(wh => (
              <div className="wm-card" key={wh._id}>
                <div className="wm-card-header">
                  <div>
                    <h3>{wh.warehouse_name}</h3>
                    <span className="wm-code">{wh.warehouse_code}</span>
                  </div>
                  <span className="wm-type" style={{ background: TYPE_COLORS[wh.warehouse_type] || '#64748b' }}>
                    {TYPE_LABELS[wh.warehouse_type] || wh.warehouse_type}
                  </span>
                </div>
                <div className="wm-row">Manager: <strong>{wh.manager_id?.name || '—'}</strong></div>
                {wh.location?.city && <div className="wm-row">Location: {wh.location.city}{wh.location.region ? `, ${wh.location.region}` : ''}</div>}
                <div className="wm-row">Stock Type: <strong>{wh.stock_type || 'PHARMA'}</strong></div>
                {wh.assigned_users?.length > 0 && (
                  <div className="wm-row">Assigned: {wh.assigned_users.map(u => u.name || u).join(', ')}</div>
                )}
                <div className="wm-tags">
                  {wh.is_default_receiving && <span className="wm-tag wm-tag-active">Default Receiving</span>}
                  {wh.can_receive_grn && <span className="wm-tag wm-tag-active">GRN</span>}
                  {wh.can_transfer_out && <span className="wm-tag">Transfer Out</span>}
                  {wh.draws_from && <span className="wm-tag">Draws from: {wh.draws_from.warehouse_code}</span>}
                  {!wh.is_active && <span className="wm-tag" style={{ background: '#fef2f2', color: '#991b1b' }}>Inactive</span>}
                </div>
                <div style={{ marginTop: 10 }}>
                  {canManageWarehouse && <button className="wm-btn wm-btn-sm wm-btn-outline" onClick={() => openEdit(wh)}>Edit</button>}
                </div>
              </div>
            ))}
          </div>

          {!warehouses.length && !loading && <p style={{ textAlign: 'center', color: '#64748b', marginTop: 40 }}>No warehouses configured. Create one to get started.</p>}

          {/* Edit/Create Modal */}
          {editing && (
            <div className="wm-modal" onClick={() => setEditing(null)}>
              <div className="wm-panel" onClick={e => e.stopPropagation()}>
                <h3>{editing === 'new' ? 'New Warehouse' : `Edit: ${editing.warehouse_name}`}</h3>
                <div className="wm-field-row">
                  <div className="wm-field">
                    <label>Warehouse Code</label>
                    <input value={form.warehouse_code} onChange={e => setForm(f => ({ ...f, warehouse_code: e.target.value.toUpperCase() }))}
                      disabled={editing !== 'new'} placeholder="e.g. ILO-MAIN" />
                  </div>
                  <div className="wm-field">
                    <label>Type</label>
                    <SelectField value={form.warehouse_type} onChange={e => setForm(f => ({ ...f, warehouse_type: e.target.value }))}>
                      <option value="MAIN">Main Warehouse</option>
                      <option value="TERRITORY">Territory</option>
                      <option value="VIRTUAL">Virtual</option>
                    </SelectField>
                  </div>
                </div>
                <div className="wm-field">
                  <label>Warehouse Name</label>
                  <input value={form.warehouse_name} onChange={e => setForm(f => ({ ...f, warehouse_name: e.target.value }))} placeholder="Iloilo Main Warehouse" />
                </div>
                <div className="wm-field">
                  <label>Address</label>
                  <input value={form.location?.address || ''} onChange={e => setForm(f => ({ ...f, location: { ...f.location, address: e.target.value } }))} placeholder="Street address, building, floor" />
                </div>
                <div className="wm-field-row">
                  <div className="wm-field">
                    <label>Municipality / City</label>
                    <input value={form.location?.city || ''} onChange={e => setForm(f => ({ ...f, location: { ...f.location, city: e.target.value } }))} />
                  </div>
                  <div className="wm-field">
                    <label>Province / Region</label>
                    <input value={form.location?.region || ''} onChange={e => setForm(f => ({ ...f, location: { ...f.location, region: e.target.value } }))} />
                  </div>
                </div>
                <div className="wm-field-row">
                  <div className="wm-field">
                    <label>Contact Person</label>
                    <input value={form.contact_person || ''} onChange={e => setForm(f => ({ ...f, contact_person: e.target.value }))} placeholder="Delivery contact name" />
                  </div>
                  <div className="wm-field">
                    <label>Contact Phone</label>
                    <input value={form.contact_phone || ''} onChange={e => setForm(f => ({ ...f, contact_phone: e.target.value }))} placeholder="09XX XXX XXXX" />
                  </div>
                </div>
                <div className="wm-field-row">
                  <div className="wm-field">
                    <label>Manager</label>
                    <select value={form.manager_id} onChange={e => setForm(f => ({ ...f, manager_id: e.target.value }))}>
                      <option value="">— Select Manager —</option>
                      {users.filter(u => u.isActive !== false).map(u => (
                        <option key={u._id} value={u._id}>{u.name} ({u.role})</option>
                      ))}
                    </select>
                  </div>
                  <div className="wm-field">
                    <label>Draws From (parent warehouse)</label>
                    <select value={form.draws_from} onChange={e => setForm(f => ({ ...f, draws_from: e.target.value }))}>
                      <option value="">— None —</option>
                      {warehouses.filter(w => w._id !== (editing?._id)).map(w => (
                        <option key={w._id} value={w._id}>{w.warehouse_code} — {w.warehouse_name}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="wm-field">
                  <label>Stock Type</label>
                  <SelectField value={form.stock_type} onChange={e => setForm(f => ({ ...f, stock_type: e.target.value }))}>
                    {STOCK_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </SelectField>
                </div>
                <div className="wm-check">
                  <input type="checkbox" checked={form.is_default_receiving} onChange={e => setForm(f => ({ ...f, is_default_receiving: e.target.checked }))} />
                  <span>Default receiving warehouse (GRNs land here by default)</span>
                </div>
                <div className="wm-check">
                  <input type="checkbox" checked={form.can_receive_grn} onChange={e => setForm(f => ({ ...f, can_receive_grn: e.target.checked }))} />
                  <span>Can receive GRN directly</span>
                </div>
                <div className="wm-check">
                  <input type="checkbox" checked={form.can_transfer_out} onChange={e => setForm(f => ({ ...f, can_transfer_out: e.target.checked }))} />
                  <span>Can transfer stock out</span>
                </div>
                {editing !== 'new' && (
                  <div className="wm-check">
                    <input type="checkbox" checked={form.is_active !== false} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} />
                    <span>Active</span>
                  </div>
                )}
                <div className="wm-footer">
                  <button className="wm-btn wm-btn-outline" onClick={() => setEditing(null)}>Cancel</button>
                  {canManageWarehouse && (
                    <button className="wm-btn wm-btn-primary" onClick={handleSave}>{editing === 'new' ? 'Create' : 'Save'}</button>
                  )}
                </div>
              </div>
            </div>
          )}

          {seedResult && (
            <div className="wm-modal" onClick={() => setSeedResult(null)}>
              <div className="wm-panel" onClick={e => e.stopPropagation()} style={{ maxWidth: 560, maxHeight: '80vh', overflowY: 'auto' }}>
                <h3>Stock Import Results</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, margin: '16px 0' }}>
                  <div style={{ background: '#f0fdf4', padding: 12, borderRadius: 8, textAlign: 'center' }}>
                    <div style={{ fontSize: 24, fontWeight: 700, color: '#166534' }}>{seedResult.imported || 0}</div>
                    <div style={{ fontSize: 11, color: '#6b7280' }}>Imported</div>
                  </div>
                  <div style={{ background: '#fef3c7', padding: 12, borderRadius: 8, textAlign: 'center' }}>
                    <div style={{ fontSize: 24, fontWeight: 700, color: '#92400e' }}>{seedResult.skipped || 0}</div>
                    <div style={{ fontSize: 11, color: '#6b7280' }}>Skipped</div>
                  </div>
                  <div style={{ background: '#fef2f2', padding: 12, borderRadius: 8, textAlign: 'center' }}>
                    <div style={{ fontSize: 24, fontWeight: 700, color: '#991b1b' }}>{seedResult.errors || 0}</div>
                    <div style={{ fontSize: 11, color: '#6b7280' }}>Unmatched</div>
                  </div>
                </div>
                {seedResult.productUpdated > 0 && (
                  <p style={{ fontSize: 13, color: '#6b7280' }}>Products price-updated: {seedResult.productUpdated}</p>
                )}
                {seedResult.perWarehouse && Object.keys(seedResult.perWarehouse).length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>Per Warehouse</div>
                    {Object.entries(seedResult.perWarehouse).sort((a, b) => b[1] - a[1]).map(([code, count]) => (
                      <div key={code} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '2px 0' }}>
                        <span>{code}</span><strong>{count}</strong>
                      </div>
                    ))}
                  </div>
                )}
                {seedResult.unmatchedItems?.length > 0 && (
                  <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: 12, marginTop: 12 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: '#991b1b', marginBottom: 6 }}>Unmatched Items ({seedResult.unmatchedItems.length})</div>
                    {seedResult.unmatchedItems.slice(0, 20).map((item, i) => (
                      <div key={i} style={{ fontSize: 12, color: '#7f1d1d', margin: '2px 0' }}>
                        Row {item.row}: {item.brand} {item.dosage} — {item.reason}
                      </div>
                    ))}
                    {seedResult.unmatchedItems.length > 20 && <div style={{ fontSize: 12, color: '#9ca3af' }}>...and {seedResult.unmatchedItems.length - 20} more</div>}
                  </div>
                )}
                <div className="wm-footer" style={{ marginTop: 16 }}>
                  <button className="wm-btn wm-btn-primary" onClick={() => setSeedResult(null)}>Close</button>
                </div>
              </div>
            </div>
          )}
    </>
  );
}

export default function WarehouseManager() {
  return (
    <div className="admin-page erp-page wm-page">
      <Navbar />
      <div className="admin-layout">
        <Sidebar />
        <main className="wm-main">
          <WorkflowGuide pageKey="warehouse-manager" />
          <WarehouseManagerContent />
        </main>
      </div>
    </div>
  );
}
