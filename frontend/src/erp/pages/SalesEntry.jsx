import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import { useAuth } from '../../hooks/useAuth';
import useSales from '../hooks/useSales';
import useInventory from '../hooks/useInventory';
import useHospitals from '../hooks/useHospitals';
import { processDocument, extractExifDateTime } from '../services/ocrService';

const STATUS_COLORS = {
  DRAFT: { bg: '#e2e8f0', text: '#475569', label: 'Draft' },
  VALID: { bg: '#dcfce7', text: '#166534', label: 'Valid' },
  ERROR: { bg: '#fef2f2', text: '#991b1b', label: 'Error' },
  POSTED: { bg: '#dbeafe', text: '#1e40af', label: 'Posted' },
  DELETION_REQUESTED: { bg: '#fef3c7', text: '#92400e', label: 'Del. Req.' }
};

const emptyRow = () => ({
  _tempId: Date.now() + Math.random(),
  hospital_id: '',
  csi_date: new Date().toISOString().split('T')[0],
  doc_ref: '',
  line_items: [{ product_id: '', qty: '', unit: '', unit_price: '', item_key: '', batch_lot_no: '', fifo_override: false, override_reason: '' }],
  status: 'DRAFT',
  validation_errors: [],
  _isNew: true
});

const pageStyles = `
  .sales-entry-page { background: var(--erp-bg, #f4f7fb); min-height: 100vh; }
  .sales-main { flex: 1; min-width: 0; overflow-y: auto; -webkit-overflow-scrolling: touch; padding: 20px; max-width: 1400px; margin: 0 auto; }
  .sales-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 12px; }
  .sales-header h1 { font-size: 22px; color: var(--erp-text, #132238); margin: 0; }
  .sales-actions { display: flex; gap: 8px; flex-wrap: wrap; }
  .btn { padding: 8px 16px; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.15s; }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn-primary { background: var(--erp-accent, #1e5eff); color: #fff; }
  .btn-success { background: #16a34a; color: #fff; }
  .btn-warning { background: #d97706; color: #fff; }
  .btn-outline { background: transparent; border: 1px solid var(--erp-border, #dbe4f0); color: var(--erp-text); }
  .btn-danger { background: #dc2626; color: #fff; }
  .btn-sm { padding: 4px 10px; font-size: 12px; }

  .sales-grid { background: var(--erp-panel, #fff); border: 1px solid var(--erp-border, #dbe4f0); border-radius: 12px; overflow-x: auto; }
  .sales-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .sales-table th { background: var(--erp-accent-soft, #e8efff); color: var(--erp-text); padding: 10px 8px; text-align: left; font-weight: 600; white-space: nowrap; position: sticky; top: 0; }
  .sales-table td { padding: 6px 8px; border-top: 1px solid var(--erp-border, #dbe4f0); vertical-align: top; }
  .sales-table input, .sales-table select { width: 100%; padding: 6px 8px; border: 1px solid var(--erp-border, #dbe4f0); border-radius: 6px; font-size: 13px; background: var(--erp-panel, #fff); color: var(--erp-text); }
  .sales-table input:focus, .sales-table select:focus { outline: none; border-color: var(--erp-accent, #1e5eff); }
  .sales-table .readonly { background: var(--erp-bg, #f4f7fb); color: var(--erp-muted, #5f7188); border: none; }

  .status-badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 600; }
  .error-panel { margin-top: 12px; background: #fef2f2; border: 1px solid #fecaca; border-radius: 12px; padding: 16px; }
  .error-panel h3 { margin: 0 0 8px; font-size: 14px; color: #991b1b; }
  .error-panel ul { margin: 0; padding-left: 20px; }
  .error-panel li { font-size: 13px; color: #991b1b; margin-bottom: 4px; }

  .near-expiry-badge { background: #fef3c7; color: #92400e; padding: 1px 6px; border-radius: 4px; font-size: 10px; font-weight: 600; margin-left: 4px; }
  .batch-select { font-size: 12px !important; }
  .batch-single { font-weight: 600; color: var(--erp-text); }
  .override-reason { margin-top: 4px; font-size: 11px !important; border-color: #f59e0b !important; background: #fffbeb !important; }
  .override-reason::placeholder { color: #b45309; font-style: italic; }
  .add-row-btn { display: block; width: 100%; padding: 10px; text-align: center; color: var(--erp-accent); background: transparent; border: 2px dashed var(--erp-border); border-radius: 0 0 12px 12px; cursor: pointer; font-weight: 600; }

  /* Scan CSI Modal */
  .scan-modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 1000; display: flex; align-items: center; justify-content: center; padding: 16px; }
  .scan-modal { background: var(--erp-panel, #fff); border-radius: 16px; width: 100%; max-width: 520px; max-height: 90vh; overflow-y: auto; padding: 24px; position: relative; }
  .scan-modal h2 { margin: 0 0 16px; font-size: 18px; color: var(--erp-text); }
  .scan-modal .close-btn { position: absolute; top: 12px; right: 16px; background: none; border: none; font-size: 22px; cursor: pointer; color: var(--erp-muted); }
  .scan-capture-btns { display: flex; gap: 10px; margin-bottom: 16px; }
  .scan-capture-btns .btn { flex: 1; text-align: center; padding: 12px; font-size: 14px; }
  .scan-preview { width: 100%; max-height: 200px; object-fit: contain; border-radius: 8px; margin-bottom: 16px; border: 1px solid var(--erp-border); }
  .scan-progress { text-align: center; padding: 24px 0; }
  .scan-progress .spinner { width: 36px; height: 36px; border: 3px solid var(--erp-border); border-top-color: var(--erp-accent); border-radius: 50%; animation: spin 0.8s linear infinite; margin: 0 auto 12px; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .scan-results { margin-top: 12px; }
  .scan-results .result-group { margin-bottom: 12px; }
  .scan-results label { font-size: 11px; color: var(--erp-muted); font-weight: 600; text-transform: uppercase; display: block; margin-bottom: 2px; }
  .scan-results .result-value { font-size: 14px; color: var(--erp-text); padding: 6px 10px; background: var(--erp-bg); border-radius: 6px; border: 1px solid var(--erp-border); }
  .scan-results .match-badge { display: inline-block; padding: 1px 6px; border-radius: 4px; font-size: 10px; font-weight: 600; margin-left: 6px; }
  .scan-results .match-high { background: #dcfce7; color: #166534; }
  .scan-results .match-medium { background: #fef3c7; color: #92400e; }
  .scan-results .match-none { background: #fef2f2; color: #991b1b; }
  .scan-item-table { width: 100%; font-size: 12px; border-collapse: collapse; margin-top: 8px; }
  .scan-item-table th { text-align: left; padding: 4px 6px; background: var(--erp-bg); font-weight: 600; color: var(--erp-muted); }
  .scan-item-table td { padding: 4px 6px; border-top: 1px solid var(--erp-border); }
  .scan-error { background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 12px; color: #991b1b; font-size: 13px; margin-bottom: 12px; }

  /* Mobile cards */
  @media (max-width: 768px) {
    .sales-table-wrapper { display: none; }
    .sales-cards { display: flex; flex-direction: column; gap: 12px; padding: 12px; }
    .sale-card { background: var(--erp-panel); border: 1px solid var(--erp-border); border-radius: 12px; padding: 14px; }
    .sale-card label { font-size: 11px; color: var(--erp-muted); font-weight: 600; text-transform: uppercase; }
    .sale-card input, .sale-card select { width: 100%; padding: 8px; margin-top: 4px; margin-bottom: 10px; border: 1px solid var(--erp-border); border-radius: 8px; font-size: 14px; }
    .sale-card .card-footer { display: flex; justify-content: space-between; align-items: center; margin-top: 8px; }
  }
  @media (min-width: 769px) {
    .sales-cards { display: none; }
  }
`;

// --- Fuzzy matching helpers for OCR → master data ---
function normalizeStr(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function matchHospital(ocrName, hospitals) {
  if (!ocrName || !hospitals?.length) return null;
  const cleaned = normalizeStr(ocrName);
  if (!cleaned) return null;
  // Exact normalized match
  let match = hospitals.find(h => normalizeStr(h.hospital_name) === cleaned);
  if (match) return { hospital: match, confidence: 'HIGH' };
  // Substring match (OCR text contains hospital name or vice versa)
  match = hospitals.find(h => {
    const hn = normalizeStr(h.hospital_name);
    return cleaned.includes(hn) || hn.includes(cleaned);
  });
  if (match) return { hospital: match, confidence: 'MEDIUM' };
  // Word overlap scoring
  const ocrWords = cleaned.match(/.{2,}/g) || [];
  let best = null, bestScore = 0;
  for (const h of hospitals) {
    const hn = normalizeStr(h.hospital_name);
    let score = 0;
    for (const w of ocrWords) { if (hn.includes(w)) score++; }
    if (score > bestScore) { bestScore = score; best = h; }
  }
  if (best && bestScore >= 2) return { hospital: best, confidence: 'MEDIUM' };
  return null;
}

function matchProduct(ocrBrand, ocrDosage, productOptions) {
  if (!ocrBrand || !productOptions?.length) return null;
  const cleaned = normalizeStr(ocrBrand);
  const dosage = normalizeStr(ocrDosage || '');
  if (!cleaned) return null;
  // Try brand+dosage combo first
  if (dosage) {
    const match = productOptions.find(p => {
      const pn = normalizeStr(p.brand_name);
      return pn === cleaned || (cleaned.includes(pn) && normalizeStr(p.label).includes(dosage));
    });
    if (match) return { product: match, confidence: 'HIGH' };
  }
  // Exact brand match
  let match = productOptions.find(p => normalizeStr(p.brand_name) === cleaned);
  if (match) return { product: match, confidence: 'HIGH' };
  // Substring brand match
  match = productOptions.find(p => {
    const pn = normalizeStr(p.brand_name);
    return cleaned.includes(pn) || pn.includes(cleaned);
  });
  if (match) return { product: match, confidence: 'MEDIUM' };
  return null;
}

// Extract the value from a scored field (OCR returns {value, confidence} or plain string)
function fieldVal(f) {
  if (f == null) return '';
  if (typeof f === 'object' && 'value' in f) return f.value ?? '';
  return String(f);
}

// --- ScanCSIModal inline component ---
function ScanCSIModal({ open, onClose, onApply, hospitals, productOptions }) {
  const [step, setStep] = useState('capture'); // capture | scanning | results | error
  const [photo, setPhoto] = useState(null);
  const [preview, setPreview] = useState(null);
  const [ocrData, setOcrData] = useState(null);
  const [matchedHospital, setMatchedHospital] = useState(null);
  const [matchedItems, setMatchedItems] = useState([]);
  const [errorMsg, setErrorMsg] = useState('');
  const cameraRef = useRef(null);
  const galleryRef = useRef(null);

  const reset = () => {
    setStep('capture');
    setPhoto(null);
    setPreview(null);
    setOcrData(null);
    setMatchedHospital(null);
    setMatchedItems([]);
    setErrorMsg('');
  };

  const handleClose = () => { reset(); onClose(); };

  const handleFile = async (file) => {
    if (!file) return;
    setPhoto(file);
    setPreview(URL.createObjectURL(file));
    setStep('scanning');
    setErrorMsg('');

    try {
      const exif = await extractExifDateTime(file);
      const result = await processDocument(file, 'CSI', exif);
      setOcrData(result);

      // Match hospital
      const hospitalText = fieldVal(result.extracted?.hospital);
      const hMatch = matchHospital(hospitalText, hospitals);
      setMatchedHospital(hMatch);

      // Match line items / products
      const items = result.extracted?.line_items || [];
      const matched = items.map(item => {
        const brand = fieldVal(item.brand_name);
        const dosage = fieldVal(item.dosage);
        const pMatch = matchProduct(brand, dosage, productOptions);
        return {
          ocr_brand: brand,
          ocr_generic: fieldVal(item.generic_name),
          ocr_dosage: dosage,
          ocr_qty: fieldVal(item.qty),
          ocr_unit_price: fieldVal(item.unit_price),
          ocr_amount: fieldVal(item.amount),
          ocr_batch: fieldVal(item.batch_lot_no),
          product_match: pMatch
        };
      });
      setMatchedItems(matched);
      setStep('results');
    } catch (err) {
      setErrorMsg(err?.response?.data?.message || err.message || 'OCR processing failed');
      setStep('error');
    }
  };

  const handleApply = () => {
    const extracted = ocrData?.extracted;
    if (!extracted) return;

    const row = {
      hospital_id: matchedHospital?.hospital?._id || '',
      csi_date: (() => {
        const d = fieldVal(extracted.date);
        if (!d) return new Date().toISOString().split('T')[0];
        // Try to parse various date formats into YYYY-MM-DD
        const parsed = new Date(d);
        if (!isNaN(parsed)) return parsed.toISOString().split('T')[0];
        return new Date().toISOString().split('T')[0];
      })(),
      doc_ref: fieldVal(extracted.invoice_no),
      line_items: matchedItems.length > 0
        ? matchedItems.map(mi => ({
            product_id: mi.product_match?.product?.product_id || '',
            qty: String(parseFloat(mi.ocr_qty) || ''),
            unit: mi.product_match?.product?.unit_code || '',
            unit_price: mi.product_match?.product?.selling_price != null
              ? String(mi.product_match.product.selling_price)
              : String(parseFloat(mi.ocr_unit_price) || ''),
            item_key: mi.product_match?.product?.item_key || ''
          }))
        : [{ product_id: '', qty: '', unit: '', unit_price: '', item_key: '' }]
    };

    onApply(row);
    handleClose();
  };

  if (!open) return null;

  return (
    <div className="scan-modal-overlay" onClick={handleClose}>
      <div className="scan-modal" onClick={e => e.stopPropagation()}>
        <button className="close-btn" onClick={handleClose}>&times;</button>
        <h2>Scan CSI Document</h2>

        {/* Hidden file inputs */}
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
          onChange={e => handleFile(e.target.files?.[0])} />
        <input ref={galleryRef} type="file" accept="image/*" style={{ display: 'none' }}
          onChange={e => handleFile(e.target.files?.[0])} />

        {step === 'capture' && (
          <>
            <p style={{ fontSize: 13, color: 'var(--erp-muted)', marginBottom: 16 }}>
              Take a photo of a CSI (Charge Sales Invoice) or upload from gallery. OCR will extract the invoice details and pre-fill a sales row.
            </p>
            <div className="scan-capture-btns">
              <button className="btn btn-primary" onClick={() => cameraRef.current?.click()}>
                📷 Take Photo
              </button>
              <button className="btn btn-outline" onClick={() => galleryRef.current?.click()}>
                🖼 Gallery
              </button>
            </div>
          </>
        )}

        {step === 'scanning' && (
          <>
            {preview && <img src={preview} alt="CSI preview" className="scan-preview" />}
            <div className="scan-progress">
              <div className="spinner" />
              <div style={{ fontSize: 14, color: 'var(--erp-muted)' }}>Processing CSI with OCR...</div>
            </div>
          </>
        )}

        {step === 'error' && (
          <>
            {preview && <img src={preview} alt="CSI preview" className="scan-preview" />}
            <div className="scan-error">{errorMsg}</div>
            <div className="scan-capture-btns">
              <button className="btn btn-primary" onClick={() => { reset(); cameraRef.current?.click(); }}>
                Retry Photo
              </button>
              <button className="btn btn-outline" onClick={() => { reset(); galleryRef.current?.click(); }}>
                Try Gallery
              </button>
              <button className="btn btn-outline" onClick={handleClose}>Cancel</button>
            </div>
          </>
        )}

        {step === 'results' && ocrData && (
          <>
            {preview && <img src={preview} alt="CSI preview" className="scan-preview" />}
            <div className="scan-results">
              {/* Header fields */}
              <div className="result-group">
                <label>CSI # (Invoice No.)</label>
                <div className="result-value">{fieldVal(ocrData.extracted?.invoice_no) || '—'}</div>
              </div>
              <div className="result-group">
                <label>Date</label>
                <div className="result-value">{fieldVal(ocrData.extracted?.date) || '—'}</div>
              </div>
              <div className="result-group">
                <label>Hospital</label>
                <div className="result-value">
                  {fieldVal(ocrData.extracted?.hospital) || '—'}
                  {matchedHospital ? (
                    <span className={`match-badge match-${matchedHospital.confidence.toLowerCase()}`}>
                      → {matchedHospital.hospital.hospital_name}
                    </span>
                  ) : (
                    <span className="match-badge match-none">No match</span>
                  )}
                </div>
              </div>

              {/* Line items */}
              {matchedItems.length > 0 && (
                <div className="result-group">
                  <label>Line Items ({matchedItems.length})</label>
                  <table className="scan-item-table">
                    <thead>
                      <tr>
                        <th>Product (OCR)</th>
                        <th>Matched To</th>
                        <th>Qty</th>
                        <th>Price</th>
                      </tr>
                    </thead>
                    <tbody>
                      {matchedItems.map((mi, i) => (
                        <tr key={i}>
                          <td>
                            {mi.ocr_brand}
                            {mi.ocr_dosage && <span style={{ color: 'var(--erp-muted)', marginLeft: 4 }}>{mi.ocr_dosage}</span>}
                          </td>
                          <td>
                            {mi.product_match ? (
                              <span>
                                {mi.product_match.product.brand_name}
                                <span className={`match-badge match-${mi.product_match.confidence.toLowerCase()}`}>
                                  {mi.product_match.confidence}
                                </span>
                              </span>
                            ) : (
                              <span className="match-badge match-none">No match</span>
                            )}
                          </td>
                          <td>{mi.ocr_qty || '—'}</td>
                          <td>{mi.ocr_unit_price || mi.product_match?.product?.selling_price || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Validation flags */}
              {ocrData.validation_flags?.length > 0 && (
                <div className="scan-error" style={{ marginTop: 12 }}>
                  {ocrData.validation_flags.map((f, i) => (
                    <div key={i}>{f.message || f.type}</div>
                  ))}
                </div>
              )}

              {/* Action buttons */}
              <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                <button className="btn btn-success" onClick={handleApply} style={{ flex: 1 }}>
                  Apply to Sales Entry
                </button>
                <button className="btn btn-outline" onClick={reset}>Scan Another</button>
                <button className="btn btn-outline" onClick={handleClose}>Cancel</button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function SalesEntry() {
  const { user } = useAuth();
  const sales = useSales();
  const inventory = useInventory();
  const { hospitals } = useHospitals();

  const [rows, setRows] = useState([emptyRow()]);
  const [stockProducts, setStockProducts] = useState([]);
  const [validationErrors, setValidationErrors] = useState([]);
  const [actionLoading, setActionLoading] = useState('');
  const [scanModalOpen, setScanModalOpen] = useState(false);

  // Load stock on mount (only products with stock > 0)
  useEffect(() => {
    inventory.getMyStock().then(res => {
      if (res?.data) setStockProducts(res.data);
    }).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Build product dropdown options from stock (includes batches for FIFO selector)
  const productOptions = useMemo(() => {
    return stockProducts.map(sp => ({
      product_id: sp.product_id,
      label: `${sp.product?.brand_name || 'Unknown'} ${sp.product?.dosage_strength || ''} — ${sp.total_qty} ${sp.product?.unit_code || 'PC'}`,
      brand_name: sp.product?.brand_name,
      unit_code: sp.product?.unit_code || 'PC',
      selling_price: sp.product?.selling_price || 0,
      item_key: sp.product?.item_key || '',
      near_expiry: sp.near_expiry,
      total_qty: sp.total_qty,
      batches: (sp.batches || []).sort((a, b) => new Date(a.expiry_date) - new Date(b.expiry_date))
    }));
  }, [stockProducts]);

  const updateRow = useCallback((idx, field, value) => {
    setRows(prev => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], [field]: value };
      return updated;
    });
  }, []);

  const updateLineItem = useCallback((rowIdx, itemIdx, field, value) => {
    setRows(prev => {
      const updated = [...prev];
      const row = { ...updated[rowIdx] };
      const items = [...row.line_items];
      items[itemIdx] = { ...items[itemIdx], [field]: value };

      // Auto-fill on product selection
      if (field === 'product_id' && value) {
        const product = productOptions.find(p => p.product_id?.toString() === value || p.product_id === value);
        if (product) {
          items[itemIdx].unit = product.unit_code;
          items[itemIdx].unit_price = product.selling_price;
          items[itemIdx].item_key = product.item_key;
          // Reset batch selection when product changes
          items[itemIdx].batch_lot_no = '';
          items[itemIdx].fifo_override = false;
          items[itemIdx].override_reason = '';
        }
      }

      // Handle batch selection — detect FIFO override
      if (field === 'batch_lot_no') {
        if (!value) {
          // "Auto (FIFO)" selected — clear override
          items[itemIdx].fifo_override = false;
          items[itemIdx].override_reason = '';
        } else {
          // Specific batch selected — check if it's the FIFO-recommended batch (nearest expiry = first in sorted list)
          const product = productOptions.find(p => p.product_id?.toString() === items[itemIdx].product_id?.toString() || p.product_id === items[itemIdx].product_id);
          const fifoBatch = product?.batches?.[0]?.batch_lot_no; // First = nearest expiry
          items[itemIdx].fifo_override = value !== fifoBatch;
          if (value === fifoBatch) items[itemIdx].override_reason = '';
        }
      }

      row.line_items = items;
      updated[rowIdx] = row;
      return updated;
    });
  }, [productOptions]);

  const addRow = () => setRows(prev => [...prev, emptyRow()]);

  // Apply OCR scan results as a new row
  const handleScanApply = useCallback((scannedData) => {
    const newRow = {
      ...emptyRow(),
      hospital_id: scannedData.hospital_id,
      csi_date: scannedData.csi_date,
      doc_ref: scannedData.doc_ref,
      line_items: scannedData.line_items?.length
        ? scannedData.line_items.map(li => ({ ...li, batch_lot_no: li.batch_lot_no || '', fifo_override: false, override_reason: '' }))
        : [{ product_id: '', qty: '', unit: '', unit_price: '', item_key: '', batch_lot_no: '', fifo_override: false, override_reason: '' }]
    };
    setRows(prev => [...prev, newRow]);
  }, []);

  const removeRow = (idx) => {
    setRows(prev => {
      if (prev.length <= 1) return prev;
      return prev.filter((_, i) => i !== idx);
    });
  };

  const computeLineTotal = (item) => {
    const qty = parseFloat(item.qty) || 0;
    const price = parseFloat(item.unit_price) || 0;
    return (qty * price).toFixed(2);
  };

  // Save all new/dirty rows as DRAFTs
  const saveAll = async () => {
    setActionLoading('save');
    try {
      const savedIds = [];
      for (const row of rows) {
        if (!row._isNew) continue;
        if (!row.hospital_id || !row.doc_ref) continue;

        const payload = {
          hospital_id: row.hospital_id,
          csi_date: row.csi_date,
          doc_ref: row.doc_ref,
          line_items: row.line_items.filter(li => li.product_id && li.qty).map(li => ({
            product_id: li.product_id,
            item_key: li.item_key,
            qty: parseFloat(li.qty),
            unit: li.unit,
            unit_price: parseFloat(li.unit_price),
            ...(li.batch_lot_no ? { batch_lot_no: li.batch_lot_no, fifo_override: li.fifo_override || false } : {}),
            ...(li.fifo_override && li.override_reason ? { override_reason: li.override_reason } : {})
          }))
        };

        const res = await sales.createSale(payload);
        if (res?.data) savedIds.push(res.data._id);
      }

      if (savedIds.length) {
        // Reload from server
        await loadSales();
      }
    } catch (err) {
      console.error('Save error:', err);
    } finally {
      setActionLoading('');
    }
  };

  const loadSales = async () => {
    try {
      // Load all non-final rows: DRAFT (editable), VALID (submittable), ERROR (fixable), POSTED (reopenable)
      const res = await sales.getSales({ limit: 100 });
      const activeRows = (res?.data || []).filter(s =>
        ['DRAFT', 'VALID', 'ERROR', 'POSTED'].includes(s.status)
      );
      if (activeRows.length) {
        setRows(activeRows.map(s => ({ ...s, _isNew: false })));
      } else {
        setRows([emptyRow()]);
      }
    } catch {}
  };

  const handleValidate = async () => {
    setActionLoading('validate');
    try {
      // Save unsaved rows first
      await saveAll();
      const res = await sales.validateSales();
      if (res?.errors?.length) {
        setValidationErrors(res.errors);
      } else {
        setValidationErrors([]);
      }
      await loadSales();
    } catch (err) {
      console.error('Validate error:', err);
    } finally {
      setActionLoading('');
    }
  };

  const handleSubmit = async () => {
    setActionLoading('submit');
    try {
      const res = await sales.submitSales();
      if (res?.posted_count) {
        setValidationErrors([]);
        await loadSales();
      }
    } catch (err) {
      console.error('Submit error:', err);
    } finally {
      setActionLoading('');
    }
  };

  const handleReopen = async () => {
    setActionLoading('reopen');
    try {
      const postedIds = rows.filter(r => r.status === 'POSTED' && r._id).map(r => r._id);
      if (postedIds.length) {
        await sales.reopenSales(postedIds);
        await loadSales();
      }
    } catch (err) {
      console.error('Reopen error:', err);
    } finally {
      setActionLoading('');
    }
  };

  const hasPosted = rows.some(r => r.status === 'POSTED');
  const hasDraftOrError = rows.some(r => r.status === 'DRAFT' || r.status === 'ERROR');
  const allValid = rows.length > 0 && rows.every(r => r.status === 'VALID' || r.status === 'POSTED');

  return (
    <div className="admin-page erp-page sales-entry-page">
      <style>{pageStyles}</style>
      <Navbar />
      <div className="admin-layout">
        <Sidebar />
        <main className="sales-main">
          <div className="sales-header">
            <h1>Sales Entry</h1>
            <div className="sales-actions">
              <button className="btn btn-primary" onClick={() => setScanModalOpen(true)} style={{ background: '#7c3aed' }}>📷 Scan CSI</button>
              <button className="btn btn-outline" onClick={addRow}>+ Add Row</button>
              <button className="btn btn-primary" onClick={saveAll} disabled={actionLoading === 'save'}>
                {actionLoading === 'save' ? 'Saving...' : 'Save Drafts'}
              </button>
              <button className="btn btn-warning" onClick={handleValidate} disabled={!hasDraftOrError || !!actionLoading}>
                {actionLoading === 'validate' ? 'Validating...' : 'Validate Sales'}
              </button>
              <button className="btn btn-success" onClick={handleSubmit} disabled={!allValid || !!actionLoading}>
                {actionLoading === 'submit' ? 'Submitting...' : 'Submit Sales'}
              </button>
              {hasPosted && (
                <button className="btn btn-danger" onClick={handleReopen} disabled={!!actionLoading}>
                  {actionLoading === 'reopen' ? 'Reopening...' : 'Re-open'}
                </button>
              )}
            </div>
          </div>

          {/* Desktop Table */}
          <div className="sales-grid sales-table-wrapper">
            <table className="sales-table">
              <thead>
                <tr>
                  <th style={{ width: 30 }}>#</th>
                  <th style={{ width: 200 }}>Hospital</th>
                  <th style={{ width: 120 }}>CSI Date</th>
                  <th style={{ width: 100 }}>CSI #</th>
                  <th style={{ width: 200 }}>Product</th>
                  <th style={{ width: 180 }}>Batch / Expiry</th>
                  <th style={{ width: 70 }}>Qty</th>
                  <th style={{ width: 70 }}>Unit</th>
                  <th style={{ width: 90 }}>Unit Price</th>
                  <th style={{ width: 100 }}>Line Total</th>
                  <th style={{ width: 80 }}>Status</th>
                  <th style={{ width: 40 }}></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <tr key={row._id || row._tempId}>
                    <td style={{ color: 'var(--erp-muted)', fontSize: 12 }}>{idx + 1}</td>
                    <td>
                      <select value={row.hospital_id?._id || row.hospital_id || ''} onChange={e => updateRow(idx, 'hospital_id', e.target.value)} disabled={row.status === 'POSTED'}>
                        <option value="">Select hospital...</option>
                        {hospitals.map(h => (
                          <option key={h._id} value={h._id}>{h.hospital_name_display || h.hospital_name}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input type="date" value={row.csi_date ? (typeof row.csi_date === 'string' ? row.csi_date.split('T')[0] : new Date(row.csi_date).toISOString().split('T')[0]) : ''} onChange={e => updateRow(idx, 'csi_date', e.target.value)} disabled={row.status === 'POSTED'} />
                    </td>
                    <td>
                      <input value={row.doc_ref || ''} onChange={e => updateRow(idx, 'doc_ref', e.target.value)} placeholder="CSI#" disabled={row.status === 'POSTED'} />
                    </td>
                    <td>
                      {row.line_items?.map((item, li) => (
                        <div key={li}>
                          <select value={item.product_id?._id || item.product_id || ''} onChange={e => updateLineItem(idx, li, 'product_id', e.target.value)} disabled={row.status === 'POSTED'}>
                            <option value="">Select product...</option>
                            {productOptions.map(p => (
                              <option key={p.product_id} value={p.product_id}>
                                {p.label}
                              </option>
                            ))}
                          </select>
                          {item.product_id && productOptions.find(p => (p.product_id?.toString() || p.product_id) === (item.product_id?.toString() || item.product_id))?.near_expiry && (
                            <span className="near-expiry-badge">Near Expiry</span>
                          )}
                        </div>
                      ))}
                    </td>
                    <td>
                      {row.line_items?.map((item, li) => {
                        const prod = item.product_id ? productOptions.find(p => (p.product_id?.toString() || p.product_id) === (item.product_id?.toString() || item.product_id)) : null;
                        const batches = prod?.batches || [];
                        if (!item.product_id || batches.length === 0) return <div key={li} className="readonly" style={{ fontSize: 11, padding: '6px 8px', color: 'var(--erp-muted)' }}>Select product first</div>;
                        if (batches.length === 1) return <div key={li} style={{ fontSize: 11, padding: '4px 0' }}><span className="batch-single">{batches[0].batch_lot_no}</span> <span style={{ color: 'var(--erp-muted)' }}>Exp: {new Date(batches[0].expiry_date).toLocaleDateString()}</span></div>;
                        return (
                          <div key={li}>
                            <select value={item.batch_lot_no || ''} onChange={e => updateLineItem(idx, li, 'batch_lot_no', e.target.value)} disabled={row.status === 'POSTED'} className="batch-select">
                              <option value="">Auto (FIFO)</option>
                              {batches.map((b, bi) => (
                                <option key={bi} value={b.batch_lot_no}>
                                  {b.batch_lot_no} — Exp: {new Date(b.expiry_date).toLocaleDateString()} — {b.available_qty} avail{b.near_expiry ? ' ⚠' : ''}{bi === 0 ? ' ★FIFO' : ''}
                                </option>
                              ))}
                            </select>
                            {item.fifo_override && (
                              <input className="override-reason" placeholder="Reason for skipping FIFO..." value={item.override_reason || ''} onChange={e => updateLineItem(idx, li, 'override_reason', e.target.value)} disabled={row.status === 'POSTED'} />
                            )}
                          </div>
                        );
                      })}
                    </td>
                    <td>
                      {row.line_items?.map((item, li) => (
                        <input key={li} type="number" min="1" value={item.qty || ''} onChange={e => updateLineItem(idx, li, 'qty', e.target.value)} disabled={row.status === 'POSTED'} />
                      ))}
                    </td>
                    <td>
                      {row.line_items?.map((item, li) => (
                        <input key={li} className="readonly" value={item.unit || ''} readOnly tabIndex={-1} />
                      ))}
                    </td>
                    <td>
                      {row.line_items?.map((item, li) => (
                        <input key={li} type="number" step="0.01" value={item.unit_price || ''} onChange={e => updateLineItem(idx, li, 'unit_price', e.target.value)} disabled={row.status === 'POSTED'} />
                      ))}
                    </td>
                    <td>
                      {row.line_items?.map((item, li) => (
                        <input key={li} className="readonly" value={computeLineTotal(item)} readOnly tabIndex={-1} />
                      ))}
                    </td>
                    <td>
                      <span className="status-badge" style={{ background: STATUS_COLORS[row.status]?.bg, color: STATUS_COLORS[row.status]?.text }}>
                        {STATUS_COLORS[row.status]?.label || row.status}
                      </span>
                    </td>
                    <td>
                      {row.status === 'DRAFT' && (
                        <button className="btn btn-danger btn-sm" onClick={() => removeRow(idx)} title="Remove row">&times;</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button className="add-row-btn" onClick={addRow}>+ Add Row</button>
          </div>

          {/* Mobile Cards */}
          <div className="sales-cards">
            {rows.map((row, idx) => (
              <div className="sale-card" key={row._id || row._tempId}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <span style={{ fontWeight: 700, fontSize: 14 }}>Row {idx + 1}</span>
                  <span className="status-badge" style={{ background: STATUS_COLORS[row.status]?.bg, color: STATUS_COLORS[row.status]?.text }}>
                    {STATUS_COLORS[row.status]?.label}
                  </span>
                </div>
                <label>Hospital</label>
                <select value={row.hospital_id?._id || row.hospital_id || ''} onChange={e => updateRow(idx, 'hospital_id', e.target.value)}>
                  <option value="">Select...</option>
                  {hospitals.map(h => <option key={h._id} value={h._id}>{h.hospital_name_display || h.hospital_name}</option>)}
                </select>
                <label>CSI Date</label>
                <input type="date" value={row.csi_date ? (typeof row.csi_date === 'string' ? row.csi_date.split('T')[0] : '') : ''} onChange={e => updateRow(idx, 'csi_date', e.target.value)} />
                <label>CSI #</label>
                <input value={row.doc_ref || ''} onChange={e => updateRow(idx, 'doc_ref', e.target.value)} />
                {row.line_items?.map((item, li) => {
                  const prod = item.product_id ? productOptions.find(p => (p.product_id?.toString() || p.product_id) === (item.product_id?.toString() || item.product_id)) : null;
                  const batches = prod?.batches || [];
                  return (
                  <div key={li}>
                    <label>Product</label>
                    <select value={item.product_id || ''} onChange={e => updateLineItem(idx, li, 'product_id', e.target.value)}>
                      <option value="">Select...</option>
                      {productOptions.map(p => <option key={p.product_id} value={p.product_id}>{p.label}</option>)}
                    </select>
                    {item.product_id && batches.length > 1 && (
                      <>
                        <label>Batch / Expiry</label>
                        <select value={item.batch_lot_no || ''} onChange={e => updateLineItem(idx, li, 'batch_lot_no', e.target.value)} className="batch-select">
                          <option value="">Auto (FIFO)</option>
                          {batches.map((b, bi) => (
                            <option key={bi} value={b.batch_lot_no}>
                              {b.batch_lot_no} — Exp: {new Date(b.expiry_date).toLocaleDateString()} — {b.available_qty} avail{b.near_expiry ? ' ⚠' : ''}{bi === 0 ? ' ★FIFO' : ''}
                            </option>
                          ))}
                        </select>
                        {item.fifo_override && (
                          <input className="override-reason" placeholder="Reason for skipping FIFO..." value={item.override_reason || ''} onChange={e => updateLineItem(idx, li, 'override_reason', e.target.value)} />
                        )}
                      </>
                    )}
                    {item.product_id && batches.length === 1 && (
                      <div style={{ fontSize: 12, color: 'var(--erp-muted)', padding: '4px 0' }}>Batch: {batches[0].batch_lot_no} — Exp: {new Date(batches[0].expiry_date).toLocaleDateString()}</div>
                    )}
                    <div style={{ display: 'flex', gap: 8 }}>
                      <div style={{ flex: 1 }}><label>Qty</label><input type="number" value={item.qty || ''} onChange={e => updateLineItem(idx, li, 'qty', e.target.value)} /></div>
                      <div style={{ flex: 1 }}><label>Price</label><input type="number" value={item.unit_price || ''} onChange={e => updateLineItem(idx, li, 'unit_price', e.target.value)} /></div>
                      <div style={{ flex: 1 }}><label>Total</label><input value={computeLineTotal(item)} readOnly /></div>
                    </div>
                  </div>
                  );
                })}
                {row.status === 'DRAFT' && (
                  <div className="card-footer">
                    <button className="btn btn-danger btn-sm" onClick={() => removeRow(idx)}>Delete</button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Validation Error Panel */}
          {validationErrors.length > 0 && (
            <div className="error-panel">
              <h3>Validation Errors ({validationErrors.length})</h3>
              <ul>
                {validationErrors.map((err, i) => (
                  <li key={i}>
                    <strong>CSI# {err.doc_ref || err.sale_id}:</strong>{' '}
                    {err.messages.join('; ')}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </main>
      </div>

      {/* Scan CSI Modal */}
      <ScanCSIModal
        open={scanModalOpen}
        onClose={() => setScanModalOpen(false)}
        onApply={handleScanApply}
        hospitals={hospitals}
        productOptions={productOptions}
      />
    </div>
  );
}
