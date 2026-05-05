import { useState, useEffect, useCallback, Fragment } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import { useAuth } from '../../hooks/useAuth';
import { ROLE_SETS } from '../../constants/roles';
import useExpenses from '../hooks/useExpenses';
import useAccounting from '../hooks/useAccounting';
import useErpApi from '../hooks/useErpApi';
import useErpSubAccess from '../hooks/useErpSubAccess';
import { processDocument } from '../services/ocrService';

import SelectField from '../../components/common/Select';
import WorkflowGuide from '../components/WorkflowGuide';
import RejectionBanner from '../components/RejectionBanner';
import { useRejectionConfig } from '../hooks/useRejectionConfig';
import { showError, showSuccess, showApprovalPending } from '../utils/errorToast';
import PresidentReverseModal from '../components/PresidentReverseModal';
// Phase G4.5e — proxy entry for PRF/CALF.
import OwnerPicker from '../components/OwnerPicker';

const STATUS_COLORS = {
  DRAFT: '#6b7280', VALID: '#22c55e', ERROR: '#ef4444', POSTED: '#2563eb', DELETION_REQUESTED: '#eab308'
};

export default function PrfCalf() {
  const { user } = useAuth();
  const { getPrfCalfList, getPrfCalfById, createPrfCalf, updatePrfCalf, deleteDraftPrfCalf, validatePrfCalf, submitPrfCalf, reopenPrfCalf, getPendingPartnerRebates, getPendingCalfLines, presidentReversePrfCalf, getLinkedExpenses, loading } = useExpenses();
  const { getMyCards, getMyBankAccounts } = useAccounting();
  const lookupApi = useErpApi();
  const { hasSubPermission } = useErpSubAccess();
  const canPresidentReverse = hasSubPermission('accounting', 'reverse_posted');

  // Lookup-driven rejection config (MODULE_REJECTION_CONFIG → PRF_CALF).
  // Drives which statuses can still be edited / re-submitted by the contractor.
  // Fallback preserves prior hardcoded behavior if the lookup is not yet seeded.
  const { config: rejectionConfig } = useRejectionConfig('PRF_CALF');
  const editableStatuses = rejectionConfig?.editable_statuses || ['DRAFT', 'ERROR'];

  const [docs, setDocs] = useState([]);
  const [editingDoc, setEditingDoc] = useState(null);
  const [showForm, setShowForm] = useState(false);
  // Phase G4.5e — OwnerPicker value: proxy target BDM _id (empty = self).
  const [assignedTo, setAssignedTo] = useState('');
  // Phase 33 — Linked-expenses inline drill-down cache keyed by CALF _id
  const [linksByCalfId, setLinksByCalfId] = useState({});
  const [openLinkRowId, setOpenLinkRowId] = useState(null);
  const [reverseTarget, setReverseTarget] = useState(null);
  const [pendingRebates, setPendingRebates] = useState([]);
  const [pendingCalfLines, setPendingCalfLines] = useState([]);
  const [myCards, setMyCards] = useState([]);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [paymentModes, setPaymentModes] = useState([]);
  const [docTypeFilter, setDocTypeFilter] = useState('');
  const [period, setPeriod] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [cycle, setCycle] = useState('C1');
  const [listTab, setListTab] = useState('working');

  // Form state
  const [form, setForm] = useState({
    doc_type: 'PRF',
    purpose: '', payee_name: '', payee_type: 'MD',
    partner_bank: '', partner_account_name: '', partner_account_no: '',
    rebate_amount: 0, amount: 0,
    calf_number: '', advance_amount: 0, liquidation_amount: 0,
    payment_mode: 'CASH', check_no: '', bank: '',
    funding_card_id: null, funding_account_id: null,
    notes: ''
  });

  const loadDocs = useCallback(async () => {
    try {
      const params = { period };
      if (docTypeFilter) params.doc_type = docTypeFilter;
      const res = await getPrfCalfList(params);
      setDocs(res?.data || []);
    } catch (err) { showError(err, 'Could not load PRF/CALF documents'); }
  }, [period, docTypeFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadDocs(); }, [loadDocs]);
  useEffect(() => {
    getMyCards().then(r => setMyCards(r?.data || [])).catch(err => console.error('[PrfCalf]', err.message));
    getMyBankAccounts().then(r => setBankAccounts(r?.data || [])).catch(err => console.error('[PrfCalf]', err.message));
    lookupApi.get('/lookups/payment-modes').then(r => setPaymentModes(r?.data || [])).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Load pending partner rebates + pending CALF lines
  const loadPendingData = useCallback(async () => {
    try {
      const [rebRes, calfRes] = await Promise.all([
        getPendingPartnerRebates().catch(() => ({ data: [] })),
        getPendingCalfLines().catch(() => ({ data: [] }))
      ]);
      setPendingRebates(rebRes?.data || []);
      setPendingCalfLines(calfRes?.data || []);
    } catch (err) { showError(err, 'Could not load pending rebates'); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { loadPendingData(); }, [loadPendingData]);

  // Auto-fill PRF from a pending rebate (with last known bank details if available)
  const handleCreateFromRebate = (partner) => {
    const bank = partner.last_bank || {};
    setEditingDoc(null);
    setForm({
      doc_type: 'PRF',
      prf_type: 'PARTNER_REBATE',
      partner_id: partner.doctor_id || null,
      purpose: `Partner rebate — ${partner.collections?.length || 0} collection(s)`,
      payee_name: partner.doctor_name || '',
      payee_type: 'MD',
      partner_bank: bank.partner_bank || '',
      partner_account_name: bank.partner_account_name || '',
      partner_account_no: bank.partner_account_no || '',
      rebate_amount: partner.remaining || 0,
      amount: partner.remaining || 0,
      calf_number: '', advance_amount: 0, liquidation_amount: 0,
      payment_mode: 'BANK_TRANSFER', check_no: '', bank: '',
      funding_card_id: null, funding_account_id: null,
      notes: `Auto-filled from pending rebates. Original total: ₱${partner.total_rebate}, already paid: ₱${partner.paid || 0}`,
      photo_urls: []
    });
    // Phase G4.5e — when auto-creating from a pending rebate surfaced via
    // proxy-widened list, default the OwnerPicker to the rebate's bdm_id so
    // the new PRF lands on the target BDM, not the proxy's self-id.
    setAssignedTo(partner.bdm_id && String(partner.bdm_id) !== String(user?._id) ? String(partner.bdm_id) : '');
    setShowForm(true);
  };

  // Auto-fill CALF from pending company-funded items (ACCESS or FUEL)
  const handleCreateFromCalfLines = (item) => {
    const lineDetails = item.lines.map(l => `${l.description} ₱${l.amount} (${l.payment_mode})`).join(', ');
    const sourceLabel = item.source === 'FUEL' ? 'Fuel (company card)' : 'ACCESS expenses';
    // Use the payment mode from the first line (the company fund method used)
    const primaryPaymentMode = item.lines[0]?.payment_mode || 'CARD';
    // Auto-inherit funding card/account from linked expense lines (no redundant re-selection)
    const primaryFundingCard = item.lines[0]?.funding_card_id || null;
    const primaryFundingAccount = item.lines[0]?.funding_account_id || null;
    // Auto-inherit OR photos from linked expense lines (no need to scan twice)
    const linkedPhotos = item.lines.map(l => l.or_photo_url).filter(Boolean);
    setEditingDoc(null);
    setForm({
      doc_type: 'CALF',
      purpose: '', payee_name: '', payee_type: 'MD',
      partner_bank: '', partner_account_name: '', partner_account_no: '',
      rebate_amount: 0,
      amount: item.total_amount,
      calf_number: '', advance_amount: item.total_amount, liquidation_amount: item.total_amount,
      payment_mode: primaryPaymentMode,
      funding_card_id: primaryFundingCard,
      funding_account_id: primaryFundingAccount,
      check_no: '', bank: '',
      linked_expense_id: item.source_id,
      linked_expense_line_ids: item.lines.map(l => l._id),
      notes: `${sourceLabel}: ${lineDetails}`,
      photo_urls: linkedPhotos
    });
    // Phase G4.5e — default OwnerPicker to the source doc's bdm_id when a
    // proxy surfaces a pending CALF line they manage on behalf of. Falls back
    // to self (empty) when the source is the proxy's own entry.
    setAssignedTo(item.bdm_id && String(item.bdm_id) !== String(user?._id) ? String(item.bdm_id) : '');
    setShowForm(true);
  };

  const resetForm = (docType = 'PRF') => setForm({
    doc_type: docType,
    prf_type: 'PARTNER_REBATE',
    partner_id: null,
    purpose: '', payee_name: '', payee_type: 'MD',
    partner_bank: '', partner_account_name: '', partner_account_no: '',
    rebate_amount: 0, amount: 0,
    calf_number: '', advance_amount: 0, liquidation_amount: 0,
    payment_mode: docType === 'CALF' ? 'CARD' : 'CASH', check_no: '', bank: '',
    funding_card_id: null, funding_account_id: null,
    notes: '', photo_urls: []
  });

  const handleNew = (docType) => { setEditingDoc(null); resetForm(docType); setAssignedTo(''); setShowForm(true); };

  const handleEdit = async (doc) => {
    try {
      const res = await getPrfCalfById(doc._id);
      const data = res?.data;
      setEditingDoc(data);
      setForm({
        doc_type: data.doc_type,
        prf_type: data.prf_type || 'PARTNER_REBATE',
        partner_id: data.partner_id || null,
        purpose: data.purpose || '', payee_name: data.payee_name || '', payee_type: data.payee_type || 'MD',
        partner_bank: data.partner_bank || '', partner_account_name: data.partner_account_name || '', partner_account_no: data.partner_account_no || '',
        rebate_amount: data.rebate_amount || 0, amount: data.amount || 0,
        calf_number: data.calf_number || '', advance_amount: data.advance_amount || 0, liquidation_amount: data.liquidation_amount || 0,
        payment_mode: data.payment_mode || 'CASH', check_no: data.check_no || '', bank: data.bank || '',
        funding_card_id: data.funding_card_id || null,
        funding_account_id: data.funding_account_id || null,
        linked_expense_id: data.linked_expense_id || null,
        linked_expense_line_ids: data.linked_expense_line_ids || [],
        notes: data.notes || '', photo_urls: data.photo_urls || []
      });
      setShowForm(true);
    } catch (err) { console.error('[PrfCalf] load error:', err.message); }
  };

  const handleSave = async () => {
    // Frontend validation before save
    const issues = [];
    if (form.doc_type === 'CALF') {
      if (!form.advance_amount || form.advance_amount <= 0) issues.push('Advance amount is required');
      if (!form.linked_expense_id) issues.push('CALF must be linked to an expense entry — use "Create CALF" from pending items below');
    }
    if (form.doc_type === 'PRF') {
      if (!form.payee_name?.trim()) issues.push('Payee name is required');
      if (!form.purpose?.trim()) issues.push('Purpose is required');
      if (form.prf_type === 'PARTNER_REBATE') {
        if (!form.rebate_amount || form.rebate_amount <= 0) issues.push('Rebate amount is required');
      }
    }
    if (issues.length) { showError(null, issues.join('. ')); return; }

    const { calf_number: _excluded, ...formData } = form; // eslint-disable-line no-unused-vars
    const data = {
      ...formData,
      period, cycle,
      amount: form.doc_type === 'PRF' ? form.rebate_amount : form.advance_amount
    };
    try {
      if (editingDoc) {
        // Phase G4.5e — update does not take assigned_to (ownership is locked
        // at create time; backend strips the field defensively).
        await updatePrfCalf(editingDoc._id, data);
      } else {
        // Phase G4.5e — pass body.assigned_to when recording on behalf.
        // OwnerPicker renders only when proxy-eligible; undefined when self-filing.
        await createPrfCalf({ ...data, assigned_to: assignedTo || undefined });
      }
      setShowForm(false);
      loadDocs();
    } catch (err) { showError(err, 'Could not save PRF/CALF'); }
  };

  const handleValidate = async () => { try { await validatePrfCalf(); loadDocs(); } catch (err) { showError(err, 'Could not validate PRF/CALF'); } };
  const handleSubmit = async () => {
    try {
      const res = await submitPrfCalf();
      if (res?.approval_pending) { showApprovalPending(res.message); }
      else if (res?.failed?.length) {
        // Phase G4.5h — per-doc cascade result. If a CALF's linked Expense
        // failed re-validation, the whole CALF rolled back (not POSTED).
        const failNote = res.failed.map(f => f.cascade_errors?.length
          ? `• ${f.cascade_errors.join('; ')}`
          : `• ${f.error || 'submit failed'}`).join('\n');
        showError({ message: `${res.message}\n${failNote}` }, res.message);
      }
      else if (res?.posted?.length) {
        const withCascade = res.posted.filter(p => p.linked_source_id).length;
        if (withCascade) showSuccess(`Posted ${res.posted.length} PRF/CALF(s); ${withCascade} linked expense(s)/logbook(s) also posted via cascade.`);
        else showSuccess(res.message);
      }
      loadDocs();
    } catch (err) {
      if (err?.response?.data?.approval_pending) { showApprovalPending(err.response.data.message); loadDocs(); }
      else showError(err, 'Could not submit PRF/CALF');
    }
  };
  const handleReopen = async (id) => { try { await reopenPrfCalf([id]); loadDocs(); } catch (err) { showError(err, 'Could not reopen PRF/CALF'); } };
  const handleDelete = async (id) => { try { await deleteDraftPrfCalf(id); loadDocs(); } catch (err) { showError(err, 'Could not delete PRF/CALF'); } };
  const handlePresidentReverse = async ({ reason, confirm }) => {
    if (!reverseTarget) return;
    try {
      const res = await presidentReversePrfCalf(reverseTarget._id, { reason, confirm });
      setReverseTarget(null);
      showSuccess(res?.message || `${reverseTarget.doc_type || 'PRF/CALF'} reversed`);
      loadDocs();
    } catch (err) {
      const deps = err?.response?.data?.dependents;
      const baseMsg = err?.response?.data?.message || err?.message || 'Could not reverse PRF/CALF';
      const msg = deps?.length
        ? `${baseMsg} — depends on: ${deps.map(d => `${d.type} ${d.ref}`).join(', ')}`
        : baseMsg;
      showError({ message: msg }, msg);
      throw err;
    }
  };

  const isFinance = ROLE_SETS.MANAGEMENT.includes(user?.role);
  const calfBalance = (form.advance_amount || 0) - (form.liquidation_amount || 0);
  const selectedModeType = paymentModes.find(pm => pm.mode_code === form.payment_mode)?.mode_type || form.payment_mode;

  // Split docs into Working (actionable) vs Posted (archive) — same pattern as ApprovalManager's All Pending vs History
  const workingDocs = docs.filter(d => d.status !== 'POSTED');
  const postedDocs = docs.filter(d => d.status === 'POSTED');
  const visibleDocs = listTab === 'working' ? workingDocs : postedDocs;

  return (
    <div className="admin-page erp-page prf-calf-page">
      <style>{`
.prf-calf-cards { display: none; }

@media (max-width: 768px) {
  .prf-calf-page .admin-main {
    padding: 76px 12px calc(96px + env(safe-area-inset-bottom, 0px)) !important;
  }
  .prf-calf-controls {
    flex-direction: column !important;
    align-items: stretch !important;
  }
  .prf-calf-controls > * {
    width: 100% !important;
    min-width: 0 !important;
  }
  .prf-calf-controls button {
    min-height: 40px;
  }
  .prf-calf-table-wrap {
    display: none !important;
  }
  .prf-calf-cards {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .prf-calf-card {
    border: 1px solid var(--erp-border, #dbe4f0);
    border-radius: 10px;
    padding: 14px;
    background: #fff;
  }
  .prf-calf-card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
  }
  .prf-calf-card-body {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 13px;
    color: var(--erp-text, #132238);
  }
  .prf-calf-card-body .prf-calf-card-label {
    font-size: 11px;
    color: var(--erp-muted, #5f7188);
  }
  .prf-calf-card-amount {
    font-size: 18px;
    font-weight: 700;
    color: var(--erp-text, #132238);
    margin: 4px 0;
  }
  .prf-calf-card-actions {
    display: flex;
    gap: 8px;
    margin-top: 10px;
    flex-wrap: wrap;
  }
  .prf-calf-card-actions button {
    min-height: 36px;
    padding: 8px 14px;
    font-size: 13px;
    border-radius: 6px;
    cursor: pointer;
    flex: 1;
    min-width: 80px;
  }
  .prf-calf-form-wrap {
    max-width: 100% !important;
  }
  .prf-calf-form-wrap label {
    display: block;
    width: 100%;
  }
  .prf-calf-form-wrap input,
  .prf-calf-form-wrap select {
    width: 100% !important;
    min-width: 0 !important;
  }
  .prf-calf-shared-fields {
    flex-direction: column !important;
    align-items: stretch !important;
  }
  .prf-calf-shared-fields > * {
    width: 100% !important;
  }
}

@media (max-width: 480px) {
  .prf-calf-page .admin-main {
    padding: 72px 8px 104px !important;
  }
  .prf-calf-card {
    padding: 12px;
  }
  .prf-calf-card-amount {
    font-size: 16px;
  }
  .prf-calf-card-actions button {
    font-size: 12px;
    padding: 8px 10px;
  }
}
      `}</style>
      <Navbar />
      <div className="admin-layout">
        <Sidebar />
        <main className="admin-main" style={{ padding: 24 }}>
          <WorkflowGuide pageKey="prf-calf" />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
            <h1 style={{ margin: 0, color: 'var(--erp-text, #132238)' }}>PRF / CALF</h1>
            <Link to="/erp/expenses" style={{ color: 'var(--erp-accent, #1e5eff)', fontSize: 14 }}>&larr; Back to Expenses</Link>
          </div>

          <p style={{ fontSize: 13, color: 'var(--erp-muted, #5f7188)', marginBottom: 16 }}>
            <strong>PRF</strong> — Payment instruction for partner rebates. Finance needs partner bank details to process payment.<br />
            <strong>CALF</strong> — Cash advance & liquidation for company-funded expenses (non-cash). Attach to expense ORs.
          </p>

          {/* Controls */}
          <div className="prf-calf-controls" style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <input type="month" value={period} onChange={e => setPeriod(e.target.value)} style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid var(--erp-border, #dbe4f0)' }} />
            <SelectField value={cycle} onChange={e => setCycle(e.target.value)} style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid var(--erp-border, #dbe4f0)' }}>
              <option value="C1">Cycle 1</option><option value="C2">Cycle 2</option><option value="MONTHLY">Monthly</option>
            </SelectField>
            <SelectField value={docTypeFilter} onChange={e => setDocTypeFilter(e.target.value)} style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid var(--erp-border, #dbe4f0)' }}>
              <option value="">All Types</option><option value="PRF">PRF Only</option><option value="CALF">CALF Only</option>
            </SelectField>
            <button onClick={() => handleNew('PRF')} style={{ padding: '6px 16px', borderRadius: 6, background: '#7c3aed', color: '#fff', border: 'none', cursor: 'pointer' }}>+ New PRF</button>
            <button onClick={() => handleNew('CALF')} style={{ padding: '6px 16px', borderRadius: 6, background: '#0891b2', color: '#fff', border: 'none', cursor: 'pointer' }}>+ New CALF</button>
            <button onClick={handleValidate} disabled={loading} style={{ padding: '6px 16px', borderRadius: 6, background: '#22c55e', color: '#fff', border: 'none', cursor: 'pointer' }}>Validate</button>
            <button onClick={handleSubmit} disabled={loading} style={{ padding: '6px 16px', borderRadius: 6, background: '#2563eb', color: '#fff', border: 'none', cursor: 'pointer' }}>Post</button>
          </div>

          {/* Pending Partner Rebates */}
          {!showForm && pendingRebates.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <h3 style={{ fontSize: 14, margin: '0 0 8px', color: '#7c3aed' }}>Pending Partner Rebates</h3>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {pendingRebates.map((p) => (
                  <div key={p._id || p.doctor_name} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e9d5ff', background: '#faf5ff', minWidth: 200, cursor: 'pointer' }} onClick={() => handleCreateFromRebate(p)}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: '#7c3aed' }}>{p.doctor_name}</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: '#581c87' }}>₱{p.remaining?.toLocaleString()}</div>
                    <div style={{ fontSize: 11, color: '#6b7280' }}>
                      {p.collections?.length} collection(s){p.paid > 0 && ` · ₱${p.paid.toLocaleString()} paid`}
                    </div>
                    <div style={{ fontSize: 10, color: '#7c3aed', marginTop: 4 }}>Click to create PRF</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Pending CALF — company-funded items needing documentation */}
          {!showForm && pendingCalfLines.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <h3 style={{ fontSize: 14, margin: '0 0 8px', color: '#0891b2' }}>Company-Funded Items Needing CALF</h3>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {pendingCalfLines.map((item) => (
                  <div key={item._id || `${item.source}-${item.period}`} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #a5f3fc', background: '#ecfeff', minWidth: 200, cursor: 'pointer' }} onClick={() => handleCreateFromCalfLines(item)}>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 2 }}>
                      <span style={{ padding: '1px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700, color: '#fff', background: item.source === 'FUEL' ? '#ea580c' : '#0891b2' }}>{item.source}</span>
                      <span style={{ fontWeight: 600, fontSize: 12, color: '#0891b2' }}>{item.period} {item.cycle}</span>
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: '#164e63' }}>₱{item.total_amount?.toLocaleString()}</div>
                    <div style={{ fontSize: 11, color: '#6b7280' }}>
                      {item.line_count} item(s) · {item.status}
                    </div>
                    {item.lines?.map((l, j) => (
                      <div key={j} style={{ fontSize: 10, color: '#475569', marginTop: 2 }}>
                        {l.description} — ₱{l.amount?.toLocaleString()} ({l.payment_mode})
                      </div>
                    ))}
                    <div style={{ fontSize: 10, color: '#0891b2', marginTop: 4 }}>Click to create CALF</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Working vs Posted tabs — separates actionable docs from archive */}
          {!showForm && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
              <button
                onClick={() => setListTab('working')}
                style={{ padding: '7px 14px', minHeight: 40, borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, background: listTab === 'working' ? 'var(--erp-accent, #2563eb)' : 'transparent', color: listTab === 'working' ? '#fff' : 'var(--erp-text)', borderWidth: 1, borderStyle: 'solid', borderColor: listTab === 'working' ? 'transparent' : 'var(--erp-border, #dbe4f0)' }}
              >
                Working {workingDocs.length > 0 ? `(${workingDocs.length})` : ''}
              </button>
              <button
                onClick={() => setListTab('posted')}
                title="Already-posted PRF/CALF (archive)"
                style={{ padding: '7px 14px', minHeight: 40, borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, background: listTab === 'posted' ? 'var(--erp-accent, #2563eb)' : 'transparent', color: listTab === 'posted' ? '#fff' : 'var(--erp-text)', borderWidth: 1, borderStyle: 'solid', borderColor: listTab === 'posted' ? 'transparent' : 'var(--erp-border, #dbe4f0)' }}
              >
                Posted {postedDocs.length > 0 ? `(${postedDocs.length})` : ''}
              </button>
            </div>
          )}

          {/* Document List */}
          {!showForm && (
            <div className="prf-calf-table-wrap" style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                <thead>
                  <tr style={{ background: 'var(--erp-bg-alt, #f1f5f9)', borderBottom: '2px solid var(--erp-border, #dbe4f0)' }}>
                    <th style={{ padding: 8, textAlign: 'center' }}>Type</th>
                    <th style={{ padding: 8, textAlign: 'left' }}>BDM</th>
                    <th style={{ padding: 8, textAlign: 'left' }}>Period</th>
                    <th style={{ padding: 8, textAlign: 'left' }}>Payee / Purpose</th>
                    <th style={{ padding: 8, textAlign: 'right' }}>Amount</th>
                    <th style={{ padding: 8, textAlign: 'left' }}>Partner Bank</th>
                    <th style={{ padding: 8, textAlign: 'center' }}>Status</th>
                    <th style={{ padding: 8, textAlign: 'center' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleDocs.map(d => (
                    <Fragment key={d._id}>
                    <tr style={{ borderBottom: d.status === 'ERROR' && d.rejection_reason ? 'none' : '1px solid var(--erp-border, #dbe4f0)' }}>
                      <td style={{ padding: 8, textAlign: 'center' }}>
                        <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700, color: '#fff', background: d.doc_type === 'PRF' ? '#7c3aed' : '#0891b2' }}>{d.doc_type}</span>
                      </td>
                      <td style={{ padding: 8 }}>
                        {d.bdm_id?.name || '—'}
                        {d.recorded_on_behalf_of && (
                          <span title={`Recorded on behalf by ${d.recorded_on_behalf_of?.name || 'proxy'}`} style={{ marginLeft: 6, padding: '1px 6px', borderRadius: 999, fontSize: 10, fontWeight: 700, background: '#f5f3ff', color: '#6d28d9', border: '1px solid #c4b5fd' }}>Proxied</span>
                        )}
                      </td>
                      <td style={{ padding: 8 }}>{d.period} {d.cycle}</td>
                      <td style={{ padding: 8, fontSize: 13 }}>
                        {d.doc_type === 'PRF' ? (
                          <span>{d.payee_name || '—'} <span style={{ color: 'var(--erp-muted)', fontSize: 11 }}>({d.payee_type})</span></span>
                        ) : (
                          <span>{d.calf_number || 'CALF'} — {d.notes || 'Company fund advance'}</span>
                        )}
                      </td>
                      <td style={{ padding: 8, textAlign: 'right', fontWeight: 600 }}>₱{(d.amount || 0).toLocaleString()}</td>
                      <td style={{ padding: 8, fontSize: 12 }}>
                        {d.doc_type === 'PRF' ? `${d.partner_bank || '—'} ${d.partner_account_no ? '•••' + d.partner_account_no.slice(-4) : ''}` : '—'}
                      </td>
                      <td style={{ padding: 8, textAlign: 'center' }}>
                        <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 12, color: '#fff', background: STATUS_COLORS[d.status] || '#6b7280' }}>{d.status}</span>
                      </td>
                      <td style={{ padding: 8, textAlign: 'center' }}>
                        {editableStatuses.includes(d.status) && (
                          <button onClick={() => handleEdit(d)} style={{ marginRight: 4, padding: '2px 8px', fontSize: 12, borderRadius: 4, border: '1px solid var(--erp-border, #dbe4f0)', background: '#fff', cursor: 'pointer' }}>Edit</button>
                        )}
                        {d.doc_type === 'CALF' && (
                          <button
                            onClick={async () => {
                              const id = String(d._id);
                              if (openLinkRowId === id) { setOpenLinkRowId(null); return; }
                              if (!linksByCalfId[id]) {
                                try { const r = await getLinkedExpenses(id); setLinksByCalfId(prev => ({ ...prev, [id]: r?.data })); }
                                catch (e) { setLinksByCalfId(prev => ({ ...prev, [id]: { error: e.response?.data?.message || 'Failed to load' } })); }
                              }
                              setOpenLinkRowId(id);
                            }}
                            title="View fuel / expense entries drawing against this CALF"
                            style={{ marginRight: 4, padding: '2px 8px', fontSize: 12, borderRadius: 4, border: '1px solid #0891b2', background: '#ecfeff', color: '#0e7490', cursor: 'pointer' }}
                          >View Links{linksByCalfId[String(d._id)]?.linked ? ` (${linksByCalfId[String(d._id)].linked.length})` : ''}</button>
                        )}
                        {d.status === 'DRAFT' && (
                          <button onClick={() => handleDelete(d._id)} style={{ padding: '2px 8px', fontSize: 12, borderRadius: 4, border: '1px solid #ef4444', background: '#fff', color: '#ef4444', cursor: 'pointer' }}>Del</button>
                        )}
                        {d.status === 'POSTED' && isFinance && <button onClick={() => handleReopen(d._id)} style={{ padding: '2px 8px', fontSize: 12, borderRadius: 4, border: '1px solid #eab308', background: '#fff', color: '#b45309', cursor: 'pointer' }}>Re-open</button>}
                        {canPresidentReverse && !d.deletion_event_id && (
                          <button
                            onClick={() => setReverseTarget(d)}
                            title="President: delete & reverse (SAP Storno for POSTED; hard-delete otherwise)"
                            style={{ marginLeft: 4, padding: '2px 8px', fontSize: 12, borderRadius: 4, border: 'none', background: '#7f1d1d', color: '#fff', cursor: 'pointer' }}
                          >
                            President Delete
                          </button>
                        )}
                      </td>
                    </tr>
                    {d.status === 'ERROR' && d.rejection_reason && (
                      <tr style={{ borderBottom: '1px solid var(--erp-border, #dbe4f0)' }}>
                        <td colSpan={8} style={{ padding: '6px 8px 4px' }}>
                          <RejectionBanner
                            row={d}
                            moduleKey="PRF_CALF"
                            variant="page"
                            docLabel={`${d.doc_type} ${d.calf_number || ''} — ${d.period} ${d.cycle}`.trim()}
                            onResubmit={(row) => handleEdit(row)}
                          />
                        </td>
                      </tr>
                    )}
                    {/* Phase 33 — inline Linked Expenses drill-down */}
                    {d.doc_type === 'CALF' && openLinkRowId === String(d._id) && (
                      <tr style={{ borderBottom: '1px solid var(--erp-border, #dbe4f0)', background: '#f8fafc' }}>
                        <td colSpan={8} style={{ padding: '8px 16px' }}>
                          {linksByCalfId[String(d._id)]?.error && <div style={{ color: '#dc2626', fontSize: 12 }}>{linksByCalfId[String(d._id)].error}</div>}
                          {linksByCalfId[String(d._id)]?.linked && (
                            <div>
                              <div style={{ fontSize: 12, fontWeight: 600, color: '#0e7490', marginBottom: 6 }}>
                                Linked Expenses — Fuel: {linksByCalfId[String(d._id)].fuel_count} · Expense: {linksByCalfId[String(d._id)].expense_count} · Drawn: ₱{(linksByCalfId[String(d._id)].total_linked || 0).toLocaleString()} of ₱{(linksByCalfId[String(d._id)].calf_amount || 0).toLocaleString()} · Variance: ₱{(linksByCalfId[String(d._id)].variance || 0).toLocaleString()}
                              </div>
                              {linksByCalfId[String(d._id)].linked.length === 0 && <div style={{ fontSize: 12, color: '#64748b' }}>No linked fuel or expense lines yet.</div>}
                              {linksByCalfId[String(d._id)].linked.length > 0 && (
                                <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
                                  <thead>
                                    <tr style={{ color: '#475569' }}>
                                      <th style={{ textAlign: 'left', padding: 4 }}>Source</th>
                                      <th style={{ textAlign: 'left', padding: 4 }}>Doc Ref</th>
                                      <th style={{ textAlign: 'left', padding: 4 }}>Date</th>
                                      <th style={{ textAlign: 'left', padding: 4 }}>Period/Cycle</th>
                                      <th style={{ textAlign: 'left', padding: 4 }}>Category</th>
                                      <th style={{ textAlign: 'left', padding: 4 }}>Description</th>
                                      <th style={{ textAlign: 'center', padding: 4 }}>BIR</th>
                                      <th style={{ textAlign: 'right', padding: 4 }}>Net</th>
                                      <th style={{ textAlign: 'right', padding: 4 }}>VAT</th>
                                      <th style={{ textAlign: 'right', padding: 4 }}>Amount</th>
                                      <th style={{ textAlign: 'center', padding: 4 }}>Status</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {linksByCalfId[String(d._id)].linked.map((r, i) => (
                                      <tr key={i} style={{ borderTop: '1px solid #e2e8f0' }}>
                                        <td style={{ padding: 4 }}><span style={{ padding: '1px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700, color: '#fff', background: r.source === 'FUEL' ? '#ea580c' : '#0891b2' }}>{r.source}</span></td>
                                        <td style={{ padding: 4 }}>{r.doc_ref}</td>
                                        <td style={{ padding: 4 }}>{r.date ? new Date(r.date).toLocaleDateString() : '—'}</td>
                                        <td style={{ padding: 4 }}>{r.period} {r.cycle}</td>
                                        <td style={{ padding: 4, textTransform: 'capitalize' }}>{r.expense_category || '—'}</td>
                                        <td style={{ padding: 4 }}>{r.description}</td>
                                        <td style={{ padding: 4, textAlign: 'center' }}>{r.bir_flag ? <span style={{ padding: '1px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700, background: r.bir_flag === 'BIR' ? '#dbeafe' : r.bir_flag === 'INTERNAL' ? '#e5e7eb' : '#fef3c7', color: r.bir_flag === 'BIR' ? '#1e40af' : r.bir_flag === 'INTERNAL' ? '#374151' : '#854d0e' }}>{r.bir_flag}</span> : <span style={{ color: '#94a3b8' }}>—</span>}</td>
                                        <td style={{ padding: 4, textAlign: 'right' }}>{(r.net_of_vat || 0) ? `₱${(r.net_of_vat).toLocaleString()}` : '—'}</td>
                                        <td style={{ padding: 4, textAlign: 'right', color: '#64748b' }}>{(r.vat_amount || 0) ? `₱${(r.vat_amount).toLocaleString()}` : '—'}</td>
                                        <td style={{ padding: 4, textAlign: 'right', fontWeight: 600 }}>₱{(r.amount || 0).toLocaleString()}</td>
                                        <td style={{ padding: 4, textAlign: 'center' }}>{r.approval_status || r.cycle_status || '—'}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                    </Fragment>
                  ))}
                  {!visibleDocs.length && <tr><td colSpan={8} style={{ padding: 24, textAlign: 'center', color: 'var(--erp-muted, #5f7188)' }}>{listTab === 'working' ? 'No unposted PRF/CALF' : 'No posted PRF/CALF for this period'}</td></tr>}
                </tbody>
              </table>
            </div>
          )}

          {/* Mobile Card List */}
          {!showForm && (
            <div className="prf-calf-cards">
              {visibleDocs.map(d => (
                <div key={d._id} className="prf-calf-card">
                  <div className="prf-calf-card-header">
                    <span style={{ padding: '2px 10px', borderRadius: 4, fontSize: 12, fontWeight: 700, color: '#fff', background: d.doc_type === 'PRF' ? '#7c3aed' : '#0891b2' }}>{d.doc_type}</span>
                    <span style={{ padding: '2px 10px', borderRadius: 4, fontSize: 12, color: '#fff', background: STATUS_COLORS[d.status] || '#6b7280' }}>{d.status}</span>
                  </div>
                  {d.status === 'ERROR' && d.rejection_reason && (
                    <div style={{ marginTop: 6 }}>
                      <RejectionBanner
                        row={d}
                        moduleKey="PRF_CALF"
                        variant="page"
                        docLabel={`${d.doc_type} ${d.calf_number || ''} — ${d.period} ${d.cycle}`.trim()}
                        onResubmit={(row) => handleEdit(row)}
                      />
                    </div>
                  )}
                  <div className="prf-calf-card-body">
                    <div>
                      <span className="prf-calf-card-label">BDM: </span>
                      {d.bdm_id?.name || '—'}
                    </div>
                    <div>
                      <span className="prf-calf-card-label">Period: </span>
                      {d.period} {d.cycle}
                    </div>
                    <div>
                      <span className="prf-calf-card-label">Payee / Purpose: </span>
                      {d.doc_type === 'PRF'
                        ? <span>{d.payee_name || '\u2014'} <span style={{ color: 'var(--erp-muted)', fontSize: 11 }}>({d.payee_type})</span></span>
                        : <span>{d.calf_number || 'CALF'} — {d.notes || 'Company fund advance'}</span>
                      }
                    </div>
                    <div className="prf-calf-card-amount">{'\u20B1'}{(d.amount || 0).toLocaleString()}</div>
                    {d.doc_type === 'PRF' && (
                      <div>
                        <span className="prf-calf-card-label">Partner Bank: </span>
                        {d.partner_bank || '\u2014'} {d.partner_account_no ? '\u2022\u2022\u2022' + d.partner_account_no.slice(-4) : ''}
                      </div>
                    )}
                  </div>
                  <div className="prf-calf-card-actions">
                    {editableStatuses.includes(d.status) && (
                      <button onClick={() => handleEdit(d)} style={{ border: '1px solid var(--erp-border, #dbe4f0)', background: '#fff', color: 'var(--erp-text, #132238)' }}>Edit</button>
                    )}
                    {d.status === 'DRAFT' && (
                      <button onClick={() => handleDelete(d._id)} style={{ border: '1px solid #ef4444', background: '#fff', color: '#ef4444' }}>Delete</button>
                    )}
                    {d.status === 'POSTED' && isFinance && (
                      <button onClick={() => handleReopen(d._id)} style={{ border: '1px solid #eab308', background: '#fff', color: '#b45309' }}>Re-open</button>
                    )}
                    {canPresidentReverse && !d.deletion_event_id && (
                      <button
                        onClick={() => setReverseTarget(d)}
                        title="President: delete & reverse (SAP Storno for POSTED; hard-delete otherwise)"
                        style={{ border: 'none', background: '#7f1d1d', color: '#fff' }}
                      >
                        President Delete
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {!visibleDocs.length && (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--erp-muted, #5f7188)', fontSize: 14 }}>{listTab === 'working' ? 'No unposted PRF/CALF' : 'No posted PRF/CALF for this period'}</div>
              )}
            </div>
          )}

          {/* Form */}
          {showForm && (
            <div className="prf-calf-form-wrap" style={{ maxWidth: 600 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                <h2 style={{ margin: 0, fontSize: 18 }}>
                  {editingDoc ? 'Edit' : 'New'} {form.doc_type}
                  <span style={{ marginLeft: 8, padding: '2px 8px', borderRadius: 4, fontSize: 12, color: '#fff', background: form.doc_type === 'PRF' ? '#7c3aed' : '#0891b2' }}>{form.doc_type}</span>
                </h2>
                <button onClick={() => setShowForm(false)} style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid var(--erp-border, #dbe4f0)', background: '#fff', cursor: 'pointer' }}>Cancel</button>
              </div>

              {/* Phase G4.5e — OwnerPicker only on CREATE (not edit — ownership
                  is locked at create time). Component renders null when the
                  caller isn't proxy-eligible (role + sub-perm gate). */}
              {!editingDoc && (
                <div style={{ marginBottom: 12 }}>
                  <OwnerPicker
                    module="expenses"
                    subKey="prf_calf_proxy"
                    moduleLookupCode="PRF_CALF"
                    value={assignedTo}
                    onChange={setAssignedTo}
                    label="Record PRF/CALF on behalf of"
                  />
                </div>
              )}

              {/* PRF Form */}
              {form.doc_type === 'PRF' && (
                <div>
                  {/* PRF Type Selector */}
                  <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                    <button onClick={() => setForm(p => ({ ...p, prf_type: 'PARTNER_REBATE', payee_type: 'MD' }))} style={{ padding: '6px 14px', borderRadius: 6, border: form.prf_type === 'PARTNER_REBATE' ? '2px solid #7c3aed' : '1px solid #dbe4f0', background: form.prf_type === 'PARTNER_REBATE' ? '#faf5ff' : '#fff', color: form.prf_type === 'PARTNER_REBATE' ? '#7c3aed' : '#6b7280', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>Partner Rebate</button>
                    <button onClick={() => setForm(p => ({ ...p, prf_type: 'PERSONAL_REIMBURSEMENT', payee_type: 'EMPLOYEE', payee_name: user?.name || '' }))} style={{ padding: '6px 14px', borderRadius: 6, border: form.prf_type === 'PERSONAL_REIMBURSEMENT' ? '2px solid #ea580c' : '1px solid #dbe4f0', background: form.prf_type === 'PERSONAL_REIMBURSEMENT' ? '#fff7ed' : '#fff', color: form.prf_type === 'PERSONAL_REIMBURSEMENT' ? '#ea580c' : '#6b7280', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>Personal Reimbursement</button>
                  </div>

                  {form.prf_type === 'PARTNER_REBATE' && (
                    <div style={{ padding: 12, borderRadius: 8, border: '1px solid #e9d5ff', background: '#faf5ff', marginBottom: 16 }}>
                      <h3 style={{ margin: '0 0 8px', fontSize: 14, color: '#7c3aed' }}>Partner Details (for Finance)</h3>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <input placeholder="Partner/Payee Name *" value={form.payee_name} onChange={e => setForm(p => ({ ...p, payee_name: e.target.value }))} style={{ flex: 1, minWidth: 200, padding: '6px 10px', borderRadius: 4, border: '1px solid var(--erp-border, #dbe4f0)', fontSize: 13 }} />
                          <SelectField value={form.payee_type} onChange={e => setForm(p => ({ ...p, payee_type: e.target.value }))} style={{ padding: '6px 10px', borderRadius: 4, border: '1px solid var(--erp-border, #dbe4f0)', fontSize: 13 }}>
                            <option value="MD">MD</option><option value="NON_MD">Non-MD</option>
                          </SelectField>
                        </div>
                        <input placeholder="Bank Name * (e.g., BPI, BDO, GCash)" value={form.partner_bank} onChange={e => setForm(p => ({ ...p, partner_bank: e.target.value }))} style={{ padding: '6px 10px', borderRadius: 4, border: '1px solid var(--erp-border, #dbe4f0)', fontSize: 13 }} />
                        <input placeholder="Account Holder Name *" value={form.partner_account_name} onChange={e => setForm(p => ({ ...p, partner_account_name: e.target.value }))} style={{ padding: '6px 10px', borderRadius: 4, border: '1px solid var(--erp-border, #dbe4f0)', fontSize: 13 }} />
                        <input placeholder="Account Number *" value={form.partner_account_no} onChange={e => setForm(p => ({ ...p, partner_account_no: e.target.value }))} style={{ padding: '6px 10px', borderRadius: 4, border: '1px solid var(--erp-border, #dbe4f0)', fontSize: 13 }} />
                      </div>
                    </div>
                  )}

                  {form.prf_type === 'PERSONAL_REIMBURSEMENT' && (
                    <div style={{ padding: 12, borderRadius: 8, border: '1px solid #fed7aa', background: '#fff7ed', marginBottom: 16 }}>
                      <h3 style={{ margin: '0 0 8px', fontSize: 14, color: '#ea580c' }}>Personal Reimbursement</h3>
                      <p style={{ fontSize: 12, color: '#9a3412', margin: '0 0 8px' }}>For expenses paid with your own money. Upload OR photo as proof. Finance will reimburse you.</p>
                      <input placeholder="Your Name *" value={form.payee_name} onChange={e => setForm(p => ({ ...p, payee_name: e.target.value }))} style={{ width: '100%', padding: '6px 10px', borderRadius: 4, border: '1px solid var(--erp-border, #dbe4f0)', fontSize: 13, marginBottom: 8 }} />
                    </div>
                  )}

                  <label style={{ display: 'block', marginBottom: 8, fontSize: 13 }}>Purpose: <input value={form.purpose} onChange={e => setForm(p => ({ ...p, purpose: e.target.value }))} style={{ width: '100%', padding: '6px 10px', borderRadius: 4, border: '1px solid var(--erp-border, #dbe4f0)' }} /></label>
                  <label style={{ display: 'block', marginBottom: 8, fontSize: 13 }}>{form.prf_type === 'PERSONAL_REIMBURSEMENT' ? 'Reimbursement' : 'Rebate'} Amount (₱): <input type="number" min={0} value={form.rebate_amount} onChange={e => setForm(p => ({ ...p, rebate_amount: Number(e.target.value) }))} style={{ width: 150, padding: '6px 10px', borderRadius: 4, border: '1px solid var(--erp-border, #dbe4f0)' }} /></label>
                </div>
              )}

              {/* CALF Form */}
              {form.doc_type === 'CALF' && (
                <div>
                  <div style={{ padding: 12, borderRadius: 8, border: '1px solid #a5f3fc', background: '#ecfeff', marginBottom: 16 }}>
                    <h3 style={{ margin: '0 0 8px', fontSize: 14, color: '#0891b2' }}>Company Fund Advance</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <label style={{ fontSize: 13 }}>CALF Number: <input value={form.calf_number} readOnly placeholder="Auto-generated on save" style={{ padding: '6px 10px', borderRadius: 4, border: '1px solid var(--erp-border, #dbe4f0)', background: '#f9fafb', color: '#6b7280', fontStyle: 'italic' }} /></label>
                      <label style={{ fontSize: 13 }}>Advance Amount (₱): <input type="number" min={0} value={form.advance_amount} onChange={e => setForm(p => ({ ...p, advance_amount: Number(e.target.value) }))} style={{ width: 150, padding: '6px 10px', borderRadius: 4, border: '1px solid var(--erp-border, #dbe4f0)' }} /></label>
                      <label style={{ fontSize: 13 }}>Liquidation Amount (₱): <input type="number" min={0} value={form.liquidation_amount} onChange={e => setForm(p => ({ ...p, liquidation_amount: Number(e.target.value) }))} style={{ width: 150, padding: '6px 10px', borderRadius: 4, border: '1px solid var(--erp-border, #dbe4f0)' }} /></label>
                      <div style={{ fontSize: 14, fontWeight: 600, color: calfBalance >= 0 ? '#16a34a' : '#dc2626' }}>
                        Balance: ₱{calfBalance.toLocaleString()} {calfBalance > 0 ? '(return to company)' : calfBalance < 0 ? '(reimburse BDM)' : '(settled)'}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Shared fields */}
              <div className="prf-calf-shared-fields" style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <label style={{ fontSize: 13 }}>Payment Mode:
                  <SelectField value={form.payment_mode} onChange={e => setForm(p => ({ ...p, payment_mode: e.target.value, funding_card_id: null, funding_account_id: null }))} style={{ marginLeft: 8, padding: '6px 10px', borderRadius: 4, border: '1px solid var(--erp-border, #dbe4f0)' }}>
                    {(form.doc_type === 'CALF'
                      ? paymentModes.filter(pm => pm.is_active !== false && pm.requires_calf)
                      : paymentModes.filter(pm => pm.is_active !== false && !pm.requires_calf)
                    ).map(pm => <option key={pm.mode_code} value={pm.mode_code}>{pm.mode_label}{pm.coa_code ? ` (${pm.coa_code})` : ''}</option>)}
                  </SelectField>
                </label>
                {/* Card Used — inline right of payment mode for CARD */}
                {form.doc_type === 'CALF' && selectedModeType === 'CARD' && myCards.length > 0 && (
                  <SelectField value={form.funding_card_id || ''} onChange={e => setForm(p => ({ ...p, funding_card_id: e.target.value || null }))} style={{ padding: '6px 10px', borderRadius: 4, border: '1px solid #a78bfa', fontSize: 13, background: '#f5f3ff' }}>
                    <option value="">Card Used…</option>
                    {myCards.filter(c => c.card_type === 'CREDIT_CARD').map(c => <option key={c._id} value={c._id}>{c.card_name} ({c.bank})</option>)}
                    {myCards.filter(c => c.card_type === 'FLEET_CARD').map(c => <option key={c._id} value={c._id}>{c.card_name} (Fleet)</option>)}
                  </SelectField>
                )}
                {/* Funding Bank — inline right for BANK_TRANSFER/GCASH */}
                {form.doc_type === 'CALF' && (selectedModeType === 'BANK_TRANSFER' || selectedModeType === 'GCASH') && bankAccounts.length > 0 && (
                  <SelectField value={form.funding_account_id || ''} onChange={e => setForm(p => ({ ...p, funding_account_id: e.target.value || null }))} style={{ padding: '6px 10px', borderRadius: 4, border: '1px solid #67e8f9', fontSize: 13, background: '#ecfeff' }}>
                    <option value="">Funding Bank…</option>
                    {bankAccounts.map(b => <option key={b._id} value={b._id}>{b.bank_name}</option>)}
                  </SelectField>
                )}
              </div>
              {selectedModeType === 'CHECK' && (
                <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                  <input placeholder="Check No." value={form.check_no} onChange={e => setForm(p => ({ ...p, check_no: e.target.value }))} style={{ padding: '6px 10px', borderRadius: 4, border: '1px solid var(--erp-border, #dbe4f0)', fontSize: 13 }} />
                  <input placeholder="Bank" value={form.bank} onChange={e => setForm(p => ({ ...p, bank: e.target.value }))} style={{ padding: '6px 10px', borderRadius: 4, border: '1px solid var(--erp-border, #dbe4f0)', fontSize: 13 }} />
                </div>
              )}
              <label style={{ display: 'block', marginBottom: 16, fontSize: 13 }}>Notes: <input value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} style={{ width: '100%', padding: '6px 10px', borderRadius: 4, border: '1px solid var(--erp-border, #dbe4f0)' }} /></label>

              {/* Photo Proof — PRF only (CALF inherits OR photos from linked expense) */}
              {form.doc_type === 'PRF' && (
                <div style={{ padding: 12, borderRadius: 8, border: '1px solid #dbe4f0', background: '#f9fafb', marginBottom: 16 }}>
                  <h3 style={{ margin: '0 0 8px', fontSize: 14, color: 'var(--erp-text, #132238)' }}>Photo Proof *</h3>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                    {(form.photo_urls || []).map((url, i) => (
                      <div key={i} style={{ position: 'relative', width: 80, height: 80, borderRadius: 6, overflow: 'hidden', border: '1px solid #dbe4f0' }}>
                        <img src={url} alt={`Proof ${i + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        <button onClick={() => setForm(p => ({ ...p, photo_urls: p.photo_urls.filter((_, j) => j !== i) }))} style={{ position: 'absolute', top: 2, right: 2, width: 18, height: 18, borderRadius: '50%', background: '#ef4444', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 10, lineHeight: '18px', padding: 0 }}>X</button>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'inline-flex', gap: 6 }}>
                    <label style={{ padding: '6px 14px', borderRadius: 6, background: '#2563eb', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, display: 'inline-block' }}>
                      Scan
                      <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={async e => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        e.target.value = '';
                        try {
                          const result = await processDocument(file, 'PRF_CALF');
                          setForm(p => ({ ...p, photo_urls: [...(p.photo_urls || []), result.s3_url] }));
                        } catch (err) {
                          console.error('[PrfCalf] Scan upload failed, using local preview:', err.message);
                          setForm(p => ({ ...p, photo_urls: [...(p.photo_urls || []), URL.createObjectURL(file)] }));
                        }
                      }} />
                    </label>
                    <label style={{ padding: '6px 14px', borderRadius: 6, background: 'transparent', color: '#2563eb', border: '1px solid #2563eb', cursor: 'pointer', fontSize: 12, fontWeight: 600, display: 'inline-block' }}>
                      Gallery
                      <input type="file" accept="image/*" style={{ display: 'none' }} onChange={async e => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        e.target.value = '';
                        try {
                          const result = await processDocument(file, 'PRF_CALF');
                          setForm(p => ({ ...p, photo_urls: [...(p.photo_urls || []), result.s3_url] }));
                        } catch (err) {
                          console.error('[PrfCalf] Gallery upload failed, using local preview:', err.message);
                          setForm(p => ({ ...p, photo_urls: [...(p.photo_urls || []), URL.createObjectURL(file)] }));
                        }
                      }} />
                    </label>
                  </div>
                  <span style={{ marginLeft: 8, fontSize: 11, color: '#6b7280' }}>
                    {(form.photo_urls || []).length} photo(s) attached {!(form.photo_urls || []).length && '— required for validation'}
                  </span>
                </div>
              )}
              {form.doc_type === 'CALF' && (form.photo_urls || []).length > 0 && (
                <div style={{ padding: 12, borderRadius: 8, border: '1px solid #d1fae5', background: '#f0fdf4', marginBottom: 16, fontSize: 13 }}>
                  <strong>OR photos inherited from linked expense</strong> — {form.photo_urls.length} photo(s)
                </div>
              )}

              <button onClick={handleSave} disabled={loading} style={{ padding: '8px 24px', borderRadius: 6, background: form.doc_type === 'PRF' ? '#7c3aed' : '#0891b2', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                {editingDoc ? 'Update' : 'Save as Draft'}
              </button>
            </div>
          )}
        </main>
      </div>
      {reverseTarget && (
        <PresidentReverseModal
          docLabel={`${reverseTarget.doc_type || 'PRF/CALF'} · ${reverseTarget.period || ''} ${reverseTarget.cycle || ''} · ₱${(reverseTarget.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })} · ${reverseTarget.status}`}
          docStatus={reverseTarget.status}
          onConfirm={handlePresidentReverse}
          onClose={() => setReverseTarget(null)}
        />
      )}
    </div>
  );
}
