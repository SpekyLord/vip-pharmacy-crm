import React, { useState, useEffect, useCallback } from 'react';
import SelectField from '../../components/common/Select';
import { useAuth } from '../../hooks/useAuth';
import usePettyCash from '../hooks/usePettyCash';
import usePeople from '../hooks/usePeople';
import useWarehouses from '../hooks/useWarehouses';
import useErpSubAccess from '../hooks/useErpSubAccess';
import { useLookupBatch } from '../hooks/useLookups';
import WorkflowGuide from '../components/WorkflowGuide';
import { showError, showSuccess, showApprovalPending } from '../utils/errorToast';
import PresidentReverseModal from '../components/PresidentReverseModal';
import { ROLE_SETS } from '../../constants/roles';

const CEILING = 5000;

const styles = {
  container: { padding: '24px', maxWidth: '1200px', margin: '0 auto' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' },
  title: { fontSize: '24px', fontWeight: 'bold', margin: 0 },
  tabs: { display: 'flex', gap: '0', borderBottom: '2px solid #e5e7eb', marginBottom: '24px' },
  tab: { padding: '10px 20px', cursor: 'pointer', border: 'none', background: 'none', fontSize: '14px', fontWeight: 500, color: '#6b7280', borderBottom: '2px solid transparent', marginBottom: '-2px' },
  tabActive: { padding: '10px 20px', cursor: 'pointer', border: 'none', background: 'none', fontSize: '14px', fontWeight: 600, color: '#2563eb', borderBottom: '2px solid #2563eb', marginBottom: '-2px' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' },
  card: { border: '1px solid #e5e7eb', borderRadius: '8px', padding: '20px', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' },
  cardTitle: { fontSize: '16px', fontWeight: 600, marginBottom: '4px' },
  cardCode: { fontSize: '12px', color: '#6b7280', marginBottom: '12px' },
  cardRow: { display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '14px' },
  progressBar: { width: '100%', height: '8px', backgroundColor: '#e5e7eb', borderRadius: '4px', overflow: 'hidden', marginTop: '12px' },
  progressFill: (pct) => ({
    width: `${Math.min(pct, 100)}%`,
    height: '100%',
    borderRadius: '4px',
    backgroundColor: pct >= 100 ? '#ef4444' : pct >= 80 ? '#f59e0b' : '#22c55e',
    transition: 'width 0.3s'
  }),
  btn: { padding: '8px 16px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 500 },
  btnPrimary: { padding: '8px 16px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 500, backgroundColor: '#2563eb', color: '#fff' },
  btnDanger: { padding: '8px 16px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 500, backgroundColor: '#ef4444', color: '#fff' },
  btnSuccess: { padding: '8px 16px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 500, backgroundColor: '#22c55e', color: '#fff' },
  btnSecondary: { padding: '8px 16px', border: '1px solid #d1d5db', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 500, backgroundColor: '#fff', color: '#374151' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '14px' },
  th: { textAlign: 'left', padding: '10px 12px', borderBottom: '2px solid #e5e7eb', fontWeight: 600, color: '#374151', backgroundColor: '#f9fafb' },
  td: { padding: '10px 12px', borderBottom: '1px solid #e5e7eb' },
  badge: (color) => ({
    display: 'inline-block', padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 600,
    backgroundColor: color === 'green' ? '#dcfce7' : color === 'blue' ? '#dbeafe' : color === 'amber' ? '#fef3c7' : color === 'red' ? '#fee2e2' : '#f3f4f6',
    color: color === 'green' ? '#166534' : color === 'blue' ? '#1e40af' : color === 'amber' ? '#92400e' : color === 'red' ? '#991b1b' : '#374151'
  }),
  filterRow: { display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' },
  input: { padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px' },
  select: { padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px', backgroundColor: '#fff' },
  modal: { position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  modalContent: { backgroundColor: '#fff', borderRadius: '12px', padding: '24px', width: '480px', maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto' },
  modalTitle: { fontSize: '18px', fontWeight: 600, marginBottom: '16px' },
  formGroup: { marginBottom: '14px' },
  label: { display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '4px', color: '#374151' },
  formInput: { width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px', boxSizing: 'border-box' },
  formActions: { display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '20px' },
  empty: { textAlign: 'center', padding: '40px', color: '#9ca3af' },
  peso: (val) => `₱${Number(val || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`
};

// ---------- Fund Form Modal (Create + Edit) ----------

function FundFormModal({ open, onClose, onSave, editData, people, warehouses, fundModes, fundStatuses }) {
  const isEdit = !!editData;
  const BLANK = { fund_name: '', fund_code: '', custodian_id: '', warehouse_id: '', balance_ceiling: CEILING, authorized_amount: 10000, coa_code: '1000', fund_mode: 'REVOLVING', status: 'ACTIVE' };
  const [form, setForm] = useState(BLANK);
  const [saving, setSaving] = useState(false);

  // Populate form when editing
  React.useEffect(() => {
    if (editData) {
      setForm({
        fund_name: editData.fund_name || '',
        fund_code: editData.fund_code || '',
        custodian_id: editData.custodian_id?._id || editData.custodian_id || '',
        warehouse_id: editData.warehouse_id?._id || editData.warehouse_id || '',
        balance_ceiling: editData.balance_ceiling || CEILING,
        authorized_amount: editData.authorized_amount || 10000,
        coa_code: editData.coa_code || '1000',
        fund_mode: editData.fund_mode || 'REVOLVING',
        status: editData.status || 'ACTIVE',
      });
    } else {
      setForm(BLANK);
    }
  }, [editData, open]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleChange = (e) => setForm(f => ({ ...f, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({
        ...form,
        balance_ceiling: Number(form.balance_ceiling),
        authorized_amount: Number(form.authorized_amount),
      }, editData?._id);
      onClose();
    } catch (err) { showError(err, `Could not ${isEdit ? 'update' : 'create'} fund`); }
    finally { setSaving(false); }
  };

  if (!open) return null;
  return (
    <div style={styles.modal} onClick={onClose}>
      <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
        <h3 style={styles.modalTitle}>{isEdit ? 'Edit' : 'Create'} Petty Cash Fund</h3>
        <form onSubmit={handleSubmit}>
          <div style={styles.formGroup}>
            <label style={styles.label}>Fund Name</label>
            <input style={styles.formInput} name="fund_name" value={form.fund_name} onChange={handleChange} required />
          </div>
          <div style={styles.formGroup}>
            <label style={styles.label}>Fund Code</label>
            <input style={styles.formInput} name="fund_code" value={form.fund_code} onChange={handleChange} required />
          </div>
          <div style={styles.formGroup}>
            <label style={styles.label}>Custodian (BDM)</label>
            <SelectField name="custodian_id" value={form.custodian_id} onChange={handleChange} placeholder="-- Select custodian --">
              <option value="">-- Select custodian --</option>
              {(people || []).map(p => (
                <option key={p.user_id?._id || p._id} value={p.user_id?._id || p._id}>
                  {p.full_name || p.user_id?.name || p.name || '(unnamed)'}
                </option>
              ))}
            </SelectField>
          </div>
          <div style={styles.formGroup}>
            <label style={styles.label}>Warehouse</label>
            <SelectField name="warehouse_id" value={form.warehouse_id} onChange={handleChange} placeholder="-- Select warehouse --" isClearable>
              <option value="">-- Select warehouse --</option>
              {(warehouses || []).map(w => (
                <option key={w._id} value={w._id}>
                  {w.warehouse_code} — {w.warehouse_name}
                </option>
              ))}
            </SelectField>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div style={styles.formGroup}>
              <label style={styles.label}>Authorized Amount</label>
              <input style={styles.formInput} name="authorized_amount" type="number" value={form.authorized_amount} onChange={handleChange} required />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Ceiling Amount</label>
              <input style={styles.formInput} name="balance_ceiling" type="number" value={form.balance_ceiling} onChange={handleChange} required />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div style={styles.formGroup}>
              <label style={styles.label}>COA Code</label>
              <input style={styles.formInput} name="coa_code" value={form.coa_code} onChange={handleChange} placeholder="1000" />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Fund Mode</label>
              <SelectField name="fund_mode" value={form.fund_mode} onChange={handleChange}>
                {(fundModes || []).map(o => (
                  <option key={o.code} value={o.code}>{o.label}</option>
                ))}
              </SelectField>
            </div>
          </div>
          {isEdit && (
            <div style={styles.formGroup}>
              <label style={styles.label}>Status</label>
              <SelectField name="status" value={form.status} onChange={handleChange}>
                {(fundStatuses || []).map(o => (
                  <option key={o.code} value={o.code}>{o.label}</option>
                ))}
              </SelectField>
            </div>
          )}
          <div style={styles.formActions}>
            <button type="button" style={styles.btnSecondary} onClick={onClose}>Cancel</button>
            <button type="submit" style={styles.btnPrimary} disabled={saving}>{saving ? 'Saving...' : isEdit ? 'Update Fund' : 'Create Fund'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
 

// ---------- Create Transaction Modal ----------
 
function TxnFormModal({ open, onClose, onSave, funds, expenseCategories, editData }) {
  const isEdit = !!editData;
  const today = new Date().toISOString().slice(0, 10);
  const BLANK = { fund_id: '', txn_type: 'DISBURSEMENT', txn_date: today, payee: '', particulars: '', amount: '', or_number: '', is_pcv: false, pcv_remarks: '', expense_category: '' };
  const [form, setForm] = useState(BLANK);
  const [saving, setSaving] = useState(false);

  // Populate form when editing
  React.useEffect(() => {
    if (editData) {
      setForm({
        fund_id: editData.fund_id?._id || editData.fund_id || '',
        txn_type: editData.txn_type || 'DISBURSEMENT',
        txn_date: editData.txn_date ? new Date(editData.txn_date).toISOString().slice(0, 10) : today,
        payee: editData.payee || editData.source_description || '',
        particulars: editData.particulars || '',
        amount: editData.amount || '',
        or_number: editData.or_number || '',
        is_pcv: editData.is_pcv || false,
        pcv_remarks: editData.pcv_remarks || '',
        expense_category: editData.expense_category || '',
      });
    } else {
      setForm(BLANK);
    }
  }, [editData, open]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm(f => ({ ...f, [name]: type === 'checkbox' ? checked : value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    // PCV validation
    if (form.txn_type === 'DISBURSEMENT' && form.is_pcv && !form.pcv_remarks.trim()) {
      showError(null, 'PCV remarks are required when using Petty Cash Voucher');
      return;
    }
    setSaving(true);
    try {
      const payload = { ...form, amount: Number(form.amount) };
      // DEPOSIT: map payee → source_description
      if (payload.txn_type === 'DEPOSIT') {
        payload.source_description = payload.payee;
        delete payload.payee;
      }
      await onSave(payload, editData?._id);
      onClose();
      if (!isEdit) setForm({ ...BLANK, txn_date: new Date().toISOString().slice(0, 10) });
    }
    catch (err) { showError(err, `Could not ${isEdit ? 'update' : 'create'} petty cash transaction`); }
    finally { setSaving(false); }
  };

  if (!open) return null;
  const isDisbursement = form.txn_type === 'DISBURSEMENT';
  return (
    <div style={styles.modal} onClick={onClose}>
      <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
        <h3 style={styles.modalTitle}>{isEdit ? 'Edit' : 'New'} Transaction</h3>
        <form onSubmit={handleSubmit}>
          <div style={styles.formGroup}>
            <label style={styles.label}>Fund</label>
            <SelectField style={styles.formInput} name="fund_id" value={form.fund_id} onChange={handleChange} required disabled={isEdit}>
              <option value="">Select fund...</option>
              {(funds || []).map(f => <option key={f._id} value={f._id}>{f.fund_name}</option>)}
            </SelectField>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div style={styles.formGroup}>
              <label style={styles.label}>Type</label>
              <SelectField style={styles.formInput} name="txn_type" value={form.txn_type} onChange={handleChange} disabled={isEdit}>
                <option value="DISBURSEMENT">Disbursement</option>
                <option value="DEPOSIT">Deposit</option>
              </SelectField>
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Date</label>
              <input style={styles.formInput} name="txn_date" type="date" value={form.txn_date} onChange={handleChange} required />
            </div>
          </div>
          <div style={styles.formGroup}>
            <label style={styles.label}>{isDisbursement ? 'Payee' : 'Source'}</label>
            <input style={styles.formInput} name="payee" value={form.payee} onChange={handleChange} required />
          </div>
          <div style={styles.formGroup}>
            <label style={styles.label}>Description</label>
            <input style={styles.formInput} name="particulars" value={form.particulars} onChange={handleChange} required />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div style={styles.formGroup}>
              <label style={styles.label}>Amount</label>
              <input style={styles.formInput} name="amount" type="number" step="0.01" min="0.01" value={form.amount} onChange={handleChange} required />
            </div>
            {isDisbursement && (
              <div style={styles.formGroup}>
                <label style={styles.label}>Expense Category</label>
                <SelectField style={styles.formInput} name="expense_category" value={form.expense_category} onChange={handleChange}>
                  <option value="">-- Select --</option>
                  {(expenseCategories || []).map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
                </SelectField>
              </div>
            )}
          </div>
          {isDisbursement && (
            <>
              <div style={{ ...styles.formGroup, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input type="checkbox" id="is_pcv" name="is_pcv" checked={form.is_pcv} onChange={handleChange} style={{ width: '16px', height: '16px' }} />
                <label htmlFor="is_pcv" style={{ fontSize: '13px', fontWeight: 500, color: '#374151', cursor: 'pointer' }}>No Official Receipt — use Petty Cash Voucher (PCV)</label>
              </div>
              {form.is_pcv ? (
                <div style={styles.formGroup}>
                  <label style={styles.label}>PCV Remarks <span style={{ color: '#ef4444' }}>*</span></label>
                  <textarea style={{ ...styles.formInput, minHeight: '60px', resize: 'vertical' }} name="pcv_remarks" value={form.pcv_remarks} onChange={handleChange} placeholder="Describe what was purchased and from whom..." required />
                </div>
              ) : (
                <div style={styles.formGroup}>
                  <label style={styles.label}>OR # (Official Receipt)</label>
                  <input style={styles.formInput} name="or_number" value={form.or_number} onChange={handleChange} />
                </div>
              )}
            </>
          )}
          <div style={styles.formActions}>
            <button type="button" style={styles.btnSecondary} onClick={onClose}>Cancel</button>
            <button type="submit" style={styles.btnPrimary} disabled={saving}>{saving ? 'Saving...' : isEdit ? 'Update' : 'Create'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
 

// ---------- Fund Overview Tab ----------
 
function FundOverview({ funds, loading, onCreateFund, onUpdateFund, onDeleteFund, onGenerateRemittance, onGenerateReplenishment, canManage, canPresidentReverse, people, warehouses, fundModes, fundStatuses }) {
  const [showForm, setShowForm] = useState(false);
  const [editingFund, setEditingFund] = useState(null);

  const handleCreate = () => { setEditingFund(null); setShowForm(true); };
  const handleEdit = (fund) => { setEditingFund(fund); setShowForm(true); };
  const handleSave = async (data, fundId) => {
    if (fundId) await onUpdateFund(fundId, data);
    else await onCreateFund(data);
  };

  if (loading) return <div style={styles.empty}>Loading funds...</div>;

  return (
    <div>
      {canManage && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
          <button style={styles.btnPrimary} onClick={handleCreate}>+ Create Fund</button>
        </div>
      )}
      {funds.length === 0 ? (
        <div style={styles.empty}>No petty cash funds found. Create one to get started.</div>
      ) : (
        <div style={styles.grid}>
          {funds.map(fund => {
            const balance = fund.current_balance || 0;
            const ceiling = fund.balance_ceiling || CEILING;
            const pct = (balance / ceiling) * 100;
            return (
              <div key={fund._id} style={styles.card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={styles.cardTitle}>{fund.fund_name}</div>
                    <div style={styles.cardCode}>{fund.fund_code}{fund.coa_code ? ` (COA ${fund.coa_code})` : ''}</div>
                  </div>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    {canManage && <button onClick={() => handleEdit(fund)} style={{ padding: '4px 10px', fontSize: '12px', borderRadius: '6px', border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer', color: '#6b7280' }}>Edit</button>}
                    {canPresidentReverse && <button onClick={() => onDeleteFund(fund._id)} title="Delete fund — gated by accounting.reverse_posted sub-permission (delegable via Access Template)" style={{ padding: '4px 10px', fontSize: '12px', borderRadius: '6px', border: '1px solid #fca5a5', background: '#fff', cursor: 'pointer', color: '#dc2626' }}>Del</button>}
                  </div>
                </div>
                <div style={styles.cardRow}>
                  <span>Custodian</span>
                  <span style={{ fontWeight: 500 }}>{fund.custodian_id?.name || '-'}</span>
                </div>
                {fund.warehouse_id && (
                  <div style={styles.cardRow}>
                    <span>Warehouse</span>
                    <span style={{ fontWeight: 500, fontSize: '12px' }}>{fund.warehouse_id?.warehouse_code || fund.warehouse_id?.warehouse_name || '-'}</span>
                  </div>
                )}
                <div style={styles.cardRow}>
                  <span>Mode</span>
                  <span style={{ fontWeight: 500, fontSize: '12px' }}>{fund.fund_mode || 'REVOLVING'}</span>
                </div>
                {fund.status && fund.status !== 'ACTIVE' && (
                  <div style={styles.cardRow}>
                    <span>Status</span>
                    <span style={styles.badge(fund.status === 'SUSPENDED' ? 'amber' : 'red')}>{fund.status}</span>
                  </div>
                )}
                <div style={styles.cardRow}>
                  <span>Balance</span>
                  <span style={{ fontWeight: 600, fontSize: '16px' }}>{styles.peso(balance)}</span>
                </div>
                <div style={styles.cardRow}>
                  <span>Authorized / Ceiling</span>
                  <span>{styles.peso(fund.authorized_amount || 0)} / {styles.peso(ceiling)}</span>
                </div>
                <div style={styles.progressBar}>
                  <div style={styles.progressFill(pct)} />
                </div>
                <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>{pct.toFixed(0)}% of ceiling</div>
                {pct >= 100 && (
                  <button
                    style={{ ...styles.btnDanger, marginTop: '12px', width: '100%' }}
                    onClick={() => onGenerateRemittance(fund._id)}
                  >
                    Generate Remittance
                  </button>
                )}
                {canManage && (
                  <button
                    style={{ ...styles.btnPrimary, marginTop: '8px', width: '100%' }}
                    onClick={() => onGenerateReplenishment(fund._id)}
                  >
                    Replenish Fund
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
      <FundFormModal open={showForm} onClose={() => setShowForm(false)} onSave={handleSave} editData={editingFund} people={people} warehouses={warehouses} fundModes={fundModes} fundStatuses={fundStatuses} />
    </div>
  );
}
 

// ---------- Transactions Tab ----------
 
function TransactionsTab({ funds, pc, canManage, canPresidentReverse, expenseCategories }) {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [fundFilter, setFundFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editingTxn, setEditingTxn] = useState(null);
  const [reverseTarget, setReverseTarget] = useState(null);

  const loadTransactions = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (fundFilter) params.fund_id = fundFilter;
      if (typeFilter) params.txn_type = typeFilter;
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      const res = await pc.getTransactions(params);
      setTransactions(res.data || res || []);
    } catch (err) { showError(err, 'Could not load petty cash transactions'); setTransactions([]); }
    finally { setLoading(false); }
  }, [pc, fundFilter, typeFilter, dateFrom, dateTo]);

  useEffect(() => { loadTransactions(); }, [loadTransactions]);

  const handlePost = async (id) => {
    if (!window.confirm('Post this transaction? This cannot be undone.')) return;
    try {
      const res = await pc.postTransaction(id);
      if (res?.approval_pending) { showApprovalPending(res.message); }
      loadTransactions();
    } catch (err) {
      if (err?.response?.data?.approval_pending) { showApprovalPending(err.response.data.message); loadTransactions(); }
      else showError(err, 'Could not post petty cash transaction');
    }
  };

  const handleVoid = async (id) => {
    const reason = window.prompt('Reason for voiding this transaction:');
    if (!reason?.trim()) return;
    try {
      await pc.voidTransaction(id, { reason: reason.trim() });
      showSuccess('Transaction voided.');
      loadTransactions();
    } catch (err) { showError(err, 'Could not void transaction'); }
  };

  const handlePresidentReverse = async ({ reason, confirm }) => {
    if (!reverseTarget) return;
    try {
      const res = await pc.presidentReverseTxn(reverseTarget._id, { reason, confirm });
      setReverseTarget(null);
      showSuccess(res?.message || 'Transaction reversed');
      loadTransactions();
    } catch (err) {
      const deps = err?.response?.data?.dependents;
      const baseMsg = err?.response?.data?.message || err?.message || 'Could not reverse transaction';
      const msg = deps?.length
        ? `${baseMsg} — depends on: ${deps.map(d => `${d.type} ${d.ref}`).join(', ')}`
        : baseMsg;
      showError({ message: msg }, msg);
      throw err;
    }
  };

  const handleSaveTxn = async (body, txnId) => {
    if (txnId) {
      await pc.updateTransaction(txnId, body);
      showSuccess('Transaction updated.');
    } else {
      await pc.createTransaction(body);
      showSuccess('Transaction created.');
    }
    loadTransactions();
  };

  const typeBadge = (type) => {
    if (type === 'DEPOSIT') return <span style={styles.badge('green')}>DEPOSIT</span>;
    if (type === 'DISBURSEMENT') return <span style={styles.badge('red')}>DISBURSEMENT</span>;
    return <span style={styles.badge('gray')}>{type}</span>;
  };

  const statusBadge = (status) => {
    if (status === 'POSTED') return <span style={styles.badge('green')}>POSTED</span>;
    if (status === 'DRAFT') return <span style={styles.badge('amber')}>DRAFT</span>;
    if (status === 'VOIDED') return <span style={styles.badge('red')}>VOIDED</span>;
    return <span style={styles.badge('gray')}>{status || 'DRAFT'}</span>;
  };

  return (
    <div>
      <div style={styles.filterRow}>
        <SelectField style={styles.select} value={fundFilter} onChange={e => setFundFilter(e.target.value)}>
          <option value="">All Funds</option>
          {(funds || []).map(f => <option key={f._id} value={f._id}>{f.fund_name}</option>)}
        </SelectField>
        <SelectField style={styles.select} value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
          <option value="">All Types</option>
          <option value="DEPOSIT">Deposit</option>
          <option value="DISBURSEMENT">Disbursement</option>
        </SelectField>
        <input style={styles.input} type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} placeholder="From" />
        <input style={styles.input} type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} placeholder="To" />
        <button style={styles.btnPrimary} onClick={() => { setEditingTxn(null); setShowCreate(true); }}>+ New Transaction</button>
      </div>

      {loading ? (
        <div style={styles.empty}>Loading transactions...</div>
      ) : transactions.length === 0 ? (
        <div style={styles.empty}>No transactions found.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Date</th>
                <th style={styles.th}>Txn #</th>
                <th style={styles.th}>Type</th>
                <th style={styles.th}>Payee / Source</th>
                <th style={styles.th}>Amount</th>
                <th style={styles.th}>Receipt</th>
                <th style={styles.th}>Balance</th>
                <th style={styles.th}>Status</th>
                <th style={styles.th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map(txn => (
                <tr key={txn._id}>
                  <td style={styles.td}>{txn.txn_date ? new Date(txn.txn_date).toLocaleDateString() : '-'}</td>
                  <td style={styles.td}>{txn.txn_number || '-'}</td>
                  <td style={styles.td}>{typeBadge(txn.txn_type)}</td>
                  <td style={styles.td}>{txn.linked_collection_id?.cr_no ? <><span style={styles.badge('blue')} title={txn.source_description}>CR# {txn.linked_collection_id.cr_no}</span>{' '}</> : txn.linked_sales_line_id?.invoice_number ? <><span style={styles.badge('green')} title={txn.source_description}>{txn.linked_sales_line_id.sale_type === 'SERVICE_INVOICE' ? 'SVC' : 'CR'}# {txn.linked_sales_line_id.invoice_number}</span>{' '}</> : (txn.payee || txn.source_description || '-')}</td>
                  <td style={styles.td}>{styles.peso(txn.amount)}</td>
                  <td style={styles.td}>
                    {txn.txn_type === 'DISBURSEMENT'
                      ? txn.is_pcv
                        ? <span style={styles.badge('amber')} title={txn.pcv_remarks || ''}>PCV</span>
                        : (txn.or_number || <span style={{ color: '#9ca3af', fontSize: '12px' }}>—</span>)
                      : <span style={{ color: '#9ca3af', fontSize: '12px' }}>—</span>}
                  </td>
                  <td style={styles.td}>{styles.peso(txn.running_balance)}</td>
                  <td style={styles.td}>{statusBadge(txn.status)}</td>
                  <td style={styles.td}>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      {txn.status === 'DRAFT' && (
                        <>
                          <button style={styles.btnSecondary} onClick={() => { setEditingTxn(txn); setShowCreate(true); }}>Edit</button>
                          {canManage && <>
                            <button style={styles.btnSuccess} onClick={() => handlePost(txn._id)}>Post</button>
                            <button style={styles.btnDanger} onClick={() => handleVoid(txn._id)}>Void</button>
                          </>}
                        </>
                      )}
                      {canPresidentReverse && !txn.deletion_event_id && txn.status !== 'VOIDED' && (
                        <button
                          onClick={() => setReverseTarget(txn)}
                          title="President: reverse this transaction (VOIDs txn, reverses JE, flips fund balance)"
                          style={{ padding: '4px 10px', fontSize: 12, borderRadius: 6, border: 'none', background: '#7f1d1d', color: '#fff', cursor: 'pointer' }}
                        >
                          President Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <TxnFormModal open={showCreate} onClose={() => { setShowCreate(false); setEditingTxn(null); }} onSave={handleSaveTxn} funds={funds} expenseCategories={expenseCategories} editData={editingTxn} />
      {reverseTarget && (
        <PresidentReverseModal
          docLabel={`${reverseTarget.txn_number || 'Txn'} · ${reverseTarget.txn_type || ''} · ₱${(reverseTarget.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })} · ${reverseTarget.status || 'DRAFT'}`}
          docStatus={reverseTarget.status}
          onConfirm={handlePresidentReverse}
          onClose={() => setReverseTarget(null)}
        />
      )}
    </div>
  );
}

 

// ---------- Documents Tab ----------
 
function DocumentsTab({ pc, canManage }) {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(false);

  const loadDocs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await pc.getDocuments({});
      setDocuments(res.data || res || []);
    } catch (err) { showError(err, 'Could not load petty cash documents'); setDocuments([]); }
    finally { setLoading(false); }
  }, [pc]);

  useEffect(() => { loadDocs(); }, [loadDocs]);

  const handleProcess = async (id) => {
    if (!window.confirm('Process this document? Balance will be updated and journal entry created.')) return;
    try {
      await pc.processDocument(id);
      showSuccess('Document processed successfully.');
      loadDocs();
    } catch (err) { showError(err, 'Could not process document'); }
  };

  const handlePrint = (id) => {
    window.open(`/erp/print/petty-cash/${id}`, '_blank');
  };

  const typeBadge = (type) => {
    if (type === 'REMITTANCE') return <span style={styles.badge('blue')}>REMITTANCE</span>;
    if (type === 'REPLENISHMENT') return <span style={styles.badge('green')}>REPLENISHMENT</span>;
    return <span style={styles.badge('gray')}>{type}</span>;
  };

  const statusBadge = (status) => {
    if (status === 'PROCESSED') return <span style={styles.badge('green')}>PROCESSED</span>;
    if (status === 'PENDING') return <span style={styles.badge('amber')}>PENDING</span>;
    if (status === 'DRAFT') return <span style={styles.badge('gray')}>DRAFT</span>;
    return <span style={styles.badge('gray')}>{status || 'DRAFT'}</span>;
  };

  return (
    <div>
      {loading ? (
        <div style={styles.empty}>Loading documents...</div>
      ) : documents.length === 0 ? (
        <div style={styles.empty}>No documents found.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Doc #</th>
                <th style={styles.th}>Type</th>
                <th style={styles.th}>Date</th>
                <th style={styles.th}>Amount</th>
                <th style={styles.th}>Fund</th>
                <th style={styles.th}>Status</th>
                <th style={styles.th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {documents.map(doc => (
                <tr key={doc._id}>
                  <td style={styles.td}>{doc.doc_number || '-'}</td>
                  <td style={styles.td}>{typeBadge(doc.doc_type)}</td>
                  <td style={styles.td}>{doc.doc_date ? new Date(doc.doc_date).toLocaleDateString() : '-'}</td>
                  <td style={styles.td}>{styles.peso(doc.amount)}</td>
                  <td style={styles.td}>{doc.fund_id?.fund_name || '-'}</td>
                  <td style={styles.td}>{statusBadge(doc.status)}</td>
                  <td style={styles.td}>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      <button style={styles.btnSecondary} onClick={() => handlePrint(doc._id)}>Print</button>
                      {doc.status !== 'PROCESSED' && canManage && (
                        <button style={styles.btnSuccess} onClick={() => handleProcess(doc._id)}>Process</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

 

// ---------- Main Page ----------
export default function PettyCash() {
  const { user } = useAuth();
  const pc = usePettyCash();
  const { getPeopleList } = usePeople();
  const { getWarehouses } = useWarehouses();
  const { data: lookups } = useLookupBatch(['PETTY_CASH_FUND_TYPE', 'PETTY_CASH_FUND_STATUS', 'PETTY_CASH_EXPENSE_CATEGORY']);
  const { hasSubPermission } = useErpSubAccess();
  const canManage = ROLE_SETS.MANAGEMENT.includes(user?.role)
    || user?.erp_access?.sub_permissions?.accounting?.petty_cash === true;
  const canPresidentReverse = hasSubPermission('accounting', 'reverse_posted');
  const [activeTab, setActiveTab] = useState('funds');
  const [funds, setFunds] = useState([]);
  const [people, setPeople] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(true);

  const fundModes = lookups.PETTY_CASH_FUND_TYPE || [];
  const fundStatuses = lookups.PETTY_CASH_FUND_STATUS || [];
  const expenseCategories = lookups.PETTY_CASH_EXPENSE_CATEGORY || [];

  const loadFunds = useCallback(async () => {
    setLoading(true);
    try {
      const res = await pc.getFunds();
      setFunds(res.data || res || []);
    } catch (err) { showError(err, 'Could not load petty cash funds'); setFunds([]); }
    finally { setLoading(false); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadFunds(); }, [loadFunds]);

  // Load people for custodian dropdown + warehouses for fund assignment
  useEffect(() => {
    getPeopleList({ limit: 0, status: 'ACTIVE' }).then(res => setPeople(res?.data || [])).catch(() => {});
    getWarehouses({ limit: 0 }).then(res => setWarehouses(res?.data || [])).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreateFund = async (body) => {
    await pc.createFund(body);
    showSuccess('Fund created successfully.');
    loadFunds();
  };

  const handleUpdateFund = async (fundId, body) => {
    await pc.updateFund(fundId, body);
    showSuccess('Fund updated successfully.');
    loadFunds();
  };

  const handleDeleteFund = async (fundId) => {
    if (!confirm('Delete this fund? This cannot be undone.')) return;
    try {
      await pc.deleteFund(fundId);
      showSuccess('Fund deleted.');
      loadFunds();
    } catch (err) { showError(err, 'Could not delete fund'); }
  };

  const handleGenerateRemittance = async (fundId) => {
    try {
      await pc.generateRemittance({ fund_id: fundId });
      showSuccess('Remittance generated successfully.');
      setActiveTab('documents');
    } catch (err) {
      showError(err, 'Could not generate remittance');
    }
  };

  const handleGenerateReplenishment = async (fundId) => {
    const amountStr = window.prompt('Enter replenishment amount (owner → fund):');
    if (!amountStr) return;
    const amount = Number(amountStr);
    if (!amount || amount <= 0) { showError(null, 'Enter a valid positive amount'); return; }
    try {
      await pc.generateReplenishment({ fund_id: fundId, amount });
      showSuccess('Replenishment document generated. Go to Documents tab to process.');
      setActiveTab('documents');
    } catch (err) { showError(err, 'Could not generate replenishment'); }
  };

  return (
    <div style={styles.container}>
      <WorkflowGuide pageKey="petty-cash" />
      <div style={styles.header}>
        <h1 style={styles.title}>Petty Cash Management</h1>
      </div>

      <div style={styles.tabs}>
        <button style={activeTab === 'funds' ? styles.tabActive : styles.tab} onClick={() => setActiveTab('funds')}>Fund Overview</button>
        <button style={activeTab === 'transactions' ? styles.tabActive : styles.tab} onClick={() => setActiveTab('transactions')}>Transactions</button>
        <button style={activeTab === 'documents' ? styles.tabActive : styles.tab} onClick={() => setActiveTab('documents')}>Documents</button>
      </div>

      {activeTab === 'funds' && (
        <FundOverview funds={funds} loading={loading} onCreateFund={handleCreateFund} onUpdateFund={handleUpdateFund} onDeleteFund={handleDeleteFund} onGenerateRemittance={handleGenerateRemittance} onGenerateReplenishment={handleGenerateReplenishment} canManage={canManage} canPresidentReverse={canPresidentReverse} people={people} warehouses={warehouses} fundModes={fundModes} fundStatuses={fundStatuses} />
      )}
      {activeTab === 'transactions' && (
        <TransactionsTab funds={funds} pc={pc} canManage={canManage} canPresidentReverse={canPresidentReverse} expenseCategories={expenseCategories} />
      )}
      {activeTab === 'documents' && (
        <DocumentsTab pc={pc} canManage={canManage} />
      )}
    </div>
  );
}
