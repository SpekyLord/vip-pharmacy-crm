import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import { useAuth } from '../../hooks/useAuth';
import useIcSettlements from '../hooks/useIcSettlements';
import useErpApi from '../hooks/useErpApi';
import { processDocument } from '../services/ocrService';

import SelectField from '../../components/common/Select';

const pageStyles = `
  .ics-page { background: var(--erp-bg, #f4f7fb); min-height: 100vh; }
  .ics-main { flex: 1; min-width: 0; overflow-y: auto; padding: 20px; max-width: 1100px; margin: 0 auto; }
  .ics-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 12px; }
  .ics-header h1 { font-size: 22px; color: var(--erp-text); margin: 0; }
  .btn { padding: 8px 16px; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn-primary { background: var(--erp-accent, #1e5eff); color: #fff; }
  .btn-success { background: #16a34a; color: #fff; }
  .btn-outline { background: transparent; border: 1px solid var(--erp-border, #dbe4f0); color: var(--erp-text); }
  .btn-sm { padding: 4px 10px; font-size: 11px; }

  .section { background: var(--erp-panel, #fff); border: 1px solid var(--erp-border); border-radius: 12px; padding: 20px; margin-bottom: 16px; }
  .section h2 { font-size: 16px; margin: 0 0 14px; color: var(--erp-text); }
  .form-row { display: flex; gap: 12px; margin-bottom: 12px; flex-wrap: wrap; }
  .form-group { flex: 1; min-width: 150px; }
  .form-group label { display: block; font-size: 11px; color: var(--erp-muted, #5f7188); font-weight: 600; text-transform: uppercase; margin-bottom: 4px; }
  .form-group input, .form-group select { width: 100%; padding: 8px 10px; border: 1px solid var(--erp-border); border-radius: 8px; font-size: 13px; background: var(--erp-panel); color: var(--erp-text); }

  .tfr-card { border: 1px solid var(--erp-border); border-radius: 10px; padding: 14px; margin-bottom: 10px; background: var(--erp-panel); }
  .tfr-card.selected { border-color: #16a34a; background: #f0fdf4; }
  .tfr-card-header { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .tfr-card-header input[type="checkbox"] { width: 18px; height: 18px; cursor: pointer; }
  .tfr-card-meta { display: flex; gap: 16px; flex-wrap: wrap; margin-top: 8px; font-size: 12px; color: var(--erp-muted); }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 600; }

  .summary-row { display: flex; justify-content: space-between; padding: 8px 0; border-top: 1px solid var(--erp-border); font-size: 13px; }
  .summary-row strong { font-weight: 700; }

  @media(max-width: 768px) { .ics-main { padding: 12px; } .form-row { flex-direction: column; } }
`;

export default function IcSettlement() {
  const { user } = useAuth();
  const ic = useIcSettlements();
  const lookupApi = useErpApi();
  const navigate = useNavigate();

  const [entities, setEntities] = useState([]);
  const [paymentModes, setPaymentModes] = useState([]);
  const [debtorId, setDebtorId] = useState('');
  const [openTransfers, setOpenTransfers] = useState([]);
  const [selected, setSelected] = useState(new Map());
  const [crNo, setCrNo] = useState('');
  const [crDate, setCrDate] = useState(new Date().toISOString().split('T')[0]);
  const [crAmount, setCrAmount] = useState('');
  const [paymentMode, setPaymentMode] = useState('CHECK');
  const [checkNo, setCheckNo] = useState('');
  const [checkDate, setCheckDate] = useState('');
  const [bank, setBank] = useState('');
  const [cwtRate, setCwtRate] = useState('');
  const [cwtNa, setCwtNa] = useState(false);
  const [crPhotoUrl, setCrPhotoUrl] = useState('');
  const [depositSlipUrl, setDepositSlipUrl] = useState('');
  const [uploading, setUploading] = useState('');
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const [pendingUploadType, setPendingUploadType] = useState('');

  useEffect(() => {
    lookupApi.get('/lookups/payment-modes').then(r => setPaymentModes(r?.data || [])).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Load subsidiary entities
  useEffect(() => {
    fetch('/api/erp/transfers/entities', { credentials: 'include' })
      .then(r => r.json())
      .then(res => {
        const subs = (res.data || []).filter(e => e.entity_type === 'SUBSIDIARY' && e.status === 'ACTIVE');
        setEntities(subs);
      }).catch(err => console.error('[IcSettlement]', err.message));
  }, []);

  // Load open IC transfers when subsidiary changes
  useEffect(() => {
    if (!debtorId) { setOpenTransfers([]); setSelected(new Map()); return; }
    ic.getOpenIcTransfers(debtorId).then(res => {
      setOpenTransfers(res?.data || []);
      setSelected(new Map());
    }).catch(err => console.error('[IcSettlement]', err.message));
  }, [debtorId]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleTransfer = (tfr) => {
    setSelected(prev => {
      const next = new Map(prev);
      if (next.has(tfr._id)) {
        next.delete(tfr._id);
      } else {
        next.set(tfr._id, {
          transfer_id: tfr._id,
          transfer_ref: tfr.transfer_ref,
          vip_csi_ref: tfr.csi_ref || tfr.transfer_ref,
          transfer_amount: tfr.total_amount,
          amount_settled: tfr.balance_due
        });
      }
      return next;
    });
  };

  const updateSettledAmount = (id, amount) => {
    setSelected(prev => {
      const next = new Map(prev);
      next.set(id, { ...next.get(id), amount_settled: parseFloat(amount) || 0 });
      return next;
    });
  };

  const selectedList = [...selected.values()];
  const totalTransferAmount = selectedList.reduce((s, t) => s + (t.transfer_amount || 0), 0);
  const totalSettled = selectedList.reduce((s, t) => s + (t.amount_settled || 0), 0);
  const computedCwt = cwtNa ? 0 : totalSettled * (parseFloat(cwtRate) || 0);
  const expectedCr = totalSettled - computedCwt;

  const handleUpload = async (file, type) => {
    if (!file) return;
    setUploading(type);
    try {
      const result = await processDocument(file, 'CR');
      const url = result?.s3_url;
      if (!url) throw new Error('No URL returned');
      if (type === 'cr_photo') setCrPhotoUrl(url);
      else if (type === 'deposit_slip') setDepositSlipUrl(url);
      // Phase 9.1b: attachment_id tracked automatically on backend
    } catch (err) {
      alert('Upload failed: ' + (err.message || 'Unknown error'));
    } finally { setUploading(''); }
  };

  const triggerUpload = (type) => { setPendingUploadType(type); fileInputRef.current?.click(); };
  const triggerCamera = (type) => { setPendingUploadType(type); cameraInputRef.current?.click(); };
  const onFileSelected = (e) => {
    const file = e.target.files?.[0];
    if (file && pendingUploadType) handleUpload(file, pendingUploadType);
    e.target.value = '';
  };

  const handleSave = async () => {
    if (!debtorId || !crNo || !selectedList.length) {
      return alert('Select a subsidiary, enter CR#, and select at least one transfer');
    }
    setSaving(true);
    try {
      await ic.createSettlement({
        debtor_entity_id: debtorId,
        cr_no: crNo, cr_date: crDate,
        cr_amount: parseFloat(crAmount) || expectedCr,
        settled_transfers: selectedList,
        cwt_rate: parseFloat(cwtRate) || 0, cwt_amount: computedCwt, cwt_na: cwtNa,
        payment_mode: paymentMode,
        check_no: checkNo || undefined, check_date: checkDate || undefined, bank: bank || undefined,
        cr_photo_url: crPhotoUrl || undefined,
        deposit_slip_url: depositSlipUrl || undefined
      });
      navigate('/erp/ic-settlements');
    } catch (err) {
      alert(err.response?.data?.message || 'Save failed');
    } finally { setSaving(false); }
  };

  return (
    <div className="admin-page erp-page ics-page">
      <style>{pageStyles}</style>
      <Navbar />
      <div className="admin-layout">
        <Sidebar />
        <main className="ics-main">
          <div className="ics-header">
            <h1>IC Settlement — Collect from Subsidiary</h1>
            <button className="btn btn-outline" onClick={() => navigate('/erp/ic-settlements')}>Back to List</button>
          </div>

          {/* Step 1: Select Subsidiary */}
          <div className="section">
            <h2>1. Select Subsidiary (Debtor)</h2>
            <div className="form-row">
              <div className="form-group" style={{ flex: 2 }}>
                <label>Subsidiary Entity</label>
                <SelectField value={debtorId} onChange={e => setDebtorId(e.target.value)}>
                  <option value="">Select subsidiary...</option>
                  {entities.map(e => <option key={e._id} value={e._id}>{e.entity_name}</option>)}
                </SelectField>
              </div>
            </div>
          </div>

          {/* Step 2: Open IC Transfers */}
          {debtorId && (
            <div className="section">
              <h2>2. Select IC Transfers to Settle ({openTransfers.length} open)</h2>
              {openTransfers.length === 0 ? (
                <p style={{ color: 'var(--erp-muted)', fontSize: 13 }}>No outstanding IC transfers for this subsidiary</p>
              ) : (
                openTransfers.map(tfr => {
                  const isSelected = selected.has(tfr._id);
                  const entry = selected.get(tfr._id);
                  return (
                    <div key={tfr._id} className={`tfr-card ${isSelected ? 'selected' : ''}`}>
                      <div className="tfr-card-header">
                        <input type="checkbox" checked={isSelected} onChange={() => toggleTransfer(tfr)} />
                        <strong style={{ fontSize: 14 }}>VIP CSI: {tfr.csi_ref || tfr.transfer_ref}</strong>
                        <span className="badge" style={{ background: '#e0f2fe', color: '#0369a1' }}>IC Transfer</span>
                        <span style={{ marginLeft: 'auto', fontSize: 16, fontWeight: 700 }}>
                          P{(tfr.balance_due || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                      <div className="tfr-card-meta">
                        <span>Transfer: {tfr.transfer_ref}</span>
                        <span>Date: {new Date(tfr.transfer_date).toLocaleDateString('en-PH')}</span>
                        <span>Total: P{(tfr.total_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                        <span>Settled: P{(tfr.amount_settled || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                        <span>Outstanding: {tfr.days_outstanding}d</span>
                      </div>
                      {isSelected && (
                        <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
                          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--erp-muted)' }}>AMOUNT SETTLING:</label>
                          <input type="number" step="0.01" value={entry?.amount_settled || ''} onChange={e => updateSettledAmount(tfr._id, e.target.value)}
                            style={{ width: 140, padding: '4px 8px', border: '1px solid var(--erp-border)', borderRadius: 6, fontSize: 13 }} />
                        </div>
                      )}
                    </div>
                  );
                })
              )}
              {selectedList.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div className="summary-row"><span>Total Transfer Amount:</span><strong>P{totalTransferAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong></div>
                  <div className="summary-row"><span>Total Settling:</span><strong>P{totalSettled.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong></div>
                </div>
              )}
            </div>
          )}

          {/* Step 3: CR Details (subsidiary's CR to VIP) */}
          {selectedList.length > 0 && (
            <div className="section">
              <h2>3. Subsidiary CR Details</h2>
              <div className="form-row">
                <div className="form-group"><label>CR Number (from subsidiary)</label><input value={crNo} onChange={e => setCrNo(e.target.value)} placeholder="MG CR#" /></div>
                <div className="form-group"><label>CR Date</label><input type="date" value={crDate} onChange={e => setCrDate(e.target.value)} /></div>
                <div className="form-group"><label>CR Amount</label><input type="number" step="0.01" value={crAmount} onChange={e => setCrAmount(e.target.value)} placeholder={expectedCr.toFixed(2)} /></div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Payment Mode</label>
                  <SelectField value={paymentMode} onChange={e => setPaymentMode(e.target.value)}>
                    {paymentModes.filter(pm => pm.is_active !== false).map(pm => <option key={pm.mode_code} value={pm.mode_code}>{pm.mode_label}</option>)}
                  </SelectField>
                </div>
                {paymentModes.find(pm => pm.mode_code === paymentMode)?.mode_type === 'CHECK' && (
                  <>
                    <div className="form-group"><label>Check No.</label><input value={checkNo} onChange={e => setCheckNo(e.target.value)} /></div>
                    <div className="form-group"><label>Check Date</label><input type="date" value={checkDate} onChange={e => setCheckDate(e.target.value)} /></div>
                    <div className="form-group"><label>Bank</label><input value={bank} onChange={e => setBank(e.target.value)} /></div>
                  </>
                )}
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>CWT Rate <label style={{ marginLeft: 12, fontSize: 11, fontWeight: 400, textTransform: 'none' }}><input type="checkbox" checked={cwtNa} onChange={e => setCwtNa(e.target.checked)} style={{ width: 'auto', marginRight: 4 }} />N/A</label></label>
                  <input type="number" step="0.001" value={cwtRate} onChange={e => setCwtRate(e.target.value)} disabled={cwtNa} placeholder="0.01 = 1%" />
                </div>
                <div className="form-group"><label>CWT Amount</label><input type="text" value={cwtNa ? 'N/A' : `P${computedCwt.toFixed(2)}`} readOnly style={{ background: 'var(--erp-bg)', fontWeight: 600 }} /></div>
              </div>
              <div style={{ marginTop: 12, padding: '12px 0', borderTop: '2px solid var(--erp-border)' }}>
                <div className="summary-row"><span>Total Settling:</span><strong>P{totalSettled.toFixed(2)}</strong></div>
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
              <h2>4. Attach Documents</h2>
              <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onFileSelected} />
              <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={onFileSelected} />
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ border: '1px solid var(--erp-border)', borderRadius: 10, padding: 12, minWidth: 200, background: crPhotoUrl ? '#f0fdf4' : 'var(--erp-bg)' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--erp-muted)', textTransform: 'uppercase', marginBottom: 6 }}>CR Photo</div>
                  {crPhotoUrl ? (
                    <div>
                      <img src={crPhotoUrl} alt="CR" style={{ width: '100%', maxHeight: 120, objectFit: 'cover', borderRadius: 6, marginBottom: 6 }} />
                      <button className="btn btn-sm btn-outline" onClick={() => setCrPhotoUrl('')}>Remove</button>
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
                <div style={{ border: '1px solid var(--erp-border)', borderRadius: 10, padding: 12, minWidth: 200, background: depositSlipUrl ? '#f0fdf4' : 'var(--erp-bg)' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--erp-muted)', textTransform: 'uppercase', marginBottom: 6 }}>Deposit Slip</div>
                  {depositSlipUrl ? (
                    <div>
                      <img src={depositSlipUrl} alt="Deposit" style={{ width: '100%', maxHeight: 120, objectFit: 'cover', borderRadius: 6, marginBottom: 6 }} />
                      <button className="btn btn-sm btn-outline" onClick={() => setDepositSlipUrl('')}>Remove</button>
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
