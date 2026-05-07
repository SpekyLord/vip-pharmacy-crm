/**
 * GrnEntry — Phase 32R capture surface
 *
 * The BDM captures a Goods Received Note here:
 *   1. Link to PO/internal-transfer (optional — auto-fills products + expected qty)
 *   2. Per-line: product dropdown (standalone) OR auto-filled, received qty,
 *      batch/lot # (OCR-autofilled via the bulk paper scan, or typed from the
 *      packaging label), expiry date (calendar picker, floor = today + MIN_EXPIRY_DAYS)
 *   3. Doc-level: waybill photo upload (required — courier delivery evidence)
 *   4. Optional: "OCR Undertaking Paper" button bulk-fills all lines from the
 *      scanned physical Undertaking — unmatched OCR rows are surfaced so the
 *      BDM can manually complete them before submitting.
 *   5. Save & Validate → backend gates batch+expiry+waybill → auto-creates a
 *      DRAFT Undertaking and deep-links the BDM there for a double-check +
 *      Validate & Submit.
 */
import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import { useAuth } from '../../hooks/useAuth';
import { ROLE_SETS } from '../../constants/roles';
import useGrn from '../hooks/useGrn';
import usePurchasing from '../hooks/usePurchasing';
import useProducts from '../hooks/useProducts';
import { processDocument, processDocumentFromCapture, extractExifDateTime } from '../services/ocrService';
import { getGrnSettings } from '../services/undertakingService';
import WarehousePicker from '../components/WarehousePicker';
import OwnerPicker from '../components/OwnerPicker';
// Phase P1.2 Slice 7-extension (May 2026) — pull a BDM-captured GRN /
// UNCATEGORIZED photo (Undertaking paper) into the existing Scan Undertaking
// flow without re-uploading. Picker hands a File to ScanUndertakingModal via
// the initialFile prop and the modal auto-runs OCR on mount.
import PendingCapturesPicker from '../components/PendingCapturesPicker';

import SelectField from '../../components/common/Select';
import WorkflowGuide from '../components/WorkflowGuide';
import RejectionBanner from '../components/RejectionBanner';
import { showApprovalPending, showSuccess, showError } from '../utils/errorToast';

const STATUS_COLORS = {
  PENDING: { bg: '#fef3c7', text: '#92400e', label: 'Pending' },
  APPROVED: { bg: '#dcfce7', text: '#166534', label: 'Approved' },
  REJECTED: { bg: '#fef2f2', text: '#991b1b', label: 'Rejected' }
};

const emptyLine = () => ({ product_id: '', batch_lot_no: '', expiry_date: '', qty: '', scan_confirmed: false });

const pageStyles = `
  .grn-page { background: var(--erp-bg, #f4f7fb); min-height: 100vh; }
  .grn-main { flex: 1; min-width: 0; padding: 24px; max-width: 1280px; margin: 0 auto; }
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
  .grn-chip.scan-ok { color: #166534; background: #dcfce7; border-color: #86efac; }

  .waybill-panel { background: #f8fafc; border: 1px dashed #cbd5f5; border-radius: 12px; padding: 14px; margin: 12px 0; display: flex; gap: 12px; align-items: flex-start; flex-wrap: wrap; }
  .waybill-panel .waybill-info { flex: 1; min-width: 200px; }
  .waybill-panel label.waybill-label { font-size: 11px; color: var(--erp-muted); font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; }
  .waybill-panel .waybill-desc { font-size: 12px; color: var(--erp-muted); margin: 4px 0; }
  .waybill-thumb { max-width: 120px; max-height: 90px; border-radius: 8px; border: 1px solid var(--erp-border); cursor: zoom-in; }
  .waybill-req { color: #dc2626; font-weight: 700; }

  .line-items-table { width: 100%; border-collapse: collapse; font-size: 13px; margin: 12px 0; table-layout: fixed; }
  .line-items-table col.col-product { width: 36%; }
  .line-items-table col.col-batch  { width: 20%; }
  .line-items-table col.col-expiry { width: 18%; }
  .line-items-table col.col-qty    { width: 10%; }
  .line-items-table col.col-remove { width: 8%; }
  .line-items-table th { background: var(--erp-bg); padding: 8px 10px; text-align: left; font-weight: 600; color: var(--erp-muted); font-size: 11px; text-transform: uppercase; }
  .line-items-table td { padding: 6px 8px; border-top: 1px solid var(--erp-border); vertical-align: middle; }
  .line-items-table input, .line-items-table select { width: 100%; padding: 6px 8px; border: 1px solid var(--erp-border); border-radius: 6px; font-size: 13px; }
  .line-items-table input.scan-ok { background: #f0fdf4; }
  .scan-tick { color: #16a34a; font-weight: 800; font-size: 14px; margin-left: 4px; }
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

function matchProduct(ocrBrand, _ocrDosage, products) {
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

function toIsoDate(str) {
  if (!str) return '';
  const d = new Date(str);
  if (isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * OCR Undertaking Paper modal.
 *
 * Bulk-fills every matched line from the scanned physical Undertaking paper.
 * Unmatched OCR rows are surfaced so the BDM can decide whether to retake the
 * photo or fall back to manual entry.
 */
function ScanUndertakingModal({ open, onClose, onApply, products, initialFile, initialCaptureId, initialPreviewUrl }) {
  const [step, setStep] = useState('capture');
  const [preview, setPreview] = useState(null);
  const [ocrData, setOcrData] = useState(null);
  const [matchedItems, setMatchedItems] = useState([]);
  const [errorMsg, setErrorMsg] = useState('');
  const cameraRef = useRef(null);
  const galleryRef = useRef(null);
  // Phase P1.2 Slice 7-extension — guard so a transient render during OCR
  // doesn't re-trigger handleFile on the same File from picker.
  const initialFileProcessedRef = useRef(null);
  // Phase P1.2 Slice 7-extension Round 2B (May 2026) — capture-id handoff
  // (server-side OCR, sidesteps CORS).
  const initialCaptureProcessedRef = useRef(null);

  const reset = () => {
    if (preview) URL.revokeObjectURL(preview);
    setStep('capture'); setPreview(null); setOcrData(null); setMatchedItems([]); setErrorMsg('');
  };
  const handleClose = () => { reset(); onClose(); };

  // Shared post-OCR matching used by both file-upload and capture-pull flows.
  const applyOcrResult = (result) => {
    setOcrData(result);
    const items = result?.extracted?.line_items || result?.extracted?.items || [];
    const matched = items.map(item => {
      const brand = fieldVal(item.brand_name || item.brand);
      const pMatch = matchProduct(brand, fieldVal(item.dosage), products);
      return {
        ocr_brand: brand,
        ocr_dosage: fieldVal(item.dosage),
        ocr_batch: fieldVal(item.batch_lot_no || item.batch),
        ocr_expiry: fieldVal(item.expiry_date || item.expiry),
        ocr_qty: fieldVal(item.qty),
        product_match: pMatch
      };
    });
    setMatchedItems(matched);
    setStep('results');
  };

  const handleFile = async (file) => {
    if (!file) return;
    setPreview(URL.createObjectURL(file));
    setStep('scanning');
    try {
      const exif = await extractExifDateTime(file);
      const result = await processDocument(file, 'UNDERTAKING', exif);
      applyOcrResult(result);
    } catch (err) {
      setErrorMsg(err?.response?.data?.message || err.message || 'OCR failed');
      setStep('error');
    }
  };

  // Phase P1.2 Slice 7-extension Round 2B — capture-pull mode.
  const handleCaptureScan = async (captureId, previewUrl) => {
    if (!captureId) return;
    if (previewUrl) setPreview(previewUrl);
    setStep('scanning');
    try {
      const result = await processDocumentFromCapture(captureId, 'UNDERTAKING');
      applyOcrResult(result);
    } catch (err) {
      setErrorMsg(err?.response?.data?.message || err.message || 'OCR failed');
      setStep('error');
    }
  };

  // Phase P1.2 Slice 7-extension — auto-OCR a File OR capture-id from picker.
  useEffect(() => {
    if (!open) {
      initialFileProcessedRef.current = null;
      initialCaptureProcessedRef.current = null;
      return;
    }
    if (initialCaptureId && initialCaptureProcessedRef.current !== initialCaptureId) {
      initialCaptureProcessedRef.current = initialCaptureId;
      handleCaptureScan(initialCaptureId, initialPreviewUrl);
      return;
    }
    if (initialFile && initialFileProcessedRef.current !== initialFile) {
      initialFileProcessedRef.current = initialFile;
      handleFile(initialFile);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialFile, initialCaptureId, initialPreviewUrl]);

  const handleApply = () => {
    const lines = matchedItems.map(mi => ({
      product_id: mi.product_match?.product?._id || '',
      batch_lot_no: (mi.ocr_batch || '').toUpperCase(),
      expiry_date: toIsoDate(mi.ocr_expiry),
      qty: String(parseFloat(mi.ocr_qty) || ''),
      scan_confirmed: !!(mi.product_match && mi.ocr_batch)
    }));
    onApply(lines, {
      undertaking_attachment_id: ocrData?.attachment_id || null,
      undertaking_photo_url: ocrData?.s3_url || '',
      // Phase P1.2 Slice 9 partial (Round 2B) — propagate the source capture
      // so createGrn can auto-finalize it after the row lands.
      capture_id: initialCaptureId || null
    });
    handleClose();
  };

  if (!open) return null;
  return (
    <div className="scan-modal-overlay" onClick={handleClose}>
      <div className="scan-modal" onClick={e => e.stopPropagation()}>
        <button className="close-btn" onClick={handleClose}>&times;</button>
        <h2>Scan Undertaking Paper</h2>
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={e => handleFile(e.target.files?.[0])} />
        <input ref={galleryRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => handleFile(e.target.files?.[0])} />

        {step === 'capture' && (
          <>
            <p style={{ fontSize: 13, color: 'var(--erp-muted)', marginBottom: 16 }}>
              Take a photo of the physical Undertaking of Receipt. We&apos;ll auto-fill every matched product line with batch, expiry, and qty.
            </p>
            <div className="scan-capture-btns">
              <button className="btn btn-primary" onClick={() => cameraRef.current?.click()}>Take Photo</button>
              <button className="btn btn-outline" onClick={() => galleryRef.current?.click()}>Gallery</button>
            </div>
          </>
        )}
        {step === 'scanning' && (
          <>
            {preview && <img src={preview} alt="preview" className="scan-preview" />}
            <div className="scan-progress"><div className="spinner" /><div style={{ fontSize: 14, color: 'var(--erp-muted)' }}>Processing…</div></div>
          </>
        )}
        {step === 'error' && (
          <>
            {preview && <img src={preview} alt="preview" className="scan-preview" />}
            <div className="scan-error">{errorMsg}</div>
            <div className="scan-capture-btns">
              <button className="btn btn-primary" onClick={() => { reset(); cameraRef.current?.click(); }}>Retry</button>
              <button className="btn btn-outline" onClick={handleClose}>Cancel</button>
            </div>
          </>
        )}
        {step === 'results' && (
          <>
            {preview && <img src={preview} alt="preview" className="scan-preview" />}
            {matchedItems.length > 0 ? (
              <table className="scan-item-table">
                <thead><tr><th>Product (OCR)</th><th>Matched</th><th>Batch</th><th>Expiry</th><th>Qty</th></tr></thead>
                <tbody>
                  {matchedItems.map((mi, i) => (
                    <tr key={i}>
                      <td>{mi.ocr_brand} {mi.ocr_dosage && <span style={{ color: 'var(--erp-muted)' }}>{mi.ocr_dosage}</span>}</td>
                      <td>
                        {mi.product_match
                          ? <><span>{mi.product_match.product.brand_name}</span><span className={`match-badge match-${mi.product_match.confidence.toLowerCase()}`}>{mi.product_match.confidence}</span></>
                          : <span className="match-badge match-none">No match</span>}
                      </td>
                      <td>{mi.ocr_batch || '—'}</td>
                      <td>{mi.ocr_expiry || '—'}</td>
                      <td>{mi.ocr_qty || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div style={{ fontSize: 13, color: 'var(--erp-muted)', padding: '8px 0' }}>
                OCR completed but no line items parsed. You can still apply the photo as supporting evidence and fill in the lines manually.
              </div>
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
  const navigate = useNavigate();

  const [warehouseId, setWarehouseId] = useState('');
  // Phase G4.5b — Proxy Entry. Empty = self; otherwise target BDM's User._id.
  // OwnerPicker only renders for eligible proxies (PROXY_ENTRY_ROLES.GRN role
  // + inventory.grn_proxy_entry sub-perm). Backend also cross-checks that the
  // target BDM is in Warehouse.assigned_users for the selected warehouse.
  const [assignedTo, setAssignedTo] = useState('');
  const [lineItems, setLineItems] = useState([emptyLine()]);
  const [grnDate, setGrnDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [grnList, setGrnList] = useState([]);
  const [listFilter, setListFilter] = useState('');
  const [scanOpen, setScanOpen] = useState(false);
  // Phase P1.2 Slice 7-extension — File handed to ScanUndertakingModal by
  // PendingCapturesPicker. Cleared on close so re-opening returns to the
  // normal Take-Photo / Gallery capture step.
  const [scanInitialFile, setScanInitialFile] = useState(null);
  // Phase P1.2 Slice 7-extension Round 2B — capture-id handoff (skipFetch).
  const [scanInitialCaptureId, setScanInitialCaptureId] = useState(null);
  const [scanInitialPreviewUrl, setScanInitialPreviewUrl] = useState(null);

  // PO cross-reference state
  const [linkedPO, setLinkedPO] = useState(null);
  const [poLoading, setPOLoading] = useState(false);
  const [receivablePOs, setReceivablePOs] = useState([]);

  // Waybill + OCR paper attachment state
  const [waybillPhotoUrl, setWaybillPhotoUrl] = useState('');
  const [waybillPreview, setWaybillPreview] = useState('');
  const [waybillUploading, setWaybillUploading] = useState(false);
  const [undertakingPhotoUrl, setUndertakingPhotoUrl] = useState('');
  const [ocrData, setOcrData] = useState(null);
  // Phase P1.2 Slice 9 partial (Round 2B) — track the source CaptureSubmission
  // _id so createGrn can auto-finalize after the row lands. Set by handleScanApply
  // when ScanUndertakingModal returns capture_id; reset after submit.
  const [pendingCaptureId, setPendingCaptureId] = useState(null);

  // Per-entity capture settings (expiry floor, variance tolerance, waybill required)
  const [grnSettings, setGrnSettings] = useState({ minExpiryDays: 30, varianceTolerancePct: 10, waybillRequired: true, requireBatch: true, requireExpiry: true });

  const waybillCameraRef = useRef(null);
  const waybillGalleryRef = useRef(null);

  const productOptions = useMemo(() => (products || []).filter(p => p.is_active !== false), [products]);
  const grnStats = useMemo(() => {
    const total = grnList.length;
    const pending = grnList.filter(g => g.status === 'PENDING').length;
    const approved = grnList.filter(g => g.status === 'APPROVED').length;
    const rejected = grnList.filter(g => g.status === 'REJECTED').length;
    return { total, pending, approved, rejected };
  }, [grnList]);

  const expiryFloor = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + (Number(grnSettings.minExpiryDays) || 0));
    return toIsoDate(d);
  }, [grnSettings.minExpiryDays]);

  const scannedCount = useMemo(() => lineItems.filter(l => l.scan_confirmed).length, [lineItems]);
  // Phase 32R-S1: batch/expiry required-ness is lookup-driven per entity.
  // Pharmacy defaults (requireBatch=true, requireExpiry=true) keep the original
  // gate. Non-pharmacy subscribers flip either off in Control Center → GRN
  // Settings and the form accepts blanks — backend sentinel-normalizes before
  // persist so FIFO + Undertaking mirror stay consistent.
  const allLinesComplete = useMemo(() => (
    lineItems.length > 0 &&
    lineItems.every(li =>
      li.product_id &&
      Number(li.qty) > 0 &&
      (!grnSettings.requireBatch  || String(li.batch_lot_no || '').trim()) &&
      (!grnSettings.requireExpiry || li.expiry_date)
    )
  ), [lineItems, grnSettings.requireBatch, grnSettings.requireExpiry]);
  const canSubmit = allLinesComplete && (!grnSettings.waybillRequired || !!waybillPhotoUrl) && !saving;

  useEffect(() => { loadList(); }, [listFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    getGrnSettings().then(setGrnSettings).catch(() => {});
  }, []);

  useEffect(() => {
    purchasing.listPOs({ status: 'APPROVED,PARTIALLY_RECEIVED', limit: 200 })
      .then(res => setReceivablePOs(res?.data || []))
      .catch(() => setReceivablePOs([]));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
        if (d.prefill_lines?.length) {
          setLineItems(d.prefill_lines.map(pl => ({
            product_id: pl.product_id || '',
            batch_lot_no: '',
            expiry_date: '',
            qty: String(pl.qty_remaining),
            po_line_index: pl.po_line_index,
            _po_qty_remaining: pl.qty_remaining,
            scan_confirmed: false
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
      const next = { ...updated[idx], [field]: value };
      // Manual edit of batch clears scan_confirmed so approver knows user overrode OCR
      if (field === 'batch_lot_no') next.scan_confirmed = false;
      updated[idx] = next;
      return updated;
    });
  };

  const addLine = () => setLineItems(prev => [...prev, emptyLine()]);
  const removeLine = (idx) => setLineItems(prev => prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx));

  const handleWaybillUpload = async (file) => {
    if (!file) return;
    setWaybillUploading(true);
    try {
      // Reuse the OCR endpoint in skip-OCR mode: WAYBILL isn't a parser docType,
      // so the backend uploads to S3 and returns the signed URL without running
      // OCR. Keeps us on one attachment pipeline (DocumentAttachment + S3).
      const res = await processDocument(file, 'WAYBILL');
      if (res?.s3_url) {
        setWaybillPhotoUrl(res.s3_url);
        setWaybillPreview(URL.createObjectURL(file));
        showSuccess('Waybill uploaded');
      } else {
        showError(null, 'Waybill upload did not return a URL — please retry');
      }
    } catch (err) {
      showError(err, 'Waybill upload failed');
    } finally {
      setWaybillUploading(false);
    }
  };

  const handleScanApply = (lines, meta) => {
    if (lines.length) {
      setLineItems(prev => {
        // Prefer to overlay OCR data onto existing lines by product match; if the
        // existing form only has the empty skeleton, just replace with OCR lines.
        const empty = prev.length === 1 && !prev[0].product_id;
        if (empty) {
          return lines.map(l => ({ ...emptyLine(), ...l }));
        }
        // Merge: keep prev lines, add OCR-matched lines that don't collide by product
        const existingPids = new Set(prev.map(p => p.product_id).filter(Boolean));
        const additions = lines.filter(l => l.product_id && !existingPids.has(l.product_id));
        const mergedExisting = prev.map(p => {
          const match = lines.find(l => l.product_id && l.product_id === p.product_id);
          return match
            ? {
                ...p,
                batch_lot_no: p.batch_lot_no || match.batch_lot_no || '',
                expiry_date: p.expiry_date || match.expiry_date || '',
                qty: p.qty || match.qty || '',
                scan_confirmed: match.scan_confirmed || p.scan_confirmed
              }
            : p;
        });
        return [...mergedExisting, ...additions].map(l => ({ ...emptyLine(), ...l }));
      });
    }
    if (meta?.undertaking_photo_url) {
      setUndertakingPhotoUrl(meta.undertaking_photo_url);
      setOcrData({ scanned_at: new Date().toISOString(), attachment_id: meta.undertaking_attachment_id });
    }
    // Phase P1.2 Slice 9 partial (Round 2B) — capture the source CaptureSubmission
    // _id so createGrn's payload below can auto-finalize after save.
    if (meta?.capture_id) setPendingCaptureId(meta.capture_id);
  };

  const handleSubmit = async () => {
    if (!canSubmit) {
      if (!allLinesComplete) {
        const missing = ['product', 'qty'];
        if (grnSettings.requireBatch) missing.push('batch/lot #');
        if (grnSettings.requireExpiry) missing.push('expiry');
        showError(null, `Every line needs: ${missing.join(', ')}.`);
        return;
      }
      if (grnSettings.waybillRequired && !waybillPhotoUrl) {
        showError(null, 'Waybill photo is required. Upload the courier delivery waybill to proceed.');
        return;
      }
      return;
    }
    setSaving(true);
    try {
      const res = await grn.createGrn({
        // Phase G4.5b — proxy entry: backend resolves this against
        // PROXY_ENTRY_ROLES.GRN lookup + inventory.grn_proxy_entry sub-perm and
        // throws 403 if the caller isn't eligible, 400 if the target BDM isn't
        // assigned to the selected warehouse. Self-entry when empty.
        assigned_to: assignedTo || undefined,
        grn_date: grnDate,
        warehouse_id: warehouseId || undefined,
        po_id: linkedPO?.po_id || undefined,
        line_items: lineItems.map(li => ({
          product_id: li.product_id,
          batch_lot_no: String(li.batch_lot_no || '').trim().toUpperCase(),
          expiry_date: li.expiry_date,
          qty: parseFloat(li.qty),
          scan_confirmed: !!li.scan_confirmed,
          po_line_index: li.po_line_index != null ? li.po_line_index : undefined
        })),
        waybill_photo_url: waybillPhotoUrl || undefined,
        undertaking_photo_url: undertakingPhotoUrl || undefined,
        ocr_data: ocrData || undefined,
        notes: notes || undefined,
        // Phase P1.2 Slice 9 partial (Round 2B) — auto-finalize the source
        // capture (set by handleScanApply when picker → modal flow ran).
        ...(pendingCaptureId ? { capture_id: pendingCaptureId } : {})
      });
      if (res?.approval_pending) { showApprovalPending(res.message); }
      // Reset form
      setLineItems([emptyLine()]);
      setNotes('');
      setLinkedPO(null);
      setSearchParams({});
      if (waybillPreview) URL.revokeObjectURL(waybillPreview);
      setWaybillPhotoUrl(''); setWaybillPreview('');
      setUndertakingPhotoUrl(''); setOcrData(null);
      setPendingCaptureId(null);
      await loadList();
      purchasing.listPOs({ status: 'APPROVED,PARTIALLY_RECEIVED', limit: 200 })
        .then(r => setReceivablePOs(r?.data || []))
        .catch(() => {});

      const ut = res?.undertaking;
      const grnLabel = res?.data?.grn_number ? `GRN ${res.data.grn_number}` : 'GRN';
      if (ut?._id) {
        showSuccess(`${grnLabel} captured. Review & submit Undertaking ${ut.undertaking_number} →`);
        setTimeout(() => navigate(`/erp/undertaking/${ut._id}`), 900);
      } else {
        showSuccess(res?.message || `${grnLabel} created.`);
      }
    } catch (err) {
      if (err?.response?.data?.approval_pending) { showApprovalPending(err.response.data.message); await loadList(); }
      else {
        const msg = err?.response?.data?.message || err.message || 'GRN save failed';
        const errors = err?.response?.data?.errors;
        if (Array.isArray(errors) && errors.length) {
          showError(null, `${msg}: ${errors.slice(0, 3).join('; ')}`);
        } else {
          showError(err, msg);
        }
      }
    } finally { setSaving(false); }
  };

  const handleApprove = async (id, action, reason) => {
    try {
      const res = await grn.approveGrn(id, action, reason);
      if (res?.approval_pending) { showApprovalPending(res.message); }
      else { showSuccess(res?.message || (action === 'APPROVED' ? 'GRN approved' : 'GRN rejected')); }
      await loadList();
    } catch (err) {
      // Phase 32R-GRN-Approve-UX (May 07 2026) — surface real backend errors
      // instead of swallowing them in console. The most common path is the
      // Phase 32R guard ("Undertaking is SUBMITTED — GRN posts only after
      // ACKNOWLEDGED") — when the backend ships the linked UT id we deep-link
      // the user there with one click.
      if (err?.response?.data?.approval_pending) {
        showApprovalPending(err.response.data.message);
        await loadList();
        return;
      }
      const data = err?.response?.data || {};
      const msg = data.message || err.message || 'GRN approve failed';
      if (data?.data?.undertaking_id) {
        showError(err, `${msg} — opening Undertaking…`);
        navigate(`/erp/undertaking/${data.data.undertaking_id}`);
        return;
      }
      const errors = data.errors;
      if (Array.isArray(errors) && errors.length) {
        showError(null, `${msg}: ${errors.slice(0, 3).join('; ')}`);
      } else {
        showError(err, msg);
      }
      await loadList();
    }
  };

  // Phase 32R-GRN-Approve-UX — Direct GRN approve is gated on the linked
  // Undertaking being ACKNOWLEDGED (controller enforces; only president
  // bypasses). Encode that here so the button reflects the real state instead
  // of misleading the user into clicking and seeing nothing.
  const isPresident = user?.role === 'president';
  const grnApproveState = (g) => {
    if (g.status !== 'PENDING') return { canApprove: false };
    if (isPresident) return { canApprove: true, hint: 'President bypass — direct GRN approve allowed' };
    const ut = g.undertaking;
    if (!ut) return { canApprove: false, hint: 'No linked Undertaking found yet — refresh shortly or contact admin' };
    if (ut.status === 'ACKNOWLEDGED') return { canApprove: true, hint: `Undertaking ${ut.undertaking_number} is ACKNOWLEDGED` };
    return {
      canApprove: false,
      hint: `Approve via Undertaking ${ut.undertaking_number} (currently ${ut.status})`,
      undertaking_id: ut._id,
    };
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
              <p>
                Capture the receipt: pick products, enter qty, scan the paper Undertaking to auto-fill batch &amp; expiry (or type them from the packaging label + calendar picker), upload the courier waybill, and submit. We&apos;ll auto-create the Undertaking for you to double-check and route for approval.
              </p>
            </div>
            <div className="grn-actions">
              <button className="btn btn-primary" onClick={() => setScanOpen(true)} style={{ background: '#7c3aed' }}>Scan Undertaking Paper</button>
              {/* Phase P1.2 Slice 7-extension — pull a BDM-captured Undertaking
                  photo into the same OCR flow without re-uploading.
                  Phase P1.2 Slice 6.2 follow-up (Phase 2.1) — narrow the GRN
                  feed to sub_type='BATCH_PHOTO' so the OCR picker no longer
                  surfaces WAYBILL captures (those go to the waybill panel
                  picker below). UNCATEGORIZED stays unfiltered as a fallback
                  for Quick Capture rows the proxy hasn't classified yet. */}
              <PendingCapturesPicker
                workflowTypes={['GRN', 'UNCATEGORIZED']}
                subTypeFilter={{ GRN: 'BATCH_PHOTO' }}
                bdmId={assignedTo || undefined}
                maxSelect={1}
                skipFetch
                buttonLabel="From BDM Captures"
                onPick={(_files, meta) => {
                  // Phase P1.2 Slice 7-extension Round 2B — capture-id handoff
                  // (server-side OCR sidesteps the CORS lurking-bug).
                  const cap = meta?.captures?.[0];
                  if (!cap?._id) return;
                  const previewUrl = cap.captured_artifacts?.[0]?.url || null;
                  setScanInitialCaptureId(cap._id);
                  setScanInitialPreviewUrl(previewUrl);
                  setScanInitialFile(null);
                  setScanOpen(true);
                }}
              />
              <button className="btn btn-outline" onClick={() => navigate('/erp/undertaking')}>Open Undertakings →</button>
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
              {/* Phase G4.5b — OwnerPicker renders only for eligible proxies.
                  Target BDM must also be assigned to the chosen warehouse
                  (backend rejects with 400 if not). */}
              <div className="form-group">
                <OwnerPicker module="inventory" subKey="grn_proxy_entry" moduleLookupCode="GRN" value={assignedTo} onChange={setAssignedTo} />
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

            {/* Waybill upload panel */}
            <div className="waybill-panel">
              <div className="waybill-info">
                <label className="waybill-label">
                  Waybill Photo {grnSettings.waybillRequired && <span className="waybill-req">*required</span>}
                </label>
                <div className="waybill-desc">
                  Upload the courier&apos;s delivery waybill (proof the goods physically arrived).
                </div>
                <input
                  ref={waybillCameraRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  style={{ display: 'none' }}
                  onChange={e => { handleWaybillUpload(e.target.files?.[0]); e.target.value = ''; }}
                />
                <input
                  ref={waybillGalleryRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={e => { handleWaybillUpload(e.target.files?.[0]); e.target.value = ''; }}
                />
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => waybillCameraRef.current?.click()} disabled={waybillUploading}>
                    {waybillUploading ? 'Uploading…' : (waybillPhotoUrl ? '📷 Replace (Camera)' : '📷 Take Photo')}
                  </button>
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => waybillGalleryRef.current?.click()} disabled={waybillUploading}>
                    {waybillPhotoUrl ? '📁 Replace (Gallery)' : '📁 Choose from Gallery'}
                  </button>
                  {/* Phase P1.2 Slice 6.2 follow-up (Phase 2.1) — proxy-side
                      attach: pull a BDM-captured WAYBILL photo from the
                      Capture Hub queue without re-snapping. Filtered to GRN
                      sub_type='WAYBILL' so BATCH_PHOTO captures (which feed
                      the Undertaking OCR flow above) don't mis-land here.
                      UNCATEGORIZED stays unfiltered as a Quick Capture
                      fallback. Fetch-mode (skipFetch=false) — the picker
                      pulls the signed S3 URL into a Blob → File → routes
                      through the existing handleWaybillUpload pipeline so
                      a fresh, owned S3 object lands in waybill_photo_url.
                      Same downstream code path as gallery upload — no
                      backend change needed. */}
                  <PendingCapturesPicker
                    workflowTypes={['GRN', 'UNCATEGORIZED']}
                    subTypeFilter={{ GRN: 'WAYBILL' }}
                    bdmId={assignedTo || undefined}
                    maxSelect={1}
                    buttonLabel="From BDM Captures"
                    buttonStyle={{
                      padding: '4px 10px',
                      borderRadius: 10,
                      background: 'transparent',
                      color: 'var(--erp-text)',
                      border: '1px solid var(--erp-border, #dbe4f0)',
                      cursor: 'pointer',
                      fontWeight: 700,
                      fontSize: 12,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                    onPick={(files) => {
                      const file = files?.[0];
                      if (!file) return;
                      handleWaybillUpload(file);
                    }}
                  />
                  {waybillPhotoUrl && (
                    <button type="button" className="btn-remove-line" onClick={() => { setWaybillPhotoUrl(''); setWaybillPreview(''); }} title="Remove waybill">×</button>
                  )}
                </div>
              </div>
              {(waybillPreview || waybillPhotoUrl) && (
                <a href={waybillPhotoUrl || waybillPreview} target="_blank" rel="noreferrer">
                  <img src={waybillPreview || waybillPhotoUrl} alt="Waybill" className="waybill-thumb" />
                </a>
              )}
            </div>

            <div className="grn-line-header">
              <div>
                <h3>Line Items</h3>
                <p>Enter each product + qty + batch/lot # + expiry. Tap <em>Scan Undertaking Paper</em> above to OCR-fill all lines at once.</p>
              </div>
              <div className="grn-line-meta">
                <span className="grn-chip">{lineItems.length} line(s)</span>
                {scannedCount > 0 && <span className="grn-chip scan-ok">{scannedCount}/{lineItems.length} OCR-scanned ✓</span>}
                <span className="grn-chip">Expiry floor: {grnSettings.minExpiryDays}d</span>
              </div>
            </div>

            <table className="line-items-table">
              <colgroup>
                <col className="col-product" />
                <col className="col-batch" />
                <col className="col-expiry" />
                <col className="col-qty" />
                <col className="col-remove" />
              </colgroup>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Batch/Lot #{!grnSettings.requireBatch && <span className="grn-chip" style={{ marginLeft: 6, fontSize: 10 }}>optional</span>}</th>
                  <th>Expiry{!grnSettings.requireExpiry && <span className="grn-chip" style={{ marginLeft: 6, fontSize: 10 }}>optional</span>}</th>
                  <th>Qty</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {lineItems.map((li, idx) => (
                  <tr key={idx}>
                    <td>
                      <SelectField value={li.product_id} onChange={e => updateLine(idx, 'product_id', e.target.value)}>
                        <option value="">Select product...</option>
                        {productOptions.map(p => (
                          <option key={p._id} value={p._id}>
                            {p.brand_name}{p.dosage_strength ? ` ${p.dosage_strength}` : ''} — {p.unit_code || 'PC'}
                          </option>
                        ))}
                      </SelectField>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        <input
                          value={li.batch_lot_no}
                          onChange={e => updateLine(idx, 'batch_lot_no', e.target.value.toUpperCase())}
                          placeholder={grnSettings.requireBatch ? 'Batch #' : 'Batch # (optional)'}
                          className={li.scan_confirmed ? 'scan-ok' : ''}
                          style={{ textTransform: 'uppercase' }}
                        />
                        {li.scan_confirmed && <span className="scan-tick" title="OCR-confirmed">✓</span>}
                      </div>
                    </td>
                    <td>
                      <input
                        type="date"
                        value={li.expiry_date}
                        min={expiryFloor}
                        onChange={e => updateLine(idx, 'expiry_date', e.target.value)}
                        placeholder={grnSettings.requireExpiry ? '' : 'optional'}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min="1"
                        max={li._po_qty_remaining || undefined}
                        value={li.qty}
                        onChange={e => updateLine(idx, 'qty', e.target.value)}
                        placeholder="Qty"
                      />
                      {li._po_qty_remaining != null && <div style={{ fontSize: 10, color: '#92400e', marginTop: 2 }}>max: {li._po_qty_remaining}</div>}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <button className="btn-remove-line" onClick={() => removeLine(idx)} title="Remove line">×</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="line-items-mobile">
              {lineItems.map((li, idx) => (
                <div className="line-item-card" key={`mobile-line-${idx}`}>
                  <div className="line-item-card-head">
                    <div className="line-item-card-title">
                      Line {idx + 1} {li.scan_confirmed && <span className="scan-tick" title="OCR-confirmed">✓</span>}
                    </div>
                    <button className="btn-remove-line" onClick={() => removeLine(idx)} title="Remove line">×</button>
                  </div>
                  <div className="line-item-grid">
                    <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                      <label>Product</label>
                      <SelectField value={li.product_id} onChange={e => updateLine(idx, 'product_id', e.target.value)}>
                        <option value="">Select product...</option>
                        {productOptions.map(p => (
                          <option key={p._id} value={p._id}>
                            {p.brand_name}{p.dosage_strength ? ` ${p.dosage_strength}` : ''} — {p.unit_code || 'PC'}
                          </option>
                        ))}
                      </SelectField>
                    </div>
                    <div className="form-group">
                      <label>Batch/Lot #</label>
                      <input
                        value={li.batch_lot_no}
                        onChange={e => updateLine(idx, 'batch_lot_no', e.target.value.toUpperCase())}
                        placeholder="Batch #"
                        className={li.scan_confirmed ? 'scan-ok' : ''}
                        style={{ textTransform: 'uppercase' }}
                      />
                    </div>
                    <div className="form-group">
                      <label>Expiry</label>
                      <input
                        type="date"
                        value={li.expiry_date}
                        min={expiryFloor}
                        onChange={e => updateLine(idx, 'expiry_date', e.target.value)}
                      />
                    </div>
                    <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                      <label>Qty</label>
                      <input
                        type="number"
                        min="1"
                        value={li.qty}
                        onChange={e => updateLine(idx, 'qty', e.target.value)}
                        placeholder="Qty"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <button className="add-line-btn" onClick={addLine}>+ Add Line</button>

            <div style={{ marginTop: 16, display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center', flexWrap: 'wrap' }}>
              {!allLinesComplete && (
                <span style={{ fontSize: 12, color: '#92400e' }}>Every line needs product, batch, expiry, and qty.</span>
              )}
              {grnSettings.waybillRequired && !waybillPhotoUrl && (
                <span style={{ fontSize: 12, color: '#92400e' }}>Waybill photo is required.</span>
              )}
              <button className="btn btn-primary" onClick={handleSubmit} disabled={!canSubmit}>
                {saving ? 'Saving…' : 'Save & Validate'}
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
                  <tr><th>GRN#</th><th>Date</th><th>PO Ref</th><th>Vendor</th><th>Items</th><th>BDM</th><th>Status</th><th>Undertaking</th><th>Reviewed By</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {grnList.map(g => (
                    <tr key={g._id}>
                      {/* Phase 32R-GRN#: human-readable number; legacy rows show id-tail.
                          Phase G4.5b: Proxied pill when keyed on behalf of another BDM. */}
                      <td style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700 }}>
                        {g.grn_number || g._id.slice(-6)}
                        {g.recorded_on_behalf_of && (
                          <span
                            className="badge"
                            style={{ marginLeft: 6, background: '#ede9fe', color: '#6d28d9', fontSize: 10, padding: '1px 6px', borderRadius: 8, fontFamily: 'inherit' }}
                            title={`Keyed by ${g.recorded_on_behalf_of?.name || 'proxy user'} on behalf of ${g.bdm_id?.name || 'BDM'}`}
                          >
                            Proxied
                          </span>
                        )}
                      </td>
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
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          {g.undertaking ? (
                            <>
                              <a
                                onClick={e => { e.preventDefault(); navigate(`/erp/undertaking/${g.undertaking._id}`); }}
                                href={`/erp/undertaking/${g.undertaking._id}`}
                                style={{ fontSize: 12, color: '#2563eb', cursor: 'pointer', fontFamily: 'monospace' }}
                              >
                                {g.undertaking.undertaking_number} →
                              </a>
                              <span style={{ fontSize: 10, color: g.undertaking.status === 'ACKNOWLEDGED' ? '#166534' : g.undertaking.status === 'REJECTED' ? '#991b1b' : '#92400e' }}>
                                {g.undertaking.status}
                              </span>
                            </>
                          ) : (
                            <a
                              onClick={e => { e.preventDefault(); navigate(`/erp/grn/${g._id}/audit`); }}
                              href={`/erp/grn/${g._id}/audit`}
                              style={{ fontSize: 12, color: '#2563eb', cursor: 'pointer' }}
                            >
                              View →
                            </a>
                          )}
                        </div>
                      </td>
                      <td>{g.reviewed_by?.name || '—'}</td>
                      <td>
                        {g.status === 'PENDING' && (ROLE_SETS.MANAGEMENT.includes(user?.role)) && (() => {
                          const gate = grnApproveState(g);
                          return (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                              <div style={{ display: 'flex', gap: 4 }}>
                                <button
                                  className="btn btn-success btn-sm"
                                  onClick={() => handleApprove(g._id, 'APPROVED')}
                                  disabled={!gate.canApprove}
                                  style={!gate.canApprove ? { opacity: 0.55, cursor: 'not-allowed' } : undefined}
                                  title={gate.hint || ''}
                                >
                                  Approve
                                </button>
                                <button className="btn btn-danger btn-sm" onClick={() => handleApprove(g._id, 'REJECTED', prompt('Rejection reason:') || '')}>Reject</button>
                              </div>
                              {!gate.canApprove && gate.undertaking_id && (
                                <a
                                  onClick={e => { e.preventDefault(); navigate(`/erp/undertaking/${gate.undertaking_id}`); }}
                                  href={`/erp/undertaking/${gate.undertaking_id}`}
                                  style={{ fontSize: 11, color: '#2563eb' }}
                                >
                                  Open Undertaking →
                                </a>
                              )}
                            </div>
                          );
                        })()}
                        <RejectionBanner row={g} moduleKey="INVENTORY" variant="row" />
                      </td>
                    </tr>
                  ))}
                  {!grnList.length && <tr><td colSpan={10} style={{ textAlign: 'center', padding: 40, color: 'var(--erp-muted)' }}>No GRNs found</td></tr>}
                </tbody>
              </table>

              <div className="grn-card-list">
                {grnList.map(g => (
                  <div key={g._id} className="grn-card">
                    <div className="grn-card-header">
                      <div>
                        {/* Phase 32R-GRN#: lead with the doc number; date/item count go underneath.
                            Phase G4.5b: Proxied pill when keyed on behalf of another BDM. */}
                        <div className="grn-card-title" style={{ fontFamily: 'monospace' }}>
                          {g.grn_number || new Date(g.grn_date).toLocaleDateString('en-PH')}
                          {g.recorded_on_behalf_of && (
                            <span
                              className="badge"
                              style={{ marginLeft: 6, background: '#ede9fe', color: '#6d28d9', fontSize: 10, padding: '1px 6px', borderRadius: 8, fontFamily: 'inherit' }}
                              title={`Keyed by ${g.recorded_on_behalf_of?.name || 'proxy user'} on behalf of ${g.bdm_id?.name || 'BDM'}`}
                            >
                              Proxied
                            </span>
                          )}
                        </div>
                        <div className="grn-card-sub">
                          {g.grn_number ? `${new Date(g.grn_date).toLocaleDateString('en-PH')} · ` : ''}
                          {g.line_items?.length || 0} item(s)
                        </div>
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

                    <div style={{ marginTop: 8 }}>
                      <RejectionBanner row={g} moduleKey="INVENTORY" variant="row" />
                    </div>

                    <div style={{ marginTop: 6 }}>
                      <a
                        onClick={e => { e.preventDefault(); navigate(`/erp/grn/${g._id}/audit`); }}
                        href={`/erp/grn/${g._id}/audit`}
                        style={{ fontSize: 12, color: '#2563eb' }}
                      >
                        View Undertaking →
                      </a>
                    </div>

                    {g.status === 'PENDING' && (ROLE_SETS.MANAGEMENT.includes(user?.role)) && (() => {
                      const gate = grnApproveState(g);
                      return (
                        <>
                          <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                            <button
                              className="btn btn-success btn-sm"
                              style={{ flex: 1, ...(gate.canApprove ? {} : { opacity: 0.55, cursor: 'not-allowed' }) }}
                              onClick={() => handleApprove(g._id, 'APPROVED')}
                              disabled={!gate.canApprove}
                              title={gate.hint || ''}
                            >
                              Approve
                            </button>
                            <button className="btn btn-danger btn-sm" style={{ flex: 1 }} onClick={() => handleApprove(g._id, 'REJECTED', prompt('Rejection reason:') || '')}>Reject</button>
                          </div>
                          {!gate.canApprove && gate.hint && (
                            <div style={{ marginTop: 6, fontSize: 11, color: '#92400e', background: '#fef3c7', borderRadius: 6, padding: '6px 8px' }}>
                              {gate.hint}
                              {gate.undertaking_id && (
                                <>
                                  {' '}
                                  <a
                                    onClick={e => { e.preventDefault(); navigate(`/erp/undertaking/${gate.undertaking_id}`); }}
                                    href={`/erp/undertaking/${gate.undertaking_id}`}
                                    style={{ color: '#2563eb', fontWeight: 600 }}
                                  >
                                    Open →
                                  </a>
                                </>
                              )}
                            </div>
                          )}
                        </>
                      );
                    })()}
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
      <ScanUndertakingModal
        open={scanOpen}
        onClose={() => {
          setScanOpen(false);
          setScanInitialFile(null);
          setScanInitialCaptureId(null);
          setScanInitialPreviewUrl(null);
        }}
        onApply={handleScanApply}
        products={productOptions}
        initialFile={scanInitialFile}
        initialCaptureId={scanInitialCaptureId}
        initialPreviewUrl={scanInitialPreviewUrl}
      />
    </div>
  );
}
