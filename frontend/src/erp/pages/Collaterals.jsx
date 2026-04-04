import React, { useState, useEffect, useCallback } from 'react';
import useCollaterals from '../hooks/useCollaterals';

const COLLATERAL_TYPES = ['ALL', 'BROCHURE', 'SAMPLE', 'MERCHANDISE', 'BANNER', 'FLYER', 'OTHER'];

const styles = {
  container: { padding: '24px', maxWidth: '1200px', margin: '0 auto' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' },
  title: { fontSize: '24px', fontWeight: 'bold', margin: 0 },
  filterRow: { display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap', alignItems: 'center' },
  select: { padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px', backgroundColor: '#fff' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' },
  card: { border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' },
  cardImg: { width: '100%', height: '160px', objectFit: 'cover', backgroundColor: '#f3f4f6' },
  cardImgPlaceholder: { width: '100%', height: '160px', backgroundColor: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: '14px' },
  cardBody: { padding: '16px' },
  cardTitle: { fontSize: '16px', fontWeight: 600, marginBottom: '4px' },
  cardRow: { display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '13px', color: '#4b5563' },
  cardActions: { display: 'flex', gap: '6px', marginTop: '12px', flexWrap: 'wrap' },
  badge: (color) => ({
    display: 'inline-block', padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 600,
    backgroundColor: color === 'green' ? '#dcfce7' : color === 'blue' ? '#dbeafe' : color === 'amber' ? '#fef3c7' : color === 'red' ? '#fee2e2' : color === 'purple' ? '#f3e8ff' : '#f3f4f6',
    color: color === 'green' ? '#166534' : color === 'blue' ? '#1e40af' : color === 'amber' ? '#92400e' : color === 'red' ? '#991b1b' : color === 'purple' ? '#7c3aed' : '#374151'
  }),
  btn: { padding: '6px 12px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 500 },
  btnPrimary: { padding: '8px 16px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 500, backgroundColor: '#2563eb', color: '#fff' },
  btnSuccess: { padding: '6px 12px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 500, backgroundColor: '#22c55e', color: '#fff' },
  btnAmber: { padding: '6px 12px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 500, backgroundColor: '#f59e0b', color: '#fff' },
  btnSecondary: { padding: '6px 12px', border: '1px solid #d1d5db', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 500, backgroundColor: '#fff', color: '#374151' },
  btnSecondaryLg: { padding: '8px 16px', border: '1px solid #d1d5db', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 500, backgroundColor: '#fff', color: '#374151' },
  modal: { position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  modalContent: { backgroundColor: '#fff', borderRadius: '12px', padding: '24px', width: '480px', maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto' },
  modalTitle: { fontSize: '18px', fontWeight: 600, marginBottom: '16px' },
  formGroup: { marginBottom: '14px' },
  label: { display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '4px', color: '#374151' },
  formInput: { width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px', boxSizing: 'border-box' },
  formActions: { display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '20px' },
  empty: { textAlign: 'center', padding: '40px', color: '#9ca3af' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '14px', marginTop: '16px' },
  th: { textAlign: 'left', padding: '10px 12px', borderBottom: '2px solid #e5e7eb', fontWeight: 600, color: '#374151', backgroundColor: '#f9fafb' },
  td: { padding: '10px 12px', borderBottom: '1px solid #e5e7eb' },
  viewToggle: { display: 'flex', gap: '4px' }
};

const TYPE_COLORS = { BROCHURE: 'blue', SAMPLE: 'green', MERCHANDISE: 'purple', BANNER: 'amber', FLYER: 'gray', OTHER: 'gray' };

// ---------- Create/Edit Modal ----------
function CollateralModal({ open, onClose, onSave, editItem }) {
  const [form, setForm] = useState({ name: '', collateral_type: 'BROCHURE', qty_on_hand: 0, assigned_to: '', description: '', photo_url: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editItem) {
      setForm({
        name: editItem.name || '',
        collateral_type: editItem.collateral_type || 'BROCHURE',
        qty_on_hand: editItem.qty_on_hand || 0,
        assigned_to: editItem.assigned_to || '',
        description: editItem.description || '',
        photo_url: editItem.photo_url || ''
      });
    } else {
      setForm({ name: '', collateral_type: 'BROCHURE', qty_on_hand: 0, assigned_to: '', description: '', photo_url: '' });
    }
  }, [editItem, open]);

  const handleChange = (e) => setForm(f => ({ ...f, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({ ...form, qty_on_hand: Number(form.qty_on_hand) }, editItem?._id);
      onClose();
    } catch (err) { alert(err?.response?.data?.message || 'Failed to save'); }
    finally { setSaving(false); }
  };

  if (!open) return null;
  return (
    <div style={styles.modal} onClick={onClose}>
      <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
        <h3 style={styles.modalTitle}>{editItem ? 'Edit Collateral' : 'Create Collateral'}</h3>
        <form onSubmit={handleSubmit}>
          <div style={styles.formGroup}>
            <label style={styles.label}>Name</label>
            <input style={styles.formInput} name="name" value={form.name} onChange={handleChange} required />
          </div>
          <div style={styles.formGroup}>
            <label style={styles.label}>Type</label>
            <select style={styles.formInput} name="collateral_type" value={form.collateral_type} onChange={handleChange}>
              {COLLATERAL_TYPES.filter(t => t !== 'ALL').map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div style={styles.formGroup}>
            <label style={styles.label}>Qty On Hand</label>
            <input style={styles.formInput} name="qty_on_hand" type="number" min="0" value={form.qty_on_hand} onChange={handleChange} />
          </div>
          <div style={styles.formGroup}>
            <label style={styles.label}>Assigned To</label>
            <input style={styles.formInput} name="assigned_to" value={form.assigned_to} onChange={handleChange} placeholder="Person or department" />
          </div>
          <div style={styles.formGroup}>
            <label style={styles.label}>Description</label>
            <textarea style={{ ...styles.formInput, minHeight: '60px' }} name="description" value={form.description} onChange={handleChange} />
          </div>
          <div style={styles.formGroup}>
            <label style={styles.label}>Photo URL</label>
            <input style={styles.formInput} name="photo_url" value={form.photo_url} onChange={handleChange} placeholder="https://..." />
          </div>
          <div style={styles.formActions}>
            <button type="button" style={{ ...styles.btnSecondary, padding: '8px 16px', fontSize: '13px' }} onClick={onClose}>Cancel</button>
            <button type="submit" style={styles.btnPrimary} disabled={saving}>{saving ? 'Saving...' : editItem ? 'Update' : 'Create'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------- Distribution Modal ----------
function DistributionModal({ open, onClose, onSave, collaterals }) {
  const [form, setForm] = useState({ collateral: '', qty: 1, recipient: '', hospital: '', notes: '' });
  const [saving, setSaving] = useState(false);

  const handleChange = (e) => setForm(f => ({ ...f, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({ ...form, qty: Number(form.qty) });
      onClose();
      setForm({ collateral: '', qty: 1, recipient: '', hospital: '', notes: '' });
    } catch (err) { alert(err?.response?.data?.message || 'Failed to record distribution'); }
    finally { setSaving(false); }
  };

  if (!open) return null;
  return (
    <div style={styles.modal} onClick={onClose}>
      <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
        <h3 style={styles.modalTitle}>Record Distribution</h3>
        <form onSubmit={handleSubmit}>
          <div style={styles.formGroup}>
            <label style={styles.label}>Collateral</label>
            <select style={styles.formInput} name="collateral" value={form.collateral} onChange={handleChange} required>
              <option value="">Select collateral...</option>
              {(collaterals || []).map(c => <option key={c._id} value={c._id}>{c.name} (qty: {c.qty_on_hand})</option>)}
            </select>
          </div>
          <div style={styles.formGroup}>
            <label style={styles.label}>Quantity</label>
            <input style={styles.formInput} name="qty" type="number" min="1" value={form.qty} onChange={handleChange} required />
          </div>
          <div style={styles.formGroup}>
            <label style={styles.label}>Recipient</label>
            <input style={styles.formInput} name="recipient" value={form.recipient} onChange={handleChange} required />
          </div>
          <div style={styles.formGroup}>
            <label style={styles.label}>Hospital / Location</label>
            <input style={styles.formInput} name="hospital" value={form.hospital} onChange={handleChange} />
          </div>
          <div style={styles.formGroup}>
            <label style={styles.label}>Notes</label>
            <input style={styles.formInput} name="notes" value={form.notes} onChange={handleChange} />
          </div>
          <div style={styles.formActions}>
            <button type="button" style={{ ...styles.btnSecondary, padding: '8px 16px', fontSize: '13px' }} onClick={onClose}>Cancel</button>
            <button type="submit" style={styles.btnPrimary} disabled={saving}>{saving ? 'Saving...' : 'Distribute'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------- Return Modal ----------
function ReturnModal({ open, onClose, onSave, collaterals }) {
  const [form, setForm] = useState({ collateral: '', qty: 1 });
  const [saving, setSaving] = useState(false);

  const handleChange = (e) => setForm(f => ({ ...f, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({ ...form, qty: Number(form.qty) });
      onClose();
      setForm({ collateral: '', qty: 1 });
    } catch (err) { alert(err?.response?.data?.message || 'Failed to record return'); }
    finally { setSaving(false); }
  };

  if (!open) return null;
  return (
    <div style={styles.modal} onClick={onClose}>
      <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
        <h3 style={styles.modalTitle}>Record Return</h3>
        <form onSubmit={handleSubmit}>
          <div style={styles.formGroup}>
            <label style={styles.label}>Collateral</label>
            <select style={styles.formInput} name="collateral" value={form.collateral} onChange={handleChange} required>
              <option value="">Select collateral...</option>
              {(collaterals || []).map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
            </select>
          </div>
          <div style={styles.formGroup}>
            <label style={styles.label}>Quantity</label>
            <input style={styles.formInput} name="qty" type="number" min="1" value={form.qty} onChange={handleChange} required />
          </div>
          <div style={styles.formActions}>
            <button type="button" style={{ ...styles.btnSecondary, padding: '8px 16px', fontSize: '13px' }} onClick={onClose}>Cancel</button>
            <button type="submit" style={styles.btnPrimary} disabled={saving}>{saving ? 'Saving...' : 'Record Return'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------- Main Page ----------
export default function Collaterals() {
  const col = useCollaterals();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [viewMode, setViewMode] = useState('cards'); // cards | table
  const [showItemModal, setShowItemModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [showDistModal, setShowDistModal] = useState(false);
  const [showReturnModal, setShowReturnModal] = useState(false);

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const params = typeFilter !== 'ALL' ? { collateral_type: typeFilter } : {};
      const res = await col.getAll(params);
      setItems(res.data || res || []);
    } catch { setItems([]); }
    finally { setLoading(false); }
  }, [col, typeFilter]);

  useEffect(() => { loadItems(); }, [loadItems]);

  const handleSaveItem = async (body, id) => {
    if (id) await col.update(id, body);
    else await col.create(body);
    loadItems();
  };

  const handleDistribute = async (body) => {
    const collateralId = body.collateral;
    await col.recordDistribution(collateralId, body);
    loadItems();
  };

  const handleReturn = async (body) => {
    const collateralId = body.collateral;
    await col.recordReturn(collateralId, body);
    loadItems();
  };

  const typeBadge = (type) => <span style={styles.badge(TYPE_COLORS[type] || 'gray')}>{type}</span>;

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>Collaterals</h1>
      </div>

      <div style={styles.filterRow}>
        <select style={styles.select} value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
          {COLLATERAL_TYPES.map(t => <option key={t} value={t}>{t === 'ALL' ? 'All Types' : t}</option>)}
        </select>
        <div style={styles.viewToggle}>
          <button style={viewMode === 'cards' ? styles.btnPrimary : styles.btnSecondaryLg} onClick={() => setViewMode('cards')}>Cards</button>
          <button style={viewMode === 'table' ? styles.btnPrimary : styles.btnSecondaryLg} onClick={() => setViewMode('table')}>Table</button>
        </div>
        <div style={{ flex: 1 }} />
        <button style={styles.btnPrimary} onClick={() => { setEditItem(null); setShowItemModal(true); }}>+ Add Collateral</button>
        <button style={{ ...styles.btnSuccess, padding: '8px 16px', fontSize: '13px' }} onClick={() => setShowDistModal(true)}>Distribute</button>
        <button style={{ ...styles.btnAmber, padding: '8px 16px', fontSize: '13px' }} onClick={() => setShowReturnModal(true)}>Record Return</button>
      </div>

      {loading ? (
        <div style={styles.empty}>Loading collaterals...</div>
      ) : items.length === 0 ? (
        <div style={styles.empty}>No collaterals found{typeFilter !== 'ALL' ? ` for type ${typeFilter}` : ''}.</div>
      ) : viewMode === 'cards' ? (
        <div style={styles.grid}>
          {items.map(item => (
            <div key={item._id} style={styles.card}>
              {item.photo_url ? (
                <img src={item.photo_url} alt={item.name} style={styles.cardImg} />
              ) : (
                <div style={styles.cardImgPlaceholder}>No Photo</div>
              )}
              <div style={styles.cardBody}>
                <div style={styles.cardTitle}>{item.name}</div>
                <div style={{ marginBottom: '8px' }}>{typeBadge(item.collateral_type)}</div>
                <div style={styles.cardRow}>
                  <span>Qty On Hand</span>
                  <span style={{ fontWeight: 600, color: item.qty_on_hand <= 0 ? '#dc2626' : '#111' }}>{item.qty_on_hand}</span>
                </div>
                <div style={styles.cardRow}>
                  <span>Assigned To</span>
                  <span>{item.assigned_to || '-'}</span>
                </div>
                {item.description && (
                  <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '6px' }}>{item.description}</div>
                )}
                <div style={styles.cardActions}>
                  <button style={styles.btnSecondary} onClick={() => { setEditItem(item); setShowItemModal(true); }}>Edit</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Name</th>
                <th style={styles.th}>Type</th>
                <th style={styles.th}>Qty On Hand</th>
                <th style={styles.th}>Assigned To</th>
                <th style={styles.th}>Description</th>
                <th style={styles.th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item._id}>
                  <td style={styles.td}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {item.photo_url && <img src={item.photo_url} alt="" style={{ width: '32px', height: '32px', borderRadius: '4px', objectFit: 'cover' }} />}
                      {item.name}
                    </div>
                  </td>
                  <td style={styles.td}>{typeBadge(item.collateral_type)}</td>
                  <td style={{ ...styles.td, fontWeight: 600, color: item.qty_on_hand <= 0 ? '#dc2626' : '#111' }}>{item.qty_on_hand}</td>
                  <td style={styles.td}>{item.assigned_to || '-'}</td>
                  <td style={styles.td}>{item.description || '-'}</td>
                  <td style={styles.td}>
                    <button style={styles.btnSecondary} onClick={() => { setEditItem(item); setShowItemModal(true); }}>Edit</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <CollateralModal open={showItemModal} onClose={() => { setShowItemModal(false); setEditItem(null); }} onSave={handleSaveItem} editItem={editItem} />
      <DistributionModal open={showDistModal} onClose={() => setShowDistModal(false)} onSave={handleDistribute} collaterals={items} />
      <ReturnModal open={showReturnModal} onClose={() => setShowReturnModal(false)} onSave={handleReturn} collaterals={items} />
    </div>
  );
}
