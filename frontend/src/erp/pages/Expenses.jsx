import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import useExpenses from '../hooks/useExpenses';
import usePeople from '../hooks/usePeople';
import useAccounting from '../hooks/useAccounting';
import CostCenterPicker from '../components/CostCenterPicker';
import useErpSubAccess from '../hooks/useErpSubAccess';
import useErpApi from '../hooks/useErpApi';
import { useAuth } from '../../hooks/useAuth';
import { ROLE_SETS } from '../../constants/roles';
import { processDocument, extractExifDateTime } from '../services/ocrService';

import SelectField from '../../components/common/Select';
import { useLookupOptions } from '../hooks/useLookups';
import WorkflowGuide from '../components/WorkflowGuide';
import { showError } from '../utils/errorToast';

// ── ScanORModal — camera → OR parser → pre-fill expense line ──
 
function ScanORModal({ open, onClose, onApply }) {
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
const EXPENSE_TYPES_FALLBACK = ['ORE', 'ACCESS'];
// Static fallback — overridden at runtime by COA API when available
const COA_OPTIONS_FALLBACK = [
  // COGS
  { code: '5000', label: '5000 — Cost of Goods Sold' },
  { code: '5400', label: '5400 — Food Cost' },
  { code: '5500', label: '5500 — Beverage Cost' },
  // OpEx — Sales Force
  { code: '6100', label: '6100 — Per Diem Expense' },
  { code: '6150', label: '6150 — Transport Expense' },
  { code: '6155', label: '6155 — Travel & Accommodation' },
  { code: '6200', label: '6200 — Fuel & Gas' },
  { code: '6250', label: '6250 — Vehicle Maintenance' },
  { code: '6260', label: '6260 — Repairs & Maintenance' },
  // OpEx — Marketing
  { code: '6300', label: '6300 — Marketing Expense' },
  { code: '6310', label: '6310 — Marketing — HCP/Doctor' },
  { code: '6320', label: '6320 — Marketing — Hospital' },
  { code: '6330', label: '6330 — Marketing — Retail' },
  { code: '6350', label: '6350 — ACCESS Expense' },
  // OpEx — Admin
  { code: '6400', label: '6400 — Office Supplies' },
  { code: '6450', label: '6450 — Rent Expense' },
  { code: '6460', label: '6460 — Utilities & Communication' },
  { code: '6500', label: '6500 — Courier & Delivery' },
  { code: '6600', label: '6600 — Parking & Tolls' },
  { code: '6800', label: '6800 — Professional Fees' },
  { code: '6810', label: '6810 — Regulatory & Licensing' },
  { code: '6820', label: '6820 — IT Hardware & Software' },
  // OpEx — F&B
  { code: '6830', label: '6830 — F&B Supplies & Packaging' },
  { code: '6840', label: '6840 — Kitchen Equipment & Maintenance' },
  // OpEx — Rental/Property
  { code: '6870', label: '6870 — Property Maintenance' },
  { code: '6880', label: '6880 — Property Insurance' },
  { code: '6890', label: '6890 — Property Tax & Fees' },
  // Catch-all
  { code: '6900', label: '6900 — Miscellaneous' },
];
const pageStyles = `
.erp-expenses-page .admin-main {
  padding: 24px;
}

.erp-expenses-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
  flex-wrap: wrap;
}

.erp-expenses-nav {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 8px;
  margin-bottom: 16px;
}

.erp-expenses-nav a,
.erp-expenses-nav span {
  transition: transform 180ms ease, box-shadow 180ms ease, background 180ms ease, color 180ms ease;
}

.erp-expenses-nav a:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(30, 94, 255, 0.12);
}

.erp-expenses-nav span {
  background: linear-gradient(135deg, #1e5eff, #3b82f6);
  box-shadow: 0 10px 24px rgba(30, 94, 255, 0.25);
}

.erp-expenses-summary {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 12px;
  margin-bottom: 16px;
}

.erp-expenses-summary > div {
  background: linear-gradient(180deg, #ffffff, #f8fbff);
  box-shadow: 0 10px 22px rgba(15, 23, 42, 0.06);
  transition: transform 180ms ease, box-shadow 180ms ease;
}

.erp-expenses-summary > div:hover {
  transform: translateY(-2px);
  box-shadow: 0 14px 28px rgba(15, 23, 42, 0.12);
}

.erp-expenses-controls {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 12px;
  margin-bottom: 16px;
  align-items: center;
}

.erp-expenses-filters {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 12px;
  align-items: center;
}

.erp-expenses-date {
  padding: 6px 12px;
  border-radius: 10px;
  border: 1px solid rgba(30, 94, 255, 0.25);
  background: linear-gradient(180deg, #ffffff, #f5f9ff);
  box-shadow: 0 8px 18px rgba(30, 94, 255, 0.12);
  transition: box-shadow 180ms ease, transform 180ms ease, border-color 180ms ease;
}

.erp-expenses-date:focus {
  outline: none;
  border-color: rgba(30, 94, 255, 0.6);
  box-shadow: 0 10px 22px rgba(30, 94, 255, 0.22);
  transform: translateY(-1px);
}

.erp-expenses-cycle .vip-select__control {
  padding: 2px 4px;
  border-radius: 10px;
  border: 1px solid rgba(30, 94, 255, 0.25);
  background: linear-gradient(180deg, #ffffff, #f5f9ff);
  box-shadow: 0 8px 18px rgba(30, 94, 255, 0.12);
  transition: box-shadow 180ms ease, transform 180ms ease, border-color 180ms ease;
  min-height: 34px;
}

.erp-expenses-cycle .vip-select__control--is-focused {
  border-color: rgba(30, 94, 255, 0.6);
  box-shadow: 0 10px 22px rgba(30, 94, 255, 0.22);
  transform: translateY(-1px);
}

.erp-expenses-cycle .vip-select__value-container {
  padding-left: 8px;
}

.erp-expenses-actions {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 8px;
  align-items: center;
}

.erp-expenses-actions button {
  transition: transform 180ms ease, box-shadow 180ms ease, filter 180ms ease;
}

.erp-expenses-actions button:hover {
  transform: translateY(-1px);
  box-shadow: 0 10px 20px rgba(15, 23, 42, 0.15);
  filter: brightness(1.03);
}

.erp-expenses-actions button:active {
  transform: translateY(0);
  box-shadow: 0 6px 12px rgba(15, 23, 42, 0.12);
}

.erp-expenses-table-wrap {
  overflow-x: auto;
}

.erp-expenses-cards {
  display: none;
}

.erp-expense-card {
  border: 1px solid var(--erp-border, #dbe4f0);
  border-radius: 10px;
  padding: 12px;
  background: #fff;
  box-shadow: 0 8px 16px rgba(15, 23, 42, 0.06);
  transition: transform 180ms ease, box-shadow 180ms ease;
}

.erp-expense-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 14px 26px rgba(15, 23, 42, 0.12);
}

.erp-expense-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}

.erp-expense-card-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  font-size: 13px;
}

.erp-expense-card-label {
  font-size: 11px;
  color: var(--erp-muted, #5f7188);
}

.erp-expense-card-actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-top: 8px;
}

.erp-expense-line-row,
.erp-expense-fields {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
}

.erp-expense-fields {
  margin-top: 8px;
}

@media (max-width: 768px) {
  .erp-expenses-page .admin-main {
    padding: 76px 16px 96px;
  }

  .erp-expenses-controls {
    grid-template-columns: 1fr;
  }

  .erp-expenses-filters,
  .erp-expenses-actions {
    grid-template-columns: 1fr;
  }

  .erp-expenses-actions button {
    width: 100%;
  }

  .erp-expenses-table-wrap {
    display: none;
  }

  .erp-expenses-cards {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .erp-expense-card-grid {
    grid-template-columns: 1fr;
  }

  .erp-expense-line-row,
  .erp-expense-fields {
    flex-direction: column;
    align-items: stretch;
  }

  .erp-expense-line-row > *,
  .erp-expense-fields > * {
    width: 100%;
  }
}
`;

export default function Expenses() {
  const { user } = useAuth();
  const { getExpenseList, getExpenseById, createExpense, updateExpense, deleteDraftExpense, validateExpenses, submitExpenses, reopenExpenses, getExpenseSummary, batchUploadExpenses, saveBatchExpenses, loading } = useExpenses();
  const { getPeopleList } = usePeople();
  const { getMyCards, getMyBankAccounts, listAccounts } = useAccounting();
  const { hasSubPermission } = useErpSubAccess();
  const isAdmin = ROLE_SETS.MANAGEMENT.includes(user?.role);
  const canBatchUpload = hasSubPermission('expenses', 'batch_upload') && isAdmin;
  const lookupApi = useErpApi();
  const { options: expCatOpts } = useLookupOptions('EXPENSE_CATEGORY');
  const EXPENSE_CATEGORIES = expCatOpts.map(o => o.label);
  const { options: birFlagOpts } = useLookupOptions('BIR_FLAG');
  const { options: expTypeOpts } = useLookupOptions('EXPENSE_TYPE');
  const EXPENSE_TYPES = expTypeOpts.length > 0 ? expTypeOpts.map(o => o.code) : EXPENSE_TYPES_FALLBACK;
  const BIR_FLAGS = birFlagOpts.map(o => o.code);
  const [paymentModes, setPaymentModes] = useState([]);

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

  // ── Batch Upload State (President/Admin) ──
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchBirFlag, setBatchBirFlag] = useState('BOTH');
  const [batchAssignedTo, setBatchAssignedTo] = useState('');
  const [batchFiles, setBatchFiles] = useState([]);
  const [batchLines, setBatchLines] = useState([]);
  const [batchSummary, setBatchSummary] = useState(null);
  const [batchErrors, setBatchErrors] = useState([]);
  const [batchProcessing, setBatchProcessing] = useState(false);
  const [batchProgress, setBatchProgress] = useState('');
  const [batchFundingType, setBatchFundingType] = useState(''); // '', 'CARD', 'BANK'
  const [batchFundingCardId, setBatchFundingCardId] = useState('');
  const [batchFundingAccountId, setBatchFundingAccountId] = useState('');
  const [batchCategory, setBatchCategory] = useState(''); // optional category override
  const [batchCostCenter, setBatchCostCenter] = useState('');
  const [people, setPeople] = useState([]);
  const [myCards, setMyCards] = useState([]);
  const [myBankAccounts, setMyBankAccounts] = useState([]);
  const [coaOptions, setCoaOptions] = useState(COA_OPTIONS_FALLBACK);
  const batchFileRef = useRef(null);

  // Load people, cards, bank accounts, COA for batch dropdowns
  useEffect(() => {
    lookupApi.get('/lookups/payment-modes').then(r => setPaymentModes(r?.data || [])).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!canBatchUpload) return;
    getPeopleList({ limit: 0 }).then(res => setPeople(res?.data || [])).catch(err => console.error('[Expenses] People load failed:', err.message));
    getMyCards().then(res => setMyCards(res?.data || [])).catch(err => console.error('[Expenses] Cards load failed:', err.message));
    getMyBankAccounts().then(res => setMyBankAccounts(res?.data || [])).catch(err => console.error('[Expenses] Bank accounts load failed:', err.message));
    listAccounts({ is_active: true }).then(res => {
      const accounts = res?.data || [];
      if (accounts.length) {
        const expenseAccounts = accounts
          .filter(a => a.account_type === 'EXPENSE')
          .map(a => ({ code: a.account_code, label: `${a.account_code} — ${a.account_name}` }));
        if (expenseAccounts.length) setCoaOptions(expenseAccounts);
      }
    }).catch(err => console.error('[Expenses] COA load failed:', err.message));
  }, [canBatchUpload]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleBatchFileChange = (e) => {
    const files = Array.from(e.target.files || []).slice(0, 20);
    setBatchFiles(files);
    e.target.value = '';
  };

  const handleBatchProcess = async () => {
    if (!batchFiles.length) return;
    setBatchProcessing(true);
    setBatchLines([]);
    setBatchErrors([]);
    setBatchSummary(null);
    setBatchProgress(`Processing 0 of ${batchFiles.length}...`);

    const formData = new FormData();
    batchFiles.forEach(f => formData.append('photos', f));
    formData.append('bir_flag', batchBirFlag);
    formData.append('period', period);
    formData.append('cycle', cycle);
    if (batchAssignedTo) formData.append('assigned_to', batchAssignedTo);
    if (batchCategory) formData.append('category_override', batchCategory);
    if (batchFundingCardId) formData.append('funding_card_id', batchFundingCardId);
    if (batchFundingAccountId) formData.append('funding_account_id', batchFundingAccountId);
    if (batchCostCenter) formData.append('cost_center_id', batchCostCenter);
    const modeType = batchFundingType === 'CARD' ? 'CARD' : batchFundingType === 'BANK' ? 'BANK_TRANSFER' : 'CASH';
    const matchedMode = paymentModes.find(pm => pm.mode_type === modeType && pm.is_active !== false);
    formData.append('payment_mode', matchedMode?.mode_code || modeType);

    try {
      setBatchProgress(`Processing ${batchFiles.length} images via OCR...`);
      const res = await batchUploadExpenses(formData);
      setBatchLines(res?.data?.lines || []);
      setBatchErrors(res?.data?.errors || []);
      setBatchSummary(res?.data?.summary || null);
      setBatchProgress('');
    } catch (err) {
      showMsg(err.response?.data?.message || 'Batch upload failed', true);
      setBatchProgress('');
    }
    setBatchProcessing(false);
  };

  const updateBatchLine = (idx, field, value) => {
    setBatchLines(prev => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], [field]: value };
      return updated;
    });
  };

  const removeBatchLine = (idx) => setBatchLines(prev => prev.filter((_, i) => i !== idx));

  const handleBatchSave = async () => {
    if (!batchLines.length) return;
    try {
      const res = await saveBatchExpenses({
        bir_flag: batchBirFlag,
        assigned_to: batchAssignedTo || undefined,
        funding_card_id: batchFundingCardId || undefined,
        funding_account_id: batchFundingAccountId || undefined,
        cost_center_id: batchCostCenter || undefined,
        period, cycle,
        lines: batchLines
      });
      showMsg(res?.message || `Saved ${batchLines.length} lines as DRAFT`);
      setBatchLines([]);
      setBatchFiles([]);
      setBatchSummary(null);
      setBatchErrors([]);
      setBatchOpen(false);
      loadExpenses();
    } catch (err) {
      showMsg(err.response?.data?.message || 'Save failed', true);
    }
  };

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
    } catch (err) { console.error('[Expenses] Load failed:', err.message); }
  }, [period, cycle]); // eslint-disable-line react-hooks/exhaustive-deps

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
      // Auto-set CALF required for ACCESS non-cash (company-funded)
      if (field === 'expense_type' || field === 'payment_mode') {
        const pm = paymentModes.find(p => p.mode_code === updated[idx].payment_mode);
        const needsCalf = pm ? pm.requires_calf : updated[idx].payment_mode !== 'CASH';
        updated[idx].calf_required = updated[idx].expense_type === 'ACCESS' && needsCalf;
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
    } catch (err) { console.error('[Expenses] Edit failed:', err.message); showError(err, 'Could not load expense'); }
  };

  const savingRef = useRef(false);
  const handleSave = async () => {
    if (savingRef.current) return; // prevent double-submit on slow mobile networks
    // Frontend validation before save
    const issues = [];
    const today = new Date().toISOString().split('T')[0];
    lines.forEach((l, i) => {
      if (!l.establishment?.trim()) issues.push(`Line ${i + 1}: Establishment is required`);
      if (!l.amount || l.amount <= 0) issues.push(`Line ${i + 1}: Amount must be > 0`);
      if (!l.expense_date) issues.push(`Line ${i + 1}: Date is required`);
      if (l.expense_date && l.expense_date > today) issues.push(`Line ${i + 1}: Expense date cannot be in the future`);
      if (l.or_number && !l.or_photo_url) issues.push(`Line ${i + 1}: OR# ${l.or_number} provided without receipt photo — attach photo for audit trail`);
    });
    if (!lines.length) issues.push('Add at least one expense line');
    if (issues.length) { showError(null, issues.join('. ')); return; }

    savingRef.current = true;
    const data = { period, cycle, lines };
    try {
      if (editingExpense) { await updateExpense(editingExpense._id, data); }
      else { await createExpense(data); }
      setShowForm(false);
      loadExpenses();
    } catch (err) { console.error('[Expenses] Save failed:', err.message); showError(err, 'Could not save expense'); }
    finally { savingRef.current = false; }
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
    <div className="admin-page erp-page erp-expenses-page">
      <Navbar />
      <style>{pageStyles}</style>
      <div className="admin-layout">
        <Sidebar />
        <main className="admin-main">
          <WorkflowGuide pageKey="expenses" />
          <div className="erp-expenses-header">
            <h1 style={{ marginBottom: 0, color: 'var(--erp-text, #132238)' }}>Expenses</h1>
          </div>

          {/* Module navigation */}
          <div className="erp-expenses-nav">
            <Link to="/erp/smer" style={{ padding: '6px 14px', borderRadius: 6, background: '#f1f5f9', color: 'var(--erp-text, #132238)', textDecoration: 'none', fontSize: 13, border: '1px solid var(--erp-border, #dbe4f0)' }}>SMER Per Diem</Link>
            <Link to="/erp/car-logbook" style={{ padding: '6px 14px', borderRadius: 6, background: '#f1f5f9', color: 'var(--erp-text, #132238)', textDecoration: 'none', fontSize: 13, border: '1px solid var(--erp-border, #dbe4f0)' }}>Car Logbook</Link>
            <span style={{ padding: '6px 14px', borderRadius: 6, background: 'var(--erp-accent, #1e5eff)', color: '#fff', fontSize: 13, fontWeight: 600 }}>ORE / ACCESS</span>
            <Link to="/erp/prf-calf" style={{ padding: '6px 14px', borderRadius: 6, background: '#f1f5f9', color: 'var(--erp-text, #132238)', textDecoration: 'none', fontSize: 13, border: '1px solid var(--erp-border, #dbe4f0)' }}>PRF / CALF</Link>
          </div>

          {/* Summary cards */}
          {summary && (
            <div className="erp-expenses-summary">
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
          <div className="erp-expenses-controls">
            <div className="erp-expenses-filters">
              <input
                className="erp-expenses-date"
                type="date"
                value={`${period}-01`}
                onChange={e => setPeriod(e.target.value.slice(0, 7))}
              />
              <SelectField className="erp-expenses-cycle" value={cycle} onChange={e => setCycle(e.target.value)}>
                <option value="C1">Cycle 1</option><option value="C2">Cycle 2</option><option value="MONTHLY">Monthly</option>
              </SelectField>
            </div>
            <div className="erp-expenses-actions">
              <button onClick={handleNew} style={{ padding: '6px 16px', borderRadius: 6, background: 'var(--erp-accent, #1e5eff)', color: '#fff', border: 'none', cursor: 'pointer' }}>+ New Expense</button>
              <button onClick={handleValidate} disabled={loading} style={{ padding: '6px 16px', borderRadius: 6, background: '#22c55e', color: '#fff', border: 'none', cursor: 'pointer' }}>Validate</button>
              <button onClick={handleSubmit} disabled={loading} style={{ padding: '6px 16px', borderRadius: 6, background: '#2563eb', color: '#fff', border: 'none', cursor: 'pointer' }}>Submit</button>
            </div>
          </div>

          {/* ═══ Batch Upload Section (President/Admin) ═══ */}
          {canBatchUpload && (
            <div style={{ marginBottom: 16, border: '1px solid #a78bfa', borderRadius: 10, background: '#faf5ff' }}>
              <button onClick={() => setBatchOpen(p => !p)} style={{ width: '100%', padding: '10px 16px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 14, fontWeight: 600, color: '#6d28d9' }}>
                <span>Batch OR Upload (OCR)</span>
                <span>{batchOpen ? '▲' : '▼'}</span>
              </button>

              {batchOpen && (
                <div style={{ padding: '0 16px 16px' }}>
                  {/* Step 1: Setup — Row 1 */}
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 8 }}>
                    <div>
                      <label style={{ fontSize: 11, color: '#6d28d9', fontWeight: 600, display: 'block', marginBottom: 2 }}>BIR Classification</label>
                      <select value={batchBirFlag} onChange={e => setBatchBirFlag(e.target.value)} style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #a78bfa', fontSize: 13, background: '#fff' }}>
                        {BIR_FLAGS.map(f => <option key={f} value={f}>{f}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: 11, color: '#6d28d9', fontWeight: 600, display: 'block', marginBottom: 2 }}>Category (optional)</label>
                      <select value={batchCategory} onChange={e => setBatchCategory(e.target.value)} style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #a78bfa', fontSize: 13, background: '#fff' }}>
                        <option value="">Auto-classify</option>
                        {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: 11, color: '#6d28d9', fontWeight: 600, display: 'block', marginBottom: 2 }}>Assign To</label>
                      <select value={batchAssignedTo} onChange={e => setBatchAssignedTo(e.target.value)} style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #a78bfa', fontSize: 13, background: '#fff', minWidth: 160 }}>
                        <option value="">Self (President)</option>
                        {people.map(p => <option key={p._id} value={p.user_id?._id || p.user_id}>{p.full_name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: 11, color: '#6d28d9', fontWeight: 600, display: 'block', marginBottom: 2 }}>Cost Center</label>
                      <CostCenterPicker value={batchCostCenter} onChange={setBatchCostCenter} />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, color: '#6d28d9', fontWeight: 600, display: 'block', marginBottom: 2 }}>Period / Cycle</label>
                      <span style={{ fontSize: 13, color: '#374151' }}>{period} — {cycle}</span>
                    </div>
                  </div>

                  {/* Setup — Row 2: Funding */}
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 12 }}>
                    <div>
                      <label style={{ fontSize: 11, color: '#6d28d9', fontWeight: 600, display: 'block', marginBottom: 2 }}>Funding Source</label>
                      <select value={batchFundingType} onChange={e => { setBatchFundingType(e.target.value); setBatchFundingCardId(''); setBatchFundingAccountId(''); }} style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #a78bfa', fontSize: 13, background: '#fff' }}>
                        <option value="">Cash (default)</option>
                        <option value="CARD">Credit / Debit Card</option>
                        <option value="BANK">Bank Account</option>
                      </select>
                    </div>
                    {batchFundingType === 'CARD' && (
                      <div>
                        <label style={{ fontSize: 11, color: '#6d28d9', fontWeight: 600, display: 'block', marginBottom: 2 }}>Card</label>
                        <select value={batchFundingCardId} onChange={e => setBatchFundingCardId(e.target.value)} style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #a78bfa', fontSize: 13, background: '#fff', minWidth: 180 }}>
                          <option value="">Select card...</option>
                          {myCards.map(c => <option key={c._id} value={c._id}>{c.card_name} ({c.bank})</option>)}
                        </select>
                      </div>
                    )}
                    {batchFundingType === 'BANK' && (
                      <div>
                        <label style={{ fontSize: 11, color: '#6d28d9', fontWeight: 600, display: 'block', marginBottom: 2 }}>Bank Account</label>
                        <select value={batchFundingAccountId} onChange={e => setBatchFundingAccountId(e.target.value)} style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #a78bfa', fontSize: 13, background: '#fff', minWidth: 180 }}>
                          <option value="">Select account...</option>
                          {myBankAccounts.map(b => <option key={b._id} value={b._id}>{b.bank_name} — {b.account_number}</option>)}
                        </select>
                      </div>
                    )}
                  </div>

                  {/* Step 2: Upload */}
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
                    <button onClick={() => batchFileRef.current?.click()} style={{ padding: '8px 16px', borderRadius: 6, background: '#7c3aed', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
                      Select OR Images
                    </button>
                    <input ref={batchFileRef} type="file" multiple accept="image/*" style={{ display: 'none' }} onChange={handleBatchFileChange} />
                    <span style={{ fontSize: 13, color: '#6d28d9', fontWeight: 600 }}>
                      {batchFiles.length > 0 ? `${batchFiles.length} of 20 ORs selected` : 'No files selected'}
                    </span>
                    {batchFiles.length > 0 && (
                      <button onClick={handleBatchProcess} disabled={batchProcessing} style={{ padding: '8px 16px', borderRadius: 6, background: batchProcessing ? '#9ca3af' : '#16a34a', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
                        {batchProcessing ? 'Processing...' : 'Process All'}
                      </button>
                    )}
                  </div>

                  {batchProgress && <div style={{ fontSize: 13, color: '#7c3aed', marginBottom: 8, fontWeight: 500 }}>{batchProgress}</div>}

                  {/* Batch Errors */}
                  {batchErrors.length > 0 && (
                    <div style={{ padding: 8, borderRadius: 6, background: '#fef2f2', border: '1px solid #fca5a5', marginBottom: 10, fontSize: 12 }}>
                      {batchErrors.map((e, i) => <div key={i} style={{ color: '#dc2626' }}>Image {e.index + 1} ({e.filename}): {e.error}</div>)}
                    </div>
                  )}

                  {/* Step 3: Review Table */}
                  {batchLines.length > 0 && (
                    <div>
                      {batchSummary && (
                        <div style={{ display: 'flex', gap: 12, marginBottom: 10, flexWrap: 'wrap', fontSize: 13 }}>
                          <span style={{ fontWeight: 600 }}>Processed: {batchSummary.processed}/{batchSummary.total_images}</span>
                          {batchSummary.assorted_count > 0 && <span style={{ color: '#b45309', fontWeight: 600 }}>Assorted: {batchSummary.assorted_count}</span>}
                          <span style={{ color: '#2563eb', fontWeight: 700 }}>Total: ₱{(batchSummary.total_amount || 0).toLocaleString()}</span>
                        </div>
                      )}

                      <div style={{ overflowX: 'auto', marginBottom: 12 }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                          <thead>
                            <tr style={{ background: '#ede9fe', borderBottom: '2px solid #a78bfa' }}>
                              <th style={{ padding: 6, textAlign: 'left' }}>#</th>
                              <th style={{ padding: 6, textAlign: 'left' }}>Date</th>
                              <th style={{ padding: 6, textAlign: 'left' }}>Establishment</th>
                              <th style={{ padding: 6, textAlign: 'right' }}>Amount</th>
                              <th style={{ padding: 6, textAlign: 'right' }}>VAT</th>
                              <th style={{ padding: 6, textAlign: 'left' }}>COA</th>
                              <th style={{ padding: 6, textAlign: 'left' }}>Category</th>
                              <th style={{ padding: 6, textAlign: 'left' }}>OR#</th>
                              <th style={{ padding: 6, textAlign: 'center' }}>Photo</th>
                              <th style={{ padding: 6, textAlign: 'center' }}></th>
                            </tr>
                          </thead>
                          <tbody>
                            {batchLines.map((line, idx) => (
                              <tr key={idx} style={{ borderBottom: '1px solid #ddd6fe', background: line.is_assorted ? '#fef3c7' : '#fff' }}>
                                <td style={{ padding: 6 }}>
                                  {idx + 1}
                                  {line.is_assorted && <span style={{ marginLeft: 4, fontSize: 10, padding: '1px 4px', borderRadius: 3, background: '#f59e0b', color: '#fff', fontWeight: 600 }}>ASSORTED</span>}
                                </td>
                                <td style={{ padding: 6 }}>
                                  <input type="date" value={(line.expense_date || '').split('T')[0]} onChange={e => updateBatchLine(idx, 'expense_date', e.target.value)} style={{ padding: '2px 4px', borderRadius: 4, border: '1px solid #ddd6fe', fontSize: 11, width: 110 }} />
                                </td>
                                <td style={{ padding: 6 }}>
                                  <input value={line.establishment || ''} onChange={e => updateBatchLine(idx, 'establishment', e.target.value)} style={{ padding: '2px 4px', borderRadius: 4, border: '1px solid #ddd6fe', fontSize: 11, width: 140 }} />
                                </td>
                                <td style={{ padding: 6, textAlign: 'right' }}>
                                  <input type="number" value={line.amount || ''} onChange={e => updateBatchLine(idx, 'amount', Number(e.target.value))} style={{ padding: '2px 4px', borderRadius: 4, border: '1px solid #ddd6fe', fontSize: 11, width: 80, textAlign: 'right' }} />
                                </td>
                                <td style={{ padding: 6, textAlign: 'right', fontSize: 11, color: '#6b7280' }}>₱{(line.vat_amount || 0).toLocaleString()}</td>
                                <td style={{ padding: 6 }}>
                                  <select value={line.coa_code || '6900'} onChange={e => updateBatchLine(idx, 'coa_code', e.target.value)} style={{ padding: '2px 4px', borderRadius: 4, border: '1px solid #ddd6fe', fontSize: 11 }}>
                                    {coaOptions.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
                                  </select>
                                </td>
                                <td style={{ padding: 6, fontSize: 11, color: '#6b7280' }}>{line.expense_category || '—'}</td>
                                <td style={{ padding: 6 }}>
                                  <input value={line.or_number || ''} onChange={e => updateBatchLine(idx, 'or_number', e.target.value)} style={{ padding: '2px 4px', borderRadius: 4, border: '1px solid #ddd6fe', fontSize: 11, width: 70 }} />
                                </td>
                                <td style={{ padding: 6, textAlign: 'center' }}>
                                  {line.or_photo_url ? <a href={line.or_photo_url} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: '#16a34a', fontWeight: 600 }}>View</a> : '—'}
                                </td>
                                <td style={{ padding: 6, textAlign: 'center' }}>
                                  <button onClick={() => removeBatchLine(idx)} style={{ padding: '1px 6px', borderRadius: 4, border: '1px solid #ef4444', color: '#ef4444', background: '#fff', cursor: 'pointer', fontSize: 10 }}>X</button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      <button onClick={handleBatchSave} disabled={loading} style={{ padding: '8px 20px', borderRadius: 6, background: '#7c3aed', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 14 }}>
                        Save All as Draft ({batchLines.length} lines)
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {actionMsg && (
            <div style={{ padding: '6px 12px', marginBottom: 12, borderRadius: 6, fontSize: 13, background: actionMsg.isError ? '#fef2f2' : '#f0fdf4', border: `1px solid ${actionMsg.isError ? '#fca5a5' : '#bbf7d0'}`, color: actionMsg.isError ? '#dc2626' : '#166534' }}>
              {actionMsg.msg}
            </div>
          )}

          {/* Expense List */}
          {!showForm && (
            <div className="erp-expenses-table-wrap">
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
                        {e.status === 'POSTED' && isAdmin && <button onClick={() => handleReopen(e._id)} style={{ padding: '2px 8px', fontSize: 12, borderRadius: 4, border: '1px solid #eab308', background: '#fff', color: '#b45309', cursor: 'pointer' }}>Re-open</button>}
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

          {!showForm && (
            <div className="erp-expenses-cards">
              {expenses.map(e => (
                <div key={e._id} className="erp-expense-card">
                  <div className="erp-expense-card-header">
                    <div>
                      <div style={{ fontWeight: 600 }}>{e.period}</div>
                      <div style={{ fontSize: 12, color: 'var(--erp-muted, #5f7188)' }}>{e.cycle}</div>
                    </div>
                    <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 12, color: '#fff', background: STATUS_COLORS[e.status] || '#6b7280' }}>{e.status}</span>
                  </div>
                  <div className="erp-expense-card-grid">
                    <div>
                      <div className="erp-expense-card-label">Lines</div>
                      <div>{e.line_count || 0}</div>
                    </div>
                    <div>
                      <div className="erp-expense-card-label">ORE</div>
                      <div>₱{(e.total_ore || 0).toLocaleString()}</div>
                    </div>
                    <div>
                      <div className="erp-expense-card-label">ACCESS</div>
                      <div>₱{(e.total_access || 0).toLocaleString()}</div>
                    </div>
                    <div>
                      <div className="erp-expense-card-label">Total</div>
                      <div style={{ fontWeight: 600 }}>₱{(e.total_amount || 0).toLocaleString()}</div>
                    </div>
                  </div>
                  {e.status === 'ERROR' && e.validation_errors?.length > 0 && (
                    <div style={{ marginTop: 8, padding: '6px 8px', borderRadius: 6, background: '#fef2f2', border: '1px solid #fca5a5' }}>
                      <div style={{ fontSize: 12, color: '#dc2626' }}>
                        {e.validation_errors.map((err, i) => <div key={i}>- {err}</div>)}
                      </div>
                    </div>
                  )}
                  <div className="erp-expense-card-actions">
                    {['DRAFT', 'ERROR'].includes(e.status) && (
                      <button onClick={() => handleEdit(e)} style={{ padding: '4px 10px', fontSize: 12, borderRadius: 6, border: '1px solid var(--erp-border, #dbe4f0)', background: '#fff', cursor: 'pointer' }}>Edit</button>
                    )}
                    {e.status === 'DRAFT' && (
                      <button onClick={() => handleDelete(e._id)} style={{ padding: '4px 10px', fontSize: 12, borderRadius: 6, border: '1px solid #ef4444', background: '#fff', color: '#ef4444', cursor: 'pointer' }}>Del</button>
                    )}
                    {e.status === 'POSTED' && isAdmin && (
                      <button onClick={() => handleReopen(e._id)} style={{ padding: '4px 10px', fontSize: 12, borderRadius: 6, border: '1px solid #eab308', background: '#fff', color: '#b45309', cursor: 'pointer' }}>Re-open</button>
                    )}
                  </div>
                </div>
              ))}
              {!expenses.length && (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--erp-muted, #5f7188)', border: '1px dashed var(--erp-border, #dbe4f0)', borderRadius: 10 }}>
                  No expenses for this period
                </div>
              )}
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
                  <div className="erp-expense-line-row" style={{ marginBottom: 8 }}>
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
                  <div className="erp-expense-fields">
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
                        } catch (err) {
                          console.error('[Expenses] OR photo upload failed, using local preview:', err.message);
                          updateLine(idx, 'or_photo_url', URL.createObjectURL(file));
                        }
                      }} />
                    </label>
                    {line.or_photo_url && <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: '#dcfce7', color: '#166534', fontWeight: 600 }}>OR Photo ✓</span>}
                    <SelectField value={line.payment_mode} onChange={e => updateLine(idx, 'payment_mode', e.target.value)} style={{ padding: '3px 8px', borderRadius: 4, border: '1px solid var(--erp-border, #dbe4f0)', fontSize: 12 }}>
                      {paymentModes.filter(pm => pm.is_active !== false).map(pm => <option key={pm.mode_code} value={pm.mode_code}>{pm.mode_label}{pm.coa_code ? ` (${pm.coa_code})` : ''}</option>)}
                    </SelectField>
                    {line.calf_required && (
                      line.calf_id
                        ? <a href={`/erp/prf-calf?id=${line.calf_id}`} style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: '#dcfce7', color: '#166534', fontWeight: 600, textDecoration: 'none' }}>CALF ✓ →</a>
                        : <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: '#fef3c7', color: '#92400e', fontWeight: 600 }}>CALF Pending (save first)</span>
                    )}
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
