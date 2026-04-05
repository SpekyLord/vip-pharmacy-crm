import React, { useState, useEffect, useCallback } from 'react';
import usePettyCash from '../hooks/usePettyCash';

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

// ---------- Create Fund Modal ----------
function CreateFundModal({ open, onClose, onSave }) {
  const [form, setForm] = useState({ fund_name: '', fund_code: '', custodian: '', ceiling_amount: CEILING });
  const [saving, setSaving] = useState(false);

  const handleChange = (e) => setForm(f => ({ ...f, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try { await onSave({ ...form, ceiling_amount: Number(form.ceiling_amount) }); onClose(); }
    catch (err) { alert(err?.response?.data?.message || 'Failed to create fund'); }
    finally { setSaving(false); }
  };

  if (!open) return null;
  return (
    <div style={styles.modal} onClick={onClose}>
      <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
        <h3 style={styles.modalTitle}>Create Petty Cash Fund</h3>
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
            <label style={styles.label}>Custodian (User ID)</label>
            <input style={styles.formInput} name="custodian" value={form.custodian} onChange={handleChange} required />
          </div>
          <div style={styles.formGroup}>
            <label style={styles.label}>Ceiling Amount</label>
            <input style={styles.formInput} name="ceiling_amount" type="number" value={form.ceiling_amount} onChange={handleChange} required />
          </div>
          <div style={styles.formActions}>
            <button type="button" style={styles.btnSecondary} onClick={onClose}>Cancel</button>
            <button type="submit" style={styles.btnPrimary} disabled={saving}>{saving ? 'Saving...' : 'Create Fund'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------- Create Transaction Modal ----------
function CreateTxnModal({ open, onClose, onSave, funds }) {
  const [form, setForm] = useState({ fund: '', txn_type: 'DISBURSEMENT', payee: '', description: '', amount: '', receipt_number: '' });
  const [saving, setSaving] = useState(false);

  const handleChange = (e) => setForm(f => ({ ...f, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try { await onSave({ ...form, amount: Number(form.amount) }); onClose(); setForm({ fund: '', txn_type: 'DISBURSEMENT', payee: '', description: '', amount: '', receipt_number: '' }); }
    catch (err) { alert(err?.response?.data?.message || 'Failed to create transaction'); }
    finally { setSaving(false); }
  };

  if (!open) return null;
  return (
    <div style={styles.modal} onClick={onClose}>
      <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
        <h3 style={styles.modalTitle}>New Transaction</h3>
        <form onSubmit={handleSubmit}>
          <div style={styles.formGroup}>
            <label style={styles.label}>Fund</label>
            <select style={styles.formInput} name="fund" value={form.fund} onChange={handleChange} required>
              <option value="">Select fund...</option>
              {(funds || []).map(f => <option key={f._id} value={f._id}>{f.fund_name}</option>)}
            </select>
          </div>
          <div style={styles.formGroup}>
            <label style={styles.label}>Type</label>
            <select style={styles.formInput} name="txn_type" value={form.txn_type} onChange={handleChange}>
              <option value="DISBURSEMENT">Disbursement</option>
              <option value="DEPOSIT">Deposit</option>
            </select>
          </div>
          <div style={styles.formGroup}>
            <label style={styles.label}>{form.txn_type === 'DEPOSIT' ? 'Source' : 'Payee'}</label>
            <input style={styles.formInput} name="payee" value={form.payee} onChange={handleChange} required />
          </div>
          <div style={styles.formGroup}>
            <label style={styles.label}>Description</label>
            <input style={styles.formInput} name="description" value={form.description} onChange={handleChange} required />
          </div>
          <div style={styles.formGroup}>
            <label style={styles.label}>Amount</label>
            <input style={styles.formInput} name="amount" type="number" step="0.01" min="0.01" value={form.amount} onChange={handleChange} required />
          </div>
          <div style={styles.formGroup}>
            <label style={styles.label}>Receipt #</label>
            <input style={styles.formInput} name="receipt_number" value={form.receipt_number} onChange={handleChange} />
          </div>
          <div style={styles.formActions}>
            <button type="button" style={styles.btnSecondary} onClick={onClose}>Cancel</button>
            <button type="submit" style={styles.btnPrimary} disabled={saving}>{saving ? 'Saving...' : 'Create'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------- Fund Overview Tab ----------
function FundOverview({ funds, loading, onCreateFund, onGenerateRemittance }) {
  const [showCreate, setShowCreate] = useState(false);

  if (loading) return <div style={styles.empty}>Loading funds...</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
        <button style={styles.btnPrimary} onClick={() => setShowCreate(true)}>+ Create Fund</button>
      </div>
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
                <div style={styles.cardTitle}>{fund.fund_name}</div>
                <div style={styles.cardCode}>{fund.fund_code}</div>
                <div style={styles.cardRow}>
                  <span>Custodian</span>
                  <span style={{ fontWeight: 500 }}>{fund.custodian_id?.name || '-'}</span>
                </div>
                <div style={styles.cardRow}>
                  <span>Balance</span>
                  <span style={{ fontWeight: 600, fontSize: '16px' }}>{styles.peso(balance)}</span>
                </div>
                <div style={styles.cardRow}>
                  <span>Ceiling</span>
                  <span>{styles.peso(ceiling)}</span>
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
              </div>
            );
          })}
        </div>
      )}
      <CreateFundModal open={showCreate} onClose={() => setShowCreate(false)} onSave={onCreateFund} />
    </div>
  );
}

// ---------- Transactions Tab ----------
function TransactionsTab({ funds, pc }) {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [fundFilter, setFundFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showCreate, setShowCreate] = useState(false);

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
    } catch { setTransactions([]); }
    finally { setLoading(false); }
  }, [pc, fundFilter, typeFilter, dateFrom, dateTo]);

  useEffect(() => { loadTransactions(); }, [loadTransactions]);

  const handlePost = async (id) => {
    if (!window.confirm('Post this transaction? This cannot be undone.')) return;
    try { await pc.postTransaction(id); loadTransactions(); }
    catch (err) { alert(err?.response?.data?.message || 'Failed to post'); }
  };

  const handleCreate = async (body) => {
    await pc.createTransaction(body);
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
        <select style={styles.select} value={fundFilter} onChange={e => setFundFilter(e.target.value)}>
          <option value="">All Funds</option>
          {(funds || []).map(f => <option key={f._id} value={f._id}>{f.fund_name}</option>)}
        </select>
        <select style={styles.select} value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
          <option value="">All Types</option>
          <option value="DEPOSIT">Deposit</option>
          <option value="DISBURSEMENT">Disbursement</option>
        </select>
        <input style={styles.input} type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} placeholder="From" />
        <input style={styles.input} type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} placeholder="To" />
        <button style={styles.btnPrimary} onClick={() => setShowCreate(true)}>+ New Transaction</button>
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
                  <td style={styles.td}>{txn.payee || txn.source_description || '-'}</td>
                  <td style={styles.td}>{styles.peso(txn.amount)}</td>
                  <td style={styles.td}>{styles.peso(txn.running_balance)}</td>
                  <td style={styles.td}>{statusBadge(txn.status)}</td>
                  <td style={styles.td}>
                    {txn.status !== 'POSTED' && txn.status !== 'VOIDED' && (
                      <button style={styles.btnSuccess} onClick={() => handlePost(txn._id)}>Post</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <CreateTxnModal open={showCreate} onClose={() => setShowCreate(false)} onSave={handleCreate} funds={funds} />
    </div>
  );
}

// ---------- Documents Tab ----------
function DocumentsTab({ pc }) {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(false);

  const loadDocs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await pc.getDocuments({});
      setDocuments(res.data || res || []);
    } catch { setDocuments([]); }
    finally { setLoading(false); }
  }, [pc]);

  useEffect(() => { loadDocs(); }, [loadDocs]);

  const handleSign = async (id) => {
    try { await pc.signDocument(id, { role: 'approver' }); loadDocs(); }
    catch (err) { alert(err?.response?.data?.message || 'Failed to sign'); }
  };

  const handleProcess = async (id) => {
    if (!window.confirm('Process this document?')) return;
    try { await pc.processDocument(id); loadDocs(); }
    catch (err) { alert(err?.response?.data?.message || 'Failed to process'); }
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

  const sigStatus = (sigs) => {
    if (!sigs || sigs.length === 0) return <span style={{ color: '#9ca3af', fontSize: '12px' }}>No signatures</span>;
    const signed = sigs.filter(s => s.signed_at).length;
    return <span style={{ fontSize: '12px' }}>{signed}/{sigs.length} signed</span>;
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
                <th style={styles.th}>Signatures</th>
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
                  <td style={styles.td}>{styles.peso(doc.total_amount)}</td>
                  <td style={styles.td}>{sigStatus(doc.signatures)}</td>
                  <td style={styles.td}>{statusBadge(doc.status)}</td>
                  <td style={styles.td}>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      <button style={styles.btnSecondary} onClick={() => handlePrint(doc._id)}>Print</button>
                      {doc.status !== 'PROCESSED' && (
                        <>
                          <button style={styles.btnPrimary} onClick={() => handleSign(doc._id)}>Sign</button>
                          <button style={styles.btnSuccess} onClick={() => handleProcess(doc._id)}>Process</button>
                        </>
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
  const pc = usePettyCash();
  const [activeTab, setActiveTab] = useState('funds');
  const [funds, setFunds] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadFunds = useCallback(async () => {
    setLoading(true);
    try {
      const res = await pc.getFunds();
      setFunds(res.data || res || []);
    } catch { setFunds([]); }
    finally { setLoading(false); }
  }, [pc]);

  useEffect(() => { loadFunds(); }, [loadFunds]);

  const handleCreateFund = async (body) => {
    await pc.createFund(body);
    loadFunds();
  };

  const handleGenerateRemittance = async (fundId) => {
    try {
      await pc.generateRemittance({ fund_id: fundId });
      alert('Remittance generated successfully.');
      setActiveTab('documents');
    } catch (err) {
      alert(err?.response?.data?.message || 'Failed to generate remittance');
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>Petty Cash Management</h1>
      </div>

      <div style={styles.tabs}>
        <button style={activeTab === 'funds' ? styles.tabActive : styles.tab} onClick={() => setActiveTab('funds')}>Fund Overview</button>
        <button style={activeTab === 'transactions' ? styles.tabActive : styles.tab} onClick={() => setActiveTab('transactions')}>Transactions</button>
        <button style={activeTab === 'documents' ? styles.tabActive : styles.tab} onClick={() => setActiveTab('documents')}>Documents</button>
      </div>

      {activeTab === 'funds' && (
        <FundOverview funds={funds} loading={loading} onCreateFund={handleCreateFund} onGenerateRemittance={handleGenerateRemittance} />
      )}
      {activeTab === 'transactions' && (
        <TransactionsTab funds={funds} pc={pc} />
      )}
      {activeTab === 'documents' && (
        <DocumentsTab pc={pc} />
      )}
    </div>
  );
}
