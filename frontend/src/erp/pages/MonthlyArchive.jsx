/**
 * Monthly Archive Page — Period snapshots, close/restore history
 */
import { useState, useEffect } from 'react';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import { useAuth } from '../../hooks/useAuth';
import useDashboard from '../hooks/useDashboard';

const pageStyles = `
  .archive-page { background: var(--erp-bg, #f4f7fb); min-height: 100vh; }
  .archive-main { flex: 1; min-width: 0; overflow-y: auto; padding: 20px; max-width: 1200px; margin: 0 auto; }
  .archive-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 12px; }
  .archive-header h1 { font-size: 22px; color: var(--erp-text); margin: 0; }
  .archive-table { width: 100%; border-collapse: collapse; font-size: 13px; background: var(--erp-panel); border: 1px solid var(--erp-border); border-radius: 12px; overflow: hidden; }
  .archive-table th { background: var(--erp-accent-soft, #e8efff); padding: 10px 12px; text-align: left; font-weight: 600; white-space: nowrap; }
  .archive-table td { padding: 10px 12px; border-top: 1px solid var(--erp-border); }
  .badge { display: inline-block; padding: 3px 10px; border-radius: 999px; font-size: 11px; font-weight: 600; }
  .badge-open { background: #dbeafe; color: #1d4ed8; }
  .badge-closed { background: #d1fae5; color: #065f46; }
  .badge-locked { background: #f3f4f6; color: #6b7280; }
  .snapshot-detail { margin: 8px 0; font-size: 12px; padding: 10px; background: var(--erp-bg); border-radius: 8px; }
  .snapshot-detail div { display: flex; justify-content: space-between; padding: 2px 0; }
  @media(max-width: 768px) { .archive-main { padding: 12px; } .archive-table { font-size: 11px; } }
`;

function fmt(n) { return '₱' + (n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

export default function MonthlyArchive() {
  const { user } = useAuth();
  const dash = useDashboard();
  const [archives, setArchives] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    setLoading(true);
    dash.getMonthlyArchives()
      .then(res => setArchives(res?.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="archive-page">
      <style>{pageStyles}</style>
      <Navbar />
      <div style={{ display: 'flex' }}>
        <Sidebar />
        <div className="archive-main">
          <div className="archive-header">
            <h1>Monthly Archive</h1>
          </div>

          {loading && <div style={{ textAlign: 'center', padding: 40, color: 'var(--erp-muted)' }}>Loading...</div>}

          {!loading && (
            <table className="archive-table">
              <thead>
                <tr>
                  <th>Period</th>
                  <th>Status</th>
                  <th>Closed By</th>
                  <th>Closed At</th>
                  <th style={{ textAlign: 'right' }}>Net Income</th>
                </tr>
              </thead>
              <tbody>
                {archives.length === 0 && (
                  <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--erp-muted)', padding: 24 }}>No archived periods yet</td></tr>
                )}
                {archives.map(a => (
                  <>
                    <tr key={a._id} onClick={() => setExpanded(expanded === a._id ? null : a._id)} style={{ cursor: 'pointer' }}>
                      <td style={{ fontWeight: 600 }}>{a.period}</td>
                      <td>
                        <span className={`badge badge-${(a.period_status || 'open').toLowerCase()}`}>
                          {a.period_status || 'OPEN'}
                        </span>
                      </td>
                      <td>{a.closed_by ? `${a.closed_by.firstName || ''} ${a.closed_by.lastName || ''}`.trim() : '-'}</td>
                      <td>{a.closed_at ? new Date(a.closed_at).toLocaleDateString() : '-'}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600, color: (a.snapshot?.total_net_income || 0) >= 0 ? '#16a34a' : '#dc2626' }}>
                        {a.snapshot ? fmt(a.snapshot.total_net_income) : '-'}
                      </td>
                    </tr>
                    {expanded === a._id && a.snapshot && (
                      <tr key={`${a._id}-detail`}>
                        <td colSpan={5}>
                          <div className="snapshot-detail">
                            <div><span>Total Sales</span><span>{fmt(a.snapshot.total_sales)}</span></div>
                            <div><span>Total Collections</span><span>{fmt(a.snapshot.total_collections)}</span></div>
                            <div><span>COGS</span><span>{fmt(a.snapshot.total_cogs)}</span></div>
                            <div><span>Total Expenses</span><span>{fmt(a.snapshot.total_expenses)}</span></div>
                            <div style={{ fontWeight: 700, borderTop: '1px solid var(--erp-border)', paddingTop: 4, marginTop: 4 }}>
                              <span>Net Income</span><span>{fmt(a.snapshot.total_net_income)}</span>
                            </div>
                            {a.snapshot.bdm_summaries?.length > 0 && (
                              <div style={{ marginTop: 8, fontSize: 11, color: 'var(--erp-muted)' }}>
                                {a.snapshot.bdm_summaries.length} BDM(s) in snapshot
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
