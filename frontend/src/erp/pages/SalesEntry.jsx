import { useState, useEffect, useCallback, useMemo, useRef, Fragment } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import { useAuth } from '../../hooks/useAuth';
import useSales from '../hooks/useSales';
import useInventory from '../hooks/useInventory';
import useHospitals from '../hooks/useHospitals';
import useCustomers from '../hooks/useCustomers';
import useErpApi from '../hooks/useErpApi';
import useReports from '../hooks/useReports';
import useErpSubAccess from '../hooks/useErpSubAccess';
import { processDocument, extractExifDateTime } from '../services/ocrService';
import WarehousePicker from '../components/WarehousePicker';
import OwnerPicker from '../components/OwnerPicker';

import SelectField from '../../components/common/Select';
import WorkflowGuide from '../components/WorkflowGuide';
import RejectionBanner from '../components/RejectionBanner';
import { useRejectionConfig } from '../hooks/useRejectionConfig';
// Shared modal — used in photo-only mode for the rejection-fallback flow.
// The inline ScanCSIModal below remains the primary scan UX for live entries.
import ScanCSIPhotoFallback from '../components/ScanCSIModal';
import { showError, showApprovalPending, showSuccess } from '../utils/errorToast';
import { matchHospital, matchProduct, fieldVal, fieldConfidence } from '../utils/ocrMatching';

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
  line_items: [{ product_id: '', qty: '', unit: '', unit_price: '', line_discount_percent: '', item_key: '', batch_lot_no: '', fifo_override: false, override_reason: '' }],
  status: 'DRAFT',
  validation_errors: [],
  _isNew: true
});

// Existing DRAFT rows are loaded with populated refs (hospital_id, customer_id,
// product_id come back as objects); fresh edits arrive as ID strings. Coerce
// both shapes to a string ID so the update payload matches createSale's contract.
const idOf = (x) => (x && typeof x === 'object' && x._id) ? String(x._id) : (x ? String(x) : x);

// Mark a server-loaded row as having unsaved edits. New rows already flow
// through createSale; non-DRAFT rows can't be updated server-side (controller
// rejects with 400), so we skip dirty-flagging there to keep the Save count
// accurate.
const markDirty = (row) => (row._isNew || (row.status && row.status !== 'DRAFT')) ? row : { ...row, _isDirty: true };

const pageStyles = `
  .sales-entry-page { background: var(--erp-bg, #f4f7fb); min-height: 100vh; }
  .sales-main { flex: 1; min-width: 0; padding: 20px; max-width: 1400px; margin: 0 auto; }
  .sales-top-panel {
    background: var(--erp-panel, #fff);
    border: 1px solid var(--erp-border, #dbe4f0);
    border-radius: 14px;
    padding: 14px;
    margin-bottom: 14px;
    box-shadow: 0 4px 14px rgba(15, 23, 42, 0.04);
  }
  .sales-toolbar-row {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
    margin-bottom: 8px;
  }
  .sales-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 12px; }
  .sales-header:last-child { margin-bottom: 0; }
  .sales-header h1 { font-size: 22px; color: var(--erp-text, #132238); margin: 0; }
  .sales-subtitle {
    margin: 4px 0 0;
    color: var(--erp-muted, #5f7188);
    font-size: 13px;
    font-weight: 500;
  }
  .sales-nav-tabs {
    display: flex;
    gap: 6px;
    flex-wrap: nowrap;
    width: 100%;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    margin-bottom: 12px;
    padding: 6px;
    border: 1px solid var(--erp-border, #dbe4f0);
    border-radius: 10px;
    background: var(--erp-panel, #fff);
  }
  .sales-nav-tabs::-webkit-scrollbar { height: 0; }
  .sales-nav-tab {
    padding: 8px 12px;
    border-radius: 8px;
    border: 1px solid transparent;
    color: var(--erp-text, #132238);
    text-decoration: none;
    font-size: 13px;
    font-weight: 600;
    white-space: nowrap;
    flex-shrink: 0;
  }
  .sales-nav-tab.active {
    background: var(--erp-accent, #1e5eff);
    color: #fff;
  }
  .sales-nav-tab:hover {
    border-color: var(--erp-border, #dbe4f0);
  }
  .sales-actions { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
  .sales-actions-group { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
  .btn { padding: 8px 16px; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.15s; }
  .sales-actions .btn { min-height: 42px; }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn-primary { background: var(--erp-accent, #1e5eff); color: #fff; }
  .btn-success { background: #16a34a; color: #fff; }
  .btn-warning { background: #d97706; color: #fff; }
  .btn-outline { background: transparent; border: 1px solid var(--erp-border, #dbe4f0); color: var(--erp-text); }
  .btn-danger { background: #dc2626; color: #fff; }
  .btn-sm { padding: 4px 10px; font-size: 12px; }

  .sales-grid { background: var(--erp-panel, #fff); border: 1px solid var(--erp-border, #dbe4f0); border-radius: 12px; overflow-x: auto; }
  .sales-table { width: 100%; border-collapse: collapse; font-size: 13px; table-layout: auto; min-width: 1000px; }
  .sales-table th { background: var(--erp-accent-soft, #e8efff); color: var(--erp-text); padding: 10px 8px; text-align: left; font-weight: 600; white-space: nowrap; position: sticky; top: 0; }
  .sales-table td { padding: 6px 8px; border-top: 1px solid var(--erp-border, #dbe4f0); vertical-align: top; }
  .sales-table input, .sales-table select { width: 100%; padding: 8px; border: 1px solid var(--erp-border, #dbe4f0); border-radius: 6px; font-size: 14px; background: var(--erp-panel, #fff); color: var(--erp-text); }
  .sales-table input:focus, .sales-table select:focus { outline: none; border-color: var(--erp-accent, #1e5eff); }
  .sales-table .readonly { background: var(--erp-bg, #f4f7fb); color: var(--erp-muted, #5f7188); border: none; }

  /* Header + nested line-items pattern (mirrors OpeningArEntry's oar-row-main /
     oar-row-items but kept page-local so the two pages stay decoupled).
     Hospital / CSI# / Date / Total / Status live in the MAIN row. Products,
     batches, qty, price, line-total live in a full-width sub-row below so the
     product dropdown has room and the header fields don't compete for space. */
  .sales-row-main td { border-top: 1px solid var(--erp-border, #dbe4f0); padding-bottom: 4px; vertical-align: top; }
  .sales-row-items td { border-top: none; background: var(--erp-bg, #f4f7fb); padding-top: 4px; }
  .sales-row-reject td { border-top: none; background: #fff5f5; padding: 8px 12px; }
  .sales-li-section-label { font-size: 10px; color: var(--erp-muted, #5f7188); text-transform: uppercase; font-weight: 700; letter-spacing: 0.4px; margin: 2px 0 6px; }
  /* 8 columns: Product / Batch / Expiry / Qty / Unit / Price / Line Total / × */
  /* Phase R2 — added Disc % column (70px) between Price and Total. Order:
     Product · Batch · Expiry · Qty · Unit · Price · Disc% · Total · × */
  .sales-line-item { display: grid; grid-template-columns: minmax(220px, 2.6fr) 150px 110px 80px 70px 90px 70px 100px 32px; gap: 8px; align-items: start; margin-bottom: 6px; }
  .sales-line-item > * { min-width: 0; }
  .sales-line-item .cell-stack { display: flex; flex-direction: column; gap: 4px; }
  .sales-li-add { background: transparent; border: 1px dashed var(--erp-border); color: var(--erp-muted); padding: 4px 10px; font-size: 11px; border-radius: 6px; cursor: pointer; margin-top: 2px; }
  .sales-li-add:hover { background: var(--erp-panel); }
  .sales-li-remove { background: transparent; border: none; color: #dc2626; cursor: pointer; font-size: 16px; padding: 4px 6px; align-self: center; }
  .sales-li-remove:disabled { color: var(--erp-muted); cursor: not-allowed; }
  .sales-header-total { text-align: right; font-weight: 700; color: var(--erp-text); padding-top: 12px; }

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

  .sale-type-tabs { display: flex; gap: 4px; margin-bottom: 8px; background: var(--erp-bg, #f4f7fb); padding: 4px; border-radius: 10px; width: fit-content; }
  .sale-type-tab { padding: 8px 18px; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; background: transparent; color: var(--erp-muted, #5f7188); transition: all 0.15s; }
  .sale-type-tab.active { background: var(--erp-accent, #1e5eff); color: #fff; }
  .service-form { background: var(--erp-panel, #fff); border: 1px solid var(--erp-border, #dbe4f0); border-radius: 12px; padding: 20px; }
  .service-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .service-form label { font-size: 12px; font-weight: 600; color: var(--erp-muted); text-transform: uppercase; display: block; margin-bottom: 4px; }
  .service-form input, .service-form textarea, .service-form select { width: 100%; padding: 10px; border: 1px solid var(--erp-border); border-radius: 8px; font-size: 14px; margin-bottom: 14px; }
  .service-form textarea { min-height: 80px; resize: vertical; }

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
    .sales-main { padding-bottom: 96px; }
    .sales-top-panel { padding: 12px; }
    .sales-toolbar-row { margin-bottom: 10px; }
    .sales-header { flex-direction: column; align-items: flex-start; gap: 10px; }
    .sales-actions { width: 100%; }
    .sales-actions-group { width: 100%; }
    .sales-actions .btn { flex: 1 1 calc(50% - 6px); }
    .sale-type-tabs {
      width: 100%;
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 6px;
      overflow: hidden;
    }
    .sale-type-tab {
      white-space: normal;
      text-align: center;
      padding: 10px 8px;
    }
    .service-grid { grid-template-columns: 1fr; }
    .sales-line-item { grid-template-columns: 1fr; }
  }
  @media (max-width: 480px) {
    .sales-main { padding: 12px; padding-bottom: calc(88px + env(safe-area-inset-bottom, 0px)); }
    .sales-cards { padding: 0; }
    .sales-actions .btn { flex: 1 1 100%; }
    .sales-header h1 { font-size: 20px; }
    .sale-type-tab { font-size: 12px; }
  }
  @media (min-width: 769px) {
    .sales-cards { display: none; }
  }
`;

function formatReviewReason(reason) {
  const labels = {
    LOW_CONFIDENCE_INVOICE_NO: 'Invoice number needs review',
    LOW_CONFIDENCE_DATE: 'Invoice date needs review',
    LOW_CONFIDENCE_HOSPITAL: 'Hospital/customer needs review',
    MISSING_PRODUCT: 'A line item is missing a product',
    MISSING_LINE_ITEM_QTY: 'A line item is missing quantity',
    UNPARSED_ITEM_BLOCK: 'The CSI table could not be parsed cleanly',
    LINE_ITEM_ARITHMETIC_MISMATCH: 'A line item amount does not match qty × price',
    TOTAL_MISMATCH: 'Line item totals do not match the invoice total',
    LAYOUT_UNKNOWN: 'Layout is unknown and needs manual review',
    UNMATCHED_PRODUCT: 'At least one product did not match master data',
  };
  return labels[reason] || reason;
}

// --- ScanCSIModal inline component ---
function ScanCSIModal({ open, onClose, onApply, hospitals, productOptions }) {
  const [step, setStep] = useState('capture'); // capture | scanning | results | error
  const [, setPhoto] = useState(null);
  const [preview, setPreview] = useState(null);
  const [ocrData, setOcrData] = useState(null);
  const [matchedHospital, setMatchedHospital] = useState(null);
  const [matchedItems, setMatchedItems] = useState([]);
  const [errorMsg, setErrorMsg] = useState('');
  const [reviewConfirmed, setReviewConfirmed] = useState(false);
  const cameraRef = useRef(null);
  const galleryRef = useRef(null);

  const reset = () => {
    if (preview) URL.revokeObjectURL(preview);
    setStep('capture');
    setPhoto(null);
    setPreview(null);
    setOcrData(null);
    setMatchedHospital(null);
    setMatchedItems([]);
    setErrorMsg('');
    setReviewConfirmed(false);
  };

  const handleClose = () => { reset(); onClose(); };

  const handleFile = async (file) => {
    if (!file) return;
    setPhoto(file);
    setPreview(URL.createObjectURL(file));
    setStep('scanning');
    setErrorMsg('');
    setReviewConfirmed(false);

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
      csi_photo_url: ocrData?.s3_url || '',
      csi_attachment_id: ocrData?.attachment_id || null,
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
        : [{ product_id: '', qty: '', unit: '', unit_price: '', line_discount_percent: '', item_key: '' }]
    };

    onApply(row);
    handleClose();
  };

  if (!open) return null;

  const reviewReasons = [
    ...(ocrData?.review_reasons || []),
    ...(matchedItems.some(mi => !mi.product_match) ? ['UNMATCHED_PRODUCT'] : [])
  ].filter((reason, idx, arr) => arr.indexOf(reason) === idx);
  const requiresReviewAck = Boolean(ocrData?.review_required || reviewReasons.length > 0);
  const canApply = !requiresReviewAck || reviewConfirmed;

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
              {ocrData.layout_family && (
                <div className="result-group">
                  <label>Detected Layout</label>
                  <div className="result-value">
                    {ocrData.layout_family}
                    {requiresReviewAck ? (
                      <span className="match-badge match-medium" style={{ marginLeft: 8 }}>Review Required</span>
                    ) : (
                      <span className="match-badge match-high" style={{ marginLeft: 8 }}>Ready</span>
                    )}
                  </div>
                </div>
              )}

              {/* Header fields */}
              <div className="result-group" style={reviewReasons.includes('LOW_CONFIDENCE_INVOICE_NO') ? { border: '1px solid #d97706', borderRadius: 8, padding: 10, background: '#fff7ed' } : undefined}>
                <label>CSI # (Invoice No.)</label>
                <div className="result-value">
                  {fieldVal(ocrData.extracted?.invoice_no) || '—'}
                  {fieldConfidence(ocrData.extracted?.invoice_no) && (
                    <span className={`match-badge match-${fieldConfidence(ocrData.extracted?.invoice_no).toLowerCase()}`} style={{ marginLeft: 8 }}>
                      {fieldConfidence(ocrData.extracted?.invoice_no)}
                    </span>
                  )}
                </div>
              </div>
              <div className="result-group" style={reviewReasons.includes('LOW_CONFIDENCE_DATE') ? { border: '1px solid #d97706', borderRadius: 8, padding: 10, background: '#fff7ed' } : undefined}>
                <label>Date</label>
                <div className="result-value">
                  {fieldVal(ocrData.extracted?.date) || '—'}
                  {fieldConfidence(ocrData.extracted?.date) && (
                    <span className={`match-badge match-${fieldConfidence(ocrData.extracted?.date).toLowerCase()}`} style={{ marginLeft: 8 }}>
                      {fieldConfidence(ocrData.extracted?.date)}
                    </span>
                  )}
                </div>
              </div>
              <div className="result-group" style={reviewReasons.includes('LOW_CONFIDENCE_HOSPITAL') ? { border: '1px solid #d97706', borderRadius: 8, padding: 10, background: '#fff7ed' } : undefined}>
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

              {reviewReasons.length > 0 && (
                <div className="scan-error" style={{ marginTop: 12, background: '#fff7ed', color: '#9a3412', border: '1px solid #fdba74' }}>
                  {reviewReasons.map((reason) => (
                    <div key={reason}>{formatReviewReason(reason)}</div>
                  ))}
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

              {requiresReviewAck && (
                <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 12, fontSize: 13, color: 'var(--erp-text)' }}>
                  <input
                    type="checkbox"
                    checked={reviewConfirmed}
                    onChange={(e) => setReviewConfirmed(e.target.checked)}
                    style={{ marginTop: 2 }}
                  />
                  <span>I reviewed the flagged CSI fields and still want to apply this scan.</span>
                </label>
              )}

              {/* Action buttons */}
              <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                <button className="btn btn-success" onClick={handleApply} style={{ flex: 1 }} disabled={!canApply}>
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
  const navigate = useNavigate();
  const liveDate = user?.live_date ? new Date(user.live_date).toISOString().split('T')[0] : '';
  const sales = useSales();
  const inventory = useInventory();
  const customers = useCustomers();
  const lookupApi = useErpApi();
  const [paymentModes, setPaymentModes] = useState([]);

  const [saleType, setSaleType] = useState('CSI'); // CSI, CASH_RECEIPT, SERVICE_INVOICE
  const [warehouseId, setWarehouseId] = useState('');
  // Phase G4.5a — proxy entry: empty = self; set to a User._id to file under another BDM.
  const [assignedTo, setAssignedTo] = useState('');
  // Hospital dropdown must follow the SELECTED warehouse (not the logged-in user)
  // so a proxy filing on behalf of another BDM sees the target warehouse's
  // hospitals, not their own. Backend gates warehouse access; the hook bypasses
  // its session cache when scoped so toggling warehouse always refetches.
  const { hospitals } = useHospitals({ warehouseId });
  const [rows, setRows] = useState([emptyRow()]);
  const [stockProducts, setStockProducts] = useState([]);
  const [actionLoading, setActionLoading] = useState('');
  const [scanModalOpen, setScanModalOpen] = useState(false);
  // Rejection-fallback flow: re-upload a CSI photo to a previously-rejected row
  // without re-keying line items. null = inactive; number = target row index;
  // 'NEW' = attach-photo-only to a fresh row (no OCR parsing, proof-only path).
  const [photoOnlyRowIdx, setPhotoOnlyRowIdx] = useState(null);
  const [customerList, setCustomerList] = useState([]);
  // Phase 15.2 (softened) — BDM's available CSI numbers (monitoring hint)
  const [availableCsi, setAvailableCsi] = useState([]);
  const reportsHook = useReports();
  const { hasSubPermission } = useErpSubAccess();
  const canManageCsi = hasSubPermission('inventory', 'csi_booklets');
  // Opening AR nav-tab gates (Option B split — Apr 2026). Entry + List have
  // separate sub-perms so subscribers can retire Entry post-cutover while
  // keeping List visible for read-only audit. `opening_ar_list` lazy-falls
  // back to `opening_ar` until the new sub-perm is fully seeded.
  const canOpeningArEntry = hasSubPermission('sales', 'opening_ar');
  const canOpeningArList = hasSubPermission('sales', 'opening_ar_list') || canOpeningArEntry;

  // Lookup-driven rejection config (MODULE_REJECTION_CONFIG → SALES).
  // Drives when the rejection banner + photo-reupload fallback appear.
  // Falls back to sane defaults if the lookup hasn't been seeded yet.
  const { config: rejectionConfig } = useRejectionConfig('SALES');
  const rejectionReasonField = rejectionConfig?.reason_field || 'rejection_reason';
  // useMemo so the array identity is stable across renders — otherwise the
  // useCallback below sees a "new" array each render and react-hooks/exhaustive-deps fires.
  const rejectionEditableStatuses = useMemo(
    () => rejectionConfig?.editable_statuses || ['DRAFT', 'ERROR'],
    [rejectionConfig]
  );
  const isRejectedRow = useCallback((row) => Boolean(
    row && row[rejectionReasonField] && rejectionEditableStatuses.includes(row.status)
  ), [rejectionReasonField, rejectionEditableStatuses]);

  // Phase 18: Service Invoice state (no line items — just description + total)
  const [serviceForm, setServiceForm] = useState({ customer_type: 'hospital', customer_ref: '', csi_date: new Date().toISOString().split('T')[0], service_description: '', invoice_total: '', payment_mode: 'CASH', petty_cash_fund_id: '' });

  // Petty cash fund selector for CASH_RECEIPT / SERVICE_INVOICE with CASH payment
  const [pettyCashFunds, setPettyCashFunds] = useState([]);
  const [cashReceiptFundId, setCashReceiptFundId] = useState(''); // global fund for CASH_RECEIPT rows

  useEffect(() => {
    lookupApi.get('/lookups/payment-modes').then(r => setPaymentModes(r?.data || [])).catch(() => {});
    lookupApi.get('/petty-cash/funds').then(r => setPettyCashFunds((r?.data || []).filter(f => f.status === 'ACTIVE' && (f.fund_mode || 'REVOLVING') !== 'EXPENSE_ONLY'))).catch(() => {});
    // Phase 15.2 (softened) — preload my allocated CSI numbers (non-blocking monitoring hint)
    reportsHook.getAvailableCsiNumbers().then(r => setAvailableCsi(r?.data || [])).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Deep-link edit: ?edit=<saleId> hydrates that specific DRAFT/VALID/ERROR row
  // regardless of owner — needed when SalesList → Edit hops here for a row keyed
  // via proxy entry (Phase G4.5a) or viewed by a privileged user. OPENING_AR
  // rows are owned by OpeningArEntry; we silently skip them here.
  const [searchParams] = useSearchParams();
  const editId = searchParams.get('edit');
  useEffect(() => {
    if (!editId) return;
    let cancelled = false;
    sales.getSaleById(editId)
      .then(res => {
        if (cancelled) return;
        // useSales returns the axios response; the response interceptor leaves
        // the body intact, so res.data IS the backend envelope. Some hooks have
        // historically returned the unwrapped row, so accept both shapes.
        const row = res?.data?.data || res?.data;
        if (!row || !row._id) return;
        if (row.source === 'OPENING_AR') {
          navigate(`/erp/sales/opening-ar?edit=${editId}`, { replace: true });
          return;
        }
        setRows([{ ...row, _isNew: false }]);
      })
      .catch(err => {
        if (!cancelled) {
          console.error('[SalesEntry] load edit row:', err.message);
          showError(err, 'Could not load that sale for editing');
        }
      });
    return () => { cancelled = true; };
  }, [editId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Prefill from navigation (e.g. "Issue CSI" from Consignment Aging)
  const location = useLocation();
  const prefillApplied = useRef(false);
  useEffect(() => {
    const prefill = location.state?.prefill;
    if (!prefill || prefillApplied.current) return;
    prefillApplied.current = true;

    // Set warehouse if provided
    if (prefill.warehouse_id) setWarehouseId(prefill.warehouse_id);

    // Prefill the first row with hospital + product
    setRows([{
      ...emptyRow(),
      hospital_id: prefill.hospital_id || '',
      csi_date: new Date().toISOString().split('T')[0],
      line_items: [{
        product_id: prefill.product_id || '',
        qty: prefill.qty || '',
        unit: '',
        unit_price: '',
        line_discount_percent: '',
        item_key: '',
        batch_lot_no: '',
        fifo_override: false,
        override_reason: ''
      }]
    }]);
  }, [location.state]);

  // Load customers for non-CSI modes
  useEffect(() => {
    if (saleType !== 'CSI') {
      customers.getAll({ limit: 0, status: 'ACTIVE' }).then(res => {
        if (res?.data) setCustomerList(res.data);
      }).catch(err => console.error('[SalesEntry]', err.message));
    }
  }, [saleType]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load stock when warehouse is selected (auto-selected by WarehousePicker)
  useEffect(() => {
    if (!warehouseId) return;
    inventory.getMyStock(null, null, warehouseId).then(res => {
      if (res?.data) setStockProducts(res.data);
    }).catch(err => console.error('[SalesEntry]', err.message));
  }, [warehouseId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Build product dropdown options from stock (includes batches for FIFO selector)
  const productOptions = useMemo(() => {
    return stockProducts.map(sp => ({
      product_id: sp.product_id,
      label: `${sp.product?.brand_name || 'Unknown'}${sp.product?.dosage_strength ? ' ' + sp.product.dosage_strength : ''} — ${sp.total_qty} ${sp.product?.unit_code || 'PC'}`,
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
      updated[idx] = markDirty({ ...updated[idx], [field]: value });
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
      updated[rowIdx] = markDirty(row);
      return updated;
    });
  }, [productOptions]);

  // Header + nested line-items layout: a CSI row may carry N products. These
  // helpers keep state shape compatible with the existing save/validate/submit
  // flow (payload still ships `line_items[]` to salesController → createSale).
  const addLineItem = useCallback((rowIdx) => {
    setRows(prev => {
      const updated = [...prev];
      const row = { ...updated[rowIdx] };
      row.line_items = [
        ...row.line_items,
        { product_id: '', qty: '', unit: '', unit_price: '', line_discount_percent: '', item_key: '', batch_lot_no: '', fifo_override: false, override_reason: '' }
      ];
      updated[rowIdx] = markDirty(row);
      return updated;
    });
  }, []);

  const removeLineItem = useCallback((rowIdx, itemIdx) => {
    setRows(prev => {
      const updated = [...prev];
      const row = { ...updated[rowIdx] };
      row.line_items = row.line_items.filter((_, i) => i !== itemIdx);
      if (row.line_items.length === 0) {
        row.line_items = [{ product_id: '', qty: '', unit: '', unit_price: '', line_discount_percent: '', item_key: '', batch_lot_no: '', fifo_override: false, override_reason: '' }];
      }
      updated[rowIdx] = markDirty(row);
      return updated;
    });
  }, []);

  const addRow = () => setRows(prev => [...prev, emptyRow()]);

  // Proof-only upload: create a fresh row with just the CSI photo attached.
  // The BDM fills in hospital / CSI# / line items manually afterwards. Distinct
  // from Scan CSI (which runs OCR and pre-fills). Attaching the signed
  // received-CSI to an already-persisted row is a SalesList-only lifecycle
  // action (PUT /sales/:id/received-csi), not done here.
  const handlePhotoUploadNewRow = useCallback((scannedData) => {
    const newRow = {
      ...emptyRow(),
      csi_photo_url: scannedData.csi_photo_url || '',
      csi_attachment_id: scannedData.csi_attachment_id || null
    };
    setRows(prev => [...prev, newRow]);
    setPhotoOnlyRowIdx(null);
    showSuccess('Photo attached to new row. Fill in the hospital, CSI#, and line items, then save.');
  }, []);

  const handlePhotoOnlyApply = useCallback((scannedData) => {
    if (photoOnlyRowIdx === 'NEW') {
      handlePhotoUploadNewRow(scannedData);
    }
  }, [photoOnlyRowIdx, handlePhotoUploadNewRow]);

  // Apply OCR scan results as a new row
  const handleScanApply = useCallback((scannedData) => {
    const newRow = {
      ...emptyRow(),
      hospital_id: scannedData.hospital_id,
      csi_date: scannedData.csi_date,
      doc_ref: scannedData.doc_ref,
      csi_photo_url: scannedData.csi_photo_url || '',
      csi_attachment_id: scannedData.csi_attachment_id || null,
      line_items: scannedData.line_items?.length
        ? scannedData.line_items.map(li => ({ ...li, batch_lot_no: li.batch_lot_no || '', fifo_override: false, override_reason: '' }))
        : [{ product_id: '', qty: '', unit: '', unit_price: '', line_discount_percent: '', item_key: '', batch_lot_no: '', fifo_override: false, override_reason: '' }]
    };
    setRows(prev => [...prev, newRow]);
  }, []);

  const removeRow = (idx) => {
    setRows(prev => {
      if (prev.length <= 1) return prev;
      return prev.filter((_, i) => i !== idx);
    });
  };

  // Phase R2 — line total is qty × unit_price × (1 - discount_pct/100). VAT
  // base shrinks (BIR-standard trade discount). Mirrors the SalesLine pre-save
  // hook so the on-screen total matches what the model will store.
  const computeLineGross = (item) => {
    const qty = parseFloat(item.qty) || 0;
    const price = parseFloat(item.unit_price) || 0;
    return qty * price;
  };
  const computeLineDiscountAmount = (item) => {
    const gross = computeLineGross(item);
    const pct = Math.max(0, Math.min(100, parseFloat(item.line_discount_percent) || 0));
    return gross * (pct / 100);
  };
  const computeLineTotal = (item) => {
    return (computeLineGross(item) - computeLineDiscountAmount(item)).toFixed(2);
  };

  // Save all new/dirty rows as DRAFTs. New rows POST via createSale; existing
  // DRAFT rows that have been edited (markDirty fired on updateRow / updateLineItem
  // / addLineItem / removeLineItem) PUT via updateSale. Backend rejects updates
  // to non-DRAFT rows, and markDirty already gates by status, so this is safe.
  const saveAll = async () => {
    setActionLoading('save');
    try {
      const savedIds = [];
      const updatedIds = [];
      const failures = [];
      const warnings = [];
      for (const row of rows) {
        const isCreate = !!row._isNew;
        const isUpdate = !row._isNew && !!row._isDirty;
        if (!isCreate && !isUpdate) continue;

        // Warn instead of silently skipping rows missing hospital/customer
        if (!row.hospital_id && !row.customer_id) {
          warnings.push('Row skipped: hospital or customer is required before saving.');
          continue;
        }
        if (saleType === 'CSI' && !row.doc_ref) {
          warnings.push('Row skipped: CSI# is required for CSI sales.');
          continue;
        }
        // Backdated guard: live Sales Entry is for go-live-date-onward only.
        // Pre-cutover historical CSIs must be entered via Opening AR Entry, where
        // the product dropdown is sourced from ProductMaster (not warehouse stock).
        if (liveDate && row.csi_date && row.csi_date < liveDate) {
          warnings.push(`Row skipped: CSI date ${row.csi_date} is before your go-live date (${liveDate}). Use Opening AR Entry for historical CSIs.`);
          continue;
        }

        // Warn about line items dropped due to missing qty (instead of silent filter)
        const droppedItems = row.line_items.filter(li => li.product_id && (!li.qty || parseFloat(li.qty) <= 0));
        if (droppedItems.length > 0) {
          warnings.push(`${droppedItems.length} line item(s) removed: quantity must be greater than 0.`);
        }

        const validItems = row.line_items.filter(li => li.product_id && li.qty && parseFloat(li.qty) > 0);

        // Warn about line items with zero price
        const zeroPriceItems = validItems.filter(li => !li.unit_price || parseFloat(li.unit_price) <= 0);
        if (zeroPriceItems.length > 0) {
          warnings.push(`${zeroPriceItems.length} line item(s) have ₱0 unit price — please set a price.`);
        }

        const payload = {
          sale_type: saleType,
          // Phase G4.5a — proxy entry. Empty = self; otherwise file under the
          // selected BDM (backend gates via sales.proxy_entry sub-perm + role
          // membership in PROXY_ENTRY_ROLES.SALES lookup). Update path strips
          // assigned_to server-side (ownership is locked on edit), so this is
          // a no-op for dirty rows — kept for create symmetry.
          assigned_to: assignedTo || undefined,
          // idOf coerces populated refs (loaded DRAFTs come back as objects)
          // back to ID strings so the update payload matches createSale's contract.
          hospital_id: idOf(row.hospital_id) || undefined,
          customer_id: idOf(row.customer_id) || undefined,
          csi_date: row.csi_date,
          doc_ref: row.doc_ref || undefined,
          warehouse_id: warehouseId || undefined,
          payment_mode: saleType === 'CASH_RECEIPT' ? 'CASH' : (row.payment_mode || undefined),
          petty_cash_fund_id: saleType === 'CASH_RECEIPT' && cashReceiptFundId ? cashReceiptFundId : undefined,
          csi_photo_url: row.csi_photo_url || undefined,
          csi_attachment_id: row.csi_attachment_id || undefined,
          line_items: validItems.map(li => ({
            product_id: idOf(li.product_id),
            item_key: li.item_key,
            qty: parseFloat(li.qty),
            unit: li.unit,
            unit_price: parseFloat(li.unit_price),
            // Phase R2 — line-level discount %. Schema clamps 0..100; backend
            // also enforces SALES_DISCOUNT_CONFIG.max_percent (privileged bypass).
            // Coerce empty / non-numeric input to 0 so omitted-field semantics
            // match the schema default.
            line_discount_percent: Math.max(0, Math.min(100, parseFloat(li.line_discount_percent) || 0)),
            ...(li.batch_lot_no ? { batch_lot_no: li.batch_lot_no, fifo_override: li.fifo_override || false } : {}),
            ...(li.fifo_override && li.override_reason ? { override_reason: li.override_reason } : {})
          }))
        };

        try {
          if (isCreate) {
            const res = await sales.createSale(payload);
            if (res?.data) savedIds.push(res.data._id);
          } else {
            const res = await sales.updateSale(row._id, payload);
            if (res?.data) updatedIds.push(res.data._id);
          }
        } catch (err) {
          // Per-row failure: keep going so other dirty rows still get saved,
          // surface a row-scoped error rather than aborting the whole batch.
          const label = row.doc_ref ? `CSI ${row.doc_ref}` : (row.invoice_number || `Row`);
          const msg = err?.response?.data?.message || err?.message || 'unknown error';
          failures.push(`${label}: ${msg}`);
        }
      }

      // Show accumulated warnings + per-row failures to BDM
      if (warnings.length > 0 || failures.length > 0) {
        showError(null, [...warnings, ...failures].join('\n'));
      }

      if (savedIds.length || updatedIds.length) {
        await loadSales();
      } else if (rows.some(r => r._isNew) && warnings.length === 0 && failures.length === 0) {
        showError(null, 'No rows saved. Make sure each row has a hospital or customer selected' + (saleType === 'CSI' ? ' and a CSI#' : ''));
      }
    } catch (err) {
      console.error('Save error:', err);
      showError(err, 'Could not save sale');
    } finally {
      setActionLoading('');
    }
  };

  const loadSales = async () => {
    try {
      // Load recent active rows only — not all sales ever (performance)
      const res = await sales.getSales({ limit: 100, status: 'DRAFT' });
      const res2 = await sales.getSales({ limit: 50, status: 'VALID' });
      const res3 = await sales.getSales({ limit: 50, status: 'ERROR' });
      const activeRows = [
        ...(res?.data || []),
        ...(res2?.data || []),
        ...(res3?.data || [])
      ];
      if (activeRows.length) {
        setRows(activeRows.map(s => ({ ...s, _isNew: false })));
      } else {
        setRows([emptyRow()]);
      }
    } catch (err) { console.error('[SalesEntry] load error:', err.message); }
  };

  return (
    <div className="admin-page erp-page sales-entry-page">
      <style>{pageStyles}</style>
      <Navbar />
      <div className="admin-layout">
        <Sidebar />
        <main className="sales-main">
          <WorkflowGuide pageKey="sales-entry" />
          <div className="sales-top-panel">
            <div className="sales-nav-tabs" role="tablist" aria-label="Sales navigation">
              <Link to="/erp/sales/entry" className="sales-nav-tab active" aria-current="page">Sales</Link>
              <Link to="/erp/sales" className="sales-nav-tab">Sales Transactions</Link>
              {canOpeningArEntry && <Link to="/erp/sales/opening-ar" className="sales-nav-tab">Opening AR</Link>}
              {canOpeningArList && <Link to="/erp/sales/opening-ar/list" className="sales-nav-tab">Opening AR Transactions</Link>}
              <Link to="/erp/csi-booklets" className="sales-nav-tab">
                {canManageCsi ? 'CSI Booklets' : 'My CSI'}
              </Link>
            </div>
            <div className="sales-toolbar-row" style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <WarehousePicker value={warehouseId} onChange={setWarehouseId} filterType="PHARMA" compact />
              <OwnerPicker module="sales" subKey="proxy_entry" moduleLookupCode="SALES" value={assignedTo} onChange={setAssignedTo} />
            </div>
            {/* Phase 18: Sale Type Tabs */}
            <div className="sale-type-tabs">
              {[
                { key: 'CSI', label: 'CSI (Booklet)' },
                { key: 'CASH_RECEIPT', label: 'Cash Receipt' },
                { key: 'SERVICE_INVOICE', label: 'Service Invoice' }
              ].map(t => (
                <button key={t.key} className={`sale-type-tab ${saleType === t.key ? 'active' : ''}`} onClick={() => setSaleType(t.key)}>
                  {t.label}
                </button>
              ))}
            </div>

            <div className="sales-header">
              <div>
                <h1>{saleType === 'SERVICE_INVOICE' ? 'Service Invoice' : saleType === 'CASH_RECEIPT' ? 'Cash Receipt' : 'Sales Entry'}</h1>
                <p className="sales-subtitle">
                  {saleType === 'SERVICE_INVOICE'
                    ? 'Create and save service invoices with customer details and payment mode.'
                    : 'Capture sales lines, validate entries, then submit to post stock and ledger effects.'}
                </p>
              </div>
              {saleType !== 'SERVICE_INVOICE' && (
                <div className="sales-actions">
                  <div className="sales-actions-group">
                    <button className="btn btn-primary" onClick={() => setScanModalOpen(true)} style={{ background: '#7c3aed' }} title="Scan a CSI photo with OCR — auto-fills hospital, CSI#, and line items">📷 Scan CSI</button>
                    <button className="btn btn-outline" onClick={() => setPhotoOnlyRowIdx('NEW')} title="Upload a CSI photo as proof only — no OCR; you type the row details manually">📎 Upload CSI</button>
                    <button className="btn btn-outline" onClick={addRow}>+ Add Row</button>
                  </div>
                  <div className="sales-actions-group">
                    {(() => {
                      const pending = rows.filter(r => r._isNew || r._isDirty).length;
                      return (
                        <button
                          className="btn btn-primary"
                          onClick={saveAll}
                          disabled={actionLoading === 'save' || pending === 0}
                          title={pending === 0 ? 'No new or edited rows to save' : `${pending} row(s) pending save`}
                        >
                          {actionLoading === 'save' ? 'Saving...' : `Save Drafts${pending > 0 ? ` (${pending})` : ''}`}
                        </button>
                      );
                    })()}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Phase 18: Service Invoice Form (no line items — description + total) */}
          {saleType === 'SERVICE_INVOICE' && (
            <div className="service-form">
              <div className="service-grid">
                <div>
                  <label>Customer / Hospital</label>
                  <SelectField value={`${serviceForm.customer_type}:${serviceForm.customer_ref}`} onChange={e => {
                    const [type, id] = e.target.value.split(':');
                    setServiceForm(f => ({ ...f, customer_type: type, customer_ref: id }));
                  }}>
                    <option value=":">Select...</option>
                    <optgroup label="Hospitals">
                      {hospitals.map(h => <option key={h._id} value={`hospital:${h._id}`}>{h.hospital_name}</option>)}
                    </optgroup>
                    <optgroup label="Customers">
                      {customerList.map(c => <option key={c._id} value={`customer:${c._id}`}>{c.customer_name}{c.customer_type ? ` (${c.customer_type})` : ''}</option>)}
                    </optgroup>
                  </SelectField>
                </div>
                <div>
                  <label>Invoice Date</label>
                  <input type="date" value={serviceForm.csi_date} onChange={e => setServiceForm(f => ({ ...f, csi_date: e.target.value }))} />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label>Service Description</label>
                  <textarea value={serviceForm.service_description} onChange={e => setServiceForm(f => ({ ...f, service_description: e.target.value }))} placeholder="e.g. Breakfast (20 pax), Room Rental (3 nights), Consulting fee..." />
                </div>
                <div>
                  <label>Invoice Total (₱)</label>
                  <input type="number" step="0.01" value={serviceForm.invoice_total} onChange={e => setServiceForm(f => ({ ...f, invoice_total: e.target.value }))} placeholder="0.00" />
                </div>
                <div>
                  <label>Payment Mode</label>
                  <SelectField value={serviceForm.payment_mode} onChange={e => setServiceForm(f => ({ ...f, payment_mode: e.target.value, petty_cash_fund_id: e.target.value !== 'CASH' ? '' : f.petty_cash_fund_id }))}>
                    {paymentModes.filter(pm => pm.is_active !== false).map(pm => <option key={pm.mode_code} value={pm.mode_code}>{pm.mode_label}</option>)}
                  </SelectField>
                </div>
                {serviceForm.payment_mode === 'CASH' && pettyCashFunds.length > 0 && (
                  <div>
                    <label>Deposit To (Petty Cash)</label>
                    <SelectField value={serviceForm.petty_cash_fund_id} onChange={e => setServiceForm(f => ({ ...f, petty_cash_fund_id: e.target.value }))}>
                      <option value="">No fund (AR only)</option>
                      {pettyCashFunds.map(f => <option key={f._id} value={f._id}>{f.fund_code} — {f.fund_name}</option>)}
                    </SelectField>
                  </div>
                )}
              </div>
              <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
                <button className="btn btn-primary" disabled={!!actionLoading} onClick={async () => {
                  setActionLoading('save');
                  try {
                    const payload = {
                      sale_type: 'SERVICE_INVOICE',
                      assigned_to: assignedTo || undefined, // Phase G4.5a proxy entry
                      hospital_id: serviceForm.customer_type === 'hospital' ? serviceForm.customer_ref : undefined,
                      customer_id: serviceForm.customer_type === 'customer' ? serviceForm.customer_ref : undefined,
                      csi_date: serviceForm.csi_date,
                      service_description: serviceForm.service_description,
                      invoice_total: parseFloat(serviceForm.invoice_total) || 0,
                      payment_mode: serviceForm.payment_mode,
                      petty_cash_fund_id: serviceForm.payment_mode === 'CASH' && serviceForm.petty_cash_fund_id ? serviceForm.petty_cash_fund_id : undefined,
                      line_items: []
                    };
                    await sales.createSale(payload);
                    setServiceForm({ customer_type: 'hospital', customer_ref: '', csi_date: new Date().toISOString().split('T')[0], service_description: '', invoice_total: '', payment_mode: 'CASH', petty_cash_fund_id: '' });
                    await loadSales();
                  } catch (err) { console.error('Service save error:', err); }
                  finally { setActionLoading(''); }
                }}>
                  {actionLoading === 'save' ? 'Saving...' : 'Save Service Invoice'}
                </button>
              </div>

              {/* Show recent service invoices with Print button */}
              {rows.filter(r => r.sale_type === 'SERVICE_INVOICE').length > 0 && (
                <div style={{ marginTop: 20, borderTop: '1px solid var(--erp-border)', paddingTop: 16 }}>
                  <h3 style={{ fontSize: 14, marginBottom: 8, color: 'var(--erp-muted)' }}>Recent Service Invoices</h3>
                  <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: 'var(--erp-bg)' }}>
                        <th style={{ padding: '6px 8px', textAlign: 'left' }}>Invoice #</th>
                        <th style={{ padding: '6px 8px', textAlign: 'left' }}>Customer</th>
                        <th style={{ padding: '6px 8px', textAlign: 'left' }}>Description</th>
                        <th style={{ padding: '6px 8px', textAlign: 'right' }}>Total</th>
                        <th style={{ padding: '6px 8px', textAlign: 'center' }}>Status</th>
                        <th style={{ padding: '6px 8px', textAlign: 'center' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.filter(r => r.sale_type === 'SERVICE_INVOICE').map(r => (
                        <tr key={r._id} style={{ borderTop: '1px solid var(--erp-border)' }}>
                          <td style={{ padding: '6px 8px' }}>{r.invoice_number || r.doc_ref || '—'}</td>
                          <td style={{ padding: '6px 8px' }}>{r.hospital_id?.hospital_name || r.customer_id?.customer_name || '—'}</td>
                          <td style={{ padding: '6px 8px' }}>{r.service_description || '—'}</td>
                          <td style={{ padding: '6px 8px', textAlign: 'right' }}>₱{(r.invoice_total || 0).toLocaleString()}</td>
                          <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                            <span className="status-badge" style={{ background: STATUS_COLORS[r.status]?.bg, color: STATUS_COLORS[r.status]?.text }}>
                              {STATUS_COLORS[r.status]?.label}
                            </span>
                            {r.source === 'OPENING_AR' && (
                              <span className="status-badge" style={{ background: '#fef3c7', color: '#92400e', marginLeft: 4 }} title="Pre-live-date — no inventory deduction">Opening AR</span>
                            )}
                            {r._isDirty && (
                              <span title="Unsaved edits — Save Service Invoice to persist" style={{ marginLeft: 4, color: '#d97706', fontSize: 14, fontWeight: 700 }}>●</span>
                            )}
                          </td>
                          <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                            <div style={{ display: 'flex', gap: 4, justifyContent: 'center', flexWrap: 'wrap' }}>
                              {r.status === 'DRAFT' && (
                                <button className="btn btn-warning btn-sm" disabled={!!actionLoading} onClick={async () => {
                                  setActionLoading('validate');
                                  try {
                                    await sales.validateSales([r._id]);
                                    await loadSales();
                                  } catch (err) { showError(err, 'Could not validate sale'); } finally { setActionLoading(''); }
                                }}>Validate</button>
                              )}
                              {r.status === 'VALID' && (
                                <button className="btn btn-success btn-sm" disabled={!!actionLoading} onClick={async () => {
                                  setActionLoading('submit');
                                  try {
                                    const res = await sales.submitSales([r._id]);
                                    if (res?.approval_pending) showApprovalPending(res.message);
                                    await loadSales();
                                  } catch (err) {
                                    if (err?.response?.data?.approval_pending) {
                                      showApprovalPending(err.response.data.message);
                                      await loadSales();
                                    } else {
                                      showError(err, 'Could not post sale');
                                    }
                                  } finally { setActionLoading(''); }
                                }}>Post</button>
                              )}
                              {r.status === 'POSTED' && (
                                <button className="btn btn-outline btn-sm" onClick={() => window.open(`/api/erp/print/receipt/${r._id}`, '_blank')}>
                                  🖨 Print
                                </button>
                              )}
                              {/* Phase 15.3 — CSI draft overlay. Available at any status when
                                  the sale has line items. Non-CSI sale types skip this (they
                                  don't use the BIR booklet). */}
                              {r.sale_type === 'CSI' && r.line_items && r.line_items.length > 0 && (
                                <button
                                  className="btn btn-outline btn-sm"
                                  title="Download overlay PDF — feed booklet page into printer"
                                  onClick={() => window.open(sales.csiDraftUrl(r._id), '_blank')}
                                >
                                  📄 Draft CSI
                                </button>
                              )}
                              {r.status === 'DRAFT' && (
                                <button className="btn btn-danger btn-sm" onClick={async () => {
                                  try { await sales.deleteDraft(r._id); await loadSales(); } catch (err) { showError(err, 'Could not delete sale draft'); }
                                }}>✕</button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Petty cash fund selector for CASH_RECEIPT */}
          {saleType === 'CASH_RECEIPT' && pettyCashFunds.length > 0 && (
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
              <label style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}>Deposit To:</label>
              <SelectField value={cashReceiptFundId} onChange={e => setCashReceiptFundId(e.target.value)} style={{ minWidth: 200 }}>
                <option value="">No fund (AR only)</option>
                {pettyCashFunds.map(f => <option key={f._id} value={f._id}>{f.fund_code} — {f.fund_name}</option>)}
              </SelectField>
            </div>
          )}

          {/* Desktop Table (CSI + Cash Receipt modes)
              Header row = Hospital / CSI Date / CSI# / Total / Status.
              Line items live in a nested sub-row spanning the full width so
              each product has its own batch/expiry/qty/price/line-total cells
              without fighting the header inputs for column width. Mirrors the
              Opening AR Entry layout (oar-row-main / oar-row-items) but with
              warehouse-filtered products, FIFO batch picking, override-reason
              preserved per-line — matching current Sales Entry semantics. */}
          {saleType !== 'SERVICE_INVOICE' && <div className="sales-grid sales-table-wrapper">
            <table className="sales-table">
              <thead>
                <tr>
                  <th style={{ width: 30 }}>#</th>
                  <th style={{ minWidth: 220 }}>{saleType === 'CSI' ? 'Hospital' : 'Hospital / Customer'}</th>
                  <th style={{ width: 140 }}>CSI Date</th>
                  <th style={{ width: 160 }}>CSI #</th>
                  <th style={{ width: 120 }} className="num">Total</th>
                  <th style={{ width: 140 }}>Status</th>
                  <th style={{ width: 40 }}></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => {
                  const isPosted = row.status === 'POSTED';
                  const rowCsiDate = row.csi_date
                    ? (typeof row.csi_date === 'string' ? row.csi_date.split('T')[0] : new Date(row.csi_date).toISOString().split('T')[0])
                    : '';
                  const isBackdated = liveDate && rowCsiDate && rowCsiDate < liveDate;
                  const rowTotal = (row.line_items || []).reduce((sum, li) => sum + (parseFloat(computeLineTotal(li)) || 0), 0);
                  return (
                  <Fragment key={row._id || row._tempId}>
                  <tr className="sales-row-main">
                    <td style={{ color: 'var(--erp-muted)', fontSize: 12, paddingTop: 12 }}>{idx + 1}</td>
                    <td>
                      <SelectField value={row.hospital_id?._id || row.hospital_id || row.customer_id?._id || row.customer_id || ''} onChange={e => {
                        const val = e.target.value;
                        const isCustomer = customerList.some(c => c._id === val);
                        if (isCustomer) { updateRow(idx, 'customer_id', val); updateRow(idx, 'hospital_id', ''); }
                        else { updateRow(idx, 'hospital_id', val); updateRow(idx, 'customer_id', ''); }
                      }} disabled={isPosted}>
                        <option value="">Select {saleType === 'CSI' ? 'hospital' : 'customer'}...</option>
                        <optgroup label="Hospitals">
                          {hospitals.map(h => (
                            <option key={h._id} value={h._id}>{h.hospital_name_display || h.hospital_name}</option>
                          ))}
                        </optgroup>
                        {saleType !== 'CSI' && customerList.length > 0 && (
                          <optgroup label="Customers">
                            {customerList.map(c => (
                              <option key={c._id} value={c._id}>{c.customer_name}{c.customer_type ? ` (${c.customer_type})` : ''}</option>
                            ))}
                          </optgroup>
                        )}
                      </SelectField>
                    </td>
                    <td>
                      <input
                        type="date"
                        value={rowCsiDate}
                        onChange={e => updateRow(idx, 'csi_date', e.target.value)}
                        min={liveDate || undefined}
                        disabled={isPosted}
                        style={isBackdated ? { borderColor: '#d97706' } : undefined}
                      />
                      {isBackdated && !isPosted && (
                        <div style={{ fontSize: 10, color: '#92400e', marginTop: 2, lineHeight: 1.3 }}>
                          Backdated (before {liveDate}).{' '}
                          <button
                            type="button"
                            onClick={() => navigate('/erp/sales/opening-ar')}
                            style={{ background: 'none', border: 'none', color: '#1e40af', textDecoration: 'underline', padding: 0, cursor: 'pointer', font: 'inherit' }}
                          >Open in Opening AR Entry →</button>
                        </div>
                      )}
                    </td>
                    <td>
                      <input
                        value={row.doc_ref || ''}
                        onChange={e => updateRow(idx, 'doc_ref', e.target.value)}
                        placeholder="CSI#"
                        disabled={isPosted}
                        list={`available-csi-${idx}`}
                      />
                      {saleType === 'CSI' && availableCsi.length > 0 && (
                        <datalist id={`available-csi-${idx}`}>
                          {availableCsi.slice(0, 50).map(a => (
                            <option key={`${a.booklet_id}-${a.number}`} value={a.number}>
                              {a.booklet_code ? `${a.booklet_code} · ${a.number}` : a.number}
                            </option>
                          ))}
                        </datalist>
                      )}
                    </td>
                    <td className="num sales-header-total">
                      ₱{rowTotal.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td style={{ paddingTop: 12 }}>
                      <span className="status-badge" style={{ background: STATUS_COLORS[row.status]?.bg, color: STATUS_COLORS[row.status]?.text }}>
                        {STATUS_COLORS[row.status]?.label || row.status}
                      </span>
                      {row.source === 'OPENING_AR' && (
                        <span className="status-badge" style={{ background: '#fef3c7', color: '#92400e', marginLeft: 4 }} title="Pre-live-date — no inventory deduction">Opening AR</span>
                      )}
                      {row._isDirty && (
                        <span title="Unsaved edits — click Save Drafts to persist" style={{ marginLeft: 6, color: '#d97706', fontSize: 16, fontWeight: 700 }}>●</span>
                      )}
                    </td>
                    <td style={{ paddingTop: 10 }}>
                      {row.status === 'DRAFT' && (
                        <button className="btn btn-danger btn-sm" onClick={() => removeRow(idx)} title="Remove row">&times;</button>
                      )}
                    </td>
                  </tr>
                  <tr className="sales-row-items">
                    <td></td>
                    <td colSpan={6}>
                      <div className="sales-li-section-label">Line items · {row.line_items?.length || 0}</div>
                      {(row.line_items || []).map((item, li) => {
                        const prod = item.product_id ? productOptions.find(p => (p.product_id?.toString() || p.product_id) === (item.product_id?.toString() || item.product_id)) : null;
                        const batches = prod?.batches || [];
                        const selectedBatch = item.batch_lot_no
                          ? batches.find(b => b.batch_lot_no === item.batch_lot_no)
                          : batches[0]; // FIFO = first batch (nearest expiry)
                        return (
                          <div key={li} className="sales-line-item">
                            {/* Product */}
                            <div className="cell-stack">
                              <SelectField value={item.product_id?._id || item.product_id || ''} onChange={e => updateLineItem(idx, li, 'product_id', e.target.value)} disabled={isPosted}>
                                <option value="">Select product...</option>
                                {productOptions.map(p => (
                                  <option key={p.product_id} value={p.product_id}>{p.label}</option>
                                ))}
                              </SelectField>
                              {prod?.near_expiry && (
                                <span className="near-expiry-badge" style={{ alignSelf: 'flex-start' }}>Near Expiry</span>
                              )}
                            </div>
                            {/* Batch / Lot */}
                            <div className="cell-stack">
                              {!item.product_id || batches.length === 0 ? (
                                <div style={{ fontSize: 11, padding: '8px', color: 'var(--erp-muted)' }}>—</div>
                              ) : batches.length === 1 ? (
                                <div style={{ fontSize: 12, fontWeight: 600, padding: '8px 0' }}>{batches[0].batch_lot_no} ({batches[0].available_qty})</div>
                              ) : (
                                <>
                                  <SelectField value={item.batch_lot_no || ''} onChange={e => updateLineItem(idx, li, 'batch_lot_no', e.target.value)} disabled={isPosted} className="batch-select">
                                    <option value="">Auto (FIFO)</option>
                                    {batches.map((b, bi) => (
                                      <option key={bi} value={b.batch_lot_no}>
                                        {b.batch_lot_no} — {b.available_qty} avail{b.near_expiry ? ' ⚠' : ''}{bi === 0 ? ' ★FIFO' : ''}
                                      </option>
                                    ))}
                                  </SelectField>
                                  {item.fifo_override && (
                                    <select className="override-reason" value={item.override_reason || ''} onChange={e => updateLineItem(idx, li, 'override_reason', e.target.value)} disabled={isPosted}>
                                      <option value="">Select reason...</option>
                                      <option value="HOSPITAL_POLICY">Hospital Policy</option>
                                      <option value="QA_REPLACEMENT">QA Replacement</option>
                                      <option value="DAMAGED_BATCH">Damaged Batch</option>
                                      <option value="BATCH_RECALL">Batch Recall</option>
                                    </select>
                                  )}
                                </>
                              )}
                            </div>
                            {/* Expiry */}
                            <div className="cell-stack" style={{ fontSize: 12, color: 'var(--erp-muted)', padding: '8px 0' }}>
                              <div>{selectedBatch?.expiry_date ? new Date(selectedBatch.expiry_date).toLocaleDateString() : '—'}</div>
                              {selectedBatch?.near_expiry && <span className="near-expiry-badge" style={{ alignSelf: 'flex-start' }}>Near Expiry</span>}
                            </div>
                            {/* Qty */}
                            <input type="number" min="1" value={item.qty || ''} onChange={e => updateLineItem(idx, li, 'qty', e.target.value)} disabled={isPosted} placeholder="Qty" />
                            {/* Unit */}
                            <input className="readonly" value={item.unit || ''} readOnly tabIndex={-1} />
                            {/* Unit Price */}
                            <input type="number" step="0.01" value={item.unit_price || ''} onChange={e => updateLineItem(idx, li, 'unit_price', e.target.value)} disabled={isPosted} placeholder="Price" />
                            {/* Phase R2 — Discount %. BDM-entered per-line discount (0-100). VAT base
                                shrinks per BIR RR 16-2005. Empty = 0% (no discount). Tooltip surfaces
                                the computed amount so BDM can sanity-check before save. */}
                            <input
                              type="number"
                              min="0"
                              max="100"
                              step="0.01"
                              value={item.line_discount_percent ?? ''}
                              onChange={e => updateLineItem(idx, li, 'line_discount_percent', e.target.value)}
                              disabled={isPosted}
                              placeholder="0"
                              title={(parseFloat(item.line_discount_percent) || 0) > 0
                                ? `Discount: ₱${computeLineDiscountAmount(item).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                : 'Per-line discount % (BIR trade discount; reduces VAT base)'}
                              style={{ textAlign: 'right' }}
                            />
                            {/* Line Total (after discount) */}
                            <input className="readonly" value={computeLineTotal(item)} readOnly tabIndex={-1} />
                            {/* Remove sub-line */}
                            {!isPosted ? (
                              <button type="button" className="sales-li-remove" onClick={() => removeLineItem(idx, li)} title="Remove line item">×</button>
                            ) : <span />}
                          </div>
                        );
                      })}
                      {!isPosted && (
                        <button type="button" className="sales-li-add" onClick={() => addLineItem(idx)}>+ Line Item</button>
                      )}
                    </td>
                  </tr>
                  {isRejectedRow(row) && (
                    <tr className="sales-row-reject">
                      <td colSpan={7}>
                        <RejectionBanner row={row} moduleKey="SALES" variant="row" />
                      </td>
                    </tr>
                  )}
                  </Fragment>
                  );
                })}
              </tbody>
            </table>
            <button className="add-row-btn" onClick={addRow}>+ Add Row</button>
          </div>}

          {/* Mobile Cards — mirrors the new desktop header+lines layout: card
              header shows Hospital/Date/CSI#/Total/Status, then a Line Items
              block with a ×-remove per sub-line and a "+ Line Item" button. */}
          {saleType !== 'SERVICE_INVOICE' && <div className="sales-cards">
            {rows.map((row, idx) => {
              const isPosted = row.status === 'POSTED';
              const rowTotal = (row.line_items || []).reduce((sum, li) => sum + (parseFloat(computeLineTotal(li)) || 0), 0);
              return (
              <div className="sale-card" key={row._id || row._tempId}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 700, fontSize: 14 }}>Row {idx + 1}</span>
                  <span style={{ fontWeight: 700, fontSize: 14 }}>
                    ₱{rowTotal.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                  <span className="status-badge" style={{ background: STATUS_COLORS[row.status]?.bg, color: STATUS_COLORS[row.status]?.text }}>
                    {STATUS_COLORS[row.status]?.label}
                  </span>
                  {row.source === 'OPENING_AR' && (
                    <span className="status-badge" style={{ background: '#fef3c7', color: '#92400e', marginLeft: 4, fontSize: 10 }} title="Pre-live-date — no inventory deduction">Opening AR</span>
                  )}
                  {row._isDirty && (
                    <span title="Unsaved edits — Save Drafts to persist" style={{ color: '#d97706', fontSize: 14, fontWeight: 700 }}>●</span>
                  )}
                </div>
                {isRejectedRow(row) && (
                  <RejectionBanner
                    row={row}
                    moduleKey="SALES"
                    variant="page"
                    docLabel={row.doc_ref ? `CSI ${row.doc_ref}` : `Row ${idx + 1}`}
                  />
                )}
                <label>{saleType === 'CSI' ? 'Hospital' : 'Customer'}</label>
                <SelectField value={row.hospital_id?._id || row.hospital_id || row.customer_id?._id || row.customer_id || ''} onChange={e => {
                  const val = e.target.value;
                  const isCustomer = customerList.some(c => c._id === val);
                  if (isCustomer) { updateRow(idx, 'customer_id', val); updateRow(idx, 'hospital_id', ''); }
                  else { updateRow(idx, 'hospital_id', val); updateRow(idx, 'customer_id', ''); }
                }}>
                  <option value="">Select...</option>
                  <optgroup label="Hospitals">
                    {hospitals.map(h => <option key={h._id} value={h._id}>{h.hospital_name_display || h.hospital_name}</option>)}
                  </optgroup>
                  {saleType !== 'CSI' && customerList.length > 0 && (
                    <optgroup label="Customers">
                      {customerList.map(c => (
                        <option key={c._id} value={c._id}>{c.customer_name}{c.customer_type ? ` (${c.customer_type})` : ''}</option>
                      ))}
                    </optgroup>
                  )}
                </SelectField>
                <label>CSI Date</label>
                <input type="date" value={row.csi_date ? (typeof row.csi_date === 'string' ? row.csi_date.split('T')[0] : new Date(row.csi_date).toISOString().split('T')[0]) : ''} onChange={e => updateRow(idx, 'csi_date', e.target.value)} />
                <label>CSI #</label>
                <input
                  value={row.doc_ref || ''}
                  onChange={e => updateRow(idx, 'doc_ref', e.target.value)}
                  list={`available-csi-m-${idx}`}
                />
                {saleType === 'CSI' && availableCsi.length > 0 && (
                  <>
                    <datalist id={`available-csi-m-${idx}`}>
                      {availableCsi.slice(0, 50).map(a => (
                        <option key={`m-${a.booklet_id}-${a.number}`} value={a.number}>
                          {a.booklet_code ? `${a.booklet_code} · ${a.number}` : a.number}
                        </option>
                      ))}
                    </datalist>
                    <div style={{ fontSize: 11, color: 'var(--erp-muted)', marginTop: 2 }}>
                      Available: {availableCsi.slice(0, 8).map(a => a.number).join(', ')}{availableCsi.length > 8 ? `… (+${availableCsi.length - 8})` : ''}
                    </div>
                  </>
                )}
                <label style={{ marginTop: 4 }}>Line Items · {row.line_items?.length || 0}</label>
                {row.line_items?.map((item, li) => {
                  const prod = item.product_id ? productOptions.find(p => (p.product_id?.toString() || p.product_id) === (item.product_id?.toString() || item.product_id)) : null;
                  const batches = prod?.batches || [];
                  return (
                    <div key={li} style={{ border: '1px solid var(--erp-border)', borderRadius: 8, padding: 10, marginBottom: 8, background: 'var(--erp-bg)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <strong style={{ fontSize: 12, color: 'var(--erp-muted)' }}>Item {li + 1}</strong>
                        {!isPosted && (
                          <button type="button" className="sales-li-remove" onClick={() => removeLineItem(idx, li)} aria-label="Remove line item">×</button>
                        )}
                      </div>
                      <label>Product</label>
                      <SelectField value={item.product_id || ''} onChange={e => updateLineItem(idx, li, 'product_id', e.target.value)} disabled={isPosted}>
                        <option value="">Select...</option>
                        {productOptions.map(p => <option key={p.product_id} value={p.product_id}>{p.label}</option>)}
                      </SelectField>
                      {item.product_id && batches.length > 1 && (
                        <>
                          <label>Batch / Expiry</label>
                          <SelectField value={item.batch_lot_no || ''} onChange={e => updateLineItem(idx, li, 'batch_lot_no', e.target.value)} disabled={isPosted} className="batch-select">
                            <option value="">Auto (FIFO)</option>
                            {batches.map((b, bi) => (
                              <option key={bi} value={b.batch_lot_no}>
                                {b.batch_lot_no} — Exp: {new Date(b.expiry_date).toLocaleDateString()} — {b.available_qty} avail{b.near_expiry ? ' ⚠' : ''}{bi === 0 ? ' ★FIFO' : ''}
                              </option>
                            ))}
                          </SelectField>
                          {item.fifo_override && (
                            <input className="override-reason" placeholder="Reason for skipping FIFO..." value={item.override_reason || ''} onChange={e => updateLineItem(idx, li, 'override_reason', e.target.value)} disabled={isPosted} />
                          )}
                        </>
                      )}
                      {item.product_id && batches.length === 1 && (
                        <div style={{ fontSize: 12, color: 'var(--erp-muted)', padding: '4px 0' }}>Batch: {batches[0].batch_lot_no} — Exp: {new Date(batches[0].expiry_date).toLocaleDateString()}</div>
                      )}
                      <div style={{ display: 'flex', gap: 8 }}>
                        <div style={{ flex: 1 }}><label>Qty</label><input type="number" value={item.qty || ''} onChange={e => updateLineItem(idx, li, 'qty', e.target.value)} disabled={isPosted} /></div>
                        <div style={{ flex: 1 }}><label>Price</label><input type="number" value={item.unit_price || ''} onChange={e => updateLineItem(idx, li, 'unit_price', e.target.value)} disabled={isPosted} /></div>
                        {/* Phase R2 — Disc % (mobile). Tap-target friendly; tooltip absent here
                            but discount preview chip below supplies the same info. */}
                        <div style={{ flex: 1 }}>
                          <label>Disc %</label>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="0.01"
                            value={item.line_discount_percent ?? ''}
                            onChange={e => updateLineItem(idx, li, 'line_discount_percent', e.target.value)}
                            disabled={isPosted}
                            placeholder="0"
                          />
                        </div>
                        <div style={{ flex: 1 }}><label>Total</label><input value={computeLineTotal(item)} readOnly /></div>
                      </div>
                      {(parseFloat(item.line_discount_percent) || 0) > 0 && (
                        <div style={{ fontSize: 11, color: '#b45309', marginTop: 4 }}>
                          Less {parseFloat(item.line_discount_percent)}% (₱{computeLineDiscountAmount(item).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
                        </div>
                      )}
                    </div>
                  );
                })}
                {!isPosted && (
                  <button type="button" className="sales-li-add" style={{ width: '100%', padding: 10 }} onClick={() => addLineItem(idx)}>+ Line Item</button>
                )}
                {row.status === 'DRAFT' && (
                  <div className="card-footer">
                    <button className="btn btn-danger btn-sm" onClick={() => removeRow(idx)}>Delete Row</button>
                  </div>
                )}
              </div>
              );
            })}
          </div>}

        </main>
      </div>
      {/* Scan CSI Modal — primary scan flow (full OCR + line-item matching) */}
      <ScanCSIModal
        open={scanModalOpen}
        onClose={() => setScanModalOpen(false)}
        onApply={handleScanApply}
        hospitals={hospitals}
        productOptions={productOptions}
      />
      {/* Photo-only modal — 'NEW' → toolbar "Upload CSI" creates a fresh row
          with photo attached (no OCR). Re-attaching the signed CSI to an
          already-persisted row is a SalesList-only lifecycle action now. */}
      <ScanCSIPhotoFallback
        open={photoOnlyRowIdx !== null}
        onClose={() => setPhotoOnlyRowIdx(null)}
        onApply={handlePhotoOnlyApply}
        hospitals={hospitals}
        productOptions={productOptions}
        photoOnly
        docType="CSI"
      />
    </div>
  );
}
