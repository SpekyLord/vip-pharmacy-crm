/**
 * CreditNotes — Phase 25
 * Return/Credit Note workflow: DRAFT → VALIDATE → POST
 * Same park-check-post pattern as SalesEntry.
 */
import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import useErpApi from '../hooks/useErpApi';
import useInventory from '../hooks/useInventory';
import useHospitals from '../hooks/useHospitals';
import useCustomers from '../hooks/useCustomers';
import { useLookupBatch } from '../hooks/useLookups';
import SelectField from '../../components/common/Select';
import WarehousePicker from '../components/WarehousePicker';
import WorkflowGuide from '../components/WorkflowGuide';
import { showError, showApprovalPending } from '../utils/errorToast';

const STATUS_COLORS = {
  DRAFT: { bg: '#e2e8f0', text: '#475569', label: 'Draft' },
  VALID: { bg: '#dcfce7', text: '#166534', label: 'Valid' },
  ERROR: { bg: '#fef2f2', text: '#991b1b', label: 'Error' },
  POSTED: { bg: '#dbeafe', text: '#1e40af', label: 'Posted' }
};


const emptyLine = () => ({
  product_id: '', item_key: '', batch_lot_no: '', expiry_date: '',
  qty: '', unit: '', unit_price: '', return_reason: '', return_condition: 'RESALEABLE', notes: ''
});

export default function CreditNotes() {
  const api = useErpApi();
  const { getMyStock } = useInventory();
  const { hospitals } = useHospitals();
  const customers = useCustomers();
  const { data: lookups } = useLookupBatch(['RETURN_REASON', 'RETURN_CONDITION']);
  const RETURN_REASONS = (lookups.RETURN_REASON || []).map(o => ({ value: o.code, label: o.label }));
  const RETURN_CONDITIONS = (lookups.RETURN_CONDITION || []).map(o => ({ value: o.code, label: o.label }));

  const [docs, setDocs] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [warehouseId, setWarehouseId] = useState('');
  const [productOptions, setProductOptions] = useState([]);
  const [customerOptions, setCustomerOptions] = useState([]);
  const [actionLoading, setActionLoading] = useState('');

  const [form, setForm] = useState({
    hospital_id: '', customer_id: '', cn_date: new Date().toISOString().split('T')[0],
    original_doc_ref: '', notes: '', line_items: [emptyLine()]
  });

  const loadDocs = useCallback(async () => {
    try {
      const res = await api.get('/credit-notes', { params: { limit: 0 } });
      setDocs((res?.data || []).filter(d => ['DRAFT', 'VALID', 'ERROR', 'POSTED'].includes(d.status)));
    } catch (err) { console.error('[CreditNotes] load:', err.message); }
  }, [api]);

  const loadProducts = useCallback(async () => {
    try {
      const res = await getMyStock(null, null, warehouseId || undefined);
      setProductOptions((res?.data || []).map(p => ({
        product_id: p.product_id, label: `${p.brand_name || ''} ${p.dosage_strength || ''} — ${p.available_qty} ${p.unit || ''}`.trim(),
        brand_name: p.brand_name, batch_lot_no: p.batch_lot_no, expiry_date: p.expiry_date,
        available_qty: p.available_qty, unit: p.unit, unit_price: p.unit_price || 0
      })));
    } catch { /* fallback */ }
  }, [getMyStock, warehouseId]);

  useEffect(() => { loadDocs(); }, [loadDocs]);
  useEffect(() => { loadProducts(); }, [loadProducts]);
  useEffect(() => {
    customers.getAll({ limit: 0, status: 'ACTIVE' })
      .then(res => setCustomerOptions(res?.data || []))
      .catch(() => setCustomerOptions([]));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const updateLine = (idx, field, value) => {
    setForm(prev => {
      const items = [...prev.line_items];
      items[idx] = { ...items[idx], [field]: value };

      // Auto-fill from product selection
      if (field === 'product_id') {
        const prod = productOptions.find(p => p.product_id === value);
        if (prod) {
          items[idx].item_key = prod.brand_name || '';
          items[idx].batch_lot_no = prod.batch_lot_no || '';
          items[idx].expiry_date = prod.expiry_date ? new Date(prod.expiry_date).toISOString().split('T')[0] : '';
          items[idx].unit = prod.unit || '';
          items[idx].unit_price = prod.unit_price || 0;
        }
      }
      return { ...prev, line_items: items };
    });
  };

  const addLine = () => setForm(p => ({ ...p, line_items: [...p.line_items, emptyLine()] }));
  const removeLine = (idx) => setForm(p => ({ ...p, line_items: p.line_items.filter((_, i) => i !== idx) }));

  const handleSave = async () => {
    const issues = [];
    if (!form.hospital_id && !form.customer_id) issues.push('Hospital or customer is required');
    if (!form.cn_date) issues.push('Date is required');
    if (!form.line_items.length) issues.push('At least one return line is required');
    form.line_items.forEach((li, i) => {
      if (!li.product_id) issues.push(`Line ${i + 1}: product is required`);
      if (!li.qty || parseFloat(li.qty) <= 0) issues.push(`Line ${i + 1}: quantity must be > 0`);
      if (!li.return_reason) issues.push(`Line ${i + 1}: return reason is required`);
      if (!li.batch_lot_no) issues.push(`Line ${i + 1}: batch/lot number is required`);
    });
    if (issues.length) { showError(null, issues.join('. ')); return; }

    setActionLoading('save');
    try {
      const payload = {
        ...form,
        hospital_id: form.hospital_id || undefined,
        customer_id: form.customer_id || undefined,
        warehouse_id: warehouseId || undefined,
        line_items: form.line_items.map(li => ({
          ...li, qty: parseFloat(li.qty), unit_price: parseFloat(li.unit_price) || 0
        }))
      };

      if (editing) await api.put(`/credit-notes/${editing._id}`, payload);
      else await api.post('/credit-notes', payload);

      setShowForm(false);
      setEditing(null);
      await loadDocs();
    } catch (err) { showError(err, 'Could not save credit note'); }
    finally { setActionLoading(''); }
  };

  const handleValidate = async () => {
    setActionLoading('validate');
    try { await api.post('/credit-notes/validate'); await loadDocs(); }
    catch (err) { showError(err, 'Validation failed'); }
    finally { setActionLoading(''); }
  };

  const handleSubmit = async () => {
    setActionLoading('submit');
    try {
      const res = await api.post('/credit-notes/submit');
      if (res?.approval_pending) { showApprovalPending(res.message); }
      await loadDocs();
    } catch (err) {
      if (err?.response?.data?.approval_pending) { showApprovalPending(err.response.data.message); await loadDocs(); }
      else showError(err, 'Submit failed');
    } finally { setActionLoading(''); }
  };

  const handleEdit = async (doc) => {
    try {
      const res = await api.get(`/credit-notes/${doc._id}`);
      const d = res?.data;
      setEditing(d);
      setForm({
        hospital_id: d.hospital_id?._id || d.hospital_id || '',
        customer_id: d.customer_id?._id || d.customer_id || '',
        cn_date: d.cn_date ? new Date(d.cn_date).toISOString().split('T')[0] : '',
        original_doc_ref: d.original_doc_ref || '',
        notes: d.notes || '',
        line_items: (d.line_items || []).map(li => ({
          ...li, product_id: li.product_id?._id || li.product_id || '',
          expiry_date: li.expiry_date ? new Date(li.expiry_date).toISOString().split('T')[0] : ''
        }))
      });
      setShowForm(true);
    } catch (err) { showError(err, 'Could not load credit note'); }
  };

  const handleDelete = async (id) => {
    try { await api.del(`/credit-notes/${id}`); await loadDocs(); }
    catch (err) { showError(err, 'Delete failed'); }
  };

  const handlePrint = (id) => {
    window.open(`/api/erp/print/credit-note/${id}`, '_blank');
  };

  const computeLineTotal = (item) => ((parseFloat(item.qty) || 0) * (parseFloat(item.unit_price) || 0)).toFixed(2);

  return (
    <div className="admin-page erp-page">
      <Navbar />
      <div className="admin-layout">
        <Sidebar />
        <main className="admin-main" style={{ padding: 20, maxWidth: 1400, margin: '0 auto' }}>
          <WorkflowGuide pageKey="credit-notes" />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h1 style={{ margin: 0 }}>Return / Credit Notes</h1>
            <div style={{ display: 'flex', gap: 8 }}>
              <Link to="/erp/sales" style={{ padding: '6px 14px', borderRadius: 6, background: '#f1f5f9', textDecoration: 'none', fontSize: 13, border: '1px solid #dbe4f0' }}>Sales</Link>
              <span style={{ padding: '6px 14px', borderRadius: 6, background: '#c0392b', color: '#fff', fontSize: 13, fontWeight: 600 }}>Credit Notes</span>
            </div>
          </div>

          <WarehousePicker value={warehouseId} onChange={setWarehouseId} />

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
            <button onClick={() => { setEditing(null); setForm({ hospital_id: '', customer_id: '', cn_date: new Date().toISOString().split('T')[0], original_doc_ref: '', notes: '', line_items: [emptyLine()] }); setShowForm(true); }}
              style={{ padding: '8px 16px', borderRadius: 6, background: '#c0392b', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
              + New Return
            </button>
            <button onClick={handleValidate} disabled={!!actionLoading} style={{ padding: '8px 16px', borderRadius: 6, background: '#f59e0b', color: '#fff', border: 'none', cursor: 'pointer' }}>
              {actionLoading === 'validate' ? 'Validating...' : 'Validate'}
            </button>
            <button onClick={handleSubmit} disabled={!!actionLoading} style={{ padding: '8px 16px', borderRadius: 6, background: '#2563eb', color: '#fff', border: 'none', cursor: 'pointer' }}>
              {actionLoading === 'submit' ? 'Posting...' : 'Post Valid'}
            </button>
          </div>

          {/* Document list */}
          {docs.map(doc => (
            <div key={doc._id} style={{ padding: 14, marginBottom: 8, borderRadius: 8, border: '1px solid #dbe4f0', background: '#fff' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <strong>{doc.cn_number}</strong> — {doc.hospital_id?.hospital_name || doc.customer_id?.customer_name || 'N/A'}
                  <span style={{ marginLeft: 8, fontSize: 12, color: '#6b7280' }}>{doc.cn_date ? new Date(doc.cn_date).toLocaleDateString() : ''}</span>
                  <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 600 }}>₱{(doc.credit_total || 0).toLocaleString()}</span>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, background: STATUS_COLORS[doc.status]?.bg, color: STATUS_COLORS[doc.status]?.text }}>
                    {STATUS_COLORS[doc.status]?.label || doc.status}
                  </span>
                  {doc.status === 'DRAFT' && <button onClick={() => handleEdit(doc)} style={{ fontSize: 12, padding: '4px 10px', borderRadius: 4, border: '1px solid #dbe4f0', background: '#fff', cursor: 'pointer' }}>Edit</button>}
                  {doc.status === 'DRAFT' && <button onClick={() => handleDelete(doc._id)} style={{ fontSize: 12, padding: '4px 10px', borderRadius: 4, border: '1px solid #ef4444', background: '#fff', color: '#ef4444', cursor: 'pointer' }}>Delete</button>}
                  {doc.status === 'POSTED' && <button onClick={() => handlePrint(doc._id)} style={{ fontSize: 12, padding: '4px 10px', borderRadius: 4, border: '1px solid #2563eb', background: '#fff', color: '#2563eb', cursor: 'pointer' }}>Print</button>}
                </div>
              </div>
              {doc.validation_errors?.length > 0 && (
                <div style={{ marginTop: 6, fontSize: 12, color: '#991b1b' }}>{doc.validation_errors.join(' | ')}</div>
              )}
            </div>
          ))}

          {!docs.length && !showForm && (
            <div style={{ padding: 24, textAlign: 'center', color: '#6b7280' }}>No credit notes yet. Click &quot;+ New Return&quot; to create one.</div>
          )}

          {/* Form */}
          {showForm && (
            <div style={{ marginTop: 16, padding: 20, borderRadius: 12, border: '2px solid #c0392b', background: '#fff' }}>
              <h2 style={{ margin: '0 0 16px', fontSize: 18, color: '#c0392b' }}>{editing ? 'Edit' : 'New'} Credit Note</h2>

              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
                <label style={{ fontSize: 13 }}>Hospital:
                  <SelectField value={form.hospital_id} onChange={e => setForm(p => ({ ...p, hospital_id: e.target.value, customer_id: '' }))} style={{ marginLeft: 8 }}>
                    <option value="">Select...</option>
                    {(hospitals || []).map(h => <option key={h._id} value={h._id}>{h.hospital_name}</option>)}
                  </SelectField>
                </label>
                <label style={{ fontSize: 13 }}>Customer:
                  <SelectField value={form.customer_id} onChange={e => setForm(p => ({ ...p, customer_id: e.target.value, hospital_id: '' }))} style={{ marginLeft: 8 }}>
                    <option value="">Select...</option>
                    {customerOptions.map(c => <option key={c._id} value={c._id}>{c.customer_name}</option>)}
                  </SelectField>
                </label>
                <label style={{ fontSize: 13 }}>Date: <input type="date" value={form.cn_date} onChange={e => setForm(p => ({ ...p, cn_date: e.target.value }))} style={{ marginLeft: 8, padding: '6px 10px', borderRadius: 4, border: '1px solid #dbe4f0' }} /></label>
                <label style={{ fontSize: 13 }}>Original Invoice #: <input value={form.original_doc_ref} onChange={e => setForm(p => ({ ...p, original_doc_ref: e.target.value }))} placeholder="CSI-xxx" style={{ marginLeft: 8, padding: '6px 10px', borderRadius: 4, border: '1px solid #dbe4f0' }} /></label>
              </div>

              {/* Line items */}
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 12 }}>
                <thead>
                  <tr style={{ background: '#fef2f2' }}>
                    <th style={{ padding: 6, textAlign: 'left' }}>Product</th>
                    <th style={{ padding: 6 }}>Batch</th>
                    <th style={{ padding: 6 }}>Qty</th>
                    <th style={{ padding: 6 }}>Price</th>
                    <th style={{ padding: 6 }}>Total</th>
                    <th style={{ padding: 6 }}>Reason</th>
                    <th style={{ padding: 6 }}>Condition</th>
                    <th style={{ padding: 6, width: 30 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {form.line_items.map((li, idx) => (
                    <tr key={idx}>
                      <td style={{ padding: 4 }}>
                        <SelectField value={li.product_id} onChange={e => updateLine(idx, 'product_id', e.target.value)}>
                          <option value="">Select product...</option>
                          {productOptions.map((p, pi) => <option key={pi} value={p.product_id}>{p.label}</option>)}
                        </SelectField>
                      </td>
                      <td style={{ padding: 4 }}><input value={li.batch_lot_no} onChange={e => updateLine(idx, 'batch_lot_no', e.target.value)} style={{ width: 100, padding: '4px 6px', borderRadius: 4, border: '1px solid #dbe4f0' }} /></td>
                      <td style={{ padding: 4 }}><input type="number" min="1" value={li.qty} onChange={e => updateLine(idx, 'qty', e.target.value)} style={{ width: 60, padding: '4px 6px', borderRadius: 4, border: '1px solid #dbe4f0' }} /></td>
                      <td style={{ padding: 4 }}><input type="number" step="0.01" value={li.unit_price} onChange={e => updateLine(idx, 'unit_price', e.target.value)} style={{ width: 80, padding: '4px 6px', borderRadius: 4, border: '1px solid #dbe4f0' }} /></td>
                      <td style={{ padding: 4, textAlign: 'right', fontWeight: 600 }}>₱{computeLineTotal(li)}</td>
                      <td style={{ padding: 4 }}>
                        <SelectField value={li.return_reason} onChange={e => updateLine(idx, 'return_reason', e.target.value)}>
                          <option value="">Select...</option>
                          {RETURN_REASONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                        </SelectField>
                      </td>
                      <td style={{ padding: 4 }}>
                        <SelectField value={li.return_condition} onChange={e => updateLine(idx, 'return_condition', e.target.value)}>
                          {RETURN_CONDITIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                        </SelectField>
                      </td>
                      <td style={{ padding: 4 }}>
                        {form.line_items.length > 1 && <button onClick={() => removeLine(idx)} style={{ color: '#ef4444', border: 'none', background: 'none', cursor: 'pointer', fontWeight: 'bold' }}>&times;</button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <button onClick={addLine} style={{ padding: '6px 14px', borderRadius: 6, border: '1px dashed #c0392b', background: '#fff', color: '#c0392b', cursor: 'pointer', fontSize: 12 }}>+ Add Line</button>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#c0392b' }}>
                  Credit Total: ₱{form.line_items.reduce((sum, li) => sum + parseFloat(computeLineTotal(li)), 0).toFixed(2)}
                </div>
              </div>

              <label style={{ display: 'block', marginTop: 12, fontSize: 13 }}>Notes: <input value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} style={{ width: '100%', padding: '6px 10px', borderRadius: 4, border: '1px solid #dbe4f0' }} /></label>

              <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                <button onClick={handleSave} disabled={!!actionLoading} style={{ padding: '8px 24px', borderRadius: 6, background: '#c0392b', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                  {actionLoading === 'save' ? 'Saving...' : editing ? 'Update' : 'Save Draft'}
                </button>
                <button onClick={() => { setShowForm(false); setEditing(null); }} style={{ padding: '8px 16px', borderRadius: 6, border: '1px solid #dbe4f0', background: '#fff', cursor: 'pointer' }}>Cancel</button>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
