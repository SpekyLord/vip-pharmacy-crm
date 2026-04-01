import { useState, useEffect } from 'react';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import { useAuth } from '../../hooks/useAuth';
import useInventory from '../hooks/useInventory';

const TABS = ['Stock on Hand', 'Transaction Ledger', 'Variance Report'];

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
  .mystock-main { padding: 20px; max-width: 1200px; margin: 0 auto; }
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

  @media (max-width: 768px) {
    .summary-bar { grid-template-columns: repeat(2, 1fr); }
    .stock-table { font-size: 12px; }
    .tab-btn { padding: 8px 12px; font-size: 13px; }
  }
`;

export default function MyStock() {
  const { user } = useAuth();
  const inventory = useInventory();

  const [activeTab, setActiveTab] = useState(0);
  const [stockData, setStockData] = useState([]);
  const [summary, setSummary] = useState({});
  const [expandedProduct, setExpandedProduct] = useState(null);
  const [ledgerProduct, setLedgerProduct] = useState('');
  const [ledgerEntries, setLedgerEntries] = useState([]);
  const [varianceData, setVarianceData] = useState([]);
  const [loading, setLoading] = useState(false);

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

  useEffect(() => {
    if (activeTab === 2) loadVariance();
  }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleExpand = (productId) => {
    setExpandedProduct(prev => prev === productId ? null : productId);
  };

  const handleLedgerProductChange = (productId) => {
    setLedgerProduct(productId);
    if (productId) loadLedger(productId);
    else setLedgerEntries([]);
  };

  return (
    <div className="admin-page erp-page mystock-page">
      <style>{pageStyles}</style>
      <Navbar />
      <div className="admin-layout">
        <Sidebar />
        <main className="admin-content mystock-main">
          <div className="mystock-header">
            <h1>My Stock</h1>
            <p>Inventory on hand, transaction history, and variance tracking</p>
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
                      <td>
                        <strong>{item.product?.brand_name || 'Unknown'}</strong>
                        <br /><span style={{ fontSize: 11, color: 'var(--erp-muted)' }}>{item.product?.generic_name}</span>
                        {item.near_expiry && <span className="badge badge-warn" style={{ marginLeft: 6 }}>Near Expiry</span>}
                      </td>
                      <td>{item.product?.unit_code || '-'}</td>
                      <td><strong>{item.total_qty}</strong></td>
                      <td>{item.batch_count}</td>
                      <td>{item.nearest_expiry ? new Date(item.nearest_expiry).toLocaleDateString('en-PH', { year: 'numeric', month: 'short' }) : '-'}</td>
                      <td>P{(item.value || 0).toLocaleString()}</td>
                    </tr>
                    {expandedProduct === item.product_id && item.batches?.map((batch, bi) => (
                      <tr key={`${item.product_id}-${bi}`} className="batch-row">
                        <td colSpan={2}>Batch: <strong>{batch.batch_lot_no}</strong></td>
                        <td>{batch.available_qty}</td>
                        <td></td>
                        <td>
                          {new Date(batch.expiry_date).toLocaleDateString('en-PH', { year: 'numeric', month: 'short' })}
                          {batch.near_expiry && <span className="badge badge-error" style={{ marginLeft: 6 }}>{batch.days_to_expiry}d</span>}
                        </td>
                        <td></td>
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
                      {item.product?.brand_name} {item.product?.dosage_strength || ''}
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
                        <td>{new Date(entry.recorded_at).toLocaleDateString('en-PH')}</td>
                        <td>
                          <span className="badge" style={TYPE_COLORS[entry.transaction_type] || {}}>
                            {entry.transaction_type}
                          </span>
                        </td>
                        <td>{entry.batch_lot_no}</td>
                        <td style={{ color: entry.qty_in > 0 ? '#16a34a' : undefined }}>{entry.qty_in > 0 ? `+${entry.qty_in}` : '-'}</td>
                        <td style={{ color: entry.qty_out > 0 ? '#dc2626' : undefined }}>{entry.qty_out > 0 ? `-${entry.qty_out}` : '-'}</td>
                        <td><strong>{entry.running_balance ?? '-'}</strong></td>
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
                    <td><strong>{item.product?.brand_name || 'Unknown'}</strong></td>
                    <td>{item.opening_balance}</td>
                    <td style={{ color: '#16a34a' }}>+{item.total_in}</td>
                    <td style={{ color: '#dc2626' }}>-{item.total_out}</td>
                    <td><strong>{item.expected_balance}</strong></td>
                    <td><strong>{item.actual_balance}</strong></td>
                    <td style={{ color: item.variance !== 0 ? '#dc2626' : '#16a34a', fontWeight: 700 }}>
                      {item.variance > 0 ? '+' : ''}{item.variance}
                    </td>
                    <td>
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

          {loading && (
            <div style={{ textAlign: 'center', padding: 20, color: 'var(--erp-muted)' }}>Loading...</div>
          )}
        </main>
      </div>
    </div>
  );
}
