/**
 * Product Master Page — ERP product catalog management
 * Full CRUD + reorder rules + search/filter + deactivate
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import useWorkingEntity from '../../hooks/useWorkingEntity';
import { useAuth } from '../../hooks/useAuth';
import useErpApi from '../hooks/useErpApi';
import { broadcastProductsChanged } from '../hooks/useProducts';
import useWarehouses from '../hooks/useWarehouses';
import { useLookupBatch } from '../hooks/useLookups';
import useErpSubAccess from '../hooks/useErpSubAccess';
import WorkflowGuide from '../components/WorkflowGuide';
import { showError, showSuccess } from '../utils/errorToast';

const STATUS_FILTER = ['ALL', 'ACTIVE', 'INACTIVE'];

const pageStyles = `
  .pm-page { background: var(--erp-bg, #f4f7fb); min-height: 100vh; }
  .pm-main { flex: 1; min-width: 0; overflow-y: auto; -webkit-overflow-scrolling: touch; padding: 20px; max-width: 1400px; margin: 0 auto; }
  .pm-header { display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }
  .pm-header h1 { font-size: 22px; color: var(--erp-text, #132238); margin: 0 0 4px; }
  .pm-header p { color: var(--erp-muted, #5f7188); font-size: 14px; margin: 0; }
  .pm-controls { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 16px; align-items: center; }
  .pm-controls input, .pm-controls select { padding: 8px 12px; border: 1px solid var(--erp-border, #d1d5db); border-radius: 8px; font-size: 13px; background: var(--erp-panel, #fff); color: var(--erp-text); }
  .pm-controls input { min-width: 220px; }
  .pm-panel { background: var(--erp-panel, #fff); border: 1px solid var(--erp-border, #e5e7eb); border-radius: 14px; padding: 0; overflow: hidden; }
  .pm-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .pm-table th { text-align: left; padding: 10px 12px; background: var(--erp-accent-soft, #f0f4ff); font-weight: 600; white-space: nowrap; border-bottom: 2px solid var(--erp-border); }
  .pm-table td { padding: 10px 12px; border-top: 1px solid var(--erp-border); vertical-align: top; }
  .pm-table tr:hover { background: var(--erp-accent-soft, #f8faff); }
  .pm-brand { font-weight: 600; color: var(--erp-text); }
  .pm-generic { font-size: 12px; color: var(--erp-muted); }
  .pm-dosage { font-size: 12px; color: var(--erp-muted); }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 600; }
  .badge-active { background: #dcfce7; color: #166534; }
  .badge-inactive { background: #fef2f2; color: #991b1b; }
  .badge-vat { background: #dbeafe; color: #1e40af; }
  .badge-exempt { background: #fef3c7; color: #92400e; }
  .badge-zero { background: #f3f4f6; color: #374151; }
  .badge-inherited { background: #e0e7ff; color: #3730a3; }
  .btn { padding: 6px 14px; border: none; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 500; }
  .btn-primary { background: #2563eb; color: #fff; padding: 8px 16px; font-size: 13px; }
  .btn-secondary { background: #fff; color: #374151; border: 1px solid #d1d5db; }
  .btn-danger { background: #fef2f2; color: #991b1b; border: 1px solid #fca5a5; }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .pm-empty { text-align: center; padding: 40px; color: var(--erp-muted); }
  .pm-count { font-size: 13px; color: var(--erp-muted); }
  .pm-price { text-align: right; font-variant-numeric: tabular-nums; }
  .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 1000; }
  .modal-box { background: #fff; border-radius: 14px; padding: 24px; width: 560px; max-width: 95vw; max-height: 90vh; overflow-y: auto; }
  .modal-title { font-size: 18px; font-weight: 600; margin-bottom: 16px; }
  .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .form-group { margin-bottom: 12px; }
  .form-group label { display: block; font-size: 12px; font-weight: 600; margin-bottom: 4px; color: #374151; }
  .form-group input, .form-group select, .form-group textarea { width: 100%; padding: 8px 10px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 13px; box-sizing: border-box; }
  .form-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 16px; }
  .reorder-section { margin-top: 16px; padding-top: 16px; border-top: 1px dashed #d1d5db; }
  .reorder-section h4 { font-size: 13px; font-weight: 600; margin: 0 0 10px; color: #6b7280; }
  @media(max-width: 768px) {
    .pm-main { padding: 12px; }
    .form-row { grid-template-columns: 1fr; }
    .pm-table { font-size: 12px; }
    .pm-table th, .pm-table td { padding: 8px 6px; }
  }
`;

const peso = (val) => `₱${Number(val || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;

// ---------- Product Modal ----------
 
function ProductModal({ open, onClose, onSave, editItem, vatOptions, unitCodes = [] }) {
  const [form, setForm] = useState({
    brand_name: '', generic_name: '', dosage_strength: '', sold_per: '',
    purchase_uom: '', selling_uom: '', conversion_factor: 1,
    purchase_price: '', selling_price: '', vat_status: 'VATABLE',
    category: '', description: '', key_benefits: '', image_url: '',
    reorder_min_qty: '', reorder_qty: '', safety_stock_qty: '', lead_time_days: ''
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editItem) {
      setForm({
        brand_name: editItem.brand_name || '',
        generic_name: editItem.generic_name || '',
        dosage_strength: editItem.dosage_strength || '',
        sold_per: editItem.sold_per || '',
        purchase_uom: editItem.purchase_uom || '',
        selling_uom: editItem.selling_uom || '',
        conversion_factor: editItem.conversion_factor ?? 1,
        purchase_price: editItem.purchase_price ?? '',
        selling_price: editItem.selling_price ?? '',
        vat_status: editItem.vat_status || 'VATABLE',
        category: editItem.category || '',
        description: editItem.description || '',
        key_benefits: editItem.key_benefits || '',
        image_url: editItem.image_url || '',
        reorder_min_qty: editItem.reorder_min_qty ?? '',
        reorder_qty: editItem.reorder_qty ?? '',
        safety_stock_qty: editItem.safety_stock_qty ?? '',
        lead_time_days: editItem.lead_time_days ?? ''
      });
    } else {
      setForm({
        brand_name: '', generic_name: '', dosage_strength: '', sold_per: '',
        purchase_uom: '', selling_uom: '', conversion_factor: 1,
        purchase_price: '', selling_price: '', vat_status: 'VATABLE',
        category: '', description: '', key_benefits: '', image_url: '',
        reorder_min_qty: '', reorder_qty: '', safety_stock_qty: '', lead_time_days: ''
      });
    }
  }, [editItem, open]);

  const set = (e) => setForm(f => ({ ...f, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const body = {
        ...form,
        purchase_price: Number(form.purchase_price),
        selling_price: Number(form.selling_price),
      };
      // Only include reorder fields if set
      if (form.reorder_min_qty !== '') body.reorder_min_qty = Number(form.reorder_min_qty);
      if (form.reorder_qty !== '') body.reorder_qty = Number(form.reorder_qty);
      if (form.safety_stock_qty !== '') body.safety_stock_qty = Number(form.safety_stock_qty);
      if (form.lead_time_days !== '') body.lead_time_days = Number(form.lead_time_days);
      await onSave(body, editItem?._id);
      onClose();
    } catch (err) {
      showError(err, 'Could not save product');
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <h3 className="modal-title">{editItem ? 'Edit Product' : 'New Product'}</h3>
        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <div className="form-group">
              <label>Brand Name *</label>
              <input name="brand_name" value={form.brand_name} onChange={set} required />
            </div>
            <div className="form-group">
              <label>Generic Name *</label>
              <input name="generic_name" value={form.generic_name} onChange={set} required />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Dosage / Strength *</label>
              <input name="dosage_strength" value={form.dosage_strength} onChange={set} required />
            </div>
            <div className="form-group">
              <label>Sold Per (unit)</label>
              <input name="sold_per" value={form.sold_per} onChange={set} placeholder="e.g. BOX, BOTTLE, VIAL" />
            </div>
          </div>
          <div className="form-row" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
            <div className="form-group">
              <label>Purchase UOM</label>
              <select name="purchase_uom" value={form.purchase_uom} onChange={set}>
                <option value="">Same as Sold Per</option>
                {unitCodes.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Selling UOM</label>
              <select name="selling_uom" value={form.selling_uom} onChange={set}>
                <option value="">Same as Sold Per</option>
                {unitCodes.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Conversion Factor</label>
              <input name="conversion_factor" type="number" min="1" step="1" value={form.conversion_factor} onChange={set} />
              {form.purchase_uom && form.selling_uom && form.conversion_factor > 1 && (
                <div style={{ fontSize: 11, color: '#92400e', marginTop: 2 }}>1 {form.purchase_uom} = {form.conversion_factor} {form.selling_uom}</div>
              )}
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Purchase Price</label>
              <input name="purchase_price" type="number" step="0.01" min="0" value={form.purchase_price} onChange={set} />
            </div>
            <div className="form-group">
              <label>Selling Price</label>
              <input name="selling_price" type="number" step="0.01" min="0" value={form.selling_price} onChange={set} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>VAT Status</label>
              <select name="vat_status" value={form.vat_status} onChange={set}>
                {vatOptions.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Category</label>
              <input name="category" value={form.category} onChange={set} placeholder="e.g. Antibiotics, Vitamins" />
            </div>
          </div>
          <div className="form-group">
            <label>Description</label>
            <textarea name="description" value={form.description} onChange={set} rows={2} />
          </div>
          <div className="form-group">
            <label>Key Benefits</label>
            <textarea name="key_benefits" value={form.key_benefits} onChange={set} rows={2} />
          </div>

          <div className="reorder-section">
            <h4>Reorder Rules (Optional)</h4>
            <div className="form-row">
              <div className="form-group">
                <label>Reorder Point (Min Qty)</label>
                <input name="reorder_min_qty" type="number" min="0" value={form.reorder_min_qty} onChange={set} />
              </div>
              <div className="form-group">
                <label>Reorder Qty</label>
                <input name="reorder_qty" type="number" min="1" value={form.reorder_qty} onChange={set} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Safety Stock Qty</label>
                <input name="safety_stock_qty" type="number" min="0" value={form.safety_stock_qty} onChange={set} />
              </div>
              <div className="form-group">
                <label>Lead Time (days)</label>
                <input name="lead_time_days" type="number" min="0" value={form.lead_time_days} onChange={set} />
              </div>
            </div>
          </div>

          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving...' : editItem ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
 

// ---------- Main Page ----------

const DEACTIVATE_ROLES = ['admin', 'finance', 'president'];

export function ProductMasterPageContent({ stockType: fixedStockType } = {}) {
  const api = useErpApi();
  const { user } = useAuth();
  const { hasSubPermission } = useErpSubAccess();
  const canAddEdit = hasSubPermission('purchasing', 'product_manage');
  const canDeactivateDelete = DEACTIVATE_ROLES.includes(user?.role);
  const { getWarehouses } = useWarehouses();
  const { entities, workingEntityId, loaded: entityLoaded, isMultiEntity } = useWorkingEntity();
  const { data: lookups } = useLookupBatch(['VAT_TYPE', 'STOCK_TYPE', 'UNIT_CODE']);
  const VAT_OPTIONS = (lookups.VAT_TYPE || []).map(o => o.code);
  const STOCK_TYPES = (lookups.STOCK_TYPE || []).map(o => o.code);
  const unitCodeOpts = lookups.UNIT_CODE || [];
  const entityReady = entityLoaded && (!isMultiEntity || !!workingEntityId);
  const currentEntity = entities.find((entity) => entity._id === workingEntityId) || null;
  const currentEntityLabel = currentEntity?.short_name || currentEntity?.entity_name || '';
  const [products, setProducts] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ACTIVE');
  const [stockTypeFilter, setStockTypeFilter] = useState(fixedStockType || '');
  const [page, setPage] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const limit = 50;

  // Tag to Warehouse state
  const [tagModal, setTagModal] = useState(false);
  const [warehouses, setWarehouses] = useState([]);
  const [tagWarehouseId, setTagWarehouseId] = useState('');
  const [selectedProducts, setSelectedProducts] = useState([]);

  // Price import/export
  const fileInputRef = useRef(null);
  const [importing, setImporting] = useState(false);

  // Refresh Product Master from CSV
  const refreshFileRef = useRef(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshResult, setRefreshResult] = useState(null);

  useEffect(() => {
    if (!entityReady) {
      setWarehouses([]);
      return;
    }

    getWarehouses({ limit: 0 }).then(res => setWarehouses(res?.data || [])).catch(() => {});
  }, [entityReady, workingEntityId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setSelectedProducts([]);
    setTagWarehouseId('');
    setTagModal(false);
    setPage(1);
  }, [workingEntityId]);

  const toggleSelect = (id) => setSelectedProducts(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const toggleSelectAll = () => {
    if (selectedProducts.length === products.length) setSelectedProducts([]);
    else setSelectedProducts(products.map(p => p._id));
  };

  const handleTagToWarehouse = async () => {
    if (!entityReady || !tagWarehouseId || !selectedProducts.length) return;
    try {
      const res = await api.post('/products/tag-warehouse', { product_ids: selectedProducts, warehouse_id: tagWarehouseId });
      showSuccess(res?.message || 'Tagged successfully');
      broadcastProductsChanged(workingEntityId);
      setTagModal(false);
      setSelectedProducts([]);
      setTagWarehouseId('');
    } catch (err) { showError(err, 'Could not tag products to warehouse'); }
  };

  const loadProducts = useCallback(async () => {
    if (!entityReady) {
      setProducts([]);
      setTotal(0);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const params = { page, limit, catalog: 'true' };
      if (search) params.q = search;
      if (statusFilter !== 'ALL') params.is_active = statusFilter === 'ACTIVE' ? 'true' : 'false';
      if (stockTypeFilter) params.stock_type = stockTypeFilter;
      const res = await api.get('/products', { params });
      setProducts(res?.data || []);
      setTotal(res?.pagination?.total || 0);
    } catch (err) { console.error('[ProductMaster] Load error:', err.message); setProducts([]); }
    finally { setLoading(false); }
  }, [entityReady, page, search, statusFilter, stockTypeFilter, workingEntityId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!entityReady) return;
    loadProducts();
  }, [entityReady, loadProducts]);

  useEffect(() => {
    if (!entityReady) return undefined;

    const revalidate = () => {
      if (document.visibilityState === 'hidden') return;
      loadProducts();
    };

    window.addEventListener('focus', revalidate);
    document.addEventListener('visibilitychange', revalidate);

    return () => {
      window.removeEventListener('focus', revalidate);
      document.removeEventListener('visibilitychange', revalidate);
    };
  }, [entityReady, loadProducts]);

  // Debounce search
  const [searchInput, setSearchInput] = useState('');
  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const handleSave = async (body, id) => {
    if (!entityReady) return;
    if (fixedStockType && !id) body.stock_type = fixedStockType;
    if (id) await api.put(`/products/${id}`, body);
    else await api.post('/products', body);
    broadcastProductsChanged(workingEntityId);
    loadProducts();
  };

  const handleDeactivate = async (id, name) => {
    if (!window.confirm(`Deactivate "${name}"? This will hide it from dropdowns.`)) return;
    try {
      await api.patch(`/products/${id}/deactivate`);
      broadcastProductsChanged(workingEntityId);
      loadProducts();
    } catch (err) {
      showError(err, 'Could not deactivate product');
    }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Permanently DELETE "${name}"?\n\nThis cannot be undone. Only works if the product has no inventory transactions.`)) return;
    try {
      await api.del(`/products/${id}`);
      showSuccess(`"${name}" deleted`);
      broadcastProductsChanged(workingEntityId);
      loadProducts();
    } catch (err) {
      showError(err, 'Could not delete product');
    }
  };

  const handleExportPrices = async () => {
    if (!entityReady) return;
    try {
      const blob = await api.get('/products/export-prices', { responseType: 'blob' });
      const url = window.URL.createObjectURL(blob instanceof Blob ? blob : new Blob([blob]));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'product_prices.xlsx';
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) { showError(err, 'Could not export prices'); }
  };

  const handleImportPrices = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !entityReady) return;
    setImporting(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      // Let axios auto-detect Content-Type boundary from FormData
      const res = await api.put('/products/import-prices', formData, {
        headers: { 'Content-Type': undefined }
      });
      const msg = `Updated ${res?.data?.updated || 0} product(s).`;
      const errs = res?.data?.errors || [];
      if (errs.length) showError(null, `${msg} Errors: ${errs.map(e => `Row ${e.row}: ${e.message}`).join('; ')}`);
      else showSuccess(msg);
      broadcastProductsChanged(workingEntityId);
      loadProducts();
    } catch (err) { showError(err, 'Could not import prices'); }
    finally { setImporting(false); if (fileInputRef.current) fileInputRef.current.value = ''; }
  };

  const handleRefreshProducts = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !entityReady) return;
    if (!window.confirm('This will refresh ALL products from the uploaded file.\n\n- Matching products will be updated\n- New products will be created\n- Duplicates will be deactivated\n- Products not in the file will be deactivated\n\nContinue?')) {
      if (refreshFileRef.current) refreshFileRef.current.value = '';
      return;
    }
    setRefreshing(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.put('/products/refresh', formData, {
        headers: { 'Content-Type': undefined }
      });
      setRefreshResult(res?.data || {});
      broadcastProductsChanged(workingEntityId);
      loadProducts();
    } catch (err) { showError(err, 'Could not refresh products'); }
    finally { setRefreshing(false); if (refreshFileRef.current) refreshFileRef.current.value = ''; }
  };

  const totalPages = Math.ceil(total / limit);
  const margin = (p) => peso(p.selling_price - p.purchase_price);

  return (
    <>
      <style>{pageStyles}</style>
          <WorkflowGuide pageKey="product-master" />
          <div className="pm-header">
            <div>
              <h1>{fixedStockType === 'FNB' ? 'F&B Product Master' : 'Product Master'}</h1>
              <p>{fixedStockType === 'FNB' ? 'Food & Beverage catalog — pricing, VAT' : 'ERP product catalog — pricing, VAT, reorder rules'}</p>
              {isMultiEntity && currentEntityLabel && (
                <p style={{ marginTop: 6 }}>Working entity: <strong>{currentEntityLabel}</strong></p>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {canAddEdit && (
                <>
                  <button className="btn btn-secondary" onClick={handleExportPrices} disabled={!entityReady}>Export Prices</button>
                  <button className="btn btn-secondary" onClick={() => fileInputRef.current?.click()} disabled={importing || !entityReady}>
                    {importing ? 'Importing...' : 'Import Prices'}
                  </button>
                  <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleImportPrices} style={{ display: 'none' }} />
                  <button className="btn btn-secondary" onClick={() => refreshFileRef.current?.click()} disabled={refreshing || !entityReady} style={{ background: '#f59e0b', color: '#fff', border: 'none' }}>
                    {refreshing ? 'Refreshing...' : 'Refresh Master'}
                  </button>
                  <input ref={refreshFileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleRefreshProducts} style={{ display: 'none' }} />
                </>
              )}
              {canAddEdit && selectedProducts.length > 0 && (
                <button className="btn btn-secondary" onClick={() => setTagModal(true)} disabled={!entityReady}>
                  Tag {selectedProducts.length} to Warehouse
                </button>
              )}
              {canAddEdit && (
                <button className="btn btn-primary" onClick={() => { setEditItem(null); setShowModal(true); }} disabled={!entityReady}>
                  + New Product
                </button>
              )}
            </div>
          </div>

          <div className="pm-controls">
            <input
              placeholder="Search brand or generic name..."
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
            />
            <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}>
              {STATUS_FILTER.map(s => <option key={s} value={s}>{s === 'ALL' ? 'All Status' : s}</option>)}
            </select>
            {!fixedStockType && (
              <select value={stockTypeFilter} onChange={e => { setStockTypeFilter(e.target.value); setPage(1); }}>
                <option value="">All Types</option>
                {STOCK_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            )}
            <span className="pm-count">{total} product{total !== 1 ? 's' : ''}</span>
          </div>

          <div className="pm-panel" style={{ overflowX: 'auto' }}>
            {!entityReady ? (
              <div className="pm-empty">Loading working entity...</div>
            ) : loading ? (
              <div className="pm-empty">Loading products...</div>
            ) : products.length === 0 ? (
              <div className="pm-empty">No products found.</div>
            ) : (
              <table className="pm-table">
                <thead>
                  <tr>
                    <th style={{ width: 36 }}><input type="checkbox" checked={selectedProducts.length === products.length && products.length > 0} onChange={toggleSelectAll} style={{ width: 'auto' }} /></th>
                    <th>Product</th>
                    <th>Unit</th>
                    <th style={{ textAlign: 'right' }}>Purchase</th>
                    <th style={{ textAlign: 'right' }}>Selling</th>
                    <th style={{ textAlign: 'right' }}>Margin</th>
                    <th>VAT</th>
                    <th>Status</th>
                    <th>Reorder</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map(p => {
                    const isInherited = workingEntityId && p.entity_id && p.entity_id.toString() !== workingEntityId.toString();
                    return (
                    <tr key={p._id} style={isInherited ? { opacity: 0.85 } : undefined}>
                      <td><input type="checkbox" checked={selectedProducts.includes(p._id)} onChange={() => toggleSelect(p._id)} style={{ width: 'auto' }} disabled={isInherited} /></td>
                      <td>
                        <div className="pm-brand">
                          {p.brand_name}
                          {isInherited && <span className="badge badge-inherited" style={{ marginLeft: 6, fontSize: 10 }}>Parent</span>}
                        </div>
                        <div className="pm-generic">{p.generic_name}</div>
                        {p.dosage_strength && <div className="pm-dosage">{p.dosage_strength}</div>}
                      </td>
                      <td>{p.unit_code || p.sold_per || '-'}</td>
                      <td className="pm-price">{peso(p.purchase_price)}</td>
                      <td className="pm-price">{peso(p.selling_price)}</td>
                      <td className="pm-price">{margin(p)}</td>
                      <td>
                        <span className={`badge ${p.vat_status === 'VATABLE' ? 'badge-vat' : p.vat_status === 'EXEMPT' ? 'badge-exempt' : 'badge-zero'}`}>
                          {p.vat_status}
                        </span>
                      </td>
                      <td>
                        <span className={`badge ${p.is_active ? 'badge-active' : 'badge-inactive'}`}>
                          {p.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td style={{ fontSize: 12, color: '#6b7280' }}>
                        {p.reorder_min_qty != null ? `Min: ${p.reorder_min_qty}` : '-'}
                        {p.reorder_qty != null ? ` / Qty: ${p.reorder_qty}` : ''}
                      </td>
                      <td>
                        {isInherited ? (
                          <span style={{ fontSize: 11, color: '#6b7280' }}>Managed by parent</span>
                        ) : (
                        <div style={{ display: 'flex', gap: 4 }}>
                          {canAddEdit && <button className="btn btn-secondary" onClick={() => { setEditItem(p); setShowModal(true); }}>Edit</button>}
                          {canDeactivateDelete && p.is_active && (
                            <button className="btn btn-danger" onClick={() => handleDeactivate(p._id, p.brand_name)}>Deactivate</button>
                          )}
                          {canDeactivateDelete && (
                            <button className="btn btn-outline" onClick={() => handleDelete(p._id, p.brand_name)} style={{ color: '#991b1b', borderColor: '#fca5a5', fontSize: 11 }}>Delete</button>
                          )}
                        </div>
                        )}
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16 }}>
              <button className="btn btn-secondary" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Prev</button>
              <span style={{ padding: '6px 12px', fontSize: 13 }}>Page {page} of {totalPages}</span>
              <button className="btn btn-secondary" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</button>
            </div>
          )}

          <ProductModal
            open={showModal}
            onClose={() => { setShowModal(false); setEditItem(null); }}
            onSave={handleSave}
            editItem={editItem}
            vatOptions={VAT_OPTIONS}
            unitCodes={unitCodeOpts.map(o => o.code || o)}
          />

          {/* Tag to Warehouse Modal */}
          {tagModal && (
            <div className="modal-overlay" onClick={() => setTagModal(false)}>
              <div className="modal-box" onClick={e => e.stopPropagation()} style={{ width: 420 }}>
                <h3 className="modal-title">Tag Products to Warehouse</h3>
                <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 16px' }}>
                  {selectedProducts.length} product(s) selected. Choose a warehouse to tag them to.
                </p>
                <div className="form-group">
                  <label>Warehouse</label>
                  <select value={tagWarehouseId} onChange={e => setTagWarehouseId(e.target.value)} style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13 }}>
                    <option value="">Select warehouse...</option>
                    {warehouses.map(w => (
                      <option key={w._id} value={w._id}>{w.warehouse_code} — {w.warehouse_name}</option>
                    ))}
                  </select>
                </div>
                <div className="form-actions">
                  <button className="btn btn-secondary" onClick={() => setTagModal(false)}>Cancel</button>
                  <button className="btn btn-primary" disabled={!tagWarehouseId} onClick={handleTagToWarehouse}>Tag to Warehouse</button>
                </div>
              </div>
            </div>
          )}

          {refreshResult && (
            <div className="modal-overlay" onClick={() => setRefreshResult(null)}>
              <div className="modal-box" onClick={e => e.stopPropagation()} style={{ width: 520, maxHeight: '80vh', overflowY: 'auto' }}>
                <h3 className="modal-title">Product Master Refresh Results</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, margin: '16px 0' }}>
                  <div style={{ background: '#f0fdf4', padding: 12, borderRadius: 8, textAlign: 'center' }}>
                    <div style={{ fontSize: 24, fontWeight: 700, color: '#166534' }}>{refreshResult.updated || 0}</div>
                    <div style={{ fontSize: 11, color: '#6b7280' }}>Updated</div>
                  </div>
                  <div style={{ background: '#eff6ff', padding: 12, borderRadius: 8, textAlign: 'center' }}>
                    <div style={{ fontSize: 24, fontWeight: 700, color: '#1e40af' }}>{refreshResult.created || 0}</div>
                    <div style={{ fontSize: 11, color: '#6b7280' }}>Created</div>
                  </div>
                  <div style={{ background: '#fef3c7', padding: 12, borderRadius: 8, textAlign: 'center' }}>
                    <div style={{ fontSize: 24, fontWeight: 700, color: '#92400e' }}>{refreshResult.csv_duplicates_merged || 0}</div>
                    <div style={{ fontSize: 11, color: '#6b7280' }}>CSV Duplicates Merged</div>
                  </div>
                  <div style={{ background: '#fef2f2', padding: 12, borderRadius: 8, textAlign: 'center' }}>
                    <div style={{ fontSize: 24, fontWeight: 700, color: '#991b1b' }}>{(refreshResult.duplicates_deactivated || 0) + (refreshResult.stale_deactivated || 0)}</div>
                    <div style={{ fontSize: 11, color: '#6b7280' }}>Deactivated</div>
                  </div>
                </div>
                <p style={{ fontSize: 13, color: '#6b7280', margin: '8px 0' }}>
                  CSV rows: {refreshResult.csv_rows || 0} | Unique products: {refreshResult.unique_products || 0}
                </p>
                {refreshResult.errors?.length > 0 && (
                  <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: 12, marginTop: 8 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: '#991b1b', marginBottom: 6 }}>Errors ({refreshResult.errors.length})</div>
                    {refreshResult.errors.slice(0, 20).map((err, i) => (
                      <div key={i} style={{ fontSize: 12, color: '#7f1d1d', margin: '2px 0' }}>{err.brand} {err.dosage}: {err.message}</div>
                    ))}
                    {refreshResult.errors.length > 20 && <div style={{ fontSize: 12, color: '#9ca3af' }}>...and {refreshResult.errors.length - 20} more</div>}
                  </div>
                )}
                <div className="form-actions" style={{ marginTop: 16 }}>
                  <button className="btn btn-primary" onClick={() => setRefreshResult(null)}>Close</button>
                </div>
              </div>
            </div>
          )}
    </>
  );
}
 

export default function ProductMasterPage() {
  return (
    <div className="pm-page">
      <Navbar />
      <div style={{ display: 'flex' }}>
        <Sidebar />
        <div className="pm-main">
          <ProductMasterPageContent />
        </div>
      </div>
    </div>
  );
}
