import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import usePurchasing from '../hooks/usePurchasing';
import useInventory from '../hooks/useInventory';
import useProducts from '../hooks/useProducts';
import { showError } from '../utils/errorToast';

import SelectField from '../../components/common/Select';
import { useLookupOptions } from '../hooks/useLookups';
import WarehousePicker from '../components/WarehousePicker';
import WorkflowGuide from '../components/WorkflowGuide';
import RejectionBanner from '../components/RejectionBanner';

const styles = `
  .po-page { background: var(--erp-bg, #f4f7fb); min-height: 100vh; }
  .po-main { flex: 1; min-width: 0; overflow-y: auto; padding: 20px; max-width: 1300px; margin: 0 auto; }
  .po-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 8px; }
  .po-header h2 { font-size: 20px; font-weight: 700; margin: 0; }
  .po-filters { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 14px; align-items: center; }
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
  @media(max-width: 768px) { .po-main { padding: 12px; padding-bottom: calc(80px + env(safe-area-inset-bottom, 0px)); } .form-row { grid-template-columns: 1fr; } .po-modal-body { width: 95vw; } }
  @media(max-width: 375px) { .po-main { padding: 8px; padding-bottom: calc(80px + env(safe-area-inset-bottom, 0px)); } .po-main input, .po-main select { font-size: 16px; } }
`;

const EMPTY_LINE = { product_id: '', item_key: '', qty_ordered: 1, unit_price: 0, unit_code: '', purchase_uom: '', selling_uom: '', conversion_factor: 1 };

export default function PurchaseOrders() {
  const api = usePurchasing();
  const inventory = useInventory();
  const navigate = useNavigate();
  const { options: statusOpts } = useLookupOptions('PO_STATUS');
  const STATUSES = ['', ...statusOpts.map(o => o.code)];

  // Warehouse state
  const [warehouseId, setWarehouseId] = useState('');
  const [stockProducts, setStockProducts] = useState([]);
  const { products: allProducts, error: productsError, loading: productsLoading, refresh: refreshProducts } = useProducts();

  const [pos, setPOs] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0 });
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [vendorFilter, setVendorFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ vendor_id: '', warehouse_id: '', po_date: '', expected_delivery_date: '', notes: '', line_items: [{ ...EMPTY_LINE }] });
  const [msg, setMsg] = useState({ text: '', type: '' });
  const [showDetail, setShowDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Activity log state
  const [activityMsg, setActivityMsg] = useState('');
  const [activityWaybill, setActivityWaybill] = useState('');
  const [activitySaving, setActivitySaving] = useState(false);

  // Share & email state
  const [shareUrl, setShareUrl] = useState('');
  const [shareCopied, setShareCopied] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailTo, setEmailTo] = useState('');
  const [emailSending, setEmailSending] = useState(false);

  // Build product options from ProductMaster (PO = ordering new products, not selecting from stock)
  // Enrich with stock qty when warehouse is selected
  const stockMap = useMemo(() => {
    const m = new Map();
    stockProducts.forEach(sp => m.set(sp.product_id?.toString(), sp.total_qty || 0));
    return m;
  }, [stockProducts]);

  const productOptions = useMemo(() => {
    return allProducts
      .filter(p => p.is_active !== false)
      .map(p => {
        const stockQty = stockMap.get(p._id?.toString());
        const stockLabel = stockQty != null ? ` (stock: ${stockQty})` : '';
        return {
          product_id: p._id,
          label: `${p.brand_name || 'Unknown'}${p.dosage_strength ? ' ' + p.dosage_strength : ''}${stockLabel}`,
          brand_name: p.brand_name,
          dosage_strength: p.dosage_strength,
          unit_code: p.unit_code || p.sold_per || '',
          purchase_uom: p.purchase_uom || p.unit_code || p.sold_per || '',
          selling_uom: p.selling_uom || p.unit_code || p.sold_per || '',
          conversion_factor: p.conversion_factor || 1,
          purchase_price: p.purchase_price || 0,
          item_key: p.item_key || '',
          total_qty: stockQty || 0
        };
      });
  }, [allProducts, stockMap]);

  // Optionally load stock when warehouse changes (for enrichment only)
  useEffect(() => {
    if (!warehouseId) { setStockProducts([]); return; }
    inventory.getMyStock(null, null, warehouseId).then(res => {
      if (res?.data) setStockProducts(res.data);
    }).catch(() => setStockProducts([]));
  }, [warehouseId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleExport = async () => {
    try {
      const params = {};
      if (warehouseId) params.warehouse_id = warehouseId;
      const res = await api.exportPOs(params);
      const url = URL.createObjectURL(new Blob([res]));
      const a = document.createElement('a'); a.href = url; a.download = 'purchase-orders-export.xlsx'; a.click();
      URL.revokeObjectURL(url);
    } catch (err) { console.error(err); }
  };

  const loadPOs = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const params = { page, limit: 20 };
      if (statusFilter) params.status = statusFilter;
      if (warehouseId) params.warehouse_id = warehouseId;
      if (vendorFilter) params.vendor_id = vendorFilter;
      if (dateFrom) params.from = dateFrom;
      if (dateTo) params.to = dateTo;
      const res = await api.listPOs(params);
      setPOs(res?.data || []);
      setPagination(res?.pagination || { page, limit: 20, total: 0 });
    } catch (err) { showError(err, 'Could not load purchase orders'); }
    setLoading(false);
  }, [statusFilter, warehouseId, vendorFilter, dateFrom, dateTo]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadVendors = useCallback(async () => {
    try {
      const res = await api.listVendors({ is_active: true });
      setVendors(res?.data || []);
    } catch (err) { showError(err, 'Could not load vendors'); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadPOs(); }, [loadPOs]);
  useEffect(() => { loadVendors(); }, [loadVendors]);

  const showMsg = (text, type = 'ok') => {
    setMsg({ text, type });
    setTimeout(() => setMsg({ text: '', type: '' }), 4000);
  };

  const openCreate = () => {
    setEditing(null);
    setForm({ vendor_id: '', warehouse_id: warehouseId, po_date: new Date().toISOString().slice(0, 10), expected_delivery_date: '', notes: '', line_items: [{ ...EMPTY_LINE }] });
    setShowModal(true);
  };

  const openEdit = (po) => {
    setEditing(po);
    setForm({
      vendor_id: po.vendor_id?._id || po.vendor_id || '',
      warehouse_id: po.warehouse_id?._id || po.warehouse_id || warehouseId,
      po_date: po.po_date ? new Date(po.po_date).toISOString().slice(0, 10) : '',
      expected_delivery_date: po.expected_delivery_date ? new Date(po.expected_delivery_date).toISOString().slice(0, 10) : '',
      notes: po.notes || '',
      line_items: (po.line_items || []).map(l => {
        const prod = productOptions.find(p => p.product_id?.toString() === (l.product_id?.toString?.() || l.product_id));
        return { product_id: l.product_id || '', item_key: l.item_key || '', qty_ordered: l.qty_ordered || 1, unit_price: l.unit_price || 0, unit_code: prod?.unit_code || '' };
      })
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
    const p = productOptions.find(x => x.product_id === productId || x.product_id?.toString() === productId);
    if (!p) return;
    const label = `${p.brand_name}${p.dosage_strength ? ` ${p.dosage_strength}` : ''} — ${p.total_qty} ${p.unit_code}`.trim();
    setForm(f => {
      const items = [...f.line_items];
      items[i] = {
        ...items[i],
        product_id: productId,
        item_key: p.item_key || label,
        unit_price: p.purchase_price || 0,
        unit_code: p.purchase_uom || p.unit_code || '',
        purchase_uom: p.purchase_uom || p.unit_code || '',
        selling_uom: p.selling_uom || p.unit_code || '',
        conversion_factor: p.conversion_factor || 1
      };
      return { ...f, line_items: items };
    });
  };

  const computeTotal = () => form.line_items.reduce((s, l) => s + (l.qty_ordered || 0) * (l.unit_price || 0), 0);

  const handleSave = async () => {
    try {
      if (editing) {
        const result = await api.updatePO(editing._id, form);
        if (result?.approval_pending) {
          showMsg('PO edit sent for approval — pending authorization', 'info');
        } else {
          showMsg('PO updated');
        }
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
      if (action === 'approve') {
        const result = await api.approvePO(id);
        if (result?.approval_pending) {
          showMsg('PO sent for approval — pending authorization', 'info');
        } else {
          showMsg('PO approved');
        }
      }
      else if (action === 'cancel') {
        if (!window.confirm('Cancel this PO?')) return;
        await api.cancelPO(id); showMsg('PO cancelled');
      }
      loadPOs(pagination.page);
    } catch (e) {
      showMsg(e.response?.data?.message || 'Action failed', 'err');
    }
  };

  // Receive now redirects to GRN page with PO pre-selected
  const openReceive = (po) => {
    navigate(`/erp/grn?po_id=${po._id}`);
  };

  const openDetail = async (po) => {
    setDetailLoading(true);
    setShareUrl('');
    setShareCopied(false);
    setActivityMsg('');
    setActivityWaybill('');
    try {
      const res = await api.getPO(po._id);
      setShowDetail(res?.data || po);
    } catch {
      setShowDetail(po); // fallback to list data
    }
    setDetailLoading(false);
  };

  const handleAddActivity = async () => {
    if (!showDetail) return;
    if (!activityMsg.trim() && !activityWaybill.trim()) return;
    setActivitySaving(true);
    try {
      const res = await api.addPOActivity(showDetail._id, { message: activityMsg, courier_waybill: activityWaybill || undefined });
      setShowDetail(prev => ({ ...prev, activity_log: res?.data || prev.activity_log }));
      setActivityMsg('');
      setActivityWaybill('');
    } catch (e) { showMsg(e.response?.data?.message || 'Failed to add note', 'err'); }
    setActivitySaving(false);
  };

  const handleShareLink = async () => {
    if (!showDetail) return;
    try {
      const res = await api.generateShareLink(showDetail._id);
      const url = res?.data?.share_url || '';
      setShareUrl(url);
      if (url) {
        await navigator.clipboard.writeText(url);
        setShareCopied(true);
        setTimeout(() => setShareCopied(false), 3000);
      }
    } catch (e) { showMsg(e.response?.data?.message || 'Failed to generate share link', 'err'); }
  };

  const handleEmailPO = async () => {
    if (!emailTo || !showDetail) return;
    setEmailSending(true);
    try {
      await api.emailPO(showDetail._id, { to_email: emailTo });
      showMsg(`PO emailed to ${emailTo}`);
      setShowEmailModal(false);
      setEmailTo('');
    } catch (e) { showMsg(e.response?.data?.message || 'Failed to send email', 'err'); }
    setEmailSending(false);
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
            <WorkflowGuide pageKey="purchase-orders" />
            <div className="po-header">
              <h2>Purchase Orders</h2>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className="btn btn-outline" onClick={handleExport}>Export Excel</button>
                <button className="btn btn-primary" onClick={openCreate}>+ New PO</button>
              </div>
            </div>

            <div className="po-filters">
              <WarehousePicker value={warehouseId} onChange={setWarehouseId} filterType="PHARMA" compact allowAll />
              <SelectField value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                <option value="">All Statuses</option>
                {STATUSES.filter(Boolean).map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
              </SelectField>
              <SelectField value={vendorFilter} onChange={e => setVendorFilter(e.target.value)}>
                <option value="">All Vendors</option>
                {vendors.map(v => <option key={v._id} value={v._id}>{v.vendor_name}</option>)}
              </SelectField>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} title="From date" style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--erp-border, #e2e8f0)', fontSize: 12 }} />
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} title="To date" style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--erp-border, #e2e8f0)', fontSize: 12 }} />
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
                      <th>Warehouse</th>
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
                        <td style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: 12 }}><span style={{ cursor: 'pointer', color: 'var(--erp-accent, #1e5eff)', textDecoration: 'underline' }} onClick={() => openDetail(po)}>{po.po_number || '—'}</span></td>
                        <td>{fmtDate(po.po_date)}</td>
                        <td>{po.warehouse_id?.warehouse_code || '—'}</td>
                        <td>{po.vendor_id?.vendor_name || '—'}</td>
                        <td>{po.line_items?.length || 0}</td>
                        <td style={{ fontWeight: 600 }}>{fmt(po.total_amount)}</td>
                        <td>
                          <span className={`po-badge po-badge-${po.status}`}>{po.status?.replace(/_/g, ' ')}</span>
                          <div style={{ marginTop: 4 }}>
                            <RejectionBanner row={po} moduleKey="PURCHASING" variant="row" />
                          </div>
                        </td>
                        <td>
                          <div className="po-actions">
                            {po.status === 'DRAFT'
                              ? <button className="btn btn-primary btn-sm" onClick={() => openEdit(po)}>Edit</button>
                              : <button className="btn btn-outline-primary btn-sm" onClick={() => openEdit(po)} title="Minor edits (price, warehouse) — requires approval">Edit</button>
                            }
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
                  {editing && editing.status !== 'DRAFT' && (
                    <div style={{ background: '#fff3cd', color: '#856404', padding: '8px 12px', borderRadius: 6, fontSize: 12, marginBottom: 10 }}>
                      This PO is <strong>{editing.status}</strong> — only warehouse, expected delivery, notes, and unit prices can be edited. Changes require approval.
                    </div>
                  )}
                  <div className="form-row">
                    <div className="form-group">
                      <label>Vendor *</label>
                      <SelectField value={form.vendor_id} onChange={e => setForm(f => ({ ...f, vendor_id: e.target.value }))} disabled={editing && editing.status !== 'DRAFT'}>
                        <option value="">Select vendor...</option>
                        {vendors.map(v => <option key={v._id} value={v._id}>{v.vendor_name}</option>)}
                      </SelectField>
                    </div>
                    <div className="form-group">
                      <label>Warehouse *</label>
                      <WarehousePicker value={form.warehouse_id} onChange={v => setForm(f => ({ ...f, warehouse_id: v }))} filterType="PHARMA" />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>PO Date *</label>
                      <input type="date" value={form.po_date} onChange={e => setForm(f => ({ ...f, po_date: e.target.value }))} disabled={editing && editing.status !== 'DRAFT'} />
                    </div>
                    <div className="form-group">
                      <label>Expected Delivery</label>
                      <input type="date" value={form.expected_delivery_date} onChange={e => setForm(f => ({ ...f, expected_delivery_date: e.target.value }))} />
                    </div>
                  </div>
                  <div className="form-group">
                    <label>Notes</label>
                    <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '14px 0 6px' }}>
                    <h4 style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>Line Items</h4>
                    {!(editing && editing.status !== 'DRAFT') && <button className="btn btn-sm btn-primary" onClick={addLine}>+ Add Line</button>}
                  </div>
                  {productsError && (
                    <div style={{ background: '#fff3cd', color: '#856404', padding: '8px 12px', borderRadius: 6, fontSize: 12, marginBottom: 8 }}>
                      Failed to load products: {productsError}.{' '}
                      <button onClick={refreshProducts} style={{ background: 'none', border: 'none', color: '#0d6efd', cursor: 'pointer', textDecoration: 'underline', fontSize: 12 }}>Retry</button>
                    </div>
                  )}
                  {!productsError && !productsLoading && productOptions.length === 0 && (
                    <div style={{ background: '#f8d7da', color: '#842029', padding: '8px 12px', borderRadius: 6, fontSize: 12, marginBottom: 8 }}>
                      No products available. Check that products exist in the Product Master for this entity.
                    </div>
                  )}
                  <table className="line-items-table">
                    <thead>
                      <tr><th>Product</th><th style={{ width: 60 }}>Unit</th><th style={{ width: 80 }}>Qty</th><th style={{ width: 100 }}>Unit Price</th><th style={{ width: 100 }}>Total</th><th style={{ width: 40 }}></th></tr>
                    </thead>
                    <tbody>
                      {form.line_items.map((line, i) => (
                        <tr key={i}>
                          <td>
                            <SelectField value={line.product_id} onChange={e => handleProductSelect(i, e.target.value)} disabled={editing && editing.status !== 'DRAFT'}>
                              <option value="">Select product...</option>
                              {productOptions.map(p => <option key={p.product_id} value={p.product_id}>{p.label}</option>)}
                            </SelectField>
                            {!line.product_id && !(editing && editing.status !== 'DRAFT') && <input value={line.item_key} onChange={e => setLineField(i, 'item_key', e.target.value)} placeholder="Or type custom item..." style={{ marginTop: 4 }} />}
                          </td>
                          <td style={{ textAlign: 'center', fontSize: 11, fontWeight: 600, color: 'var(--erp-muted, #64748b)' }}>
                            {line.unit_code || '—'}
                            {line.conversion_factor > 1 && <div style={{ fontSize: 10, fontWeight: 400, color: '#92400e' }}>1 {line.purchase_uom} = {line.conversion_factor} {line.selling_uom}</div>}
                          </td>
                          <td><input type="number" min="1" value={line.qty_ordered} onChange={e => setLineField(i, 'qty_ordered', Number(e.target.value))} disabled={editing && editing.status !== 'DRAFT'} /></td>
                          <td><input type="number" min="0" step="0.01" value={line.unit_price} onChange={e => setLineField(i, 'unit_price', Number(e.target.value))} /></td>
                          <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt((line.qty_ordered || 0) * (line.unit_price || 0))}</td>
                          <td>{!(editing && editing.status !== 'DRAFT') && <button className="btn btn-danger btn-sm" onClick={() => removeLine(i)} disabled={form.line_items.length <= 1}>x</button>}</td>
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

            {/* PO Detail Modal */}
            {showDetail && (
              <div className="po-modal" onClick={() => setShowDetail(null)}>
                <div className="po-modal-body" onClick={e => e.stopPropagation()} style={{ width: 800 }}>
                  {detailLoading ? <p>Loading...</p> : (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                        <div>
                          <h3 style={{ margin: 0, fontSize: 18 }}>PO {showDetail.po_number || '—'}</h3>
                          <span className={`po-badge po-badge-${showDetail.status}`} style={{ marginTop: 4, display: 'inline-block' }}>{showDetail.status?.replace(/_/g, ' ')}</span>
                        </div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <button className="btn btn-sm" style={{ background: '#2563eb', color: 'white' }} onClick={() => window.open(`/api/erp/print/purchase-order/${showDetail._id}`, '_blank')}>Print / PDF</button>
                          <button className="btn btn-sm" style={{ background: '#7c3aed', color: 'white' }} onClick={handleShareLink}>{shareCopied ? 'Copied!' : 'Share Link'}</button>
                          <button className="btn btn-sm" style={{ background: '#0891b2', color: 'white' }} onClick={() => setShowEmailModal(true)}>Email PO</button>
                          <button className="btn btn-sm" style={{ background: '#e2e8f0' }} onClick={() => setShowDetail(null)}>Close</button>
                        </div>
                      </div>
                      <RejectionBanner
                        row={showDetail}
                        moduleKey="PURCHASING"
                        variant="page"
                        docLabel={`PO ${showDetail.po_number || ''}`}
                        onResubmit={(row) => { setShowDetail(null); openEdit(row); }}
                      />

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 20px', fontSize: 13, marginBottom: 16, background: '#f8fafc', padding: 12, borderRadius: 8 }}>
                        <div><strong>Vendor:</strong> {showDetail.vendor_id?.vendor_name || '—'} {showDetail.vendor_id?.vendor_code ? `(${showDetail.vendor_id.vendor_code})` : ''}</div>
                        <div><strong>Warehouse:</strong> {showDetail.warehouse_id?.warehouse_code || '—'} {showDetail.warehouse_id?.warehouse_name ? `— ${showDetail.warehouse_id.warehouse_name}` : ''}</div>
                        {(showDetail.warehouse_id?.location?.address || showDetail.warehouse_id?.location?.city || showDetail.warehouse_id?.location?.region) && (
                          <div style={{ gridColumn: '1 / -1' }}><strong>Delivery Address:</strong> {[showDetail.warehouse_id?.location?.address, showDetail.warehouse_id?.location?.city, showDetail.warehouse_id?.location?.region].filter(Boolean).join(', ')}</div>
                        )}
                        {(showDetail.warehouse_id?.contact_person || showDetail.warehouse_id?.contact_phone) && (
                          <div style={{ gridColumn: '1 / -1' }}><strong>Contact:</strong> {showDetail.warehouse_id?.contact_person || ''}{showDetail.warehouse_id?.contact_person && showDetail.warehouse_id?.contact_phone ? ' — ' : ''}{showDetail.warehouse_id?.contact_phone || ''}</div>
                        )}
                        <div><strong>PO Date:</strong> {fmtDate(showDetail.po_date)}</div>
                        <div><strong>Expected Delivery:</strong> {fmtDate(showDetail.expected_delivery_date)}</div>
                        <div><strong>Created By:</strong> {showDetail.created_by?.firstName ? `${showDetail.created_by.firstName} ${showDetail.created_by.lastName || ''}`.trim() : '—'}</div>
                        <div><strong>Approved By:</strong> {showDetail.approved_by?.firstName ? `${showDetail.approved_by.firstName} ${showDetail.approved_by.lastName || ''}`.trim() : '—'} {showDetail.approved_at ? `on ${fmtDate(showDetail.approved_at)}` : ''}</div>
                        {showDetail.notes && <div style={{ gridColumn: '1 / -1' }}><strong>Notes:</strong> {showDetail.notes}</div>}
                      </div>

                      <h4 style={{ fontSize: 13, fontWeight: 600, margin: '0 0 6px' }}>Line Items</h4>
                      <table className="line-items-table">
                        <thead>
                          <tr><th>Product</th><th>Unit</th><th style={{ width: 70 }}>Ordered</th><th style={{ width: 70 }}>Received</th><th style={{ width: 70 }}>Invoiced</th><th style={{ width: 90 }}>Unit Price</th><th style={{ width: 90 }}>Total</th></tr>
                        </thead>
                        <tbody>
                          {(showDetail.line_items || []).map((line, i) => (
                            <tr key={i}>
                              <td>{line.item_key || line.product_id}</td>
                              <td style={{ textAlign: 'center', fontSize: 11, fontWeight: 600, color: '#64748b' }}>{productOptions.find(p => p.product_id?.toString() === line.product_id?.toString())?.unit_code || '—'}</td>
                              <td style={{ textAlign: 'center' }}>{line.qty_ordered}</td>
                              <td style={{ textAlign: 'center' }}>{line.qty_received || 0}</td>
                              <td style={{ textAlign: 'center' }}>{line.qty_invoiced || 0}</td>
                              <td style={{ textAlign: 'right' }}>{fmt(line.unit_price)}</td>
                              <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(line.line_total || (line.qty_ordered || 0) * (line.unit_price || 0))}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>

                      <div className="po-totals" style={{ marginTop: 10 }}>
                        <div className="po-totals-row"><span>Total Amount:</span><strong>{fmt(showDetail.total_amount)}</strong></div>
                        <div className="po-totals-row"><span>Net of VAT:</span><span>{fmt(showDetail.net_amount)}</span></div>
                        <div className="po-totals-row"><span>VAT:</span><span>{fmt(showDetail.vat_amount)}</span></div>
                      </div>

                      {/* Cross-Document References */}
                      {showDetail.linked_invoices && showDetail.linked_invoices.length > 0 && (
                        <div style={{ marginTop: 16 }}>
                          <h4 style={{ fontSize: 13, fontWeight: 600, margin: '0 0 6px' }}>Linked Supplier Invoices</h4>
                          <table className="line-items-table">
                            <thead>
                              <tr><th>Invoice Ref</th><th>Date</th><th>Status</th><th>Match</th><th>Payment</th><th style={{ width: 100 }}>Amount</th></tr>
                            </thead>
                            <tbody>
                              {showDetail.linked_invoices.map((inv, i) => (
                                <tr key={i}>
                                  <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{inv.invoice_ref || '—'}</td>
                                  <td>{fmtDate(inv.invoice_date)}</td>
                                  <td><span className={`si-badge si-badge-${inv.status}`} style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600 }}>{inv.status}</span></td>
                                  <td><span className={`si-badge si-badge-${inv.match_status}`} style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600 }}>{inv.match_status?.replace(/_/g, ' ') || 'UNMATCHED'}</span></td>
                                  <td><span className={`si-badge si-badge-${inv.payment_status}`} style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600 }}>{inv.payment_status || 'UNPAID'}</span></td>
                                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(inv.total_amount)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                      {showDetail.linked_invoices && showDetail.linked_invoices.length === 0 && (
                        <div style={{ marginTop: 16, fontSize: 12, color: '#64748b', fontStyle: 'italic' }}>No supplier invoices linked to this PO yet.</div>
                      )}

                      {/* Linked GRNs */}
                      {showDetail.linked_grns && showDetail.linked_grns.length > 0 && (
                        <div style={{ marginTop: 16 }}>
                          <h4 style={{ fontSize: 13, fontWeight: 600, margin: '0 0 6px' }}>Linked GRNs</h4>
                          <table className="line-items-table">
                            <thead>
                              <tr><th>GRN Date</th><th>Status</th><th>Items</th><th>Total Qty</th><th>Reviewed By</th></tr>
                            </thead>
                            <tbody>
                              {showDetail.linked_grns.map((g, i) => (
                                <tr key={i}>
                                  <td>{fmtDate(g.grn_date)}</td>
                                  <td><span className={`po-badge po-badge-${g.status === 'APPROVED' ? 'RECEIVED' : g.status === 'REJECTED' ? 'CANCELLED' : 'DRAFT'}`}>{g.status}</span></td>
                                  <td>{g.line_items?.length || 0}</td>
                                  <td>{(g.line_items || []).reduce((s, li) => s + (li.qty || 0), 0)}</td>
                                  <td>{g.reviewed_by?.name || '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                      {showDetail.linked_grns && showDetail.linked_grns.length === 0 && (
                        <div style={{ marginTop: 16, fontSize: 12, color: '#64748b', fontStyle: 'italic' }}>No GRNs linked to this PO yet.</div>
                      )}

                      {/* Share URL display */}
                      {shareUrl && (
                        <div style={{ marginTop: 12, padding: '8px 12px', background: '#f0fdf4', borderRadius: 8, fontSize: 12 }}>
                          <strong>Share Link:</strong>{' '}
                          <span style={{ fontFamily: 'monospace', wordBreak: 'break-all', fontSize: 11 }}>{shareUrl}</span>
                          <button className="btn btn-sm" style={{ marginLeft: 8, background: '#e2e8f0', fontSize: 11 }} onClick={() => { navigator.clipboard.writeText(shareUrl); setShareCopied(true); setTimeout(() => setShareCopied(false), 2000); }}>{shareCopied ? 'Copied!' : 'Copy'}</button>
                        </div>
                      )}

                      {/* Activity Log */}
                      <div style={{ marginTop: 20 }}>
                        <h4 style={{ fontSize: 13, fontWeight: 600, margin: '0 0 8px' }}>Activity Log</h4>
                        {(showDetail.activity_log && showDetail.activity_log.length > 0) ? (
                          <div style={{ maxHeight: 220, overflowY: 'auto', marginBottom: 12 }}>
                            {[...showDetail.activity_log].reverse().map((a, i) => (
                              <div key={a._id || i} style={{ padding: '8px 10px', marginBottom: 6, background: '#f8fafc', borderRadius: 8, fontSize: 12, borderLeft: '3px solid #94a3b8' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                                  <span style={{ fontWeight: 600 }}>{a.created_by?.firstName ? `${a.created_by.firstName} ${a.created_by.lastName || ''}`.trim() : '—'}</span>
                                  <span style={{ color: '#64748b', fontSize: 11 }}>{fmtDate(a.created_at)} <span className={`po-badge po-badge-${a.status_snapshot}`} style={{ fontSize: 10, padding: '1px 6px' }}>{a.status_snapshot}</span></span>
                                </div>
                                <div>{a.message}</div>
                                {a.courier_waybill && <div style={{ marginTop: 3, fontWeight: 600, color: '#7c3aed', fontSize: 11 }}>Waybill: {a.courier_waybill}</div>}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div style={{ fontSize: 12, color: '#64748b', fontStyle: 'italic', marginBottom: 10 }}>No activity notes yet.</div>
                        )}
                        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                          <div style={{ flex: 1, minWidth: 180 }}>
                            <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 2 }}>Note</label>
                            <textarea rows={2} value={activityMsg} onChange={e => setActivityMsg(e.target.value)} placeholder="Status update, delivery info... (optional if waybill is filled)" style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--erp-border, #e2e8f0)', fontSize: 12, resize: 'vertical', boxSizing: 'border-box' }} />
                          </div>
                          <div style={{ width: 160 }}>
                            <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 2 }}>Courier Waybill</label>
                            <input value={activityWaybill} onChange={e => setActivityWaybill(e.target.value)} placeholder="Tracking #" style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--erp-border, #e2e8f0)', fontSize: 12, boxSizing: 'border-box' }} />
                          </div>
                          <button className="btn btn-primary btn-sm" onClick={handleAddActivity} disabled={activitySaving || (!activityMsg.trim() && !activityWaybill.trim())} style={{ height: 34 }}>{activitySaving ? 'Saving...' : 'Add Note'}</button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Email PO Modal */}
            {showEmailModal && (
              <div className="po-modal" onClick={() => setShowEmailModal(false)}>
                <div className="po-modal-body" onClick={e => e.stopPropagation()} style={{ width: 420 }}>
                  <h3 style={{ marginBottom: 12 }}>Email Purchase Order</h3>
                  <div className="form-group">
                    <label>Recipient Email *</label>
                    <input type="email" value={emailTo} onChange={e => setEmailTo(e.target.value)} placeholder="vendor@example.com" />
                  </div>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
                    <button className="btn" style={{ background: '#e2e8f0' }} onClick={() => setShowEmailModal(false)}>Cancel</button>
                    <button className="btn btn-primary" onClick={handleEmailPO} disabled={emailSending || !emailTo}>{emailSending ? 'Sending...' : 'Send'}</button>
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
