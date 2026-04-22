import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import { useAuth } from '../../hooks/useAuth';
import { ROLES } from '../../constants/roles';
import useCollections from '../hooks/useCollections';
import useHospitals from '../hooks/useHospitals';
import useSettings from '../hooks/useSettings';
import useAccounting from '../hooks/useAccounting';
import useErpApi from '../hooks/useErpApi';
import doctorService from '../../services/doctorService';
import { processDocument, extractExifDateTime } from '../services/ocrService';
import { matchHospital, matchCsis, fieldVal, fieldConfidence, parseCrDate, formatReviewReason } from '../utils/ocrMatching';

import SelectField from '../../components/common/Select';
import WorkflowGuide from '../components/WorkflowGuide';
import OwnerPicker from '../components/OwnerPicker';
import { showError } from '../utils/errorToast';

const pageStyles = `
  .coll-session { background: var(--erp-bg, #f4f7fb); min-height: 100vh; }
  .coll-main { flex: 1; min-width: 0; overflow-y: auto; padding: 20px; max-width: 1100px; margin: 0 auto; }
  .coll-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 12px; }
  .coll-header h1 { font-size: 22px; color: var(--erp-text); margin: 0; }
  .btn { padding: 8px 16px; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn-primary { background: var(--erp-accent, #1e5eff); color: #fff; }
  .btn-success { background: #16a34a; color: #fff; }
  .btn-outline { background: transparent; border: 1px solid var(--erp-border, #dbe4f0); color: var(--erp-text); }

  .section { background: var(--erp-panel, #fff); border: 1px solid var(--erp-border); border-radius: 12px; padding: 20px; margin-bottom: 16px; }
  .section h2 { font-size: 16px; margin: 0 0 14px; color: var(--erp-text); }
  .form-row { display: flex; gap: 12px; margin-bottom: 12px; flex-wrap: wrap; }
  .form-group { flex: 1; min-width: 150px; }
  .form-group label { display: block; font-size: 11px; color: var(--erp-muted, #5f7188); font-weight: 600; text-transform: uppercase; margin-bottom: 4px; }
  .form-group input, .form-group select { width: 100%; padding: 8px 10px; border: 1px solid var(--erp-border); border-radius: 8px; font-size: 13px; background: var(--erp-panel); color: var(--erp-text); }

  .csi-card { border: 1px solid var(--erp-border); border-radius: 10px; padding: 14px; margin-bottom: 10px; background: var(--erp-panel); }
  .csi-card.selected { border-color: #16a34a; background: #f0fdf4; }
  .csi-card-header { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .csi-card-header input[type="checkbox"] { width: 18px; height: 18px; cursor: pointer; }
  .csi-card-meta { display: flex; gap: 16px; flex-wrap: wrap; margin-top: 8px; font-size: 12px; color: var(--erp-muted); }
  .csi-card-meta span { display: flex; align-items: center; gap: 4px; }
  .csi-controls { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; margin-top: 10px; padding-top: 10px; border-top: 1px dashed var(--erp-border); }
  .csi-controls label { font-size: 11px; color: var(--erp-muted); font-weight: 600; text-transform: uppercase; }
  .csi-controls select { padding: 5px 8px; border: 1px solid var(--erp-border); border-radius: 6px; font-size: 12px; }

  .partner-area { margin-top: 8px; padding: 10px; background: var(--erp-bg); border-radius: 8px; }
  .partner-area-title { font-size: 11px; font-weight: 600; color: var(--erp-muted); text-transform: uppercase; margin-bottom: 6px; }
  .partner-row { display: flex; gap: 8px; align-items: center; margin-bottom: 6px; flex-wrap: wrap; }
  .partner-tag { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; background: #ede9fe; border-radius: 6px; font-size: 12px; color: #5b21b6; font-weight: 500; }
  .partner-tag .remove-btn { background: none; border: none; color: #991b1b; cursor: pointer; font-size: 15px; padding: 0; line-height: 1; }
  .rebate-display { font-size: 11px; color: #16a34a; font-weight: 600; }

  .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 600; }
  .summary-row { display: flex; justify-content: space-between; padding: 8px 0; border-top: 1px solid var(--erp-border); font-size: 13px; }
  .summary-row strong { font-weight: 700; }

  .btn-sm { padding: 4px 10px; font-size: 11px; }

  /* Scan CR Modal */
  .scan-modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 1000; display: flex; align-items: center; justify-content: center; padding: 16px; }
  .scan-modal { background: var(--erp-panel, #fff); border-radius: 16px; width: 100%; max-width: 560px; max-height: 90vh; overflow-y: auto; padding: 24px; position: relative; }
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
  .scan-error { background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 12px; color: #991b1b; font-size: 13px; margin-bottom: 12px; }
  .ocr-badge { display: inline-block; padding: 1px 6px; border-radius: 4px; font-size: 9px; font-weight: 600; background: #dcfce7; color: #166534; margin-left: 4px; vertical-align: middle; }

  @media(max-width: 768px) { .coll-main { padding: 76px 12px calc(96px + env(safe-area-inset-bottom, 0px)); } .form-row { flex-direction: column; } .csi-card-meta { flex-direction: column; gap: 4px; } .scan-modal { max-width: 100%; padding: 16px; } }
`;

// ── ScanCRModal — OCR scan → auto-fill hospital, CR details, CSI matches ──
function ScanCRModal({ open, onClose, onApply, hospitals }) {
  const [step, setStep] = useState('capture');
  const [preview, setPreview] = useState(null);
  const [ocrData, setOcrData] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [matchedHosp, setMatchedHosp] = useState(null);
  const [reviewConfirmed, setReviewConfirmed] = useState(false);
  const cameraRef = useRef(null);
  const galleryRef = useRef(null);

  const reset = () => { setStep('capture'); setPreview(null); setOcrData(null); setErrorMsg(''); setMatchedHosp(null); setReviewConfirmed(false); };
  const handleClose = () => { reset(); onClose(); };

  const handleFile = async (file) => {
    if (!file) return;
    setPreview(URL.createObjectURL(file));
    setStep('scanning');
    try {
      const exif = await extractExifDateTime(file);
      const result = await processDocument(file, 'CR', exif);
      setOcrData(result);
      // Fuzzy match hospital
      const hospName = fieldVal(result?.extracted?.hospital);
      if (hospName && hospitals?.length) {
        setMatchedHosp(matchHospital(hospName, hospitals));
      }
      setStep('results');
    } catch (err) {
      setErrorMsg(err?.response?.data?.message || err.message || 'OCR processing failed');
      setStep('error');
    }
  };

  const handleApply = () => {
    const e = ocrData?.extracted;
    if (!e) return;
    onApply({
      hospital_id: matchedHosp?.hospital?._id || '',
      hospital_name: matchedHosp?.hospital?.hospital_name || '',
      cr_no: fieldVal(e.cr_no),
      cr_date: parseCrDate(fieldVal(e.date)),
      cr_amount: fieldVal(e.amount),
      payment_mode: fieldVal(e.payment_mode) || 'CHECK',
      check_no: fieldVal(e.check_no),
      bank: fieldVal(e.bank),
      settled_csis: (e.settled_csis || []).map(sc => ({
        csi_no: fieldVal(sc.csi_no),
        amount: parseFloat(fieldVal(sc.amount)) || 0
      })),
      s3_url: ocrData?.s3_url || '',
      attachment_id: ocrData?.attachment_id || null
    });
    handleClose();
  };

  if (!open) return null;

  const extracted = ocrData?.extracted;
  const reviewReasons = [
    ...(ocrData?.review_reasons || []),
    ...(!matchedHosp && extracted?.hospital ? ['UNMATCHED_HOSPITAL'] : []),
  ].filter((r, i, arr) => arr.indexOf(r) === i);
  const requiresReviewAck = Boolean(ocrData?.review_required || reviewReasons.length > 0);
  const canApply = !requiresReviewAck || reviewConfirmed;

  return (
    <div className="scan-modal-overlay" onClick={handleClose}>
      <div className="scan-modal" onClick={e => e.stopPropagation()}>
        <button className="close-btn" onClick={handleClose}>&times;</button>
        <h2>Scan Collection Receipt</h2>

        <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
          onChange={e => handleFile(e.target.files?.[0])} />
        <input ref={galleryRef} type="file" accept="image/*" style={{ display: 'none' }}
          onChange={e => handleFile(e.target.files?.[0])} />

        {step === 'capture' && (
          <div>
            <p style={{ fontSize: 13, color: 'var(--erp-muted)', marginBottom: 12 }}>
              Take a photo of a Collection Receipt (CR) or upload from gallery. OCR will extract hospital, CR details, and settled CSIs to auto-fill the form.
            </p>
            <div className="scan-capture-btns">
              <button className="btn btn-primary" onClick={() => cameraRef.current?.click()}>Take Photo</button>
              <button className="btn btn-outline" onClick={() => galleryRef.current?.click()}>Gallery</button>
            </div>
          </div>
        )}

        {step === 'scanning' && (
          <div>
            {preview && <img src={preview} alt="CR preview" className="scan-preview" />}
            <div className="scan-progress">
              <div className="spinner" />
              <div style={{ fontSize: 13, color: 'var(--erp-muted)' }}>Processing CR with OCR...</div>
            </div>
          </div>
        )}

        {step === 'error' && (
          <div>
            {preview && <img src={preview} alt="CR preview" className="scan-preview" />}
            <div className="scan-error">{errorMsg}</div>
            <div className="scan-capture-btns">
              <button className="btn btn-primary" onClick={() => { reset(); cameraRef.current?.click(); }}>Re-scan</button>
              <button className="btn btn-outline" onClick={() => { reset(); galleryRef.current?.click(); }}>Gallery</button>
              <button className="btn btn-outline" onClick={handleClose}>Cancel</button>
            </div>
          </div>
        )}

        {step === 'results' && extracted && (
          <div>
            {preview && <img src={preview} alt="CR preview" className="scan-preview" />}
            <div className="scan-results">
              {/* Hospital */}
              <div className="result-group">
                <label>Hospital / Received From</label>
                <div className="result-value">
                  {fieldVal(extracted.hospital) || '(not detected)'}
                  {matchedHosp ? (
                    <span className={`match-badge match-${matchedHosp.confidence.toLowerCase()}`}>
                      {matchedHosp.confidence} — {matchedHosp.hospital.hospital_name}
                    </span>
                  ) : extracted.hospital ? (
                    <span className="match-badge match-none">NO MATCH</span>
                  ) : null}
                </div>
              </div>

              {/* CR Details */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div className="result-group">
                  <label>CR Number</label>
                  <div className="result-value">
                    {fieldVal(extracted.cr_no) || '—'}
                    {fieldConfidence(extracted.cr_no) && <span className={`match-badge match-${fieldConfidence(extracted.cr_no).toLowerCase()}`}>{fieldConfidence(extracted.cr_no)}</span>}
                  </div>
                </div>
                <div className="result-group">
                  <label>Date</label>
                  <div className="result-value">
                    {fieldVal(extracted.date) || '—'}
                    {fieldConfidence(extracted.date) && <span className={`match-badge match-${fieldConfidence(extracted.date).toLowerCase()}`}>{fieldConfidence(extracted.date)}</span>}
                  </div>
                </div>
                <div className="result-group">
                  <label>Amount</label>
                  <div className="result-value">
                    {fieldVal(extracted.amount) ? `P${Number(fieldVal(extracted.amount)).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '—'}
                  </div>
                </div>
                <div className="result-group">
                  <label>Payment Mode</label>
                  <div className="result-value">{fieldVal(extracted.payment_mode) || '—'}</div>
                </div>
              </div>

              {/* Check details (if CHECK) */}
              {fieldVal(extracted.payment_mode) === 'CHECK' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 4 }}>
                  <div className="result-group">
                    <label>Check No.</label>
                    <div className="result-value">{fieldVal(extracted.check_no) || '—'}</div>
                  </div>
                  <div className="result-group">
                    <label>Bank</label>
                    <div className="result-value">{fieldVal(extracted.bank) || '—'}</div>
                  </div>
                </div>
              )}

              {/* Settled CSIs */}
              {(extracted.settled_csis || []).length > 0 && (
                <div className="result-group" style={{ marginTop: 8 }}>
                  <label>Settled CSIs ({extracted.settled_csis.length})</label>
                  <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse', marginTop: 4 }}>
                    <thead>
                      <tr style={{ background: 'var(--erp-bg)' }}>
                        <th style={{ padding: '4px 8px', textAlign: 'left' }}>CSI #</th>
                        <th style={{ padding: '4px 8px', textAlign: 'right' }}>Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {extracted.settled_csis.map((sc, i) => (
                        <tr key={i} style={{ borderTop: '1px solid var(--erp-border)' }}>
                          <td style={{ padding: '3px 8px' }}>{fieldVal(sc.csi_no) || '—'}</td>
                          <td style={{ padding: '3px 8px', textAlign: 'right' }}>{fieldVal(sc.amount) ? `P${Number(fieldVal(sc.amount)).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Validation flags */}
              {(ocrData?.validation_flags || []).length > 0 && (
                <div className="scan-error" style={{ marginTop: 12 }}>
                  {ocrData.validation_flags.map((f, i) => <div key={i}>{f}</div>)}
                </div>
              )}

              {/* Review reasons */}
              {reviewReasons.length > 0 && (
                <div className="scan-error" style={{ marginTop: 12, background: '#fff7ed', color: '#9a3412', border: '1px solid #fdba74' }}>
                  {reviewReasons.map((r, i) => <div key={i}>{formatReviewReason(r)}</div>)}
                </div>
              )}

              {requiresReviewAck && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 12, fontSize: 12, cursor: 'pointer' }}>
                  <input type="checkbox" checked={reviewConfirmed} onChange={e => setReviewConfirmed(e.target.checked)} />
                  <span>I reviewed the flagged fields and still want to apply this scan.</span>
                </label>
              )}

              <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                <button className="btn btn-primary" onClick={handleApply} disabled={!canApply}>
                  Apply to Form
                </button>
                <button className="btn btn-outline" onClick={() => { reset(); cameraRef.current?.click(); }}>Re-scan</button>
                <button className="btn btn-outline" onClick={handleClose}>Cancel</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function CollectionSession() {
  const { user } = useAuth();
  const collections = useCollections();
  const { hospitals } = useHospitals();
  const { settings } = useSettings();
  const { getMyBankAccounts } = useAccounting();
  const lookupApi = useErpApi();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [paymentModes, setPaymentModes] = useState([]);
  const [deepLinkNotice, setDeepLinkNotice] = useState('');

  const [hospitalId, setHospitalId] = useState('');
  const [customerId, setCustomerId] = useState('');
  // Phase G4.5b — proxy entry. Empty = self; otherwise target BDM's User._id.
  // OwnerPicker only renders for eligible proxies (role + sub-perm).
  const [assignedTo, setAssignedTo] = useState('');
  const [customerList, setCustomerList] = useState([]);
  const [openCsis, setOpenCsis] = useState([]);
  const [selectedCsis, setSelectedCsis] = useState(new Map());
  const [crNo, setCrNo] = useState('');
  const [crDate, setCrDate] = useState(new Date().toISOString().split('T')[0]);
  const [crAmount, setCrAmount] = useState('');
  const [paymentMode, setPaymentMode] = useState('CHECK');
  const [checkNo, setCheckNo] = useState('');
  const [checkDate, setCheckDate] = useState('');
  const [bank, setBank] = useState('');
  const [bankAccountId, setBankAccountId] = useState('');
  const [bankAccountsList, setBankAccountsList] = useState([]);
  const [pettyCashFundId, setPettyCashFundId] = useState('');
  const [pettyCashFunds, setPettyCashFunds] = useState([]);
  const [cwtRate, setCwtRate] = useState('');
  const [cwtNa, setCwtNa] = useState(false);
  const [saving, setSaving] = useState(false);

  // Document uploads
  const [crPhotoUrl, setCrPhotoUrl] = useState('');
  const [csiPhotoUrls, setCsiPhotoUrls] = useState([]);
  const [depositSlipUrl, setDepositSlipUrl] = useState('');
  const [cwtCertUrl, setCwtCertUrl] = useState('');
  const [attachmentIds, setAttachmentIds] = useState([]);
  const [uploading, setUploading] = useState('');
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const [pendingUploadType, setPendingUploadType] = useState('');

  // OCR scan state
  const [scanCrOpen, setScanCrOpen] = useState(false);
  const [ocrFilledFields, setOcrFilledFields] = useState(new Set());
  const pendingCsiMatch = useRef(null);

  // Deep-link from AR Aging: pre-select a specific CSI after open CSIs load
  const pendingCsiPreselect = useRef(null);
  const deepLinkConsumed = useRef(false);

  // CRM Doctor list for partner tags (filtered by BDMs who own the open CSIs)
  const [crmDoctors, setCrmDoctors] = useState([]);

  const commRates = useMemo(() => settings?.COMMISSION_RATES || [0, 0.005, 0.01, 0.02, 0.03, 0.04, 0.05], [settings]);
  const rebateRates = useMemo(() => settings?.PARTNER_REBATE_RATES || [1, 2, 3, 5, 20, 25], [settings]);
  const vatRate = useMemo(() => settings?.VAT_RATE || 0.12, [settings]);
  const canAccessAccounting = useMemo(() => {
    if (!user) return false;
    if (user.role === ROLES.PRESIDENT || user.role === ROLES.CEO) return true;
    if (user.role === ROLES.ADMIN && (!user.erp_access || !user.erp_access.enabled)) return true;
    if (!user.erp_access || !user.erp_access.enabled) return false;
    const level = user.erp_access.modules?.accounting || 'NONE';
    return level !== 'NONE';
  }, [user]);

  // Derive net_of_vat from invoice_amount when the original value is missing
  const getNetOfVat = useCallback((entry, csi) => {
    if (entry?.net_of_vat > 0) return entry.net_of_vat;
    if (csi?.total_net_of_vat > 0) return csi.total_net_of_vat;
    const amt = entry?.invoice_amount || csi?.balance_due || 0;
    return Math.round(amt / (1 + vatRate) * 100) / 100;
  }, [vatRate]);

  useEffect(() => {
    lookupApi.get('/lookups/payment-modes').then(r => setPaymentModes(r?.data || [])).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Deep-link entry from AR Aging / other pages:
  //   ?hospital_id=<id>&sales_line_id=<id>   → pre-select hospital + invoice
  //   ?customer_id=<id>&sales_line_id=<id>   → pre-select customer + invoice
  // The sales_line_id is resolved after the open-CSI list loads (see effect below).
  // Entity/BDM scope is enforced by the backend getOpenCsis — out-of-scope IDs yield no match.
  useEffect(() => {
    if (deepLinkConsumed.current) return;
    const qHospital = searchParams.get('hospital_id');
    const qCustomer = searchParams.get('customer_id');
    const qSalesLine = searchParams.get('sales_line_id');
    if (!qHospital && !qCustomer && !qSalesLine) return;
    deepLinkConsumed.current = true;

    if (qHospital) { setHospitalId(qHospital); setCustomerId(''); }
    else if (qCustomer) { setCustomerId(qCustomer); setHospitalId(''); }
    if (qSalesLine) pendingCsiPreselect.current = qSalesLine;
    if (qHospital || qCustomer || qSalesLine) {
      setDeepLinkNotice(
        qSalesLine
          ? 'Opened from AR Aging — hospital loaded, invoice will be pre-selected.'
          : 'Opened from AR Aging — hospital loaded.'
      );
    }

    // Clean query string so back/forward + reload don't re-trigger pre-select on user edits
    const next = new URLSearchParams(searchParams);
    next.delete('hospital_id'); next.delete('customer_id'); next.delete('sales_line_id');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  // Load CRM doctors (assigned to + visited by) the BDM who owns the CSIs
  // Priority: CSI bdm_id → warehouse manager (fallback)
  useEffect(() => {
    if (!openCsis.length) { setCrmDoctors([]); return; }

    const fetchDoctorsForBdm = async (bdmId) => {
      const res = await doctorService.getByBdm(bdmId);
      return (res.data?.data || res.data || []);
    };

    (async () => {
      try {
        // 1. Try CSI bdm_id first
        const csiBdmIds = [...new Set(openCsis.map(c => c.bdm_id).filter(Boolean))];
        let allDocs = [];
        for (const id of csiBdmIds) {
          const docs = await fetchDoctorsForBdm(id);
          allDocs.push(...docs);
        }

        // 2. Fallback: warehouse manager if CSI bdm_id yielded no doctors
        if (!allDocs.length) {
          const warehouseIds = [...new Set(openCsis.map(c => c.warehouse_id).filter(Boolean))];
          for (const whId of warehouseIds) {
            try {
              const wh = await lookupApi.get(`/warehouse/${whId}`);
              const mgrId = wh?.data?.manager_id?._id || wh?.data?.manager_id;
              if (mgrId) {
                const docs = await fetchDoctorsForBdm(mgrId);
                allDocs.push(...docs);
              }
            } catch { /* skip */ }
          }
        }

        // Dedupe, format, sort
        const seen = new Set();
        const docs = [];
        for (const d of allDocs) {
          if (seen.has(d._id)) continue;
          seen.add(d._id);
          docs.push({ _id: d._id, name: `${d.lastName}, ${d.firstName}`, specialty: d.specialization || '' });
        }
        docs.sort((a, b) => a.name.localeCompare(b.name));
        setCrmDoctors(docs);
      } catch { setCrmDoctors([]); }
    })();
  }, [openCsis]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load bank accounts + petty cash funds for "Deposited At" dropdown
  useEffect(() => {
    let isActive = true;

    getMyBankAccounts().then(r => setBankAccountsList(r?.data || [])).catch(err => console.error('[CollectionSession]', err.message));

    if (!canAccessAccounting) {
      setPettyCashFunds([]);
      return () => {
        isActive = false;
      };
    }

    import('../../services/api').then(({ default: api }) => {
      if (!isActive) return;

      api.get('/erp/petty-cash/funds')
        .then((res) => {
          if (isActive) setPettyCashFunds(res.data?.data || []);
        })
        .catch((err) => {
          if (!isActive) return;
          if (err.response?.status === 403) {
            setPettyCashFunds([]);
            return;
          }
          console.error('[CollectionSession]', err.message);
        });
    });

    return () => {
      isActive = false;
    };
  }, [canAccessAccounting, getMyBankAccounts]);

  // Load customers list
  useEffect(() => {
    import('../../services/api').then(({ default: api }) => {
      api.get('/erp/customers', { params: { limit: 0, status: 'ACTIVE' } })
        .then(res => setCustomerList(res.data?.data || []))
        .catch(err => console.error('[CollectionSession]', err.message));
    });
  }, []);

  // Load open CSIs when hospital/customer changes
  useEffect(() => {
    const activeId = hospitalId || customerId;
    if (!activeId) { setOpenCsis([]); setSelectedCsis(new Map()); return; }
    // Phase G4.5b — when proxy entry is in use, scope the Open CSIs query to
    // the target BDM. Without this, backend returns the proxy's own (empty)
    // AR and the CSI picker looks broken.
    collections.getOpenCsis(activeId, null, { isCustomer: !!customerId, bdmId: assignedTo || null }).then(res => {
      setOpenCsis(res?.data || []);
      setSelectedCsis(new Map());
      if (hospitalId) {
        const h = hospitals.find(h => h._id === hospitalId);
        if (h?.cwt_rate) setCwtRate(String(h.cwt_rate));
      }
    }).catch(err => console.error('[CollectionSession]', err.message));
  }, [hospitalId, customerId, assignedTo]); // eslint-disable-line react-hooks/exhaustive-deps

  // Deferred CSI auto-selection after OCR scan (open CSIs load async after hospital change)
  useEffect(() => {
    if (!pendingCsiMatch.current || !openCsis.length) return;
    const extracted = pendingCsiMatch.current;
    pendingCsiMatch.current = null;

    const matches = matchCsis(extracted, openCsis);
    const newSelected = new Map();
    for (const m of matches) {
      if (!m.matched) continue;
      const csi = m.matched;
      const invoiceAmt = csi.balance_due || 0;
      const netVat = csi.total_net_of_vat > 0
        ? csi.total_net_of_vat
        : Math.round(invoiceAmt / (1 + (settings?.VAT_RATE || 0.12)) * 100) / 100;
      newSelected.set(csi._id, {
        sales_line_id: csi._id, doc_ref: csi.doc_ref, csi_date: csi.csi_date,
        invoice_amount: invoiceAmt, net_of_vat: netVat,
        source: csi.source, commission_rate: 0.03, partner_tags: []
      });
    }
    if (newSelected.size > 0) setSelectedCsis(newSelected);
  }, [openCsis, settings]);

  // Deferred CSI pre-select after AR-Aging deep-link (open CSIs load async after hospital change)
  useEffect(() => {
    if (!pendingCsiPreselect.current || !openCsis.length) return;
    const targetId = String(pendingCsiPreselect.current);
    const csi = openCsis.find(c => String(c._id) === targetId);
    pendingCsiPreselect.current = null;
    if (!csi) {
      setDeepLinkNotice('Invoice from AR Aging is no longer open (already collected or out of scope).');
      return;
    }
    const invoiceAmt = csi.balance_due || 0;
    const netVat = csi.total_net_of_vat > 0
      ? csi.total_net_of_vat
      : Math.round(invoiceAmt / (1 + (settings?.VAT_RATE || 0.12)) * 100) / 100;
    setSelectedCsis(prev => {
      const next = new Map(prev);
      next.set(csi._id, {
        sales_line_id: csi._id, doc_ref: csi.doc_ref, csi_date: csi.csi_date,
        invoice_amount: invoiceAmt, net_of_vat: netVat,
        source: csi.source, commission_rate: 0.03, partner_tags: []
      });
      return next;
    });
    setDeepLinkNotice(`Pre-selected CSI #${csi.doc_ref} from AR Aging.`);
  }, [openCsis, settings]);

  const toggleCsi = (csi) => {
    setSelectedCsis(prev => {
      const next = new Map(prev);
      if (next.has(csi._id)) {
        next.delete(csi._id);
      } else {
        // Derive net_of_vat from balance_due when total_net_of_vat is missing (e.g. OPENING_AR)
        const invoiceAmt = csi.balance_due || 0;
        const netVat = csi.total_net_of_vat > 0
          ? csi.total_net_of_vat
          : Math.round(invoiceAmt / (1 + (settings?.VAT_RATE || 0.12)) * 100) / 100;
        next.set(csi._id, {
          sales_line_id: csi._id, doc_ref: csi.doc_ref, csi_date: csi.csi_date,
          invoice_amount: invoiceAmt, net_of_vat: netVat,
          source: csi.source, commission_rate: 0.03, partner_tags: []
        });
      }
      return next;
    });
  };

  const updateCsiField = (id, field, value) => {
    setSelectedCsis(prev => {
      const next = new Map(prev);
      next.set(id, { ...next.get(id), [field]: value });
      return next;
    });
  };

  const addPartnerTag = useCallback((csiId, doctorId) => {
    const doc = crmDoctors.find(d => d._id === doctorId);
    if (!doc) return;
    setSelectedCsis(prev => {
      const next = new Map(prev);
      const entry = { ...next.get(csiId) };
      if (entry.partner_tags?.some(t => t.doctor_id === doctorId)) return prev;
      entry.partner_tags = [...(entry.partner_tags || []), {
        doctor_id: doc._id, doctor_name: doc.name, rebate_pct: rebateRates[0] || 1
      }];
      next.set(csiId, entry);
      return next;
    });
  }, [crmDoctors, rebateRates]);

  const removePartnerTag = useCallback((csiId, doctorId) => {
    setSelectedCsis(prev => {
      const next = new Map(prev);
      const entry = { ...next.get(csiId) };
      entry.partner_tags = (entry.partner_tags || []).filter(t => t.doctor_id !== doctorId);
      next.set(csiId, entry);
      return next;
    });
  }, []);

  const updatePartnerRebate = useCallback((csiId, doctorId, rebatePct) => {
    setSelectedCsis(prev => {
      const next = new Map(prev);
      const entry = { ...next.get(csiId) };
      entry.partner_tags = (entry.partner_tags || []).map(t =>
        t.doctor_id === doctorId ? { ...t, rebate_pct: parseFloat(rebatePct) } : t
      );
      next.set(csiId, entry);
      return next;
    });
  }, []);

  const selectedList = [...selectedCsis.values()];
  const totalCsiAmount = selectedList.reduce((sum, s) => sum + (s.invoice_amount || 0), 0);
  const computedCwt = cwtNa ? 0 : totalCsiAmount * (parseFloat(cwtRate) || 0);
  const expectedCr = totalCsiAmount - computedCwt;

  // CR scan → auto-fill handler
  const handleCrScanApply = useCallback((data) => {
    const filled = new Set();

    // Auto-select hospital
    if (data.hospital_id) {
      setHospitalId(data.hospital_id);
      setCustomerId('');
      filled.add('hospital');
    }

    // Auto-fill CR details
    if (data.cr_no) { setCrNo(data.cr_no); filled.add('crNo'); }
    if (data.cr_date) { setCrDate(data.cr_date); filled.add('crDate'); }
    if (data.cr_amount) { setCrAmount(String(data.cr_amount)); filled.add('crAmount'); }
    if (data.payment_mode) { setPaymentMode(data.payment_mode); filled.add('paymentMode'); }
    if (data.check_no) { setCheckNo(data.check_no); filled.add('checkNo'); }
    if (data.bank) { setBank(data.bank); filled.add('bank'); }

    // Store CR photo (scan doubles as upload)
    if (data.s3_url) {
      setCrPhotoUrl(data.s3_url);
      filled.add('crPhoto');
    }
    if (data.attachment_id) setAttachmentIds(prev => [...prev, data.attachment_id]);

    // Stash extracted CSIs for deferred matching (open CSIs load async after hospital change)
    if (data.settled_csis?.length) {
      pendingCsiMatch.current = data.settled_csis;
    }

    setOcrFilledFields(filled);
  }, []);

  // Upload handler — uploads file via OCR endpoint which stores to S3 and returns s3_url
  const handleUpload = async (file, uploadType) => {
    if (!file) return;
    setUploading(uploadType);
    try {
      // Map upload type to OCR doc type
      const docTypeMap = { cr_photo: 'CR', cwt_cert: 'CWT_2307', deposit_slip: 'CR', csi_photo: 'CSI' };
      const result = await processDocument(file, docTypeMap[uploadType] || 'CR');
      const url = result?.s3_url;
      if (!url) throw new Error('No URL returned');

      if (uploadType === 'cr_photo') {
        setCrPhotoUrl(url);
        // If CR details are empty, auto-fill from OCR extraction
        if (!crNo && !hospitalId && result?.extracted) {
          const e = result.extracted;
          handleCrScanApply({
            hospital_id: matchHospital(fieldVal(e.hospital), hospitals)?.hospital?._id || '',
            cr_no: fieldVal(e.cr_no),
            cr_date: parseCrDate(fieldVal(e.date)),
            cr_amount: fieldVal(e.amount),
            payment_mode: fieldVal(e.payment_mode) || 'CHECK',
            check_no: fieldVal(e.check_no),
            bank: fieldVal(e.bank),
            settled_csis: (e.settled_csis || []).map(sc => ({
              csi_no: fieldVal(sc.csi_no),
              amount: parseFloat(fieldVal(sc.amount)) || 0
            })),
            s3_url: '', // already set above
            attachment_id: null
          });
        }
      } else if (uploadType === 'cwt_cert') setCwtCertUrl(url);
      else if (uploadType === 'deposit_slip') setDepositSlipUrl(url);
      else if (uploadType === 'csi_photo') setCsiPhotoUrls(prev => [...prev, url]);

      // Phase 9.1b: collect attachment IDs for linking
      if (result?.attachment_id) setAttachmentIds(prev => [...prev, result.attachment_id]);
    } catch (err) {
      showError(err, 'Could not upload document');
    } finally { setUploading(''); }
  };

  const triggerUpload = (type) => {
    setPendingUploadType(type);
    fileInputRef.current?.click();
  };

  const triggerCamera = (type) => {
    setPendingUploadType(type);
    cameraInputRef.current?.click();
  };

  const onFileSelected = (e) => {
    const file = e.target.files?.[0];
    if (file && pendingUploadType) handleUpload(file, pendingUploadType);
    e.target.value = '';
  };

  const handleSave = async () => {
    const issues = [];
    if (!hospitalId && !customerId) issues.push('Select a hospital or customer');
    if (!crNo) issues.push('CR number is required');
    if (!selectedList.length) issues.push('Select at least one invoice');
    const parsedAmount = parseFloat(crAmount) || 0;
    if (parsedAmount <= 0) issues.push('CR amount must be greater than 0');
    if (paymentMode === 'CHECK' && !checkNo) issues.push('Check number is required for CHECK payments');
    if (paymentMode === 'CHECK' && !bank) issues.push('Bank name is required for CHECK payments');
    if (issues.length) { showError(null, issues.join('. ')); return; }
    setSaving(true);
    try {
      await collections.createCollection({
        // Phase G4.5b — proxy entry: backend resolves this against
        // PROXY_ENTRY_ROLES.COLLECTIONS lookup + collections.proxy_entry sub-perm
        // and throws 403 if the caller isn't eligible. Self-entry when empty.
        assigned_to: assignedTo || undefined,
        hospital_id: hospitalId || undefined, customer_id: customerId || undefined, cr_no: crNo, cr_date: crDate,
        cr_amount: parseFloat(crAmount) || expectedCr,
        settled_csis: selectedList,
        cwt_rate: parseFloat(cwtRate) || 0, cwt_amount: computedCwt, cwt_na: cwtNa,
        payment_mode: paymentMode,
        bank_account_id: bankAccountId || undefined,
        petty_cash_fund_id: pettyCashFundId || undefined,
        check_no: checkNo || undefined, check_date: checkDate || undefined, bank: bank || undefined,
        cr_photo_url: crPhotoUrl || undefined,
        csi_photo_urls: csiPhotoUrls.length ? csiPhotoUrls : undefined,
        deposit_slip_url: depositSlipUrl || undefined,
        cwt_certificate_url: cwtCertUrl || undefined,
        attachment_ids: attachmentIds.length ? attachmentIds : undefined
      });
      navigate('/erp/collections');
    } catch (err) {
      showError(err, 'Could not save collection');
    } finally { setSaving(false); }
  };

  return (
    <div className="admin-page erp-page coll-session">
      <style>{pageStyles}</style>
      <Navbar />
      <div className="admin-layout">
        <Sidebar />
        <main className="coll-main">
          <WorkflowGuide pageKey="collection-session" />
          {deepLinkNotice && (
            <div style={{
              background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1e40af',
              padding: '10px 14px', borderRadius: 10, fontSize: 13, marginBottom: 12,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8
            }}>
              <span>{deepLinkNotice}</span>
              <button className="btn btn-sm btn-outline" onClick={() => setDeepLinkNotice('')} style={{ padding: '2px 8px' }}>Dismiss</button>
            </div>
          )}
          <div className="coll-header">
            <h1>New Collection Receipt</h1>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" onClick={() => setScanCrOpen(true)}>Scan CR to Auto-Fill</button>
              <button className="btn btn-outline" onClick={() => navigate('/erp/collections')}>Back to List</button>
            </div>
          </div>

          {/* Step 1: Hospital */}
          <div className="section">
            <h2>1. Select Hospital</h2>
            <div className="form-row" style={{ alignItems: 'flex-end' }}>
              {/* Phase G4.5b — OwnerPicker renders only for eligible proxies.
                  When a target BDM is chosen the Open CSIs query below rescopes
                  to their AR so the picker displays the target's invoices. */}
              <OwnerPicker module="collections" subKey="proxy_entry" moduleLookupCode="COLLECTIONS" value={assignedTo} onChange={setAssignedTo} />
              <div className="form-group" style={{ flex: 2 }}>
                <label>Hospital / Customer (one CR per account) {ocrFilledFields.has('hospital') && <span className="ocr-badge">OCR</span>}</label>
                <SelectField value={hospitalId || customerId || ''} onChange={e => {
                  const val = e.target.value;
                  const isCustomer = customerList.some(c => c._id === val);
                  if (isCustomer) { setCustomerId(val); setHospitalId(''); }
                  else { setHospitalId(val); setCustomerId(''); }
                }}>
                  <option value="">Select...</option>
                  <optgroup label="Hospitals">
                    {hospitals.map(h => <option key={h._id} value={h._id}>{h.hospital_name_display || h.hospital_name}</option>)}
                  </optgroup>
                  {customerList.length > 0 && (
                    <optgroup label="Customers">
                      {customerList.map(c => <option key={c._id} value={c._id}>{c.customer_name}{c.customer_type ? ` (${c.customer_type})` : ''}</option>)}
                    </optgroup>
                  )}
                </SelectField>
              </div>
            </div>
          </div>

          {/* Step 2: CSIs with inline commission + partner tags */}
          {(hospitalId || customerId) && (
            <div className="section">
              <h2>2. Select CSIs — Commission & Partner Rebate</h2>
              {openCsis.length === 0 ? (
                <p style={{ color: 'var(--erp-muted)', fontSize: 13 }}>No open CSIs for this hospital</p>
              ) : (
                openCsis.map(csi => {
                  const isSelected = selectedCsis.has(csi._id);
                  const entry = selectedCsis.get(csi._id);
                  return (
                    <div key={csi._id} className={`csi-card ${isSelected ? 'selected' : ''}`}>
                      {/* Header row: checkbox + doc ref + source badge */}
                      <div className="csi-card-header">
                        <input type="checkbox" checked={isSelected} onChange={() => toggleCsi(csi)} />
                        <strong style={{ fontSize: 14 }}>CSI# {csi.doc_ref}</strong>
                        <span className="badge" style={csi.source === 'OPENING_AR'
                          ? { background: '#fef3c7', color: '#92400e' }
                          : { background: '#e0f2fe', color: '#0369a1' }}>
                          {csi.source === 'OPENING_AR' ? 'Opening AR' : 'Sales'}
                        </span>
                        <span style={{ marginLeft: 'auto', fontSize: 16, fontWeight: 700 }}>
                          P{(csi.balance_due || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                      {/* Meta: date, invoice total, days outstanding */}
                      <div className="csi-card-meta">
                        <span>Date: {new Date(csi.csi_date).toLocaleDateString('en-PH')}</span>
                        <span>Invoice: P{(csi.invoice_total || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                        <span>Outstanding: {csi.days_outstanding}d</span>
                        <span>Net of VAT: P{(csi.total_net_of_vat || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                      </div>
                      {/* Commission + Partner tags — only when selected */}
                      {isSelected && (
                        <>
                          <div className="csi-controls">
                            <div>
                              <label>Commission %</label>
                              <SelectField value={entry?.commission_rate || 0} onChange={e => updateCsiField(csi._id, 'commission_rate', parseFloat(e.target.value))}>
                                {commRates.map(r => <option key={r} value={r}>{(r * 100).toFixed(1)}%</option>)}
                              </SelectField>
                              <span style={{ fontSize: 11, marginLeft: 6, color: '#16a34a', fontWeight: 600 }}>
                                = P{(getNetOfVat(entry, csi) * (entry?.commission_rate || 0)).toFixed(2)}
                              </span>
                            </div>
                          </div>

                          {/* Partner Tags */}
                          <div className="partner-area">
                            <div className="partner-area-title">Partner Tags (VIP Client — MD Rebate)</div>

                            {(entry?.partner_tags || []).map(tag => (
                              <div key={tag.doctor_id} className="partner-row">
                                <span className="partner-tag">
                                  {tag.doctor_name}
                                  <button className="remove-btn" onClick={() => removePartnerTag(csi._id, tag.doctor_id)} title="Remove">&times;</button>
                                </span>
                                <SelectField value={tag.rebate_pct} onChange={e => updatePartnerRebate(csi._id, tag.doctor_id, e.target.value)}>
                                  {rebateRates.map(r => <option key={r} value={r}>{r}%</option>)}
                                </SelectField>
                                <span className="rebate-display">
                                  = P{(getNetOfVat(entry, csi) * (tag.rebate_pct / 100)).toFixed(2)} rebate
                                </span>
                              </div>
                            ))}

                            <div className="partner-row">
                              <SelectField
                                value=""
                                onChange={e => { if (e.target.value) addPartnerTag(csi._id, e.target.value); }}
                                style={{ minWidth: 220 }}
                              >
                                <option value="">+ Add VIP Client partner...</option>
                                {crmDoctors
                                  .filter(d => !(entry?.partner_tags || []).some(t => t.doctor_id === d._id))
                                  .map(d => <option key={d._id} value={d._id}>{d.name}{d.specialty ? ` — ${d.specialty}` : ''}</option>)
                                }
                              </SelectField>
                            </div>

                            {!(entry?.partner_tags || []).length && (
                              <div style={{ fontSize: 11, color: 'var(--erp-muted)', fontStyle: 'italic' }}>Optional — not all CSIs have partner MDs</div>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })
              )}

              {selectedList.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div className="summary-row"><span>Total CSI Amount:</span><strong>P{totalCsiAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong></div>
                </div>
              )}
            </div>
          )}

          {/* Step 3: CR Details */}
          {selectedList.length > 0 && (
            <div className="section">
              <h2>3. CR Details</h2>
              <div className="form-row">
                <div className="form-group">
                  <label>CR Number {ocrFilledFields.has('crNo') && <span className="ocr-badge">OCR</span>}{paymentMode === 'CASH' && !crNo && <span style={{ fontSize: 10, color: 'var(--erp-accent)', cursor: 'pointer', marginLeft: 8 }} onClick={async () => {
                    try {
                      const { default: api } = await import('../../services/api');
                      const res = await api.post('/erp/sales', { sale_type: 'CASH_RECEIPT', hospital_id: hospitalId || undefined, customer_id: customerId || undefined, csi_date: crDate, line_items: [] });
                      if (res.data?.data?.invoice_number) { setCrNo(res.data.data.invoice_number); await api.delete(`/erp/sales/draft/${res.data.data._id}`).catch(err => console.error('[CollectionSession]', err.message)); }
                    } catch (err) { showError(err, 'Could not auto-generate CR number'); }
                  }}>(auto-generate)</span>}</label>
                  <input value={crNo} onChange={e => setCrNo(e.target.value)} placeholder={paymentMode === 'CASH' ? 'Click auto-generate or enter manually' : 'e.g. 002905'} />
                </div>
                <div className="form-group">
                  <label>CR Date {ocrFilledFields.has('crDate') && <span className="ocr-badge">OCR</span>}</label>
                  <input type="date" value={crDate} onChange={e => setCrDate(e.target.value)} />
                </div>
                <div className="form-group">
                  <label>CR Amount {ocrFilledFields.has('crAmount') && <span className="ocr-badge">OCR</span>}</label>
                  <input type="number" step="0.01" value={crAmount} onChange={e => setCrAmount(e.target.value)} placeholder={expectedCr.toFixed(2)} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Payment Mode</label>
                  <SelectField value={paymentMode} onChange={e => { setPaymentMode(e.target.value); setBankAccountId(''); setPettyCashFundId(''); }}>
                    {paymentModes.filter(pm => pm.is_active !== false).map(pm => <option key={pm.mode_code} value={pm.mode_code}>{pm.mode_label}</option>)}
                  </SelectField>
                </div>
                <div className="form-group">
                  <label>{paymentMode === 'CASH' ? 'Deposit To' : 'Deposited At'}</label>
                  <SelectField value={pettyCashFundId || bankAccountId || ''} onChange={e => {
                    const val = e.target.value;
                    const isPc = pettyCashFunds.some(f => f._id === val);
                    if (isPc) { setPettyCashFundId(val); setBankAccountId(''); }
                    else { setBankAccountId(val); setPettyCashFundId(''); }
                  }} style={{ width: '100%' }}>
                    <option value="">Select destination…</option>
                    {pettyCashFunds.filter(f => f.status === 'ACTIVE' && (f.fund_mode || 'REVOLVING') !== 'EXPENSE_ONLY').length > 0 && (
                      <optgroup label="Petty Cash Funds">
                        {pettyCashFunds.filter(f => f.status === 'ACTIVE' && (f.fund_mode || 'REVOLVING') !== 'EXPENSE_ONLY').map(f => <option key={f._id} value={f._id}>{f.fund_code} — {f.fund_name}</option>)}
                      </optgroup>
                    )}
                    <optgroup label="Bank Accounts">
                      {bankAccountsList.map(b => <option key={b._id} value={b._id}>{b.bank_name}</option>)}
                    </optgroup>
                  </SelectField>
                </div>
              </div>

              {/* CHECK details */}
              {paymentMode === 'CHECK' && (
                <div className="form-row">
                  <div className="form-group">
                    <label>Check Number {ocrFilledFields.has('checkNo') && <span className="ocr-badge">OCR</span>}</label>
                    <input value={checkNo} onChange={e => setCheckNo(e.target.value)} placeholder="e.g. 1200041947" />
                  </div>
                  <div className="form-group">
                    <label>Check Date</label>
                    <input type="date" value={checkDate} onChange={e => setCheckDate(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label>Bank {ocrFilledFields.has('bank') && <span className="ocr-badge">OCR</span>}</label>
                    <input value={bank} onChange={e => setBank(e.target.value)} placeholder="e.g. RCBC" />
                  </div>
                </div>
              )}

              {/* CWT */}
              <div className="form-row">
                <div className="form-group">
                  <label>
                    CWT Rate
                    <label style={{ marginLeft: 12, fontSize: 11, fontWeight: 400, textTransform: 'none' }}>
                      <input type="checkbox" checked={cwtNa} onChange={e => setCwtNa(e.target.checked)} style={{ width: 'auto', marginRight: 4 }} />
                      N/A (no withholding)
                    </label>
                  </label>
                  <input type="number" step="0.001" value={cwtRate} onChange={e => setCwtRate(e.target.value)} disabled={cwtNa} placeholder="0.01 = 1%" />
                </div>
                <div className="form-group">
                  <label>CWT Amount</label>
                  <input type="text" value={cwtNa ? 'N/A' : `P${computedCwt.toFixed(2)}`} readOnly style={{ background: 'var(--erp-bg)', fontWeight: 600 }} />
                </div>
              </div>

              {/* Summary */}
              <div style={{ marginTop: 12, padding: '12px 0', borderTop: '2px solid var(--erp-border)' }}>
                <div className="summary-row"><span>Total CSI:</span><strong>P{totalCsiAmount.toFixed(2)}</strong></div>
                <div className="summary-row"><span>Less CWT:</span><strong>P{computedCwt.toFixed(2)}</strong></div>
                <div className="summary-row" style={{ fontSize: 15 }}><span>Expected CR:</span><strong>P{expectedCr.toFixed(2)}</strong></div>
                {crAmount && Math.abs(parseFloat(crAmount) - expectedCr) > 1 && (
                  <div style={{ color: '#dc2626', fontSize: 12, marginTop: 4 }}>CR amount does not match expected (tolerance: P1.00)</div>
                )}
              </div>
            </div>
          )}

          {/* Step 4: Document Uploads */}
          {selectedList.length > 0 && (
            <div className="section">
              <h2>4. Attach Documents (required for validation)</h2>
              <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onFileSelected} />
              <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={onFileSelected} />

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
                {/* CR Photo — not required for CASH */}
                {paymentMode !== 'CASH' && (
                <div style={{ border: '1px solid var(--erp-border)', borderRadius: 10, padding: 12, background: crPhotoUrl ? '#f0fdf4' : 'var(--erp-bg)' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--erp-muted)', textTransform: 'uppercase', marginBottom: 6 }}>CR Photo *</div>
                  {crPhotoUrl ? (
                    <div>
                      <img src={crPhotoUrl} alt="CR" style={{ width: '100%', maxHeight: 120, objectFit: 'cover', borderRadius: 6, marginBottom: 6 }} />
                      <button className="btn btn-sm btn-outline" onClick={() => setCrPhotoUrl('')} style={{ fontSize: 10 }}>Remove</button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-sm btn-primary" onClick={() => triggerCamera('cr_photo')} disabled={!!uploading}>
                        {uploading === 'cr_photo' ? 'Uploading...' : 'Scan'}
                      </button>
                      <button className="btn btn-sm btn-outline" onClick={() => triggerUpload('cr_photo')} disabled={!!uploading}>
                        Gallery
                      </button>
                    </div>
                  )}
                </div>
                )}

                {/* Deposit Slip — not required for CASH */}
                {paymentMode !== 'CASH' && (
                <div style={{ border: '1px solid var(--erp-border)', borderRadius: 10, padding: 12, background: depositSlipUrl ? '#f0fdf4' : 'var(--erp-bg)' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--erp-muted)', textTransform: 'uppercase', marginBottom: 6 }}>Deposit Slip *</div>
                  {depositSlipUrl ? (
                    <div>
                      <img src={depositSlipUrl} alt="Deposit" style={{ width: '100%', maxHeight: 120, objectFit: 'cover', borderRadius: 6, marginBottom: 6 }} />
                      <button className="btn btn-sm btn-outline" onClick={() => setDepositSlipUrl('')} style={{ fontSize: 10 }}>Remove</button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-sm btn-primary" onClick={() => triggerCamera('deposit_slip')} disabled={!!uploading}>
                        {uploading === 'deposit_slip' ? 'Uploading...' : 'Scan'}
                      </button>
                      <button className="btn btn-sm btn-outline" onClick={() => triggerUpload('deposit_slip')} disabled={!!uploading}>
                        Gallery
                      </button>
                    </div>
                  )}
                </div>
                )}

                {/* CWT Certificate */}
                <div style={{ border: '1px solid var(--erp-border)', borderRadius: 10, padding: 12, background: cwtCertUrl || cwtNa ? '#f0fdf4' : 'var(--erp-bg)' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--erp-muted)', textTransform: 'uppercase', marginBottom: 6 }}>CWT 2307 {cwtNa ? '(N/A)' : '*'}</div>
                  {cwtNa ? (
                    <div style={{ fontSize: 12, color: '#16a34a' }}>Not applicable — skipped</div>
                  ) : cwtCertUrl ? (
                    <div>
                      <img src={cwtCertUrl} alt="CWT" style={{ width: '100%', maxHeight: 120, objectFit: 'cover', borderRadius: 6, marginBottom: 6 }} />
                      <button className="btn btn-sm btn-outline" onClick={() => setCwtCertUrl('')} style={{ fontSize: 10 }}>Remove</button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-sm btn-primary" onClick={() => triggerCamera('cwt_cert')} disabled={!!uploading}>
                        {uploading === 'cwt_cert' ? 'Uploading...' : 'Scan'}
                      </button>
                      <button className="btn btn-sm btn-outline" onClick={() => triggerUpload('cwt_cert')} disabled={!!uploading}>
                        Gallery
                      </button>
                    </div>
                  )}
                </div>

                {/* CSI Photos */}
                <div style={{ border: '1px solid var(--erp-border)', borderRadius: 10, padding: 12, background: csiPhotoUrls.length ? '#f0fdf4' : 'var(--erp-bg)' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--erp-muted)', textTransform: 'uppercase', marginBottom: 6 }}>CSI Photos * ({csiPhotoUrls.length})</div>
                  {csiPhotoUrls.map((url, i) => (
                    <div key={i} style={{ display: 'inline-block', position: 'relative', marginRight: 6, marginBottom: 6 }}>
                      <img src={url} alt={`CSI ${i + 1}`} style={{ width: 60, height: 60, objectFit: 'cover', borderRadius: 6 }} />
                      <button onClick={() => setCsiPhotoUrls(prev => prev.filter((_, j) => j !== i))}
                        style={{ position: 'absolute', top: -4, right: -4, background: '#dc2626', color: '#fff', border: 'none', borderRadius: '50%', width: 16, height: 16, fontSize: 10, cursor: 'pointer', lineHeight: '16px', padding: 0 }}>&times;</button>
                    </div>
                  ))}
                  <div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-sm btn-primary" onClick={() => triggerCamera('csi_photo')} disabled={!!uploading}>
                        {uploading === 'csi_photo' ? 'Uploading...' : 'Scan'}
                      </button>
                      <button className="btn btn-sm btn-outline" onClick={() => triggerUpload('csi_photo')} disabled={!!uploading}>
                        Gallery
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Save */}
          {selectedList.length > 0 && (
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-success" onClick={handleSave} disabled={saving || !crNo}>
                {saving ? 'Saving...' : 'Save as Draft'}
              </button>
            </div>
          )}

          {/* ScanCRModal */}
          <ScanCRModal
            open={scanCrOpen}
            onClose={() => setScanCrOpen(false)}
            onApply={handleCrScanApply}
            hospitals={hospitals}
          />
        </main>
      </div>
    </div>
  );
}
