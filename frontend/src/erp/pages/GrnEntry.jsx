import { useState, useEffect, useRef, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import { useAuth } from '../../hooks/useAuth';
import { ROLE_SETS } from '../../constants/roles';
import useGrn from '../hooks/useGrn';
import usePurchasing from '../hooks/usePurchasing';
import useProducts from '../hooks/useProducts';
import { processDocument, extractExifDateTime } from '../services/ocrService';
import WarehousePicker from '../components/WarehousePicker';

import SelectField from '../../components/common/Select';
import WorkflowGuide from '../components/WorkflowGuide';
import { showApprovalPending } from '../utils/errorToast';

const STATUS_COLORS = {
  PENDING: { bg: '#fef3c7', text: '#92400e', label: 'Pending' },
  APPROVED: { bg: '#dcfce7', text: '#166534', label: 'Approved' },
  REJECTED: { bg: '#fef2f2', text: '#991b1b', label: 'Rejected' }
};

const emptyLine = () => ({ product_id: '', batch_lot_no: '', expiry_date: '', qty: '' });

const pageStyles = `
  .grn-page { background: var(--erp-bg, #f4f7fb); min-height: 100vh; }
  .grn-main { flex: 1; min-width: 0; overflow-y: auto; -webkit-overflow-scrolling: touch; padding: 24px; max-width: 1280px; margin: 0 auto; }
  .grn-header { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 16px; flex-wrap: wrap; gap: 12px; }
  .grn-header h1 { font-size: 24px; color: var(--erp-text, #132238); margin: 0; }
  .grn-header p { margin: 4px 0 0; color: var(--erp-muted); font-size: 13px; line-height: 1.5; max-width: 720px; }
  .grn-actions { display: flex; gap: 8px; flex-wrap: wrap; }
  .grn-summary { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin: 0 0 16px; }
  .grn-summary-card { background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%); border: 1px solid var(--erp-border); border-radius: 16px; padding: 14px; box-shadow: 0 8px 18px rgba(15, 23, 42, 0.05); }
  .grn-summary-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--erp-muted); font-weight: 700; }
  .grn-summary-value { font-size: 24px; font-weight: 800; color: var(--erp-text); margin-top: 4px; }
  .grn-summary-sub { font-size: 12px; color: var(--erp-muted); margin-top: 2px; }
  .btn { padding: 8px 16px; border: none; border-radius: 10px; font-size: 13px; font-weight: 700; cursor: pointer; transition: all 0.15s; }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn-primary { background: var(--erp-accent, #1e5eff); color: #fff; }
  .btn-success { background: #16a34a; color: #fff; }
  .btn-danger { background: #dc2626; color: #fff; }
  .btn-outline { background: transparent; border: 1px solid var(--erp-border, #dbe4f0); color: var(--erp-text); }
  .btn-sm { padding: 4px 10px; font-size: 12px; }

  .grn-form { background: var(--erp-panel, #fff); border: 1px solid var(--erp-border); border-radius: 18px; padding: 20px; margin-bottom: 20px; box-shadow: 0 8px 18px rgba(15, 23, 42, 0.05); }
  .grn-form h2 { font-size: 16px; margin: 0 0 16px; color: var(--erp-text); }
  .grn-form-grid { display: grid; grid-template-columns: 1.1fr 0.6fr 1.3fr; gap: 12px; margin-bottom: 12px; }
  .form-row { display: flex; gap: 12px; margin-bottom: 12px; flex-wrap: wrap; }
  .form-group { flex: 1; min-width: 150px; }
  .form-group label { display: block; font-size: 11px; color: var(--erp-muted); font-weight: 600; text-transform: uppercase; margin-bottom: 4px; }
  .form-group input, .form-group select, .form-group textarea { width: 100%; padding: 8px 10px; border: 1px solid var(--erp-border); border-radius: 8px; font-size: 13px; background: var(--erp-panel); color: var(--erp-text); }
  .form-group textarea { resize: vertical; min-height: 60px; }
  .grn-line-header { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin: 14px 0 10px; flex-wrap: wrap; }
  .grn-line-header h3 { margin: 0; font-size: 14px; color: var(--erp-text); }
  .grn-line-header p { margin: 0; font-size: 12px; color: var(--erp-muted); }
  .grn-line-meta { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }
  .grn-chip { display: inline-flex; align-items: center; gap: 6px; padding: 6px 10px; background: #f8fafc; border: 1px solid var(--erp-border); border-radius: 999px; font-size: 12px; color: var(--erp-text); font-weight: 600; }

  .line-items-table { width: 100%; border-collapse: collapse; font-size: 13px; margin: 12px 0; table-layout: fixed; }
  .line-items-table col.col-product { width: 42%; }
  .line-items-table col.col-batch  { width: 22%; }
  .line-items-table col.col-expiry { width: 18%; }
  .line-items-table col.col-qty    { width: 10%; }
  .line-items-table col.col-remove { width: 8%; }
  .line-items-table th { background: var(--erp-bg); padding: 8px 10px; text-align: left; font-weight: 600; color: var(--erp-muted); font-size: 11px; text-transform: uppercase; }
  .line-items-table td { padding: 6px 8px; border-top: 1px solid var(--erp-border); vertical-align: middle; }
  .line-items-table input, .line-items-table select { width: 100%; padding: 6px 8px; border: 1px solid var(--erp-border); border-radius: 6px; font-size: 13px; }
  .add-line-btn { background: none; border: 2px dashed var(--erp-border); width: 100%; padding: 8px; text-align: center; color: var(--erp-accent); font-weight: 600; cursor: pointer; border-radius: 8px; }
  .btn-remove-line { background: none; border: none; color: #dc2626; cursor: pointer; font-size: 18px; line-height: 1; padding: 4px 6px; border-radius: 6px; transition: background 0.15s; }
  .btn-remove-line:hover { background: #fee2e2; }
  .line-items-mobile { display: none; }
  .line-item-card { background: #f8fafc; border: 1px solid var(--erp-border); border-radius: 14px; padding: 14px; }
  .line-item-card + .line-item-card { margin-top: 10px; }
  .line-item-card-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 10px; }
  .line-item-card-title { font-weight: 700; font-size: 13px; color: var(--erp-text); }
  .line-item-grid { display: grid; grid-template-columns: 1.5fr 1fr; gap: 10px; }
  .line-item-grid .form-group { min-width: 0; }

  .grn-list { background: var(--erp-panel); border: 1px solid var(--erp-border); border-radius: 12px; overflow: hidden; }
  .grn-list h2 { font-size: 16px; margin: 0; padding: 16px 20px 12px; color: var(--erp-text); }
  .filter-tabs { display: flex; gap: 0; padding: 0 20px; border-bottom: 1px solid var(--erp-border); overflow-x: auto; }
  .filter-tab { padding: 8px 16px; border: none; background: none; font-size: 13px; font-weight: 600; color: var(--erp-muted); cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -1px; white-space: nowrap; }
  .filter-tab.active { color: var(--erp-accent); border-bottom-color: var(--erp-accent); }
  .grn-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .grn-table th { padding: 10px 16px; text-align: left; font-weight: 600; color: var(--erp-muted); background: var(--erp-bg); }
  .grn-table td { padding: 10px 16px; border-top: 1px solid var(--erp-border); }
  .status-badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 600; }
  .grn-card-list { display: none; }
  .grn-card { background: var(--erp-panel); border: 1px solid var(--erp-border); border-radius: 12px; padding: 12px 14px; margin: 10px 12px 0; }
  .grn-card-header { display: flex; justify-content: space-between; gap: 10px; align-items: flex-start; }
  .grn-card-title { font-weight: 700; font-size: 14px; color: var(--erp-text); }
  .grn-card-sub { font-size: 12px; color: var(--erp-muted); }
  .grn-card-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 10px; }
  .grn-card-item { display: flex; flex-direction: column; gap: 2px; }
  .grn-card-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; color: #94a3b8; font-weight: 700; }
  .grn-card-value { font-size: 12px; color: var(--erp-text); }

  .scan-modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 1000; display: flex; align-items: center; justify-content: center; padding: 16px; }
  .scan-modal { background: var(--erp-panel, #fff); border-radius: 16px; width: 100%; max-width: 520px; max-height: 90vh; overflow-y: auto; padding: 24px; position: relative; }
  .scan-modal h2 { margin: 0 0 16px; font-size: 18px; }
  .scan-modal .close-btn { position: absolute; top: 12px; right: 16px; background: none; border: none; font-size: 22px; cursor: pointer; color: var(--erp-muted); }
  .scan-capture-btns { display: flex; gap: 10px; margin-bottom: 16px; }
  .scan-capture-btns .btn { flex: 1; text-align: center; padding: 12px; font-size: 14px; }
  .scan-preview { width: 100%; max-height: 200px; object-fit: contain; border-radius: 8px; margin-bottom: 16px; border: 1px solid var(--erp-border); }
  .scan-progress { text-align: center; padding: 24px 0; }
  .scan-progress .spinner { width: 36px; height: 36px; border: 3px solid var(--erp-border); border-top-color: var(--erp-accent); border-radius: 50%; animation: spin 0.8s linear infinite; margin: 0 auto 12px; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .scan-error { background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 12px; color: #991b1b; font-size: 13px; margin-bottom: 12px; }
  .scan-item-table { width: 100%; font-size: 12px; border-collapse: collapse; margin-top: 8px; }
  .scan-item-table th { text-align: left; padding: 4px 6px; background: var(--erp-bg); font-weight: 600; color: var(--erp-muted); }
  .scan-item-table td { padding: 4px 6px; border-top: 1px solid var(--erp-border); }
  .match-badge { display: inline-block; padding: 1px 6px; border-radius: 4px; font-size: 10px; font-weight: 600; margin-left: 6px; }
  .match-high { background: #dcfce7; color: #166534; }
  .match-medium { background: #fef3c7; color: #92400e; }
  .match-none { background: #fef2f2; color: #991b1b; }

  @media (max-width: 768px) {
    .grn-page { padding-top: 12px; }
    .grn-main { padding: 76px 12px 96px; }
    .grn-header { flex-direction: column; align-items: flex-start; }
    .grn-summary { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .grn-summary-value { font-size: 20px; }
    .grn-actions { width: 100%; }
    .grn-actions .btn { flex: 1; }
    .grn-form-grid { grid-template-columns: 1fr; }
    .form-row { flex-direction: column; }
    .form-group { min-width: 100%; }
    .grn-form { padding: 16px; }
    .line-items-table { display: none; }
    .line-items-mobile { display: grid; gap: 10px; margin-top: 12px; }
    .line-item-grid { grid-template-columns: 1fr; }
    .line-item-card .btn-remove-line { width: 100%; border: 1px solid #fecaca; background: #fff5f5; font-size: 16px; padding: 10px; }
    .line-item-card input,
    .line-item-card .vip-select__control {
      border: 1px solid #cbd5f5;
      background: #ffffff;
      box-shadow: 0 1px 2px rgba(15, 23, 42, 0.06);
    }
    .grn-list { overflow: hidden; }
    .grn-table { font-size: 12px; }
    .grn-table th,
    .grn-table td { white-space: nowrap; }
    .grn-table { display: none; }
    .grn-card-list { display: grid; gap: 10px; padding: 0 0 12px; }
    .filter-tabs { background: #e8efff; border-radius: 999px; padding: 4px; gap: 4px; overflow: hidden; }
    .filter-tab { padding: 6px 12px; border-radius: 999px; font-size: 12px; }
    .filter-tab.active { background: #ffffff; box-shadow: 0 4px 10px rgba(15, 23, 42, 0.08); }
  }

  @media (max-width: 480px) {
    .grn-page { padding-top: 16px; }
    .grn-main { padding-top: 72px; padding-bottom: 104px; }
    .grn-summary { grid-template-columns: 1fr; }
    .grn-summary-card { padding: 12px; }
    .grn-summary-value { font-size: 18px; }
    .grn-form h2,
    .grn-list h2 { font-size: 15px; }
    .grn-card { margin: 10px 10px 0; }
    .grn-card-grid { grid-template-columns: 1fr; }
    .scan-capture-btns { flex-direction: column; }
    .scan-modal { padding: 18px 14px; }
    .scan-item-table { display: block; overflow-x: auto; }
  }
`;

function normalizeStr(s) { return (s || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }

function matchProduct(ocrBrand, ocrDosage, products) {
  if (!ocrBrand || !products?.length) return null;
  const cleaned = normalizeStr(ocrBrand);
  if (!cleaned) return null;
  let match = products.find(p => normalizeStr(p.brand_name) === cleaned);
  if (match) return { product: match, confidence: 'HIGH' };
  match = products.find(p => {
    const pn = normalizeStr(p.brand_name);
    return cleaned.includes(pn) || pn.includes(cleaned);
  });
  if (match) return { product: match, confidence: 'MEDIUM' };
  return null;
}

function fieldVal(f) {
  if (f == null) return '';
  if (typeof f === 'object' && 'value' in f) return f.value ?? '';
  return String(f);
}

// --- Scan Undertaking Modal ---
 
function ScanUndertakingModal({ open, onClose, onApply, products }) {
  const [step, setStep] = useState('capture');
  const [preview, setPreview] = useState(null);
  const [ocrData, setOcrData] = useState(null);
  const [matchedItems, setMatchedItems] = useState([]);
  const [errorMsg, setErrorMsg] = useState('');
  const cameraRef = useRef(null);
  const galleryRef = useRef(null);

  const reset = () => { if (preview) URL.revokeObjectURL(preview); setStep('capture'); setPreview(null); setOcrData(null); setMatchedItems([]); setErrorMsg(''); };
  const handleClose = () => { reset(); onClose(); };

  const handleFile = async (file) => {
    if (!file) return;
    setPreview(URL.createObjectURL(file));
    setStep('scanning');
    try {
      const exif = await extractExifDateTime(file);
      const result = await processDocument(file, 'UNDERTAKING', exif);
      setOcrData(result);
      const items = result.extracted?.line_items || [];
      const matched = items.map(item => {
        const brand = fieldVal(item.brand_name);
        const pMatch = matchProduct(brand, fieldVal(item.dosage), products);
        return {
          ocr_brand: brand, ocr_dosage: fieldVal(item.dosage),
          ocr_batch: fieldVal(item.batch_lot_no), ocr_expiry: fieldVal(item.expiry_date),
          ocr_qty: fieldVal(item.qty), product_match: pMatch
        };
      });
      setMatchedItems(matched);
      setStep('results');
    } catch (err) {
      setErrorMsg(err?.response?.data?.message || err.message || 'OCR failed');
      setStep('error');
    }
  };

  const handleApply = () => {
    const lines = matchedItems.map(mi => ({
      product_id: mi.product_match?.product?._id || '',
      batch_lot_no: mi.ocr_batch,
      expiry_date: mi.ocr_expiry ? (() => { const d = new Date(mi.ocr_expiry); return isNaN(d) ? '' : d.toISOString().split('T')[0]; })() : '',
      qty: String(parseFloat(mi.ocr_qty) || '')
    }));
    onApply(lines, { undertaking_attachment_id: ocrData?.attachment_id || null, undertaking_photo_url: ocrData?.s3_url || '' });
    handleClose();
  };

  if (!open) return null;
  return (
    <div className="scan-modal-overlay" onClick={handleClose}>
      <div className="scan-modal" onClick={e => e.stopPropagation()}>
        <button className="close-btn" onClick={handleClose}>&times;</button>
        <h2>Scan Undertaking</h2>
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={e => handleFile(e.target.files?.[0])} />
        <input ref={galleryRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => handleFile(e.target.files?.[0])} />

        {step === 'capture' && (
          <>
            <p style={{ fontSize: 13, color: 'var(--erp-muted)', marginBottom: 16 }}>Scan an Undertaking of Receipt to auto-fill product lines.</p>
            <div className="scan-capture-btns">
              <button className="btn btn-primary" onClick={() => cameraRef.current?.click()}>Take Photo</button>
              <button className="btn btn-outline" onClick={() => galleryRef.current?.click()}>Gallery</button>
            </div>
          </>
        )}
        {step === 'scanning' && (<>{preview && <img src={preview} alt="preview" className="scan-preview" />}<div className="scan-progress"><div className="spinner" /><div style={{ fontSize: 14, color: 'var(--erp-muted)' }}>Processing...</div></div></>)}
        {step === 'error' && (<>{preview && <img src={preview} alt="preview" className="scan-preview" />}<div className="scan-error">{errorMsg}</div><div className="scan-capture-btns"><button className="btn btn-primary" onClick={() => { reset(); cameraRef.current?.click(); }}>Retry</button><button className="btn btn-outline" onClick={handleClose}>Cancel</button></div></>)}
        {step === 'results' && (
          <>
            {preview && <img src={preview} alt="preview" className="scan-preview" />}
            {matchedItems.length > 0 && (
              <table className="scan-item-table">
                <thead><tr><th>Product (OCR)</th><th>Matched</th><th>Batch</th><th>Qty</th></tr></thead>
                <tbody>
                  {matchedItems.map((mi, i) => (
                    <tr key={i}>
                      <td>{mi.ocr_brand} {mi.ocr_dosage && <span style={{ color: 'var(--erp-muted)' }}>{mi.ocr_dosage}</span>}</td>
                      <td>{mi.product_match ? <><span>{mi.product_match.product.brand_name}</span><span className={`match-badge match-${mi.product_match.confidence.toLowerCase()}`}>{mi.product_match.confidence}</span></> : <span className="match-badge match-none">No match</span>}</td>
                      <td>{mi.ocr_batch || '—'}</td>
                      <td>{mi.ocr_qty || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button className="btn btn-success" onClick={handleApply} style={{ flex: 1 }}>Apply to GRN</button>
              <button className="btn btn-outline" onClick={reset}>Scan Another</button>
              <button className="btn btn-outline" onClick={handleClose}>Cancel</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
 

export default function GrnEntry() {
  const { user } = useAuth();
  const grn = useGrn();
  const purchasing = usePurchasing();
  const { products } = useProducts();
  const [searchParams, setSearchParams] = useSearchParams();

  const [warehouseId, setWarehouseId] = useState('');
  const [lineItems, setLineItems] = useState([emptyLine()]);
  const [grnDate, setGrnDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [grnList, setGrnList] = useState([]);
  const [listFilter, setListFilter] = useState('');
  const [scanOpen, setScanOpen] = useState(false);

  // PO cross-reference state
  const [linkedPO, setLinkedPO] = useState(null);       // full PO prefill data
  const [poLoading, setPOLoading] = useState(false);
  const [receivablePOs, setReceivablePOs] = useState([]); // dropdown options
  const [_scanMeta, setScanMeta] = useState({}); // eslint-disable-line no-unused-vars

  const productOptions = useMemo(() => (products || []).filter(p => p.is_active !== false), [products]);
  const grnStats = useMemo(() => {
    const total = grnList.length;
    const pending = grnList.filter(g => g.status === 'PENDING').length;
    const approved = grnList.filter(g => g.status === 'APPROVED').length;
    const rejected = grnList.filter(g => g.status === 'REJECTED').length;
    return { total, pending, approved, rejected };
  }, [grnList]);

  useEffect(() => { loadList(); }, [listFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load receivable POs for the dropdown
  useEffect(() => {
    purchasing.listPOs({ status: 'APPROVED,PARTIALLY_RECEIVED', limit: 200 })
      .then(res => setReceivablePOs(res?.data || []))
      .catch(() => setReceivablePOs([]));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-load PO from URL query param (?po_id=...)
  useEffect(() => {
    const poId = searchParams.get('po_id');
    if (poId) handleSelectPO(poId);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSelectPO = async (poId) => {
    if (!poId) { clearPO(); return; }
    setPOLoading(true);
    try {
      const res = await grn.getGrnForPO(poId);
      if (res?.data) {
        const d = res.data;
        setLinkedPO(d);
        if (d.warehouse_id?._id) setWarehouseId(d.warehouse_id._id);
        // Pre-fill line items from PO remaining receivable lines
        if (d.prefill_lines?.length) {
          setLineItems(d.prefill_lines.map(pl => ({
            product_id: pl.product_id || '',
            batch_lot_no: '',
            expiry_date: '',
            qty: String(pl.qty_remaining),
            po_line_index: pl.po_line_index,
            _po_qty_remaining: pl.qty_remaining
          })));
        }
      }
    } catch (err) {
      console.error('Failed to load PO for GRN:', err);
      setLinkedPO(null);
    }
    setPOLoading(false);
  };

  const clearPO = () => {
    setLinkedPO(null);
    setLineItems([emptyLine()]);
    setSearchParams({});
  };

  const loadList = async () => {
    try {
      const params = {};
      if (listFilter) params.status = listFilter;
      const res = await grn.getGrnList(params);
      if (res?.data) setGrnList(res.data);
    } catch (err) { console.error('[GrnEntry] load error:', err.message); }
  };

  const updateLine = (idx, field, value) => {
    setLineItems(prev => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], [field]: value };
      return updated;
    });
  };

  const addLine = () => setLineItems(prev => [...prev, emptyLine()]);
  const removeLine = (idx) => setLineItems(prev => prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx));

  const handleSubmit = async () => {
    const validLines = lineItems.filter(li => li.product_id && li.batch_lot_no && li.qty);
    if (!validLines.length) return;
    setSaving(true);
    try {
      await grn.createGrn({
        grn_date: grnDate,
        warehouse_id: warehouseId || undefined,
        po_id: linkedPO?.po_id || undefined,
        line_items: validLines.map(li => ({
          product_id: li.product_id,
          batch_lot_no: li.batch_lot_no,
          expiry_date: li.expiry_date || undefined,
          qty: parseFloat(li.qty),
          po_line_index: li.po_line_index != null ? li.po_line_index : undefined
        })),
        notes: notes || undefined
      });
      setLineItems([emptyLine()]);
      setNotes('');
      setLinkedPO(null);
      setSearchParams({});
      await loadList();
      // Refresh receivable POs (qty may have changed)
      purchasing.listPOs({ status: 'APPROVED,PARTIALLY_RECEIVED', limit: 200 })
        .then(res => setReceivablePOs(res?.data || []))
        .catch(() => {});
    } catch (err) { console.error('GRN save error:', err); }
    finally { setSaving(false); }
  };

  const handleApprove = async (id, action, reason) => {
    try {
      const res = await grn.approveGrn(id, action, reason);
      if (res?.approval_pending) { showApprovalPending(res.message); }
      await loadList();
    } catch (err) {
      if (err?.response?.data?.approval_pending) { showApprovalPending(err.response.data.message); await loadList(); }
      else console.error('GRN approve error:', err);
    }
  };

  const handleScanApply = (lines, meta) => {
    if (lines.length) setLineItems(lines.map(l => ({ ...emptyLine(), ...l })));
    if (meta?.undertaking_photo_url) setScanMeta({ undertaking_photo_url: meta.undertaking_photo_url, undertaking_attachment_id: meta.undertaking_attachment_id });
  };

  return (
    <div className="admin-page erp-page grn-page">
      <style>{pageStyles}</style>
      <Navbar />
      <div className="admin-layout">
        <Sidebar />
        <main className="grn-main">
          <WorkflowGuide pageKey="grn-entry" />
          <div className="grn-header">
            <div>
              <h1>Goods Received Notes</h1>
              <p>Select supplier and warehouse, add batch/expiry lines, then submit for approval. You can also OCR a delivery undertaking to auto-fill line items.</p>
            </div>
            <div className="grn-actions">
              <button className="btn btn-primary" onClick={() => setScanOpen(true)} style={{ background: '#7c3aed' }}>Scan Undertaking</button>
            </div>
          </div>

          <div className="grn-summary">
            <div className="grn-summary-card">
              <div className="grn-summary-label">Total GRNs</div>
              <div className="grn-summary-value">{grnStats.total}</div>
              <div className="grn-summary-sub">All statuses combined</div>
            </div>
            <div className="grn-summary-card">
              <div className="grn-summary-label">Pending</div>
              <div className="grn-summary-value">{grnStats.pending}</div>
              <div className="grn-summary-sub">Waiting for review</div>
            </div>
            <div className="grn-summary-card">
              <div className="grn-summary-label">Approved</div>
              <div className="grn-summary-value">{grnStats.approved}</div>
              <div className="grn-summary-sub">Already posted to stock</div>
            </div>
            <div className="grn-summary-card">
              <div className="grn-summary-label">Rejected</div>
              <div className="grn-summary-value">{grnStats.rejected}</div>
              <div className="grn-summary-sub">Needs correction</div>
            </div>
          </div>

          {/* GRN Entry Form */}
          <div className="grn-form">
            <h2>New GRN</h2>

            {/* PO Selector — link GRN to a Purchase Order (optional) */}
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', marginBottom: 14, flexWrap: 'wrap' }}>
              <div className="form-group" style={{ flex: 2, minWidth: 220 }}>
                <label>Link to Purchase Order (optional)</label>
                <SelectField value={linkedPO?.po_id || ''} onChange={e => handleSelectPO(e.target.value)} disabled={poLoading}>
                  <option value="">— No PO (standalone GRN) —</option>
                  {receivablePOs.map(po => (
                    <option key={po._id} value={po._id}>
                      {po.po_number || po._id.slice(-6)} — {po.vendor_id?.vendor_name || 'Unknown Vendor'} ({po.status?.replace(/_/g, ' ')})
                    </option>
                  ))}
                </SelectField>
              </div>
              {linkedPO && (
                <>
                  <div style={{ fontSize: 12, color: 'var(--erp-muted)', padding: '0 0 10px' }}>
                    <strong>Vendor:</strong> {linkedPO.vendor_id?.vendor_name || '—'} &nbsp;|&nbsp;
                    <strong>PO#:</strong> {linkedPO.po_number || '—'}
                  </div>
                  <button className="btn btn-outline btn-sm" onClick={clearPO} style={{ marginBottom: 6 }}>Clear PO</button>
                </>
              )}
              {poLoading && <span style={{ fontSize: 12, color: 'var(--erp-muted)', padding: '0 0 10px' }}>Loading PO...</span>}
            </div>

            <div className="grn-form-grid">
              <div className="form-group">
                <WarehousePicker value={warehouseId} onChange={setWarehouseId} filterGrn />
              </div>
              <div className="form-group">
                <label>GRN Date</label>
                <input type="date" value={grnDate} onChange={e => setGrnDate(e.target.value)} />
              </div>
              <div className="form-group" style={{ flex: 2 }}>
                <label>Notes</label>
                <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional notes..." />
              </div>
            </div>

            <div className="grn-line-header">
              <div>
                <h3>Line Items</h3>
                <p>Add the products received, together with batch and expiry details.</p>
              </div>
              <div className="grn-line-meta">
                <span className="grn-chip">{lineItems.length} line(s)</span>
                <span className="grn-chip">Qty required before submit</span>
              </div>
            </div>

            <table className="line-items-table">
              <colgroup>
                <col className="col-product" /><col className="col-batch" />
                <col className="col-expiry" /><col className="col-qty" /><col className="col-remove" />
              </colgroup>
              <thead>
                <tr><th>Product</th><th>Batch/Lot #</th><th>Expiry</th><th>Qty</th><th></th></tr>
              </thead>
              <tbody>
                {lineItems.map((li, idx) => (
                  <tr key={idx}>
                    <td>
                      <SelectField value={li.product_id} onChange={e => updateLine(idx, 'product_id', e.target.value)}>
                        <option value="">Select product...</option>
                        {productOptions.map(p => <option key={p._id} value={p._id}>{p.brand_name}{p.dosage_strength ? ` ${p.dosage_strength}` : ''} — {p.unit_code || 'PC'}</option>)}
                      </SelectField>
                    </td>
                    <td><input value={li.batch_lot_no} onChange={e => updateLine(idx, 'batch_lot_no', e.target.value)} placeholder="Batch #" /></td>
                    <td><input type="date" value={li.expiry_date} onChange={e => updateLine(idx, 'expiry_date', e.target.value)} /></td>
                    <td>
                      <input type="number" min="1" max={li._po_qty_remaining || undefined} value={li.qty} onChange={e => updateLine(idx, 'qty', e.target.value)} placeholder="Qty" />
                      {li._po_qty_remaining != null && <div style={{ fontSize: 10, color: '#92400e', marginTop: 2 }}>max: {li._po_qty_remaining}</div>}
                    </td>
                    <td style={{ textAlign: 'center' }}><button className="btn-remove-line" onClick={() => removeLine(idx)} title="Remove line">×</button></td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="line-items-mobile">
              {lineItems.map((li, idx) => (
                <div className="line-item-card" key={`mobile-line-${idx}`}>
                  <div className="line-item-card-head">
                    <div className="line-item-card-title">Line {idx + 1}</div>
                    <button className="btn-remove-line" onClick={() => removeLine(idx)} title="Remove line">×</button>
                  </div>
                  <div className="line-item-grid">
                    <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                      <label>Product</label>
                      <SelectField value={li.product_id} onChange={e => updateLine(idx, 'product_id', e.target.value)}>
                        <option value="">Select product...</option>
                        {productOptions.map(p => <option key={p._id} value={p._id}>{p.brand_name}{p.dosage_strength ? ` ${p.dosage_strength}` : ''} — {p.unit_code || 'PC'}</option>)}
                      </SelectField>
                    </div>
                    <div className="form-group">
                      <label>Batch/Lot #</label>
                      <input value={li.batch_lot_no} onChange={e => updateLine(idx, 'batch_lot_no', e.target.value)} placeholder="Batch #" />
                    </div>
                    <div className="form-group">
                      <label>Expiry</label>
                      <input type="date" value={li.expiry_date} onChange={e => updateLine(idx, 'expiry_date', e.target.value)} />
                    </div>
                    <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                      <label>Qty</label>
                      <input type="number" min="1" value={li.qty} onChange={e => updateLine(idx, 'qty', e.target.value)} placeholder="Qty" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <button className="add-line-btn" onClick={addLine}>+ Add Line</button>

            <div style={{ marginTop: 16, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
                {saving ? 'Submitting...' : 'Submit GRN (Pending Approval)'}
              </button>
            </div>
          </div>

          {/* GRN List */}
          <div className="grn-list">
            <h2>GRN History</h2>
            <p style={{ margin: '0 20px 12px', color: 'var(--erp-muted)', fontSize: 12 }}>Toggle between status filters to review pending, approved, and rejected receipts.</p>
            <div className="filter-tabs">
              {['', 'PENDING', 'APPROVED', 'REJECTED'].map(f => (
                <button key={f} className={`filter-tab ${listFilter === f ? 'active' : ''}`} onClick={() => setListFilter(f)}>
                  {f || 'All'}
                </button>
              ))}
            </div>
              <table className="grn-table">
                <thead>
                  <tr><th>Date</th><th>PO Ref</th><th>Vendor</th><th>Items</th><th>BDM</th><th>Status</th><th>Reviewed By</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {grnList.map(g => (
                    <tr key={g._id}>
                      <td>{new Date(g.grn_date).toLocaleDateString('en-PH')}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{g.po_number || '—'}</td>
                      <td>{g.vendor_id?.vendor_name || '—'}</td>
                      <td>{g.line_items?.length || 0} item(s)</td>
                      <td>{g.bdm_id?.name || '—'}</td>
                      <td>
                        <span className="status-badge" style={{ background: STATUS_COLORS[g.status]?.bg, color: STATUS_COLORS[g.status]?.text }}>
                          {STATUS_COLORS[g.status]?.label}
                        </span>
                      </td>
                      <td>{g.reviewed_by?.name || '—'}</td>
                      <td>
                        {g.status === 'PENDING' && (ROLE_SETS.MANAGEMENT.includes(user?.role)) && (
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button className="btn btn-success btn-sm" onClick={() => handleApprove(g._id, 'APPROVED')}>Approve</button>
                            <button className="btn btn-danger btn-sm" onClick={() => handleApprove(g._id, 'REJECTED', prompt('Rejection reason:') || '')}>Reject</button>
                          </div>
                        )}
                        {g.status === 'REJECTED' && g.rejection_reason && (
                          <span style={{ fontSize: 12, color: '#991b1b' }}>{g.rejection_reason}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {!grnList.length && <tr><td colSpan={8} style={{ textAlign: 'center', padding: 40, color: 'var(--erp-muted)' }}>No GRNs found</td></tr>}
                </tbody>
              </table>

              <div className="grn-card-list">
                {grnList.map(g => (
                  <div key={g._id} className="grn-card">
                    <div className="grn-card-header">
                      <div>
                        <div className="grn-card-title">{new Date(g.grn_date).toLocaleDateString('en-PH')}</div>
                        <div className="grn-card-sub">{g.line_items?.length || 0} item(s)</div>
                      </div>
                      <span className="status-badge" style={{ background: STATUS_COLORS[g.status]?.bg, color: STATUS_COLORS[g.status]?.text }}>
                        {STATUS_COLORS[g.status]?.label}
                      </span>
                    </div>

                    <div className="grn-card-grid">
                      {g.po_number && (
                        <div className="grn-card-item">
                          <span className="grn-card-label">PO Ref</span>
                          <span className="grn-card-value" style={{ fontFamily: 'monospace' }}>{g.po_number}</span>
                        </div>
                      )}
                      {g.vendor_id?.vendor_name && (
                        <div className="grn-card-item">
                          <span className="grn-card-label">Vendor</span>
                          <span className="grn-card-value">{g.vendor_id.vendor_name}</span>
                        </div>
                      )}
                      <div className="grn-card-item">
                        <span className="grn-card-label">BDM</span>
                        <span className="grn-card-value">{g.bdm_id?.name || '—'}</span>
                      </div>
                      <div className="grn-card-item">
                        <span className="grn-card-label">Reviewed By</span>
                        <span className="grn-card-value">{g.reviewed_by?.name || '—'}</span>
                      </div>
                    </div>

                    {g.status === 'REJECTED' && g.rejection_reason && (
                      <div style={{ marginTop: 8, fontSize: 12, color: '#991b1b' }}>{g.rejection_reason}</div>
                    )}

                    {g.status === 'PENDING' && (ROLE_SETS.MANAGEMENT.includes(user?.role)) && (
                      <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                        <button className="btn btn-success btn-sm" style={{ flex: 1 }} onClick={() => handleApprove(g._id, 'APPROVED')}>Approve</button>
                        <button className="btn btn-danger btn-sm" style={{ flex: 1 }} onClick={() => handleApprove(g._id, 'REJECTED', prompt('Rejection reason:') || '')}>Reject</button>
                      </div>
                    )}
                  </div>
                ))}
                {!grnList.length && (
                  <div className="grn-card" style={{ textAlign: 'center', color: 'var(--erp-muted)' }}>
                    No GRNs found
                  </div>
                )}
              </div>
          </div>
        </main>
      </div>
      <ScanUndertakingModal open={scanOpen} onClose={() => setScanOpen(false)} onApply={handleScanApply} products={productOptions} />
    </div>
  );
}
