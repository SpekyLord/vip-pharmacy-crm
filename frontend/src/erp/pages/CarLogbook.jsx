import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import useExpenses from '../hooks/useExpenses';
import useSettings from '../hooks/useSettings';
import { processDocument, extractExifDateTime } from '../services/ocrService';
import { useLookupOptions } from '../hooks/useLookups';
import WorkflowGuide from '../components/WorkflowGuide';

// ── Generic Scan Modal (reused for ODOMETER and GAS_RECEIPT) ──
function ScanModal({ open, onClose, onApply, docType, title }) {
  const [step, setStep] = useState('capture');
  const [preview, setPreview] = useState(null);
  const [ocrData, setOcrData] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const cameraRef = useRef(null);
  const galleryRef = useRef(null);

  const reset = () => { if (preview) URL.revokeObjectURL(preview); setStep('capture'); setPreview(null); setOcrData(null); setErrorMsg(''); };
  const handleClose = () => { reset(); onClose(); };

  const handleFile = async (file) => {
    if (!file) return;
    setPreview(URL.createObjectURL(file));
    setStep('scanning');
    try {
      const exif = await extractExifDateTime(file);
      const result = await processDocument(file, docType, exif);
      setOcrData(result);
      setStep('results');
    } catch (err) {
      setErrorMsg(err.message || 'OCR failed');
      setStep('error');
    }
  };

  if (!open) return null;
  const val = (f) => (f && typeof f === 'object' && 'value' in f) ? f.value : (f || '');

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#fff', borderRadius: 12, padding: 24, maxWidth: 500, width: '90%', maxHeight: '90vh', overflow: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
          <h3 style={{ margin: 0 }}>{title}</h3>
          <button onClick={handleClose} style={{ border: 'none', background: 'none', fontSize: 18, cursor: 'pointer' }}>✕</button>
        </div>

        {step === 'capture' && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <button onClick={() => cameraRef.current?.click()} style={{ padding: '10px 20px', borderRadius: 8, background: '#2563eb', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600 }}>📷 Take Photo</button>
              <button onClick={() => galleryRef.current?.click()} style={{ padding: '10px 20px', borderRadius: 8, background: '#6b7280', color: '#fff', border: 'none', cursor: 'pointer' }}>📁 Gallery</button>
            </div>
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={e => handleFile(e.target.files?.[0])} />
            <input ref={galleryRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => handleFile(e.target.files?.[0])} />
          </div>
        )}
        {step === 'scanning' && <div style={{ textAlign: 'center', padding: 32 }}><div style={{ fontSize: 24 }}>🔍</div><p>Scanning...</p></div>}
        {step === 'error' && <div style={{ textAlign: 'center' }}><p style={{ color: '#dc2626' }}>{errorMsg}</p><button onClick={reset} style={{ padding: '6px 16px', borderRadius: 6, background: '#2563eb', color: '#fff', border: 'none', cursor: 'pointer' }}>Try Again</button></div>}
        {step === 'results' && ocrData?.extracted && (
          <div>
            {preview && <img src={preview} alt="scan" style={{ width: '100%', maxHeight: 200, objectFit: 'contain', borderRadius: 8, marginBottom: 12 }} />}
            <div style={{ fontSize: 13, marginBottom: 12 }}>
              {docType === 'ODOMETER' && <div><strong>Reading:</strong> {val(ocrData.extracted.reading)} km</div>}
              {docType === 'GAS_RECEIPT' && (<>
                <div><strong>Station:</strong> {val(ocrData.extracted.station_name)}</div>
                <div><strong>Fuel:</strong> {val(ocrData.extracted.fuel_type)}</div>
                <div><strong>Liters:</strong> {val(ocrData.extracted.liters)}</div>
                <div><strong>₱/L:</strong> {val(ocrData.extracted.price_per_liter)}</div>
                <div><strong>Total:</strong> ₱{val(ocrData.extracted.total_amount)}</div>
              </>)}
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={reset} style={{ padding: '6px 16px', borderRadius: 6, border: '1px solid var(--erp-border)', background: '#fff', cursor: 'pointer' }}>Re-scan</button>
              <button onClick={() => { onApply(ocrData); handleClose(); }} style={{ padding: '6px 16px', borderRadius: 6, background: '#22c55e', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Apply</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const STATUS_COLORS = {
  DRAFT: '#6b7280', VALID: '#22c55e', ERROR: '#ef4444', POSTED: '#2563eb', DELETION_REQUESTED: '#eab308'
};
const PAYMENT_MODES_FALLBACK = ['CASH', 'FLEET_CARD', 'GCASH', 'CARD', 'OTHER'];

const mobileStyles = `
  .cl-table { display: table; }
  .cl-cards { display: none; }
  @media (max-width: 768px) {
    .cl-table { display: none !important; }
    .cl-cards { display: flex; flex-direction: column; gap: 10px; }
    .cl-card { border: 1px solid var(--erp-border, #dbe4f0); border-radius: 10px; padding: 14px; background: #fff; }
    .cl-card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
    .cl-card-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px 12px; font-size: 13px; margin-bottom: 10px; }
    .cl-card-label { font-size: 11px; color: var(--erp-muted, #5f7188); }
    .cl-card-value { font-weight: 600; }
    .cl-card-actions { display: flex; gap: 6px; margin-top: 8px; }
    .cl-card-actions button { flex: 1; padding: 6px 0; font-size: 13px; }
    .cl-form-row { flex-direction: column !important; }
    .cl-form-row label { width: 100% !important; }
    .cl-form-row input { width: 100% !important; }
    .cl-fuel-entry { flex-direction: column !important; }
    .cl-fuel-entry input, .cl-fuel-entry select { width: 100% !important; }
    .cl-controls { flex-direction: column !important; }
    .cl-controls > * { width: 100%; }
    .cl-controls button, .cl-controls a { text-align: center; min-height: 40px; }
    .cl-card-actions button { min-height: 36px; border-radius: 6px; cursor: pointer; border: 1px solid var(--erp-border, #dbe4f0); background: #fff; }
  }
  @media (max-width: 480px) {
    .cl-cards { gap: 8px; }
    .cl-card { padding: 10px; }
    .cl-card-header { flex-direction: column; align-items: flex-start; gap: 6px; }
    .cl-card-grid { grid-template-columns: 1fr 1fr; gap: 4px 8px; font-size: 12px; }
    .cl-card-actions button { font-size: 12px; padding: 8px 0; }
    .cl-controls { gap: 8px !important; }
  }
`;

export default function CarLogbook() {
  const { getCarLogbookList, getCarLogbookById, createCarLogbook, updateCarLogbook, deleteDraftCarLogbook, validateCarLogbook, submitCarLogbook, reopenCarLogbook, loading } = useExpenses();
  const { settings } = useSettings();
  const { options: fuelTypeOpts } = useLookupOptions('FUEL_TYPE');
  const { options: pmOpts } = useLookupOptions('PAYMENT_MODE_TYPE');
  const PAYMENT_MODES = pmOpts.length > 0 ? pmOpts.map(o => o.code) : PAYMENT_MODES_FALLBACK;
  const FUEL_TYPES = fuelTypeOpts.map(o => o.code);

  const [entries, setEntries] = useState([]);
  const [editingEntry, setEditingEntry] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [period, setPeriod] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [cycle, setCycle] = useState('C1');

  // Form state
  const [form, setForm] = useState({
    entry_date: new Date().toISOString().split('T')[0],
    starting_km: 0, ending_km: 0, personal_km: 0,
    fuel_entries: [], notes: ''
  });

  const loadEntries = useCallback(async () => {
    try {
      const res = await getCarLogbookList({ period, cycle, limit: 0 });
      setEntries(res?.data || []);
    } catch (err) { console.error('[CarLogbook] Load failed:', err.message); alert(err.response?.data?.message || 'Failed to load logbook entries'); }
  }, [period, cycle]);

  useEffect(() => { loadEntries(); }, [loadEntries]);

  const resetForm = () => setForm({
    entry_date: new Date().toISOString().split('T')[0],
    starting_km: 0, ending_km: 0, personal_km: 0,
    fuel_entries: [], notes: ''
  });

  // OCR scan state
  const [scanOdoOpen, setScanOdoOpen] = useState(false);
  const [scanOdoTarget, setScanOdoTarget] = useState(null); // 'starting' or 'ending'
  const [scanGasOpen, setScanGasOpen] = useState(false);

  const handleScanOdometer = (target) => { setScanOdoTarget(target); setScanOdoOpen(true); };
  const handleOdoApply = (ocrData) => {
    const val = (f) => (f && typeof f === 'object' && 'value' in f) ? f.value : (f || '');
    const reading = parseInt(val(ocrData.extracted?.reading)) || 0;
    if (reading > 0) {
      if (scanOdoTarget === 'starting') setForm(p => ({ ...p, starting_km: reading }));
      else setForm(p => ({ ...p, ending_km: reading }));
    }
  };

  const handleGasApply = (ocrData) => {
    const val = (f) => (f && typeof f === 'object' && 'value' in f) ? f.value : (f || '');
    const e = ocrData.extracted || {};
    const newFuel = {
      station_name: val(e.station_name) || '',
      fuel_type: val(e.fuel_type) || 'UNLEADED',
      liters: parseFloat(val(e.liters)) || 0,
      price_per_liter: parseFloat(val(e.price_per_liter)) || 0,
      total_amount: parseFloat(val(e.total_amount)) || 0,
      payment_mode: 'CASH',
      receipt_url: ocrData.s3_url || '',
      receipt_attachment_id: ocrData.attachment_id || null,
      receipt_ocr_data: ocrData.extracted || null
    };
    setForm(p => ({ ...p, fuel_entries: [...p.fuel_entries, newFuel] }));
  };

  const handleNew = () => { setEditingEntry(null); resetForm(); setShowForm(true); };

  const handleEdit = async (entry) => {
    try {
      const res = await getCarLogbookById(entry._id);
      const data = res?.data;
      setEditingEntry(data);
      setForm({
        entry_date: data.entry_date ? new Date(data.entry_date).toISOString().split('T')[0] : '',
        starting_km: data.starting_km || 0,
        ending_km: data.ending_km || 0,
        personal_km: data.personal_km || 0,
        fuel_entries: data.fuel_entries || [],
        notes: data.notes || ''
      });
      setShowForm(true);
    } catch (err) { console.error('[CarLogbook] Edit failed:', err.message); alert(err.response?.data?.message || 'Failed to load entry'); }
  };

  const addFuelEntry = () => {
    setForm(prev => ({
      ...prev,
      fuel_entries: [...prev.fuel_entries, { station_name: '', fuel_type: 'UNLEADED', liters: 0, price_per_liter: 0, total_amount: 0, payment_mode: 'CASH' }]
    }));
  };

  const updateFuelEntry = (idx, field, value) => {
    setForm(prev => {
      const updated = [...prev.fuel_entries];
      updated[idx] = { ...updated[idx], [field]: value };
      if (field === 'liters' || field === 'price_per_liter') {
        updated[idx].total_amount = Math.round((updated[idx].liters || 0) * (updated[idx].price_per_liter || 0) * 100) / 100;
      }
      return { ...prev, fuel_entries: updated };
    });
  };

  const removeFuelEntry = (idx) => {
    setForm(prev => ({ ...prev, fuel_entries: prev.fuel_entries.filter((_, i) => i !== idx) }));
  };

  const handleSave = async () => {
    const data = { ...form, period, cycle, km_per_liter: settings?.FUEL_EFFICIENCY_DEFAULT || 12 };
    try {
      if (editingEntry) { await updateCarLogbook(editingEntry._id, data); }
      else { await createCarLogbook(data); }
      setShowForm(false);
      loadEntries();
    } catch (err) { console.error('[CarLogbook] Save failed:', err.message); alert(err.response?.data?.message || 'Failed to save entry'); }
  };

  const [actionMsg, setActionMsg] = useState(null);
  const showMsg = (msg, isError = false) => { setActionMsg({ msg, isError }); setTimeout(() => setActionMsg(null), 5000); };

  const handleValidate = async () => { try { const r = await validateCarLogbook(); showMsg(r?.message || 'Validated'); loadEntries(); } catch (e) { showMsg(e.response?.data?.message || 'Validation failed', true); } };
  const handleSubmit = async () => { try { const r = await submitCarLogbook(); showMsg(r?.message || 'Submitted'); loadEntries(); } catch (e) { showMsg(e.response?.data?.message || 'Submit failed — are there VALID entries?', true); } };
  const handleReopen = async (id) => { try { await reopenCarLogbook([id]); showMsg('Reopened'); loadEntries(); } catch (e) { showMsg(e.response?.data?.message || 'Reopen failed', true); } };
  const handleDelete = async (id) => { try { await deleteDraftCarLogbook(id); showMsg('Deleted'); loadEntries(); } catch (e) { showMsg(e.response?.data?.message || 'Delete failed — only DRAFT entries can be deleted', true); } };

  // Computed values
  const totalKm = Math.max(0, form.ending_km - form.starting_km);
  const officialKm = Math.max(0, totalKm - form.personal_km);
  const totalLiters = form.fuel_entries.reduce((sum, f) => sum + (f.liters || 0), 0);
  const totalFuel = form.fuel_entries.reduce((sum, f) => sum + (f.total_amount || 0), 0);
  const kpl = settings?.FUEL_EFFICIENCY_DEFAULT || 12;
  const expectedLiters = Math.round((totalKm / kpl) * 1000) / 1000;

  return (
    <div className="admin-page erp-page">
      <style>{mobileStyles}</style>
      <Navbar />
      <div className="admin-layout">
        <Sidebar />
        <main className="admin-main" style={{ padding: 24 }}>
          <WorkflowGuide pageKey="car-logbook" />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
            <h1 style={{ margin: 0, color: 'var(--erp-text, #132238)' }}>Car Logbook</h1>
            <Link to="/erp/expenses" style={{ color: 'var(--erp-accent, #1e5eff)', fontSize: 14 }}>&larr; Back to Expenses</Link>
          </div>

          {/* Controls */}
          <div className="cl-controls" style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <input type="month" value={period} onChange={e => setPeriod(e.target.value)} style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid var(--erp-border, #dbe4f0)' }} />
            <select value={cycle} onChange={e => setCycle(e.target.value)} style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid var(--erp-border, #dbe4f0)' }}>
              <option value="C1">Cycle 1</option><option value="C2">Cycle 2</option><option value="MONTHLY">Monthly</option>
            </select>
            <button onClick={handleNew} style={{ padding: '6px 16px', borderRadius: 6, background: 'var(--erp-accent, #1e5eff)', color: '#fff', border: 'none', cursor: 'pointer' }}>+ New Entry</button>
            <button onClick={handleValidate} disabled={loading} style={{ padding: '6px 16px', borderRadius: 6, background: '#22c55e', color: '#fff', border: 'none', cursor: 'pointer' }}>Validate</button>
            <button onClick={handleSubmit} disabled={loading} style={{ padding: '6px 16px', borderRadius: 6, background: '#2563eb', color: '#fff', border: 'none', cursor: 'pointer' }}>Submit</button>
            <Link to="/erp/prf-calf" style={{ padding: '6px 14px', borderRadius: 6, background: '#f1f5f9', color: 'var(--erp-text, #132238)', textDecoration: 'none', fontSize: 13, border: '1px solid var(--erp-border, #dbe4f0)' }}>PRF / CALF</Link>
          </div>

          {/* CALF Dependency Warning */}
          {entries.some(e => (e.fuel_entries || []).some(f => f.calf_required && !f.calf_id)) && (
            <div style={{ padding: 12, marginBottom: 16, borderRadius: 8, border: '1px solid #f59e0b', background: '#fffbeb', fontSize: 13 }}>
              <strong style={{ color: '#92400e' }}>CALF Required:</strong> Some fuel entries use company funds (non-cash).
              Create and post a CALF in <Link to="/erp/prf-calf" style={{ color: '#2563eb', fontWeight: 600 }}>PRF / CALF</Link> before submitting.
            </div>
          )}

          {actionMsg && (
            <div style={{ padding: '6px 12px', marginBottom: 12, borderRadius: 6, fontSize: 13, background: actionMsg.isError ? '#fef2f2' : '#f0fdf4', border: `1px solid ${actionMsg.isError ? '#fca5a5' : '#bbf7d0'}`, color: actionMsg.isError ? '#dc2626' : '#166534' }}>
              {actionMsg.msg}
            </div>
          )}

          {/* Entry List */}
          {!showForm && (<>
            <div className="cl-table" style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                <thead>
                  <tr style={{ background: 'var(--erp-bg-alt, #f1f5f9)', borderBottom: '2px solid var(--erp-border, #dbe4f0)' }}>
                    <th style={{ padding: 8, textAlign: 'left' }}>Date</th>
                    <th style={{ padding: 8, textAlign: 'right' }}>Start KM</th>
                    <th style={{ padding: 8, textAlign: 'right' }}>End KM</th>
                    <th style={{ padding: 8, textAlign: 'right' }}>Total KM</th>
                    <th style={{ padding: 8, textAlign: 'right' }}>Personal</th>
                    <th style={{ padding: 8, textAlign: 'right' }}>Official</th>
                    <th style={{ padding: 8, textAlign: 'right' }}>Fuel (L)</th>
                    <th style={{ padding: 8, textAlign: 'right' }}>Fuel ₱</th>
                    <th style={{ padding: 8, textAlign: 'center' }}>Status</th>
                    <th style={{ padding: 8, textAlign: 'center' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map(e => (
                    <tr key={e._id} style={{ borderBottom: '1px solid var(--erp-border, #dbe4f0)', background: e.overconsumption_flag ? '#fef2f2' : undefined }}>
                      <td style={{ padding: 8 }}>{e.entry_date ? new Date(e.entry_date).toLocaleDateString() : '—'}</td>
                      <td style={{ padding: 8, textAlign: 'right' }}>{(e.starting_km || 0).toLocaleString()}</td>
                      <td style={{ padding: 8, textAlign: 'right' }}>{(e.ending_km || 0).toLocaleString()}</td>
                      <td style={{ padding: 8, textAlign: 'right' }}>{(e.total_km || 0).toLocaleString()}</td>
                      <td style={{ padding: 8, textAlign: 'right' }}>{(e.personal_km || 0).toLocaleString()}</td>
                      <td style={{ padding: 8, textAlign: 'right' }}>{(e.official_km || 0).toLocaleString()}</td>
                      <td style={{ padding: 8, textAlign: 'right' }}>{(e.actual_liters || 0).toFixed(1)}</td>
                      <td style={{ padding: 8, textAlign: 'right' }}>₱{(e.total_fuel_amount || 0).toLocaleString()}</td>
                      <td style={{ padding: 8, textAlign: 'center' }}>
                        <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 12, color: '#fff', background: STATUS_COLORS[e.status] || '#6b7280' }}>{e.status}</span>
                        {e.overconsumption_flag && <span style={{ marginLeft: 4, padding: '2px 6px', borderRadius: 4, fontSize: 10, color: '#dc2626', background: '#fef2f2', border: '1px solid #fca5a5' }}>OVER</span>}
                        {(e.fuel_entries || []).some(f => f.calf_required && !f.calf_id) && <span style={{ marginLeft: 4, padding: '2px 6px', borderRadius: 4, fontSize: 10, color: '#92400e', background: '#fef3c7', fontWeight: 600 }}>CALF</span>}
                      </td>
                      <td style={{ padding: 8, textAlign: 'center' }}>
                        {['DRAFT', 'ERROR'].includes(e.status) && (
                          <button onClick={() => handleEdit(e)} style={{ marginRight: 4, padding: '2px 8px', fontSize: 12, borderRadius: 4, border: '1px solid var(--erp-border, #dbe4f0)', background: '#fff', cursor: 'pointer' }}>Edit</button>
                        )}
                        {e.status === 'DRAFT' && (
                          <button onClick={() => handleDelete(e._id)} style={{ padding: '2px 8px', fontSize: 12, borderRadius: 4, border: '1px solid #ef4444', background: '#fff', color: '#ef4444', cursor: 'pointer' }}>Del</button>
                        )}
                        {e.status === 'POSTED' && <button onClick={() => handleReopen(e._id)} style={{ padding: '2px 8px', fontSize: 12, borderRadius: 4, border: '1px solid #eab308', background: '#fff', color: '#b45309', cursor: 'pointer' }}>Re-open</button>}
                      </td>
                    </tr>
                  ))}
                  {!entries.length && <tr><td colSpan={10} style={{ padding: 24, textAlign: 'center', color: 'var(--erp-muted, #5f7188)' }}>No logbook entries</td></tr>}
                </tbody>
              </table>
            </div>

            {/* Mobile Card View */}
            <div className="cl-cards">
              {entries.map(e => (
                <div key={e._id} className="cl-card" style={{ borderLeft: `4px solid ${STATUS_COLORS[e.status] || '#6b7280'}`, background: e.overconsumption_flag ? '#fef2f2' : '#fff' }}>
                  <div className="cl-card-header">
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 15 }}>{e.entry_date ? new Date(e.entry_date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }) : '—'}</div>
                      <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, color: '#fff', background: STATUS_COLORS[e.status] || '#6b7280' }}>{e.status}</span>
                      {e.overconsumption_flag && <span style={{ marginLeft: 4, padding: '2px 6px', borderRadius: 4, fontSize: 10, color: '#dc2626', background: '#fef2f2', border: '1px solid #fca5a5' }}>OVER</span>}
                      {(e.fuel_entries || []).some(f => f.calf_required && !f.calf_id) && <span style={{ marginLeft: 4, padding: '2px 6px', borderRadius: 4, fontSize: 10, color: '#92400e', background: '#fef3c7', fontWeight: 600 }}>CALF</span>}
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 18, fontWeight: 700, color: '#2563eb' }}>₱{(e.total_fuel_amount || 0).toLocaleString()}</div>
                      <div style={{ fontSize: 11, color: 'var(--erp-muted)' }}>{(e.actual_liters || 0).toFixed(1)} L</div>
                    </div>
                  </div>
                  <div className="cl-card-grid">
                    <div><span className="cl-card-label">Start</span><br/><span className="cl-card-value">{(e.starting_km || 0).toLocaleString()}</span></div>
                    <div><span className="cl-card-label">End</span><br/><span className="cl-card-value">{(e.ending_km || 0).toLocaleString()}</span></div>
                    <div><span className="cl-card-label">Total</span><br/><span className="cl-card-value">{(e.total_km || 0).toLocaleString()} km</span></div>
                    <div><span className="cl-card-label">Personal</span><br/><span className="cl-card-value">{(e.personal_km || 0).toLocaleString()}</span></div>
                    <div><span className="cl-card-label">Official</span><br/><span className="cl-card-value" style={{ color: '#2563eb' }}>{(e.official_km || 0).toLocaleString()}</span></div>
                    <div><span className="cl-card-label">Fuel</span><br/><span className="cl-card-value">{(e.fuel_entries || []).length} entry(s)</span></div>
                  </div>
                  <div className="cl-card-actions">
                    {['DRAFT', 'ERROR'].includes(e.status) && <button onClick={() => handleEdit(e)} style={{ border: '1px solid var(--erp-border, #dbe4f0)', background: '#fff', color: 'var(--erp-text, #132238)' }}>Edit</button>}
                    {e.status === 'DRAFT' && <button onClick={() => handleDelete(e._id)} style={{ border: '1px solid #ef4444', background: '#fff', color: '#ef4444' }}>Delete</button>}
                    {e.status === 'POSTED' && <button onClick={() => handleReopen(e._id)} style={{ padding: '6px 0', fontSize: 13, borderRadius: 6, border: '1px solid #eab308', background: '#fff', color: '#b45309', cursor: 'pointer', flex: 1 }}>Re-open</button>}
                  </div>
                </div>
              ))}
              {!entries.length && <div style={{ padding: 24, textAlign: 'center', color: 'var(--erp-muted, #5f7188)' }}>No logbook entries</div>}
            </div>
          </>)}

          {/* Entry Form */}
          {showForm && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                <h2 style={{ margin: 0, fontSize: 18 }}>{editingEntry ? 'Edit' : 'New'} Logbook Entry</h2>
                <button onClick={() => setShowForm(false)} style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid var(--erp-border, #dbe4f0)', background: '#fff', cursor: 'pointer' }}>Cancel</button>
              </div>

              {/* Odometer */}
              <div className="cl-form-row" style={{ display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
                <label style={{ fontSize: 13 }}>Date: <input type="date" value={form.entry_date} onChange={e => setForm(p => ({ ...p, entry_date: e.target.value }))} style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid var(--erp-border, #dbe4f0)' }} /></label>
                <label style={{ fontSize: 13 }}>Starting KM (Morning): <input type="number" value={form.starting_km} onChange={e => setForm(p => ({ ...p, starting_km: Number(e.target.value) }))} style={{ width: 100, padding: '4px 8px', borderRadius: 4, border: '1px solid var(--erp-border, #dbe4f0)' }} /></label>
                <button onClick={() => handleScanOdometer('starting')} style={{ padding: '4px 10px', borderRadius: 4, background: '#16a34a', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>Scan Start</button>
                <label style={{ fontSize: 13 }}>Ending KM (Night): <input type="number" value={form.ending_km} onChange={e => setForm(p => ({ ...p, ending_km: Number(e.target.value) }))} style={{ width: 100, padding: '4px 8px', borderRadius: 4, border: '1px solid var(--erp-border, #dbe4f0)' }} /></label>
                <button onClick={() => handleScanOdometer('ending')} style={{ padding: '4px 10px', borderRadius: 4, background: '#16a34a', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>Scan End</button>
                <label style={{ fontSize: 13 }}>Personal KM: <input type="number" value={form.personal_km} onChange={e => setForm(p => ({ ...p, personal_km: Number(e.target.value) }))} style={{ width: 80, padding: '4px 8px', borderRadius: 4, border: '1px solid var(--erp-border, #dbe4f0)' }} /></label>
              </div>

              {/* KM Summary */}
              <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
                <div style={{ padding: 8, borderRadius: 6, border: '1px solid var(--erp-border, #dbe4f0)', minWidth: 100, textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: 'var(--erp-muted)' }}>Total KM</div>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>{totalKm}</div>
                </div>
                <div style={{ padding: 8, borderRadius: 6, border: '1px solid var(--erp-border, #dbe4f0)', minWidth: 100, textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: 'var(--erp-muted)' }}>Official KM</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#2563eb' }}>{officialKm}</div>
                </div>
                <div style={{ padding: 8, borderRadius: 6, border: '1px solid var(--erp-border, #dbe4f0)', minWidth: 100, textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: 'var(--erp-muted)' }}>Expected L</div>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>{expectedLiters}</div>
                </div>
                <div style={{ padding: 8, borderRadius: 6, border: `1px solid ${totalLiters > expectedLiters * 1.3 ? '#ef4444' : 'var(--erp-border, #dbe4f0)'}`, minWidth: 100, textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: 'var(--erp-muted)' }}>Actual L</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: totalLiters > expectedLiters * 1.3 ? '#dc2626' : undefined }}>{totalLiters.toFixed(1)}</div>
                </div>
              </div>

              {/* Fuel Entries */}
              <h3 style={{ fontSize: 15, marginBottom: 8 }}>Fuel Entries</h3>
              {form.fuel_entries.map((fuel, idx) => (
                <div key={idx} style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap', alignItems: 'center', padding: 8, borderRadius: 6, border: '1px solid var(--erp-border, #dbe4f0)' }}>
                  <input placeholder="Station" value={fuel.station_name} onChange={e => updateFuelEntry(idx, 'station_name', e.target.value)} style={{ width: 120, padding: '4px 6px', borderRadius: 4, border: '1px solid var(--erp-border, #dbe4f0)', fontSize: 12 }} />
                  <select value={fuel.fuel_type} onChange={e => updateFuelEntry(idx, 'fuel_type', e.target.value)} style={{ padding: '4px 6px', borderRadius: 4, border: '1px solid var(--erp-border, #dbe4f0)', fontSize: 12 }}>
                    {FUEL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <input type="number" placeholder="Liters" value={fuel.liters || ''} onChange={e => updateFuelEntry(idx, 'liters', Number(e.target.value))} style={{ width: 70, padding: '4px 6px', borderRadius: 4, border: '1px solid var(--erp-border, #dbe4f0)', fontSize: 12 }} />
                  <input type="number" placeholder="₱/L" value={fuel.price_per_liter || ''} onChange={e => updateFuelEntry(idx, 'price_per_liter', Number(e.target.value))} style={{ width: 70, padding: '4px 6px', borderRadius: 4, border: '1px solid var(--erp-border, #dbe4f0)', fontSize: 12 }} />
                  <span style={{ fontSize: 13, fontWeight: 600, minWidth: 80 }}>₱{(fuel.total_amount || 0).toLocaleString()}</span>
                  <select value={fuel.payment_mode} onChange={e => updateFuelEntry(idx, 'payment_mode', e.target.value)} style={{ padding: '4px 6px', borderRadius: 4, border: '1px solid var(--erp-border, #dbe4f0)', fontSize: 12 }}>
                    {PAYMENT_MODES.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                  <label style={{ padding: '2px 8px', borderRadius: 4, background: '#2563eb', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600, display: 'inline-block' }}>
                    Upload Receipt
                    <input type="file" accept="image/*" style={{ display: 'none' }} onChange={async e => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      e.target.value = '';
                      try {
                        const result = await processDocument(file, 'GAS_RECEIPT');
                        updateFuelEntry(idx, 'receipt_url', result.s3_url || URL.createObjectURL(file));
                        if (result.attachment_id) updateFuelEntry(idx, 'receipt_attachment_id', result.attachment_id);
                      } catch {
                        updateFuelEntry(idx, 'receipt_url', URL.createObjectURL(file));
                      }
                    }} />
                  </label>
                  {fuel.receipt_url && <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: '#dcfce7', color: '#166534', fontWeight: 600 }}>Receipt ✓</span>}
                  {fuel.payment_mode && fuel.payment_mode !== 'CASH' && (
                    fuel.calf_id
                      ? <a href={`/erp/prf-calf?id=${fuel.calf_id}`} style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: '#dcfce7', color: '#166534', fontWeight: 600, textDecoration: 'none' }}>CALF ✓ →</a>
                      : <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: '#fef3c7', color: '#92400e', fontWeight: 600 }}>CALF Pending (save first)</span>
                  )}
                  <button onClick={() => removeFuelEntry(idx)} style={{ padding: '2px 8px', borderRadius: 4, border: '1px solid #ef4444', color: '#ef4444', background: '#fff', cursor: 'pointer', fontSize: 12 }}>X</button>
                </div>
              ))}
              <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                <button onClick={addFuelEntry} style={{ padding: '4px 12px', borderRadius: 4, border: '1px solid var(--erp-border, #dbe4f0)', background: '#fff', cursor: 'pointer', fontSize: 12 }}>+ Add Fuel Entry</button>
                <button onClick={() => setScanGasOpen(true)} style={{ padding: '4px 12px', borderRadius: 4, background: '#16a34a', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Scan Gas Receipt</button>
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 13 }}>Notes: <input value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} style={{ width: 300, padding: '4px 8px', borderRadius: 4, border: '1px solid var(--erp-border, #dbe4f0)' }} /></label>
              </div>

              <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                <span style={{ fontSize: 14, fontWeight: 600 }}>Total Fuel: ₱{totalFuel.toLocaleString()}</span>
              </div>

              <button onClick={handleSave} disabled={loading} style={{ padding: '8px 24px', borderRadius: 6, background: 'var(--erp-accent, #1e5eff)', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                {editingEntry ? 'Update' : 'Save as Draft'}
              </button>
            </div>
          )}
        </main>
      </div>
      <ScanModal open={scanOdoOpen} onClose={() => setScanOdoOpen(false)} onApply={handleOdoApply} docType="ODOMETER" title="Scan Odometer" />
      <ScanModal open={scanGasOpen} onClose={() => setScanGasOpen(false)} onApply={handleGasApply} docType="GAS_RECEIPT" title="Scan Gas Receipt" />
    </div>
  );
}
