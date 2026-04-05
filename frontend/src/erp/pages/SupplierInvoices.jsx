import React, { useState, useEffect, useCallback } from 'react';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import usePurchasing from '../hooks/usePurchasing';

const styles = `
  .si-page { background: var(--erp-bg, #f4f7fb); min-height: 100vh; }
  .si-main { flex: 1; min-width: 0; overflow-y: auto; padding: 20px; max-width: 1300px; margin: 0 auto; }
  .si-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 8px; }
  .si-header h2 { font-size: 20px; font-weight: 700; margin: 0; }
  .si-filters { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 14px; }
  .si-filters select { padding: 6px 10px; border-radius: 6px; border: 1px solid var(--erp-border, #e2e8f0); font-size: 12px; }
  .btn { padding: 6px 14px; border-radius: 6px; border: none; cursor: pointer; font-size: 13px; font-weight: 500; }
  .btn-primary { background: var(--erp-accent, #1e5eff); color: #fff; }
  .btn-success { background: #16a34a; color: #fff; }
  .btn-warning { background: #f59e0b; color: #fff; }
  .btn-sm { padding: 4px 10px; font-size: 12px; }
  .si-table { width: 100%; border-collapse: collapse; background: var(--erp-panel, #fff); border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,.06); }
  .si-table th, .si-table td { padding: 10px 12px; text-align: left; font-size: 13px; border-bottom: 1px solid var(--erp-border, #f1f5f9); }
  .si-table th { background: var(--erp-accent-soft, #e8efff); font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: .5px; color: var(--erp-muted, #64748b); }
  .si-badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 600; }
  .si-badge-DRAFT { background: #e2e8f0; color: #475569; }
  .si-badge-VALIDATED { background: #dbeafe; color: #1e40af; }
  .si-badge-POSTED { background: #dcfce7; color: #166534; }
  .si-badge-UNMATCHED { background: #e2e8f0; color: #475569; }
  .si-badge-PARTIAL_MATCH { background: #fef3c7; color: #92400e; }
  .si-badge-FULL_MATCH { background: #dcfce7; color: #166534; }
  .si-badge-DISCREPANCY { background: #fee2e2; color: #dc2626; }
  .si-badge-UNPAID { background: #fee2e2; color: #dc2626; }
  .si-badge-PARTIAL { background: #fef3c7; color: #92400e; }
  .si-badge-PAID { background: #dcfce7; color: #166534; }
  .si-modal { position: fixed; inset: 0; background: rgba(0,0,0,.4); display: flex; align-items: center; justify-content: center; z-index: 100; }
  .si-modal-body { background: var(--erp-panel, #fff); border-radius: 12px; padding: 24px; width: 700px; max-width: 95vw; max-height: 90vh; overflow-y: auto; }
  .si-modal-body h3 { margin: 0 0 16px; font-size: 16px; }
  .form-group { margin-bottom: 12px; }
  .form-group label { display: block; font-size: 12px; font-weight: 600; margin-bottom: 4px; color: var(--erp-muted); }
  .form-group input, .form-group select { width: 100%; padding: 8px 10px; border-radius: 6px; border: 1px solid var(--erp-border); font-size: 13px; box-sizing: border-box; }
  .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .line-items-table { width: 100%; border-collapse: collapse; margin: 8px 0; font-size: 12px; }
  .line-items-table th, .line-items-table td { padding: 6px 8px; border: 1px solid var(--erp-border, #e2e8f0); }
  .line-items-table th { background: #f8fafc; font-weight: 600; }
  .line-items-table input { width: 100%; padding: 4px 6px; border: 1px solid var(--erp-border); border-radius: 4px; font-size: 12px; box-sizing: border-box; }
  .si-msg { font-size: 13px; margin-bottom: 12px; padding: 8px 12px; border-radius: 8px; }
  .si-msg-ok { background: #dcfce7; color: #166534; }
  .si-msg-err { background: #fee2e2; color: #dc2626; }
  .si-empty { text-align: center; color: #64748b; padding: 40px; }
  .si-actions { display: flex; gap: 4px; }
  .si-pag { display: flex; justify-content: center; gap: 8px; margin-top: 14px; align-items: center; font-size: 13px; }
  .si-pay-form { background: #f8fafc; padding: 14px; border-radius: 8px; margin-top: 12px; }
  @media(max-width: 768px) { .si-main { padding: 12px; padding-bottom: calc(80px + env(safe-area-inset-bottom, 0px)); } .form-row { grid-template-columns: 1fr; } .si-modal-body { width: 95vw; } }
  @media(max-width: 375px) { .si-main { padding: 8px; padding-bottom: calc(80px + env(safe-area-inset-bottom, 0px)); } .si-main input, .si-main select { font-size: 16px; } }
`;

const EMPTY_LINE = { product_id: '', item_key: '', qty_invoiced: 1, unit_price: 0 };

export default function SupplierInvoices() {
  const api = usePurchasing();

  const [invoices, setInvoices] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [pos, setPOs] = useState([]);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [creditCards, setCreditCards] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0 });
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [matchFilter, setMatchFilter] = useState('');
  const [payFilter, setPayFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showPay, setShowPay] = useState(null);
  const [form, setForm] = useState({ vendor_id: '', invoice_ref: '', invoice_date: '', due_date: '', po_id: '', line_items: [{ ...EMPTY_LINE }] });
  const [payForm, setPayForm] = useState({ amount: 0, payment_date: '', payment_mode: '', bank_account_id: '', funding_card_id: '', check_no: '', reference: '' });
  const [msg, setMsg] = useState({ text: '', type: '' });

  const loadInvoices = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const params = { page, limit: 20 };
      if (statusFilter) params.status = statusFilter;
      if (matchFilter) params.match_status = matchFilter;
      if (payFilter) params.payment_status = payFilter;
      const res = await api.listInvoices(params);
      setInvoices(res?.data || []);
      setPagination(res?.pagination || { page, limit: 20, total: 0 });
    } catch { /* */ }
    setLoading(false);
  }, [statusFilter, matchFilter, payFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadLookups = useCallback(async () => {
    try {
      const [vRes, poRes, baRes, ccRes] = await Promise.all([
        api.listVendors({ is_active: true }),
        api.listPOs({ status: 'APPROVED,PARTIALLY_RECEIVED,RECEIVED' }),
        api.listBankAccounts(),
        api.listCreditCards()
      ]);
      setVendors(vRes?.data || []);
      setPOs(poRes?.data || []);
      setBankAccounts(baRes?.data || []);
      setCreditCards(ccRes?.data || []);
    } catch { /* */ }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadInvoices(); }, [loadInvoices]);
  useEffect(() => { loadLookups(); }, [loadLookups]);

  const showMsg = (text, type = 'ok') => {
    setMsg({ text, type });
    setTimeout(() => setMsg({ text: '', type: '' }), 4000);
  };

  const openCreate = () => {
    setForm({ vendor_id: '', invoice_ref: '', invoice_date: new Date().toISOString().slice(0, 10), due_date: '', po_id: '', line_items: [{ ...EMPTY_LINE }] });
    setShowModal(true);
  };

  const addLine = () => setForm(f => ({ ...f, line_items: [...f.line_items, { ...EMPTY_LINE }] }));
  const removeLine = (i) => setForm(f => ({ ...f, line_items: f.line_items.filter((_, idx) => idx !== i) }));
  const setLineField = (i, key, val) => setForm(f => {
    const items = [...f.line_items];
    items[i] = { ...items[i], [key]: val };
    return { ...f, line_items: items };
  });

  const handleSave = async () => {
    try {
      await api.createInvoice(form);
      showMsg('Invoice created');
      setShowModal(false);
      loadInvoices();
    } catch (e) {
      showMsg(e.response?.data?.message || 'Error creating invoice', 'err');
    }
  };

  const handleValidate = async (id) => {
    try {
      const res = await api.validateInvoice(id, {});
      const ms = res?.data?.match_result;
      showMsg(`Match: ${ms?.overall_status} — ${ms?.matched_lines?.length || 0} matched, ${ms?.discrepancy_lines?.length || 0} discrepancies`);
      loadInvoices(pagination.page);
    } catch (e) {
      showMsg(e.response?.data?.message || 'Validation failed', 'err');
    }
  };

  const handlePost = async (id) => {
    try {
      await api.postInvoice(id);
      showMsg('Invoice posted — JE created');
      loadInvoices(pagination.page);
    } catch (e) {
      showMsg(e.response?.data?.message || 'Post failed', 'err');
    }
  };

  const openPay = (inv) => {
    setShowPay(inv);
    const remaining = (inv.total_amount || 0) - (inv.amount_paid || 0);
    setPayForm({ amount: Math.round(remaining * 100) / 100, payment_date: new Date().toISOString().slice(0, 10), payment_mode: '', bank_account_id: '', funding_card_id: '', check_no: '', reference: '' });
  };

  const handlePay = async () => {
    try {
      await api.payInvoice(showPay._id, payForm);
      showMsg('Payment recorded');
      setShowPay(null);
      loadInvoices(pagination.page);
    } catch (e) {
      showMsg(e.response?.data?.message || 'Payment failed', 'err');
    }
  };

  const fmt = (n) => (n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';

  return (
    <>
      <style>{styles}</style>
      <div className="si-page">
        <Navbar />
        <div style={{ display: 'flex' }}>
          <Sidebar />
          <main className="si-main">
            <div className="si-header">
              <h2>Supplier Invoices</h2>
              <button className="btn btn-primary" onClick={openCreate}>+ New Invoice</button>
            </div>

            <div className="si-filters">
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                <option value="">All Statuses</option>
                <option value="DRAFT">Draft</option>
                <option value="VALIDATED">Validated</option>
                <option value="POSTED">Posted</option>
              </select>
              <select value={matchFilter} onChange={e => setMatchFilter(e.target.value)}>
                <option value="">All Match</option>
                <option value="UNMATCHED">Unmatched</option>
                <option value="PARTIAL_MATCH">Partial</option>
                <option value="FULL_MATCH">Full Match</option>
                <option value="DISCREPANCY">Discrepancy</option>
              </select>
              <select value={payFilter} onChange={e => setPayFilter(e.target.value)}>
                <option value="">All Payment</option>
                <option value="UNPAID">Unpaid</option>
                <option value="PARTIAL">Partial</option>
                <option value="PAID">Paid</option>
              </select>
            </div>

            {msg.text && <div className={`si-msg si-msg-${msg.type}`}>{msg.text}</div>}

            {loading ? <p>Loading...</p> : invoices.length === 0 ? (
              <div className="si-empty">No supplier invoices found</div>
            ) : (
              <>
                <table className="si-table">
                  <thead>
                    <tr>
                      <th>Invoice Ref</th>
                      <th>Date</th>
                      <th>Vendor</th>
                      <th>PO #</th>
                      <th>Total</th>
                      <th>Match</th>
                      <th>Payment</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map(inv => (
                      <tr key={inv._id}>
                        <td style={{ fontWeight: 600 }}>{inv.invoice_ref}</td>
                        <td>{fmtDate(inv.invoice_date)}</td>
                        <td>{inv.vendor_id?.vendor_name || inv.vendor_name || '—'}</td>
                        <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{inv.po_number || '—'}</td>
                        <td style={{ fontWeight: 600 }}>{fmt(inv.total_amount)}</td>
                        <td><span className={`si-badge si-badge-${inv.match_status}`}>{inv.match_status?.replace(/_/g, ' ')}</span></td>
                        <td><span className={`si-badge si-badge-${inv.payment_status}`}>{inv.payment_status}</span></td>
                        <td><span className={`si-badge si-badge-${inv.status}`}>{inv.status}</span></td>
                        <td>
                          <div className="si-actions">
                            {inv.status === 'DRAFT' && <button className="btn btn-warning btn-sm" onClick={() => handleValidate(inv._id)}>Validate</button>}
                            {['DRAFT', 'VALIDATED'].includes(inv.status) && <button className="btn btn-success btn-sm" onClick={() => handlePost(inv._id)}>Post</button>}
                            {inv.status === 'POSTED' && inv.payment_status !== 'PAID' && <button className="btn btn-primary btn-sm" onClick={() => openPay(inv)}>Pay</button>}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {pagination.total > pagination.limit && (
                  <div className="si-pag">
                    <button className="btn btn-sm" disabled={pagination.page <= 1} onClick={() => loadInvoices(pagination.page - 1)}>Prev</button>
                    <span>Page {pagination.page} of {Math.ceil(pagination.total / pagination.limit)}</span>
                    <button className="btn btn-sm" disabled={pagination.page >= Math.ceil(pagination.total / pagination.limit)} onClick={() => loadInvoices(pagination.page + 1)}>Next</button>
                  </div>
                )}
              </>
            )}

            {/* Create Invoice Modal */}
            {showModal && (
              <div className="si-modal" onClick={() => setShowModal(false)}>
                <div className="si-modal-body" onClick={e => e.stopPropagation()}>
                  <h3>New Supplier Invoice</h3>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Vendor *</label>
                      <select value={form.vendor_id} onChange={e => setForm(f => ({ ...f, vendor_id: e.target.value }))}>
                        <option value="">Select vendor...</option>
                        {vendors.map(v => <option key={v._id} value={v._id}>{v.vendor_name}</option>)}
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Invoice Ref *</label>
                      <input value={form.invoice_ref} onChange={e => setForm(f => ({ ...f, invoice_ref: e.target.value }))} placeholder="Vendor invoice number" />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Invoice Date *</label>
                      <input type="date" value={form.invoice_date} onChange={e => setForm(f => ({ ...f, invoice_date: e.target.value }))} />
                    </div>
                    <div className="form-group">
                      <label>Due Date</label>
                      <input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} />
                    </div>
                  </div>
                  <div className="form-group">
                    <label>Link to PO (optional)</label>
                    <select value={form.po_id} onChange={e => setForm(f => ({ ...f, po_id: e.target.value }))}>
                      <option value="">No PO link</option>
                      {pos.filter(p => !form.vendor_id || p.vendor_id?._id === form.vendor_id || p.vendor_id === form.vendor_id).map(p => (
                        <option key={p._id} value={p._id}>{p.po_number} — {p.vendor_id?.vendor_name || ''}</option>
                      ))}
                    </select>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '14px 0 6px' }}>
                    <h4 style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>Line Items</h4>
                    <button className="btn btn-sm btn-primary" onClick={addLine}>+ Add Line</button>
                  </div>
                  <table className="line-items-table">
                    <thead><tr><th>Item Key</th><th style={{ width: 80 }}>Qty</th><th style={{ width: 100 }}>Unit Price</th><th style={{ width: 100 }}>Total</th><th style={{ width: 40 }}></th></tr></thead>
                    <tbody>
                      {form.line_items.map((line, i) => (
                        <tr key={i}>
                          <td><input value={line.item_key} onChange={e => setLineField(i, 'item_key', e.target.value)} placeholder="Item description" /></td>
                          <td><input type="number" min="1" value={line.qty_invoiced} onChange={e => setLineField(i, 'qty_invoiced', Number(e.target.value))} /></td>
                          <td><input type="number" min="0" step="0.01" value={line.unit_price} onChange={e => setLineField(i, 'unit_price', Number(e.target.value))} /></td>
                          <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt((line.qty_invoiced || 0) * (line.unit_price || 0))}</td>
                          <td><button className="btn btn-danger btn-sm" style={{ background: '#dc2626', color: '#fff' }} onClick={() => removeLine(i)} disabled={form.line_items.length <= 1}>x</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
                    <button className="btn" style={{ background: '#e2e8f0' }} onClick={() => setShowModal(false)}>Cancel</button>
                    <button className="btn btn-primary" onClick={handleSave}>Create Invoice</button>
                  </div>
                </div>
              </div>
            )}

            {/* Payment Modal */}
            {showPay && (
              <div className="si-modal" onClick={() => setShowPay(null)}>
                <div className="si-modal-body" style={{ width: 480 }} onClick={e => e.stopPropagation()}>
                  <h3>Record Payment — {showPay.invoice_ref}</h3>
                  <p style={{ fontSize: 13, color: '#64748b' }}>
                    Total: {fmt(showPay.total_amount)} | Paid: {fmt(showPay.amount_paid)} | Remaining: {fmt(showPay.total_amount - showPay.amount_paid)}
                  </p>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Amount *</label>
                      <input type="number" min="0.01" step="0.01" value={payForm.amount} onChange={e => setPayForm(f => ({ ...f, amount: Number(e.target.value) }))} />
                    </div>
                    <div className="form-group">
                      <label>Payment Date *</label>
                      <input type="date" value={payForm.payment_date} onChange={e => setPayForm(f => ({ ...f, payment_date: e.target.value }))} />
                    </div>
                  </div>
                  <div className="form-group">
                    <label>Payment Mode</label>
                    <select value={payForm.payment_mode} onChange={e => setPayForm(f => ({ ...f, payment_mode: e.target.value, funding_card_id: '', bank_account_id: '' }))}>
                      <option value="">Select...</option>
                      <option value="CASH">Cash</option>
                      <option value="CHECK">Check</option>
                      <option value="BANK_TRANSFER">Bank Transfer</option>
                      <option value="GCASH">GCash</option>
                      <option value="CARD">Credit Card</option>
                    </select>
                  </div>
                  {payForm.payment_mode === 'CHECK' && (
                    <div className="form-row">
                      <div className="form-group">
                        <label>Check No.</label>
                        <input value={payForm.check_no} onChange={e => setPayForm(f => ({ ...f, check_no: e.target.value }))} />
                      </div>
                      <div className="form-group">
                        <label>Bank Account</label>
                        <select value={payForm.bank_account_id} onChange={e => setPayForm(f => ({ ...f, bank_account_id: e.target.value }))}>
                          <option value="">Select bank...</option>
                          {bankAccounts.map(ba => <option key={ba._id} value={ba._id}>{ba.bank_name} ({ba.bank_code})</option>)}
                        </select>
                      </div>
                    </div>
                  )}
                  {payForm.payment_mode === 'BANK_TRANSFER' && (
                    <div className="form-row">
                      <div className="form-group">
                        <label>Bank Account</label>
                        <select value={payForm.bank_account_id} onChange={e => setPayForm(f => ({ ...f, bank_account_id: e.target.value }))}>
                          <option value="">Select bank...</option>
                          {bankAccounts.map(ba => <option key={ba._id} value={ba._id}>{ba.bank_name} ({ba.bank_code})</option>)}
                        </select>
                      </div>
                      <div className="form-group">
                        <label>Reference / Txn ID</label>
                        <input value={payForm.reference} onChange={e => setPayForm(f => ({ ...f, reference: e.target.value }))} />
                      </div>
                    </div>
                  )}
                  {payForm.payment_mode === 'CARD' && (
                    <div className="form-group">
                      <label>Credit Card</label>
                      <select value={payForm.funding_card_id} onChange={e => setPayForm(f => ({ ...f, funding_card_id: e.target.value }))}>
                        <option value="">Select card...</option>
                        {creditCards.map(cc => <option key={cc._id} value={cc._id}>{cc.card_name} ({cc.card_code})</option>)}
                      </select>
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
                    <button className="btn" style={{ background: '#e2e8f0' }} onClick={() => setShowPay(null)}>Cancel</button>
                    <button className="btn btn-success" onClick={handlePay}>Record Payment</button>
                  </div>
                </div>
              </div>
            )}
          </main>
        </div>
      </div>
    </>
  );
}
