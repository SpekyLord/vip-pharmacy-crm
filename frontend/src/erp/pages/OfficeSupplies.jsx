import React, { useState, useEffect, useCallback } from 'react';
import useOfficeSupplies from '../hooks/useOfficeSupplies';

const CATEGORIES = ['ALL', 'PAPER', 'INK_TONER', 'CLEANING', 'STATIONERY', 'ELECTRONICS', 'OTHER'];
const TXN_TYPES = ['PURCHASE', 'ISSUE', 'RETURN', 'ADJUSTMENT'];

const styles = {
  container: { padding: '24px', maxWidth: '1200px', margin: '0 auto' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' },
  title: { fontSize: '24px', fontWeight: 'bold', margin: 0 },
  tabs: { display: 'flex', gap: '0', borderBottom: '2px solid #e5e7eb', marginBottom: '24px', flexWrap: 'wrap' },
  tab: { padding: '10px 16px', cursor: 'pointer', border: 'none', background: 'none', fontSize: '13px', fontWeight: 500, color: '#6b7280', borderBottom: '2px solid transparent', marginBottom: '-2px' },
  tabActive: { padding: '10px 16px', cursor: 'pointer', border: 'none', background: 'none', fontSize: '13px', fontWeight: 600, color: '#2563eb', borderBottom: '2px solid #2563eb', marginBottom: '-2px' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '14px' },
  th: { textAlign: 'left', padding: '10px 12px', borderBottom: '2px solid #e5e7eb', fontWeight: 600, color: '#374151', backgroundColor: '#f9fafb' },
  td: { padding: '10px 12px', borderBottom: '1px solid #e5e7eb' },
  badge: (color) => ({
    display: 'inline-block', padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 600,
    backgroundColor: color === 'green' ? '#dcfce7' : color === 'blue' ? '#dbeafe' : color === 'amber' ? '#fef3c7' : color === 'red' ? '#fee2e2' : '#f3f4f6',
    color: color === 'green' ? '#166534' : color === 'blue' ? '#1e40af' : color === 'amber' ? '#92400e' : color === 'red' ? '#991b1b' : '#374151'
  }),
  btnRow: { display: 'flex', gap: '8px', marginBottom: '16px' },
  btn: { padding: '8px 16px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 500 },
  btnPrimary: { padding: '8px 16px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 500, backgroundColor: '#2563eb', color: '#fff' },
  btnSuccess: { padding: '8px 16px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 500, backgroundColor: '#22c55e', color: '#fff' },
  btnSecondary: { padding: '8px 16px', border: '1px solid #d1d5db', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 500, backgroundColor: '#fff', color: '#374151' },
  modal: { position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  modalContent: { backgroundColor: '#fff', borderRadius: '12px', padding: '24px', width: '480px', maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto' },
  modalTitle: { fontSize: '18px', fontWeight: 600, marginBottom: '16px' },
  formGroup: { marginBottom: '14px' },
  label: { display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '4px', color: '#374151' },
  formInput: { width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px', boxSizing: 'border-box' },
  formActions: { display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '20px' },
  empty: { textAlign: 'center', padding: '40px', color: '#9ca3af' },
  alertRow: { backgroundColor: '#fef2f2' },
  txnSection: { marginTop: '32px', borderTop: '2px solid #e5e7eb', paddingTop: '24px' },
  peso: (val) => `₱${Number(val || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`
};

// ---------- Item Modal ----------
function ItemModal({ open, onClose, onSave, editItem }) {
  const [form, setForm] = useState({ item_name: '', item_code: '', category: 'PAPER', qty_on_hand: 0, reorder_level: 5, unit: 'pc', last_purchase_price: 0 });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editItem) {
      setForm({
        item_name: editItem.item_name || '',
        item_code: editItem.item_code || '',
        category: editItem.category || 'PAPER',
        qty_on_hand: editItem.qty_on_hand || 0,
        reorder_level: editItem.reorder_level || 5,
        unit: editItem.unit || 'pc',
        last_purchase_price: editItem.last_purchase_price || 0
      });
    } else {
      setForm({ item_name: '', item_code: '', category: 'PAPER', qty_on_hand: 0, reorder_level: 5, unit: 'pc', last_purchase_price: 0 });
    }
  }, [editItem, open]);

  const handleChange = (e) => setForm(f => ({ ...f, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({
        ...form,
        qty_on_hand: Number(form.qty_on_hand),
        reorder_level: Number(form.reorder_level),
        last_purchase_price: Number(form.last_purchase_price)
      }, editItem?._id);
      onClose();
    } catch (err) { alert(err?.response?.data?.message || 'Failed to save'); }
    finally { setSaving(false); }
  };

  if (!open) return null;
  return (
    <div style={styles.modal} onClick={onClose}>
      <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
        <h3 style={styles.modalTitle}>{editItem ? 'Edit Item' : 'Create Item'}</h3>
        <form onSubmit={handleSubmit}>
          <div style={styles.formGroup}>
            <label style={styles.label}>Item Name</label>
            <input style={styles.formInput} name="item_name" value={form.item_name} onChange={handleChange} required />
          </div>
          <div style={styles.formGroup}>
            <label style={styles.label}>Item Code</label>
            <input style={styles.formInput} name="item_code" value={form.item_code} onChange={handleChange} required />
          </div>
          <div style={styles.formGroup}>
            <label style={styles.label}>Category</label>
            <select style={styles.formInput} name="category" value={form.category} onChange={handleChange}>
              {CATEGORIES.filter(c => c !== 'ALL').map(c => <option key={c} value={c}>{c.replace('_', ' ')}</option>)}
            </select>
          </div>
          <div style={styles.formGroup}>
            <label style={styles.label}>Unit</label>
            <input style={styles.formInput} name="unit" value={form.unit} onChange={handleChange} />
          </div>
          <div style={styles.formGroup}>
            <label style={styles.label}>Qty On Hand</label>
            <input style={styles.formInput} name="qty_on_hand" type="number" min="0" value={form.qty_on_hand} onChange={handleChange} />
          </div>
          <div style={styles.formGroup}>
            <label style={styles.label}>Reorder Level</label>
            <input style={styles.formInput} name="reorder_level" type="number" min="0" value={form.reorder_level} onChange={handleChange} />
          </div>
          <div style={styles.formGroup}>
            <label style={styles.label}>Last Purchase Price</label>
            <input style={styles.formInput} name="last_purchase_price" type="number" step="0.01" min="0" value={form.last_purchase_price} onChange={handleChange} />
          </div>
          <div style={styles.formActions}>
            <button type="button" style={styles.btnSecondary} onClick={onClose}>Cancel</button>
            <button type="submit" style={styles.btnPrimary} disabled={saving}>{saving ? 'Saving...' : editItem ? 'Update' : 'Create'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------- Transaction Modal ----------
function TxnModal({ open, onClose, onSave, supplies }) {
  const [form, setForm] = useState({ supply: '', txn_type: 'PURCHASE', qty: 1, unit_cost: 0, issued_to: '', notes: '' });
  const [saving, setSaving] = useState(false);

  const handleChange = (e) => setForm(f => ({ ...f, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({ ...form, qty: Number(form.qty), unit_cost: Number(form.unit_cost) });
      onClose();
      setForm({ supply: '', txn_type: 'PURCHASE', qty: 1, unit_cost: 0, issued_to: '', notes: '' });
    } catch (err) { alert(err?.response?.data?.message || 'Failed to record'); }
    finally { setSaving(false); }
  };

  if (!open) return null;
  return (
    <div style={styles.modal} onClick={onClose}>
      <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
        <h3 style={styles.modalTitle}>Record Transaction</h3>
        <form onSubmit={handleSubmit}>
          <div style={styles.formGroup}>
            <label style={styles.label}>Item</label>
            <select style={styles.formInput} name="supply" value={form.supply} onChange={handleChange} required>
              <option value="">Select item...</option>
              {(supplies || []).map(s => <option key={s._id} value={s._id}>{s.item_name} ({s.item_code})</option>)}
            </select>
          </div>
          <div style={styles.formGroup}>
            <label style={styles.label}>Type</label>
            <select style={styles.formInput} name="txn_type" value={form.txn_type} onChange={handleChange}>
              {TXN_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div style={styles.formGroup}>
            <label style={styles.label}>Quantity</label>
            <input style={styles.formInput} name="qty" type="number" min="1" value={form.qty} onChange={handleChange} required />
          </div>
          {(form.txn_type === 'PURCHASE') && (
            <div style={styles.formGroup}>
              <label style={styles.label}>Unit Cost</label>
              <input style={styles.formInput} name="unit_cost" type="number" step="0.01" min="0" value={form.unit_cost} onChange={handleChange} />
            </div>
          )}
          {(form.txn_type === 'ISSUE') && (
            <div style={styles.formGroup}>
              <label style={styles.label}>Issued To</label>
              <input style={styles.formInput} name="issued_to" value={form.issued_to} onChange={handleChange} />
            </div>
          )}
          <div style={styles.formGroup}>
            <label style={styles.label}>Notes</label>
            <input style={styles.formInput} name="notes" value={form.notes} onChange={handleChange} />
          </div>
          <div style={styles.formActions}>
            <button type="button" style={styles.btnSecondary} onClick={onClose}>Cancel</button>
            <button type="submit" style={styles.btnPrimary} disabled={saving}>{saving ? 'Saving...' : 'Record'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------- Main Page ----------
export default function OfficeSupplies() {
  const os = useOfficeSupplies();
  const [supplies, setSupplies] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState('ALL');
  const [showItemModal, setShowItemModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [showTxnModal, setShowTxnModal] = useState(false);
  const [showTxns, setShowTxns] = useState(false);
  const [txnLoading, setTxnLoading] = useState(false);

  const handleExport = async () => {
    try { const res = await os.exportSupplies(); const url = URL.createObjectURL(new Blob([res])); const a = document.createElement('a'); a.href = url; a.download = 'office-supplies-export.xlsx'; a.click(); URL.revokeObjectURL(url); } catch { /* */ }
  };
  const handleImport = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    const fd = new FormData(); fd.append('file', file);
    try { const res = await os.importSupplies(fd); alert(res?.message || 'Import complete'); loadSupplies(); } catch { /* */ }
    e.target.value = '';
  };

  const loadSupplies = useCallback(async () => {
    setLoading(true);
    try {
      const params = activeCategory !== 'ALL' ? { category: activeCategory } : {};
      const res = await os.getSupplies(params);
      setSupplies(res.data || res || []);
    } catch { setSupplies([]); }
    finally { setLoading(false); }
  }, [os, activeCategory]);

  useEffect(() => { loadSupplies(); }, [loadSupplies]);

  const loadTransactions = useCallback(async () => {
    setTxnLoading(true);
    try {
      const res = await os.getTransactions({});
      setTransactions(res.data || res || []);
    } catch { setTransactions([]); }
    finally { setTxnLoading(false); }
  }, [os]);

  useEffect(() => { if (showTxns) loadTransactions(); }, [showTxns, loadTransactions]);

  const handleSaveItem = async (body, id) => {
    if (id) await os.updateSupply(id, body);
    else await os.createSupply(body);
    loadSupplies();
  };

  const handleRecordTxn = async (body) => {
    const supplyId = body.supply;
    await os.recordTransaction(supplyId, body);
    loadSupplies();
    if (showTxns) loadTransactions();
  };

  const catBadge = (cat) => {
    const colors = { PAPER: 'blue', INK_TONER: 'amber', CLEANING: 'green', STATIONERY: 'gray', ELECTRONICS: 'red', OTHER: 'gray' };
    return <span style={styles.badge(colors[cat] || 'gray')}>{(cat || '').replace('_', ' ')}</span>;
  };

  return (
    <div style={styles.container}>
      <div style={{ ...styles.header, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <h1 style={styles.title}>Office Supplies</h1>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #dbe4f0', background: 'transparent', fontSize: 13, fontWeight: 600, cursor: 'pointer' }} onClick={handleExport}>Export Excel</button>
          <label style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #dbe4f0', background: 'transparent', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Import Excel<input type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={handleImport} /></label>
        </div>
      </div>

      <div style={styles.tabs}>
        {CATEGORIES.map(cat => (
          <button
            key={cat}
            style={activeCategory === cat ? styles.tabActive : styles.tab}
            onClick={() => setActiveCategory(cat)}
          >
            {cat === 'ALL' ? 'All' : cat.replace('_', ' ')}
          </button>
        ))}
      </div>

      <div style={styles.btnRow}>
        <button style={styles.btnPrimary} onClick={() => { setEditItem(null); setShowItemModal(true); }}>+ Add Item</button>
        <button style={styles.btnSuccess} onClick={() => setShowTxnModal(true)}>Record Transaction</button>
        <button style={styles.btnSecondary} onClick={() => setShowTxns(t => !t)}>{showTxns ? 'Hide Transactions' : 'Show Transactions'}</button>
      </div>

      {loading ? (
        <div style={styles.empty}>Loading supplies...</div>
      ) : supplies.length === 0 ? (
        <div style={styles.empty}>No items found{activeCategory !== 'ALL' ? ` in ${activeCategory.replace('_', ' ')}` : ''}.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Item Name</th>
                <th style={styles.th}>Code</th>
                <th style={styles.th}>Category</th>
                <th style={styles.th}>Qty On Hand</th>
                <th style={styles.th}>Reorder Level</th>
                <th style={styles.th}>Last Price</th>
                <th style={styles.th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {supplies.map(item => {
                const isLow = item.qty_on_hand <= item.reorder_level;
                return (
                  <tr key={item._id} style={isLow ? styles.alertRow : {}}>
                    <td style={styles.td}>
                      {item.item_name}
                      {isLow && <span style={{ ...styles.badge('red'), marginLeft: '8px' }}>REORDER</span>}
                    </td>
                    <td style={styles.td}>{item.item_code}</td>
                    <td style={styles.td}>{catBadge(item.category)}</td>
                    <td style={{ ...styles.td, fontWeight: 600, color: isLow ? '#dc2626' : '#111' }}>{item.qty_on_hand} {item.unit || ''}</td>
                    <td style={styles.td}>{item.reorder_level}</td>
                    <td style={styles.td}>{styles.peso(item.last_purchase_price)}</td>
                    <td style={styles.td}>
                      <button style={styles.btnSecondary} onClick={() => { setEditItem(item); setShowItemModal(true); }}>Edit</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showTxns && (
        <div style={styles.txnSection}>
          <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px' }}>Transaction History</h2>
          {txnLoading ? (
            <div style={styles.empty}>Loading transactions...</div>
          ) : transactions.length === 0 ? (
            <div style={styles.empty}>No transactions recorded.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Date</th>
                    <th style={styles.th}>Item</th>
                    <th style={styles.th}>Type</th>
                    <th style={styles.th}>Qty</th>
                    <th style={styles.th}>Unit Cost</th>
                    <th style={styles.th}>Issued To</th>
                    <th style={styles.th}>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map(txn => (
                    <tr key={txn._id}>
                      <td style={styles.td}>{txn.createdAt ? new Date(txn.createdAt).toLocaleDateString() : '-'}</td>
                      <td style={styles.td}>{txn.supply?.item_name || txn.supply || '-'}</td>
                      <td style={styles.td}>
                        <span style={styles.badge(txn.txn_type === 'PURCHASE' ? 'green' : txn.txn_type === 'ISSUE' ? 'blue' : txn.txn_type === 'RETURN' ? 'amber' : 'gray')}>
                          {txn.txn_type}
                        </span>
                      </td>
                      <td style={styles.td}>{txn.qty}</td>
                      <td style={styles.td}>{txn.unit_cost ? styles.peso(txn.unit_cost) : '-'}</td>
                      <td style={styles.td}>{txn.issued_to || '-'}</td>
                      <td style={styles.td}>{txn.notes || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <ItemModal open={showItemModal} onClose={() => { setShowItemModal(false); setEditItem(null); }} onSave={handleSaveItem} editItem={editItem} />
      <TxnModal open={showTxnModal} onClose={() => setShowTxnModal(false)} onSave={handleRecordTxn} supplies={supplies} />
    </div>
  );
}
