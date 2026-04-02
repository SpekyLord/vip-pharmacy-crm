import { Link } from 'react-router-dom';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import { useAuth } from '../../hooks/useAuth';
import useEntities from '../hooks/useEntities';
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

  .erp-dash-main {
    flex: 1;
    min-width: 0;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    padding: 24px;
    background: var(--erp-bg);
  }

  .erp-dash-inner { max-width: 1100px; margin: 0 auto; }

  .erp-dash-header { margin-bottom: 24px; }
  .erp-dash-header h1 { font-size: 24px; color: var(--erp-text); margin: 0 0 4px; }
  .erp-dash-header p { color: var(--erp-muted); font-size: 14px; margin: 0; }

  .erp-quick-actions {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12px;
    margin-bottom: 28px;
  }

  .erp-quick-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 20px 12px;
    background: var(--erp-panel);
    border: 1px solid var(--erp-border);
    border-radius: 16px;
    text-decoration: none;
    color: var(--erp-text);
    font-weight: 600;
    font-size: 14px;
    transition: transform 0.15s, box-shadow 0.15s;
  }
  .erp-quick-btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(15, 23, 42, 0.1);
  }
  .erp-quick-icon {
    width: 44px;
    height: 44px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 20px;
  }

  .erp-section-label {
    font-size: 13px;
    font-weight: 700;
    color: var(--erp-muted);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    margin-bottom: 12px;
  }

  .erp-module-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 14px;
    margin-bottom: 28px;
  }

  .erp-module-card {
    display: block;
    padding: 20px;
    background: var(--erp-panel);
    border: 1px solid var(--erp-border);
    border-radius: 16px;
    text-decoration: none;
    transition: transform 0.15s, box-shadow 0.15s;
  }
  .erp-module-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(15, 23, 42, 0.1);
  }
  .erp-module-card h3 {
    margin: 0 0 6px;
    font-size: 15px;
    color: var(--erp-text);
  }
  .erp-module-card p {
    margin: 0 0 10px;
    font-size: 13px;
    color: var(--erp-muted);
    line-height: 1.5;
  }
  .erp-module-status {
    display: inline-block;
    padding: 3px 10px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 700;
  }
  .status-active { background: #dcfce7; color: #166534; }
  .status-placeholder { background: #e2e8f0; color: #64748b; }

  .erp-tools-row {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
  }
  .erp-tool-link {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 10px 16px;
    background: var(--erp-panel);
    border: 1px solid var(--erp-border);
    border-radius: 10px;
    text-decoration: none;
    color: var(--erp-accent);
    font-size: 13px;
    font-weight: 600;
    transition: border-color 0.15s;
  }
  .erp-tool-link:hover { border-color: var(--erp-accent); }

  @media (max-width: 768px) {
    .erp-dash-main { padding: 16px; }
    .erp-quick-actions { grid-template-columns: repeat(2, 1fr); }
    .erp-module-grid { grid-template-columns: 1fr; }
  }
`;

const ErpDashboard = () => {
  const { user } = useAuth();
  const { getEntityById } = useEntities();
  const userEntity = getEntityById(user?.entity_id);
  const crmHome = user?.role === 'admin' ? '/admin' : '/bdm';

  return (
    <div className="admin-page erp-page">
      <style>{pageStyles}</style>
      <Navbar />
      <div className="admin-layout">
        <Sidebar />
        <main className="erp-dash-main">
          <div className="erp-dash-inner">

            <div className="erp-dash-header">
              <h1>ERP Dashboard {userEntity && <EntityBadge entity={userEntity} />}</h1>
              <p>Sales, inventory, collections, and expense management</p>
            </div>

            {/* Quick Action Buttons */}
            <div className="erp-quick-actions">
              <Link to={crmHome} className="erp-quick-btn">
                <div className="erp-quick-icon" style={{ background: '#dbeafe' }}>📋</div>
                CRM
              </Link>
              <Link to="/erp/sales" className="erp-quick-btn">
                <div className="erp-quick-icon" style={{ background: '#dcfce7' }}>🧾</div>
                Sales
              </Link>
              <Link to="/erp/expenses" className="erp-quick-btn">
                <div className="erp-quick-icon" style={{ background: '#fef3c7' }}>💰</div>
                Expenses
              </Link>
              <Link to="/erp/collections" className="erp-quick-btn">
                <div className="erp-quick-icon" style={{ background: '#fce7f3' }}>📥</div>
                Collections
              </Link>
            </div>

            {/* Active Modules */}
            <div className="erp-section-label">Modules</div>
            <div className="erp-module-grid">
              <Link to="/erp/sales" className="erp-module-card">
                <h3>Sales Entry</h3>
                <p>CSI invoice entry with FIFO batch selection, validate, submit, and re-open.</p>
                <span className="erp-module-status status-active">Active</span>
              </Link>
              <Link to="/erp/my-stock" className="erp-module-card">
                <h3>My Stock</h3>
                <p>Stock on hand, batch details, transaction ledger, variance, and alerts.</p>
                <span className="erp-module-status status-active">Active</span>
              </Link>
              <Link to="/erp/grn" className="erp-module-card">
                <h3>Goods Received</h3>
                <p>Record stock receipts, scan undertakings, approval workflow.</p>
                <span className="erp-module-status status-active">Active</span>
              </Link>
              <Link to="/erp/dr" className="erp-module-card">
                <h3>Delivery Receipts</h3>
                <p>Sampling and consignment DRs with OCR scan support.</p>
                <span className="erp-module-status status-active">Active</span>
              </Link>
              <Link to="/erp/consignment" className="erp-module-card">
                <h3>Consignment</h3>
                <p>Track consignment aging, overdue alerts, convert to CSI.</p>
                <span className="erp-module-status status-active">Active</span>
              </Link>
              <Link to="/erp/collections" className="erp-module-card">
                <h3>Collections</h3>
                <p>Collection receipts, AR aging, CWT, and SOA generation.</p>
                <span className="erp-module-status status-placeholder">Phase 5</span>
              </Link>
              <Link to="/erp/expenses" className="erp-module-card">
                <h3>Expenses</h3>
                <p>SMER per diem, car logbook, ORE, ACCESS, PRF/CALF.</p>
                <span className="erp-module-status status-placeholder">Phase 6</span>
              </Link>
              <Link to="/erp/reports" className="erp-module-card">
                <h3>Reports</h3>
                <p>Sales summary, AR reports, expense breakdown, PNL.</p>
                <span className="erp-module-status status-placeholder">Phase 7</span>
              </Link>
            </div>

            {/* Tools */}
            <div className="erp-section-label">Tools</div>
            <div className="erp-tools-row">
              <Link to="/erp/ocr-test" className="erp-tool-link">
                📷 OCR Scanner
              </Link>
              <Link to="/erp/sales/entry" className="erp-tool-link">
                + New Sales Entry
              </Link>
            </div>

          </div>
        </main>
      </div>
    </div>
  );
};

export default ErpDashboard;
