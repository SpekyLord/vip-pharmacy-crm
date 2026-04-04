import { useState, useEffect, useRef, useMemo } from 'react';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import { useAuth } from '../../hooks/useAuth';
import useConsignment from '../hooks/useConsignment';
import useInventory from '../hooks/useInventory';
import useHospitals from '../hooks/useHospitals';
import { processDocument, extractExifDateTime } from '../services/ocrService';

import SelectField from '../../components/common/Select';

const DR_TYPES = [
  { value: 'DR_CONSIGNMENT', label: 'Consignment' },
  { value: 'DR_SAMPLING', label: 'Sampling' },
  { value: 'DR_DONATION', label: 'Donation' }
];

const TYPE_COLORS = {
  DR_CONSIGNMENT: { bg: '#dbeafe', text: '#1e40af' },
  DR_SAMPLING: { bg: '#f3e8ff', text: '#7c3aed' },
  DR_DONATION: { bg: '#dcfce7', text: '#166534' }
};

const TYPE_LABELS = { DR_CONSIGNMENT: 'Consignment', DR_SAMPLING: 'Sampling', DR_DONATION: 'Donation' };

const emptyRow = () => ({
  _tempId: Date.now() + Math.random(),
  hospital_id: '',
  dr_ref: '',
  dr_date: new Date().toISOString().split('T')[0],
  dr_type: 'DR_CONSIGNMENT',
  product_id: '',
  batch_lot_no: '',
  expiry_date: '',
  qty: '',
  _isNew: true
});

const pageStyles = `
  .dr-entry-page { background: var(--erp-bg, #f4f7fb); min-height: 100vh; }
  .dr-main { flex: 1; min-width: 0; overflow-y: auto; -webkit-overflow-scrolling: touch; padding: 20px; max-width: 1400px; margin: 0 auto; }
  .dr-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 12px; }
  .dr-header h1 { font-size: 22px; color: var(--erp-text, #132238); margin: 0; }
  .dr-actions { display: flex; gap: 8px; flex-wrap: wrap; }
  .btn { padding: 8px 16px; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.15s; }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn-primary { background: var(--erp-accent, #1e5eff); color: #fff; }
  .btn-success { background: #16a34a; color: #fff; }
  .btn-outline { background: transparent; border: 1px solid var(--erp-border, #dbe4f0); color: var(--erp-text); }
  .btn-danger { background: #dc2626; color: #fff; }
  .btn-sm { padding: 4px 10px; font-size: 12px; }

  .dr-grid { background: var(--erp-panel, #fff); border: 1px solid var(--erp-border, #dbe4f0); border-radius: 12px; overflow-x: auto; margin-bottom: 24px; }
  .dr-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .dr-table th { background: var(--erp-accent-soft, #e8efff); color: var(--erp-text); padding: 10px 8px; text-align: left; font-weight: 600; white-space: nowrap; }
  .dr-table td { padding: 6px 8px; border-top: 1px solid var(--erp-border, #dbe4f0); vertical-align: top; }
  .dr-table input, .dr-table select { width: 100%; padding: 6px 8px; border: 1px solid var(--erp-border, #dbe4f0); border-radius: 6px; font-size: 13px; background: var(--erp-panel, #fff); color: var(--erp-text); }
  .dr-table input:focus, .dr-table select:focus { outline: none; border-color: var(--erp-accent, #1e5eff); }
  .add-row-btn { display: block; width: 100%; padding: 10px; text-align: center; color: var(--erp-accent); background: transparent; border: 2px dashed var(--erp-border); border-radius: 0 0 12px 12px; cursor: pointer; font-weight: 600; }

  .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 600; }

  .dr-history { background: var(--erp-panel, #fff); border: 1px solid var(--erp-border); border-radius: 12px; overflow: hidden; }
  .dr-history h2 { font-size: 16px; margin: 0; padding: 16px 20px 12px; color: var(--erp-text); }
  .history-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .history-table th { padding: 10px 16px; text-align: left; font-weight: 600; color: var(--erp-muted); background: var(--erp-bg); }
  .history-table td { padding: 10px 16px; border-top: 1px solid var(--erp-border); }

  .scan-modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 1000; display: flex; align-items: center; justify-content: center; padding: 16px; }
  .scan-modal { background: var(--erp-panel, #fff); border-radius: 16px; width: 100%; max-width: 520px; max-height: 90vh; overflow-y: auto; padding: 24px; position: relative; }
  .scan-modal h2 { margin: 0 0 16px; font-size: 18px; }
  .scan-modal .close-btn { position: absolute; top: 12px; right: 16px; background: none; border: none; font-size: 22px; cursor: pointer; color: var(--erp-muted); }
  .scan-capture-btns { display: flex; gap: 10px; margin-bottom: 16px; }
  .scan-capture-btns .btn { flex: 1; text-align: center; padding: 12px; }
  .scan-preview { width: 100%; max-height: 200px; object-fit: contain; border-radius: 8px; margin-bottom: 16px; border: 1px solid var(--erp-border); }
  .scan-progress { text-align: center; padding: 24px 0; }
  .scan-progress .spinner { width: 36px; height: 36px; border: 3px solid var(--erp-border); border-top-color: var(--erp-accent); border-radius: 50%; animation: spin 0.8s linear infinite; margin: 0 auto 12px; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .scan-error { background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 12px; color: #991b1b; font-size: 13px; margin-bottom: 12px; }
  .scan-results label { font-size: 11px; color: var(--erp-muted); font-weight: 600; text-transform: uppercase; display: block; margin-bottom: 2px; }
  .scan-results .result-value { font-size: 14px; padding: 6px 10px; background: var(--erp-bg); border-radius: 6px; border: 1px solid var(--erp-border); margin-bottom: 10px; }
  .match-badge { display: inline-block; padding: 1px 6px; border-radius: 4px; font-size: 10px; font-weight: 600; margin-left: 6px; }
  .match-high { background: #dcfce7; color: #166534; }
  .match-medium { background: #fef3c7; color: #92400e; }
  .match-none { background: #fef2f2; color: #991b1b; }

  @media (max-width: 768px) {
    .dr-main { padding: 12px; }
    .dr-table { font-size: 12px; }
    .dr-table th, .dr-table td { padding: 4px 4px; }
  }
`;

function normalizeStr(s) { return (s || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }

function matchHospital(ocrName, hospitals) {
  if (!ocrName || !hospitals?.length) return null;
  const cleaned = normalizeStr(ocrName);
  if (!cleaned) return null;
  let match = hospitals.find(h => normalizeStr(h.hospital_name) === cleaned);
  if (match) return { hospital: match, confidence: 'HIGH' };
  match = hospitals.find(h => { const hn = normalizeStr(h.hospital_name); return cleaned.includes(hn) || hn.includes(cleaned); });
  if (match) return { hospital: match, confidence: 'MEDIUM' };
  return null;
}

function matchProduct(ocrBrand, stockProducts) {
  if (!ocrBrand || !stockProducts?.length) return null;
  const cleaned = normalizeStr(ocrBrand);
  if (!cleaned) return null;
  let match = stockProducts.find(p => normalizeStr(p.product?.brand_name) === cleaned);
  if (match) return { product: match, confidence: 'HIGH' };
  match = stockProducts.find(p => { const pn = normalizeStr(p.product?.brand_name); return cleaned.includes(pn) || pn.includes(cleaned); });
  if (match) return { product: match, confidence: 'MEDIUM' };
  return null;
}

function fieldVal(f) { if (f == null) return ''; if (typeof f === 'object' && 'value' in f) return f.value ?? ''; return String(f); }

// --- Scan DR Modal (unchanged) ---
function ScanDRModal({ open, onClose, onApply, hospitals, stockProducts }) {
  const [step, setStep] = useState('capture');
  const [preview, setPreview] = useState(null);
  const [ocrData, setOcrData] = useState(null);
  const [matchedHospital, setMatchedHospital] = useState(null);
  const [matchedItems, setMatchedItems] = useState([]);
  const [errorMsg, setErrorMsg] = useState('');
  const cameraRef = useRef(null);
  const galleryRef = useRef(null);

  const reset = () => { setStep('capture'); setPreview(null); setOcrData(null); setMatchedHospital(null); setMatchedItems([]); setErrorMsg(''); };
  const handleClose = () => { reset(); onClose(); };

  const handleFile = async (file) => {
    if (!file) return;
    setPreview(URL.createObjectURL(file));
    setStep('scanning');
    try {
      const exif = await extractExifDateTime(file);
      const result = await processDocument(file, 'DR', exif);
      setOcrData(result);
      setMatchedHospital(matchHospital(fieldVal(result.extracted?.hospital), hospitals));
      const items = result.extracted?.line_items || [];
      setMatchedItems(items.map(item => ({
        ocr_brand: fieldVal(item.brand_name), ocr_dosage: fieldVal(item.dosage),
        ocr_qty: fieldVal(item.qty), ocr_batch: fieldVal(item.batch_lot_no),
        ocr_expiry: fieldVal(item.expiry_date),
        product_match: matchProduct(fieldVal(item.brand_name), stockProducts)
      })));
      setStep('results');
    } catch (err) {
      setErrorMsg(err?.response?.data?.message || err.message || 'OCR failed');
      setStep('error');
    }
  };

  const handleApply = () => {
    const ext = ocrData?.extracted;
    onApply({
      hospital_id: matchedHospital?.hospital?._id || '',
      dr_ref: fieldVal(ext?.dr_no),
      dr_date: (() => { const d = fieldVal(ext?.date); const p = new Date(d); return isNaN(p) ? new Date().toISOString().split('T')[0] : p.toISOString().split('T')[0]; })(),
      dr_type: fieldVal(ext?.dr_type) === 'DR_SAMPLING' ? 'DR_SAMPLING' : 'DR_CONSIGNMENT',
      line_items: matchedItems.map(mi => ({
        product_id: mi.product_match?.product?.product_id || '',
        batch_lot_no: mi.ocr_batch,
        expiry_date: mi.ocr_expiry || '',
        qty: String(parseFloat(mi.ocr_qty) || '')
      }))
    });
    handleClose();
  };

  if (!open) return null;
  return (
    <div className="scan-modal-overlay" onClick={handleClose}>
      <div className="scan-modal" onClick={e => e.stopPropagation()}>
        <button className="close-btn" onClick={handleClose}>&times;</button>
        <h2>Scan Delivery Receipt</h2>
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={e => handleFile(e.target.files?.[0])} />
        <input ref={galleryRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => handleFile(e.target.files?.[0])} />

        {step === 'capture' && (<><p style={{ fontSize: 13, color: 'var(--erp-muted)', marginBottom: 16 }}>Scan a DR to auto-fill hospital, products, and quantities.</p><div className="scan-capture-btns"><button className="btn btn-primary" onClick={() => cameraRef.current?.click()}>Take Photo</button><button className="btn btn-outline" onClick={() => galleryRef.current?.click()}>Gallery</button></div></>)}
        {step === 'scanning' && (<>{preview && <img src={preview} alt="preview" className="scan-preview" />}<div className="scan-progress"><div className="spinner" /><div style={{ fontSize: 14, color: 'var(--erp-muted)' }}>Processing DR...</div></div></>)}
        {step === 'error' && (<>{preview && <img src={preview} alt="preview" className="scan-preview" />}<div className="scan-error">{errorMsg}</div><div className="scan-capture-btns"><button className="btn btn-primary" onClick={() => { reset(); cameraRef.current?.click(); }}>Retry</button><button className="btn btn-outline" onClick={handleClose}>Cancel</button></div></>)}
        {step === 'results' && ocrData && (
          <>
            {preview && <img src={preview} alt="preview" className="scan-preview" />}
            <div className="scan-results">
              <label>DR #</label><div className="result-value">{fieldVal(ocrData.extracted?.dr_no) || '—'}</div>
              <label>Hospital</label>
              <div className="result-value">{fieldVal(ocrData.extracted?.hospital) || '—'}{matchedHospital ? <span className={`match-badge match-${matchedHospital.confidence.toLowerCase()}`}>→ {matchedHospital.hospital.hospital_name}</span> : <span className="match-badge match-none">No match</span>}</div>
              <label>Type</label><div className="result-value">{fieldVal(ocrData.extracted?.dr_type) || '—'}</div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button className="btn btn-success" onClick={handleApply} style={{ flex: 1 }}>Apply to DR Form</button>
              <button className="btn btn-outline" onClick={reset}>Scan Another</button>
              <button className="btn btn-outline" onClick={handleClose}>Cancel</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function DrEntry() {
  const { user } = useAuth();
  const consignment = useConsignment();
  const inventory = useInventory();
  const { hospitals } = useHospitals();

  const [rows, setRows] = useState([emptyRow()]);
  const [stockProducts, setStockProducts] = useState([]);
  const [saving, setSaving] = useState(false);
  const [drList, setDrList] = useState([]);
  const [scanOpen, setScanOpen] = useState(false);

  useEffect(() => {
    inventory.getMyStock().then(res => { if (res?.data) setStockProducts(res.data); }).catch(() => {});
    loadDRs();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const productOptions = useMemo(() => stockProducts.filter(sp => sp.total_qty > 0), [stockProducts]);

  const loadDRs = async () => {
    try {
      const res = await consignment.getDRs({ limit: 50 });
      if (res?.data) setDrList(res.data);
    } catch {}
  };

  // Build batch lookup: { product_id: [{ batch_lot_no, expiry_date, available_qty }] }
  const batchesByProduct = useMemo(() => {
    const map = {};
    for (const sp of stockProducts) {
      if (sp.batches?.length) {
        map[sp.product_id] = sp.batches.filter(b => b.available_qty > 0)
          .sort((a, b) => new Date(a.expiry_date) - new Date(b.expiry_date));
      }
    }
    return map;
  }, [stockProducts]);

  const addRow = () => setRows(prev => [...prev, emptyRow()]);
  const removeRow = (idx) => setRows(prev => prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx));
  const updateRow = (idx, field, value) => {
    setRows(prev => {
      const u = [...prev];
      u[idx] = { ...u[idx], [field]: value };
      // When product changes, reset batch/expiry
      if (field === 'product_id') {
        u[idx].batch_lot_no = '';
        u[idx].expiry_date = '';
      }
      // When batch is selected, auto-fill expiry from stock data
      if (field === 'batch_lot_no' && value) {
        const batches = batchesByProduct[u[idx].product_id] || [];
        const match = batches.find(b => b.batch_lot_no === value);
        if (match?.expiry_date) {
          u[idx].expiry_date = new Date(match.expiry_date).toISOString().split('T')[0];
        }
      }
      return u;
    });
  };

  const handleSubmitAll = async () => {
    const validRows = rows.filter(r => r.hospital_id && r.dr_ref && r.product_id && r.qty);
    if (!validRows.length) return alert('Fill in at least one complete row (Hospital, DR#, Product, Qty)');

    // Group by hospital_id + dr_ref + dr_date + dr_type → one DR per group
    const groups = new Map();
    for (const r of validRows) {
      const key = `${r.hospital_id}|${r.dr_ref}|${r.dr_date}|${r.dr_type}`;
      if (!groups.has(key)) groups.set(key, { ...r, line_items: [] });
      groups.get(key).line_items.push({
        product_id: r.product_id,
        batch_lot_no: r.batch_lot_no || undefined,
        qty: parseFloat(r.qty)
      });
    }

    setSaving(true);
    let submitted = 0;
    try {
      for (const [, dr] of groups) {
        await consignment.createDR({
          hospital_id: dr.hospital_id,
          dr_ref: dr.dr_ref,
          dr_date: dr.dr_date,
          dr_type: dr.dr_type,
          line_items: dr.line_items
        });
        submitted++;
      }
      setRows([emptyRow()]);
      await loadDRs();
      inventory.getMyStock().then(res => { if (res?.data) setStockProducts(res.data); }).catch(() => {});
    } catch (err) {
      alert(err.response?.data?.message || err.message || 'DR submission failed');
    } finally {
      setSaving(false);
    }
  };

  const handleScanApply = (data) => {
    if (data.line_items?.length) {
      const newRows = data.line_items.map(li => ({
        ...emptyRow(),
        hospital_id: data.hospital_id || '',
        dr_ref: data.dr_ref || '',
        dr_date: data.dr_date || new Date().toISOString().split('T')[0],
        dr_type: data.dr_type || 'DR_CONSIGNMENT',
        product_id: li.product_id || '',
        batch_lot_no: li.batch_lot_no || '',
        expiry_date: li.expiry_date || '',
        qty: li.qty || ''
      }));
      setRows(newRows);
    } else {
      setRows([{
        ...emptyRow(),
        hospital_id: data.hospital_id || '',
        dr_ref: data.dr_ref || '',
        dr_date: data.dr_date || new Date().toISOString().split('T')[0],
        dr_type: data.dr_type || 'DR_CONSIGNMENT'
      }]);
    }
  };

  const canSubmit = rows.some(r => r.hospital_id && r.dr_ref && r.product_id && r.qty);

  return (
    <div className="admin-page erp-page dr-entry-page">
      <style>{pageStyles}</style>
      <Navbar />
      <div className="admin-layout">
        <Sidebar />
        <main className="dr-main">
          <div className="dr-header">
            <h1>Delivery Receipts</h1>
            <div className="dr-actions">
              <button className="btn btn-primary" onClick={() => setScanOpen(true)} style={{ background: '#7c3aed' }}>Scan DR</button>
              <button className="btn btn-outline" onClick={addRow}>+ Add Row</button>
              <button className="btn btn-success" onClick={handleSubmitAll} disabled={!canSubmit || saving}>
                {saving ? 'Submitting...' : 'Submit DR'}
              </button>
            </div>
          </div>

          {/* Spreadsheet Grid */}
          <div className="dr-grid">
            <table className="dr-table">
              <thead>
                <tr>
                  <th style={{ width: 30 }}>#</th>
                  <th style={{ width: 200 }}>Hospital</th>
                  <th style={{ width: 100 }}>DR #</th>
                  <th style={{ width: 120 }}>DR Date</th>
                  <th style={{ width: 130 }}>Type</th>
                  <th style={{ minWidth: 200 }}>Product (from stock)</th>
                  <th style={{ width: 160 }}>Batch / Lot</th>
                  <th style={{ width: 110 }}>Expiry</th>
                  <th style={{ width: 70 }}>Qty</th>
                  <th style={{ width: 36 }}></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <tr key={row._tempId}>
                    <td style={{ color: 'var(--erp-muted)', fontWeight: 600, fontSize: 12 }}>{idx + 1}</td>
                    <td>
                      <SelectField value={row.hospital_id} onChange={e => updateRow(idx, 'hospital_id', e.target.value)}>
                        <option value="">Select hospital...</option>
                        {hospitals.map(h => <option key={h._id} value={h._id}>{h.hospital_name_display || h.hospital_name}</option>)}
                      </SelectField>
                    </td>
                    <td>
                      <input value={row.dr_ref} onChange={e => updateRow(idx, 'dr_ref', e.target.value)} placeholder="DR #" />
                    </td>
                    <td>
                      <input type="date" value={row.dr_date} onChange={e => updateRow(idx, 'dr_date', e.target.value)} />
                    </td>
                    <td>
                      <SelectField value={row.dr_type} onChange={e => updateRow(idx, 'dr_type', e.target.value)}>
                        {DR_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </SelectField>
                    </td>
                    <td>
                      <SelectField value={row.product_id} onChange={e => updateRow(idx, 'product_id', e.target.value)}>
                        <option value="">Select...</option>
                        {productOptions.map(sp => (
                          <option key={sp.product_id} value={sp.product_id}>
                            {sp.product?.brand_name}{sp.product?.dosage_strength ? ` ${sp.product.dosage_strength}` : ''} — {sp.total_qty} {sp.product?.unit_code || 'PC'}
                          </option>
                        ))}
                      </SelectField>
                    </td>
                    <td>
                      {(() => {
                        const batches = batchesByProduct[row.product_id] || [];
                        if (!row.product_id) return <SelectField disabled><option>—</option></SelectField>;
                        if (batches.length === 0) return <input value={row.batch_lot_no} onChange={e => updateRow(idx, 'batch_lot_no', e.target.value)} placeholder="No batches" />;
                        if (batches.length === 1) {
                          // Auto-select single batch
                          if (!row.batch_lot_no && batches[0].batch_lot_no) {
                            setTimeout(() => updateRow(idx, 'batch_lot_no', batches[0].batch_lot_no), 0);
                          }
                          return <span style={{ fontSize: 12, fontWeight: 600 }}>{batches[0].batch_lot_no} ({batches[0].available_qty})</span>;
                        }
                        return (
                          <SelectField value={row.batch_lot_no} onChange={e => updateRow(idx, 'batch_lot_no', e.target.value)} style={{ fontSize: 12 }}>
                            <option value="">Select batch...</option>
                            {batches.map(b => (
                              <option key={b.batch_lot_no} value={b.batch_lot_no}>
                                {b.batch_lot_no} — {b.available_qty} avail (exp: {new Date(b.expiry_date).toLocaleDateString()})
                              </option>
                            ))}
                          </SelectField>
                        );
                      })()}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--erp-muted)', whiteSpace: 'nowrap' }}>
                      {row.expiry_date ? new Date(row.expiry_date).toLocaleDateString() : '—'}
                    </td>
                    <td>
                      <input type="number" min="1" value={row.qty} onChange={e => updateRow(idx, 'qty', e.target.value)} placeholder="0" />
                    </td>
                    <td>
                      <button className="btn btn-danger btn-sm" onClick={() => removeRow(idx)} title="Remove">&times;</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button className="add-row-btn" onClick={addRow}>+ Add Row</button>
          </div>

          {/* DR History */}
          <div className="dr-history">
            <h2>DR History</h2>
            <table className="history-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>DR #</th>
                  <th>Type</th>
                  <th>Hospital</th>
                  <th>Products</th>
                  <th>Items</th>
                </tr>
              </thead>
              <tbody>
                {drList.map(d => {
                  const tc = TYPE_COLORS[d.event_type] || {};
                  return (
                    <tr key={d._id}>
                      <td>{new Date(d.event_date).toLocaleDateString('en-PH')}</td>
                      <td style={{ fontWeight: 600 }}>{d.document_ref}</td>
                      <td><span className="badge" style={{ background: tc.bg, color: tc.text }}>{TYPE_LABELS[d.event_type] || d.event_type}</span></td>
                      <td>{d.payload?.hospital_name || '—'}</td>
                      <td style={{ fontSize: 11 }}>
                        {d.payload?.line_items?.map((li, i) => (
                          <div key={i}>{li.item_key || li.product_id} × {li.qty}</div>
                        ))}
                      </td>
                      <td>{d.payload?.line_items?.length || 0}</td>
                    </tr>
                  );
                })}
                {!drList.length && <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: 'var(--erp-muted)' }}>No DRs found</td></tr>}
              </tbody>
            </table>
          </div>
        </main>
      </div>
      <ScanDRModal open={scanOpen} onClose={() => setScanOpen(false)} onApply={handleScanApply} hospitals={hospitals} stockProducts={stockProducts} />
    </div>
  );
}
