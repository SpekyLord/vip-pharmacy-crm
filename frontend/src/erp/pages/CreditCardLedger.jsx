import { useState, useEffect, useCallback } from 'react';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import useBanking from '../hooks/useBanking';
import { showError } from '../utils/errorToast';

import SelectField from '../../components/common/Select';
import WorkflowGuide from '../components/WorkflowGuide';

const pageStyles = `
  .ccl-container { background: var(--erp-bg, #f4f7fb); min-height: 100vh; display: flex; flex-direction: column; }
  .ccl-main { flex: 1; min-width: 0; overflow-y: auto; padding: 20px; max-width: 1200px; margin: 0 auto; width: 100%; }
  .ccl-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 8px; }
  .ccl-header h2 { margin: 0; font-size: 20px; }
  .ccl-controls { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; margin-bottom: 16px; }
  .ccl-controls select, .ccl-controls input { padding: 7px 10px; border-radius: 6px; border: 1px solid var(--erp-border, #e5e7eb); font-size: 13px; }
  .ccl-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 12px; margin-bottom: 16px; }
  .ccl-card { background: var(--erp-panel, #fff); border-radius: 10px; padding: 14px; box-shadow: 0 1px 4px rgba(0,0,0,.06); cursor: pointer; border-left: 4px solid var(--erp-accent, #1e5eff); transition: transform .1s; }
  .ccl-card:hover { transform: translateY(-1px); }
  .ccl-card.selected { border-left-color: #16a34a; box-shadow: 0 0 0 2px #16a34a33; }
  .ccl-card-name { font-weight: 600; font-size: 14px; }
  .ccl-card-meta { font-size: 11px; color: var(--erp-muted, #6b7280); margin-top: 4px; }
  .ccl-card-bal { font-size: 20px; font-weight: 700; font-family: 'Courier New', monospace; margin-top: 8px; }
  .ccl-card-bal.zero { color: #16a34a; }
  .ccl-card-bal.has-bal { color: #dc2626; }
  .ccl-panel { background: var(--erp-panel, #fff); border-radius: 12px; padding: 16px; margin-bottom: 16px; box-shadow: 0 1px 4px rgba(0,0,0,.06); }
  .ccl-panel h3 { margin: 0 0 12px; font-size: 15px; }
  .ccl-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .ccl-table th { background: var(--erp-accent-soft, #e8efff); padding: 8px 10px; text-align: left; font-weight: 600; color: var(--erp-muted, #6b7280); text-transform: uppercase; letter-spacing: .3px; font-size: 11px; }
  .ccl-table td { padding: 8px 10px; border-top: 1px solid var(--erp-border, #e5e7eb); }
  .ccl-table tr:hover td { background: #f8fafc; }
  .status-PENDING { background: #fef3c7; color: #92400e; padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 600; }
  .status-POSTED { background: #dbeafe; color: #1e40af; padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 600; }
  .status-PAID { background: #dcfce7; color: #166534; padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 600; }
  .btn { padding: 6px 14px; border-radius: 6px; border: none; cursor: pointer; font-size: 13px; font-weight: 500; }
  .btn-primary { background: var(--erp-accent, #1e5eff); color: #fff; }
  .btn-success { background: #16a34a; color: #fff; }
  .btn-outline { background: transparent; border: 1px solid var(--erp-border, #e5e7eb); color: var(--erp-muted, #6b7280); }
  .btn-sm { padding: 4px 10px; font-size: 12px; }
  .ccl-modal { position: fixed; inset: 0; background: rgba(0,0,0,.4); display: flex; align-items: center; justify-content: center; z-index: 100; }
  .ccl-modal-body { background: var(--erp-panel, #fff); border-radius: 12px; padding: 24px; width: 480px; max-width: 95vw; }
  .ccl-fg { margin-bottom: 12px; }
  .ccl-fg label { display: block; font-size: 12px; font-weight: 600; margin-bottom: 4px; color: var(--erp-muted, #6b7280); }
  .ccl-fg input, .ccl-fg select { width: 100%; padding: 8px 10px; border-radius: 6px; border: 1px solid var(--erp-border, #e5e7eb); font-size: 13px; box-sizing: border-box; }
  .ccl-msg { padding: 8px 14px; border-radius: 8px; margin-bottom: 12px; font-size: 13px; }
  .ccl-msg-ok { background: #dcfce7; color: #166534; }
  .ccl-msg-err { background: #fee2e2; color: #dc2626; }
  .money { font-family: 'Courier New', monospace; text-align: right; }
  @media(max-width: 768px) { .ccl-main { padding: 12px; } }
`;

export default function CreditCardLedger() {
  const api = useBanking();

  const [cards, setCards] = useState([]);
  const [selectedCard, setSelectedCard] = useState(null);
  const [ledger, setLedger] = useState([]);
  const [period, setPeriod] = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; });
  const [loading, setLoading] = useState(false);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [showPayment, setShowPayment] = useState(false);
  const [showNewTxn, setShowNewTxn] = useState(false);
  const [payForm, setPayForm] = useState({ amount: '', bank_account_id: '', payment_date: '' });
  const [txnForm, setTxnForm] = useState({ txn_date: '', description: '', amount: '', reference: '' });
  const [msg, setMsg] = useState(null);

  const showMsg = (text, type = 'ok') => { setMsg({ text, type }); setTimeout(() => setMsg(null), 4000); };
  const fmt = (n) => n != null ? Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00';

  // Load cards with balances
  const loadCards = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getCardBalances();
      setCards(res?.data || []);
    } catch (err) { showError(err, 'Could not load credit card balances'); }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { loadCards(); }, [loadCards]);

  // Load bank accounts for payment form
  useEffect(() => {
    (async () => {
      try {
        const res = await api.listBankAccounts({ is_active: true });
        setBankAccounts(res?.data || []);
      } catch (err) { console.error('[CreditCardLedger] load bank accounts:', err.message); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load ledger when card/period changes
  const loadLedger = useCallback(async () => {
    if (!selectedCard) return;
    try {
      const res = await api.getCardLedger(selectedCard._id, { period });
      setLedger(res?.data || []);
    } catch (err) { showError(err, 'Could not load card ledger'); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCard, period]);

  useEffect(() => { loadLedger(); }, [loadLedger]);

  const handlePayment = async () => {
    if (!selectedCard) return;
    try {
      const res = await api.recordCardPayment(selectedCard._id, {
        amount: parseFloat(payForm.amount),
        bank_account_id: payForm.bank_account_id,
        payment_date: payForm.payment_date || undefined
      });
      showMsg(`Payment recorded — JE #${res?.data?.je_number || ''}, ${res?.data?.transactions_paid || 0} txns paid`);
      setShowPayment(false);
      setPayForm({ amount: '', bank_account_id: '', payment_date: '' });
      loadCards();
      loadLedger();
    } catch (err) {
      showMsg(err.response?.data?.message || 'Payment failed', 'err');
    }
  };

  const handleNewTxn = async () => {
    if (!selectedCard) return;
    try {
      await api.createCCTransaction({
        credit_card_id: selectedCard._id,
        txn_date: txnForm.txn_date,
        description: txnForm.description,
        amount: parseFloat(txnForm.amount),
        reference: txnForm.reference
      });
      showMsg('Transaction recorded');
      setShowNewTxn(false);
      setTxnForm({ txn_date: '', description: '', amount: '', reference: '' });
      loadCards();
      loadLedger();
    } catch (err) {
      showMsg(err.response?.data?.message || 'Failed to create transaction', 'err');
    }
  };

  return (
    <div className="ccl-container">
      <style>{pageStyles}</style>
      <Navbar />
      <div style={{ display: 'flex', flex: 1 }}>
        <Sidebar />
        <main className="ccl-main admin-main">
          <WorkflowGuide pageKey="credit-card-ledger" />
          <div className="ccl-header">
            <h2>Credit Card Ledger</h2>
            {selectedCard && (
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary" onClick={() => setShowNewTxn(true)}>+ Transaction</button>
                <button className="btn btn-success" onClick={() => {
                  setPayForm({ amount: selectedCard.outstanding || '', bank_account_id: bankAccounts[0]?._id || '', payment_date: '' });
                  setShowPayment(true);
                }}>Record Payment</button>
              </div>
            )}
          </div>

          {msg && <div className={`ccl-msg ccl-msg-${msg.type}`}>{msg.text}</div>}

          {/* Card selector grid */}
          <div className="ccl-cards">
            {loading ? <div style={{ color: '#888' }}>Loading cards...</div> :
              cards.length === 0 ? <div style={{ color: '#888' }}>No credit cards found</div> :
              cards.map(c => (
                <div key={c._id} className={`ccl-card ${selectedCard?._id === c._id ? 'selected' : ''}`} onClick={() => setSelectedCard(c)}>
                  <div className="ccl-card-name">{c.card_name}</div>
                  <div className="ccl-card-meta">{c.card_code} &middot; {c.bank || '—'} &middot; {c.card_type}</div>
                  {c.assigned_to && <div className="ccl-card-meta">Assigned: {c.assigned_to.name}</div>}
                  <div className={`ccl-card-bal ${c.outstanding > 0 ? 'has-bal' : 'zero'}`}>
                    {fmt(c.outstanding)}
                  </div>
                  <div className="ccl-card-meta">{c.pending_txn_count} pending txn{c.pending_txn_count !== 1 ? 's' : ''}</div>
                </div>
              ))
            }
          </div>

          {/* Ledger table */}
          {selectedCard && (
            <div className="ccl-panel">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h3>Transactions — {selectedCard.card_name}</h3>
                <input type="month" value={period} onChange={e => setPeriod(e.target.value)} style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #e5e7eb', fontSize: 13 }} />
              </div>
              {ledger.length === 0 ? <div style={{ color: '#888', padding: 12 }}>No transactions for this period</div> : (
                <table className="ccl-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Description</th>
                      <th>Reference</th>
                      <th style={{ textAlign: 'right' }}>Amount</th>
                      <th>Status</th>
                      <th>Linked Doc</th>
                      <th>JE#</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledger.map(t => (
                      <tr key={t._id}>
                        <td>{new Date(t.txn_date).toLocaleDateString()}</td>
                        <td>{t.description}</td>
                        <td>{t.reference || '—'}</td>
                        <td className="money">{fmt(t.amount)}</td>
                        <td><span className={`status-${t.status}`}>{t.status}</span></td>
                        <td>
                          {t.linked_expense_id ? `EXP ${t.linked_expense_id.period || ''}` : ''}
                          {t.linked_calf_id ? `CALF ${t.linked_calf_id.calf_number || ''}` : ''}
                          {!t.linked_expense_id && !t.linked_calf_id ? '—' : ''}
                        </td>
                        <td>{t.payment_je_id?.je_number || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* Payment Modal */}
          {showPayment && (
            <div className="ccl-modal" onClick={() => setShowPayment(false)}>
              <div className="ccl-modal-body" onClick={e => e.stopPropagation()}>
                <h3 style={{ marginTop: 0 }}>Record CC Payment — {selectedCard?.card_name}</h3>
                <p style={{ fontSize: 12, color: '#888', margin: '0 0 12px' }}>
                  Outstanding: <strong style={{ color: '#dc2626' }}>{fmt(selectedCard?.outstanding)}</strong>
                </p>
                <div className="ccl-fg">
                  <label>Payment Amount</label>
                  <input type="number" step="0.01" value={payForm.amount} onChange={e => setPayForm({ ...payForm, amount: e.target.value })} />
                </div>
                <div className="ccl-fg">
                  <label>Bank Account (Source)</label>
                  <SelectField value={payForm.bank_account_id} onChange={e => setPayForm({ ...payForm, bank_account_id: e.target.value })}>
                    <option value="">Select bank...</option>
                    {bankAccounts.map(b => <option key={b._id} value={b._id}>{b.bank_name} ({b.bank_code})</option>)}
                  </SelectField>
                </div>
                <div className="ccl-fg">
                  <label>Payment Date</label>
                  <input type="date" value={payForm.payment_date} onChange={e => setPayForm({ ...payForm, payment_date: e.target.value })} />
                </div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
                  <button className="btn btn-outline" onClick={() => setShowPayment(false)}>Cancel</button>
                  <button className="btn btn-success" onClick={handlePayment} disabled={!payForm.amount || !payForm.bank_account_id}>Record Payment</button>
                </div>
              </div>
            </div>
          )}

          {/* New Transaction Modal */}
          {showNewTxn && (
            <div className="ccl-modal" onClick={() => setShowNewTxn(false)}>
              <div className="ccl-modal-body" onClick={e => e.stopPropagation()}>
                <h3 style={{ marginTop: 0 }}>New Transaction — {selectedCard?.card_name}</h3>
                <div className="ccl-fg">
                  <label>Transaction Date</label>
                  <input type="date" value={txnForm.txn_date} onChange={e => setTxnForm({ ...txnForm, txn_date: e.target.value })} />
                </div>
                <div className="ccl-fg">
                  <label>Description</label>
                  <input value={txnForm.description} onChange={e => setTxnForm({ ...txnForm, description: e.target.value })} placeholder="e.g. Office supplies — National Bookstore" />
                </div>
                <div className="ccl-fg">
                  <label>Amount</label>
                  <input type="number" step="0.01" value={txnForm.amount} onChange={e => setTxnForm({ ...txnForm, amount: e.target.value })} />
                </div>
                <div className="ccl-fg">
                  <label>Reference</label>
                  <input value={txnForm.reference} onChange={e => setTxnForm({ ...txnForm, reference: e.target.value })} placeholder="Optional reference number" />
                </div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
                  <button className="btn btn-outline" onClick={() => setShowNewTxn(false)}>Cancel</button>
                  <button className="btn btn-primary" onClick={handleNewTxn} disabled={!txnForm.txn_date || !txnForm.description || !txnForm.amount}>Create</button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
