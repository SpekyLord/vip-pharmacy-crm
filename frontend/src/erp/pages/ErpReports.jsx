import { Link } from 'react-router-dom';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import { useAuth } from '../../hooks/useAuth';

export default function ErpReports() {
  const { user } = useAuth();

  return (
    <div className="admin-page erp-page">
      <Navbar />
      <div className="admin-layout">
        <Sidebar />
        <main style={{ padding: 24, flex: 1 }}>
          <h1 style={{ marginBottom: 8, color: 'var(--erp-text, #132238)' }}>Reports</h1>
          <p style={{ color: 'var(--erp-muted, #5f7188)', marginBottom: 24 }}>
            Sales summaries, AR aging, expense breakdowns, and PNL reports.
          </p>
          <div style={{
            padding: 32,
            borderRadius: 12,
            border: '1px dashed var(--erp-border, #dbe4f0)',
            textAlign: 'center',
            color: 'var(--erp-muted, #5f7188)'
          }}>
            Coming in Phase 7 — Sales summary, collection summary, expense summary, territory PNL, audit logs.
          </div>
          <Link to="/erp" style={{ display: 'inline-block', marginTop: 16, color: 'var(--erp-accent, #1e5eff)' }}>
            &larr; Back to ERP Dashboard
          </Link>
        </main>
      </div>
    </div>
  );
}
