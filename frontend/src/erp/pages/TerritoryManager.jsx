/**
 * TerritoryManager — Phase 24 (Control Center)
 *
 * Manage sales territories — territory code, name, region, assigned BDMs.
 * First-ever frontend for territory CRUD (previously seed-only).
 */
import { useState, useEffect, useCallback } from 'react';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import { useAuth } from '../../hooks/useAuth';
import { ROLE_SETS } from '../../constants/roles';
import api from '../../services/api';
import toast from 'react-hot-toast';

const pageStyles = `
  .ter-container { padding: 0; }
  .ter-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 12px; }
  .ter-header h1 { font-size: 22px; font-weight: 700; color: var(--erp-text, #132238); margin: 0; }
  .ter-table { width: 100%; border-collapse: collapse; font-size: 13px; background: var(--erp-panel, #fff); border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,.06); }
  .ter-table th { background: var(--erp-accent-soft, #e8efff); padding: 10px 12px; text-align: left; font-weight: 600; font-size: 11px; text-transform: uppercase; color: var(--erp-muted); }
  .ter-table td { padding: 10px 12px; border-top: 1px solid var(--erp-border, #dbe4f0); }
  .ter-table tr:hover { background: var(--erp-accent-soft); }
  .ter-code { font-family: monospace; font-weight: 700; font-size: 14px; color: var(--erp-accent, #1e5eff); }
  .btn { padding: 6px 14px; border-radius: 6px; border: none; cursor: pointer; font-size: 13px; font-weight: 500; }
  .btn-primary { background: var(--erp-accent, #1e5eff); color: #fff; }
  .btn-sm { padding: 4px 10px; font-size: 12px; }
  .btn-outline { background: transparent; border: 1px solid var(--erp-border); color: var(--erp-text); }
  .btn-danger { background: #fef2f2; color: #991b1b; border: 1px solid #fecaca; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 6px; font-size: 11px; font-weight: 600; }
  .badge-active { background: #dcfce7; color: #166534; }
  .badge-inactive { background: #fee2e2; color: #991b1b; }
  .bdm-list { display: flex; flex-wrap: wrap; gap: 4px; }
  .bdm-tag { background: var(--erp-accent-soft); color: var(--erp-accent); padding: 2px 8px; border-radius: 4px; font-size: 11px; }
  .ter-modal { position: fixed; inset: 0; background: rgba(0,0,0,.4); display: flex; align-items: center; justify-content: center; z-index: 100; }
  .ter-modal-body { background: var(--erp-panel, #fff); border-radius: 14px; padding: 24px; width: 460px; max-width: 95vw; }
  .ter-modal-body h3 { margin: 0 0 16px; font-size: 16px; }
  .form-group { margin-bottom: 12px; }
  .form-group label { display: block; font-size: 12px; font-weight: 600; margin-bottom: 4px; color: var(--erp-muted); }
  .form-group input, .form-group select { width: 100%; padding: 8px 10px; border-radius: 6px; border: 1px solid var(--erp-border); font-size: 13px; box-sizing: border-box; }
  .ter-empty { text-align: center; padding: 40px; color: var(--erp-muted); }
  @media(max-width: 768px) { .ter-table { font-size: 11px; } .ter-table th, .ter-table td { padding: 8px; } }
`;

const EMPTY_FORM = { territory_code: '', territory_name: '', region: '', is_active: true };

export function TerritoryManagerContent() {
  const { user } = useAuth();
  const canEdit = ROLE_SETS.MANAGEMENT.includes(user?.role);

  const [territories, setTerritories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/erp/territories?active_only=false');
      setTerritories(res.data?.data || []);
    } catch (err) {
      toast.error('Failed to load territories');
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
    setShowModal(true);
  };

  const openEdit = (t) => {
    setEditingId(t._id);
    setForm({
      territory_code: t.territory_code || '',
      territory_name: t.territory_name || '',
      region: t.region || '',
      is_active: t.is_active !== false,
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    try {
      if (editingId) {
        await api.put(`/erp/territories/${editingId}`, form);
        toast.success('Territory updated');
      } else {
        await api.post('/erp/territories', form);
        toast.success('Territory created');
      }
      setShowModal(false);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Save failed');
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this territory? This cannot be undone.')) return;
    try {
      await api.delete(`/erp/territories/${id}`);
      toast.success('Territory deleted');
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Delete failed');
    }
  };

  return (
    <>
      <style>{pageStyles}</style>
      <div className="ter-container">
        <div className="ter-header">
          <h1>Territories</h1>
          {canEdit && <button className="btn btn-primary" onClick={openCreate}>+ New Territory</button>}
        </div>

        {loading ? <div className="ter-empty">Loading...</div> : territories.length === 0 ? (
          <div className="ter-empty">No territories configured.</div>
        ) : (
          <table className="ter-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Region</th>
                <th>Assigned BDMs</th>
                <th>Status</th>
                {canEdit && <th></th>}
              </tr>
            </thead>
            <tbody>
              {territories.map(t => (
                <tr key={t._id} style={{ opacity: t.is_active ? 1 : 0.5 }}>
                  <td><span className="ter-code">{t.territory_code}</span></td>
                  <td style={{ fontWeight: 600 }}>{t.territory_name}</td>
                  <td>{t.region || '—'}</td>
                  <td>
                    <div className="bdm-list">
                      {(t.assigned_bdms || []).length > 0
                        ? t.assigned_bdms.map(b => <span key={b._id} className="bdm-tag">{b.name}</span>)
                        : <span style={{ color: 'var(--erp-muted)', fontSize: 12 }}>None</span>}
                    </div>
                  </td>
                  <td><span className={`badge ${t.is_active ? 'badge-active' : 'badge-inactive'}`}>{t.is_active ? 'Active' : 'Inactive'}</span></td>
                  {canEdit && (
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button className="btn btn-sm btn-outline" onClick={() => openEdit(t)} style={{ marginRight: 4 }}>Edit</button>
                      <button className="btn btn-sm btn-danger" onClick={() => handleDelete(t._id)}>Delete</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {showModal && (
          <div className="ter-modal" onClick={e => { if (e.target === e.currentTarget) setShowModal(false); }}>
            <div className="ter-modal-body">
              <h3>{editingId ? 'Edit Territory' : 'New Territory'}</h3>
              <div className="form-group">
                <label>Territory Code *</label>
                <input value={form.territory_code} onChange={e => setForm({ ...form, territory_code: e.target.value.toUpperCase() })} placeholder="e.g. ILO, BAC, CDO" disabled={!!editingId} maxLength={5} />
              </div>
              <div className="form-group">
                <label>Territory Name *</label>
                <input value={form.territory_name} onChange={e => setForm({ ...form, territory_name: e.target.value })} placeholder="e.g. VIP Iloilo" />
              </div>
              <div className="form-group">
                <label>Region</label>
                <input value={form.region} onChange={e => setForm({ ...form, region: e.target.value })} placeholder="e.g. Western Visayas" />
              </div>
              {editingId && (
                <div className="form-group">
                  <label>Status</label>
                  <select value={form.is_active ? 'true' : 'false'} onChange={e => setForm({ ...form, is_active: e.target.value === 'true' })}>
                    <option value="true">Active</option>
                    <option value="false">Inactive</option>
                  </select>
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
                <button className="btn btn-outline" onClick={() => setShowModal(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={handleSave} disabled={!form.territory_code.trim() || !form.territory_name.trim()}>
                  {editingId ? 'Save Changes' : 'Create'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

export default function TerritoryManager() {
  return (
    <div style={{ background: 'var(--erp-bg, #f4f7fb)', minHeight: '100vh' }}>
      <Navbar />
      <div style={{ display: 'flex', flex: 1 }}>
        <Sidebar />
        <main style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: 20, maxWidth: 1200, margin: '0 auto' }}>
          <TerritoryManagerContent />
        </main>
      </div>
    </div>
  );
}
