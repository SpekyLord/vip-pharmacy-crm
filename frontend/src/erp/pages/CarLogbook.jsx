import { useState, useEffect, useCallback, useRef, Fragment } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import useExpenses from '../hooks/useExpenses';
import useSettings from '../hooks/useSettings';
import { processDocument, extractExifDateTime } from '../services/ocrService';
import { useLookupOptions } from '../hooks/useLookups';
import WorkflowGuide from '../components/WorkflowGuide';
import { showError, showApprovalPending } from '../utils/errorToast';
import { ROLE_SETS } from '../../constants/roles';
import { useAuth } from '../../hooks/useAuth';

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
const DAYS_OF_WEEK = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const WEEKEND_BG = '#f8fafc';

function formatLocalDate(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
function displayDate(d) {
  if (!d) return '—';
  const s = typeof d === 'string' ? d : d.toISOString();
  const [, m, day] = s.split('T')[0].split('-');
  return `${m}/${day}`;
}

const mobileStyles = `
  .cl-table { display: table; }
  .cl-cards { display: none; }
  @media (max-width: 900px) {
    .cl-table { display: none !important; }
    .cl-cards { display: flex; flex-direction: column; gap: 8px; }
    .cl-card { border: 1px solid var(--erp-border, #dbe4f0); border-radius: 10px; padding: 12px; background: #fff; }
    .cl-card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
    .cl-card-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 4px 10px; font-size: 12px; margin-bottom: 8px; }
    .cl-card-label { font-size: 10px; color: var(--erp-muted, #5f7188); }
    .cl-card-value { font-weight: 600; }
    .cl-controls { flex-direction: column !important; }
    .cl-controls > * { width: 100%; }
    .cl-controls button, .cl-controls a { text-align: center; min-height: 40px; }
  }
  @media (max-width: 480px) {
    .cl-card { padding: 10px; }
    .cl-card-grid { grid-template-columns: 1fr 1fr; }
    .cl-controls { gap: 8px !important; }
  }
`;

export default function CarLogbook() {
  const { user } = useAuth();
  const isAdmin = ROLE_SETS.MANAGEMENT.includes(user?.role);
  const {
    getCarLogbookList, createCarLogbook, updateCarLogbook, deleteDraftCarLogbook,
    validateCarLogbook, submitCarLogbook, reopenCarLogbook,
    getSmerDestinationByDate, loading
  } = useExpenses();
  const { settings } = useSettings();
  const { options: fuelTypeOpts } = useLookupOptions('FUEL_TYPE');
  const { options: pmOpts } = useLookupOptions('PAYMENT_MODE_TYPE');
  const PAYMENT_MODES = pmOpts.map(o => o.code);
  const FUEL_TYPES = fuelTypeOpts.map(o => o.code);

  const [rows, setRows] = useState([]);
  const [period, setPeriod] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [cycle, setCycle] = useState('C1');
  const [expandedRow, setExpandedRow] = useState(null);
  const [savingRow, setSavingRow] = useState(null);

  // Scan state
  const [scanOdoOpen, setScanOdoOpen] = useState(false);
  const [scanOdoTarget, setScanOdoTarget] = useState(null); // { rowIdx, field }
  const [scanGasOpen, setScanGasOpen] = useState(false);
  const [scanGasRowIdx, setScanGasRowIdx] = useState(null);

  const [actionMsg, setActionMsg] = useState(null);
  const showMsg = (msg, isError = false) => { setActionMsg({ msg, isError }); setTimeout(() => setActionMsg(null), 5000); };

  // Generate all days for the cycle (including weekends)
  const generateDays = useCallback(() => {
    const [year, month] = period.split('-').map(Number);
    const startDay = cycle === 'C1' ? 1 : (cycle === 'C2' ? 16 : 1);
    const endDay = cycle === 'C1' ? 15 : new Date(year, month, 0).getDate();
    const dayRows = [];
    for (let day = startDay; day <= endDay; day++) {
      const date = new Date(year, month - 1, day);
      const dow = date.getDay();
      dayRows.push({
        day,
        entry_date: formatLocalDate(year, month, day),
        day_of_week: DAYS_OF_WEEK[dow],
        isWeekend: dow === 0 || dow === 6,
        _id: null,
        starting_km: 0, ending_km: 0, personal_km: 0,
        fuel_entries: [],
        destination: '', notes: '',
        status: null,
        dirty: false,
        total_km: 0, official_km: 0,
        actual_liters: 0, total_fuel_amount: 0,
        overconsumption_flag: false,
        validation_errors: []
      });
    }
    return dayRows;
  }, [period, cycle]);

  // Load existing entries and merge into the generated day grid
  const loadAndMerge = useCallback(async () => {
    const dayRows = generateDays();
    try {
      const res = await getCarLogbookList({ period, cycle, limit: 0 });
      const docs = res?.data || [];
      const docMap = new Map();
      for (const doc of docs) {
        const key = (doc.entry_date || '').split('T')[0];
        docMap.set(key, doc);
      }
      for (let i = 0; i < dayRows.length; i++) {
        const doc = docMap.get(dayRows[i].entry_date);
        if (doc) {
          dayRows[i] = {
            ...dayRows[i],
            _id: doc._id,
            starting_km: doc.starting_km || 0,
            ending_km: doc.ending_km || 0,
            personal_km: doc.personal_km || 0,
            fuel_entries: doc.fuel_entries || [],
            destination: doc.destination || '',
            notes: doc.notes || '',
            status: doc.status,
            total_km: doc.total_km || 0,
            official_km: doc.official_km || 0,
            actual_liters: doc.actual_liters || 0,
            total_fuel_amount: doc.total_fuel_amount || 0,
            overconsumption_flag: doc.overconsumption_flag || false,
            validation_errors: doc.validation_errors || [],
            dirty: false
          };
        }
      }
    } catch (err) {
      console.error('[CarLogbook] Load failed:', err.message);
      showError(err, 'Could not load logbook entries');
    }
    // Bulk fetch SMER destinations for days without a saved destination
    for (let i = 0; i < dayRows.length; i++) {
      if (dayRows[i].destination) continue; // already has destination from saved doc
      if (dayRows[i].isWeekend) continue;
      try {
        const res = await getSmerDestinationByDate(dayRows[i].entry_date);
        if (res?.data?.destination) {
          dayRows[i].destination = res.data.destination;
        }
      } catch { /* ignore individual fetch errors */ }
    }

    setRows(dayRows);
    setExpandedRow(null);
  }, [period, cycle, generateDays]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadAndMerge(); }, [loadAndMerge]);

  // Row change handler
  const handleRowChange = (idx, field, value) => {
    setRows(prev => {
      const updated = [...prev];
      const row = { ...updated[idx], [field]: value, dirty: true };
      // Auto-compute KM
      if (field === 'starting_km' || field === 'ending_km' || field === 'personal_km') {
        row.total_km = Math.max(0, (row.ending_km || 0) - (row.starting_km || 0));
        row.official_km = Math.max(0, row.total_km - (row.personal_km || 0));
      }
      updated[idx] = row;
      return updated;
    });
  };

  // Fuel entry helpers (operate on a specific row)
  const addFuelEntry = (rowIdx) => {
    setRows(prev => {
      const updated = [...prev];
      const row = { ...updated[rowIdx], dirty: true };
      row.fuel_entries = [...row.fuel_entries, { station_name: '', fuel_type: 'UNLEADED', liters: 0, price_per_liter: 0, total_amount: 0, payment_mode: 'CASH' }];
      updated[rowIdx] = row;
      return updated;
    });
  };

  const updateFuelEntry = (rowIdx, fuelIdx, field, value) => {
    setRows(prev => {
      const updated = [...prev];
      const row = { ...updated[rowIdx], dirty: true };
      const fuels = [...row.fuel_entries];
      fuels[fuelIdx] = { ...fuels[fuelIdx], [field]: value };
      if (field === 'liters' || field === 'price_per_liter') {
        fuels[fuelIdx].total_amount = Math.round((fuels[fuelIdx].liters || 0) * (fuels[fuelIdx].price_per_liter || 0) * 100) / 100;
      }
      row.fuel_entries = fuels;
      // Recompute fuel totals
      row.actual_liters = fuels.reduce((s, f) => s + (f.liters || 0), 0);
      row.total_fuel_amount = fuels.reduce((s, f) => s + (f.total_amount || 0), 0);
      updated[rowIdx] = row;
      return updated;
    });
  };

  const removeFuelEntry = (rowIdx, fuelIdx) => {
    setRows(prev => {
      const updated = [...prev];
      const row = { ...updated[rowIdx], dirty: true };
      row.fuel_entries = row.fuel_entries.filter((_, i) => i !== fuelIdx);
      row.actual_liters = row.fuel_entries.reduce((s, f) => s + (f.liters || 0), 0);
      row.total_fuel_amount = row.fuel_entries.reduce((s, f) => s + (f.total_amount || 0), 0);
      updated[rowIdx] = row;
      return updated;
    });
  };

  // Save a single row
  const saveRow = async (idx) => {
    const row = rows[idx];
    if (!row.dirty) return;
    const hasData = row.starting_km > 0 || row.ending_km > 0 || row.fuel_entries.length > 0 || row.destination || row.notes;
    if (!hasData && !row._id) return; // nothing to save

    const data = {
      entry_date: row.entry_date,
      starting_km: row.starting_km,
      ending_km: row.ending_km,
      personal_km: row.personal_km,
      fuel_entries: row.fuel_entries,
      destination: row.destination,
      notes: row.notes,
      period, cycle,
      km_per_liter: settings?.FUEL_EFFICIENCY_DEFAULT || 12
    };

    setSavingRow(idx);
    try {
      if (row._id && ['DRAFT', 'ERROR'].includes(row.status)) {
        const res = await updateCarLogbook(row._id, data);
        const doc = res?.data;
        setRows(prev => {
          const u = [...prev];
          u[idx] = { ...u[idx], ...doc, dirty: false, _id: doc._id, status: doc.status };
          return u;
        });
      } else if (!row._id) {
        const res = await createCarLogbook(data);
        const doc = res?.data;
        setRows(prev => {
          const u = [...prev];
          u[idx] = { ...u[idx], ...doc, dirty: false, _id: doc._id, status: doc.status };
          return u;
        });
      }
    } catch (err) {
      console.error('[CarLogbook] Save failed:', err.message);
      showError(err, 'Could not save entry');
    }
    setSavingRow(null);
  };

  // Save all dirty rows at once (like SMER's "Create/Update" button)
  const handleSaveAll = async () => {
    const dirtyRows = rows.map((r, i) => ({ ...r, idx: i })).filter(r => r.dirty);
    if (!dirtyRows.length) { showMsg('No changes to save'); return; }
    let saved = 0;
    for (const r of dirtyRows) {
      await saveRow(r.idx);
      saved++;
    }
    showMsg(`Saved ${saved} logbook entr${saved === 1 ? 'y' : 'ies'}`);
  };

  // Scan handlers
  const handleScanOdometer = (rowIdx, field) => {
    setScanOdoTarget({ rowIdx, field });
    setScanOdoOpen(true);
  };
  const handleOdoApply = (ocrData) => {
    if (!scanOdoTarget) return;
    const val = (f) => (f && typeof f === 'object' && 'value' in f) ? f.value : (f || '');
    const reading = parseInt(val(ocrData.extracted?.reading)) || 0;
    if (reading > 0) {
      const field = scanOdoTarget.field === 'starting' ? 'starting_km' : 'ending_km';
      handleRowChange(scanOdoTarget.rowIdx, field, reading);
    }
  };

  const handleScanGas = (rowIdx) => {
    setScanGasRowIdx(rowIdx);
    setScanGasOpen(true);
  };
  const handleGasApply = (ocrData) => {
    if (scanGasRowIdx == null) return;
    const val = (f) => (f && typeof f === 'object' && 'value' in f) ? f.value : (f || '');
    const e = ocrData.extracted || {};
    const receiptDate = val(e.date) || '';
    const newFuel = {
      station_name: val(e.station_name) || '',
      fuel_type: val(e.fuel_type) || 'UNLEADED',
      liters: parseFloat(val(e.liters)) || 0,
      price_per_liter: parseFloat(val(e.price_per_liter)) || 0,
      total_amount: parseFloat(val(e.total_amount)) || 0,
      payment_mode: 'CASH',
      receipt_url: ocrData.s3_url || '',
      receipt_attachment_id: ocrData.attachment_id || null,
      receipt_ocr_data: ocrData.extracted || null,
      receipt_date: receiptDate
    };

    // Cross-check receipt date
    const row = rows[scanGasRowIdx];
    if (receiptDate && row) {
      const normalize = (d) => { try { return new Date(d).toISOString().split('T')[0]; } catch { return ''; } };
      const normReceipt = normalize(receiptDate);
      if (normReceipt && normReceipt !== row.entry_date) {
        showError(null, `Receipt date (${normReceipt}) does not match logbook date (${row.entry_date}) — verify the correct trip date.`);
      }
    }

    setRows(prev => {
      const updated = [...prev];
      const r = { ...updated[scanGasRowIdx], dirty: true };
      r.fuel_entries = [...r.fuel_entries, newFuel];
      r.actual_liters = r.fuel_entries.reduce((s, f) => s + (f.liters || 0), 0);
      r.total_fuel_amount = r.fuel_entries.reduce((s, f) => s + (f.total_amount || 0), 0);
      updated[scanGasRowIdx] = r;
      return updated;
    });
  };

  // Batch actions
  const handleValidate = async () => {
    // Save all dirty rows first
    for (let i = 0; i < rows.length; i++) { if (rows[i].dirty) await saveRow(i); }
    try { const r = await validateCarLogbook(); showMsg(r?.message || 'Validated'); loadAndMerge(); } catch (e) { showMsg(e.response?.data?.message || 'Validation failed', true); }
  };
  const handleSubmit = async () => {
    // Save all dirty rows first
    for (let i = 0; i < rows.length; i++) { if (rows[i].dirty) await saveRow(i); }
    try {
      const r = await submitCarLogbook();
      if (r?.approval_pending) { showApprovalPending(r.message); }
      else showMsg(r?.message || 'Submitted');
      loadAndMerge();
    } catch (e) {
      if (e?.response?.data?.approval_pending) { showApprovalPending(e.response.data.message); loadAndMerge(); }
      else showMsg(e.response?.data?.message || 'Submit failed — are there VALID entries?', true);
    }
  };
  const handleReopen = async (id) => { try { await reopenCarLogbook([id]); showMsg('Reopened'); loadAndMerge(); } catch (e) { showMsg(e.response?.data?.message || 'Reopen failed', true); } };
  const handleDelete = async (id, idx) => {
    try {
      await deleteDraftCarLogbook(id);
      showMsg('Deleted');
      // Reset the row to empty
      setRows(prev => {
        const u = [...prev];
        u[idx] = { ...u[idx], _id: null, starting_km: 0, ending_km: 0, personal_km: 0, fuel_entries: [], destination: '', notes: '', status: null, dirty: false, total_km: 0, official_km: 0, actual_liters: 0, total_fuel_amount: 0, overconsumption_flag: false, validation_errors: [] };
        return u;
      });
    } catch (e) { showMsg(e.response?.data?.message || 'Delete failed — only DRAFT entries can be deleted', true); }
  };

  // Summary totals
  const totalKm = rows.reduce((s, r) => s + (r.total_km || 0), 0);
  const totalOfficial = rows.reduce((s, r) => s + (r.official_km || 0), 0);
  const totalFuel = rows.reduce((s, r) => s + (r.total_fuel_amount || 0), 0);
  const totalLiters = rows.reduce((s, r) => s + (r.actual_liters || 0), 0);
  const hasCalf = rows.some(r => (r.fuel_entries || []).some(f => f.calf_required && !f.calf_id));

  const inp = { padding: '2px 4px', borderRadius: 4, border: '1px solid var(--erp-border, #dbe4f0)', fontSize: 11 };
  const scanBtn = { padding: '1px 4px', borderRadius: 3, background: '#16a34a', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 9, fontWeight: 600 };
  const isEditable = (row) => !row.status || ['DRAFT', 'ERROR'].includes(row.status);

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
            <button onClick={handleSaveAll} disabled={loading || !rows.some(r => r.dirty)} style={{ padding: '6px 16px', borderRadius: 6, background: 'var(--erp-accent, #1e5eff)', color: '#fff', border: 'none', cursor: loading || !rows.some(r => r.dirty) ? 'default' : 'pointer', opacity: rows.some(r => r.dirty) ? 1 : 0.5 }}>Save Car Logbook</button>
            <button onClick={handleValidate} disabled={loading} style={{ padding: '6px 16px', borderRadius: 6, background: '#22c55e', color: '#fff', border: 'none', cursor: 'pointer' }}>Validate</button>
            <button onClick={handleSubmit} disabled={loading} style={{ padding: '6px 16px', borderRadius: 6, background: '#2563eb', color: '#fff', border: 'none', cursor: 'pointer' }}>Submit</button>
            <Link to="/erp/prf-calf" style={{ padding: '6px 14px', borderRadius: 6, background: '#f1f5f9', color: 'var(--erp-text, #132238)', textDecoration: 'none', fontSize: 13, border: '1px solid var(--erp-border, #dbe4f0)' }}>PRF / CALF</Link>
          </div>

          {/* CALF Dependency Warning */}
          {hasCalf && (
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

          {/* ═══ Desktop Grid ═══ */}
          <div className="cl-table" style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'var(--erp-bg-alt, #f1f5f9)', borderBottom: '2px solid var(--erp-border, #dbe4f0)' }}>
                  <th style={{ padding: 6, textAlign: 'center', width: 50 }}>Date</th>
                  <th style={{ padding: 6, textAlign: 'center', width: 35 }}>DOW</th>
                  <th style={{ padding: 6, textAlign: 'left', width: 140, maxWidth: 160 }}>Destination</th>
                  <th style={{ padding: 6, textAlign: 'right', width: 80 }}>Start KM</th>
                  <th style={{ padding: 6, width: 22 }}></th>
                  <th style={{ padding: 6, textAlign: 'right', width: 80 }}>End KM</th>
                  <th style={{ padding: 6, width: 22 }}></th>
                  <th style={{ padding: 6, textAlign: 'right', width: 55 }}>Pers</th>
                  <th style={{ padding: 6, textAlign: 'right', width: 55 }}>Official</th>
                  <th style={{ padding: 6, textAlign: 'right', width: 55 }}>Fuel</th>
                  <th style={{ padding: 6, textAlign: 'right', width: 65 }}>₱</th>
                  <th style={{ padding: 6, textAlign: 'center', width: 70 }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => {
                  const editable = isEditable(row);
                  const isExp = expandedRow === idx;
                  const fuelCount = (row.fuel_entries || []).length;
                  return (
                    <Fragment key={row.entry_date}>
                      <tr style={{ borderBottom: isExp ? 'none' : '1px solid var(--erp-border, #dbe4f0)', background: row.overconsumption_flag ? '#fef2f2' : row.isWeekend ? WEEKEND_BG : undefined }}>
                        <td style={{ padding: '3px 6px', textAlign: 'center', fontSize: 11 }}>{displayDate(row.entry_date)}</td>
                        <td style={{ padding: '3px 4px', textAlign: 'center', fontSize: 10, color: row.isWeekend ? '#d97706' : 'var(--erp-muted, #5f7188)' }}>{row.day_of_week}</td>
                        <td style={{ padding: '3px 4px', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {editable ? (
                            <input value={row.destination || ''} onChange={e => handleRowChange(idx, 'destination', e.target.value)} placeholder="Details..." title={row.destination || ''} style={{ ...inp, width: '100%', maxWidth: 150 }} />
                          ) : (
                            <span style={{ fontSize: 11, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block', maxWidth: 150 }} title={row.destination}>{row.destination || '—'}</span>
                          )}
                        </td>
                        <td style={{ padding: '3px 4px', textAlign: 'right' }}>
                          {editable ? (
                            <input type="number" value={row.starting_km || ''} onChange={e => handleRowChange(idx, 'starting_km', Number(e.target.value))} style={{ ...inp, width: 70, textAlign: 'right' }} />
                          ) : (
                            <span style={{ fontSize: 11 }}>{row.starting_km ? row.starting_km.toLocaleString() : '—'}</span>
                          )}
                        </td>
                        <td style={{ padding: '1px 0', textAlign: 'center' }}>
                          {editable && <button onClick={() => handleScanOdometer(idx, 'starting')} style={scanBtn} title="Scan start odometer">S</button>}
                        </td>
                        <td style={{ padding: '3px 4px', textAlign: 'right' }}>
                          {editable ? (
                            <input type="number" value={row.ending_km || ''} onChange={e => handleRowChange(idx, 'ending_km', Number(e.target.value))} style={{ ...inp, width: 70, textAlign: 'right' }} />
                          ) : (
                            <span style={{ fontSize: 11 }}>{row.ending_km ? row.ending_km.toLocaleString() : '—'}</span>
                          )}
                        </td>
                        <td style={{ padding: '1px 0', textAlign: 'center' }}>
                          {editable && <button onClick={() => handleScanOdometer(idx, 'ending')} style={scanBtn} title="Scan end odometer">E</button>}
                        </td>
                        <td style={{ padding: '3px 4px', textAlign: 'right' }}>
                          {editable ? (
                            <input type="number" value={row.personal_km || ''} onChange={e => handleRowChange(idx, 'personal_km', Number(e.target.value))} style={{ ...inp, width: 45, textAlign: 'right' }} />
                          ) : (
                            <span style={{ fontSize: 11 }}>{(row.personal_km || 0).toLocaleString()}</span>
                          )}
                        </td>
                        <td style={{ padding: '3px 4px', textAlign: 'right', fontWeight: 500, fontSize: 11, color: '#2563eb' }}>{(row.official_km || 0).toLocaleString()}</td>
                        <td style={{ padding: '3px 4px', textAlign: 'right' }}>
                          <button onClick={() => setExpandedRow(isExp ? null : idx)} style={{ padding: '1px 5px', borderRadius: 4, fontSize: 10, border: '1px solid var(--erp-border, #dbe4f0)', background: fuelCount > 0 ? '#f0fdf4' : '#fff', cursor: 'pointer', fontWeight: fuelCount > 0 ? 600 : 400, color: fuelCount > 0 ? '#166534' : 'var(--erp-muted)' }}>
                            {fuelCount > 0 ? `${(row.actual_liters || 0).toFixed(1)}L` : '+Fuel'}
                          </button>
                        </td>
                        <td style={{ padding: '3px 4px', textAlign: 'right', fontSize: 11, fontWeight: 500 }}>{row.total_fuel_amount ? `₱${row.total_fuel_amount.toLocaleString()}` : ''}</td>
                        <td style={{ padding: '3px 4px', textAlign: 'center' }}>
                          {row.status && <span style={{ padding: '1px 6px', borderRadius: 4, fontSize: 10, color: '#fff', background: STATUS_COLORS[row.status] || '#6b7280' }}>{row.status}</span>}
                          {row.overconsumption_flag && <span style={{ marginLeft: 2, padding: '1px 4px', borderRadius: 4, fontSize: 8, color: '#dc2626', background: '#fef2f2', border: '1px solid #fca5a5' }}>OVER</span>}
                          {savingRow === idx && <span style={{ marginLeft: 2, fontSize: 9, color: '#6b7280' }}>...</span>}
                          {row.dirty && savingRow !== idx && <span style={{ marginLeft: 2, fontSize: 9, color: '#d97706' }}>*</span>}
                          {row.status === 'DRAFT' && row._id && (
                            <button onClick={() => handleDelete(row._id, idx)} title="Delete draft" style={{ marginLeft: 2, padding: '0 3px', fontSize: 9, borderRadius: 3, border: '1px solid #ef4444', color: '#ef4444', background: '#fff', cursor: 'pointer' }}>X</button>
                          )}
                          {row.status === 'POSTED' && isAdmin && (
                            <button onClick={() => handleReopen(row._id)} title="Re-open" style={{ marginLeft: 2, padding: '0 3px', fontSize: 9, borderRadius: 3, border: '1px solid #eab308', color: '#b45309', background: '#fff', cursor: 'pointer' }}>Re</button>
                          )}
                        </td>
                      </tr>
                      {/* Expanded fuel entries */}
                      {isExp && (
                        <tr style={{ borderBottom: '1px solid var(--erp-border, #dbe4f0)', background: row.isWeekend ? WEEKEND_BG : '#fafbfc' }}>
                          <td colSpan={12} style={{ padding: '4px 8px 8px 32px' }}>
                            {row.fuel_entries.map((fuel, fi) => (
                              <div key={fi} style={{ display: 'flex', gap: 6, marginBottom: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                                <input placeholder="Station" value={fuel.station_name} onChange={e => updateFuelEntry(idx, fi, 'station_name', e.target.value)} disabled={!editable} style={{ ...inp, width: 100 }} />
                                <select value={fuel.fuel_type} onChange={e => updateFuelEntry(idx, fi, 'fuel_type', e.target.value)} disabled={!editable} style={{ ...inp, width: 80 }}>
                                  {FUEL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                                <input type="number" placeholder="L" value={fuel.liters || ''} onChange={e => updateFuelEntry(idx, fi, 'liters', Number(e.target.value))} disabled={!editable} style={{ ...inp, width: 55, textAlign: 'right' }} />
                                <input type="number" placeholder="₱/L" value={fuel.price_per_liter || ''} onChange={e => updateFuelEntry(idx, fi, 'price_per_liter', Number(e.target.value))} disabled={!editable} style={{ ...inp, width: 55, textAlign: 'right' }} />
                                <span style={{ fontSize: 11, fontWeight: 600, minWidth: 60 }}>= ₱{(fuel.total_amount || 0).toLocaleString()}</span>
                                <select value={fuel.payment_mode} onChange={e => updateFuelEntry(idx, fi, 'payment_mode', e.target.value)} disabled={!editable} style={{ ...inp, width: 75 }}>
                                  {PAYMENT_MODES.map(m => <option key={m} value={m}>{m}</option>)}
                                </select>
                                {editable && (
                                  <label style={{ padding: '1px 6px', borderRadius: 3, background: '#2563eb', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 9, fontWeight: 600, display: 'inline-block' }}>
                                    Rcpt
                                    <input type="file" accept="image/*" style={{ display: 'none' }} onChange={async e => {
                                      const file = e.target.files?.[0];
                                      if (!file) return;
                                      e.target.value = '';
                                      try {
                                        const result = await processDocument(file, 'GAS_RECEIPT');
                                        updateFuelEntry(idx, fi, 'receipt_url', result.s3_url || URL.createObjectURL(file));
                                        if (result.attachment_id) updateFuelEntry(idx, fi, 'receipt_attachment_id', result.attachment_id);
                                      } catch (err) {
                                        updateFuelEntry(idx, fi, 'receipt_url', URL.createObjectURL(file));
                                      }
                                    }} />
                                  </label>
                                )}
                                {fuel.receipt_url && <span style={{ fontSize: 9, padding: '1px 4px', borderRadius: 3, background: '#dcfce7', color: '#166534', fontWeight: 600 }}>Rcpt ✓</span>}
                                {fuel.payment_mode && fuel.payment_mode !== 'CASH' && (
                                  fuel.calf_id
                                    ? <a href={`/erp/prf-calf?id=${fuel.calf_id}`} style={{ fontSize: 9, padding: '1px 4px', borderRadius: 3, background: '#dcfce7', color: '#166534', fontWeight: 600, textDecoration: 'none' }}>CALF ✓</a>
                                    : <span style={{ fontSize: 9, padding: '1px 4px', borderRadius: 3, background: '#fef3c7', color: '#92400e', fontWeight: 600 }}>CALF</span>
                                )}
                                {editable && <button onClick={() => removeFuelEntry(idx, fi)} style={{ padding: '0 4px', borderRadius: 3, border: '1px solid #ef4444', color: '#ef4444', background: '#fff', cursor: 'pointer', fontSize: 10 }}>X</button>}
                              </div>
                            ))}
                            {editable && (
                              <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                                <button onClick={() => addFuelEntry(idx)} style={{ padding: '2px 8px', borderRadius: 4, border: '1px solid var(--erp-border, #dbe4f0)', background: '#fff', cursor: 'pointer', fontSize: 10 }}>+ Add Fuel</button>
                                <button onClick={() => handleScanGas(idx)} style={{ padding: '2px 8px', borderRadius: 4, background: '#16a34a', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 10, fontWeight: 600 }}>Scan Receipt</button>
                              </div>
                            )}
                            {!editable && !row.fuel_entries.length && <span style={{ fontSize: 11, color: 'var(--erp-muted)' }}>No fuel entries</span>}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ background: 'var(--erp-bg-alt, #f1f5f9)', fontWeight: 600, fontSize: 12 }}>
                  <td colSpan={3} style={{ padding: 6, textAlign: 'right' }}>Totals:</td>
                  <td colSpan={4} style={{ padding: 6 }}></td>
                  <td style={{ padding: 6, textAlign: 'right' }}></td>
                  <td style={{ padding: 6, textAlign: 'right', color: '#2563eb' }}>{totalOfficial.toLocaleString()} km</td>
                  <td style={{ padding: 6, textAlign: 'right' }}>{totalLiters.toFixed(1)}L</td>
                  <td style={{ padding: 6, textAlign: 'right' }}>₱{totalFuel.toLocaleString()}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Save button below grid (like SMER's "Update SMER") */}
          {rows.some(r => r.dirty) && (
            <div style={{ marginTop: 12, marginBottom: 16 }}>
              <button onClick={handleSaveAll} disabled={loading} style={{ padding: '8px 24px', borderRadius: 6, background: 'var(--erp-accent, #1e5eff)', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 14 }}>
                Save Car Logbook
              </button>
              <span style={{ marginLeft: 12, fontSize: 12, color: '#d97706' }}>{rows.filter(r => r.dirty).length} unsaved day(s)</span>
            </div>
          )}

          {/* ═══ Mobile Card View ═══ */}
          <div className="cl-cards">
            {rows.map((row, idx) => {
              const editable = isEditable(row);
              const isExp = expandedRow === idx;
              return (
                <div key={row.entry_date} className="cl-card" style={{ borderLeft: `4px solid ${row.status ? (STATUS_COLORS[row.status] || '#6b7280') : '#e2e8f0'}`, background: row.overconsumption_flag ? '#fef2f2' : row.isWeekend ? WEEKEND_BG : '#fff' }}>
                  <div className="cl-card-header">
                    <div>
                      <span style={{ fontWeight: 700, fontSize: 14 }}>{row.day_of_week}</span>
                      <span style={{ marginLeft: 6, color: row.isWeekend ? '#d97706' : 'var(--erp-muted)', fontSize: 12 }}>{displayDate(row.entry_date)}</span>
                      {row.status && <span style={{ marginLeft: 6, padding: '1px 6px', borderRadius: 4, fontSize: 10, color: '#fff', background: STATUS_COLORS[row.status] || '#6b7280' }}>{row.status}</span>}
                      {row.dirty && <span style={{ marginLeft: 4, fontSize: 9, color: '#d97706' }}>*unsaved</span>}
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      {row.total_fuel_amount > 0 && <div style={{ fontSize: 14, fontWeight: 700, color: '#2563eb' }}>₱{row.total_fuel_amount.toLocaleString()}</div>}
                    </div>
                  </div>
                  {/* Destination */}
                  {editable ? (
                    <input value={row.destination || ''} onChange={e => handleRowChange(idx, 'destination', e.target.value)} placeholder="Destination..." style={{ width: '100%', padding: '4px 8px', borderRadius: 4, border: '1px solid var(--erp-border, #dbe4f0)', fontSize: 12, marginBottom: 6 }} />
                  ) : row.destination ? (
                    <div style={{ fontSize: 12, color: '#2563eb', marginBottom: 6 }}>{row.destination}</div>
                  ) : null}
                  {/* KM Grid */}
                  <div className="cl-card-grid">
                    <div>
                      <span className="cl-card-label">Start KM</span><br/>
                      {editable ? (
                        <span style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                          <input type="number" value={row.starting_km || ''} onChange={e => handleRowChange(idx, 'starting_km', Number(e.target.value))} style={{ width: 65, padding: '2px 4px', borderRadius: 4, border: '1px solid var(--erp-border)', fontSize: 12 }} />
                          <button onClick={() => handleScanOdometer(idx, 'starting')} style={{ ...scanBtn, fontSize: 10, padding: '2px 4px' }}>S</button>
                        </span>
                      ) : <span className="cl-card-value">{row.starting_km ? row.starting_km.toLocaleString() : '—'}</span>}
                    </div>
                    <div>
                      <span className="cl-card-label">End KM</span><br/>
                      {editable ? (
                        <span style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                          <input type="number" value={row.ending_km || ''} onChange={e => handleRowChange(idx, 'ending_km', Number(e.target.value))} style={{ width: 65, padding: '2px 4px', borderRadius: 4, border: '1px solid var(--erp-border)', fontSize: 12 }} />
                          <button onClick={() => handleScanOdometer(idx, 'ending')} style={{ ...scanBtn, fontSize: 10, padding: '2px 4px' }}>E</button>
                        </span>
                      ) : <span className="cl-card-value">{row.ending_km ? row.ending_km.toLocaleString() : '—'}</span>}
                    </div>
                    <div>
                      <span className="cl-card-label">Personal</span><br/>
                      {editable ? (
                        <input type="number" value={row.personal_km || ''} onChange={e => handleRowChange(idx, 'personal_km', Number(e.target.value))} style={{ width: 55, padding: '2px 4px', borderRadius: 4, border: '1px solid var(--erp-border)', fontSize: 12 }} />
                      ) : <span className="cl-card-value">{(row.personal_km || 0).toLocaleString()}</span>}
                    </div>
                    <div><span className="cl-card-label">Total</span><br/><span className="cl-card-value">{(row.total_km || 0).toLocaleString()} km</span></div>
                    <div><span className="cl-card-label">Official</span><br/><span className="cl-card-value" style={{ color: '#2563eb' }}>{(row.official_km || 0).toLocaleString()}</span></div>
                    <div>
                      <span className="cl-card-label">Fuel</span><br/>
                      <button onClick={() => setExpandedRow(isExp ? null : idx)} style={{ padding: '2px 6px', borderRadius: 4, fontSize: 11, border: '1px solid var(--erp-border)', background: row.fuel_entries.length ? '#f0fdf4' : '#fff', cursor: 'pointer' }}>
                        {row.fuel_entries.length ? `${row.actual_liters.toFixed(1)}L ₱${row.total_fuel_amount.toLocaleString()}` : '+Fuel'}
                      </button>
                    </div>
                  </div>
                  {/* Expanded fuel */}
                  {isExp && (
                    <div style={{ padding: '6px 0', borderTop: '1px solid var(--erp-border, #dbe4f0)' }}>
                      {row.fuel_entries.map((fuel, fi) => (
                        <div key={fi} style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 4, padding: 4, borderRadius: 4, background: '#f8fafc', fontSize: 11 }}>
                          <input placeholder="Station" value={fuel.station_name} onChange={e => updateFuelEntry(idx, fi, 'station_name', e.target.value)} disabled={!editable} style={{ flex: '1 1 80px', ...inp }} />
                          <input type="number" placeholder="L" value={fuel.liters || ''} onChange={e => updateFuelEntry(idx, fi, 'liters', Number(e.target.value))} disabled={!editable} style={{ width: 50, ...inp, textAlign: 'right' }} />
                          <input type="number" placeholder="₱/L" value={fuel.price_per_liter || ''} onChange={e => updateFuelEntry(idx, fi, 'price_per_liter', Number(e.target.value))} disabled={!editable} style={{ width: 50, ...inp, textAlign: 'right' }} />
                          <span style={{ fontWeight: 600, minWidth: 55 }}>₱{(fuel.total_amount || 0).toLocaleString()}</span>
                          {editable && <button onClick={() => removeFuelEntry(idx, fi)} style={{ padding: '0 4px', borderRadius: 3, border: '1px solid #ef4444', color: '#ef4444', background: '#fff', cursor: 'pointer', fontSize: 10 }}>X</button>}
                        </div>
                      ))}
                      {editable && (
                        <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                          <button onClick={() => addFuelEntry(idx)} style={{ padding: '4px 10px', borderRadius: 4, border: '1px solid var(--erp-border)', background: '#fff', cursor: 'pointer', fontSize: 11 }}>+ Add Fuel</button>
                          <button onClick={() => handleScanGas(idx)} style={{ padding: '4px 10px', borderRadius: 4, background: '#16a34a', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>Scan</button>
                        </div>
                      )}
                    </div>
                  )}
                  {/* Actions */}
                  {(row.status === 'DRAFT' && row._id) && (
                    <div style={{ marginTop: 6, display: 'flex', gap: 6 }}>
                      <button onClick={() => handleDelete(row._id, idx)} style={{ padding: '4px 10px', borderRadius: 4, border: '1px solid #ef4444', color: '#ef4444', background: '#fff', cursor: 'pointer', fontSize: 11, flex: 1 }}>Delete</button>
                      <button onClick={() => saveRow(idx)} disabled={!row.dirty} style={{ padding: '4px 10px', borderRadius: 4, background: row.dirty ? '#2563eb' : '#e2e8f0', color: row.dirty ? '#fff' : '#94a3b8', border: 'none', cursor: row.dirty ? 'pointer' : 'default', fontSize: 11, flex: 1 }}>Save</button>
                    </div>
                  )}
                  {row.status === 'POSTED' && isAdmin && (
                    <div style={{ marginTop: 6 }}>
                      <button onClick={() => handleReopen(row._id)} style={{ padding: '4px 10px', borderRadius: 4, border: '1px solid #eab308', color: '#b45309', background: '#fff', cursor: 'pointer', fontSize: 11, width: '100%' }}>Re-open</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </main>
      </div>
      <ScanModal open={scanOdoOpen} onClose={() => setScanOdoOpen(false)} onApply={handleOdoApply} docType="ODOMETER" title="Scan Odometer" />
      <ScanModal open={scanGasOpen} onClose={() => setScanGasOpen(false)} onApply={handleGasApply} docType="GAS_RECEIPT" title="Scan Gas Receipt" />
    </div>
  );
}
