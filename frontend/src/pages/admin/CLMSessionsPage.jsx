/**
 * CLMSessionsPage — Admin view
 *
 * Shows all CLM presentation sessions across all BDMs with:
 * - Summary analytics (total sessions, conversion rate, avg duration)
 * - Slide-level heatmap
 * - Top BDMs by conversion
 * - Full session list with filters
 */
import { useState, useEffect, useCallback } from 'react';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import clmService from '../../services/clmService';
import toast from 'react-hot-toast';
import {
  Presentation,
  BarChart3,
  Users,
  Clock,
  MessageCircle,
  Star,
  TrendingUp,
  Calendar,
  User,
  CheckCircle2,
  XCircle,
  HelpCircle,
  QrCode,
  Target,
} from 'lucide-react';

const CLMSessionsPage = () => {
  const [analytics, setAnalytics] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [analyticsRes, sessionsRes] = await Promise.all([
        clmService.getAnalytics(),
        clmService.getAllSessions({ page, limit: 20 }),
      ]);
      setAnalytics(analyticsRes.data);
      setSessions(sessionsRes.data || []);
      setTotal(sessionsRes.pagination?.total || 0);
    } catch (err) {
      toast.error('Failed to load CLM data');
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const summary = analytics?.summary || {};
  const slideHeatmap = analytics?.slideHeatmap || [];
  const topBdms = analytics?.topBdms || [];

  const conversionRate =
    summary.qrDisplayedCount > 0
      ? ((summary.qrScannedCount / summary.qrDisplayedCount) * 100).toFixed(1)
      : '0';

  const avgDurationMin = summary.avgDurationMs
    ? (summary.avgDurationMs / 1000 / 60).toFixed(1)
    : '0';

  const OutcomeBadge = ({ outcome }) => {
    const config = {
      interested: { icon: CheckCircle2, color: '#00D4AA', label: 'Interested' },
      maybe: { icon: HelpCircle, color: '#f59e0b', label: 'Maybe' },
      not_interested: { icon: XCircle, color: '#ef4444', label: 'Not Interested' },
      already_partner: { icon: CheckCircle2, color: '#3b82f6', label: 'Already Partner' },
      reschedule: { icon: Calendar, color: '#8b5cf6', label: 'Reschedule' },
    };
    const c = config[outcome] || config.maybe;
    const Icon = c.icon;
    return (
      <span className="clm-admin-badge" style={{ color: c.color, borderColor: `${c.color}33` }}>
        <Icon size={13} /> {c.label}
      </span>
    );
  };

  return (
    <div className="clm-admin-layout">
      <style>{adminStyles}</style>
      <Navbar />
      <div className="clm-admin-content">
        <Sidebar />
        <main className="clm-admin-main">
          <div className="clm-admin-header">
            <h1>
              <Presentation size={24} />
              CLM Partnership Sessions
            </h1>
            <p>Track BDM partnership presentations and doctor engagement</p>
          </div>

          {loading ? (
            <LoadingSpinner />
          ) : (
            <>
              {/* ── Summary cards ──────────────────────────────── */}
              <div className="clm-admin-stats">
                <div className="clm-admin-stat">
                  <div className="stat-icon blue">
                    <Presentation size={20} />
                  </div>
                  <div>
                    <div className="stat-value">{summary.totalSessions || 0}</div>
                    <div className="stat-label">Total Sessions</div>
                  </div>
                </div>
                <div className="clm-admin-stat">
                  <div className="stat-icon green">
                    <Clock size={20} />
                  </div>
                  <div>
                    <div className="stat-value">{avgDurationMin} min</div>
                    <div className="stat-label">Avg Duration</div>
                  </div>
                </div>
                <div className="clm-admin-stat">
                  <div className="stat-icon teal">
                    <QrCode size={20} />
                  </div>
                  <div>
                    <div className="stat-value">{conversionRate}%</div>
                    <div className="stat-label">QR Conversion</div>
                  </div>
                </div>
                <div className="clm-admin-stat">
                  <div className="stat-icon amber">
                    <Star size={20} />
                  </div>
                  <div>
                    <div className="stat-value">
                      {summary.avgInterestLevel
                        ? summary.avgInterestLevel.toFixed(1)
                        : '—'}
                    </div>
                    <div className="stat-label">Avg Interest</div>
                  </div>
                </div>
                <div className="clm-admin-stat">
                  <div className="stat-icon emerald">
                    <Target size={20} />
                  </div>
                  <div>
                    <div className="stat-value">{summary.interestedCount || 0}</div>
                    <div className="stat-label">Interested</div>
                  </div>
                </div>
              </div>

              {/* ── Two-column: Slide heatmap + Top BDMs ──────── */}
              <div className="clm-admin-grid">
                {/* Slide heatmap */}
                <div className="clm-admin-card">
                  <h3>
                    <BarChart3 size={16} /> Slide Engagement Heatmap
                  </h3>
                  {slideHeatmap.length > 0 ? (
                    <div className="clm-heatmap">
                      {slideHeatmap.map((s) => {
                        const maxDuration = Math.max(
                          ...slideHeatmap.map((x) => x.avgDurationMs || 1)
                        );
                        const pct = ((s.avgDurationMs || 0) / maxDuration) * 100;
                        return (
                          <div key={s._id} className="heatmap-row">
                            <span className="heatmap-label">
                              {s.slideTitle || `Slide ${s._id + 1}`}
                            </span>
                            <div className="heatmap-bar-track">
                              <div
                                className="heatmap-bar-fill"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className="heatmap-value">
                              {((s.avgDurationMs || 0) / 1000).toFixed(1)}s
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="clm-admin-empty">No slide data yet</p>
                  )}
                </div>

                {/* Top BDMs */}
                <div className="clm-admin-card">
                  <h3>
                    <Users size={16} /> Top BDMs by Conversion
                  </h3>
                  {topBdms.length > 0 ? (
                    <div className="clm-top-bdms">
                      {topBdms.map((b, i) => (
                        <div key={b._id} className="bdm-row">
                          <span className="bdm-rank">#{i + 1}</span>
                          <span className="bdm-name">{b.bdmName}</span>
                          <span className="bdm-sessions">
                            {b.totalSessions} sessions
                          </span>
                          <span className="bdm-conversions">
                            <MessageCircle size={13} /> {b.conversions} scans
                          </span>
                          <span className="bdm-rate">
                            {b.conversionRate?.toFixed(0)}%
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="clm-admin-empty">No BDM data yet</p>
                  )}
                </div>
              </div>

              {/* ── Session list ───────────────────────────────── */}
              <div className="clm-admin-card" style={{ marginTop: 16 }}>
                <h3>
                  <Presentation size={16} /> All Sessions ({total})
                </h3>
                <div className="clm-admin-table-wrap">
                  <table className="clm-admin-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>BDM</th>
                        <th>VIP Client</th>
                        <th>Duration</th>
                        <th>Slides</th>
                        <th>QR</th>
                        <th>Interest</th>
                        <th>Outcome</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sessions.map((s) => (
                        <tr key={s._id}>
                          <td>
                            {new Date(s.createdAt).toLocaleDateString('en-PH', {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </td>
                          <td>
                            {s.user?.firstName} {s.user?.lastName}
                          </td>
                          <td>
                            Dr. {s.doctor?.firstName} {s.doctor?.lastName}
                          </td>
                          <td>
                            {s.totalDurationMs
                              ? `${Math.round(s.totalDurationMs / 1000 / 60)}m`
                              : '—'}
                          </td>
                          <td>
                            {s.slidesViewedCount || 0}/{s.totalSlides || 9}
                          </td>
                          <td>
                            {s.qrScanned ? (
                              <span style={{ color: '#00D4AA' }}>
                                <CheckCircle2 size={14} />
                              </span>
                            ) : (
                              <span style={{ color: '#d1d5db' }}>—</span>
                            )}
                          </td>
                          <td>
                            {s.interestLevel ? (
                              <span className="clm-admin-stars">
                                {[1, 2, 3, 4, 5].map((n) => (
                                  <Star
                                    key={n}
                                    size={12}
                                    fill={
                                      n <= s.interestLevel ? '#f59e0b' : 'transparent'
                                    }
                                    color={n <= s.interestLevel ? '#f59e0b' : '#d1d5db'}
                                  />
                                ))}
                              </span>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td>
                            <OutcomeBadge outcome={s.outcome} />
                          </td>
                        </tr>
                      ))}
                      {sessions.length === 0 && (
                        <tr>
                          <td colSpan={8} style={{ textAlign: 'center', color: '#9ca3af' }}>
                            No sessions recorded yet
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                {total > 20 && (
                  <div className="clm-admin-pagination">
                    <button
                      disabled={page <= 1}
                      onClick={() => setPage((p) => p - 1)}
                    >
                      Previous
                    </button>
                    <span>
                      Page {page} of {Math.ceil(total / 20)}
                    </span>
                    <button
                      disabled={page >= Math.ceil(total / 20)}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      Next
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
};

const adminStyles = `
  .clm-admin-layout {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
  }
  .clm-admin-content {
    display: flex;
    flex: 1;
  }
  .clm-admin-main {
    flex: 1;
    padding: 24px;
    overflow-y: auto;
    background: #f9fafb;
  }
  .clm-admin-header {
    margin-bottom: 24px;
  }
  .clm-admin-header h1 {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 24px;
    font-weight: 600;
    color: #1f2937;
    margin: 0 0 4px 0;
  }
  .clm-admin-header p {
    font-size: 14px;
    color: #6b7280;
    margin: 0;
  }

  /* Stats */
  .clm-admin-stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 12px;
    margin-bottom: 20px;
  }
  .clm-admin-stat {
    display: flex;
    align-items: center;
    gap: 14px;
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 12px;
    padding: 18px;
  }
  .stat-icon {
    width: 44px;
    height: 44px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .stat-icon.blue { background: #eff6ff; color: #2563eb; }
  .stat-icon.green { background: #f0fdf4; color: #16a34a; }
  .stat-icon.teal { background: #f0fdfa; color: #0d9488; }
  .stat-icon.amber { background: #fffbeb; color: #d97706; }
  .stat-icon.emerald { background: #ecfdf5; color: #059669; }
  .stat-value {
    font-size: 22px;
    font-weight: 700;
    color: #1f2937;
    line-height: 1;
  }
  .stat-label {
    font-size: 12px;
    color: #6b7280;
    margin-top: 2px;
  }

  /* Grid */
  .clm-admin-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }
  @media (max-width: 900px) {
    .clm-admin-grid { grid-template-columns: 1fr; }
  }

  /* Card */
  .clm-admin-card {
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 12px;
    padding: 20px;
  }
  .clm-admin-card h3 {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 15px;
    font-weight: 600;
    color: #1f2937;
    margin: 0 0 16px 0;
  }
  .clm-admin-empty {
    text-align: center;
    color: #9ca3af;
    font-size: 14px;
    padding: 24px 0;
  }

  /* Heatmap */
  .clm-heatmap {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .heatmap-row {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .heatmap-label {
    font-size: 13px;
    color: #6b7280;
    min-width: 100px;
    text-align: right;
  }
  .heatmap-bar-track {
    flex: 1;
    height: 20px;
    background: #f3f4f6;
    border-radius: 4px;
    overflow: hidden;
  }
  .heatmap-bar-fill {
    height: 100%;
    background: linear-gradient(90deg, #00D4AA, #0d9488);
    border-radius: 4px;
    transition: width 0.5s ease;
  }
  .heatmap-value {
    font-size: 13px;
    font-weight: 600;
    color: #374151;
    min-width: 40px;
  }

  /* Top BDMs */
  .clm-top-bdms {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .bdm-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    background: #f9fafb;
    border-radius: 8px;
    font-size: 13px;
  }
  .bdm-rank {
    font-weight: 700;
    color: #2563eb;
    min-width: 28px;
  }
  .bdm-name {
    font-weight: 600;
    color: #1f2937;
    flex: 1;
  }
  .bdm-sessions { color: #6b7280; }
  .bdm-conversions {
    display: flex;
    align-items: center;
    gap: 4px;
    color: #00D4AA;
    font-weight: 500;
  }
  .bdm-rate {
    font-weight: 700;
    color: #059669;
    min-width: 36px;
    text-align: right;
  }

  /* Table */
  .clm-admin-table-wrap {
    overflow-x: auto;
  }
  .clm-admin-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }
  .clm-admin-table th {
    text-align: left;
    padding: 10px 12px;
    font-weight: 600;
    color: #6b7280;
    border-bottom: 1px solid #e5e7eb;
    white-space: nowrap;
  }
  .clm-admin-table td {
    padding: 10px 12px;
    color: #374151;
    border-bottom: 1px solid #f3f4f6;
    white-space: nowrap;
  }
  .clm-admin-table tr:hover td {
    background: #f9fafb;
  }
  .clm-admin-stars {
    display: inline-flex;
    gap: 1px;
  }
  .clm-admin-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    font-weight: 500;
    padding: 2px 8px;
    border: 1px solid;
    border-radius: 6px;
  }

  /* Pagination */
  .clm-admin-pagination {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    margin-top: 16px;
    font-size: 13px;
    color: #6b7280;
  }
  .clm-admin-pagination button {
    padding: 6px 14px;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    background: white;
    color: #374151;
    font-size: 13px;
    cursor: pointer;
  }
  .clm-admin-pagination button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
`;

export default CLMSessionsPage;
