/**
 * WarehouseManager — Phase 17
 *
 * Admin page to create, edit, and manage warehouses.
 * Shows list of warehouses with stock counts, manager, assigned users.
 * Create/edit modal for warehouse properties.
 */
import { useState, useEffect, useCallback } from 'react';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import { useAuth } from '../../hooks/useAuth';
import useWarehouses from '../hooks/useWarehouses';
import useEntities from '../hooks/useEntities';
import usePeople from '../hooks/usePeople';

const TYPE_LABELS = { MAIN: 'Main Warehouse', TERRITORY: 'Territory', VIRTUAL: 'Virtual' };
const TYPE_COLORS = { MAIN: '#1e40af', TERRITORY: '#166534', VIRTUAL: '#64748b' };
const STOCK_TYPES = ['PHARMA', 'FNB', 'OFFICE'];

const pageStyles = `
  .wm-page { background: var(--erp-bg, #f4f7fb); min-height: 100vh; }
  .wm-main { flex: 1; min-width: 0; overflow-y: auto; padding: 20px; max-width: 1200px; margin: 0 auto; }
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
  @media(max-width: 768px) { .wm-grid { grid-template-columns: 1fr; } }
`;

const emptyForm = () => ({
  warehouse_code: '', warehouse_name: '', warehouse_type: 'TERRITORY',
  location: { city: '', region: '' }, manager_id: '', draws_from: '', stock_type: 'PHARMA',
  is_default_receiving: false, can_receive_grn: false, can_transfer_out: true,
});

export default function WarehouseManager() {
  const { user } = useAuth();
  const whApi = useWarehouses();
  const { entities } = useEntities();
  const { getAsUsers } = usePeople();

  const [warehouses, setWarehouses] = useState([]);
  const [users, setUsers] = useState([]);
  const [editing, setEditing] = useState(null); // null | 'new' | warehouse object
  const [form, setForm] = useState(emptyForm());
  const [loading, setLoading] = useState(false);

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
  }, []);

  useEffect(() => { load(); }, [load]);

  const openNew = () => { setForm(emptyForm()); setEditing('new'); };
  const openEdit = (wh) => {
    setForm({
      warehouse_code: wh.warehouse_code,
      warehouse_name: wh.warehouse_name,
      warehouse_type: wh.warehouse_type,
      location: wh.location || { city: '', region: '' },
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
      if (editing === 'new') {
        await whApi.createWarehouse(form);
      } else {
        await whApi.updateWarehouse(editing._id, form);
      }
      setEditing(null);
      load();
    } catch (err) {
      alert(err.response?.data?.message || 'Save failed');
    }
  };

  return (
    <div className="admin-page erp-page wm-page">
      <style>{pageStyles}</style>
      <Navbar />
      <div className="admin-layout">
        <Sidebar />
        <main className="wm-main">
          <div className="wm-header">
            <h2>Warehouse Management</h2>
            <button className="wm-btn wm-btn-primary" onClick={openNew}>+ New Warehouse</button>
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
                  <button className="wm-btn wm-btn-sm wm-btn-outline" onClick={() => openEdit(wh)}>Edit</button>
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
                    <select value={form.warehouse_type} onChange={e => setForm(f => ({ ...f, warehouse_type: e.target.value }))}>
                      <option value="MAIN">Main Warehouse</option>
                      <option value="TERRITORY">Territory</option>
                      <option value="VIRTUAL">Virtual</option>
                    </select>
                  </div>
                </div>
                <div className="wm-field">
                  <label>Warehouse Name</label>
                  <input value={form.warehouse_name} onChange={e => setForm(f => ({ ...f, warehouse_name: e.target.value }))} placeholder="Iloilo Main Warehouse" />
                </div>
                <div className="wm-field-row">
                  <div className="wm-field">
                    <label>City</label>
                    <input value={form.location?.city || ''} onChange={e => setForm(f => ({ ...f, location: { ...f.location, city: e.target.value } }))} />
                  </div>
                  <div className="wm-field">
                    <label>Region</label>
                    <input value={form.location?.region || ''} onChange={e => setForm(f => ({ ...f, location: { ...f.location, region: e.target.value } }))} />
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
                  <select value={form.stock_type} onChange={e => setForm(f => ({ ...f, stock_type: e.target.value }))}>
                    {STOCK_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
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
                  <button className="wm-btn wm-btn-primary" onClick={handleSave}>{editing === 'new' ? 'Create' : 'Save'}</button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
