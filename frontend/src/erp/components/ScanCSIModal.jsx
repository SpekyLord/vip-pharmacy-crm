import { useState, useRef, useEffect } from 'react';
import { processDocument, extractExifDateTime } from '../services/ocrService';
import { matchHospital, matchProduct, fieldVal, fieldConfidence, formatReviewReason } from '../utils/ocrMatching';

const scanModalStyles = `
  .scan-modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 1000; display: flex; align-items: center; justify-content: center; padding: 16px; }
  .scan-modal { background: var(--erp-panel, #fff); border-radius: 16px; width: 100%; max-width: 520px; max-height: 90vh; overflow-y: auto; padding: 24px; position: relative; }
  .scan-modal h2 { margin: 0 0 16px; font-size: 18px; color: var(--erp-text); }
  .scan-modal .close-btn { position: absolute; top: 12px; right: 16px; background: none; border: none; font-size: 22px; cursor: pointer; color: var(--erp-muted); }
  .scan-capture-btns { display: flex; gap: 10px; margin-bottom: 16px; }
  .scan-capture-btns .btn { flex: 1; text-align: center; padding: 12px; font-size: 14px; }
  .scan-preview { width: 100%; max-height: 200px; object-fit: contain; border-radius: 8px; margin-bottom: 16px; border: 1px solid var(--erp-border); }
  .scan-progress { text-align: center; padding: 24px 0; }
  .scan-progress .spinner { width: 36px; height: 36px; border: 3px solid var(--erp-border); border-top-color: var(--erp-accent); border-radius: 50%; animation: spin 0.8s linear infinite; margin: 0 auto 12px; }
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
  .scan-photo-only-hint { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 10px 12px; color: #1e3a8a; font-size: 12px; margin-bottom: 12px; }
  @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
`;

let stylesInjected = false;
function ensureStyles() {
  if (stylesInjected || typeof document === 'undefined') return;
  const tag = document.createElement('style');
  tag.setAttribute('data-scan-csi-modal', '');
  tag.textContent = scanModalStyles;
  document.head.appendChild(tag);
  stylesInjected = true;
}

/**
 * Shared CSI scan modal — used by both Sales Entry (live) and Opening AR Entry (historical).
 *
 * Props:
 *   open, onClose: standard modal controls
 *   onApply(rowData): called with extracted hospital_id, csi_date, doc_ref, csi_photo_url,
 *     csi_attachment_id, line_items[]. Caller decides how to merge into its own row state.
 *   hospitals: array of Hospital docs for fuzzy matching
 *   productOptions: array of { product_id, brand_name, dosage_strength, unit_code, selling_price, item_key } for fuzzy matching
 *   photoOnly (default false): when true, skips OCR review/line-item flow and applies just the photo URL+attachment ID.
 *     Used by the rejection-fallback flow where contractor only needs to attach a clearer CSI photo.
 *   docType (default 'CSI'): document type passed to processDocument()
 */
export default function ScanCSIModal({ open, onClose, onApply, hospitals = [], productOptions = [], photoOnly = false, docType = 'CSI' }) {
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

  useEffect(() => { ensureStyles(); }, []);

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
      // Photo-only paths (re-upload after rejection, proof-only upload) don't
      // need OCR — skip the Vision + AI pipeline so the call returns as soon
      // as S3 responds. Also skip EXIF extraction since nothing consumes it
      // downstream in photoOnly mode.
      const exif = photoOnly ? null : await extractExifDateTime(file);
      const result = await processDocument(file, docType, exif, { skipOcr: photoOnly });
      setOcrData(result);

      if (photoOnly) {
        // Skip matching — caller only needs the photo URL + attachment ID
        setStep('results');
        return;
      }

      const hospitalText = fieldVal(result.extracted?.hospital);
      const hMatch = matchHospital(hospitalText, hospitals);
      setMatchedHospital(hMatch);

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
    const extracted = ocrData?.extracted || {};

    if (photoOnly) {
      // Caller only consumes photo URL + attachment ID (e.g. rejection-fallback re-upload)
      onApply({
        csi_photo_url: ocrData?.s3_url || '',
        csi_attachment_id: ocrData?.attachment_id || null
      });
      handleClose();
      return;
    }

    const row = {
      hospital_id: matchedHospital?.hospital?._id || '',
      csi_date: (() => {
        const d = fieldVal(extracted.date);
        if (!d) return new Date().toISOString().split('T')[0];
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
        : [{ product_id: '', qty: '', unit: '', unit_price: '', item_key: '' }]
    };

    onApply(row);
    handleClose();
  };

  if (!open) return null;

  const reviewReasons = photoOnly ? [] : [
    ...(ocrData?.review_reasons || []),
    ...(matchedItems.some(mi => !mi.product_match) ? ['UNMATCHED_PRODUCT'] : [])
  ].filter((reason, idx, arr) => arr.indexOf(reason) === idx);
  const requiresReviewAck = !photoOnly && Boolean(ocrData?.review_required || reviewReasons.length > 0);
  const canApply = !requiresReviewAck || reviewConfirmed;

  return (
    <div className="scan-modal-overlay" onClick={handleClose}>
      <div className="scan-modal" onClick={e => e.stopPropagation()}>
        <button className="close-btn" onClick={handleClose}>&times;</button>
        <h2>{photoOnly ? 'Re-upload CSI Photo' : 'Scan CSI Document'}</h2>

        {photoOnly && step === 'capture' && (
          <div className="scan-photo-only-hint">
            Your previous submission was rejected. Take or upload a clearer photo of the CSI;
            we&apos;ll attach it to this row without re-keying line items so you can resubmit immediately.
          </div>
        )}

        <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
          onChange={e => handleFile(e.target.files?.[0])} />
        <input ref={galleryRef} type="file" accept="image/*" style={{ display: 'none' }}
          onChange={e => handleFile(e.target.files?.[0])} />

        {step === 'capture' && (
          <>
            {!photoOnly && (
              <p style={{ fontSize: 13, color: 'var(--erp-muted)', marginBottom: 16 }}>
                Take a photo of a CSI (Charge Sales Invoice) or upload from gallery. OCR will extract the invoice details and pre-fill a sales row.
              </p>
            )}
            <div className="scan-capture-btns">
              <button className="btn btn-primary" onClick={() => cameraRef.current?.click()}>📷 Take Photo</button>
              <button className="btn btn-outline" onClick={() => galleryRef.current?.click()}>🖼 Gallery</button>
            </div>
          </>
        )}

        {step === 'scanning' && (
          <>
            {preview && <img src={preview} alt="CSI preview" className="scan-preview" />}
            <div className="scan-progress">
              <div className="spinner" />
              <div style={{ fontSize: 14, color: 'var(--erp-muted)' }}>{photoOnly ? 'Uploading photo...' : 'Processing CSI with OCR...'}</div>
            </div>
          </>
        )}

        {step === 'error' && (
          <>
            {preview && <img src={preview} alt="CSI preview" className="scan-preview" />}
            <div className="scan-error">{errorMsg}</div>
            <div className="scan-capture-btns">
              <button className="btn btn-primary" onClick={() => { reset(); cameraRef.current?.click(); }}>Retry Photo</button>
              <button className="btn btn-outline" onClick={() => { reset(); galleryRef.current?.click(); }}>Try Gallery</button>
              <button className="btn btn-outline" onClick={handleClose}>Cancel</button>
            </div>
          </>
        )}

        {step === 'results' && ocrData && (
          <>
            {preview && <img src={preview} alt="CSI preview" className="scan-preview" />}
            {photoOnly ? (
              <div className="scan-results">
                <div className="result-group">
                  <label>Photo Uploaded</label>
                  <div className="result-value">Ready to attach to your sales row.</div>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                  <button className="btn btn-success" onClick={handleApply} style={{ flex: 1 }}>Attach Photo</button>
                  <button className="btn btn-outline" onClick={reset}>Try Another</button>
                  <button className="btn btn-outline" onClick={handleClose}>Cancel</button>
                </div>
              </div>
            ) : (
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

                {matchedItems.length > 0 && (
                  <div className="result-group">
                    <label>Line Items ({matchedItems.length})</label>
                    <table className="scan-item-table">
                      <thead>
                        <tr><th>Product (OCR)</th><th>Matched To</th><th>Qty</th><th>Price</th></tr>
                      </thead>
                      <tbody>
                        {matchedItems.map((mi, i) => (
                          <tr key={i}>
                            <td>{mi.ocr_brand}{mi.ocr_dosage && <span style={{ color: 'var(--erp-muted)', marginLeft: 4 }}>{mi.ocr_dosage}</span>}</td>
                            <td>{mi.product_match ? (
                              <span>{mi.product_match.product.brand_name}<span className={`match-badge match-${mi.product_match.confidence.toLowerCase()}`}>{mi.product_match.confidence}</span></span>
                            ) : (<span className="match-badge match-none">No match</span>)}</td>
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
                    {reviewReasons.map((reason) => (<div key={reason}>{formatReviewReason(reason)}</div>))}
                  </div>
                )}

                {ocrData.validation_flags?.length > 0 && (
                  <div className="scan-error" style={{ marginTop: 12 }}>
                    {ocrData.validation_flags.map((f, i) => (<div key={i}>{f.message || f.type}</div>))}
                  </div>
                )}

                {requiresReviewAck && (
                  <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 12, fontSize: 13, color: 'var(--erp-text)' }}>
                    <input type="checkbox" checked={reviewConfirmed} onChange={(e) => setReviewConfirmed(e.target.checked)} style={{ marginTop: 2 }} />
                    <span>I reviewed the flagged CSI fields and still want to apply this scan.</span>
                  </label>
                )}

                <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                  <button className="btn btn-success" onClick={handleApply} style={{ flex: 1 }} disabled={!canApply}>Apply to Sales Entry</button>
                  <button className="btn btn-outline" onClick={reset}>Scan Another</button>
                  <button className="btn btn-outline" onClick={handleClose}>Cancel</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
