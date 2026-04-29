/**
 * Hospital PO Entry — Phase CSI-X1 (Apr 2026) + X2 paste parser (Apr 2026)
 *
 * Iloilo proxy entry surface (and BDM self-entry). Captures hospital purchase
 * orders received via Messenger / formal PDF / verbal. Auto-resolves
 * unit_price from HospitalContractPrice with SRP fallback. Locks unit_price
 * at PO entry — renegotiation = new PO (audit trail).
 *
 * Phase X2 layers a paste-text parser on top: paste a Messenger order body
 * into the Source Text textarea and click "Parse paste" — a regex pass + AI
 * fallback (Claude Haiku 4.5 with prompt-cached product list) auto-fills
 * the structured line items below. Confidence pill per line; "Needs review"
 * panel surfaces ambiguous / unmatched lines for human pickup. Conflict
 * policy: structured form is the source of truth; parser pre-fills only.
 * Edits to parser-suggested values get tagged with override_reason for the
 * audit trail.
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { createHospitalPo, parsePoText } from '../services/hospitalPoService';
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

// Empty line factory — keeps shape consistent for parser-fill paths
const emptyLine = () => ({
  product_id: '',
  qty_ordered: '',
  unit_price: '',
  price_source: '',
  notes: '',
  // X2 audit fields — populated when the parser pre-filled this row
  parsed: false,
  parsed_product_id: null,
  parsed_qty_ordered: null,
  parsed_confidence: null,
  parsed_raw_line: null,
  parsed_source: null  // 'regex' | 'llm'
});

// Confidence → pill colors. Anchors aligned with the LLM parser's
// calibration scale (see backend/erp/services/poLlmParser.js system prompt).
function confidenceStyle(c) {
  if (c == null) return null;
  if (c >= 0.85) return { bg: '#dcfce7', fg: '#15803d', label: 'High' };
  if (c >= 0.7)  return { bg: '#fef3c7', fg: '#b45309', label: 'Medium' };
  return { bg: '#fee2e2', fg: '#b91c1c', label: 'Low' };
}

export default function HospitalPoEntry() {
  const navigate = useNavigate();
  const [hospitals, setHospitals] = useState([]);
  const [products, setProducts] = useState([]);
  const [bdms, setBdms] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  // X2 parser state
  const [parsing, setParsing] = useState(false);
  const [parseMeta, setParseMeta] = useState(null);
  const [needsReview, setNeedsReview] = useState({ ambiguous: [], unmatched: [] });

  const [form, setForm] = useState({
    hospital_id: '',
    po_number: '',
    po_date: new Date().toISOString().slice(0, 10),
    assigned_to: '',  // proxy target (Iloilo encoder picks the BDM owner)
    source_kind: 'MESSENGER_TEXT',
    source_text: '',
    notes: ''
  });
  const [lines, setLines] = useState([emptyLine()]);

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

  const addLine = () => setLines(ls => [...ls, emptyLine()]);
  const removeLine = (idx) => setLines(ls => ls.length > 1 ? ls.filter((_, i) => i !== idx) : ls);

  // When hospital + product chosen, auto-resolve price and pre-fill unit_price
  const handleProductPick = async (idx, productId) => {
    setLines(ls => ls.map((l, i) => i === idx ? { ...l, product_id: productId } : l));
    if (!form.hospital_id || !productId) return;
    try {
      const result = await resolvePrice({ hospital_id: form.hospital_id, product_id: productId });
      if (result.price != null) {
        setLines(ls => ls.map((l, i) => i === idx ? { ...l, unit_price: String(result.price), price_source: result.source } : l));
      }
    } catch {
      // silent — encoder can still type a price manually
    }
  };

  const handleHospitalChange = async (hospitalId) => {
    setForm(f => ({ ...f, hospital_id: hospitalId }));
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

  // X2 — Parse paste-text into structured lines
  const handleParsePaste = async () => {
    if (!form.source_text || !form.source_text.trim()) {
      showError(null, 'Paste the order text first');
      return;
    }
    setParsing(true);
    try {
      const result = await parsePoText({
        source_text: form.source_text,
        hospital_id: form.hospital_id || undefined
      });
      if (!result) {
        showError(null, 'Parser returned no data');
        return;
      }
      const matched = Array.isArray(result.matched) ? result.matched : [];
      if (!matched.length) {
        setParseMeta(result.meta || null);
        setNeedsReview({
          ambiguous: result.ambiguous || [],
          unmatched: result.unmatched || []
        });
        showError(null, 'No confident matches found. See Needs Review panel below.');
        return;
      }

      // Build new line rows from parser output. Pre-resolve prices in parallel
      // for each matched line if a hospital is selected.
      const filledRows = await Promise.all(matched.map(async m => {
        let unitPrice = '';
        let priceSource = '';
        if (form.hospital_id && m.product_id) {
          try {
            const r = await resolvePrice({ hospital_id: form.hospital_id, product_id: m.product_id });
            if (r?.price != null) {
              unitPrice = String(r.price);
              priceSource = r.source;
            }
          } catch { /* leave blank */ }
        }
        return {
          product_id: m.product_id,
          qty_ordered: String(m.qty_ordered || ''),
          unit_price: unitPrice,
          price_source: priceSource,
          notes: m.notes || '',
          parsed: true,
          parsed_product_id: m.product_id,
          parsed_qty_ordered: m.qty_ordered,
          parsed_confidence: m.confidence,
          parsed_raw_line: m.raw_line,
          parsed_source: m.source || (result.meta?.used_llm ? 'llm' : 'regex')
        };
      }));

      // Replace existing blank rows; preserve any rows the encoder already
      // typed manually before clicking Parse.
      const existingPopulated = lines.filter(l => l.product_id && Number(l.qty_ordered) > 0);
      setLines(existingPopulated.length ? [...existingPopulated, ...filledRows] : filledRows);

      setParseMeta(result.meta || null);
      setNeedsReview({
        ambiguous: result.ambiguous || [],
        unmatched: result.unmatched || []
      });
      const stage = result.meta?.used_llm ? 'AI assist' : 'regex';
      showSuccess(`Parsed ${filledRows.length} line${filledRows.length > 1 ? 's' : ''} via ${stage}. Review before saving.`);
    } catch (err) {
      showError(err, 'Could not parse paste text');
    } finally {
      setParsing(false);
    }
  };

  // Detect parser overrides for the audit notes field
  const lineWasOverridden = (ln) => {
    if (!ln.parsed) return false;
    return (
      String(ln.product_id || '') !== String(ln.parsed_product_id || '') ||
      Number(ln.qty_ordered || 0) !== Number(ln.parsed_qty_ordered || 0)
    );
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
      .map(l => {
        // X2 — annotate notes when the encoder overrode a parser suggestion.
        // This goes into HospitalPOLine.notes which is admin-visible on PO Detail.
        const overrode = lineWasOverridden(l);
        const auditNote = overrode
          ? `[parser-override] Original: product=${l.parsed_product_id} qty=${l.parsed_qty_ordered} (conf ${l.parsed_confidence?.toFixed(2)} via ${l.parsed_source}) — Edited by encoder.`
          : null;
        const combinedNotes = [l.notes, auditNote].filter(Boolean).join(' | ');
        return {
          product_id: l.product_id,
          qty_ordered: Number(l.qty_ordered),
          unit_price: l.unit_price === '' ? undefined : Number(l.unit_price),
          notes: combinedNotes
        };
      });
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

  const showSourceTextarea = form.source_kind === 'MESSENGER_TEXT' || form.source_kind === 'EMAIL';
  const totalNeedsReview = needsReview.ambiguous.length + needsReview.unmatched.length;

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

        {showSourceTextarea && (
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block' }}>
              Source Text (paste Messenger / email body)
              <textarea value={form.source_text} rows={4}
                        onChange={e => setForm(f => ({ ...f, source_text: e.target.value }))}
                        placeholder="Paste the hospital's order text here. Click Parse paste to auto-fill the line items below."
                        style={{ width: '100%', padding: 8, marginTop: 4, fontFamily: 'monospace', fontSize: 12 }} />
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 6 }}>
              <button type="button"
                      onClick={handleParsePaste}
                      disabled={parsing || !form.source_text.trim()}
                      style={{
                        background: parsing ? '#e2e8f0' : '#7c3aed',
                        color: parsing ? '#64748b' : '#fff',
                        border: 'none',
                        padding: '6px 14px',
                        borderRadius: 6,
                        cursor: parsing || !form.source_text.trim() ? 'not-allowed' : 'pointer',
                        fontWeight: 600,
                        fontSize: 12
                      }}>
                {parsing ? 'Parsing…' : '🔍 Parse paste → line items'}
              </button>
              {parseMeta && (
                <span style={{ fontSize: 11, color: '#64748b' }}>
                  Last parse: <strong>{parseMeta.stage}</strong>
                  {parseMeta.used_llm && <> · AI ({parseMeta.llm_latency_ms}ms)</>}
                  {parseMeta.coverage != null && <> · regex coverage {(parseMeta.coverage * 100).toFixed(0)}%</>}
                  {parseMeta.llm_usage?.cache_read > 0 && (
                    <> · cache hit {parseMeta.llm_usage.cache_read} tok</>
                  )}
                </span>
              )}
            </div>
            <small style={{ color: '#64748b', display: 'block', marginTop: 4 }}>
              Parser pre-fills the table below. Always review — the structured form is the source of truth. Edits to parser-suggested values get logged in line notes.
            </small>
          </div>
        )}

        {/* Needs review panel — Phase X2 */}
        {totalNeedsReview > 0 && (
          <div style={{
            background: '#fff7ed',
            border: '1px solid #fed7aa',
            borderRadius: 6,
            padding: 12,
            marginBottom: 16,
            fontSize: 12
          }}>
            <strong style={{ color: '#9a3412' }}>⚠ Needs review ({totalNeedsReview})</strong>
            <div style={{ color: '#92400e', marginTop: 4, marginBottom: 8 }}>
              The parser could not confidently match these lines. Add them manually below if they are real orders.
            </div>
            {needsReview.ambiguous.length > 0 && (
              <details style={{ marginBottom: 6 }}>
                <summary style={{ cursor: 'pointer', color: '#b45309' }}>
                  Ambiguous ({needsReview.ambiguous.length}) — multiple possible matches
                </summary>
                <ul style={{ marginTop: 4, paddingLeft: 20, color: '#7c2d12' }}>
                  {needsReview.ambiguous.map((a, i) => (
                    <li key={i}>
                      <code style={{ background: '#fff', padding: '1px 4px', borderRadius: 3 }}>{a.raw_line}</code>
                      {a.qty_ordered ? ` (qty ${a.qty_ordered})` : ''}
                      {a.reason ? ` — ${a.reason}` : ''}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {needsReview.unmatched.length > 0 && (
              <details>
                <summary style={{ cursor: 'pointer', color: '#b45309' }}>
                  Unmatched ({needsReview.unmatched.length}) — no product candidate
                </summary>
                <ul style={{ marginTop: 4, paddingLeft: 20, color: '#7c2d12' }}>
                  {needsReview.unmatched.map((u, i) => (
                    <li key={i}>
                      <code style={{ background: '#fff', padding: '1px 4px', borderRadius: 3 }}>{u.raw_line}</code>
                      {u.qty_ordered ? ` (qty ${u.qty_ordered})` : ''}
                      {u.reason ? ` — ${u.reason}` : ''}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}

        <h3 style={{ fontSize: 14, marginTop: 20, marginBottom: 8 }}>Line Items</h3>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead style={{ background: '#f1f5f9' }}>
            <tr>
              <th style={{ padding: 8, textAlign: 'left' }}>Product *</th>
              <th style={{ padding: 8, textAlign: 'right', width: 90 }}>Qty *</th>
              <th style={{ padding: 8, textAlign: 'right', width: 110 }}>Unit Price</th>
              <th style={{ padding: 8, textAlign: 'left', width: 90 }}>Source</th>
              <th style={{ padding: 8, textAlign: 'center', width: 90 }}>Confidence</th>
              <th style={{ padding: 8, textAlign: 'right', width: 100 }}>Line Total</th>
              <th style={{ padding: 8, width: 40 }}></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((ln, idx) => {
              const lt = (Number(ln.qty_ordered) || 0) * (Number(ln.unit_price) || 0);
              const conf = confidenceStyle(ln.parsed_confidence);
              const overridden = lineWasOverridden(ln);
              return (
                <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0', background: overridden ? '#fff7ed' : 'transparent' }}>
                  <td style={{ padding: 6 }}>
                    <select value={ln.product_id}
                            onChange={e => handleProductPick(idx, e.target.value)}
                            style={{ width: '100%', padding: 6 }}>
                      <option value="">— select —</option>
                      {products.map(p => <option key={p._id} value={p._id}>{productLabel(p)}</option>)}
                    </select>
                    {ln.parsed && ln.parsed_raw_line && (
                      <div style={{ fontSize: 10, color: '#64748b', marginTop: 2, fontStyle: 'italic' }} title={ln.parsed_raw_line}>
                        from: {ln.parsed_raw_line.length > 50 ? ln.parsed_raw_line.slice(0, 50) + '…' : ln.parsed_raw_line}
                      </div>
                    )}
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
                  <td style={{ padding: 6, textAlign: 'center' }}>
                    {conf ? (
                      <span title={`${(ln.parsed_confidence * 100).toFixed(0)}% via ${ln.parsed_source}`}
                            style={{
                              display: 'inline-block',
                              padding: '2px 6px',
                              borderRadius: 10,
                              background: conf.bg,
                              color: conf.fg,
                              fontSize: 10,
                              fontWeight: 600
                            }}>
                        {conf.label}{overridden ? '·edited' : ''}
                      </span>
                    ) : <span style={{ color: '#cbd5e1', fontSize: 10 }}>—</span>}
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
              <td colSpan="5" style={{ padding: 8, textAlign: 'right', fontWeight: 600 }}>TOTAL</td>
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
