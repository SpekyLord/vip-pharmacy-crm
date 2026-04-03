import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import { useAuth } from '../../hooks/useAuth';
import useCollections from '../hooks/useCollections';
import useHospitals from '../hooks/useHospitals';
import useSettings from '../hooks/useSettings';
import doctorService from '../../services/doctorService';
import { processDocument } from '../services/ocrService';

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
  @media(max-width: 768px) { .coll-main { padding: 12px; } .form-row { flex-direction: column; } .csi-card-meta { flex-direction: column; gap: 4px; } }
`;

export default function CollectionSession() {
  const { user } = useAuth();
  const collections = useCollections();
  const { hospitals } = useHospitals();
  const { settings } = useSettings();
  const navigate = useNavigate();

  const [hospitalId, setHospitalId] = useState('');
  const [openCsis, setOpenCsis] = useState([]);
  const [selectedCsis, setSelectedCsis] = useState(new Map());
  const [crNo, setCrNo] = useState('');
  const [crDate, setCrDate] = useState(new Date().toISOString().split('T')[0]);
  const [crAmount, setCrAmount] = useState('');
  const [paymentMode, setPaymentMode] = useState('CHECK');
  const [checkNo, setCheckNo] = useState('');
  const [checkDate, setCheckDate] = useState('');
  const [bank, setBank] = useState('');
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
  const [pendingUploadType, setPendingUploadType] = useState('');

  // CRM Doctor list for partner tags
  const [crmDoctors, setCrmDoctors] = useState([]);
  const [doctorsLoaded, setDoctorsLoaded] = useState(false);

  const commRates = useMemo(() => settings?.COMMISSION_RATES || [0, 0.005, 0.01, 0.02, 0.03, 0.04, 0.05], [settings]);
  const rebateRates = useMemo(() => settings?.PARTNER_REBATE_RATES || [1, 2, 3, 5, 20, 25], [settings]);

  // Load CRM doctors once
  useEffect(() => {
    if (doctorsLoaded) return;
    doctorService.getAll({ limit: 200 }).then(res => {
      const docs = (res.data?.data || res.data || []).map(d => ({
        _id: d._id,
        name: `${d.lastName}, ${d.firstName}`,
        specialty: d.specialization || ''
      }));
      docs.sort((a, b) => a.name.localeCompare(b.name));
      setCrmDoctors(docs);
      setDoctorsLoaded(true);
    }).catch(() => setDoctorsLoaded(true));
  }, [doctorsLoaded]);

  // Load open CSIs when hospital changes
  useEffect(() => {
    if (!hospitalId) { setOpenCsis([]); setSelectedCsis(new Map()); return; }
    collections.getOpenCsis(hospitalId).then(res => {
      setOpenCsis(res?.data || []);
      setSelectedCsis(new Map());
      const h = hospitals.find(h => h._id === hospitalId);
      if (h?.cwt_rate) setCwtRate(String(h.cwt_rate));
    }).catch(() => {});
  }, [hospitalId]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleCsi = (csi) => {
    setSelectedCsis(prev => {
      const next = new Map(prev);
      if (next.has(csi._id)) {
        next.delete(csi._id);
      } else {
        next.set(csi._id, {
          sales_line_id: csi._id, doc_ref: csi.doc_ref, csi_date: csi.csi_date,
          invoice_amount: csi.balance_due, net_of_vat: csi.total_net_of_vat,
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

      if (uploadType === 'cr_photo') setCrPhotoUrl(url);
      else if (uploadType === 'cwt_cert') setCwtCertUrl(url);
      else if (uploadType === 'deposit_slip') setDepositSlipUrl(url);
      else if (uploadType === 'csi_photo') setCsiPhotoUrls(prev => [...prev, url]);

      // Phase 9.1b: collect attachment IDs for linking
      if (result?.attachment_id) setAttachmentIds(prev => [...prev, result.attachment_id]);
    } catch (err) {
      alert('Upload failed: ' + (err.message || 'Unknown error'));
    } finally { setUploading(''); }
  };

  const triggerUpload = (type) => {
    setPendingUploadType(type);
    fileInputRef.current?.click();
  };

  const onFileSelected = (e) => {
    const file = e.target.files?.[0];
    if (file && pendingUploadType) handleUpload(file, pendingUploadType);
    e.target.value = '';
  };

  const handleSave = async () => {
    if (!hospitalId || !crNo || !selectedList.length) {
      return alert('Select a hospital, enter CR#, and select at least one CSI');
    }
    setSaving(true);
    try {
      await collections.createCollection({
        hospital_id: hospitalId, cr_no: crNo, cr_date: crDate,
        cr_amount: parseFloat(crAmount) || expectedCr,
        settled_csis: selectedList,
        cwt_rate: parseFloat(cwtRate) || 0, cwt_amount: computedCwt, cwt_na: cwtNa,
        payment_mode: paymentMode,
        check_no: checkNo || undefined, check_date: checkDate || undefined, bank: bank || undefined,
        cr_photo_url: crPhotoUrl || undefined,
        csi_photo_urls: csiPhotoUrls.length ? csiPhotoUrls : undefined,
        deposit_slip_url: depositSlipUrl || undefined,
        cwt_certificate_url: cwtCertUrl || undefined,
        attachment_ids: attachmentIds.length ? attachmentIds : undefined
      });
      navigate('/erp/collections');
    } catch (err) {
      alert(err.response?.data?.message || 'Save failed');
    } finally { setSaving(false); }
  };

  return (
    <div className="admin-page erp-page coll-session">
      <style>{pageStyles}</style>
      <Navbar />
      <div className="admin-layout">
        <Sidebar />
        <main className="coll-main">
          <div className="coll-header">
            <h1>New Collection Receipt</h1>
            <button className="btn btn-outline" onClick={() => navigate('/erp/collections')}>Back to List</button>
          </div>

          {/* Step 1: Hospital */}
          <div className="section">
            <h2>1. Select Hospital</h2>
            <div className="form-row">
              <div className="form-group" style={{ flex: 2 }}>
                <label>Hospital (one CR per hospital)</label>
                <select value={hospitalId} onChange={e => setHospitalId(e.target.value)}>
                  <option value="">Select hospital...</option>
                  {hospitals.map(h => <option key={h._id} value={h._id}>{h.hospital_name_display || h.hospital_name}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Step 2: CSIs with inline commission + partner tags */}
          {hospitalId && (
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
                              <select value={entry?.commission_rate || 0} onChange={e => updateCsiField(csi._id, 'commission_rate', parseFloat(e.target.value))}>
                                {commRates.map(r => <option key={r} value={r}>{(r * 100).toFixed(1)}%</option>)}
                              </select>
                              <span style={{ fontSize: 11, marginLeft: 6, color: '#16a34a', fontWeight: 600 }}>
                                = P{((entry?.net_of_vat || csi.total_net_of_vat || 0) * (entry?.commission_rate || 0)).toFixed(2)}
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
                                <select value={tag.rebate_pct} onChange={e => updatePartnerRebate(csi._id, tag.doctor_id, e.target.value)}>
                                  {rebateRates.map(r => <option key={r} value={r}>{r}%</option>)}
                                </select>
                                <span className="rebate-display">
                                  = P{((entry?.net_of_vat || 0) * (tag.rebate_pct / 100)).toFixed(2)} rebate
                                </span>
                              </div>
                            ))}

                            <div className="partner-row">
                              <select
                                value=""
                                onChange={e => { if (e.target.value) addPartnerTag(csi._id, e.target.value); }}
                                style={{ minWidth: 220 }}
                              >
                                <option value="">+ Add VIP Client partner...</option>
                                {crmDoctors
                                  .filter(d => !(entry?.partner_tags || []).some(t => t.doctor_id === d._id))
                                  .map(d => <option key={d._id} value={d._id}>{d.name}{d.specialty ? ` — ${d.specialty}` : ''}</option>)
                                }
                              </select>
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
                  <label>CR Number</label>
                  <input value={crNo} onChange={e => setCrNo(e.target.value)} placeholder="e.g. 002905" />
                </div>
                <div className="form-group">
                  <label>CR Date</label>
                  <input type="date" value={crDate} onChange={e => setCrDate(e.target.value)} />
                </div>
                <div className="form-group">
                  <label>CR Amount</label>
                  <input type="number" step="0.01" value={crAmount} onChange={e => setCrAmount(e.target.value)} placeholder={expectedCr.toFixed(2)} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Payment Mode</label>
                  <select value={paymentMode} onChange={e => setPaymentMode(e.target.value)}>
                    <option value="CHECK">Check</option>
                    <option value="CASH">Cash</option>
                    <option value="ONLINE">Online / Bank Transfer</option>
                  </select>
                </div>
                {paymentMode === 'CHECK' && (
                  <>
                    <div className="form-group"><label>Check No.</label><input value={checkNo} onChange={e => setCheckNo(e.target.value)} /></div>
                    <div className="form-group"><label>Check Date</label><input type="date" value={checkDate} onChange={e => setCheckDate(e.target.value)} /></div>
                    <div className="form-group"><label>Bank</label><input value={bank} onChange={e => setBank(e.target.value)} /></div>
                  </>
                )}
              </div>

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
              <input ref={fileInputRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={onFileSelected} />

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
                {/* CR Photo */}
                <div style={{ border: '1px solid var(--erp-border)', borderRadius: 10, padding: 12, background: crPhotoUrl ? '#f0fdf4' : 'var(--erp-bg)' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--erp-muted)', textTransform: 'uppercase', marginBottom: 6 }}>CR Photo *</div>
                  {crPhotoUrl ? (
                    <div>
                      <img src={crPhotoUrl} alt="CR" style={{ width: '100%', maxHeight: 120, objectFit: 'cover', borderRadius: 6, marginBottom: 6 }} />
                      <button className="btn btn-sm btn-outline" onClick={() => setCrPhotoUrl('')} style={{ fontSize: 10 }}>Remove</button>
                    </div>
                  ) : (
                    <button className="btn btn-sm btn-primary" onClick={() => triggerUpload('cr_photo')} disabled={!!uploading}>
                      {uploading === 'cr_photo' ? 'Uploading...' : 'Upload CR Photo'}
                    </button>
                  )}
                </div>

                {/* Deposit Slip */}
                <div style={{ border: '1px solid var(--erp-border)', borderRadius: 10, padding: 12, background: depositSlipUrl ? '#f0fdf4' : 'var(--erp-bg)' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--erp-muted)', textTransform: 'uppercase', marginBottom: 6 }}>Deposit Slip *</div>
                  {depositSlipUrl ? (
                    <div>
                      <img src={depositSlipUrl} alt="Deposit" style={{ width: '100%', maxHeight: 120, objectFit: 'cover', borderRadius: 6, marginBottom: 6 }} />
                      <button className="btn btn-sm btn-outline" onClick={() => setDepositSlipUrl('')} style={{ fontSize: 10 }}>Remove</button>
                    </div>
                  ) : (
                    <button className="btn btn-sm btn-primary" onClick={() => triggerUpload('deposit_slip')} disabled={!!uploading}>
                      {uploading === 'deposit_slip' ? 'Uploading...' : 'Upload Deposit Slip'}
                    </button>
                  )}
                </div>

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
                    <button className="btn btn-sm btn-primary" onClick={() => triggerUpload('cwt_cert')} disabled={!!uploading}>
                      {uploading === 'cwt_cert' ? 'Uploading...' : 'Upload 2307'}
                    </button>
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
                    <button className="btn btn-sm btn-primary" onClick={() => triggerUpload('csi_photo')} disabled={!!uploading}>
                      {uploading === 'csi_photo' ? 'Uploading...' : '+ Add CSI Photo'}
                    </button>
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
        </main>
      </div>
    </div>
  );
}
