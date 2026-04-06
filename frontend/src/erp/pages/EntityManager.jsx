/**
 * EntityManager — Phase 24 (Control Center)
 *
 * First-ever UI for managing entities (parent + subsidiaries).
 * President/admin can view, edit, and create entities.
 */
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../hooks/useAuth';
import api from '../../services/api';
import toast from 'react-hot-toast';

const pageStyles = `
  .em-container { padding: 0; }
  .em-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 12px; }
  .em-header h1 { font-size: 22px; font-weight: 700; color: var(--erp-text, #132238); margin: 0; }
  .em-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 16px; }
  .em-card { background: var(--erp-panel, #fff); border: 1px solid var(--erp-border, #dbe4f0); border-radius: 14px; padding: 20px; position: relative; overflow: hidden; }
  .em-card-accent { position: absolute; top: 0; left: 0; right: 0; height: 4px; }
  .em-card h3 { font-size: 16px; font-weight: 700; margin: 0 0 4px; color: var(--erp-text); }
  .em-card .em-short { font-size: 12px; color: var(--erp-muted); margin-bottom: 12px; }
  .em-detail { display: grid; grid-template-columns: auto 1fr; gap: 4px 12px; font-size: 13px; }
  .em-detail dt { color: var(--erp-muted); font-weight: 600; font-size: 11px; text-transform: uppercase; }
  .em-detail dd { margin: 0; color: var(--erp-text); }
  .em-badge { display: inline-block; padding: 2px 8px; border-radius: 6px; font-size: 11px; font-weight: 600; }
  .em-badge-parent { background: #e0e7ff; color: #3730a3; }
  .em-badge-subsidiary { background: #fef3c7; color: #92400e; }
  .em-badge-active { background: #dcfce7; color: #166534; }
  .em-badge-inactive { background: #fee2e2; color: #991b1b; }
  .btn { padding: 8px 16px; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; }
  .btn-primary { background: var(--erp-accent, #1e5eff); color: #fff; }
  .btn-sm { padding: 5px 12px; font-size: 12px; }
  .btn-outline { background: transparent; border: 1px solid var(--erp-border); color: var(--erp-text); }
  .em-modal { position: fixed; inset: 0; background: rgba(0,0,0,.4); display: flex; align-items: center; justify-content: center; z-index: 100; }
  .em-modal-body { background: var(--erp-panel, #fff); border-radius: 14px; padding: 24px; width: 500px; max-width: 95vw; max-height: 90vh; overflow-y: auto; }
  .em-modal-body h3 { margin: 0 0 16px; font-size: 16px; }
  .form-group { margin-bottom: 12px; }
  .form-group label { display: block; font-size: 12px; font-weight: 600; margin-bottom: 4px; color: var(--erp-muted); }
  .form-group input, .form-group select { width: 100%; padding: 8px 10px; border-radius: 6px; border: 1px solid var(--erp-border); font-size: 13px; box-sizing: border-box; }
  .form-row { display: flex; gap: 12px; }
  .form-row .form-group { flex: 1; }
  .em-color-preview { width: 32px; height: 32px; border-radius: 6px; border: 1px solid var(--erp-border); display: inline-block; vertical-align: middle; margin-left: 8px; }
  .em-loading { text-align: center; padding: 40px; color: var(--erp-muted); }
  .em-empty { text-align: center; padding: 60px; color: var(--erp-muted); font-size: 14px; }
  @media(max-width: 768px) { .em-grid { grid-template-columns: 1fr; } }
`;

const EMPTY_FORM = { entity_name: '', short_name: '', tin: '', address: '', vat_registered: false, entity_type: 'SUBSIDIARY', parent_entity_id: '', brand_color: '#6B7280', brand_text_color: '#FFFFFF', tagline: '' };

export function EntityManagerContent() {
  const { user } = useAuth();
  const [entities, setEntities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });

  const isPresident = user?.role === 'president' || user?.role === 'ceo';
  const canEdit = ['president', 'ceo', 'admin'].includes(user?.role);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/erp/entities');
      setEntities(res.data?.data || []);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load entities');
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    const parent = entities.find(e => e.entity_type === 'PARENT');
    setForm({ ...EMPTY_FORM, parent_entity_id: parent?._id || '' });
    setEditingId(null);
    setShowModal(true);
  };

  const openEdit = (entity) => {
    setForm({
      entity_name: entity.entity_name || '',
      short_name: entity.short_name || '',
      tin: entity.tin || '',
      address: entity.address || '',
      vat_registered: entity.vat_registered || false,
      entity_type: entity.entity_type || 'SUBSIDIARY',
      parent_entity_id: entity.parent_entity_id || '',
      brand_color: entity.brand_color || '#6B7280',
      brand_text_color: entity.brand_text_color || '#FFFFFF',
      tagline: entity.tagline || '',
      status: entity.status || 'ACTIVE'
    });
    setEditingId(entity._id);
    setShowModal(true);
  };

  const handleSave = async () => {
    try {
      if (editingId) {
        await api.put(`/erp/entities/${editingId}`, form);
        toast.success('Entity updated');
      } else {
        await api.post('/erp/entities', form);
        toast.success('Entity created');
      }
      setShowModal(false);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Save failed');
    }
  };

  const parentEntity = entities.find(e => e.entity_type === 'PARENT');

  return (
    <>
      <style>{pageStyles}</style>
      <div className="em-container">
        <div className="em-header">
          <h1>Entity & Organization</h1>
          {isPresident && <button className="btn btn-primary" onClick={openCreate}>+ Add Subsidiary</button>}
        </div>

        {loading ? (
          <div className="em-loading">Loading entities...</div>
        ) : entities.length === 0 ? (
          <div className="em-empty">No entities configured. Run seed script or create manually.</div>
        ) : (
          <div className="em-grid">
            {entities.map(entity => (
              <div className="em-card" key={entity._id}>
                <div className="em-card-accent" style={{ background: entity.brand_color || '#6B7280' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <div>
                    <h3>{entity.entity_name}</h3>
                    <div className="em-short">{entity.short_name || '—'}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <span className={`em-badge em-badge-${entity.entity_type?.toLowerCase()}`}>{entity.entity_type}</span>
                    <span className={`em-badge em-badge-${entity.status?.toLowerCase()}`}>{entity.status}</span>
                  </div>
                </div>
                <dl className="em-detail">
                  <dt>TIN</dt><dd>{entity.tin || '—'}</dd>
                  <dt>Address</dt><dd>{entity.address || '—'}</dd>
                  <dt>VAT</dt><dd>{entity.vat_registered ? 'Registered' : 'Non-VAT'}</dd>
                  {entity.tagline && <><dt>Tagline</dt><dd>{entity.tagline}</dd></>}
                </dl>
                {canEdit && (
                  <div style={{ marginTop: 12 }}>
                    <button className="btn btn-sm btn-outline" onClick={() => openEdit(entity)}>Edit</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {showModal && (
          <div className="em-modal" onClick={e => { if (e.target === e.currentTarget) setShowModal(false); }}>
            <div className="em-modal-body">
              <h3>{editingId ? 'Edit Entity' : 'New Subsidiary'}</h3>
              <div className="form-group">
                <label>Entity Name *</label>
                <input value={form.entity_name} onChange={e => setForm({ ...form, entity_name: e.target.value })} />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Short Name</label>
                  <input value={form.short_name} onChange={e => setForm({ ...form, short_name: e.target.value })} placeholder="e.g. VIP" />
                </div>
                <div className="form-group">
                  <label>TIN</label>
                  <input value={form.tin} onChange={e => setForm({ ...form, tin: e.target.value })} />
                </div>
              </div>
              <div className="form-group">
                <label>Address</label>
                <input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>VAT Registered</label>
                  <select value={form.vat_registered ? 'true' : 'false'} onChange={e => setForm({ ...form, vat_registered: e.target.value === 'true' })}>
                    <option value="false">Non-VAT</option>
                    <option value="true">VAT Registered</option>
                  </select>
                </div>
                {editingId && (
                  <div className="form-group">
                    <label>Status</label>
                    <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                      <option value="ACTIVE">Active</option>
                      <option value="INACTIVE">Inactive</option>
                    </select>
                  </div>
                )}
              </div>
              <div className="form-group">
                <label>Tagline</label>
                <input value={form.tagline} onChange={e => setForm({ ...form, tagline: e.target.value })} placeholder="Company tagline" />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Brand Color <span className="em-color-preview" style={{ background: form.brand_color }} /></label>
                  <input type="color" value={form.brand_color} onChange={e => setForm({ ...form, brand_color: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Text Color <span className="em-color-preview" style={{ background: form.brand_text_color }} /></label>
                  <input type="color" value={form.brand_text_color} onChange={e => setForm({ ...form, brand_text_color: e.target.value })} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
                <button className="btn btn-outline" onClick={() => setShowModal(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={handleSave} disabled={!form.entity_name.trim()}>
                  {editingId ? 'Save Changes' : 'Create Entity'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

export default EntityManagerContent;
