import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import useExpenses from '../hooks/useExpenses';
import { processDocument, extractExifDateTime } from '../services/ocrService';

import SelectField from '../../components/common/Select';

// ── ScanORModal — camera → OR parser → pre-fill expense line ──
function ScanORModal({ open, onClose, onApply }) {
  const [step, setStep] = useState('capture');
  const [preview, setPreview] = useState(null);
  const [ocrData, setOcrData] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const cameraRef = useRef(null);
  const galleryRef = useRef(null);

  const reset = () => { setStep('capture'); setPreview(null); setOcrData(null); setErrorMsg(''); };
  const handleClose = () => { reset(); onClose(); };

  const handleFile = async (file) => {
    if (!file) return;
    setPreview(URL.createObjectURL(file));
    setStep('scanning');
    try {
      const exif = await extractExifDateTime(file);
      const result = await processDocument(file, 'OR', exif);
      setOcrData(result);
      setStep('results');
    } catch (err) {
      setErrorMsg(err.message || 'OCR failed');
      setStep('error');
    }
  };

  const handleApply = () => {
    if (!ocrData?.extracted) return;
    const e = ocrData.extracted;
    const val = (f) => (f && typeof f === 'object' && 'value' in f) ? f.value : (f || '');
    onApply({
      or_number: val(e.or_number) || val(e.series_number) || '',
      expense_date: val(e.date) || '',
      establishment: val(e.supplier_name) || '',
      amount: parseFloat(val(e.total_amount) || val(e.amount)) || 0,
      vat_amount: parseFloat(val(e.vat_amount)) || 0,
      payment_mode: val(e.payment_mode) || 'CASH',
      or_photo_url: ocrData.s3_url || preview,
      or_attachment_id: ocrData.attachment_id || null,
      classification: ocrData.classification || null
    });
    handleClose();
  };

  if (!open) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#fff', borderRadius: 12, padding: 24, maxWidth: 500, width: '90%', maxHeight: '90vh', overflow: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
          <h3 style={{ margin: 0 }}>Scan OR / Receipt</h3>
          <button onClick={handleClose} style={{ border: 'none', background: 'none', fontSize: 18, cursor: 'pointer' }}>✕</button>
        </div>

        {step === 'capture' && (
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 16 }}>Take a photo of the Official Receipt or upload from gallery</p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <button onClick={() => cameraRef.current?.click()} style={{ padding: '10px 20px', borderRadius: 8, background: '#2563eb', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600 }}>📷 Take Photo</button>
              <button onClick={() => galleryRef.current?.click()} style={{ padding: '10px 20px', borderRadius: 8, background: '#6b7280', color: '#fff', border: 'none', cursor: 'pointer' }}>📁 Gallery</button>
            </div>
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={e => handleFile(e.target.files?.[0])} />
            <input ref={galleryRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => handleFile(e.target.files?.[0])} />
          </div>
        )}

        {step === 'scanning' && (
          <div style={{ textAlign: 'center', padding: 32 }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>🔍</div>
            <p>Scanning receipt...</p>
          </div>
        )}

        {step === 'error' && (
          <div style={{ textAlign: 'center', padding: 16 }}>
            <p style={{ color: '#dc2626' }}>{errorMsg}</p>
            <button onClick={reset} style={{ padding: '6px 16px', borderRadius: 6, background: '#2563eb', color: '#fff', border: 'none', cursor: 'pointer' }}>Try Again</button>
          </div>
        )}

        {step === 'results' && ocrData?.extracted && (
          <div>
            {preview && <img src={preview} alt="OR" style={{ width: '100%', maxHeight: 200, objectFit: 'contain', borderRadius: 8, marginBottom: 12 }} />}
            <div style={{ fontSize: 13 }}>
              {(() => { const e = ocrData.extracted; const val = (f) => (f && typeof f === 'object' && 'value' in f) ? f.value : (f || ''); return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div><strong>OR#:</strong> {val(e.or_number) || val(e.series_number) || '—'}</div>
                  <div><strong>Date:</strong> {val(e.date) || '—'}</div>
                  <div><strong>Supplier:</strong> {val(e.supplier_name) || '—'}</div>
                  <div><strong>Amount:</strong> ₱{val(e.total_amount) || val(e.amount) || '—'}</div>
                  <div><strong>VAT:</strong> ₱{val(e.vat_amount) || '—'}</div>
                  <div><strong>Payment:</strong> {val(e.payment_mode) || 'CASH'}</div>
                  {ocrData.classification && <div><strong>Category:</strong> {ocrData.classification.category} ({ocrData.classification.match_method})</div>}
                </div>
              ); })()}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
              <button onClick={reset} style={{ padding: '6px 16px', borderRadius: 6, border: '1px solid var(--erp-border, #dbe4f0)', background: '#fff', cursor: 'pointer' }}>Re-scan</button>
              <button onClick={handleApply} style={{ padding: '6px 16px', borderRadius: 6, background: '#22c55e', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Apply to Line</button>
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
const EXPENSE_TYPES = ['ORE', 'ACCESS'];
const PAYMENT_MODES = ['CASH', 'GCASH', 'CARD', 'BANK_TRANSFER', 'CHECK', 'ONLINE', 'OTHER'];
const EXPENSE_CATEGORIES = ['Courier/Shipping', 'Parking', 'Toll', 'Hotel/Accommodation', 'Food/Meals', 'Office Supplies', 'Communication', 'Transportation', 'Miscellaneous'];

export default function Expenses() {
  const { getExpenseList, getExpenseById, createExpense, updateExpense, deleteDraftExpense, validateExpenses, submitExpenses, reopenExpenses, getExpenseSummary, loading } = useExpenses();

  const [expenses, setExpenses] = useState([]);
  const [editingExpense, setEditingExpense] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [summary, setSummary] = useState(null);
  const [period, setPeriod] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [cycle, setCycle] = useState('C1');
  const [lines, setLines] = useState([]);
  const [scanOpen, setScanOpen] = useState(false);
  const [scanTargetIdx, setScanTargetIdx] = useState(null);

  const handleScanOR = (idx) => { setScanTargetIdx(idx); setScanOpen(true); };
  const handleScanApply = (data) => {
    if (scanTargetIdx !== null) {
      updateLine(scanTargetIdx, 'or_number', data.or_number);
      updateLine(scanTargetIdx, 'establishment', data.establishment);
      updateLine(scanTargetIdx, 'amount', data.amount);
      updateLine(scanTargetIdx, 'or_photo_url', data.or_photo_url);
      if (data.or_attachment_id) updateLine(scanTargetIdx, 'or_attachment_id', data.or_attachment_id);
      if (data.expense_date) updateLine(scanTargetIdx, 'expense_date', data.expense_date);
      if (data.classification?.category) updateLine(scanTargetIdx, 'expense_category', data.classification.category);
    }
  };

  const loadExpenses = useCallback(async () => {
    try {
      const [res, sumRes] = await Promise.all([
        getExpenseList({ period, cycle }),
        getExpenseSummary(period, cycle).catch(() => null)
      ]);
      setExpenses(res?.data || []);
      if (sumRes?.data) setSummary(sumRes.data);
    } catch { /* ignore */ }
  }, [period, cycle]);

  useEffect(() => { loadExpenses(); }, [loadExpenses]);

  const addLine = () => {
    setLines(prev => [...prev, {
      expense_date: new Date().toISOString().split('T')[0],
      expense_type: 'ORE',
      expense_category: '',
      establishment: '',
      particulars: '',
      amount: 0,
      or_number: '',
      payment_mode: 'CASH',
      notes: ''
    }]);
  };

  const updateLine = (idx, field, value) => {
    setLines(prev => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], [field]: value };
      // Auto-set CALF required for ACCESS non-cash
      if (field === 'expense_type' || field === 'payment_mode') {
        updated[idx].calf_required = updated[idx].expense_type === 'ACCESS' && updated[idx].payment_mode !== 'CASH';
      }
      return updated;
    });
  };

  const removeLine = (idx) => setLines(prev => prev.filter((_, i) => i !== idx));

  const handleNew = () => { setEditingExpense(null); setLines([]); addLine(); setShowForm(true); };

  const handleEdit = async (expense) => {
    try {
      const res = await getExpenseById(expense._id);
      const data = res?.data;
      setEditingExpense(data);
      setLines(data.lines || []);
      setShowForm(true);
    } catch { /* ignore */ }
  };

  const handleSave = async () => {
    const data = { period, cycle, lines };
    try {
      if (editingExpense) { await updateExpense(editingExpense._id, data); }
      else { await createExpense(data); }
      setShowForm(false);
      loadExpenses();
    } catch { /* ignore */ }
  };

  const [actionMsg, setActionMsg] = useState(null);
  const showMsg = (msg, isError = false) => { setActionMsg({ msg, isError }); setTimeout(() => setActionMsg(null), 5000); };

  const handleValidate = async () => { try { const r = await validateExpenses(); showMsg(r?.message || 'Validated'); loadExpenses(); } catch (e) { showMsg(e.response?.data?.message || 'Validation failed', true); } };
  const handleSubmit = async () => { try { const r = await submitExpenses(); showMsg(r?.message || 'Submitted'); loadExpenses(); } catch (e) { showMsg(e.response?.data?.message || 'Submit failed — are there VALID entries?', true); } };
  const handleReopen = async (id) => { try { await reopenExpenses([id]); showMsg('Reopened'); loadExpenses(); } catch (e) { showMsg(e.response?.data?.message || 'Reopen failed', true); } };
  const handleDelete = async (id) => { try { await deleteDraftExpense(id); showMsg('Deleted'); loadExpenses(); } catch (e) { showMsg(e.response?.data?.message || 'Delete failed', true); } };

  const totalOre = lines.filter(l => l.expense_type === 'ORE').reduce((s, l) => s + (l.amount || 0), 0);
  const totalAccess = lines.filter(l => l.expense_type === 'ACCESS').reduce((s, l) => s + (l.amount || 0), 0);

  return (
    <div className="admin-page erp-page">
      <Navbar />
      <div className="admin-layout">
        <Sidebar />
        <main className="admin-main" style={{ padding: 24 }}>
          <h1 style={{ marginBottom: 8, color: 'var(--erp-text, #132238)' }}>Expenses</h1>

          {/* Module navigation */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
            <Link to="/erp/smer" style={{ padding: '6px 14px', borderRadius: 6, background: '#f1f5f9', color: 'var(--erp-text, #132238)', textDecoration: 'none', fontSize: 13, border: '1px solid var(--erp-border, #dbe4f0)' }}>SMER Per Diem</Link>
            <Link to="/erp/car-logbook" style={{ padding: '6px 14px', borderRadius: 6, background: '#f1f5f9', color: 'var(--erp-text, #132238)', textDecoration: 'none', fontSize: 13, border: '1px solid var(--erp-border, #dbe4f0)' }}>Car Logbook</Link>
            <span style={{ padding: '6px 14px', borderRadius: 6, background: 'var(--erp-accent, #1e5eff)', color: '#fff', fontSize: 13, fontWeight: 600 }}>ORE / ACCESS</span>
            <Link to="/erp/prf-calf" style={{ padding: '6px 14px', borderRadius: 6, background: '#f1f5f9', color: 'var(--erp-text, #132238)', textDecoration: 'none', fontSize: 13, border: '1px solid var(--erp-border, #dbe4f0)' }}>PRF / CALF</Link>
          </div>

          {/* Summary cards */}
          {summary && (
            <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
              {[
                { label: 'SMER', value: summary.categories?.smer_reimbursable, status: summary.smer_status },
                { label: 'Gas (Official)', value: summary.categories?.gasoline_less_personal },
                { label: 'ORE', value: summary.categories?.ore_total },
                { label: 'ACCESS', value: summary.categories?.access_total },
                { label: 'Partners', value: summary.categories?.partners_insurance },
                { label: 'CORE Commission', value: summary.categories?.core_commission }
              ].map((c, i) => (
                <div key={i} style={{ padding: 10, borderRadius: 8, border: '1px solid var(--erp-border, #dbe4f0)', minWidth: 120, textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: 'var(--erp-muted, #5f7188)' }}>{c.label}</div>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>₱{(c.value || 0).toLocaleString()}</div>
                </div>
              ))}
            </div>
          )}

          {/* Controls */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <input type="month" value={period} onChange={e => setPeriod(e.target.value)} style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid var(--erp-border, #dbe4f0)' }} />
            <SelectField value={cycle} onChange={e => setCycle(e.target.value)} style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid var(--erp-border, #dbe4f0)' }}>
              <option value="C1">Cycle 1</option><option value="C2">Cycle 2</option><option value="MONTHLY">Monthly</option>
            </SelectField>
            <button onClick={handleNew} style={{ padding: '6px 16px', borderRadius: 6, background: 'var(--erp-accent, #1e5eff)', color: '#fff', border: 'none', cursor: 'pointer' }}>+ New Expense</button>
            <button onClick={handleValidate} disabled={loading} style={{ padding: '6px 16px', borderRadius: 6, background: '#22c55e', color: '#fff', border: 'none', cursor: 'pointer' }}>Validate</button>
            <button onClick={handleSubmit} disabled={loading} style={{ padding: '6px 16px', borderRadius: 6, background: '#2563eb', color: '#fff', border: 'none', cursor: 'pointer' }}>Submit</button>
          </div>

          {actionMsg && (
            <div style={{ padding: '6px 12px', marginBottom: 12, borderRadius: 6, fontSize: 13, background: actionMsg.isError ? '#fef2f2' : '#f0fdf4', border: `1px solid ${actionMsg.isError ? '#fca5a5' : '#bbf7d0'}`, color: actionMsg.isError ? '#dc2626' : '#166534' }}>
              {actionMsg.msg}
            </div>
          )}

          {/* Expense List */}
          {!showForm && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                <thead>
                  <tr style={{ background: 'var(--erp-bg-alt, #f1f5f9)', borderBottom: '2px solid var(--erp-border, #dbe4f0)' }}>
                    <th style={{ padding: 8, textAlign: 'left' }}>Period</th>
                    <th style={{ padding: 8, textAlign: 'left' }}>Cycle</th>
                    <th style={{ padding: 8, textAlign: 'right' }}>Lines</th>
                    <th style={{ padding: 8, textAlign: 'right' }}>ORE</th>
                    <th style={{ padding: 8, textAlign: 'right' }}>ACCESS</th>
                    <th style={{ padding: 8, textAlign: 'right' }}>Total</th>
                    <th style={{ padding: 8, textAlign: 'center' }}>Status</th>
                    <th style={{ padding: 8, textAlign: 'center' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {expenses.map(e => (
                    <React.Fragment key={e._id}>
                    <tr style={{ borderBottom: e.status === 'ERROR' ? 'none' : '1px solid var(--erp-border, #dbe4f0)' }}>
                      <td style={{ padding: 8 }}>{e.period}</td>
                      <td style={{ padding: 8 }}>{e.cycle}</td>
                      <td style={{ padding: 8, textAlign: 'right' }}>{e.line_count || 0}</td>
                      <td style={{ padding: 8, textAlign: 'right' }}>₱{(e.total_ore || 0).toLocaleString()}</td>
                      <td style={{ padding: 8, textAlign: 'right' }}>₱{(e.total_access || 0).toLocaleString()}</td>
                      <td style={{ padding: 8, textAlign: 'right', fontWeight: 600 }}>₱{(e.total_amount || 0).toLocaleString()}</td>
                      <td style={{ padding: 8, textAlign: 'center' }}>
                        <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 12, color: '#fff', background: STATUS_COLORS[e.status] || '#6b7280' }}>{e.status}</span>
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
                    {e.status === 'ERROR' && e.validation_errors?.length > 0 && (
                      <tr style={{ borderBottom: '1px solid var(--erp-border, #dbe4f0)' }}>
                        <td colSpan={8} style={{ padding: '4px 8px 8px', background: '#fef2f2' }}>
                          <div style={{ fontSize: 12, color: '#dc2626' }}>
                            {e.validation_errors.map((err, i) => <div key={i}>- {err}</div>)}
                          </div>
                        </td>
                      </tr>
                    )}
                    </React.Fragment>
                  ))}
                  {!expenses.length && <tr><td colSpan={8} style={{ padding: 24, textAlign: 'center', color: 'var(--erp-muted, #5f7188)' }}>No expenses for this period</td></tr>}
                </tbody>
              </table>
            </div>
          )}

          {/* Expense Form */}
          {showForm && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                <h2 style={{ margin: 0, fontSize: 18 }}>{editingExpense ? 'Edit' : 'New'} Expense — {period} {cycle}</h2>
                <button onClick={() => setShowForm(false)} style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid var(--erp-border, #dbe4f0)', background: '#fff', cursor: 'pointer' }}>Cancel</button>
              </div>

              {/* Expense Lines */}
              {lines.map((line, idx) => (
                <div key={idx} style={{ padding: 12, marginBottom: 8, borderRadius: 8, border: `1px solid ${line.calf_required ? '#f59e0b' : 'var(--erp-border, #dbe4f0)'}`, background: line.expense_type === 'ACCESS' ? '#fffbeb' : '#fff' }}>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--erp-muted)' }}>#{idx + 1}</span>
                    <SelectField value={line.expense_type} onChange={e => updateLine(idx, 'expense_type', e.target.value)} style={{ padding: '3px 8px', borderRadius: 4, border: '1px solid var(--erp-border, #dbe4f0)', fontSize: 12, fontWeight: 600 }}>
                      {EXPENSE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </SelectField>
                    <input type="date" value={line.expense_date?.split('T')[0] || ''} onChange={e => updateLine(idx, 'expense_date', e.target.value)} style={{ padding: '3px 8px', borderRadius: 4, border: '1px solid var(--erp-border, #dbe4f0)', fontSize: 12 }} />
                    <SelectField value={line.expense_category} onChange={e => updateLine(idx, 'expense_category', e.target.value)} style={{ padding: '3px 8px', borderRadius: 4, border: '1px solid var(--erp-border, #dbe4f0)', fontSize: 12 }}>
                      <option value="">Category...</option>
                      {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </SelectField>
                    <button onClick={() => removeLine(idx)} style={{ padding: '2px 8px', borderRadius: 4, border: '1px solid #ef4444', color: '#ef4444', background: '#fff', cursor: 'pointer', fontSize: 11 }}>X</button>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <input placeholder="Establishment" value={line.establishment} onChange={e => updateLine(idx, 'establishment', e.target.value)} style={{ flex: 1, minWidth: 120, padding: '3px 8px', borderRadius: 4, border: '1px solid var(--erp-border, #dbe4f0)', fontSize: 12 }} />
                    <input placeholder="Particulars" value={line.particulars} onChange={e => updateLine(idx, 'particulars', e.target.value)} style={{ flex: 1, minWidth: 120, padding: '3px 8px', borderRadius: 4, border: '1px solid var(--erp-border, #dbe4f0)', fontSize: 12 }} />
                    <input type="number" placeholder="Amount" value={line.amount || ''} onChange={e => updateLine(idx, 'amount', Number(e.target.value))} style={{ width: 90, padding: '3px 8px', borderRadius: 4, border: '1px solid var(--erp-border, #dbe4f0)', fontSize: 12 }} />
                    <input placeholder="OR#" value={line.or_number} onChange={e => updateLine(idx, 'or_number', e.target.value)} style={{ width: 80, padding: '3px 8px', borderRadius: 4, border: '1px solid var(--erp-border, #dbe4f0)', fontSize: 12 }} />
                    <button onClick={() => handleScanOR(idx)} style={{ padding: '3px 8px', borderRadius: 4, background: '#16a34a', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>Scan OR</button>
                    <label style={{ padding: '3px 8px', borderRadius: 4, background: '#2563eb', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600, display: 'inline-block' }}>
                      Upload OR
                      <input type="file" accept="image/*" style={{ display: 'none' }} onChange={async e => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        e.target.value = '';
                        try {
                          const result = await processDocument(file, 'OR');
                          updateLine(idx, 'or_photo_url', result.s3_url || URL.createObjectURL(file));
                          if (result.attachment_id) updateLine(idx, 'or_attachment_id', result.attachment_id);
                        } catch {
                          updateLine(idx, 'or_photo_url', URL.createObjectURL(file));
                        }
                      }} />
                    </label>
                    {line.or_photo_url && <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: '#dcfce7', color: '#166534', fontWeight: 600 }}>OR Photo ✓</span>}
                    <SelectField value={line.payment_mode} onChange={e => updateLine(idx, 'payment_mode', e.target.value)} style={{ padding: '3px 8px', borderRadius: 4, border: '1px solid var(--erp-border, #dbe4f0)', fontSize: 12 }}>
                      {PAYMENT_MODES.map(m => <option key={m} value={m}>{m}</option>)}
                    </SelectField>
                    {line.calf_required && <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: '#fef3c7', color: '#92400e', fontWeight: 600 }}>CALF Required</span>}
                  </div>
                </div>
              ))}
              <button onClick={addLine} style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid var(--erp-border, #dbe4f0)', background: '#fff', cursor: 'pointer', fontSize: 13, marginBottom: 16 }}>+ Add Line</button>

              {/* Totals */}
              <div style={{ display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
                <div style={{ padding: 10, borderRadius: 8, border: '1px solid var(--erp-border, #dbe4f0)', minWidth: 120 }}>
                  <div style={{ fontSize: 11, color: 'var(--erp-muted)' }}>ORE Total</div>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>₱{totalOre.toLocaleString()}</div>
                </div>
                <div style={{ padding: 10, borderRadius: 8, border: '1px solid #f59e0b', minWidth: 120, background: '#fffbeb' }}>
                  <div style={{ fontSize: 11, color: '#92400e' }}>ACCESS Total</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#92400e' }}>₱{totalAccess.toLocaleString()}</div>
                </div>
                <div style={{ padding: 10, borderRadius: 8, border: '1px solid var(--erp-accent, #1e5eff)', minWidth: 120 }}>
                  <div style={{ fontSize: 11, color: 'var(--erp-muted)' }}>Grand Total</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--erp-accent, #1e5eff)' }}>₱{(totalOre + totalAccess).toLocaleString()}</div>
                </div>
              </div>

              <button onClick={handleSave} disabled={loading} style={{ padding: '8px 24px', borderRadius: 6, background: 'var(--erp-accent, #1e5eff)', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                {editingExpense ? 'Update' : 'Save as Draft'}
              </button>
            </div>
          )}
        </main>
      </div>
      <ScanORModal open={scanOpen} onClose={() => setScanOpen(false)} onApply={handleScanApply} />
    </div>
  );
}
