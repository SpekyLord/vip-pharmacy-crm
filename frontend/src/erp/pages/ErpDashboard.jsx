/**
 * ERP Dashboard — BOSS-Style Layout (Phase 8)
 *
 * PRD §13.5: Mobile-first card layout with 4 sections:
 * 1. Top Action Buttons (2x2 grid): CRM, Sales, Expenses, Collections
 * 2. Summary Cards: Total Sales, AR, Stock Value, Engagements
 * 3. Month-to-Date Metrics: Sales MTD, Collections MTD, Engagements MTD, Income MTD
 * 4. Bottom Navigation Tabs: Product Master, Hospitals, VIP Clients, PNL
 */
import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import { useAuth } from '../../hooks/useAuth';
import useEntities from '../hooks/useEntities';
import useDashboard from '../hooks/useDashboard';
import EntityBadge from '../components/EntityBadge';

const pageStyles = `
  :root {
    --erp-bg: #f4f7fb;
    --erp-panel: #ffffff;
    --erp-border: #dbe4f0;
    --erp-text: #132238;
    --erp-muted: #5f7188;
    --erp-accent: #1e5eff;
    --erp-accent-soft: #e8efff;
  }
  body.dark-mode {
    --erp-bg: #0f172a;
    --erp-panel: #111c31;
    --erp-border: #20304f;
    --erp-text: #f8fafc;
    --erp-muted: #9fb0ca;
    --erp-accent: #7aa2ff;
    --erp-accent-soft: rgba(122, 162, 255, 0.16);
  }

  .boss-main { flex: 1; min-width: 0; overflow-y: auto; -webkit-overflow-scrolling: touch; background: var(--erp-bg); display: flex; flex-direction: column; }
  .boss-scroll { flex: 1; overflow-y: auto; padding: 16px 16px 100px; max-width: 900px; margin: 0 auto; width: 100%; }
  .boss-header { margin-bottom: 16px; }
  .boss-header h1 { font-size: 20px; color: var(--erp-text); margin: 0 0 2px; }
  .boss-header p { color: var(--erp-muted); font-size: 13px; margin: 0; }

  /* Section 1: Action Buttons */
  .action-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 20px; }
  .action-btn { display: flex; align-items: center; gap: 12px; padding: 16px; background: var(--erp-panel); border: 1px solid var(--erp-border); border-radius: 14px; text-decoration: none; color: var(--erp-text); font-weight: 600; font-size: 14px; transition: transform 0.12s, box-shadow 0.12s; }
  .action-btn:hover { transform: translateY(-1px); box-shadow: 0 6px 20px rgba(15,23,42,0.08); }
  .action-icon { width: 42px; height: 42px; border-radius: 11px; display: flex; align-items: center; justify-content: center; font-size: 20px; flex-shrink: 0; }

  /* Section 2: Summary Cards */
  .section-label { font-size: 11px; font-weight: 700; color: var(--erp-muted); text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 10px; }
  .summary-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 20px; }
  .summary-card { background: var(--erp-panel); border: 1px solid var(--erp-border); border-radius: 14px; padding: 14px 16px; }
  .summary-card .value { font-size: 18px; font-weight: 700; color: var(--erp-text); font-variant-numeric: tabular-nums; }
  .summary-card .label { font-size: 11px; color: var(--erp-muted); text-transform: uppercase; font-weight: 600; margin-top: 2px; }
  .value-positive { color: #16a34a !important; }
  .value-negative { color: #dc2626 !important; }

  /* Section 3: MTD */
  .mtd-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 20px; }
  .mtd-card { background: var(--erp-panel); border: 1px solid var(--erp-border); border-radius: 12px; padding: 12px 14px; }
  .mtd-card .value { font-size: 16px; font-weight: 700; color: var(--erp-text); font-variant-numeric: tabular-nums; }
  .mtd-card .label { font-size: 10px; color: var(--erp-muted); text-transform: uppercase; font-weight: 600; margin-top: 2px; }

  /* Quick Links */
  .quick-links { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 20px; }
  .quick-link { display: inline-flex; align-items: center; gap: 5px; padding: 8px 14px; background: var(--erp-panel); border: 1px solid var(--erp-border); border-radius: 10px; text-decoration: none; color: var(--erp-accent); font-size: 12px; font-weight: 600; }
  .quick-link:hover { border-color: var(--erp-accent); }

  /* Section 4: Bottom Tab Bar */
  .bottom-tabs { position: fixed; bottom: 0; left: 0; right: 0; background: var(--erp-panel); border-top: 1px solid var(--erp-border); display: flex; z-index: 50; box-shadow: 0 -2px 12px rgba(0,0,0,0.06); }
  .bottom-tab { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 8px 4px; font-size: 10px; font-weight: 600; color: var(--erp-muted); cursor: pointer; border: none; background: none; transition: color 0.15s; text-decoration: none; }
  .bottom-tab.active { color: var(--erp-accent); }
  .bottom-tab-icon { font-size: 18px; margin-bottom: 2px; }

  /* Tab Content Panel */
  .tab-panel { background: var(--erp-panel); border: 1px solid var(--erp-border); border-radius: 14px; overflow: hidden; }
  .tab-table { width: 100%; border-collapse: collapse; font-size: 12px; }
  .tab-table th { background: var(--erp-accent-soft); padding: 8px 10px; text-align: left; font-weight: 600; font-size: 11px; color: var(--erp-muted); text-transform: uppercase; position: sticky; top: 0; }
  .tab-table td { padding: 8px 10px; border-top: 1px solid var(--erp-border); }
  .tab-table tr:hover { background: var(--erp-accent-soft); }
  .tab-scroll { max-height: 320px; overflow-y: auto; }

  .loading-placeholder { text-align: center; padding: 32px; color: var(--erp-muted); font-size: 13px; }

  @media (min-width: 769px) {
    .action-grid { grid-template-columns: repeat(4, 1fr); }
    .summary-grid { grid-template-columns: repeat(4, 1fr); }
    .mtd-grid { grid-template-columns: repeat(4, 1fr); }
    .bottom-tabs { position: static; border-radius: 14px; border: 1px solid var(--erp-border); margin-bottom: 20px; box-shadow: none; }
    .boss-scroll { padding-bottom: 24px; }
  }
  @media (max-width: 768px) {
    .boss-scroll { padding: 104px 12px 110px; }
    .summary-card .value { font-size: 16px; }
  }
  @media (max-width: 375px) {
    .boss-scroll { padding: 8px 8px 90px; }
    .summary-card .value { font-size: 14px; }
    .summary-card .label { font-size: 10px; }
    .boss-scroll input, .boss-scroll select { font-size: 16px; }
  }
`;

function fmt(n) {
  if (n === null || n === undefined) return '--';
  return '₱' + Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export default function ErpDashboard() {
  const { user } = useAuth();
  const { getEntityById } = useEntities();
  const dash = useDashboard();
  const userEntity = getEntityById(user?.entity_id);
  const crmHome = ['admin', 'finance', 'president', 'ceo'].includes(user?.role) ? '/admin' : '/bdm';

  const [summary, setSummary] = useState(null);
  const [mtd, setMtd] = useState(null);
  const [pnlYtd, setPnlYtd] = useState(null);
  const [activeTab, setActiveTab] = useState('products');
  const [tabData, setTabData] = useState(null);
  const [tabLoading, setTabLoading] = useState(false);
  const [loading, setLoading] = useState(true);

  // Load KPIs
  useEffect(() => {
    setLoading(true);
    Promise.all([
      dash.getSummary().catch(() => null),
      dash.getMtd().catch(() => null),
      dash.getPnlYtd().catch(() => null)
    ]).then(([s, m, p]) => {
      setSummary(s?.data || null);
      setMtd(m?.data || null);
      setPnlYtd(p?.data || null);
    }).finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Load bottom tab data
  const loadTab = useCallback(async (tab) => {
    setActiveTab(tab);
    setTabLoading(true);
    setTabData(null);
    try {
      let res;
      switch (tab) {
        case 'products': res = await dash.getProducts(); break;
        case 'hospitals': res = await dash.getHospitals(); break;
        case 'pnl': res = await dash.getPnlYtd(); break;
        default: break;
      }
      setTabData(res?.data || null);
    } catch { /* handled */ }
    setTabLoading(false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadTab('products'); }, [loadTab]);

  return (
    <div className="admin-page erp-page">
      <style>{pageStyles}</style>
      <Navbar />
      <div className="admin-layout">
        <Sidebar />
        <main className="boss-main">
          <div className="boss-scroll">

            {/* Header */}
            <div className="boss-header">
              <h1>ERP Dashboard</h1>
              <p>Sales, inventory, collections & expense management</p>
            </div>

            {/* Section 1: Action Buttons */}
            <div className="action-grid">
              <Link to="/erp/sales/entry" className="action-btn">
                <div className="action-icon" style={{ background: '#dbeafe' }}>🧾</div>
                Sales
              </Link>
              <Link to="/erp/grn" className="action-btn">
                <div className="action-icon" style={{ background: '#dcfce7' }}>📦</div>
                GRN
              </Link>
              <Link to="/erp/expenses" className="action-btn">
                <div className="action-icon" style={{ background: '#fef3c7' }}>💰</div>
                Expenses
              </Link>
              <Link to="/erp/collections/session" className="action-btn">
                <div className="action-icon" style={{ background: '#fce7f3' }}>📥</div>
                Collections
              </Link>
            </div>

            {/* Section 2: Summary Cards */}
            <div className="section-label">Summary</div>
            {loading ? (
              <div className="loading-placeholder">Loading KPIs...</div>
            ) : (
              <div className="summary-grid">
                <div className="summary-card">
                  <div className="value">{fmt(summary?.total_sales)}</div>
                  <div className="label">Total Sales</div>
                </div>
                <div className="summary-card">
                  <div className={`value ${(summary?.accounts_receivable || 0) > 0 ? 'value-negative' : ''}`}>
                    {fmt(summary?.accounts_receivable)}
                  </div>
                  <div className="label">Accounts Receivable</div>
                </div>
                <div className="summary-card">
                  <div className="value">{fmt(summary?.stock_on_hand_value)}</div>
                  <div className="label">Stock on Hand</div>
                </div>
                <div className="summary-card">
                  <div className="value">
                    {summary?.engagements?.visited || 0}/{summary?.engagements?.target || 0}
                  </div>
                  <div className="label">Engagements</div>
                </div>
              </div>
            )}

            {/* Section 3: Month-to-Date */}
            <div className="section-label">Month-to-Date</div>
            {loading ? (
              <div className="loading-placeholder">Loading...</div>
            ) : (
              <div className="mtd-grid">
                <div className="mtd-card">
                  <div className="value">{fmt(mtd?.sales_mtd)}</div>
                  <div className="label">Sales</div>
                </div>
                <div className="mtd-card">
                  <div className="value">{fmt(mtd?.collections_mtd)}</div>
                  <div className="label">Collections</div>
                </div>
                <div className="mtd-card">
                  <div className="value">
                    {mtd?.engagements_mtd?.visited || 0}/{mtd?.engagements_mtd?.target || 0}
                  </div>
                  <div className="label">Engagements</div>
                </div>
                <div className="mtd-card">
                  <div className="value">{fmt(mtd?.income_mtd)}</div>
                  <div className="label">Income</div>
                </div>
              </div>
            )}

            {/* PNL YTD Banner */}
            {pnlYtd && (
              <>
                <div className="section-label">Year-to-Date P&L</div>
                <div className="summary-grid" style={{ marginBottom: 20 }}>
                  <div className="summary-card">
                    <div className="value">{fmt(pnlYtd.total_sales_ytd)}</div>
                    <div className="label">Revenue YTD</div>
                  </div>
                  <div className="summary-card">
                    <div className="value">{fmt(pnlYtd.total_expenses_ytd)}</div>
                    <div className="label">Expenses YTD</div>
                  </div>
                  <div className="summary-card" style={{ gridColumn: 'span 2' }}>
                    <div className={`value ${(pnlYtd.net_pnl_ytd || 0) >= 0 ? 'value-positive' : 'value-negative'}`} style={{ fontSize: 22 }}>
                      {(pnlYtd.net_pnl_ytd || 0) < 0 ? '-' : ''}{fmt(pnlYtd.net_pnl_ytd)}
                    </div>
                    <div className="label">Net P&L YTD</div>
                  </div>
                </div>
              </>
            )}

            {/* Quick Links */}
            <div className="section-label">Quick Access</div>
            <div className="quick-links">
              <Link to="/erp/sales/entry" className="quick-link">+ New CSI</Link>
              <Link to="/erp/collections/session" className="quick-link">+ Collection</Link>
              <Link to="/erp/smer" className="quick-link">SMER</Link>
              <Link to="/erp/car-logbook" className="quick-link">Car Logbook</Link>
              <Link to="/erp/my-stock" className="quick-link">My Stock</Link>
              <Link to="/erp/collections/ar" className="quick-link">AR Aging</Link>
              <Link to="/erp/income" className="quick-link">Income</Link>
              <Link to="/erp/pnl" className="quick-link">P&L</Link>
              <Link to="/erp/reports" className="quick-link">Reports</Link>
            </div>

            {/* Section 4: Bottom Tab Content */}
            <div className="section-label">Data Views</div>

            {/* Tab Bar (inline on desktop, fixed on mobile) */}
            <div className="bottom-tabs">
              <button className={`bottom-tab ${activeTab === 'products' ? 'active' : ''}`} onClick={() => loadTab('products')}>
                <span className="bottom-tab-icon">📦</span>Products
              </button>
              <button className={`bottom-tab ${activeTab === 'hospitals' ? 'active' : ''}`} onClick={() => loadTab('hospitals')}>
                <span className="bottom-tab-icon">🏥</span>Hospitals
              </button>
              <Link to="/erp/collections/ar" className="bottom-tab">
                <span className="bottom-tab-icon">📊</span>AR Aging
              </Link>
              <Link to="/erp/pnl" className="bottom-tab">
                <span className="bottom-tab-icon">📈</span>PNL
              </Link>
            </div>

            {/* Tab Content */}
            <div className="tab-panel" style={{ marginTop: 8 }}>
              {tabLoading && <div className="loading-placeholder">Loading...</div>}

              {/* Products Tab */}
              {activeTab === 'products' && !tabLoading && Array.isArray(tabData) && (
                <div className="tab-scroll">
                  <table className="tab-table">
                    <thead>
                      <tr><th>Product</th><th style={{ textAlign: 'right' }}>Stock</th><th style={{ textAlign: 'right' }}>Value</th></tr>
                    </thead>
                    <tbody>
                      {tabData.length === 0 && <tr><td colSpan={3} style={{ textAlign: 'center', color: 'var(--erp-muted)' }}>No stock data</td></tr>}
                      {tabData.map((p) => (
                        <tr key={p._id || p.product_id}>
                          <td>
                            <div style={{ fontWeight: 600 }}>{p.brand_name}</div>
                            <div style={{ fontSize: 11, color: 'var(--erp-muted)' }}>{p.dosage_strength} {p.sold_per && `— ${p.sold_per}`}</div>
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 600 }}>{p.available_qty}</td>
                          <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmt(p.stock_value)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Hospitals Tab */}
              {activeTab === 'hospitals' && !tabLoading && Array.isArray(tabData) && (
                <div className="tab-scroll">
                  <table className="tab-table">
                    <thead>
                      <tr><th>Hospital</th><th>Type</th><th>Beds</th><th>Level</th></tr>
                    </thead>
                    <tbody>
                      {tabData.length === 0 && <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--erp-muted)' }}>No hospitals</td></tr>}
                      {tabData.map((h) => (
                        <tr key={h._id || h.hospital_name}>
                          <td style={{ fontWeight: 600 }}>{h.hospital_name}</td>
                          <td>{h.hospital_type || '-'}</td>
                          <td>{h.bed_capacity || '-'}</td>
                          <td>{h.engagement_level || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
