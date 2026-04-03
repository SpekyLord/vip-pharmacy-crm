import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import { useAuth } from '../../hooks/useAuth';
import useExpenses from '../hooks/useExpenses';
import useAccounting from '../hooks/useAccounting';
import { processDocument } from '../services/ocrService';

const STATUS_COLORS = {
  DRAFT: '#6b7280', VALID: '#22c55e', ERROR: '#ef4444', POSTED: '#2563eb', DELETION_REQUESTED: '#eab308'
};
const PAYMENT_MODES = ['CASH', 'CHECK', 'GCASH', 'BANK_TRANSFER', 'CARD', 'OTHER'];

export default function PrfCalf() {
  const { user } = useAuth();
  const { getPrfCalfList, getPrfCalfById, createPrfCalf, updatePrfCalf, deleteDraftPrfCalf, validatePrfCalf, submitPrfCalf, reopenPrfCalf, getPendingPartnerRebates, getPendingCalfLines, loading } = useExpenses();
  const { getMyCards, listBankAccounts } = useAccounting();

  const [docs, setDocs] = useState([]);
  const [editingDoc, setEditingDoc] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [pendingRebates, setPendingRebates] = useState([]);
  const [pendingCalfLines, setPendingCalfLines] = useState([]);
  const [myCards, setMyCards] = useState([]);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [docTypeFilter, setDocTypeFilter] = useState('');
  const [period, setPeriod] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [cycle, setCycle] = useState('C1');

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
    } catch { /* ignore */ }
  }, [period, docTypeFilter]);

  useEffect(() => { loadDocs(); }, [loadDocs]);
  useEffect(() => {
    getMyCards().then(r => setMyCards(r?.data || [])).catch(() => {});
    listBankAccounts().then(r => setBankAccounts(r?.data || [])).catch(() => {});
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
    } catch { /* ignore */ }
  }, []);
  useEffect(() => { loadPendingData(); }, [loadPendingData]);

  // Auto-fill PRF from a pending rebate (with last known bank details if available)
  const handleCreateFromRebate = (partner) => {
    const bank = partner.last_bank || {};
    setEditingDoc(null);
    setForm({
      doc_type: 'PRF',
      prf_type: 'PARTNER_REBATE',
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
      notes: `Auto-filled from pending rebates. Original total: ₱${partner.total_rebate}, already paid: ₱${partner.paid || 0}`,
      photo_urls: []
    });
    setShowForm(true);
  };

  // Auto-fill CALF from pending company-funded items (ACCESS or FUEL)
  const handleCreateFromCalfLines = (item) => {
    const lineDetails = item.lines.map(l => `${l.description} ₱${l.amount} (${l.payment_mode})`).join(', ');
    const sourceLabel = item.source === 'FUEL' ? 'Fuel (company card)' : 'ACCESS expenses';
    // Use the payment mode from the first line (the company fund method used)
    const primaryPaymentMode = item.lines[0]?.payment_mode || 'CARD';
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
      check_no: '', bank: '',
      linked_expense_id: item.source_id,
      linked_expense_line_ids: item.lines.map(l => l._id),
      notes: `${sourceLabel}: ${lineDetails}`,
      photo_urls: linkedPhotos
    });
    setShowForm(true);
  };

  const resetForm = (docType = 'PRF') => setForm({
    doc_type: docType,
    prf_type: 'PARTNER_REBATE',
    purpose: '', payee_name: '', payee_type: 'MD',
    partner_bank: '', partner_account_name: '', partner_account_no: '',
    rebate_amount: 0, amount: 0,
    calf_number: '', advance_amount: 0, liquidation_amount: 0,
    payment_mode: 'CASH', check_no: '', bank: '',
    notes: '', photo_urls: []
  });

  const handleNew = (docType) => { setEditingDoc(null); resetForm(docType); setShowForm(true); };

  const handleEdit = async (doc) => {
    try {
      const res = await getPrfCalfById(doc._id);
      const data = res?.data;
      setEditingDoc(data);
      setForm({
        doc_type: data.doc_type,
        prf_type: data.prf_type || 'PARTNER_REBATE',
        purpose: data.purpose || '', payee_name: data.payee_name || '', payee_type: data.payee_type || 'MD',
        partner_bank: data.partner_bank || '', partner_account_name: data.partner_account_name || '', partner_account_no: data.partner_account_no || '',
        rebate_amount: data.rebate_amount || 0, amount: data.amount || 0,
        calf_number: data.calf_number || '', advance_amount: data.advance_amount || 0, liquidation_amount: data.liquidation_amount || 0,
        payment_mode: data.payment_mode || 'CASH', check_no: data.check_no || '', bank: data.bank || '',
        notes: data.notes || '', photo_urls: data.photo_urls || []
      });
      setShowForm(true);
    } catch { /* ignore */ }
  };

  const handleSave = async () => {
    const data = {
      ...form,
      period, cycle,
      amount: form.doc_type === 'PRF' ? form.rebate_amount : form.advance_amount
    };
    try {
      if (editingDoc) { await updatePrfCalf(editingDoc._id, data); }
      else { await createPrfCalf(data); }
      setShowForm(false);
      loadDocs();
    } catch { /* ignore */ }
  };

  const handleValidate = async () => { try { await validatePrfCalf(); loadDocs(); } catch {} };
  const handleSubmit = async () => { try { await submitPrfCalf(); loadDocs(); } catch {} };
  const handleReopen = async (id) => { try { await reopenPrfCalf([id]); loadDocs(); } catch {} };
  const handleDelete = async (id) => { try { await deleteDraftPrfCalf(id); loadDocs(); } catch {} };

  const isFinance = ['admin', 'finance', 'president'].includes(user?.role);
  const calfBalance = (form.advance_amount || 0) - (form.liquidation_amount || 0);

  return (
    <div className="admin-page erp-page">
      <Navbar />
      <div className="admin-layout">
        <Sidebar />
        <main className="admin-main" style={{ padding: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
            <h1 style={{ margin: 0, color: 'var(--erp-text, #132238)' }}>PRF / CALF</h1>
            <Link to="/erp/expenses" style={{ color: 'var(--erp-accent, #1e5eff)', fontSize: 14 }}>&larr; Back to Expenses</Link>
          </div>

          <p style={{ fontSize: 13, color: 'var(--erp-muted, #5f7188)', marginBottom: 16 }}>
            <strong>PRF</strong> — Payment instruction for partner rebates. Finance needs partner bank details to process payment.<br />
            <strong>CALF</strong> — Cash advance & liquidation for company-funded expenses (non-cash). Attach to expense ORs.
          </p>

          {/* Controls */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <input type="month" value={period} onChange={e => setPeriod(e.target.value)} style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid var(--erp-border, #dbe4f0)' }} />
            <select value={cycle} onChange={e => setCycle(e.target.value)} style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid var(--erp-border, #dbe4f0)' }}>
              <option value="C1">Cycle 1</option><option value="C2">Cycle 2</option><option value="MONTHLY">Monthly</option>
            </select>
            <select value={docTypeFilter} onChange={e => setDocTypeFilter(e.target.value)} style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid var(--erp-border, #dbe4f0)' }}>
              <option value="">All Types</option><option value="PRF">PRF Only</option><option value="CALF">CALF Only</option>
            </select>
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
                {pendingRebates.map((p, i) => (
                  <div key={i} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e9d5ff', background: '#faf5ff', minWidth: 200, cursor: 'pointer' }} onClick={() => handleCreateFromRebate(p)}>
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
                {pendingCalfLines.map((item, i) => (
                  <div key={i} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #a5f3fc', background: '#ecfeff', minWidth: 200, cursor: 'pointer' }} onClick={() => handleCreateFromCalfLines(item)}>
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

          {/* Document List */}
          {!showForm && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                <thead>
                  <tr style={{ background: 'var(--erp-bg-alt, #f1f5f9)', borderBottom: '2px solid var(--erp-border, #dbe4f0)' }}>
                    <th style={{ padding: 8, textAlign: 'center' }}>Type</th>
                    <th style={{ padding: 8, textAlign: 'left' }}>Period</th>
                    <th style={{ padding: 8, textAlign: 'left' }}>Payee / Purpose</th>
                    <th style={{ padding: 8, textAlign: 'right' }}>Amount</th>
                    <th style={{ padding: 8, textAlign: 'left' }}>Partner Bank</th>
                    <th style={{ padding: 8, textAlign: 'center' }}>Status</th>
                    <th style={{ padding: 8, textAlign: 'center' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {docs.map(d => (
                    <tr key={d._id} style={{ borderBottom: '1px solid var(--erp-border, #dbe4f0)' }}>
                      <td style={{ padding: 8, textAlign: 'center' }}>
                        <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700, color: '#fff', background: d.doc_type === 'PRF' ? '#7c3aed' : '#0891b2' }}>{d.doc_type}</span>
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
                        {['DRAFT', 'ERROR'].includes(d.status) && (
                          <button onClick={() => handleEdit(d)} style={{ marginRight: 4, padding: '2px 8px', fontSize: 12, borderRadius: 4, border: '1px solid var(--erp-border, #dbe4f0)', background: '#fff', cursor: 'pointer' }}>Edit</button>
                        )}
                        {d.status === 'DRAFT' && (
                          <button onClick={() => handleDelete(d._id)} style={{ padding: '2px 8px', fontSize: 12, borderRadius: 4, border: '1px solid #ef4444', background: '#fff', color: '#ef4444', cursor: 'pointer' }}>Del</button>
                        )}
                        {d.status === 'POSTED' && isFinance && <button onClick={() => handleReopen(d._id)} style={{ padding: '2px 8px', fontSize: 12, borderRadius: 4, border: '1px solid #eab308', background: '#fff', color: '#b45309', cursor: 'pointer' }}>Re-open</button>}
                      </td>
                    </tr>
                  ))}
                  {!docs.length && <tr><td colSpan={7} style={{ padding: 24, textAlign: 'center', color: 'var(--erp-muted, #5f7188)' }}>No PRF/CALF documents</td></tr>}
                </tbody>
              </table>
            </div>
          )}

          {/* Form */}
          {showForm && (
            <div style={{ maxWidth: 600 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                <h2 style={{ margin: 0, fontSize: 18 }}>
                  {editingDoc ? 'Edit' : 'New'} {form.doc_type}
                  <span style={{ marginLeft: 8, padding: '2px 8px', borderRadius: 4, fontSize: 12, color: '#fff', background: form.doc_type === 'PRF' ? '#7c3aed' : '#0891b2' }}>{form.doc_type}</span>
                </h2>
                <button onClick={() => setShowForm(false)} style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid var(--erp-border, #dbe4f0)', background: '#fff', cursor: 'pointer' }}>Cancel</button>
              </div>

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
                          <select value={form.payee_type} onChange={e => setForm(p => ({ ...p, payee_type: e.target.value }))} style={{ padding: '6px 10px', borderRadius: 4, border: '1px solid var(--erp-border, #dbe4f0)', fontSize: 13 }}>
                            <option value="MD">MD</option><option value="NON_MD">Non-MD</option>
                          </select>
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
              <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <label style={{ fontSize: 13 }}>Payment Mode:
                  <select value={form.payment_mode} onChange={e => setForm(p => ({ ...p, payment_mode: e.target.value, funding_card_id: null, funding_account_id: null }))} style={{ marginLeft: 8, padding: '6px 10px', borderRadius: 4, border: '1px solid var(--erp-border, #dbe4f0)' }}>
                    {PAYMENT_MODES.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </label>
                {/* Card Used — inline right of payment mode for CARD */}
                {form.doc_type === 'CALF' && form.payment_mode === 'CARD' && myCards.length > 0 && (
                  <select value={form.funding_card_id || ''} onChange={e => setForm(p => ({ ...p, funding_card_id: e.target.value || null }))} style={{ padding: '6px 10px', borderRadius: 4, border: '1px solid #a78bfa', fontSize: 13, background: '#f5f3ff' }}>
                    <option value="">Card Used…</option>
                    {myCards.filter(c => c.card_type === 'CREDIT_CARD').map(c => <option key={c._id} value={c._id}>{c.card_name} ({c.bank})</option>)}
                    {myCards.filter(c => c.card_type === 'FLEET_CARD').map(c => <option key={c._id} value={c._id}>{c.card_name} (Fleet)</option>)}
                  </select>
                )}
                {/* Funding Bank — inline right for BANK_TRANSFER/GCASH */}
                {form.doc_type === 'CALF' && (form.payment_mode === 'BANK_TRANSFER' || form.payment_mode === 'GCASH') && bankAccounts.length > 0 && (
                  <select value={form.funding_account_id || ''} onChange={e => setForm(p => ({ ...p, funding_account_id: e.target.value || null }))} style={{ padding: '6px 10px', borderRadius: 4, border: '1px solid #67e8f9', fontSize: 13, background: '#ecfeff' }}>
                    <option value="">Funding Bank…</option>
                    {bankAccounts.map(b => <option key={b._id} value={b._id}>{b.bank_name}</option>)}
                  </select>
                )}
              </div>
              {form.payment_mode === 'CHECK' && (
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
                  <label style={{ padding: '6px 14px', borderRadius: 6, background: '#2563eb', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, display: 'inline-block' }}>
                    Upload Photo
                    <input type="file" accept="image/*" style={{ display: 'none' }} onChange={async e => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      e.target.value = '';
                      try {
                        const result = await processDocument(file, 'OR');
                        setForm(p => ({ ...p, photo_urls: [...(p.photo_urls || []), result.s3_url] }));
                      } catch {
                        setForm(p => ({ ...p, photo_urls: [...(p.photo_urls || []), URL.createObjectURL(file)] }));
                      }
                    }} />
                  </label>
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
    </div>
  );
}
