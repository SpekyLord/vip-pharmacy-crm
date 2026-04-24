/**
 * LookupManager — Phase 24 (Control Center)
 *
 * Centralized UI for managing configurable dropdown values.
 * Replaces hardcoded frontend arrays with database-driven lookups.
 */
import { useState, useEffect, useCallback, useContext } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { ROLE_SETS } from '../../constants/roles';
import useErpSubAccess from '../hooks/useErpSubAccess';
import { EntityContext } from '../../context/EntityContextObject';
import api from '../../services/api';
import toast from 'react-hot-toast';

// Phase G7 — these categories have their own dedicated UI in Control Center →
// Agent Config (AI Cowork / Copilot Tools / AI Budget tabs). They're stored as
// Lookup rows for the same reason every other per-entity config is — the Lookup
// model IS the storage layer — but they should NOT appear in the generic Lookup
// Tables sidebar. Two surfaces for the same data caused split-brain confusion
// and exposed billable AI features in a 50-category list.
const HIDDEN_FROM_LOOKUP_TABLES = new Set(['AI_COWORK_FEATURES', 'COPILOT_TOOLS', 'AI_SPEND_CAPS']);

const pageStyles = `
  .lm-container { padding: 0; }
  .lm-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 12px; }
  .lm-header h1 { font-size: 22px; font-weight: 700; color: var(--erp-text, #132238); margin: 0; }
  .lm-layout { display: flex; gap: 16px; min-height: 400px; }
  .lm-cats { width: 240px; flex-shrink: 0; background: var(--erp-panel, #fff); border: 1px solid var(--erp-border, #dbe4f0); border-radius: 14px; padding: 12px; overflow-y: auto; max-height: 600px; }
  .lm-cat-item { padding: 8px 12px; border-radius: 8px; cursor: pointer; font-size: 13px; font-weight: 500; color: var(--erp-text); transition: background .1s; margin-bottom: 2px; display: flex; justify-content: space-between; align-items: center; }
  .lm-cat-item:hover { background: var(--erp-accent-soft, #e8efff); }
  .lm-cat-item.active { background: var(--erp-accent, #1e5eff); color: #fff; }
  .lm-cat-count { font-size: 10px; background: rgba(0,0,0,.08); padding: 1px 6px; border-radius: 10px; }
  .lm-cat-item.active .lm-cat-count { background: rgba(255,255,255,.25); }
  .lm-content { flex: 1; min-width: 0; }
  .lm-panel { background: var(--erp-panel, #fff); border: 1px solid var(--erp-border); border-radius: 14px; padding: 20px; }
  .lm-panel-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 8px; }
  .lm-panel-header h3 { font-size: 16px; font-weight: 700; margin: 0; color: var(--erp-text); }
  .lm-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .lm-table th { background: var(--erp-accent-soft, #e8efff); padding: 8px 12px; text-align: left; font-weight: 600; font-size: 11px; text-transform: uppercase; color: var(--erp-muted); }
  .lm-table td { padding: 8px 12px; border-top: 1px solid var(--erp-border); }
  .lm-table tr:hover { background: var(--erp-accent-soft); }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 6px; font-size: 11px; font-weight: 600; }
  .badge-active { background: #dcfce7; color: #166534; }
  .badge-inactive { background: #fee2e2; color: #991b1b; }
  .btn { padding: 8px 16px; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; }
  .btn-primary { background: var(--erp-accent, #1e5eff); color: #fff; }
  .btn-sm { padding: 5px 12px; font-size: 12px; }
  .btn-outline { background: transparent; border: 1px solid var(--erp-border); color: var(--erp-text); }
  .btn-success { background: #16a34a; color: #fff; }
  .btn-danger-outline { background: transparent; border: 1px solid #fecaca; color: #991b1b; }
  .lm-modal { position: fixed; inset: 0; background: rgba(0,0,0,.4); display: flex; align-items: center; justify-content: center; z-index: 100; }
  .lm-modal-body { background: var(--erp-panel, #fff); border-radius: 14px; padding: 24px; width: 400px; max-width: 95vw; }
  .lm-modal-body h3 { margin: 0 0 16px; font-size: 16px; }
  .form-group { margin-bottom: 12px; }
  .form-group label { display: block; font-size: 12px; font-weight: 600; margin-bottom: 4px; color: var(--erp-muted); }
  .form-group input, .form-group select { width: 100%; padding: 8px 10px; border-radius: 6px; border: 1px solid var(--erp-border); font-size: 13px; box-sizing: border-box; }
  .lm-empty { text-align: center; padding: 40px; color: var(--erp-muted); font-size: 13px; }
  .lm-no-cat { text-align: center; padding: 60px 20px; color: var(--erp-muted); font-size: 14px; }
  @media(max-width: 768px) { .lm-layout { flex-direction: column; } .lm-cats { width: 100%; max-height: none; } }
`;

const formatCategory = (cat) => cat.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

export function LookupManagerContent() {
  const { user } = useAuth();
  const entityCtx = useContext(EntityContext);
  const workingEntityId = entityCtx?.workingEntityId || null;
  const canEdit = ROLE_SETS.MANAGEMENT.includes(user?.role);
  // Phase 3c — lookup-row delete (Deactivate) gated by Tier 2 lookup-only accounting.lookup_delete.
  // Activate (PUT to flip is_active back) remains under canEdit (recoverable).
  const { hasSubPermission } = useErpSubAccess();
  const canDeleteLookup = hasSubPermission('accounting', 'lookup_delete');

  const [categories, setCategories] = useState([]);
  const [seedDefaults, setSeedDefaults] = useState({});
  const [activeCat, setActiveCat] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [form, setForm] = useState({ code: '', label: '', sort_order: 0 });
  const [catCounts, setCatCounts] = useState({});

  // Reload when entity changes
  const loadCategories = useCallback(async () => {
    try {
      const [catRes, seedRes] = await Promise.all([
        api.get('/erp/lookup-values/categories'),
        api.get('/erp/lookup-values/seed-defaults')
      ]);
      const cats = catRes.data?.data || [];
      setCategories(cats);
      setSeedDefaults(seedRes.data?.data || {});
      if (cats.length > 0) setActiveCat(prev => prev && cats.includes(prev) ? prev : cats[0]);
    } catch {
      toast.error('Failed to load categories');
    }
  }, [workingEntityId]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadItems = useCallback(async () => {
    if (!activeCat) return;
    setLoading(true);
    try {
      const res = await api.get(`/erp/lookup-values/${activeCat}`);
      const data = res.data?.data || [];
      setItems(data);
      setCatCounts(prev => ({ ...prev, [activeCat]: data.length }));
    } catch {
      toast.error('Failed to load items');
    }
    setLoading(false);
  }, [activeCat, workingEntityId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadCategories(); }, [loadCategories]);
  useEffect(() => { loadItems(); }, [loadItems]);

  const handleSeed = async () => {
    try {
      const res = await api.post(`/erp/lookup-values/${activeCat}/seed`);
      toast.success(res.data?.message || 'Seeded');
      loadItems();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Seed failed');
    }
  };

  const handleSeedAll = async () => {
    try {
      const res = await api.post('/erp/lookup-values/seed-all');
      toast.success(res.data?.message || 'All categories seeded');
      loadCategories();
      if (activeCat) loadItems();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Seed all failed');
    }
  };

  // Show metadata column/editor for any category whose rows already carry
  // metadata. The column collapses on truly metadata-less categories so the
  // table stays narrow, but the modal editor always exposes metadata so admins
  // can configure new role/threshold/option values without a code change.
  // (Rule #3 — no hardcoded category allowlists.)
  const hasMetadata = items.some(i => i.metadata && Object.keys(i.metadata).length > 0);

  const openCreate = () => {
    setEditItem(null);
    setForm({ code: '', label: '', sort_order: items.length * 10, metadata: '{}' });
    setShowModal(true);
  };

  const openEdit = (item) => {
    setEditItem(item);
    setForm({
      code: item.code,
      label: item.label,
      sort_order: item.sort_order || 0,
      metadata: item.metadata ? JSON.stringify(item.metadata, null, 2) : '{}',
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    try {
      let parsedMeta = {};
      if (form.metadata && form.metadata.trim()) {
        try { parsedMeta = JSON.parse(form.metadata); } catch { toast.error('Invalid JSON in metadata'); return; }
      }
      if (editItem) {
        await api.put(`/erp/lookup-values/${activeCat}/${editItem._id}`, { label: form.label, sort_order: parseInt(form.sort_order) || 0, metadata: parsedMeta });
        toast.success('Updated');
      } else {
        await api.post(`/erp/lookup-values/${activeCat}`, { category: activeCat, code: form.code, label: form.label, sort_order: parseInt(form.sort_order) || 0, metadata: parsedMeta });
        toast.success('Created');
      }
      setShowModal(false);
      loadItems();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Save failed');
    }
  };

  const handleToggle = async (item) => {
    try {
      if (item.is_active) {
        await api.delete(`/erp/lookup-values/${activeCat}/${item._id}`);
      } else {
        await api.put(`/erp/lookup-values/${activeCat}/${item._id}`, { is_active: true });
      }
      loadItems();
    } catch {
      toast.error('Toggle failed');
    }
  };

  return (
    <>
      <style>{pageStyles}</style>
      <div className="lm-container">
        <div className="lm-header">
          <h1>Lookup Tables</h1>
          {canEdit && (
            <button className="btn btn-success" onClick={handleSeedAll}>
              Seed All Categories
            </button>
          )}
        </div>

        <div className="lm-layout">
          <div className="lm-cats">
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--erp-muted)', textTransform: 'uppercase', padding: '0 12px 8px', letterSpacing: 0.5 }}>Categories</div>
            {categories.filter(cat => !HIDDEN_FROM_LOOKUP_TABLES.has(cat)).map(cat => (
              <div
                key={cat}
                className={`lm-cat-item ${activeCat === cat ? 'active' : ''}`}
                onClick={() => setActiveCat(cat)}
              >
                <span>{formatCategory(cat)}</span>
                {catCounts[cat] != null && <span className="lm-cat-count">{catCounts[cat]}</span>}
              </div>
            ))}
          </div>

          <div className="lm-content">
            {!activeCat ? (
              <div className="lm-no-cat">Select a category to manage its lookup values</div>
            ) : (
              <div className="lm-panel">
                <div className="lm-panel-header">
                  <h3>{formatCategory(activeCat)}</h3>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {canEdit && seedDefaults[activeCat] && (
                      <button className="btn btn-sm btn-success" onClick={handleSeed} title={`Seed ${seedDefaults[activeCat]?.count} defaults`}>
                        Seed Defaults ({seedDefaults[activeCat]?.count})
                      </button>
                    )}
                    {canEdit && <button className="btn btn-sm btn-primary" onClick={openCreate}>+ Add Item</button>}
                  </div>
                </div>


                {loading ? (
                  <div className="lm-empty">Loading...</div>
                ) : items.length === 0 ? (
                  <div className="lm-empty">
                    No items in this category.
                    {seedDefaults[activeCat] && canEdit && (
                      <div style={{ marginTop: 8 }}>
                        <button className="btn btn-sm btn-success" onClick={handleSeed}>Seed {seedDefaults[activeCat]?.count} Defaults</button>
                      </div>
                    )}
                  </div>
                ) : (
                  <table className="lm-table">
                    <thead>
                      <tr>
                        <th>Code</th>
                        <th>Label</th>
                        {hasMetadata && <th>Config Values</th>}
                        <th>Order</th>
                        <th>Status</th>
                        {canEdit && <th></th>}
                      </tr>
                    </thead>
                    <tbody>
                      {items.map(item => (
                        <tr key={item._id}>
                          <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{item.code}</td>
                          <td>{item.label}</td>
                          {hasMetadata && (
                            <td style={{ fontSize: 11, color: 'var(--erp-muted)', maxWidth: 300 }}>
                              {item.metadata && Object.keys(item.metadata).length > 0 ? (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                  {Object.entries(item.metadata).map(([k, v]) => (
                                    <span key={k} style={{ background: 'var(--erp-accent-soft)', padding: '2px 6px', borderRadius: 4, fontSize: 11 }}>
                                      {k}: <strong>{typeof v === 'boolean' ? (v ? 'Yes' : 'No') : typeof v === 'number' ? v.toLocaleString() : String(v || '-')}</strong>
                                    </span>
                                  ))}
                                </div>
                              ) : '—'}
                            </td>
                          )}
                          <td style={{ color: 'var(--erp-muted)' }}>{item.sort_order}</td>
                          <td><span className={`badge ${item.is_active ? 'badge-active' : 'badge-inactive'}`}>{item.is_active ? 'Active' : 'Inactive'}</span></td>
                          {canEdit && (
                            <td>
                              <button className="btn btn-sm btn-outline" onClick={() => openEdit(item)} style={{ marginRight: 4 }}>Edit</button>
                              {/* Phase 3c — Deactivate is a DELETE call (gated). Activate is a PUT (recoverable, canEdit-only). */}
                              {(item.is_active ? canDeleteLookup : true) && (
                                <button className="btn btn-sm btn-danger-outline" onClick={() => handleToggle(item)}>
                                  {item.is_active ? 'Deactivate' : 'Activate'}
                                </button>
                              )}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        </div>

        {showModal && (
          <div className="lm-modal" onClick={e => { if (e.target === e.currentTarget) setShowModal(false); }}>
            <div className="lm-modal-body">
              <h3>{editItem ? 'Edit Lookup Item' : 'New Lookup Item'}</h3>
              {!editItem && (
                <div className="form-group">
                  <label>Code</label>
                  <input value={form.code} onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="e.g. TRANSPORTATION" />
                </div>
              )}
              <div className="form-group">
                <label>Label</label>
                <input value={form.label} onChange={e => setForm({ ...form, label: e.target.value })} placeholder="Display label" />
              </div>
              <div className="form-group">
                <label>Sort Order</label>
                <input type="number" value={form.sort_order} onChange={e => setForm({ ...form, sort_order: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Metadata (JSON) — role lists, thresholds, budgets, flags. Leave as <code>{'{}'}</code> if not used.</label>
                <textarea
                  value={form.metadata}
                  onChange={e => setForm({ ...form, metadata: e.target.value })}
                  rows={5}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--erp-border)', fontFamily: 'monospace', fontSize: 12, boxSizing: 'border-box', resize: 'vertical' }}
                  placeholder='{ "roles": ["admin", "finance", "president", "staff"] }'
                />
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
                <button className="btn btn-outline" onClick={() => setShowModal(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={handleSave} disabled={!form.label.trim() || (!editItem && !form.code.trim())}>
                  {editItem ? 'Save' : 'Create'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

export default LookupManagerContent;
