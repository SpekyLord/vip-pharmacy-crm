import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import usePurchasing from '../hooks/usePurchasing';
import useProducts from '../hooks/useProducts';

import SelectField from '../../components/common/Select';

const styles = `
  .po-page { background: var(--erp-bg, #f4f7fb); min-height: 100vh; }
  .po-main { flex: 1; min-width: 0; overflow-y: auto; padding: 20px; max-width: 1300px; margin: 0 auto; }
  .po-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 8px; }
  .po-header h2 { font-size: 20px; font-weight: 700; margin: 0; }
  .po-filters { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 14px; }
  .po-filters select, .po-filters input { padding: 6px 10px; border-radius: 6px; border: 1px solid var(--erp-border, #e2e8f0); font-size: 12px; }
  .btn { padding: 6px 14px; border-radius: 6px; border: none; cursor: pointer; font-size: 13px; font-weight: 500; }
  .btn-primary { background: var(--erp-accent, #1e5eff); color: #fff; }
  .btn-success { background: #16a34a; color: #fff; }
  .btn-warning { background: #f59e0b; color: #fff; }
  .btn-danger { background: #dc2626; color: #fff; }
  .btn-sm { padding: 4px 10px; font-size: 12px; }
  .btn-outline { background: transparent; border: 1px solid var(--erp-border, #e2e8f0); color: var(--erp-text); }
  .po-table { width: 100%; border-collapse: collapse; background: var(--erp-panel, #fff); border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,.06); }
  .po-table th, .po-table td { padding: 10px 12px; text-align: left; font-size: 13px; border-bottom: 1px solid var(--erp-border, #f1f5f9); }
  .po-table th { background: var(--erp-accent-soft, #e8efff); font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: .5px; color: var(--erp-muted, #64748b); }
  .po-badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 600; }
  .po-badge-DRAFT { background: #e2e8f0; color: #475569; }
  .po-badge-APPROVED { background: #dbeafe; color: #1e40af; }
  .po-badge-PARTIALLY_RECEIVED { background: #fef3c7; color: #92400e; }
  .po-badge-RECEIVED { background: #dcfce7; color: #166534; }
  .po-badge-CLOSED { background: #e0e7ff; color: #3730a3; }
  .po-badge-CANCELLED { background: #fee2e2; color: #dc2626; }
  .po-modal { position: fixed; inset: 0; background: rgba(0,0,0,.4); display: flex; align-items: center; justify-content: center; z-index: 100; }
  .po-modal-body { background: var(--erp-panel, #fff); border-radius: 12px; padding: 24px; width: 700px; max-width: 95vw; max-height: 90vh; overflow-y: auto; }
  .po-modal-body h3 { margin: 0 0 16px; font-size: 16px; }
  .form-group { margin-bottom: 12px; }
  .form-group label { display: block; font-size: 12px; font-weight: 600; margin-bottom: 4px; color: var(--erp-muted); }
  .form-group input, .form-group select { width: 100%; padding: 8px 10px; border-radius: 6px; border: 1px solid var(--erp-border); font-size: 13px; box-sizing: border-box; }
  .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .line-items-table { width: 100%; border-collapse: collapse; margin: 8px 0; font-size: 12px; }
  .line-items-table th, .line-items-table td { padding: 6px 8px; border: 1px solid var(--erp-border, #e2e8f0); }
  .line-items-table th { background: #f8fafc; font-weight: 600; }
  .line-items-table input { width: 100%; padding: 4px 6px; border: 1px solid var(--erp-border); border-radius: 4px; font-size: 12px; box-sizing: border-box; }
  .po-totals { background: var(--erp-accent-soft, #e8efff); padding: 10px 14px; border-radius: 8px; margin-top: 10px; font-size: 13px; }
  .po-totals-row { display: flex; justify-content: space-between; padding: 2px 0; }
  .po-msg { font-size: 13px; margin-bottom: 12px; padding: 8px 12px; border-radius: 8px; }
  .po-msg-ok { background: #dcfce7; color: #166534; }
  .po-msg-err { background: #fee2e2; color: #dc2626; }
  .po-empty { text-align: center; color: #64748b; padding: 40px; }
  .po-actions { display: flex; gap: 4px; }
  .po-pag { display: flex; justify-content: center; gap: 8px; margin-top: 14px; align-items: center; font-size: 13px; }
  @media(max-width: 768px) { .po-main { padding: 12px; padding-bottom: calc(80px + env(safe-area-inset-bottom, 0px)); } .form-row { grid-template-columns: 1fr; } .po-modal-body { width: 95vw; } }
  @media(max-width: 375px) { .po-main { padding: 8px; padding-bottom: calc(80px + env(safe-area-inset-bottom, 0px)); } .po-main input, .po-main select { font-size: 16px; } }
`;

const STATUSES = ['', 'DRAFT', 'APPROVED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CLOSED', 'CANCELLED'];

const EMPTY_LINE = { product_id: '', item_key: '', qty_ordered: 1, unit_price: 0 };

export default function PurchaseOrders() {
  const api = usePurchasing();
  const { products } = useProducts();
  const productOptions = useMemo(() => (products || []).filter(p => p.is_active !== false), [products]);

  const [pos, setPOs] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0 });
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ vendor_id: '', po_date: '', expected_delivery_date: '', notes: '', line_items: [{ ...EMPTY_LINE }] });
  const [msg, setMsg] = useState({ text: '', type: '' });
  const [showReceive, setShowReceive] = useState(null);
  const [receiveQtys, setReceiveQtys] = useState([]);

  const handleExport = async () => {
    try {
      const res = await api.exportPOs();
      const url = URL.createObjectURL(new Blob([res]));
      const a = document.createElement('a'); a.href = url; a.download = 'purchase-orders-export.xlsx'; a.click();
      URL.revokeObjectURL(url);
    } catch { /* hook handles */ }
  };

  const loadPOs = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const params = { page, limit: 20 };
      if (statusFilter) params.status = statusFilter;
      const res = await api.listPOs(params);
      setPOs(res?.data || []);
      setPagination(res?.pagination || { page, limit: 20, total: 0 });
    } catch { /* */ }
    setLoading(false);
  }, [statusFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadVendors = useCallback(async () => {
    try {
      const res = await api.listVendors({ is_active: true });
      setVendors(res?.data || []);
    } catch { /* */ }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadPOs(); }, [loadPOs]);
  useEffect(() => { loadVendors(); }, [loadVendors]);

  const showMsg = (text, type = 'ok') => {
    setMsg({ text, type });
    setTimeout(() => setMsg({ text: '', type: '' }), 4000);
  };

  const openCreate = () => {
    setEditing(null);
    setForm({ vendor_id: '', po_date: new Date().toISOString().slice(0, 10), expected_delivery_date: '', notes: '', line_items: [{ ...EMPTY_LINE }] });
    setShowModal(true);
  };

  const openEdit = (po) => {
    setEditing(po);
    setForm({
      vendor_id: po.vendor_id?._id || po.vendor_id || '',
      po_date: po.po_date ? new Date(po.po_date).toISOString().slice(0, 10) : '',
      expected_delivery_date: po.expected_delivery_date ? new Date(po.expected_delivery_date).toISOString().slice(0, 10) : '',
      notes: po.notes || '',
      line_items: (po.line_items || []).map(l => ({ product_id: l.product_id || '', item_key: l.item_key || '', qty_ordered: l.qty_ordered || 1, unit_price: l.unit_price || 0 }))
    });
    setShowModal(true);
  };

  const addLine = () => setForm(f => ({ ...f, line_items: [...f.line_items, { ...EMPTY_LINE }] }));
  const removeLine = (i) => setForm(f => ({ ...f, line_items: f.line_items.filter((_, idx) => idx !== i) }));
  const setLineField = (i, key, val) => setForm(f => {
    const items = [...f.line_items];
    items[i] = { ...items[i], [key]: val };
    return { ...f, line_items: items };
  });
  const handleProductSelect = (i, productId) => {
    if (!productId) { setLineField(i, 'product_id', ''); return; }
    const p = productOptions.find(x => x._id === productId);
    if (!p) return;
    const label = `${p.brand_name}${p.dosage_strength ? ` ${p.dosage_strength}` : ''} — ${p.qty || ''} ${p.unit_code || 'PC'}`.trim();
    setForm(f => {
      const items = [...f.line_items];
      items[i] = { ...items[i], product_id: productId, item_key: label };
      return { ...f, line_items: items };
    });
  };

  const computeTotal = () => form.line_items.reduce((s, l) => s + (l.qty_ordered || 0) * (l.unit_price || 0), 0);

  const handleSave = async () => {
    try {
      if (editing) {
        await api.updatePO(editing._id, form);
        showMsg('PO updated');
      } else {
        await api.createPO(form);
        showMsg('PO created');
      }
      setShowModal(false);
      loadPOs();
    } catch (e) {
      showMsg(e.response?.data?.message || 'Error saving PO', 'err');
    }
  };

  const handleAction = async (id, action) => {
    try {
      if (action === 'approve') { await api.approvePO(id); showMsg('PO approved'); }
      else if (action === 'cancel') {
        if (!window.confirm('Cancel this PO?')) return;
        await api.cancelPO(id); showMsg('PO cancelled');
      }
      loadPOs(pagination.page);
    } catch (e) {
      showMsg(e.response?.data?.message || 'Action failed', 'err');
    }
  };

  const openReceive = (po) => {
    setShowReceive(po);
    setReceiveQtys(po.line_items.map(l => ({ product_id: l.product_id, qty_received: 0 })));
  };

  const handleReceive = async () => {
    try {
      const receipts = receiveQtys.filter(r => r.qty_received > 0);
      if (!receipts.length) return showMsg('Enter quantities to receive', 'err');
      await api.receivePO(showReceive._id, { receipts });
      showMsg('Receipt recorded');
      setShowReceive(null);
      loadPOs(pagination.page);
    } catch (e) {
      showMsg(e.response?.data?.message || 'Receive failed', 'err');
    }
  };

  const fmt = (n) => (n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';

  return (
    <>
      <style>{styles}</style>
      <div className="po-page">
        <Navbar />
        <div style={{ display: 'flex' }}>
          <Sidebar />
          <main className="po-main">
            <div className="po-header">
              <h2>Purchase Orders</h2>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className="btn btn-outline" onClick={handleExport}>Export Excel</button>
                <button className="btn btn-primary" onClick={openCreate}>+ New PO</button>
              </div>
            </div>

            <div className="po-filters">
              <SelectField value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                <option value="">All Statuses</option>
                {STATUSES.filter(Boolean).map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
              </SelectField>
            </div>

            {msg.text && <div className={`po-msg po-msg-${msg.type}`}>{msg.text}</div>}

            {loading ? <p>Loading...</p> : pos.length === 0 ? (
              <div className="po-empty">No purchase orders found</div>
            ) : (
              <>
                <table className="po-table">
                  <thead>
                    <tr>
                      <th>PO #</th>
                      <th>Date</th>
                      <th>Vendor</th>
                      <th>Items</th>
                      <th>Total</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pos.map(po => (
                      <tr key={po._id}>
                        <td style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: 12 }}>{po.po_number || '—'}</td>
                        <td>{fmtDate(po.po_date)}</td>
                        <td>{po.vendor_id?.vendor_name || '—'}</td>
                        <td>{po.line_items?.length || 0}</td>
                        <td style={{ fontWeight: 600 }}>{fmt(po.total_amount)}</td>
                        <td><span className={`po-badge po-badge-${po.status}`}>{po.status?.replace(/_/g, ' ')}</span></td>
                        <td>
                          <div className="po-actions">
                            {po.status === 'DRAFT' && <button className="btn btn-primary btn-sm" onClick={() => openEdit(po)}>Edit</button>}
                            {po.status === 'DRAFT' && <button className="btn btn-success btn-sm" onClick={() => handleAction(po._id, 'approve')}>Approve</button>}
                            {['APPROVED', 'PARTIALLY_RECEIVED'].includes(po.status) && <button className="btn btn-warning btn-sm" onClick={() => openReceive(po)}>Receive</button>}
                            {['DRAFT', 'APPROVED'].includes(po.status) && <button className="btn btn-danger btn-sm" onClick={() => handleAction(po._id, 'cancel')}>Cancel</button>}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {pagination.total > pagination.limit && (
                  <div className="po-pag">
                    <button className="btn btn-sm" disabled={pagination.page <= 1} onClick={() => loadPOs(pagination.page - 1)}>Prev</button>
                    <span>Page {pagination.page} of {Math.ceil(pagination.total / pagination.limit)}</span>
                    <button className="btn btn-sm" disabled={pagination.page >= Math.ceil(pagination.total / pagination.limit)} onClick={() => loadPOs(pagination.page + 1)}>Next</button>
                  </div>
                )}
              </>
            )}

            {/* Create/Edit PO Modal */}
            {showModal && (
              <div className="po-modal" onClick={() => setShowModal(false)}>
                <div className="po-modal-body" onClick={e => e.stopPropagation()}>
                  <h3>{editing ? 'Edit PO' : 'New Purchase Order'}</h3>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Vendor *</label>
                      <SelectField value={form.vendor_id} onChange={e => setForm(f => ({ ...f, vendor_id: e.target.value }))}>
                        <option value="">Select vendor...</option>
                        {vendors.map(v => <option key={v._id} value={v._id}>{v.vendor_name}</option>)}
                      </SelectField>
                    </div>
                    <div className="form-group">
                      <label>PO Date *</label>
                      <input type="date" value={form.po_date} onChange={e => setForm(f => ({ ...f, po_date: e.target.value }))} />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Expected Delivery</label>
                      <input type="date" value={form.expected_delivery_date} onChange={e => setForm(f => ({ ...f, expected_delivery_date: e.target.value }))} />
                    </div>
                    <div className="form-group">
                      <label>Notes</label>
                      <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '14px 0 6px' }}>
                    <h4 style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>Line Items</h4>
                    <button className="btn btn-sm btn-primary" onClick={addLine}>+ Add Line</button>
                  </div>
                  <table className="line-items-table">
                    <thead>
                      <tr><th>Product</th><th style={{ width: 80 }}>Qty</th><th style={{ width: 100 }}>Unit Price</th><th style={{ width: 100 }}>Total</th><th style={{ width: 40 }}></th></tr>
                    </thead>
                    <tbody>
                      {form.line_items.map((line, i) => (
                        <tr key={i}>
                          <td>
                            <SelectField value={line.product_id} onChange={e => handleProductSelect(i, e.target.value)}>
                              <option value="">Select product...</option>
                              {productOptions.map(p => <option key={p._id} value={p._id}>{p.brand_name}{p.dosage_strength ? ` ${p.dosage_strength}` : ''} — {p.qty || ''} {p.unit_code || 'PC'}</option>)}
                            </SelectField>
                            {!line.product_id && <input value={line.item_key} onChange={e => setLineField(i, 'item_key', e.target.value)} placeholder="Or type custom item..." style={{ marginTop: 4 }} />}
                          </td>
                          <td><input type="number" min="1" value={line.qty_ordered} onChange={e => setLineField(i, 'qty_ordered', Number(e.target.value))} /></td>
                          <td><input type="number" min="0" step="0.01" value={line.unit_price} onChange={e => setLineField(i, 'unit_price', Number(e.target.value))} /></td>
                          <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt((line.qty_ordered || 0) * (line.unit_price || 0))}</td>
                          <td><button className="btn btn-danger btn-sm" onClick={() => removeLine(i)} disabled={form.line_items.length <= 1}>x</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <div className="po-totals">
                    <div className="po-totals-row"><span>Total Amount:</span><strong>{fmt(computeTotal())}</strong></div>
                    <div className="po-totals-row"><span>Net of VAT:</span><span>{fmt(computeTotal() * 100 / 112)}</span></div>
                    <div className="po-totals-row"><span>VAT (12%):</span><span>{fmt(computeTotal() - computeTotal() * 100 / 112)}</span></div>
                  </div>

                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
                    <button className="btn" style={{ background: '#e2e8f0' }} onClick={() => setShowModal(false)}>Cancel</button>
                    <button className="btn btn-primary" onClick={handleSave}>{editing ? 'Update' : 'Create PO'}</button>
                  </div>
                </div>
              </div>
            )}

            {/* Receive Modal */}
            {showReceive && (
              <div className="po-modal" onClick={() => setShowReceive(null)}>
                <div className="po-modal-body" onClick={e => e.stopPropagation()}>
                  <h3>Receive Goods — {showReceive.po_number}</h3>
                  <table className="line-items-table">
                    <thead>
                      <tr><th>Item</th><th>Ordered</th><th>Already Rcvd</th><th>Receive Now</th></tr>
                    </thead>
                    <tbody>
                      {showReceive.line_items.map((line, i) => (
                        <tr key={i}>
                          <td>{line.item_key || line.product_id}</td>
                          <td>{line.qty_ordered}</td>
                          <td>{line.qty_received || 0}</td>
                          <td>
                            <input type="number" min="0" max={line.qty_ordered - (line.qty_received || 0)}
                              value={receiveQtys[i]?.qty_received || 0}
                              onChange={e => {
                                const val = Math.min(Number(e.target.value), line.qty_ordered - (line.qty_received || 0));
                                setReceiveQtys(q => { const copy = [...q]; copy[i] = { ...copy[i], qty_received: val }; return copy; });
                              }}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
                    <button className="btn" style={{ background: '#e2e8f0' }} onClick={() => setShowReceive(null)}>Cancel</button>
                    <button className="btn btn-success" onClick={handleReceive}>Confirm Receipt</button>
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
