import { Link } from 'react-router-dom';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import { useAuth } from '../../hooks/useAuth';

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

  .admin-page.erp-page {
    background: var(--erp-bg);
  }

  .erp-main {
    padding: 24px;
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  .erp-hero {
    background:
      radial-gradient(circle at top right, rgba(30, 94, 255, 0.18), transparent 36%),
      linear-gradient(145deg, var(--erp-panel), color-mix(in srgb, var(--erp-panel) 86%, #dce7ff 14%));
    border: 1px solid var(--erp-border);
    border-radius: 24px;
    padding: 28px;
    box-shadow: 0 18px 36px rgba(15, 23, 42, 0.08);
  }

  .erp-eyebrow {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border-radius: 999px;
    background: var(--erp-accent-soft);
    color: var(--erp-accent);
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .erp-hero h1 {
    margin: 18px 0 12px;
    color: var(--erp-text);
    font-size: clamp(2rem, 4vw, 3rem);
    line-height: 1.05;
  }

  .erp-hero p {
    margin: 0;
    max-width: 760px;
    color: var(--erp-muted);
    font-size: 15px;
    line-height: 1.7;
  }

  .erp-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    margin-top: 22px;
  }

  .erp-primary-action,
  .erp-secondary-action {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 44px;
    padding: 0 18px;
    border-radius: 14px;
    text-decoration: none;
    font-size: 14px;
    font-weight: 700;
    transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
  }

  .erp-primary-action {
    background: var(--erp-accent);
    color: #fff;
    box-shadow: 0 14px 28px rgba(30, 94, 255, 0.24);
  }

  .erp-secondary-action {
    border: 1px solid var(--erp-border);
    color: var(--erp-text);
    background: var(--erp-panel);
  }

  .erp-primary-action:hover,
  .erp-secondary-action:hover {
    transform: translateY(-1px);
  }

  .erp-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 16px;
  }

  .erp-card {
    border: 1px solid var(--erp-border);
    border-radius: 20px;
    background: var(--erp-panel);
    padding: 20px;
    box-shadow: 0 10px 24px rgba(15, 23, 42, 0.05);
  }

  .erp-card h2 {
    margin: 0 0 8px;
    color: var(--erp-text);
    font-size: 16px;
  }

  .erp-card p {
    margin: 0;
    color: var(--erp-muted);
    font-size: 14px;
    line-height: 1.6;
  }

  .erp-card-badge {
    display: inline-flex;
    margin-top: 14px;
    padding: 6px 10px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--erp-border) 75%, transparent);
    color: var(--erp-muted);
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  @media (max-width: 768px) {
    .erp-main {
      padding: 16px;
      gap: 16px;
    }

    .erp-hero,
    .erp-card {
      border-radius: 18px;
      padding: 20px;
    }
  }
`;

const modules = [
  { title: 'Sales', description: 'Invoice entry, FIFO batch selection, and audit trail.' },
  { title: 'Inventory', description: 'Stock on hand, expiry visibility, and warehouse status.' },
  { title: 'Collections', description: 'Receipts, AR aging, and collection workflow.' },
  { title: 'Expenses', description: 'SMER, car logbook, ORE, ACCESS, PRF, and CALF.' },
  { title: 'Reports', description: 'Executive summaries, audit logs, and cycle reporting.' },
];

const ErpDashboard = () => {
  const { user } = useAuth();
  const crmHome = user?.role === 'admin' ? '/admin' : '/bdm';

  return (
    <div className="admin-page erp-page">
      <style>{pageStyles}</style>
      <Navbar />
      <div className="admin-content">
        <Sidebar />
        <main className="admin-main erp-main">
          <section className="erp-hero">
            <div className="erp-eyebrow">Phase 0 Scaffold</div>
            <h1>ERP Dashboard {'\u2014'} Coming Soon</h1>
            <p>
              The ERP workspace is now mounted alongside the CRM without changing the existing CRM
              structure. Phase 0 keeps this area intentionally lightweight while the module
              foundations come online.
            </p>
            <div className="erp-actions">
              <Link to="/erp/ocr-test" className="erp-primary-action">
                Open OCR Test Placeholder
              </Link>
              <Link to={crmHome} className="erp-secondary-action">
                Return to CRM
              </Link>
            </div>
          </section>

          <section className="erp-grid" aria-label="ERP modules coming soon">
            {modules.map((module) => (
              <article key={module.title} className="erp-card">
                <h2>{module.title}</h2>
                <p>{module.description}</p>
                <span className="erp-card-badge">Coming Soon</span>
              </article>
            ))}
          </section>
        </main>
      </div>
    </div>
  );
};

export default ErpDashboard;
