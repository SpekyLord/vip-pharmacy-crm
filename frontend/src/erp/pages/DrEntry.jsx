import { useState, useEffect, useRef, useMemo } from 'react';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import { useAuth } from '../../hooks/useAuth';
import useConsignment from '../hooks/useConsignment';
import useInventory from '../hooks/useInventory';
import useHospitals from '../hooks/useHospitals';
import { processDocument, extractExifDateTime } from '../services/ocrService';

const DR_TYPES = [
  { value: 'DR_CONSIGNMENT', label: 'Consignment' },
  { value: 'DR_SAMPLING', label: 'Sampling' }
];

const emptyLine = () => ({ product_id: '', batch_lot_no: '', expiry_date: '', qty: '' });

const pageStyles = `
  .dr-page { background: var(--erp-bg, #f4f7fb); min-height: 100vh; }
  .dr-main { flex: 1; min-width: 0; overflow-y: auto; -webkit-overflow-scrolling: touch; padding: 20px; max-width: 1200px; margin: 0 auto; }
  .dr-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 12px; }
  .dr-header h1 { font-size: 22px; color: var(--erp-text); margin: 0; }
  .btn { padding: 8px 16px; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn-primary { background: var(--erp-accent, #1e5eff); color: #fff; }
  .btn-success { background: #16a34a; color: #fff; }
  .btn-danger { background: #dc2626; color: #fff; }
  .btn-outline { background: transparent; border: 1px solid var(--erp-border, #dbe4f0); color: var(--erp-text); }
  .btn-sm { padding: 4px 10px; font-size: 12px; }

  .dr-form { background: var(--erp-panel, #fff); border: 1px solid var(--erp-border); border-radius: 12px; padding: 20px; margin-bottom: 20px; }
  .dr-form h2 { font-size: 16px; margin: 0 0 16px; color: var(--erp-text); }
  .form-row { display: flex; gap: 12px; margin-bottom: 12px; flex-wrap: wrap; }
  .form-group { flex: 1; min-width: 150px; }
  .form-group label { display: block; font-size: 11px; color: var(--erp-muted); font-weight: 600; text-transform: uppercase; margin-bottom: 4px; }
  .form-group input, .form-group select { width: 100%; padding: 8px 10px; border: 1px solid var(--erp-border); border-radius: 8px; font-size: 13px; background: var(--erp-panel); color: var(--erp-text); }
  .type-toggle { display: flex; gap: 0; border: 1px solid var(--erp-border); border-radius: 8px; overflow: hidden; }
  .type-toggle button { flex: 1; padding: 8px 16px; border: none; font-size: 13px; font-weight: 600; cursor: pointer; background: var(--erp-panel); color: var(--erp-muted); }
  .type-toggle button.active { background: var(--erp-accent); color: #fff; }

  .line-items-table { width: 100%; border-collapse: collapse; font-size: 13px; margin: 12px 0; }
  .line-items-table th { background: var(--erp-bg); padding: 8px 10px; text-align: left; font-weight: 600; color: var(--erp-muted); font-size: 11px; text-transform: uppercase; }
  .line-items-table td { padding: 6px 8px; border-top: 1px solid var(--erp-border); }
  .line-items-table input, .line-items-table select { width: 100%; padding: 6px 8px; border: 1px solid var(--erp-border); border-radius: 6px; font-size: 13px; }
  .add-line-btn { background: none; border: 2px dashed var(--erp-border); width: 100%; padding: 8px; text-align: center; color: var(--erp-accent); font-weight: 600; cursor: pointer; border-radius: 8px; }

  .dr-list { background: var(--erp-panel); border: 1px solid var(--erp-border); border-radius: 12px; overflow: hidden; }
  .dr-list h2 { font-size: 16px; margin: 0; padding: 16px 20px 12px; }
  .dr-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .dr-table th { padding: 10px 16px; text-align: left; font-weight: 600; color: var(--erp-muted); background: var(--erp-bg); }
  .dr-table td { padding: 10px 16px; border-top: 1px solid var(--erp-border); }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 600; }

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

  @media (max-width: 768px) { .form-row { flex-direction: column; } }
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

// --- Scan DR Modal ---
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

  const [hospitalId, setHospitalId] = useState('');
  const [drRef, setDrRef] = useState('');
  const [drDate, setDrDate] = useState(new Date().toISOString().split('T')[0]);
  const [drType, setDrType] = useState('DR_CONSIGNMENT');
  const [lineItems, setLineItems] = useState([emptyLine()]);
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

  const updateLine = (idx, field, value) => {
    setLineItems(prev => { const u = [...prev]; u[idx] = { ...u[idx], [field]: value }; return u; });
  };
  const addLine = () => setLineItems(prev => [...prev, emptyLine()]);
  const removeLine = (idx) => setLineItems(prev => prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx));

  const handleSubmit = async () => {
    const validLines = lineItems.filter(li => li.product_id && li.qty);
    if (!hospitalId || !drRef || !validLines.length) return;
    setSaving(true);
    try {
      await consignment.createDR({
        hospital_id: hospitalId, dr_ref: drRef, dr_date: drDate, dr_type: drType,
        line_items: validLines.map(li => ({ product_id: li.product_id, batch_lot_no: li.batch_lot_no || undefined, qty: parseFloat(li.qty) }))
      });
      setHospitalId(''); setDrRef(''); setLineItems([emptyLine()]);
      await loadDRs();
      inventory.getMyStock().then(res => { if (res?.data) setStockProducts(res.data); }).catch(() => {});
    } catch (err) { console.error('DR save error:', err); }
    finally { setSaving(false); }
  };

  const handleScanApply = (data) => {
    if (data.hospital_id) setHospitalId(data.hospital_id);
    if (data.dr_ref) setDrRef(data.dr_ref);
    if (data.dr_date) setDrDate(data.dr_date);
    if (data.dr_type) setDrType(data.dr_type);
    if (data.line_items?.length) setLineItems(data.line_items.map(l => ({ ...emptyLine(), ...l })));
  };

  return (
    <div className="admin-page erp-page dr-page">
      <style>{pageStyles}</style>
      <Navbar />
      <div className="admin-layout">
        <Sidebar />
        <main className="dr-main">
          <div className="dr-header">
            <h1>Delivery Receipts</h1>
            <button className="btn btn-primary" onClick={() => setScanOpen(true)} style={{ background: '#7c3aed' }}>Scan DR</button>
          </div>

          <div className="dr-form">
            <h2>New DR</h2>
            <div className="form-row">
              <div className="form-group">
                <label>Hospital</label>
                <select value={hospitalId} onChange={e => setHospitalId(e.target.value)}>
                  <option value="">Select hospital...</option>
                  {hospitals.map(h => <option key={h._id} value={h._id}>{h.hospital_name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>DR #</label>
                <input value={drRef} onChange={e => setDrRef(e.target.value)} placeholder="DR reference" />
              </div>
              <div className="form-group">
                <label>DR Date</label>
                <input type="date" value={drDate} onChange={e => setDrDate(e.target.value)} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>DR Type</label>
                <div className="type-toggle">
                  {DR_TYPES.map(t => (
                    <button key={t.value} className={drType === t.value ? 'active' : ''} onClick={() => setDrType(t.value)}>{t.label}</button>
                  ))}
                </div>
              </div>
            </div>

            <table className="line-items-table">
              <thead><tr><th>Product (from stock)</th><th>Batch</th><th>Qty</th><th style={{ width: 40 }}></th></tr></thead>
              <tbody>
                {lineItems.map((li, idx) => (
                  <tr key={idx}>
                    <td>
                      <select value={li.product_id} onChange={e => updateLine(idx, 'product_id', e.target.value)}>
                        <option value="">Select...</option>
                        {productOptions.map(sp => (
                          <option key={sp.product_id} value={sp.product_id}>
                            {sp.product?.brand_name} {sp.product?.dosage_strength || ''} — {sp.total_qty} {sp.product?.unit_code || 'PC'}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td><input value={li.batch_lot_no} onChange={e => updateLine(idx, 'batch_lot_no', e.target.value)} placeholder="Optional" /></td>
                    <td><input type="number" min="1" value={li.qty} onChange={e => updateLine(idx, 'qty', e.target.value)} /></td>
                    <td><button className="btn btn-danger btn-sm" onClick={() => removeLine(idx)}>&times;</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button className="add-line-btn" onClick={addLine}>+ Add Line</button>

            <div style={{ marginTop: 16, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-success" onClick={handleSubmit} disabled={saving}>
                {saving ? 'Submitting...' : 'Submit DR'}
              </button>
            </div>
          </div>

          <div className="dr-list">
            <h2>DR History</h2>
            <table className="dr-table">
              <thead><tr><th>Date</th><th>DR #</th><th>Type</th><th>Hospital</th><th>Items</th></tr></thead>
              <tbody>
                {drList.map(d => (
                  <tr key={d._id}>
                    <td>{new Date(d.event_date).toLocaleDateString('en-PH')}</td>
                    <td>{d.document_ref}</td>
                    <td><span className="badge" style={{ background: d.event_type === 'DR_CONSIGNMENT' ? '#dbeafe' : '#f3e8ff', color: d.event_type === 'DR_CONSIGNMENT' ? '#1e40af' : '#7c3aed' }}>{d.event_type === 'DR_CONSIGNMENT' ? 'Consignment' : 'Sampling'}</span></td>
                    <td>{d.payload?.hospital_name || '—'}</td>
                    <td>{d.payload?.line_items?.length || 0} item(s)</td>
                  </tr>
                ))}
                {!drList.length && <tr><td colSpan={5} style={{ textAlign: 'center', padding: 40, color: 'var(--erp-muted)' }}>No DRs found</td></tr>}
              </tbody>
            </table>
          </div>
        </main>
      </div>

      <ScanDRModal open={scanOpen} onClose={() => setScanOpen(false)} onApply={handleScanApply} hospitals={hospitals} stockProducts={stockProducts} />
    </div>
  );
}
