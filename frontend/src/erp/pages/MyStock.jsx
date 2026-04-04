import { useState, useEffect, useCallback } from 'react';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import { useAuth } from '../../hooks/useAuth';
import useInventory from '../hooks/useInventory';
import useEntities from '../hooks/useEntities';
import EntityBadge from '../components/EntityBadge';

const TABS = ['Stock on Hand', 'Transaction Ledger', 'Variance Report', 'Alerts'];

const TYPE_COLORS = {
  OPENING_BALANCE: { bg: '#dbeafe', text: '#1e40af' },
  GRN: { bg: '#dcfce7', text: '#166534' },
  RETURN_IN: { bg: '#dcfce7', text: '#166534' },
  TRANSFER_IN: { bg: '#dcfce7', text: '#166534' },
  CSI: { bg: '#fef2f2', text: '#991b1b' },
  DR_SAMPLING: { bg: '#fef2f2', text: '#991b1b' },
  DR_CONSIGNMENT: { bg: '#fef2f2', text: '#991b1b' },
  TRANSFER_OUT: { bg: '#e2e8f0', text: '#475569' },
  ADJUSTMENT: { bg: '#fef3c7', text: '#92400e' }
};

const pageStyles = `
  .mystock-page { background: var(--erp-bg, #f4f7fb); min-height: 100vh; }
  .mystock-main {
    flex: 1;
    min-width: 0;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    padding: 20px;
    padding-bottom: calc(24px + env(safe-area-inset-bottom, 0px));
    max-width: 1200px;
    margin: 0 auto;
  }
  .mystock-header { margin-bottom: 16px; }
  .mystock-header h1 { font-size: 22px; color: var(--erp-text, #132238); margin: 0 0 4px; }
  .mystock-header p { color: var(--erp-muted, #5f7188); font-size: 14px; margin: 0; }

  .summary-bar { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin-bottom: 20px; }
  .summary-card { background: var(--erp-panel, #fff); border: 1px solid var(--erp-border, #dbe4f0); border-radius: 12px; padding: 16px; text-align: center; }
  .summary-card .value { font-size: 24px; font-weight: 700; color: var(--erp-text); }
  .summary-card .label { font-size: 12px; color: var(--erp-muted); text-transform: uppercase; letter-spacing: 0.05em; margin-top: 4px; }

  .tab-bar { display: flex; gap: 0; border-bottom: 2px solid var(--erp-border, #dbe4f0); margin-bottom: 16px; }
  .tab-btn { padding: 10px 20px; border: none; background: none; font-size: 14px; font-weight: 600; color: var(--erp-muted); cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -2px; }
  .tab-btn.active { color: var(--erp-accent, #1e5eff); border-bottom-color: var(--erp-accent); }

  .stock-table { width: 100%; border-collapse: collapse; font-size: 13px; background: var(--erp-panel); border: 1px solid var(--erp-border); border-radius: 12px; overflow: hidden; }
  .stock-table th { background: var(--erp-accent-soft, #e8efff); padding: 10px 12px; text-align: left; font-weight: 600; color: var(--erp-text); }
  .stock-table td { padding: 10px 12px; border-top: 1px solid var(--erp-border); }
  .stock-table tr.expandable { cursor: pointer; }
  .stock-table tr.expandable:hover { background: var(--erp-accent-soft); }
  .stock-table tr.batch-row td { padding: 6px 12px 6px 40px; background: var(--erp-bg); font-size: 12px; }

  .near-expiry { background: #fef2f2; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 600; }
  .badge-ok { background: #dcfce7; color: #166534; }
  .badge-warn { background: #fef3c7; color: #92400e; }
  .badge-error { background: #fef2f2; color: #991b1b; }

  .ledger-select { margin-bottom: 12px; }
  .ledger-select select { padding: 8px 12px; border: 1px solid var(--erp-border); border-radius: 8px; font-size: 14px; }

  .btn { padding: 8px 16px; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; }
  .btn-primary { background: var(--erp-accent, #1e5eff); color: #fff; }

  /* Physical Count Modal */
  .pc-modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 1000; display: flex; align-items: center; justify-content: center; padding: 16px; }
  .pc-modal { background: var(--erp-panel, #fff); border-radius: 16px; width: 100%; max-width: 640px; max-height: 90vh; overflow-y: auto; padding: 24px; position: relative; }
  .pc-modal h2 { margin: 0 0 4px; font-size: 18px; color: var(--erp-text); }
  .pc-modal .subtitle { font-size: 13px; color: var(--erp-muted); margin-bottom: 16px; }
  .pc-modal .close-btn { position: absolute; top: 12px; right: 16px; background: none; border: none; font-size: 22px; cursor: pointer; color: var(--erp-muted); }
  .pc-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .pc-table th { text-align: left; padding: 8px 10px; background: var(--erp-bg); font-weight: 600; color: var(--erp-muted); font-size: 11px; text-transform: uppercase; }
  .pc-table td { padding: 8px 10px; border-top: 1px solid var(--erp-border); }
  .pc-table input[type="number"] { width: 80px; padding: 6px 8px; border: 1px solid var(--erp-border); border-radius: 6px; font-size: 13px; text-align: right; }
  .pc-table input[type="number"]:focus { outline: none; border-color: var(--erp-accent); }
  .pc-variance { font-weight: 700; font-size: 12px; }
  .pc-variance.pos { color: #16a34a; }
  .pc-variance.neg { color: #dc2626; }
  .pc-variance.zero { color: var(--erp-muted); }
  .pc-actions { display: flex; gap: 8px; margin-top: 16px; justify-content: flex-end; }
  .pc-summary { margin-top: 12px; padding: 12px; background: var(--erp-bg); border-radius: 8px; font-size: 13px; color: var(--erp-text); }

  @media (max-width: 768px) {
    .summary-bar { grid-template-columns: repeat(2, 1fr); }
    .stock-table { font-size: 12px; }
    .tab-btn { padding: 8px 12px; font-size: 13px; }
    .pc-modal { padding: 16px; }
    .pc-table input[type="number"] { width: 60px; }
    .mystock-main { padding-bottom: calc(84px + env(safe-area-inset-bottom, 0px)); }

    .stock-table { border: none; background: transparent; }
    .stock-table thead { display: none; }
    .stock-table tbody { display: block; }
    .stock-table tr {
      display: block;
      background: var(--erp-panel, #fff);
      border: 1px solid var(--erp-border);
      border-radius: 12px;
      margin-bottom: 12px;
      overflow: hidden;
    }
    .stock-table tr.batch-row { border-style: dashed; }
    .stock-table td {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      padding: 10px 12px;
      border-top: 1px solid var(--erp-border);
      white-space: normal;
    }
    .stock-table td:first-child { border-top: none; }
    .stock-table td::before {
      content: attr(data-label);
      font-weight: 600;
      color: var(--erp-muted, #6b7280);
      flex-shrink: 0;
    }
    .stock-table td[data-label=""]::before {
      content: none;
    }
  }
`;

// --- Physical Count Modal ---
function PhysicalCountModal({ open, onClose, stockData, onSubmit, submitting }) {
  const [counts, setCounts] = useState([]);

  // Build editable rows from stockData batches when modal opens
  useEffect(() => {
    if (!open || !stockData?.length) { setCounts([]); return; }
    const rows = [];
    for (const item of stockData) {
      if (!item.batches?.length) continue;
      for (const batch of item.batches) {
        rows.push({
          product_id: item.product_id,
          brand_name: item.product?.brand_name || 'Unknown',
          dosage: item.product?.dosage_strength || '',
          batch_lot_no: batch.batch_lot_no,
          expiry_date: batch.expiry_date,
          system_qty: batch.available_qty,
          actual_qty: String(batch.available_qty) // pre-fill with system qty
        });
      }
    }
    setCounts(rows);
  }, [open, stockData]);

  const updateActual = (idx, val) => {
    setCounts(prev => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], actual_qty: val };
      return updated;
    });
  };

  const getVariance = (row) => {
    const actual = parseFloat(row.actual_qty);
    if (isNaN(actual)) return null;
    return actual - row.system_qty;
  };

  const adjustedRows = counts.filter(r => {
    const v = getVariance(r);
    return v !== null && Math.abs(v) >= 0.01;
  });

  const handleSubmit = () => {
    const payload = adjustedRows.map(r => ({
      product_id: r.product_id,
      batch_lot_no: r.batch_lot_no,
      expiry_date: r.expiry_date,
      actual_qty: parseFloat(r.actual_qty)
    }));
    onSubmit(payload);
  };

  if (!open) return null;

  return (
    <div className="pc-modal-overlay" onClick={onClose}>
      <div className="pc-modal" onClick={e => e.stopPropagation()}>
        <button className="close-btn" onClick={onClose}>&times;</button>
        <h2>Physical Count</h2>
        <p className="subtitle">Enter actual quantities per batch. Variances will generate adjustment entries.</p>

        {counts.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--erp-muted)' }}>
            No stock batches to count. Receive stock first via GRN.
          </div>
        ) : (
          <>
            <table className="pc-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Batch</th>
                  <th>System</th>
                  <th>Actual</th>
                  <th>Variance</th>
                </tr>
              </thead>
              <tbody>
                {counts.map((row, idx) => {
                  const v = getVariance(row);
                  return (
                    <tr key={`${row.product_id}-${row.batch_lot_no}-${idx}`}>
                      <td>
                        <strong>{row.brand_name}</strong>
                        {row.dosage && <span style={{ color: 'var(--erp-muted)', marginLeft: 4, fontSize: 11 }}>{row.dosage}</span>}
                      </td>
                      <td style={{ fontSize: 12 }}>{row.batch_lot_no}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{row.system_qty}</td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          value={row.actual_qty}
                          onChange={e => updateActual(idx, e.target.value)}
                        />
                      </td>
                      <td>
                        {v !== null && (
                          <span className={`pc-variance ${v > 0 ? 'pos' : v < 0 ? 'neg' : 'zero'}`}>
                            {v > 0 ? '+' : ''}{v}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div className="pc-summary">
              <strong>{adjustedRows.length}</strong> batch{adjustedRows.length !== 1 ? 'es' : ''} with variance
              {adjustedRows.length === 0 && ' — no adjustments needed'}
            </div>

            <div className="pc-actions">
              <button className="btn" style={{ background: 'transparent', border: '1px solid var(--erp-border)', color: 'var(--erp-text)' }} onClick={onClose}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={handleSubmit}
                disabled={adjustedRows.length === 0 || submitting}
              >
                {submitting ? 'Submitting...' : `Submit ${adjustedRows.length} Adjustment${adjustedRows.length !== 1 ? 's' : ''}`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function MyStock() {
  const { user } = useAuth();
  const inventory = useInventory();
  const { getEntityById } = useEntities();
  const userEntity = getEntityById(user?.entity_id);

  const [activeTab, setActiveTab] = useState(0);
  const [stockData, setStockData] = useState([]);
  const [summary, setSummary] = useState({});
  const [expandedProduct, setExpandedProduct] = useState(null);
  const [ledgerProduct, setLedgerProduct] = useState('');
  const [ledgerEntries, setLedgerEntries] = useState([]);
  const [varianceData, setVarianceData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pcModalOpen, setPcModalOpen] = useState(false);
  const [pcSubmitting, setPcSubmitting] = useState(false);
  const [alertData, setAlertData] = useState({ expiry_alerts: [], reorder_alerts: [] });
  const [alertSummary, setAlertSummary] = useState({});

  // Load stock on mount
  useEffect(() => {
    loadStock();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadStock = async () => {
    setLoading(true);
    try {
      const res = await inventory.getMyStock();
      if (res?.data) setStockData(res.data);
      if (res?.summary) setSummary(res.summary);
    } catch {} finally { setLoading(false); }
  };

  const loadLedger = async (productId) => {
    if (!productId) return;
    setLoading(true);
    try {
      const res = await inventory.getLedger(productId, { limit: 100 });
      if (res?.data) setLedgerEntries(res.data);
    } catch {} finally { setLoading(false); }
  };

  const loadVariance = async () => {
    setLoading(true);
    try {
      const res = await inventory.getVariance();
      if (res?.data) setVarianceData(res.data);
    } catch {} finally { setLoading(false); }
  };

  const loadAlerts = async () => {
    setLoading(true);
    try {
      const res = await inventory.getAlerts();
      if (res?.data) setAlertData(res.data);
      if (res?.summary) setAlertSummary(res.summary);
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => {
    if (activeTab === 2) loadVariance();
    if (activeTab === 3) loadAlerts();
  }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleExpand = (productId) => {
    setExpandedProduct(prev => prev === productId ? null : productId);
  };

  const handleLedgerProductChange = (productId) => {
    setLedgerProduct(productId);
    if (productId) loadLedger(productId);
    else setLedgerEntries([]);
  };

  // Load batch details for all products before opening the physical count modal
  const openPhysicalCount = useCallback(async () => {
    setLoading(true);
    try {
      // Ensure batch data is loaded for each product
      const enriched = await Promise.all(
        stockData.map(async (item) => {
          if (item.batches?.length) return item;
          try {
            const res = await inventory.getBatches(item.product_id);
            return { ...item, batches: res?.data || [] };
          } catch { return item; }
        })
      );
      setStockData(enriched);
      setPcModalOpen(true);
    } catch {} finally { setLoading(false); }
  }, [stockData, inventory]); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePhysicalCountSubmit = useCallback(async (counts) => {
    setPcSubmitting(true);
    try {
      await inventory.recordPhysicalCount(counts);
      setPcModalOpen(false);
      // Reload stock + variance to reflect adjustments
      await loadStock();
      if (activeTab === 2) await loadVariance();
    } catch (err) {
      console.error('Physical count error:', err);
    } finally { setPcSubmitting(false); }
  }, [inventory, activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="admin-page erp-page mystock-page">
      <style>{pageStyles}</style>
      <Navbar />
      <div className="admin-layout">
        <Sidebar />
        <main className="mystock-main">
          <div className="mystock-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
            <div>
              <h1>My Stock {userEntity && <EntityBadge entity={userEntity} size="sm" />}</h1>
              <p>Inventory on hand, transaction history, and variance tracking</p>
            </div>
            <button className="btn btn-primary" onClick={openPhysicalCount} disabled={!stockData.length || loading}>
              Physical Count
            </button>
          </div>

          {/* Summary Bar */}
          <div className="summary-bar">
            <div className="summary-card">
              <div className="value">{summary.total_products || 0}</div>
              <div className="label">Products</div>
            </div>
            <div className="summary-card">
              <div className="value">{(summary.total_units || 0).toLocaleString()}</div>
              <div className="label">Total Units</div>
            </div>
            <div className="summary-card">
              <div className="value">P{(summary.total_value || 0).toLocaleString()}</div>
              <div className="label">Total Value</div>
            </div>
            <div className="summary-card">
              <div className="value" style={{ color: summary.near_expiry_count > 0 ? '#dc2626' : undefined }}>
                {summary.near_expiry_count || 0}
              </div>
              <div className="label">Near Expiry</div>
            </div>
          </div>

          {/* Tabs */}
          <div className="tab-bar">
            {TABS.map((tab, i) => (
              <button key={tab} className={`tab-btn ${activeTab === i ? 'active' : ''}`} onClick={() => setActiveTab(i)}>
                {tab}
              </button>
            ))}
          </div>

          {/* Tab 1: Stock on Hand */}
          {activeTab === 0 && (
            <table className="stock-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Unit</th>
                  <th>Total Qty</th>
                  <th>Batches</th>
                  <th>Nearest Expiry</th>
                  <th>Value</th>
                </tr>
              </thead>
              <tbody>
                {stockData.map(item => (
                  <>
                    <tr key={item.product_id} className={`expandable ${item.near_expiry ? 'near-expiry' : ''}`} onClick={() => toggleExpand(item.product_id)}>
                      <td data-label="Product">
                        <strong>{item.product?.brand_name || 'Unknown'}</strong>
                        <br /><span style={{ fontSize: 11, color: 'var(--erp-muted)' }}>{item.product?.generic_name}</span>
                        {item.near_expiry && <span className="badge badge-warn" style={{ marginLeft: 6 }}>Near Expiry</span>}
                      </td>
                      <td data-label="Unit">{item.product?.unit_code || '-'}</td>
                      <td data-label="Total Qty"><strong>{item.total_qty}</strong></td>
                      <td data-label="Batches">{item.batch_count}</td>
                      <td data-label="Nearest Expiry">{item.nearest_expiry ? new Date(item.nearest_expiry).toLocaleDateString('en-PH', { year: 'numeric', month: 'short' }) : '-'}</td>
                      <td data-label="Value">P{(item.value || 0).toLocaleString()}</td>
                    </tr>
                    {expandedProduct === item.product_id && item.batches?.map((batch, bi) => (
                      <tr key={`${item.product_id}-${bi}`} className="batch-row">
                        <td data-label="Batch" colSpan={2}>Batch: <strong>{batch.batch_lot_no}</strong></td>
                        <td data-label="Qty">{batch.available_qty}</td>
                        <td data-label=""></td>
                        <td data-label="Expiry">
                          {new Date(batch.expiry_date).toLocaleDateString('en-PH', { year: 'numeric', month: 'short' })}
                          {batch.near_expiry && <span className="badge badge-error" style={{ marginLeft: 6 }}>{batch.days_to_expiry}d</span>}
                        </td>
                        <td data-label=""></td>
                      </tr>
                    ))}
                  </>
                ))}
                {!stockData.length && (
                  <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: 'var(--erp-muted)' }}>No stock data available</td></tr>
                )}
              </tbody>
            </table>
          )}

          {/* Tab 2: Transaction Ledger */}
          {activeTab === 1 && (
            <>
              <div className="ledger-select">
                <select value={ledgerProduct} onChange={e => handleLedgerProductChange(e.target.value)}>
                  <option value="">Select a product...</option>
                  {stockData.map(item => (
                    <option key={item.product_id} value={item.product_id}>
                      {item.product?.brand_name}{item.product?.dosage_strength ? ` ${item.product.dosage_strength}` : ''} — {item.total_qty} {item.product?.unit_code || 'PC'}
                    </option>
                  ))}
                </select>
              </div>
              {ledgerProduct && (
                <table className="stock-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Type</th>
                      <th>Batch</th>
                      <th>Qty In</th>
                      <th>Qty Out</th>
                      <th>Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledgerEntries.map((entry, i) => (
                      <tr key={entry._id || i}>
                        <td data-label="Date">{new Date(entry.recorded_at).toLocaleDateString('en-PH')}</td>
                        <td data-label="Type">
                          <span className="badge" style={TYPE_COLORS[entry.transaction_type] || {}}>
                            {entry.transaction_type}
                          </span>
                        </td>
                        <td data-label="Batch">{entry.batch_lot_no}</td>
                        <td data-label="Qty In" style={{ color: entry.qty_in > 0 ? '#16a34a' : undefined }}>{entry.qty_in > 0 ? `+${entry.qty_in}` : '-'}</td>
                        <td data-label="Qty Out" style={{ color: entry.qty_out > 0 ? '#dc2626' : undefined }}>{entry.qty_out > 0 ? `-${entry.qty_out}` : '-'}</td>
                        <td data-label="Balance"><strong>{entry.running_balance ?? '-'}</strong></td>
                      </tr>
                    ))}
                    {!ledgerEntries.length && (
                      <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: 'var(--erp-muted)' }}>No transactions found</td></tr>
                    )}
                  </tbody>
                </table>
              )}
            </>
          )}

          {/* Tab 3: Variance Report */}
          {activeTab === 2 && (
            <table className="stock-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Opening</th>
                  <th>Total In</th>
                  <th>Total Out</th>
                  <th>Expected</th>
                  <th>Actual</th>
                  <th>Variance</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {varianceData.map((item, i) => (
                  <tr key={item.product_id || i}>
                    <td data-label="Product"><strong>{item.product?.brand_name || 'Unknown'}</strong></td>
                    <td data-label="Opening">{item.opening_balance}</td>
                    <td data-label="Total In" style={{ color: '#16a34a' }}>+{item.total_in}</td>
                    <td data-label="Total Out" style={{ color: '#dc2626' }}>-{item.total_out}</td>
                    <td data-label="Expected"><strong>{item.expected_balance}</strong></td>
                    <td data-label="Actual"><strong>{item.actual_balance}</strong></td>
                    <td data-label="Variance" style={{ color: item.variance !== 0 ? '#dc2626' : '#16a34a', fontWeight: 700 }}>
                      {item.variance > 0 ? '+' : ''}{item.variance}
                    </td>
                    <td data-label="Status">
                      <span className={`badge ${item.status === 'OK' ? 'badge-ok' : 'badge-error'}`}>
                        {item.status}
                      </span>
                    </td>
                  </tr>
                ))}
                {!varianceData.length && (
                  <tr><td colSpan={8} style={{ textAlign: 'center', padding: 40, color: 'var(--erp-muted)' }}>No variance data available</td></tr>
                )}
              </tbody>
            </table>
          )}

          {/* Tab 4: Alerts */}
          {activeTab === 3 && (
            <div>
              {/* Expiry Alerts */}
              <h3 style={{ fontSize: 15, margin: '0 0 10px', color: 'var(--erp-text)' }}>
                Expiry Alerts ({alertData.expiry_alerts?.length || 0})
              </h3>
              <table className="stock-table" style={{ marginBottom: 24 }}>
                <thead>
                  <tr><th>Product</th><th>Batch</th><th>Expiry</th><th>Days Left</th><th>Qty</th></tr>
                </thead>
                <tbody>
                  {(alertData.expiry_alerts || []).map((a) => (
                    <tr key={`${a.product_id || ''}-${a.batch_lot_no}`} style={{ background: a.days_remaining < 30 ? '#fef2f2' : a.days_remaining < 120 ? '#fffbeb' : undefined }}>
                      <td data-label="Product"><strong>{a.product?.brand_name || 'Unknown'}</strong></td>
                      <td data-label="Batch">{a.batch_lot_no}</td>
                      <td data-label="Expiry">{new Date(a.expiry_date).toLocaleDateString('en-PH', { year: 'numeric', month: 'short' })}</td>
                      <td data-label="Days Left" style={{ color: a.days_remaining < 30 ? '#dc2626' : a.days_remaining < 120 ? '#d97706' : undefined, fontWeight: 700 }}>
                        {a.days_remaining}d
                      </td>
                      <td data-label="Qty">{a.available_qty}</td>
                    </tr>
                  ))}
                  {!alertData.expiry_alerts?.length && (
                    <tr><td colSpan={5} style={{ textAlign: 'center', padding: 24, color: 'var(--erp-muted)' }}>No expiry alerts</td></tr>
                  )}
                </tbody>
              </table>

              {/* Reorder Alerts */}
              <h3 style={{ fontSize: 15, margin: '0 0 10px', color: 'var(--erp-text)' }}>
                Reorder Alerts ({alertData.reorder_alerts?.length || 0})
              </h3>
              <table className="stock-table">
                <thead>
                  <tr><th>Product</th><th>Current</th><th>Min Qty</th><th>Safety</th><th>Suggested Order</th><th>Lead Time</th><th>Order By</th></tr>
                </thead>
                <tbody>
                  {(alertData.reorder_alerts || []).map((a) => (
                    <tr key={a.product_id || a.product?.brand_name} style={{ background: a.below_safety ? '#fef2f2' : '#fffbeb' }}>
                      <td data-label="Product"><strong>{a.product?.brand_name || 'Unknown'}</strong></td>
                      <td data-label="Current" style={{ fontWeight: 700, color: a.below_safety ? '#dc2626' : '#d97706' }}>{a.current_qty}</td>
                      <td data-label="Min Qty">{a.reorder_min_qty}</td>
                      <td data-label="Safety">{a.safety_stock_qty ?? '—'}</td>
                      <td data-label="Suggested Order" style={{ fontWeight: 600 }}>{a.reorder_qty ?? '—'}</td>
                      <td data-label="Lead Time">{a.lead_time_days != null ? `${a.lead_time_days}d` : '—'}</td>
                      <td data-label="Order By">{a.order_by_date ? new Date(a.order_by_date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }) : '—'}</td>
                    </tr>
                  ))}
                  {!alertData.reorder_alerts?.length && (
                    <tr><td colSpan={7} style={{ textAlign: 'center', padding: 24, color: 'var(--erp-muted)' }}>No reorder alerts</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {loading && (
            <div style={{ textAlign: 'center', padding: 20, color: 'var(--erp-muted)' }}>Loading...</div>
          )}
        </main>
      </div>

      {/* Physical Count Modal */}
      <PhysicalCountModal
        open={pcModalOpen}
        onClose={() => setPcModalOpen(false)}
        stockData={stockData}
        onSubmit={handlePhysicalCountSubmit}
        submitting={pcSubmitting}
      />
    </div>
  );
}
