/**
 * ERP Reports Hub — Sales, Collection, Expense summaries + navigation
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import { useAuth } from '../../hooks/useAuth';
import useDashboard from '../hooks/useDashboard';
import WorkflowGuide from '../components/WorkflowGuide';

const pageStyles = `
  .reports-page { background: var(--erp-bg, #f4f7fb); min-height: 100vh; }
  .reports-main { padding: 20px; max-width: 1200px; margin: 0 auto; }
  .reports-header { margin-bottom: 20px; }
  .reports-header h1 { font-size: 22px; color: var(--erp-text); margin: 0 0 4px; }
  .reports-header p { color: var(--erp-muted); font-size: 13px; margin: 0; }
  .report-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 14px; margin-bottom: 24px; }
  .report-card { display: block; padding: 20px; background: var(--erp-panel); border: 1px solid var(--erp-border); border-radius: 14px; text-decoration: none; transition: transform 0.12s, box-shadow 0.12s; }
  .report-card:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(15,23,42,0.08); }
  .report-card h3 { margin: 0 0 6px; font-size: 15px; color: var(--erp-text); }
  .report-card p { margin: 0; font-size: 13px; color: var(--erp-muted); line-height: 1.5; }
  .report-card .icon { font-size: 28px; margin-bottom: 8px; }
  .section-label { font-size: 11px; font-weight: 700; color: var(--erp-muted); text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 12px; }
  .summary-panel { background: var(--erp-panel); border: 1px solid var(--erp-border); border-radius: 14px; padding: 20px; margin-bottom: 20px; }
  .summary-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .summary-table-wrap { overflow-x: auto; }
  .summary-table th { text-align: left; padding: 8px 10px; background: var(--erp-accent-soft); font-weight: 600; }
  .summary-table td { padding: 8px 10px; border-top: 1px solid var(--erp-border); }
  .summary-table td:last-child { text-align: right; font-variant-numeric: tabular-nums; }
  .controls { display: flex; gap: 10px; align-items: center; margin-bottom: 16px; flex-wrap: wrap; }
  .controls input, .controls select { padding: 8px 12px; border: 1px solid var(--erp-border); border-radius: 8px; font-size: 13px; background: var(--erp-panel); color: var(--erp-text); }
  .btn { padding: 8px 16px; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; }
  .btn-primary { background: #2563eb; color: white; }
  .btn:disabled { opacity: 0.5; }
  @media(max-width: 768px) {
    .reports-main { padding: 96px 16px 88px; }
    .report-cards { grid-template-columns: 1fr; }
    .controls { flex-direction: column; align-items: stretch; }
    .controls input, .controls select, .controls .btn { width: 100%; }
  }
`;

function fmt(n) { return '₱' + (n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

function getCurrentPeriod() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function ErpReports() {
  const { user } = useAuth();
  const dash = useDashboard();
  const [period, setPeriod] = useState(getCurrentPeriod());
  const [salesData, setSalesData] = useState(null);
  const [collData, setCollData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [activeReport, setActiveReport] = useState(null);

  const loadReport = async (type) => {
    setActiveReport(type);
    setLoading(true);
    try {
      if (type === 'sales') {
        const res = await dash.getSalesSummary({ period });
        setSalesData(res?.data || []);
      } else if (type === 'collections') {
        const res = await dash.getCollectionSummary({ period });
        setCollData(res?.data || []);
      }
    } catch { /* handled */ }
    setLoading(false);
  };

  return (
    <div className="admin-page erp-page reports-page">
      <style>{pageStyles}</style>
      <Navbar />
      <div className="admin-layout">
        <Sidebar />
        <main className="admin-main reports-main">
          <WorkflowGuide pageKey="erp-reports" />
          <div className="reports-header">
            <h1>ERP Reports</h1>
            <p>Sales summaries, collection reports, expense breakdowns, and P&L analysis</p>
          </div>

          {/* Report Navigation Cards */}
          <div className="section-label">Report Pages</div>
          <div className="report-cards">
            <Link to="/erp/pnl" className="report-card">
              <div className="icon">📈</div>
              <h3>Territory P&L</h3>
              <p>Revenue, COGS, expenses, net income, and profit sharing status by BDM.</p>
            </Link>
            <Link to="/erp/income" className="report-card">
              <div className="icon">💵</div>
              <h3>Income / Payslip</h3>
              <p>BDM payslip with earnings, deductions, and workflow tracking.</p>
            </Link>
            <Link to="/erp/profit-sharing" className="report-card">
              <div className="icon">🤝</div>
              <h3>Profit Sharing</h3>
              <p>Per-product eligibility, condition tracking, and year-end close.</p>
            </Link>
            <Link to="/erp/collections/ar" className="report-card">
              <div className="icon">📊</div>
              <h3>AR Aging</h3>
              <p>Accounts receivable aging buckets by hospital.</p>
            </Link>
            <Link to="/erp/collections/soa" className="report-card">
              <div className="icon">📄</div>
              <h3>SOA Generator</h3>
              <p>Statement of Account per hospital.</p>
            </Link>
            <Link to="/erp/monthly-archive" className="report-card">
              <div className="icon">📁</div>
              <h3>Monthly Archive</h3>
              <p>Period snapshots, close history, and fiscal year records.</p>
            </Link>
            <Link to="/erp/audit-logs" className="report-card">
              <div className="icon">🔍</div>
              <h3>Audit Logs</h3>
              <p>Searchable log of all ERP data changes.</p>
            </Link>
          </div>

          {/* Phase 14 — New Reports & Analytics */}
          <div className="section-label">Analytics & Tracking</div>
          <div className="report-cards">
            <Link to="/erp/performance-ranking" className="report-card">
              <div className="icon">🏆</div>
              <h3>Performance Ranking</h3>
              <p>Net cash ranking, MoM trends, sales & collections trackers by BDM.</p>
            </Link>
            <Link to="/erp/consignment-aging" className="report-card">
              <div className="icon">📦</div>
              <h3>Consignment Aging</h3>
              <p>Cross-BDM consignment status with aging indicators and drill-down.</p>
            </Link>
            <Link to="/erp/expense-anomalies" className="report-card">
              <div className="icon">⚠️</div>
              <h3>Expense Anomalies</h3>
              <p>Period-over-period expense changes and budget overrun detection.</p>
            </Link>
            <Link to="/erp/fuel-efficiency" className="report-card">
              <div className="icon">⛽</div>
              <h3>Fuel Efficiency</h3>
              <p>Per-BDM actual vs expected gas cost with variance flags.</p>
            </Link>
            <Link to="/erp/cycle-status" className="report-card">
              <div className="icon">🔄</div>
              <h3>Cycle Status</h3>
              <p>Payslip cycle progress tracking with behind-schedule alerts.</p>
            </Link>
            <Link to="/erp/cycle-reports" className="report-card">
              <div className="icon">📋</div>
              <h3>Cycle Reports</h3>
              <p>Generate, review, confirm, and credit cycle reports.</p>
            </Link>
            <Link to="/erp/budget-allocations" className="report-card">
              <div className="icon">💰</div>
              <h3>Budget Allocations</h3>
              <p>Set per-BDM expense budgets by component. Feeds Budget Overruns report.</p>
            </Link>
          </div>

          {/* Quick Summary Reports */}
          <div className="section-label">Quick Summaries</div>
          <div className="controls">
            <input type="month" value={period} onChange={e => setPeriod(e.target.value)} />
            <button className="btn btn-primary" onClick={() => loadReport('sales')} disabled={loading}>Sales Summary</button>
            <button className="btn btn-primary" onClick={() => loadReport('collections')} disabled={loading}>Collection Summary</button>
          </div>

          {loading && <div style={{ textAlign: 'center', padding: 32, color: 'var(--erp-muted)' }}>Loading...</div>}

          {/* Sales Summary */}
          {activeReport === 'sales' && salesData && !loading && (
            <div className="summary-panel">
              <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>Sales Summary — {period}</h3>
              <div className="summary-table-wrap">
                <table className="summary-table">
                  <thead><tr><th>Hospital</th><th>Invoices</th><th style={{ textAlign: 'right' }}>Total Sales</th><th style={{ textAlign: 'right' }}>VAT</th><th style={{ textAlign: 'right' }}>Net</th></tr></thead>
                  <tbody>
                    {salesData.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--erp-muted)' }}>No sales data for this period</td></tr>}
                    {salesData.map((r) => (
                      <tr key={r._id || r.hospital_name}>
                        <td style={{ fontWeight: 600 }}>{r.hospital_name}</td>
                        <td>{r.total_invoices}</td>
                        <td>{fmt(r.total_sales)}</td>
                        <td>{fmt(r.total_vat)}</td>
                        <td>{fmt(r.total_net)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Collection Summary */}
          {activeReport === 'collections' && collData && !loading && (
            <div className="summary-panel">
              <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>Collection Summary — {period}</h3>
              <div className="summary-table-wrap">
                <table className="summary-table">
                  <thead><tr><th>Hospital</th><th>CRs</th><th style={{ textAlign: 'right' }}>Collected</th><th style={{ textAlign: 'right' }}>Commission</th><th style={{ textAlign: 'right' }}>Rebates</th></tr></thead>
                  <tbody>
                    {collData.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--erp-muted)' }}>No collection data for this period</td></tr>}
                    {collData.map((r) => (
                      <tr key={r._id || r.hospital_name}>
                        <td style={{ fontWeight: 600 }}>{r.hospital_name}</td>
                        <td>{r.total_crs}</td>
                        <td>{fmt(r.total_collected)}</td>
                        <td>{fmt(r.total_commission)}</td>
                        <td>{fmt(r.total_rebates)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <Link to="/erp" style={{ display: 'inline-block', marginTop: 8, color: 'var(--erp-accent, #1e5eff)', fontSize: 13 }}>
            &larr; Back to Dashboard
          </Link>
        </main>
      </div>
    </div>
  );
}
