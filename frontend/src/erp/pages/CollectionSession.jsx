import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import { useAuth } from '../../hooks/useAuth';
import useCollections from '../hooks/useCollections';
import useHospitals from '../hooks/useHospitals';
import useSettings from '../hooks/useSettings';

const STATUS_COLORS = {
  DRAFT: { bg: '#e2e8f0', text: '#475569' },
  VALID: { bg: '#dcfce7', text: '#166534' },
  ERROR: { bg: '#fef2f2', text: '#991b1b' },
  POSTED: { bg: '#dbeafe', text: '#1e40af' }
};

const pageStyles = `
  .coll-session { background: var(--erp-bg, #f4f7fb); min-height: 100vh; }
  .coll-main { flex: 1; min-width: 0; overflow-y: auto; padding: 20px; max-width: 1100px; margin: 0 auto; }
  .coll-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 12px; }
  .coll-header h1 { font-size: 22px; color: var(--erp-text); margin: 0; }
  .btn { padding: 8px 16px; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn-primary { background: var(--erp-accent, #1e5eff); color: #fff; }
  .btn-success { background: #16a34a; color: #fff; }
  .btn-warning { background: #d97706; color: #fff; }
  .btn-danger { background: #dc2626; color: #fff; }
  .btn-outline { background: transparent; border: 1px solid var(--erp-border, #dbe4f0); color: var(--erp-text); }

  .section { background: var(--erp-panel, #fff); border: 1px solid var(--erp-border); border-radius: 12px; padding: 20px; margin-bottom: 16px; }
  .section h2 { font-size: 16px; margin: 0 0 14px; color: var(--erp-text); }
  .form-row { display: flex; gap: 12px; margin-bottom: 12px; flex-wrap: wrap; }
  .form-group { flex: 1; min-width: 150px; }
  .form-group label { display: block; font-size: 11px; color: var(--erp-muted, #5f7188); font-weight: 600; text-transform: uppercase; margin-bottom: 4px; }
  .form-group input, .form-group select { width: 100%; padding: 8px 10px; border: 1px solid var(--erp-border); border-radius: 8px; font-size: 13px; background: var(--erp-panel); color: var(--erp-text); }

  .csi-table { width: 100%; border-collapse: collapse; font-size: 13px; margin: 12px 0; }
  .csi-table th { background: var(--erp-bg); padding: 8px 10px; text-align: left; font-weight: 600; color: var(--erp-muted); font-size: 11px; text-transform: uppercase; }
  .csi-table td { padding: 8px 10px; border-top: 1px solid var(--erp-border); }
  .csi-table tr:hover { background: var(--erp-accent-soft, #e8efff); }
  .csi-table input[type="checkbox"] { width: 18px; height: 18px; cursor: pointer; }
  .csi-table select, .csi-table input { padding: 4px 6px; border: 1px solid var(--erp-border); border-radius: 6px; font-size: 12px; }

  .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 600; }
  .error-list { background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 12px; margin-bottom: 16px; }
  .error-list li { font-size: 13px; color: #991b1b; margin-bottom: 4px; }
  .summary-row { display: flex; justify-content: space-between; padding: 8px 0; border-top: 1px solid var(--erp-border); font-size: 13px; }
  .summary-row strong { font-weight: 700; }

  @media(max-width: 768px) { .coll-main { padding: 12px; } .form-row { flex-direction: column; } }
`;

export default function CollectionSession() {
  const { user } = useAuth();
  const collections = useCollections();
  const { hospitals } = useHospitals();
  const { settings } = useSettings();
  const navigate = useNavigate();

  const [hospitalId, setHospitalId] = useState('');
  const [openCsis, setOpenCsis] = useState([]);
  const [selectedCsis, setSelectedCsis] = useState(new Map()); // sales_line_id → { checked, commission_rate, partner_tags }
  const [crNo, setCrNo] = useState('');
  const [crDate, setCrDate] = useState(new Date().toISOString().split('T')[0]);
  const [crAmount, setCrAmount] = useState('');
  const [paymentMode, setPaymentMode] = useState('CHECK');
  const [checkNo, setCheckNo] = useState('');
  const [checkDate, setCheckDate] = useState('');
  const [bank, setBank] = useState('');
  const [cwtRate, setCwtRate] = useState('');
  const [cwtAmount, setCwtAmount] = useState('');
  const [cwtNa, setCwtNa] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState([]);
  const [status, setStatus] = useState(null);

  const commRates = useMemo(() => settings?.COMMISSION_RATES || [0, 0.005, 0.01, 0.02, 0.03, 0.04, 0.05], [settings]);
  const rebateRates = useMemo(() => settings?.PARTNER_REBATE_RATES || [1, 2, 3, 5, 20, 25], [settings]);

  // Load open CSIs when hospital changes
  useEffect(() => {
    if (!hospitalId) { setOpenCsis([]); setSelectedCsis(new Map()); return; }
    collections.getOpenCsis(hospitalId).then(res => {
      setOpenCsis(res?.data || []);
      setSelectedCsis(new Map());
      // Auto-fill CWT rate from hospital
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
      const entry = { ...next.get(id), [field]: value };
      next.set(id, entry);
      return next;
    });
  };

  const selectedList = [...selectedCsis.values()];
  const totalCsiAmount = selectedList.reduce((sum, s) => sum + (s.invoice_amount || 0), 0);
  const computedCwt = cwtNa ? 0 : totalCsiAmount * (parseFloat(cwtRate) || 0);
  const expectedCr = totalCsiAmount - computedCwt;

  const handleSave = async () => {
    if (!hospitalId || !crNo || !selectedList.length) {
      return alert('Select a hospital, enter CR#, and select at least one CSI');
    }
    setSaving(true);
    try {
      const data = {
        hospital_id: hospitalId, cr_no: crNo, cr_date: crDate,
        cr_amount: parseFloat(crAmount) || expectedCr,
        settled_csis: selectedList,
        cwt_rate: parseFloat(cwtRate) || 0,
        cwt_amount: computedCwt,
        cwt_na: cwtNa,
        payment_mode: paymentMode,
        check_no: checkNo || undefined, check_date: checkDate || undefined, bank: bank || undefined
      };
      await collections.createCollection(data);
      setStatus('DRAFT');
      navigate('/erp/collections');
    } catch (err) {
      alert(err.response?.data?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
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
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-outline" onClick={() => navigate('/erp/collections')}>Back to List</button>
            </div>
          </div>

          {/* Step 1: Hospital */}
          <div className="section">
            <h2>1. Select Hospital</h2>
            <div className="form-row">
              <div className="form-group" style={{ flex: 2 }}>
                <label>Hospital (P5: one CR per hospital)</label>
                <select value={hospitalId} onChange={e => setHospitalId(e.target.value)}>
                  <option value="">Select hospital...</option>
                  {hospitals.map(h => <option key={h._id} value={h._id}>{h.hospital_name_display || h.hospital_name}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Step 2: Open CSIs */}
          {hospitalId && (
            <div className="section">
              <h2>2. Select CSIs to Settle ({openCsis.length} open)</h2>
              {openCsis.length === 0 ? (
                <p style={{ color: 'var(--erp-muted)', fontSize: 13 }}>No open CSIs for this hospital</p>
              ) : (
                <table className="csi-table">
                  <thead>
                    <tr>
                      <th style={{ width: 30 }}></th>
                      <th>CSI #</th>
                      <th>Date</th>
                      <th>Invoice</th>
                      <th>Balance Due</th>
                      <th>Days</th>
                      <th>Commission %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {openCsis.map(csi => {
                      const isSelected = selectedCsis.has(csi._id);
                      const entry = selectedCsis.get(csi._id);
                      return (
                        <tr key={csi._id} style={{ background: isSelected ? '#f0fdf4' : undefined }}>
                          <td><input type="checkbox" checked={isSelected} onChange={() => toggleCsi(csi)} /></td>
                          <td style={{ fontWeight: 600 }}>{csi.doc_ref}</td>
                          <td>{new Date(csi.csi_date).toLocaleDateString('en-PH')}</td>
                          <td>P{(csi.invoice_total || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                          <td style={{ fontWeight: 600 }}>P{(csi.balance_due || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                          <td>{csi.days_outstanding}d</td>
                          <td>
                            {isSelected && (
                              <select value={entry?.commission_rate || 0} onChange={e => updateCsiField(csi._id, 'commission_rate', parseFloat(e.target.value))}>
                                {commRates.map(r => <option key={r} value={r}>{(r * 100).toFixed(1)}%</option>)}
                              </select>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
              {selectedList.length > 0 && (
                <div style={{ marginTop: 8 }}>
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
                    <div className="form-group">
                      <label>Check No.</label>
                      <input value={checkNo} onChange={e => setCheckNo(e.target.value)} />
                    </div>
                    <div className="form-group">
                      <label>Check Date</label>
                      <input type="date" value={checkDate} onChange={e => setCheckDate(e.target.value)} />
                    </div>
                    <div className="form-group">
                      <label>Bank</label>
                      <input value={bank} onChange={e => setBank(e.target.value)} />
                    </div>
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

          {/* Actions */}
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
