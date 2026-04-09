import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import { useAuth } from '../../hooks/useAuth';
import { ROLES } from '../../constants/roles';
import useTransfers from '../hooks/useTransfers';
import { showError } from '../utils/errorToast';
import SelectField from '../../components/common/Select';
import WorkflowGuide from '../components/WorkflowGuide';

const pageStyles = `
  .tpm-page { background: var(--erp-bg, #f4f7fb); }
  .tpm-main { flex:1; min-width:0; overflow-y:auto; padding:24px; }
  .tpm-inner { max-width:1100px; margin:0 auto; }
  .tpm-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; flex-wrap:wrap; gap:12px; }
  .tpm-header h1 { font-size:22px; margin:0; color:var(--erp-text,#132238); }

  .tpm-toolbar { display:flex; gap:10px; margin-bottom:16px; flex-wrap:wrap; align-items:center; }
  .tpm-toolbar select { padding:8px 12px; border:1px solid var(--erp-border,#dbe4f0); border-radius:8px; font-size:13px; background:var(--erp-panel,#fff); height:38px; }

  .tpm-search { padding:8px 12px; border:1px solid var(--erp-border,#dbe4f0); border-radius:8px; font-size:13px; background:var(--erp-panel,#fff); height:38px; min-width:220px; }
  .tpm-search:focus { outline:none; border-color:var(--erp-accent,#1e5eff); box-shadow:0 0 0 2px rgba(30,94,255,.12); }

  .tpm-stats { display:flex; gap:16px; margin-bottom:16px; flex-wrap:wrap; }
  .tpm-stat { padding:10px 16px; background:var(--erp-panel,#fff); border:1px solid var(--erp-border); border-radius:10px; font-size:13px; }
  .tpm-stat strong { display:block; font-size:18px; margin-top:2px; }

  .price-table { width:100%; border-collapse:collapse; font-size:13px; background:var(--erp-panel,#fff); border:1px solid var(--erp-border); border-radius:12px; overflow:hidden; }
  .price-table th { background:var(--erp-accent-soft,#e8efff); padding:10px 14px; text-align:left; font-weight:600; white-space:nowrap; position:sticky; top:0; z-index:1; }
  .price-table td { padding:8px 14px; border-top:1px solid var(--erp-border); }
  .price-table tr:hover { background:rgba(30,94,255,.03); }
  .price-table tr.row-unset { background:rgba(251,191,36,.04); }
  .price-table tr.row-changed { background:rgba(22,163,74,.04); }

  .tp-input { width:100px; padding:5px 8px; border:1px solid #dbe4f0; border-radius:6px; font-size:13px; text-align:right; transition:border-color .15s; }
  .tp-input:focus { outline:none; border-color:var(--erp-accent,#1e5eff); box-shadow:0 0 0 2px rgba(30,94,255,.12); }
  .tp-input.changed { border-color:#16a34a; background:rgba(22,163,74,.04); }
  .tp-input.unset { border-color:#f59e0b; }

  .badge-unset { display:inline-block; padding:2px 8px; background:#fef3c7; color:#92400e; border-radius:4px; font-size:11px; font-weight:600; }

  .btn { padding:8px 18px; border:none; border-radius:8px; font-size:13px; font-weight:600; cursor:pointer; transition:opacity .15s; }
  .btn:disabled { opacity:.5; cursor:not-allowed; }
  .btn-primary { background:var(--erp-accent,#1e5eff); color:#fff; }
  .btn-primary:hover:not(:disabled) { opacity:.9; }
  .btn-outline { background:transparent; border:1px solid var(--erp-border); color:var(--erp-text); }
  .btn-outline:hover:not(:disabled) { background:var(--erp-accent-soft,#e8efff); }

  .tpm-actions { display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
  .save-msg { font-size:12px; padding:6px 12px; border-radius:6px; }
  .save-msg.success { background:#dcfce7; color:#166534; }
  .save-msg.error { background:#fef2f2; color:#991b1b; }

  .empty-state { text-align:center; padding:60px 20px; color:#94a3b8; }

  .table-wrap { max-height:calc(100vh - 300px); overflow-y:auto; border-radius:12px; border:1px solid var(--erp-border); }
  .table-wrap .price-table { border:none; border-radius:0; }

  .tp-meta { font-size:11px; color:#94a3b8; }

  @media(max-width:768px) {
    .tpm-main { padding:16px; }
    .price-table { font-size:11px; }
    .tp-input { width:80px; }
    .tpm-search { min-width:160px; }
  }
`;

export function TransferPriceManagerContent() {
  const { user } = useAuth();
  const { getTransferPriceProducts, bulkSetTransferPrices, getEntities, loading: _loading } = useTransfers(); // eslint-disable-line no-unused-vars

  const [entities, setEntities] = useState([]);
  const [products, setProducts] = useState([]);
  const [sourceId, setSourceId] = useState('');
  const [targetId, setTargetId] = useState('');
  const [search, setSearch] = useState('');
  const [prices, setPrices] = useState({}); // product_id → transfer_price (local edits)
  const [origPrices, setOrigPrices] = useState({}); // product_id → original transfer_price
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null); // { text, type: 'success'|'error' }
  const [fetching, setFetching] = useState(false);
  const searchRef = useRef(null);

  const isPresidentOrAdmin = [ROLES.PRESIDENT, ROLES.CEO, ROLES.ADMIN].includes(user?.role);

  // Load entities, auto-select VIP → MG AND CO.
  useEffect(() => {
    (async () => {
      try {
        const res = await getEntities();
        const list = res.data || [];
        setEntities(list);
        // Auto-select: PARENT as source, first SUBSIDIARY as target
        const parent = list.find(e => e.entity_type === 'PARENT');
        const sub = list.find(e => e.entity_type === 'SUBSIDIARY');
        if (parent) setSourceId(parent._id);
        if (sub) setTargetId(sub._id);
      } catch (err) { showError(err, 'Could not load entities'); }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch products when entity pair changes
  const fetchProducts = useCallback(async () => {
    if (!sourceId || !targetId) return;
    setFetching(true);
    try {
      const res = await getTransferPriceProducts({ source_entity_id: sourceId, target_entity_id: targetId });
      const data = res.data || [];
      setProducts(data);
      // Initialize local price state
      const initial = {};
      const orig = {};
      for (const p of data) {
        const key = p.product_id;
        initial[key] = p.transfer_price ?? '';
        orig[key] = p.transfer_price ?? '';
      }
      setPrices(initial);
      setOrigPrices(orig);
    } catch (err) { console.error('Failed to fetch transfer price products:', err); }
    setFetching(false);
  }, [sourceId, targetId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchProducts(); }, [fetchProducts]);

  // Local price change
  const handlePriceChange = (productId, value) => {
    setPrices(prev => ({ ...prev, [productId]: value }));
    setMsg(null);
  };

  // Filter by search
  const filtered = useMemo(() => {
    if (!search.trim()) return products;
    const q = search.toLowerCase();
    return products.filter(p =>
      p.brand_name?.toLowerCase().includes(q) ||
      p.generic_name?.toLowerCase().includes(q) ||
      p.dosage_strength?.toLowerCase().includes(q)
    );
  }, [products, search]);

  // Count changes
  const changedItems = useMemo(() => {
    return products.filter(p => {
      const current = prices[p.product_id];
      const orig = origPrices[p.product_id];
      return current !== '' && current !== orig && parseFloat(current) > 0;
    });
  }, [products, prices, origPrices]);

  const unsetCount = useMemo(() =>
    products.filter(p => !origPrices[p.product_id] && origPrices[p.product_id] !== 0).length
  , [products, origPrices]);

  // Bulk save
  const handleBulkSave = async () => {
    if (!changedItems.length) return;
    setSaving(true);
    setMsg(null);
    try {
      const items = changedItems.map(p => ({
        product_id: p.product_id,
        transfer_price: parseFloat(prices[p.product_id])
      }));
      const res = await bulkSetTransferPrices({
        source_entity_id: sourceId,
        target_entity_id: targetId,
        items
      });
      setMsg({ text: res.message || `${items.length} prices saved`, type: 'success' });
      // Refresh to get updated effective dates
      await fetchProducts();
    } catch (err) {
      setMsg({ text: err.response?.data?.message || 'Save failed', type: 'error' });
    }
    setSaving(false);
  };

  // Reset unsaved changes
  const handleReset = () => {
    setPrices({ ...origPrices });
    setMsg(null);
  };

  return (
    <>
      <style>{pageStyles}</style>
      <WorkflowGuide pageKey="transfer-price-manager" />
      <div className="tpm-inner">
        <div className="tpm-header">
          <h1>Transfer Price Manager</h1>
          <p style={{ fontSize: 13, color: '#94a3b8', margin: 0 }}>
            Set a transfer price to tag a product to an entity. Clear the price to untag.
          </p>
        </div>

        {/* Entity selectors */}
        <div className="tpm-toolbar">
          <SelectField value={sourceId} onChange={e => setSourceId(e.target.value)} style={{ minWidth: 200 }}>
            <option value="">Source Entity...</option>
            {entities.map(e => <option key={e._id} value={e._id}>{e.entity_name}</option>)}
          </SelectField>
          <span style={{ color: '#94a3b8', fontSize: 18 }}>→</span>
          <SelectField value={targetId} onChange={e => setTargetId(e.target.value)} style={{ minWidth: 200 }}>
            <option value="">Target Entity...</option>
            {entities.filter(e => e._id !== sourceId).map(e => <option key={e._id} value={e._id}>{e.entity_name}</option>)}
          </SelectField>
          <div style={{ flex: 1 }} />
          <input
            ref={searchRef}
            className="tpm-search"
            type="text"
            placeholder="Search brand or generic name..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {/* Stats bar */}
        {products.length > 0 && (
          <div className="tpm-stats">
            <div className="tpm-stat">
              Total Products
              <strong>{products.length}</strong>
            </div>
            <div className="tpm-stat">
              Priced
              <strong style={{ color: '#16a34a' }}>{products.length - unsetCount}</strong>
            </div>
            <div className="tpm-stat">
              Unset
              <strong style={{ color: unsetCount > 0 ? '#f59e0b' : '#16a34a' }}>{unsetCount}</strong>
            </div>
            {changedItems.length > 0 && (
              <div className="tpm-stat" style={{ borderColor: '#16a34a' }}>
                Unsaved Changes
                <strong style={{ color: '#1e5eff' }}>{changedItems.length}</strong>
              </div>
            )}
          </div>
        )}

        {/* Actions bar */}
        {isPresidentOrAdmin && products.length > 0 && (
          <div className="tpm-actions" style={{ marginBottom: 16 }}>
            <button
              className="btn btn-primary"
              disabled={!changedItems.length || saving}
              onClick={handleBulkSave}
            >
              {saving ? 'Saving...' : `Save ${changedItems.length} Change${changedItems.length !== 1 ? 's' : ''}`}
            </button>
            {changedItems.length > 0 && (
              <button className="btn btn-outline" onClick={handleReset} disabled={saving}>
                Reset
              </button>
            )}
            {msg && <span className={`save-msg ${msg.type}`}>{msg.text}</span>}
          </div>
        )}

        {/* Table */}
        {(!sourceId || !targetId) ? (
          <div className="empty-state">Select source and target entities to manage transfer prices</div>
        ) : fetching ? (
          <div className="empty-state">Loading products...</div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">{search ? 'No products match your search' : 'No products found for this entity'}</div>
        ) : (
          <div className="table-wrap">
            <table className="price-table">
              <thead>
                <tr>
                  <th style={{ width: 40 }}>#</th>
                  <th>Brand Name</th>
                  <th>Generic Name</th>
                  <th>Dosage</th>
                  <th>Unit</th>
                  <th style={{ textAlign: 'right' }}>Selling ₱</th>
                  <th style={{ textAlign: 'right' }}>Purchase ₱</th>
                  <th style={{ textAlign: 'right', minWidth: 130 }}>Transfer ₱</th>
                  <th>Last Set</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p, i) => {
                  const key = p.product_id;
                  const localVal = prices[key] ?? '';
                  const origVal = origPrices[key] ?? '';
                  const isChanged = localVal !== '' && localVal !== origVal && parseFloat(localVal) > 0;
                  const isUnset = !origVal && origVal !== 0;

                  return (
                    <tr key={key} className={isChanged ? 'row-changed' : isUnset ? 'row-unset' : ''}>
                      <td style={{ color: '#94a3b8' }}>{i + 1}</td>
                      <td style={{ fontWeight: 600 }}>{p.brand_name || '—'}</td>
                      <td>{p.generic_name || '—'}</td>
                      <td>{p.dosage_strength || '—'}</td>
                      <td>{p.unit_code || '—'}</td>
                      <td style={{ textAlign: 'right' }}>{(p.selling_price || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                      <td style={{ textAlign: 'right' }}>{(p.purchase_price || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                      <td style={{ textAlign: 'right' }}>
                        {isPresidentOrAdmin ? (
                          <input
                            className={`tp-input${isChanged ? ' changed' : isUnset && !localVal ? ' unset' : ''}`}
                            type="number"
                            min="0"
                            step="0.01"
                            value={localVal}
                            placeholder="0.00"
                            onChange={e => handlePriceChange(key, e.target.value)}
                          />
                        ) : (
                          localVal ? `₱${parseFloat(localVal).toLocaleString(undefined, { minimumFractionDigits: 2 })}` :
                          <span className="badge-unset">Not Set</span>
                        )}
                      </td>
                      <td>
                        {p.effective_date ? (
                          <span className="tp-meta">
                            {new Date(p.effective_date).toLocaleDateString()}
                            {p.set_by?.name ? ` — ${p.set_by.name}` : ''}
                          </span>
                        ) : (
                          <span className="badge-unset">New</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

export default function TransferPriceManager() {
  return (
    <div className="tpm-page" style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />
      <div className="tpm-main">
        <Navbar />
        <TransferPriceManagerContent />
      </div>
    </div>
  );
}
