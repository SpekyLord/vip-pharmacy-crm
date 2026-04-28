/**
 * Hospital PO Entry — Phase CSI-X1 (Apr 2026)
 *
 * Iloilo proxy entry surface (and BDM self-entry). Captures hospital purchase
 * orders received via Messenger / formal PDF / verbal. Auto-resolves
 * unit_price from HospitalContractPrice with SRP fallback. Locks unit_price
 * at PO entry — renegotiation = new PO (audit trail).
 *
 * Phase X2 (next sprint) layers a paste-text parser on top of this form.
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { createHospitalPo } from '../services/hospitalPoService';
import { resolvePrice } from '../services/hospitalContractPriceService';
import WorkflowGuide from '../components/WorkflowGuide';
import { showError, showSuccess, showApprovalPending } from '../utils/errorToast';

const SOURCE_KINDS = [
  { code: 'MESSENGER_TEXT', label: 'Messenger text' },
  { code: 'FORMAL_PDF', label: 'Formal PDF / scan' },
  { code: 'EMAIL', label: 'Email' },
  { code: 'VERBAL', label: 'Verbal' },
  { code: 'OTHER', label: 'Other' }
];

const peso = (n) => '₱' + (Number(n || 0)).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function HospitalPoEntry() {
  const navigate = useNavigate();
  const [hospitals, setHospitals] = useState([]);
  const [products, setProducts] = useState([]);
  const [bdms, setBdms] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    hospital_id: '',
    po_number: '',
    po_date: new Date().toISOString().slice(0, 10),
    assigned_to: '',  // proxy target (Iloilo encoder picks the BDM owner)
    source_kind: 'MESSENGER_TEXT',
    source_text: '',
    notes: ''
  });
  const [lines, setLines] = useState([
    { product_id: '', qty_ordered: '', unit_price: '', price_source: '', notes: '' }
  ]);

  useEffect(() => {
    (async () => {
      try {
        const [h, p, u] = await Promise.all([
          api.get('/erp/hospitals', { params: { limit: 500 } }),
          api.get('/erp/products', { params: { limit: 500 } }),
          api.get('/erp/people', { params: { active: true, limit: 500 } }).catch(() => ({ data: { data: [] } }))
        ]);
        setHospitals(h.data?.data || []);
        setProducts(p.data?.data || []);
        const allBdms = (u.data?.data || []).filter(x => x.role === 'staff' || x.role === 'employee' || x.role === 'contractor');
        setBdms(allBdms);
      } catch (e) {
        showError(e, 'Could not load form options');
      }
    })();
  }, []);

  const productLabel = (p) => p ? `${p.brand_name || ''} ${p.dosage_strength || ''}`.trim() : '';

  const updateLine = (idx, field, value) => {
    setLines(ls => ls.map((l, i) => i === idx ? { ...l, [field]: value } : l));
  };

  const addLine = () => setLines(ls => [...ls, { product_id: '', qty_ordered: '', unit_price: '', price_source: '', notes: '' }]);
  const removeLine = (idx) => setLines(ls => ls.length > 1 ? ls.filter((_, i) => i !== idx) : ls);

  // When hospital + product chosen, auto-resolve price and pre-fill unit_price
  const handleProductPick = async (idx, productId) => {
    updateLine(idx, 'product_id', productId);
    if (!form.hospital_id || !productId) return;
    try {
      const result = await resolvePrice({ hospital_id: form.hospital_id, product_id: productId });
      if (result.price != null) {
        updateLine(idx, 'unit_price', String(result.price));
        updateLine(idx, 'price_source', result.source);
      }
    } catch {
      // silent — encoder can still type a price manually
    }
  };

  const handleHospitalChange = async (hospitalId) => {
    setForm(f => ({ ...f, hospital_id: hospitalId }));
    // Re-resolve price for any line that already has a product
    if (!hospitalId) return;
    const updated = await Promise.all(lines.map(async ln => {
      if (!ln.product_id) return ln;
      try {
        const r = await resolvePrice({ hospital_id: hospitalId, product_id: ln.product_id });
        return r.price != null ? { ...ln, unit_price: String(r.price), price_source: r.source } : ln;
      } catch { return ln; }
    }));
    setLines(updated);
  };

  const totalAmount = lines.reduce((sum, l) => sum + (Number(l.qty_ordered) || 0) * (Number(l.unit_price) || 0), 0);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.hospital_id || !form.po_number) {
      showError(null, 'Hospital and PO# are required');
      return;
    }
    const cleanLines = lines
      .filter(l => l.product_id && Number(l.qty_ordered) > 0)
      .map(l => ({
        product_id: l.product_id,
        qty_ordered: Number(l.qty_ordered),
        unit_price: l.unit_price === '' ? undefined : Number(l.unit_price),
        notes: l.notes || ''
      }));
    if (!cleanLines.length) {
      showError(null, 'Add at least one line with a product and qty > 0');
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        hospital_id: form.hospital_id,
        po_number: form.po_number,
        po_date: form.po_date,
        source_kind: form.source_kind,
        source_text: form.source_text,
        notes: form.notes,
        line_items: cleanLines
      };
      if (form.assigned_to) payload.assigned_to = form.assigned_to;

      const res = await createHospitalPo(payload);
      if (res?.approval_pending) {
        showApprovalPending(res.message);
      } else {
        showSuccess('Hospital PO created');
      }
      navigate('/erp/hospital-pos/backlog');
    } catch (err) {
      if (err?.response?.status === 202) {
        showApprovalPending(err.response.data?.message);
        navigate('/erp/hospital-pos/backlog');
      } else {
        showError(err, 'Could not create hospital PO');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ padding: 20, maxWidth: 1100, margin: '0 auto' }}>
      <h2 style={{ marginBottom: 4 }}>New Hospital PO</h2>
      <div style={{ color: '#64748b', marginBottom: 16, fontSize: 13 }}>
        Capture a hospital purchase order. The PO# prints on every linked CSI; unserved lines stay open until fulfilled or cancelled.
      </div>

      <WorkflowGuide pageKey="hospital-po-entry" />

      <form onSubmit={handleSubmit} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
          <label>
            Hospital *
            <select value={form.hospital_id}
                    onChange={e => handleHospitalChange(e.target.value)}
                    required
                    style={{ width: '100%', padding: 8, marginTop: 4 }}>
              <option value="">— select hospital —</option>
              {hospitals.map(h => <option key={h._id} value={h._id}>{h.hospital_name}</option>)}
            </select>
          </label>
          <label>
            PO Number *
            <input type="text" value={form.po_number}
                   onChange={e => setForm(f => ({ ...f, po_number: e.target.value }))}
                   required
                   placeholder="HOSP-2026-001"
                   style={{ width: '100%', padding: 8, marginTop: 4, fontFamily: 'monospace' }} />
          </label>
          <label>
            PO Date
            <input type="date" value={form.po_date}
                   onChange={e => setForm(f => ({ ...f, po_date: e.target.value }))}
                   style={{ width: '100%', padding: 8, marginTop: 4 }} />
          </label>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <label>
            Owner BDM (proxy entry)
            <select value={form.assigned_to}
                    onChange={e => setForm(f => ({ ...f, assigned_to: e.target.value }))}
                    style={{ width: '100%', padding: 8, marginTop: 4 }}>
              <option value="">— self entry —</option>
              {bdms.map(b => <option key={b._id} value={b._id}>{b.name}</option>)}
            </select>
            <small style={{ color: '#64748b' }}>Iloilo encoders: pick the BDM who owns this hospital.</small>
          </label>
          <label>
            Source
            <select value={form.source_kind}
                    onChange={e => setForm(f => ({ ...f, source_kind: e.target.value }))}
                    style={{ width: '100%', padding: 8, marginTop: 4 }}>
              {SOURCE_KINDS.map(s => <option key={s.code} value={s.code}>{s.label}</option>)}
            </select>
          </label>
        </div>

        {(form.source_kind === 'MESSENGER_TEXT' || form.source_kind === 'EMAIL') && (
          <label style={{ display: 'block', marginBottom: 12 }}>
            Source Text (paste Messenger / email body)
            <textarea value={form.source_text} rows={4}
                      onChange={e => setForm(f => ({ ...f, source_text: e.target.value }))}
                      placeholder="Paste the hospital's order text here. Phase X2 will auto-fill the line items below from this text."
                      style={{ width: '100%', padding: 8, marginTop: 4, fontFamily: 'monospace', fontSize: 12 }} />
          </label>
        )}

        <h3 style={{ fontSize: 14, marginTop: 20, marginBottom: 8 }}>Line Items</h3>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead style={{ background: '#f1f5f9' }}>
            <tr>
              <th style={{ padding: 8, textAlign: 'left' }}>Product *</th>
              <th style={{ padding: 8, textAlign: 'right', width: 90 }}>Qty *</th>
              <th style={{ padding: 8, textAlign: 'right', width: 110 }}>Unit Price</th>
              <th style={{ padding: 8, textAlign: 'left', width: 90 }}>Source</th>
              <th style={{ padding: 8, textAlign: 'right', width: 100 }}>Line Total</th>
              <th style={{ padding: 8, width: 40 }}></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((ln, idx) => {
              const lt = (Number(ln.qty_ordered) || 0) * (Number(ln.unit_price) || 0);
              return (
                <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0' }}>
                  <td style={{ padding: 6 }}>
                    <select value={ln.product_id}
                            onChange={e => handleProductPick(idx, e.target.value)}
                            style={{ width: '100%', padding: 6 }}>
                      <option value="">— select —</option>
                      {products.map(p => <option key={p._id} value={p._id}>{productLabel(p)}</option>)}
                    </select>
                  </td>
                  <td style={{ padding: 6 }}>
                    <input type="number" min="1" value={ln.qty_ordered}
                           onChange={e => updateLine(idx, 'qty_ordered', e.target.value)}
                           style={{ width: '100%', padding: 6, textAlign: 'right' }} />
                  </td>
                  <td style={{ padding: 6 }}>
                    <input type="number" step="0.01" min="0" value={ln.unit_price}
                           onChange={e => { updateLine(idx, 'unit_price', e.target.value); updateLine(idx, 'price_source', 'MANUAL_OVERRIDE'); }}
                           style={{ width: '100%', padding: 6, textAlign: 'right' }} />
                  </td>
                  <td style={{ padding: 6, fontSize: 11, color: ln.price_source === 'CONTRACT' ? '#15803d' : ln.price_source === 'MANUAL_OVERRIDE' ? '#b45309' : '#64748b' }}>
                    {ln.price_source || '—'}
                  </td>
                  <td style={{ padding: 6, textAlign: 'right', fontWeight: 600 }}>{peso(lt)}</td>
                  <td style={{ padding: 6, textAlign: 'center' }}>
                    {lines.length > 1 && (
                      <button type="button" onClick={() => removeLine(idx)}
                              style={{ background: 'transparent', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 16 }}>×</button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan="4" style={{ padding: 8, textAlign: 'right', fontWeight: 600 }}>TOTAL</td>
              <td style={{ padding: 8, textAlign: 'right', fontWeight: 700, color: '#1e40af' }}>{peso(totalAmount)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>

        <button type="button" onClick={addLine}
                style={{ marginTop: 8, background: 'transparent', color: '#2563eb', border: '1px dashed #93c5fd', padding: '6px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>
          + Add Line
        </button>

        <label style={{ display: 'block', marginTop: 16 }}>
          Notes
          <textarea value={form.notes} rows={2}
                    onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                    style={{ width: '100%', padding: 8, marginTop: 4 }} />
        </label>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
          <button type="button" onClick={() => navigate('/erp/hospital-pos/backlog')}
                  style={{ padding: '8px 16px', border: '1px solid #cbd5e1', background: '#fff', borderRadius: 6, cursor: 'pointer' }}>
            Cancel
          </button>
          <button type="submit" disabled={submitting}
                  style={{ padding: '8px 20px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}>
            {submitting ? 'Saving…' : 'Create PO'}
          </button>
        </div>
      </form>
    </div>
  );
}
