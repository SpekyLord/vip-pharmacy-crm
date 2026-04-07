import { useState, useEffect, useCallback } from 'react';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import Pagination from '../../components/common/Pagination';
import { useAuth } from '../../hooks/useAuth';
import useTransfers from '../hooks/useTransfers';
import useProducts from '../hooks/useProducts';
import useInventory from '../hooks/useInventory';
import useWarehouses from '../hooks/useWarehouses';

import SelectField from '../../components/common/Select';
import WorkflowGuide from '../components/WorkflowGuide';
import { showError } from '../utils/errorToast';

const STATUS_COLORS = {
  DRAFT: { bg: '#e2e8f0', text: '#475569' },
  APPROVED: { bg: '#dbeafe', text: '#1e40af' },
  SHIPPED: { bg: '#fed7aa', text: '#9a3412' },
  RECEIVED: { bg: '#dcfce7', text: '#166534' },
  POSTED: { bg: '#064e3b', text: '#fff' },
  CANCELLED: { bg: '#fecaca', text: '#991b1b' },
  PENDING: { bg: '#fef3c7', text: '#92400e' },
  REJECTED: { bg: '#fecaca', text: '#991b1b' }
};

const pageStyles = `
  .transfers-page { background: var(--erp-bg, #f4f7fb); }
  .transfers-main { flex:1; min-width:0; overflow-y:auto; -webkit-overflow-scrolling:touch; padding:24px; }
  .transfers-inner { max-width:1200px; margin:0 auto; }
  .transfers-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; flex-wrap:wrap; gap:12px; }
  .transfers-header h1 { font-size:22px; color:var(--erp-text, #132238); margin:0; }

  .tab-bar { display:flex; gap:0; margin-bottom:20px; border-bottom:2px solid var(--erp-border,#dbe4f0); }
  .tab-btn { padding:10px 20px; font-size:14px; font-weight:600; border:none; background:none; cursor:pointer; color:#64748b; border-bottom:2px solid transparent; margin-bottom:-2px; }
  .tab-btn.active { color:var(--erp-accent,#1e5eff); border-bottom-color:var(--erp-accent,#1e5eff); }

  .filter-bar { display:flex; gap:10px; flex-wrap:wrap; margin-bottom:20px; align-items:center; }
  .filter-bar select { padding:8px 12px; border:1px solid var(--erp-border,#dbe4f0); border-radius:8px; font-size:13px; background:var(--erp-panel,#fff); height:38px; }

  .transfers-table { width:100%; border-collapse:collapse; font-size:13px; background:var(--erp-panel,#fff); border:1px solid var(--erp-border); border-radius:12px; overflow:hidden; }
  .transfers-table th { background:var(--erp-accent-soft,#e8efff); padding:10px 14px; text-align:left; font-weight:600; white-space:nowrap; }
  .transfers-table td { padding:10px 14px; border-top:1px solid var(--erp-border); }
  .transfers-table tr:hover { background:var(--erp-accent-soft); cursor:pointer; }
  .transfers-card-list { display: none; }
  .transfers-card { background: var(--erp-panel,#fff); border:1px solid var(--erp-border); border-radius:12px; padding:12px 14px; margin:10px 12px 0; }
  .transfers-card-header { display:flex; justify-content:space-between; gap:10px; align-items:flex-start; }
  .transfers-card-title { font-weight:700; font-size:14px; color:var(--erp-text,#132238); }
  .transfers-card-sub { font-size:12px; color:var(--erp-muted,#64748b); }
  .transfers-card-grid { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:10px; }
  .transfers-card-item { display:flex; flex-direction:column; gap:2px; }
  .transfers-card-label { font-size:10px; text-transform:uppercase; letter-spacing:0.04em; color:#94a3b8; font-weight:700; }
  .transfers-card-value { font-size:12px; color:var(--erp-text,#132238); }

  .badge { display:inline-block; padding:3px 10px; border-radius:999px; font-size:11px; font-weight:600; }
  .btn { padding:8px 16px; border:none; border-radius:8px; font-size:13px; font-weight:600; cursor:pointer; }
  .btn-primary { background:var(--erp-accent,#1e5eff); color:#fff; }
  .btn-sm { padding:4px 10px; font-size:11px; }
  .btn-success { background:#16a34a; color:#fff; }
  .btn-warning { background:#d97706; color:#fff; }
  .btn-danger { background:#dc2626; color:#fff; }
  .btn-secondary { background:#64748b; color:#fff; }

  .modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,.5); display:flex; align-items:center; justify-content:center; z-index:1000; }
  .modal-content { background:#fff; border-radius:16px; padding:28px; max-width:800px; width:95%; max-height:85vh; overflow-y:auto; }
  .modal-content h2 { margin:0 0 18px; font-size:20px; }

  .form-group { margin-bottom:14px; }
  .form-group label { display:block; font-weight:600; font-size:13px; margin-bottom:4px; }
  .form-group select, .form-group input { width:100%; padding:8px 12px; border:1px solid #dbe4f0; border-radius:8px; font-size:13px; }
  .form-row { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
  .form-row-3 { display:grid; grid-template-columns:1fr 1fr 1fr; gap:12px; }

  .line-items-grid { width:100%; border-collapse:collapse; font-size:12px; margin:12px 0; }
  .line-items-grid th { padding:6px 8px; text-align:left; background:#f8f9fa; font-weight:600; }
  .line-items-grid td { padding:6px 8px; border-top:1px solid #e2e8f0; }
  .line-items-grid input, .line-items-grid select { width:100%; padding:4px 6px; border:1px solid #dbe4f0; border-radius:6px; font-size:12px; }

  .detail-section { margin:16px 0; }
  .detail-section h3 { font-size:14px; font-weight:600; margin:0 0 8px; }
  .timeline { display:flex; flex-direction:column; gap:6px; font-size:12px; }
  .timeline-item { display:flex; gap:8px; align-items:center; }
  .timeline-dot { width:8px; height:8px; border-radius:50%; flex-shrink:0; }

  .action-bar { display:flex; gap:8px; margin-top:16px; flex-wrap:wrap; }
  .role-label { font-size:10px; color:#94a3b8; font-weight:400; }

  @media(max-width:768px) {
    .transfers-page { padding-top:12px; }
    .transfers-main { padding:76px 12px 96px; }
    .transfers-header { flex-direction:column; align-items:flex-start; }
    .tab-bar { overflow:auto; }
    .filter-bar { flex-direction:column; align-items:stretch; }
    .filter-bar .vip-select__control { width:100%; }
    .form-row, .form-row-3 { grid-template-columns:1fr; }
    .transfers-table { display:none; }
    .transfers-card-list { display:grid; gap:10px; padding:0 0 12px; }
    .line-items-grid { display:block; overflow-x:auto; }
    .line-items-grid thead { display:none; }
    .line-items-grid tbody,
    .line-items-grid tr,
    .line-items-grid td { display:block; width:100%; }
    .line-items-grid tr { padding:10px 12px; border:1px solid var(--erp-border,#dbe4f0); border-radius:10px; background:var(--erp-panel); margin-bottom:10px; }
    .line-items-grid td { padding:6px 0; border:none; }
    .line-items-grid td:last-child { padding-top:4px; }
    .line-items-grid input,
    .line-items-grid .vip-select__control { border:1px solid #cbd5f5; background:#fff; box-shadow:0 1px 2px rgba(15,23,42,0.06); }
    .line-items-grid td:last-child .btn { width:100%; }
  }

  @media(max-width:480px) {
    .transfers-page { padding-top:16px; }
    .transfers-main { padding-top:72px; padding-bottom:104px; }
    .transfers-card { margin:10px 10px 0; }
    .transfers-card-grid { grid-template-columns:1fr; }
  }
`;

function formatBdmLabel(u) {
  if (!u) return '—';
  const role = u.role === 'employee' ? 'BDM' : u.role;
  return `${u.name} (${role})${u._unassigned ? ' — Unassigned' : ''}`;
}

export default function TransferOrders() {
  const { user } = useAuth();
  const {
    getTransfers, getTransferById, createTransfer,
    approveTransfer, shipTransfer, receiveTransfer, postTransfer, cancelTransfer,
    getEntities, getBdmsByEntity,
    getReassignments, createReassignment, approveReassignment,
    loading
  } = useTransfers();
  const { products: allProducts } = useProducts();
  const { getBatches, getMyStock } = useInventory();

  const [activeTab, setActiveTab] = useState('ic'); // 'ic' | 'internal'
  const [transfers, setTransfers] = useState([]);
  const [reassignments, setReassignments] = useState([]);
  const [entities, setEntities] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [statusFilter, setStatusFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [showCreateReassign, setShowCreateReassign] = useState(false);
  const [detail, setDetail] = useState(null);

  const whApi = useWarehouses();

  // IC Transfer form state
  const [form, setForm] = useState({ source_entity_id: '', target_entity_id: '', source_bdm_id: '', target_bdm_id: '', source_warehouse_id: '', target_warehouse_id: '', transfer_date: new Date().toISOString().slice(0, 10), csi_ref: '', notes: '' });
  const [lineItems, setLineItems] = useState([{ product_id: '', qty: 1, transfer_price: 0, batch_lot_no: '', expiry_date: '' }]);
  const [sourceBdms, setSourceBdms] = useState([]);
  const [targetBdms, setTargetBdms] = useState([]);
  // batch cache: { [productId]: [{ batch_lot_no, expiry_date, available_qty }] }
  const [batchCache, setBatchCache] = useState({});
  // Source custodian's stock (for product dropdown filtering)
  const [sourceStock, setSourceStock] = useState([]);  // IC form
  const [reassignStock, setReassignStock] = useState([]);  // Internal form
  // Phase 17: warehouse lists for IC transfers
  const [sourceWarehouses, setSourceWarehouses] = useState([]);
  const [targetWarehouses, setTargetWarehouses] = useState([]);

  // Internal Reassignment form state
  const [reassignForm, setReassignForm] = useState({ source_bdm_id: '', target_bdm_id: '', source_warehouse_id: '', target_warehouse_id: '', reassignment_date: new Date().toISOString().slice(0, 10), territory_code: '', notes: '' });
  const [reassignItems, setReassignItems] = useState([{ product_id: '', batch_lot_no: '', expiry_date: '', qty: 1 }]);
  const [entityBdms, setEntityBdms] = useState([]);
  const [reassignBatchCache, setReassignBatchCache] = useState({});
  const [internalWarehouses, setInternalWarehouses] = useState([]);

  const isPresidentOrAdmin = ['president', 'ceo', 'admin'].includes(user?.role);
  const isFinanceOrAdmin = ['finance', 'admin'].includes(user?.role);

  // Fetch entities on mount
  const fetchEntities = useCallback(async () => {
    try { const res = await getEntities(); setEntities(res.data || []); } catch { /* */ }
  }, []);
  useEffect(() => { fetchEntities(); }, []);

  // Fetch IC transfers
  const fetchTransfers = useCallback(async (page = 1) => {
    try {
      const params = { page, limit: 20 };
      if (statusFilter) params.status = statusFilter;
      const res = await getTransfers(params);
      setTransfers(res.data || []);
      setPagination(res.pagination || { page: 1, pages: 1, total: 0 });
    } catch { /* */ }
  }, [statusFilter]);

  // Fetch reassignments
  const fetchReassignments = useCallback(async () => {
    try { const res = await getReassignments(); setReassignments(res.data || []); } catch { /* */ }
  }, []);

  useEffect(() => {
    if (activeTab === 'ic') fetchTransfers(1);
    else fetchReassignments();
  }, [activeTab, statusFilter]);

  // Load BDMs when source/target entity changes (IC Transfer)
  useEffect(() => {
    if (!form.source_entity_id) { setSourceBdms([]); return; }
    (async () => { try { const r = await getBdmsByEntity(form.source_entity_id); setSourceBdms(r.data || []); } catch { /* */ } })();
  }, [form.source_entity_id]);

  useEffect(() => {
    if (!form.target_entity_id) { setTargetBdms([]); return; }
    (async () => { try { const r = await getBdmsByEntity(form.target_entity_id, true); setTargetBdms(r.data || []); } catch { /* */ } })();
  }, [form.target_entity_id]);

  // Phase 17: Load warehouses when source/target entity changes (IC Transfer)
  useEffect(() => {
    if (!form.source_entity_id) { setSourceWarehouses([]); return; }
    (async () => { try { const r = await whApi.getWarehousesByEntity(form.source_entity_id); setSourceWarehouses(r.data || []); } catch { /* */ } })();
  }, [form.source_entity_id]);

  useEffect(() => {
    if (!form.target_entity_id) { setTargetWarehouses([]); return; }
    (async () => { try { const r = await whApi.getWarehousesByEntity(form.target_entity_id); setTargetWarehouses(r.data || []); } catch { /* */ } })();
  }, [form.target_entity_id]);

  // Load BDMs for internal reassignment (user's entity)
  useEffect(() => {
    const eid = user?.entity_id;
    if (!eid) return;
    (async () => {
      try {
        const [bdmRes, whRes] = await Promise.all([
          getBdmsByEntity(eid),
          whApi.getWarehousesByEntity(eid),
        ]);
        setEntityBdms(bdmRes.data || []);
        setInternalWarehouses(whRes.data || []);
      } catch { /* */ }
    })();
  }, [user?.entity_id]);

  // IC Transfer: show only products the source custodian has stock for
  const sourceStockProductIds = new Set(sourceStock.map(s => s.product_id?.toString()));
  const sourceProducts = sourceStock.length > 0
    ? allProducts.filter(p => sourceStockProductIds.has(String(p._id)))
    : (form.source_entity_id
        ? allProducts.filter(p => String(p.entity_id?._id || p.entity_id) === form.source_entity_id)
        : []);

  // Internal: show only products the source custodian has stock for
  const reassignStockProductIds = new Set(reassignStock.map(s => s.product_id?.toString()));
  const entityProducts = reassignStock.length > 0
    ? allProducts.filter(p => reassignStockProductIds.has(String(p._id)))
    : [];

  // IC Transfer handlers
  const handleCreate = async () => {
    try {
      const items = lineItems.filter(li => li.product_id && li.qty > 0).map(li => ({
        product_id: li.product_id, qty: parseInt(li.qty),
        transfer_price: parseFloat(li.transfer_price) || 0,
        batch_lot_no: li.batch_lot_no || undefined, expiry_date: li.expiry_date || undefined
      }));
      if (!items.length) { showError(null, 'Add at least one line item'); return; }
      await createTransfer({ ...form, line_items: items });
      setShowCreate(false);
      setForm({ source_entity_id: '', target_entity_id: '', source_bdm_id: '', target_bdm_id: '', source_warehouse_id: '', target_warehouse_id: '', transfer_date: new Date().toISOString().slice(0, 10), csi_ref: '', notes: '' });
      setLineItems([{ product_id: '', qty: 1, transfer_price: 0, batch_lot_no: '', expiry_date: '' }]);
      fetchTransfers(1);
    } catch { /* */ }
  };

  const handleAction = async (id, action) => {
    try {
      if (action === 'approve') await approveTransfer(id);
      else if (action === 'ship') await shipTransfer(id);
      else if (action === 'receive') await receiveTransfer(id);
      else if (action === 'post') await postTransfer(id);
      else if (action === 'cancel') {
        const reason = prompt('Cancellation reason:');
        if (reason === null) return;
        await cancelTransfer(id, reason);
      }
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Action failed';
      showError(err, `Could not ${action} transfer`);
      return; // Don't refresh on error
    }
    // Always refresh list after action (success or handled error)
    try { await fetchTransfers(pagination.page); } catch { /* */ }
    if (detail?._id === id) {
      try { const res = await getTransferById(id); setDetail(res.data); } catch { /* */ }
    }
  };

  const openDetail = async (id) => {
    try { const res = await getTransferById(id); setDetail(res.data); } catch { /* */ }
  };

  // Internal Reassignment handlers
  const handleCreateReassign = async () => {
    try {
      const items = reassignItems.filter(li => li.product_id && li.qty > 0).map(li => ({
        product_id: li.product_id, batch_lot_no: li.batch_lot_no,
        expiry_date: li.expiry_date, qty: parseInt(li.qty)
      }));
      if (!items.length) { showError(null, 'Add at least one line item'); return; }
      await createReassignment({ ...reassignForm, entity_id: user?.entity_id, line_items: items });
      setShowCreateReassign(false);
      setReassignForm({ source_bdm_id: '', target_bdm_id: '', source_warehouse_id: '', target_warehouse_id: '', reassignment_date: new Date().toISOString().slice(0, 10), territory_code: '', notes: '' });
      setReassignItems([{ product_id: '', batch_lot_no: '', expiry_date: '', qty: 1 }]);
      fetchReassignments();
    } catch (err) { showError(err, 'Could not create reassignment'); }
  };

  const handleReassignAction = async (id, action) => {
    try {
      if (action === 'REJECTED') {
        const reason = prompt('Rejection reason:');
        if (reason === null) return;
        await approveReassignment(id, 'REJECTED', reason);
      } else {
        await approveReassignment(id, 'APPROVED');
      }
      fetchReassignments();
    } catch (err) { showError(err, 'Could not process reassignment'); }
  };

  // Line item helpers
  const addLineItem = () => setLineItems([...lineItems, { product_id: '', qty: 1, transfer_price: 0, batch_lot_no: '', expiry_date: '' }]);
  const removeLineItem = (i) => setLineItems(lineItems.filter((_, idx) => idx !== i));
  const updateLineItem = (i, field, val) => {
    const items = [...lineItems];
    items[i] = { ...items[i], [field]: val };

    // When product changes, fetch batches for source BDM (FIFO)
    if (field === 'product_id' && val && form.source_bdm_id) {
      if (!batchCache[val]) {
        getBatches(val, form.source_bdm_id, form.source_entity_id).then(res => {
          setBatchCache(prev => ({ ...prev, [val]: res.data || [] }));
        }).catch(err => console.error('[TransferOrders]', err.message));
      }
      // Reset batch/expiry when product changes
      items[i].batch_lot_no = '';
      items[i].expiry_date = '';
    }

    // When batch is selected, auto-fill expiry
    if (field === 'batch_lot_no' && val) {
      const productId = items[i].product_id;
      const batches = batchCache[productId] || [];
      const match = batches.find(b => b.batch_lot_no === val);
      if (match) {
        items[i].expiry_date = match.expiry_date ? new Date(match.expiry_date).toISOString().slice(0, 10) : '';
      }
    }

    setLineItems(items);
  };

  const addReassignItem = () => setReassignItems([...reassignItems, { product_id: '', batch_lot_no: '', expiry_date: '', qty: 1 }]);
  const removeReassignItem = (i) => setReassignItems(reassignItems.filter((_, idx) => idx !== i));
  const updateReassignItem = (i, field, val) => {
    const items = [...reassignItems];
    items[i] = { ...items[i], [field]: val };

    // When product changes, fetch batches for source BDM (FIFO)
    if (field === 'product_id' && val && reassignForm.source_bdm_id) {
      const cacheKey = `r_${val}_${reassignForm.source_bdm_id}`;
      if (!reassignBatchCache[cacheKey]) {
        getBatches(val, reassignForm.source_bdm_id).then(res => {
          setReassignBatchCache(prev => ({ ...prev, [cacheKey]: res.data || [] }));
        }).catch(err => console.error('[TransferOrders]', err.message));
      }
      items[i].batch_lot_no = '';
      items[i].expiry_date = '';
    }

    // When batch is selected, auto-fill expiry
    if (field === 'batch_lot_no' && val) {
      const cacheKey = `r_${items[i].product_id}_${reassignForm.source_bdm_id}`;
      const batches = reassignBatchCache[cacheKey] || [];
      const match = batches.find(b => b.batch_lot_no === val);
      if (match) {
        items[i].expiry_date = match.expiry_date ? new Date(match.expiry_date).toISOString().slice(0, 10) : '';
      }
    }

    setReassignItems(items);
  };

  return (
    <div className="admin-page erp-page transfers-page">
      <style>{pageStyles}</style>
      <Navbar />
      <div className="admin-layout">
        <Sidebar />
        <div className="transfers-main">
          <div className="transfers-inner">
          <WorkflowGuide pageKey="transfers" />
          <div className="transfers-header">
            <h1>Stock Transfers</h1>
            <div style={{ display: 'flex', gap: 8 }}>
              {isPresidentOrAdmin && activeTab === 'ic' && (
                <button className="btn btn-primary" onClick={() => setShowCreate(true)}>+ IC Transfer</button>
              )}
              {isPresidentOrAdmin && activeTab === 'internal' && (
                <button className="btn btn-primary" onClick={() => setShowCreateReassign(true)}>+ Reassign Stock</button>
              )}
            </div>
          </div>

          <div className="tab-bar">
            <button className={`tab-btn ${activeTab === 'ic' ? 'active' : ''}`} onClick={() => setActiveTab('ic')}>Inter-Company</button>
            <button className={`tab-btn ${activeTab === 'internal' ? 'active' : ''}`} onClick={() => setActiveTab('internal')}>Internal</button>
          </div>

          {/* ═══ IC TRANSFERS TAB ═══ */}
          {activeTab === 'ic' && (
            <>
              <div className="filter-bar">
                <SelectField value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                  <option value="">All Statuses</option>
                  {['DRAFT', 'APPROVED', 'SHIPPED', 'RECEIVED', 'POSTED', 'CANCELLED'].map(s => <option key={s} value={s}>{s}</option>)}
                </SelectField>
              </div>
              <table className="transfers-table">
                <thead><tr><th>Ref #</th><th>CSI #</th><th>Date</th><th>From</th><th>To</th><th>Items</th><th>Total</th><th>Status</th><th>Actions</th></tr></thead>
                <tbody>
                  {!transfers.length && <tr><td colSpan={9} style={{ textAlign: 'center', color: '#94a3b8', padding: 24 }}>No transfers found</td></tr>}
                  {transfers.map(t => {
                    const sc = STATUS_COLORS[t.status] || {};
                    return (
                      <tr key={t._id} onClick={() => openDetail(t._id)}>
                        <td style={{ fontWeight: 600 }}>{t.transfer_ref}</td>
                        <td>{t.csi_ref || '—'}</td>
                        <td>{new Date(t.transfer_date).toLocaleDateString()}</td>
                        <td>{t.source_entity_id?.entity_name || '—'}</td>
                        <td>{t.target_entity_id?.entity_name || '—'}</td>
                        <td>{t.total_items}</td>
                        <td>₱{(t.total_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        <td><span className="badge" style={{ background: sc.bg, color: sc.text }}>{t.status}</span></td>
                        <td onClick={e => e.stopPropagation()}>
                          {t.status === 'DRAFT' && isPresidentOrAdmin && <button className="btn btn-sm btn-success" onClick={() => handleAction(t._id, 'approve')}>Approve</button>}
                          {t.status === 'APPROVED' && isPresidentOrAdmin && <button className="btn btn-sm btn-warning" onClick={() => handleAction(t._id, 'ship')}>Ship</button>}
                          {t.status === 'SHIPPED' && <button className="btn btn-sm btn-success" onClick={() => handleAction(t._id, 'receive')}>Receive</button>}
                          {t.status === 'RECEIVED' && isPresidentOrAdmin && <button className="btn btn-sm btn-primary" onClick={() => handleAction(t._id, 'post')}>Post</button>}
                          {!['POSTED', 'CANCELLED'].includes(t.status) && isPresidentOrAdmin && (
                            <button className="btn btn-sm btn-danger" style={{ marginLeft: 4 }} onClick={() => handleAction(t._id, 'cancel')}>Cancel</button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="transfers-card-list">
                {!transfers.length && (
                  <div className="transfers-card" style={{ textAlign: 'center', color: '#94a3b8' }}>No transfers found</div>
                )}
                {transfers.map(t => {
                  const sc = STATUS_COLORS[t.status] || {};
                  return (
                    <div key={t._id} className="transfers-card" onClick={() => openDetail(t._id)}>
                      <div className="transfers-card-header">
                        <div>
                          <div className="transfers-card-title">{t.transfer_ref}</div>
                          <div className="transfers-card-sub">{new Date(t.transfer_date).toLocaleDateString()}</div>
                        </div>
                        <span className="badge" style={{ background: sc.bg, color: sc.text }}>{t.status}</span>
                      </div>
                      <div className="transfers-card-grid">
                        <div className="transfers-card-item">
                          <span className="transfers-card-label">From</span>
                          <span className="transfers-card-value">{t.source_entity_id?.entity_name || '—'}</span>
                        </div>
                        <div className="transfers-card-item">
                          <span className="transfers-card-label">To</span>
                          <span className="transfers-card-value">{t.target_entity_id?.entity_name || '—'}</span>
                        </div>
                        <div className="transfers-card-item">
                          <span className="transfers-card-label">Items</span>
                          <span className="transfers-card-value">{t.total_items}</span>
                        </div>
                        <div className="transfers-card-item">
                          <span className="transfers-card-label">Total</span>
                          <span className="transfers-card-value">₱{(t.total_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                        </div>
                      </div>
                      {t.csi_ref && <div className="transfers-card-sub" style={{ marginTop: 8 }}>CSI # {t.csi_ref}</div>}
                      <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }} onClick={e => e.stopPropagation()}>
                        {t.status === 'DRAFT' && isPresidentOrAdmin && <button className="btn btn-sm btn-success" onClick={() => handleAction(t._id, 'approve')}>Approve</button>}
                        {t.status === 'APPROVED' && isPresidentOrAdmin && <button className="btn btn-sm btn-warning" onClick={() => handleAction(t._id, 'ship')}>Ship</button>}
                        {t.status === 'SHIPPED' && <button className="btn btn-sm btn-success" onClick={() => handleAction(t._id, 'receive')}>Receive</button>}
                        {t.status === 'RECEIVED' && isPresidentOrAdmin && <button className="btn btn-sm btn-primary" onClick={() => handleAction(t._id, 'post')}>Post</button>}
                        {!['POSTED', 'CANCELLED'].includes(t.status) && isPresidentOrAdmin && (
                          <button className="btn btn-sm btn-danger" onClick={() => handleAction(t._id, 'cancel')}>Cancel</button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              {pagination.pages > 1 && <Pagination currentPage={pagination.page} totalPages={pagination.pages} onPageChange={p => fetchTransfers(p)} />}
            </>
          )}

          {/* ═══ INTERNAL REASSIGNMENT TAB ═══ */}
          {activeTab === 'internal' && (
            <>
              <table className="transfers-table">
                <thead><tr><th>Ref #</th><th>Date</th><th>From</th><th>To</th><th>Items</th><th>Status</th><th>Actions</th></tr></thead>
                <tbody>
                  {!reassignments.length && <tr><td colSpan={7} style={{ textAlign: 'center', color: '#94a3b8', padding: 24 }}>No reassignments found</td></tr>}
                  {reassignments.map(r => {
                    const sc = STATUS_COLORS[r.status] || {};
                    return (
                      <tr key={r._id}>
                        <td style={{ fontWeight: 600 }}>{r.reassignment_ref || '—'}</td>
                        <td>{new Date(r.reassignment_date).toLocaleDateString()}</td>
                        <td>{r.source_bdm_id?.name || '—'} <span className="role-label">({r.source_bdm_id?.role})</span></td>
                        <td>{r.target_bdm_id?.name || '—'} <span className="role-label">({r.target_bdm_id?.role})</span></td>
                        <td>{r.line_items?.length || 0}</td>
                        <td><span className="badge" style={{ background: sc.bg, color: sc.text }}>{r.status}</span></td>
                        <td>
                          {r.status === 'PENDING' && isFinanceOrAdmin && (
                            <>
                              <button className="btn btn-sm btn-success" onClick={() => handleReassignAction(r._id, 'APPROVED')}>Approve</button>
                              <button className="btn btn-sm btn-danger" style={{ marginLeft: 4 }} onClick={() => handleReassignAction(r._id, 'REJECTED')}>Reject</button>
                            </>
                          )}
                          {r.status === 'REJECTED' && <span style={{ fontSize: 11, color: '#991b1b' }}>{r.rejection_reason}</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="transfers-card-list">
                {!reassignments.length && (
                  <div className="transfers-card" style={{ textAlign: 'center', color: '#94a3b8' }}>No reassignments found</div>
                )}
                {reassignments.map(r => {
                  const sc = STATUS_COLORS[r.status] || {};
                  return (
                    <div key={r._id} className="transfers-card">
                      <div className="transfers-card-header">
                        <div>
                          <div className="transfers-card-title">{r.reassignment_ref || '—'}</div>
                          <div className="transfers-card-sub">{new Date(r.reassignment_date).toLocaleDateString()}</div>
                        </div>
                        <span className="badge" style={{ background: sc.bg, color: sc.text }}>{r.status}</span>
                      </div>
                      <div className="transfers-card-grid">
                        <div className="transfers-card-item">
                          <span className="transfers-card-label">From</span>
                          <span className="transfers-card-value">{r.source_bdm_id?.name || '—'}</span>
                        </div>
                        <div className="transfers-card-item">
                          <span className="transfers-card-label">To</span>
                          <span className="transfers-card-value">{r.target_bdm_id?.name || '—'}</span>
                        </div>
                        <div className="transfers-card-item">
                          <span className="transfers-card-label">Items</span>
                          <span className="transfers-card-value">{r.line_items?.length || 0}</span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                        {r.status === 'PENDING' && isFinanceOrAdmin && (
                          <>
                            <button className="btn btn-sm btn-success" onClick={() => handleReassignAction(r._id, 'APPROVED')}>Approve</button>
                            <button className="btn btn-sm btn-danger" onClick={() => handleReassignAction(r._id, 'REJECTED')}>Reject</button>
                          </>
                        )}
                        {r.status === 'REJECTED' && <span style={{ fontSize: 11, color: '#991b1b' }}>{r.rejection_reason}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

          {/* ═══ IC TRANSFER CREATE MODAL ═══ */}
        {showCreate && (
          <div className="modal-overlay" onClick={() => setShowCreate(false)}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
              <h2>New Inter-Company Transfer</h2>
              <div className="form-row">
                <div className="form-group">
                  <label>Source Entity</label>
                  <SelectField value={form.source_entity_id} onChange={e => setForm({ ...form, source_entity_id: e.target.value, source_bdm_id: '' })}>
                    <option value="">Select...</option>
                    {entities.map(e => <option key={e._id} value={e._id}>{e.entity_name}</option>)}
                  </SelectField>
                </div>
                <div className="form-group">
                  <label>Source Custodian</label>
                  <SelectField value={form.source_bdm_id} onChange={e => {
                    const newBdmId = e.target.value;
                    setForm(f => ({ ...f, source_bdm_id: newBdmId }));
                    setBatchCache({});
                    setSourceStock([]);
                    if (newBdmId) {
                      // Fetch this custodian's stock to filter product dropdown (pass source entity_id)
                      getMyStock(newBdmId, form.source_entity_id).then(res => setSourceStock(res.data || [])).catch(err => console.error('[TransferOrders]', err.message));
                      // Re-fetch batches for already-selected products
                      lineItems.forEach(li => {
                        if (li.product_id) {
                          getBatches(li.product_id, newBdmId, form.source_entity_id).then(res => {
                            setBatchCache(prev => ({ ...prev, [li.product_id]: res.data || [] }));
                          }).catch(err => console.error('[TransferOrders]', err.message));
                        }
                      });
                    }
                  }}>
                    <option value="">Select...</option>
                    {sourceBdms.map(u => <option key={u._id} value={u._id}>{formatBdmLabel(u)}</option>)}
                  </SelectField>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Target Entity</label>
                  <SelectField value={form.target_entity_id} onChange={e => setForm({ ...form, target_entity_id: e.target.value, target_bdm_id: '' })}>
                    <option value="">Select...</option>
                    {entities.filter(e => e._id !== form.source_entity_id).map(e => <option key={e._id} value={e._id}>{e.entity_name}</option>)}
                  </SelectField>
                </div>
                <div className="form-group">
                  <label>Target Custodian</label>
                  <SelectField value={form.target_bdm_id} onChange={e => setForm({ ...form, target_bdm_id: e.target.value })}>
                    <option value="">Select...</option>
                    {targetBdms.map(u => <option key={u._id} value={u._id}>{formatBdmLabel(u)}</option>)}
                  </SelectField>
                </div>
              </div>
              {/* Phase 17: Warehouse selection */}
              <div className="form-row">
                <div className="form-group">
                  <label>Source Warehouse</label>
                  <SelectField value={form.source_warehouse_id} onChange={e => setForm({ ...form, source_warehouse_id: e.target.value })}>
                    <option value="">Select...</option>
                    {sourceWarehouses.map(w => <option key={w._id} value={w._id}>{w.warehouse_code} — {w.warehouse_name}</option>)}
                  </SelectField>
                </div>
                <div className="form-group">
                  <label>Target Warehouse</label>
                  <SelectField value={form.target_warehouse_id} onChange={e => setForm({ ...form, target_warehouse_id: e.target.value })}>
                    <option value="">Select...</option>
                    {targetWarehouses.map(w => <option key={w._id} value={w._id}>{w.warehouse_code} — {w.warehouse_name}</option>)}
                  </SelectField>
                </div>
              </div>
              <div className="form-row-3">
                <div className="form-group">
                  <label>Transfer Date</label>
                  <input type="date" value={form.transfer_date} onChange={e => setForm({ ...form, transfer_date: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>CSI # (Invoice No.)</label>
                  <input value={form.csi_ref} onChange={e => setForm({ ...form, csi_ref: e.target.value })} placeholder="e.g. 004900" />
                </div>
                <div className="form-group">
                  <label>Notes</label>
                  <input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Optional" />
                </div>
              </div>

              <h3 style={{ fontSize: 14, fontWeight: 600, marginTop: 16, marginBottom: 8 }}>Line Items</h3>
              <table className="line-items-grid">
                <thead><tr><th>Product</th><th>Batch (FIFO)</th><th>Expiry</th><th>Qty</th><th>Price</th><th></th></tr></thead>
                <tbody>
                  {lineItems.map((li, i) => {
                    const batches = batchCache[li.product_id] || [];
                    return (
                      <tr key={i}>
                        <td>
                          <SelectField value={li.product_id} onChange={e => updateLineItem(i, 'product_id', e.target.value)}>
                            <option value="">Select...</option>
                            {sourceProducts.map(p => {
                              const stock = sourceStock.find(s => String(s.product_id) === String(p._id));
                              const qty = stock?.total_qty || 0;
                              const unit = p.unit_code || stock?.product?.unit_code || '';
                              return <option key={p._id} value={p._id}>{p.brand_name}{p.dosage_strength ? ` ${p.dosage_strength}` : ''} — {qty} {unit}</option>;
                            })}
                          </SelectField>
                        </td>
                        <td>
                          <SelectField value={li.batch_lot_no} onChange={e => updateLineItem(i, 'batch_lot_no', e.target.value)}>
                            <option value="">Select batch...</option>
                            {batches.map(b => (
                              <option key={b.batch_lot_no} value={b.batch_lot_no}>
                                {b.batch_lot_no} — {b.available_qty} avail
                              </option>
                            ))}
                          </SelectField>
                        </td>
                        <td style={{ fontSize: 11, color: '#64748b', whiteSpace: 'nowrap' }}>
                          {li.expiry_date ? new Date(li.expiry_date).toLocaleDateString() : '—'}
                        </td>
                        <td><input type="number" min="1" value={li.qty} onChange={e => updateLineItem(i, 'qty', e.target.value)} style={{ width: 60 }} /></td>
                        <td><input type="number" min="0" step="0.01" value={li.transfer_price} onChange={e => updateLineItem(i, 'transfer_price', e.target.value)} style={{ width: 80 }} /></td>
                        <td><button className="btn btn-sm btn-danger" onClick={() => removeLineItem(i)}>Remove line</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <button className="btn btn-sm btn-secondary" onClick={addLineItem}>+ Add Line</button>
              <div className="action-bar">
                <button className="btn btn-primary" onClick={handleCreate} disabled={loading}>{loading ? 'Creating...' : 'Create Transfer'}</button>
                <button className="btn btn-secondary" onClick={() => setShowCreate(false)}>Cancel</button>
              </div>
            </div>
          </div>
        )}

          {/* ═══ INTERNAL REASSIGNMENT CREATE MODAL ═══ */}
        {showCreateReassign && (
          <div className="modal-overlay" onClick={() => setShowCreateReassign(false)}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
              <h2>Internal Stock Reassignment</h2>
              <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 16px' }}>Transfer stock between custodians within the same entity. Requires finance approval.</p>
              <div className="form-row">
                <div className="form-group">
                  <label>Source Custodian</label>
                  <SelectField value={reassignForm.source_bdm_id} onChange={e => {
                    const newBdmId = e.target.value;
                    setReassignForm(f => ({ ...f, source_bdm_id: newBdmId }));
                    setReassignBatchCache({});
                    setReassignStock([]);
                    if (newBdmId) {
                      getMyStock(newBdmId).then(res => setReassignStock(res.data || [])).catch(err => console.error('[TransferOrders]', err.message));
                      reassignItems.forEach(li => {
                        if (li.product_id) {
                          const ck = `r_${li.product_id}_${newBdmId}`;
                          getBatches(li.product_id, newBdmId).then(res => {
                            setReassignBatchCache(prev => ({ ...prev, [ck]: res.data || [] }));
                          }).catch(err => console.error('[TransferOrders]', err.message));
                        }
                      });
                    }
                  }}>
                    <option value="">Select...</option>
                    {entityBdms.map(u => <option key={u._id} value={u._id}>{formatBdmLabel(u)}</option>)}
                  </SelectField>
                </div>
                <div className="form-group">
                  <label>Target Custodian</label>
                  <SelectField value={reassignForm.target_bdm_id} onChange={e => setReassignForm({ ...reassignForm, target_bdm_id: e.target.value })}>
                    <option value="">Select...</option>
                    {entityBdms.filter(u => u._id !== reassignForm.source_bdm_id).map(u => <option key={u._id} value={u._id}>{formatBdmLabel(u)}</option>)}
                  </SelectField>
                </div>
              </div>
              {/* Phase 17: Warehouse selection for internal reassignment */}
              <div className="form-row">
                <div className="form-group">
                  <label>Source Warehouse</label>
                  <SelectField value={reassignForm.source_warehouse_id} onChange={e => setReassignForm({ ...reassignForm, source_warehouse_id: e.target.value })}>
                    <option value="">Select...</option>
                    {internalWarehouses.map(w => <option key={w._id} value={w._id}>{w.warehouse_code} — {w.warehouse_name}</option>)}
                  </SelectField>
                </div>
                <div className="form-group">
                  <label>Target Warehouse</label>
                  <SelectField value={reassignForm.target_warehouse_id} onChange={e => setReassignForm({ ...reassignForm, target_warehouse_id: e.target.value })}>
                    <option value="">Select...</option>
                    {internalWarehouses.filter(w => w._id !== reassignForm.source_warehouse_id).map(w => <option key={w._id} value={w._id}>{w.warehouse_code} — {w.warehouse_name}</option>)}
                  </SelectField>
                </div>
              </div>
              <div className="form-row-3">
                <div className="form-group">
                  <label>Date</label>
                  <input type="date" value={reassignForm.reassignment_date} onChange={e => setReassignForm({ ...reassignForm, reassignment_date: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Territory Code</label>
                  <input value={reassignForm.territory_code} onChange={e => setReassignForm({ ...reassignForm, territory_code: e.target.value })} placeholder="e.g. ILO" style={{ textTransform: 'uppercase' }} />
                </div>
                <div className="form-group">
                  <label>Notes</label>
                  <input value={reassignForm.notes} onChange={e => setReassignForm({ ...reassignForm, notes: e.target.value })} placeholder="Optional" />
                </div>
              </div>
              <h3 style={{ fontSize: 14, fontWeight: 600, marginTop: 16, marginBottom: 8 }}>Line Items</h3>
              <table className="line-items-grid">
                <thead><tr><th>Product</th><th>Batch (FIFO)</th><th>Expiry</th><th>Qty</th><th></th></tr></thead>
                <tbody>
                  {reassignItems.map((li, i) => {
                    const cacheKey = `r_${li.product_id}_${reassignForm.source_bdm_id}`;
                    const batches = reassignBatchCache[cacheKey] || [];
                    return (
                      <tr key={i}>
                        <td>
                          <SelectField value={li.product_id} onChange={e => updateReassignItem(i, 'product_id', e.target.value)}>
                            <option value="">Select...</option>
                            {entityProducts.map(p => <option key={p._id} value={p._id}>{p.brand_name}{p.dosage_strength ? ` ${p.dosage_strength}` : ''} — {p.unit_code || 'PC'}</option>)}
                          </SelectField>
                        </td>
                        <td>
                          <SelectField value={li.batch_lot_no} onChange={e => updateReassignItem(i, 'batch_lot_no', e.target.value)}>
                            <option value="">Select batch...</option>
                            {batches.map(b => (
                              <option key={b.batch_lot_no} value={b.batch_lot_no}>
                                {b.batch_lot_no} — {b.available_qty} avail
                              </option>
                            ))}
                          </SelectField>
                        </td>
                        <td style={{ fontSize: 11, color: '#64748b', whiteSpace: 'nowrap' }}>
                          {li.expiry_date ? new Date(li.expiry_date).toLocaleDateString() : '—'}
                        </td>
                        <td><input type="number" min="1" value={li.qty} onChange={e => updateReassignItem(i, 'qty', e.target.value)} style={{ width: 60 }} /></td>
                        <td><button className="btn btn-sm btn-danger" onClick={() => removeReassignItem(i)}>Remove line</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <button className="btn btn-sm btn-secondary" onClick={addReassignItem}>+ Add Line</button>
              <div className="action-bar">
                <button className="btn btn-primary" onClick={handleCreateReassign} disabled={loading}>{loading ? 'Creating...' : 'Submit for Approval'}</button>
                <button className="btn btn-secondary" onClick={() => setShowCreateReassign(false)}>Cancel</button>
              </div>
            </div>
          </div>
        )}

          {/* ═══ IC TRANSFER DETAIL MODAL ═══ */}
        {detail && (
          <div className="modal-overlay" onClick={() => setDetail(null)}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
              <h2>Transfer {detail.transfer_ref}</h2>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 16, fontSize: 13 }}>
                <div><strong>Status:</strong> <span className="badge" style={{ background: STATUS_COLORS[detail.status]?.bg, color: STATUS_COLORS[detail.status]?.text }}>{detail.status}</span></div>
                <div><strong>Date:</strong> {new Date(detail.transfer_date).toLocaleDateString()}</div>
                {detail.csi_ref && <div><strong>CSI #:</strong> {detail.csi_ref}</div>}
                <div><strong>From:</strong> {detail.source_entity_id?.entity_name}</div>
                <div><strong>To:</strong> {detail.target_entity_id?.entity_name}</div>
              </div>
              {(detail.source_bdm_id || detail.target_bdm_id) && (
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 16, fontSize: 13 }}>
                  {detail.source_bdm_id && <div><strong>Source Custodian:</strong> {detail.source_bdm_id.name} <span className="role-label">({detail.source_bdm_id.role})</span></div>}
                  {detail.target_bdm_id && <div><strong>Target Custodian:</strong> {detail.target_bdm_id.name} <span className="role-label">({detail.target_bdm_id.role})</span></div>}
                </div>
              )}

              <div className="detail-section">
                <h3>Line Items ({detail.line_items?.length || 0})</h3>
                <table className="line-items-grid">
                  <thead><tr><th>Product</th><th>Batch</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead>
                  <tbody>
                    {(detail.line_items || []).map((li, i) => (
                      <tr key={i}>
                        <td>{li.product?.brand_name || li.item_key || '—'}</td>
                        <td>{li.batch_lot_no || '—'}</td>
                        <td>{li.qty}</td>
                        <td>₱{(li.transfer_price || 0).toLocaleString()}</td>
                        <td>₱{(li.line_total || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ fontWeight: 700 }}><td colSpan={2}>Total</td><td>{detail.total_items}</td><td></td><td>₱{(detail.total_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td></tr>
                  </tfoot>
                </table>
              </div>

              <div className="detail-section">
                <h3>Timeline</h3>
                <div className="timeline">
                  <div className="timeline-item"><span className="timeline-dot" style={{ background: '#475569' }}></span> Created by {detail.requested_by?.name || '—'} on {new Date(detail.created_at).toLocaleString()}</div>
                  {detail.approved_at && <div className="timeline-item"><span className="timeline-dot" style={{ background: '#1e40af' }}></span> Approved by {detail.approved_by?.name} on {new Date(detail.approved_at).toLocaleString()}</div>}
                  {detail.shipped_at && <div className="timeline-item"><span className="timeline-dot" style={{ background: '#d97706' }}></span> Shipped by {detail.shipped_by?.name} on {new Date(detail.shipped_at).toLocaleString()}</div>}
                  {detail.received_at && <div className="timeline-item"><span className="timeline-dot" style={{ background: '#16a34a' }}></span> Received by {detail.received_by?.name} on {new Date(detail.received_at).toLocaleString()}</div>}
                  {detail.posted_at && <div className="timeline-item"><span className="timeline-dot" style={{ background: '#064e3b' }}></span> Posted by {detail.posted_by?.name} on {new Date(detail.posted_at).toLocaleString()}</div>}
                  {detail.cancelled_at && <div className="timeline-item"><span className="timeline-dot" style={{ background: '#dc2626' }}></span> Cancelled by {detail.cancelled_by?.name}: {detail.cancel_reason}</div>}
                </div>
              </div>

              <div className="action-bar">
                {detail.status === 'DRAFT' && isPresidentOrAdmin && <button className="btn btn-success" onClick={() => handleAction(detail._id, 'approve')}>Approve</button>}
                {detail.status === 'APPROVED' && isPresidentOrAdmin && <button className="btn btn-warning" onClick={() => handleAction(detail._id, 'ship')}>Ship</button>}
                {detail.status === 'SHIPPED' && <button className="btn btn-success" onClick={() => handleAction(detail._id, 'receive')}>Confirm Receipt</button>}
                {detail.status === 'RECEIVED' && isPresidentOrAdmin && <button className="btn btn-primary" onClick={() => handleAction(detail._id, 'post')}>Post (Final)</button>}
                {!['POSTED', 'CANCELLED'].includes(detail.status) && isPresidentOrAdmin && <button className="btn btn-danger" onClick={() => handleAction(detail._id, 'cancel')}>Cancel</button>}
                <button className="btn btn-secondary" onClick={() => setDetail(null)}>Close</button>
              </div>
            </div>
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
