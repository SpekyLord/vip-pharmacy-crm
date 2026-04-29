/**
 * AdminDashboard Page
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import Dashboard from '../../components/admin/Dashboard';
import ActivityDetailModal from '../../components/admin/ActivityDetailModal';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import doctorService from '../../services/doctorService';
import visitService from '../../services/visitService';
import clientService from '../../services/clientService';
import scheduleService from '../../services/scheduleService';
import api from '../../services/api';
import PageGuide from '../../components/common/PageGuide';

const CYCLE_ANCHOR = new Date(2026, 0, 5);
const ADMIN_GUIDE_STORAGE_KEY = 'pg_dismiss_admin-dashboard';

const getCycleWeek = (date) => {
  const diffDays = Math.floor((date.getTime() - CYCLE_ANCHOR.getTime()) / 86400000);
  const dayInCycle = ((diffDays % 28) + 28) % 28;
  return Math.floor(dayInCycle / 7) + 1; // 1-4
};

const getAgentStatusClass = (status) => {
  const normalizedStatus = String(status || '').toLowerCase();
  if (normalizedStatus === 'success') return 'success';
  if (normalizedStatus === 'error' || normalizedStatus === 'failed') return 'error';
  return 'pending';
};

const pageStyles = `
  :root {
    --page-bg: #f1f5f9;
    --page-surface: #ffffff;
    --page-border: #dbe4f0;
    --page-text: #0f172a;
    --page-muted: #64748b;
  }

  body.dark-mode {
    --page-bg: #0f172a;
    --page-surface: #111827;
    --page-border: #334155;
    --page-text: #e2e8f0;
    --page-muted: #94a3b8;
  }

  .admin-page {
    min-height: 100vh;
    background: var(--page-bg);
    transition: background-color 0.3s;
    display: flex;
    flex-direction: column;
  }

  .admin-content {
    display: flex;
    flex: 1;
    min-height: 0;
  }

  .admin-main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    padding-bottom: 32px;
  }

  .admin-top-grid {
    display: grid;
    grid-template-columns: minmax(0, 1.65fr) minmax(320px, 1fr);
    gap: 16px;
    margin: 16px 24px 0;
    align-items: start;
  }

  .admin-top-grid--single {
    grid-template-columns: minmax(0, 1fr);
  }

  .admin-top-grid--agents-only .admin-agent-summary {
    display: none;
  }

  .admin-top-grid--agents-only .admin-agent-card {
    padding-top: 14px;
    padding-bottom: 14px;
  }

  .admin-dashboard-stage {
    flex: 1;
    min-height: 0;
    display: flex;
  }

  .admin-dashboard-stage > .db-shell {
    flex: 1;
    min-height: 0;
  }

  .admin-guide-card .pg {
    margin-bottom: 0;
    min-height: 100%;
  }

  .admin-guide-card .pg-next {
    margin-top: 10px;
    padding-top: 10px;
  }

  .admin-agent-card {
    background: var(--page-surface);
    border: 1px solid var(--page-border);
    border-radius: 16px;
    padding: 18px;
    box-shadow: 0 10px 24px rgba(15, 23, 42, 0.06);
    display: flex;
    flex-direction: column;
    gap: 14px;
    min-height: 100%;
  }

  body.dark-mode .admin-agent-card {
    box-shadow: none;
  }

  .admin-agent-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }

  .admin-agent-kicker {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #2563eb;
  }

  .admin-agent-title {
    margin: 6px 0 0;
    font-size: 18px;
    font-weight: 700;
    color: var(--page-text);
  }

  .admin-agent-summary {
    margin: 8px 0 0;
    max-width: 24rem;
    color: var(--page-muted);
    font-size: 13px;
    line-height: 1.55;
  }

  .admin-agent-count {
    flex-shrink: 0;
    padding: 8px 12px;
    border-radius: 999px;
    background: #eff6ff;
    color: #1d4ed8;
    font-size: 12px;
    font-weight: 700;
  }

  body.dark-mode .admin-agent-count {
    background: #1e3a8a;
    color: #bfdbfe;
  }

  .admin-agent-list {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 12px;
  }

  .admin-agent-run {
    border: 1px solid var(--page-border);
    border-radius: 14px;
    padding: 14px;
    background: linear-gradient(180deg, rgba(248, 250, 252, 0.96), rgba(241, 245, 249, 0.82));
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-height: 108px;
  }

  body.dark-mode .admin-agent-run {
    background: linear-gradient(180deg, rgba(15, 23, 42, 0.8), rgba(15, 23, 42, 0.45));
  }

  .admin-agent-run-top {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 10px;
  }

  .admin-agent-name {
    color: var(--page-text);
    font-size: 14px;
    font-weight: 700;
    line-height: 1.35;
  }

  .admin-agent-time {
    color: var(--page-muted);
    font-size: 12px;
    line-height: 1.5;
  }

  .admin-agent-status {
    flex-shrink: 0;
    padding: 4px 9px;
    border-radius: 999px;
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .admin-agent-status.success {
    background: #dcfce7;
    color: #15803d;
  }

  .admin-agent-status.error {
    background: #fee2e2;
    color: #b91c1c;
  }

  .admin-agent-status.pending {
    background: #dbeafe;
    color: #1d4ed8;
  }

  .error-banner {
    display: flex;
    align-items: center;
    gap: 12px;
    background: #fef2f2;
    color: #dc2626;
    padding: 12px 16px;
    border-radius: 12px;
    margin: 16px 24px 0;
    border: 1px solid #fecaca;
    font-size: 13px;
  }

  body.dark-mode .error-banner {
    background: #7f1d1d;
    color: #fca5a5;
    border-color: #991b1b;
  }

  @media (min-width: 1181px) {
    .admin-main {
      padding-bottom: 16px;
    }

    .admin-top-grid {
      gap: 12px;
      margin: 10px 20px 0;
      flex-shrink: 0;
    }

    .admin-guide-card .pg {
      padding: 10px 14px;
      font-size: 11px;
      line-height: 1.45;
    }

    .admin-guide-card .pg-title {
      margin-bottom: 4px;
      font-size: 12px;
    }

    .admin-guide-card .pg-steps {
      gap: 2px;
    }

    .admin-guide-card .pg-step {
      gap: 5px;
    }

    .admin-guide-card .pg-next {
      margin-top: 6px;
      padding-top: 6px;
    }

    .admin-guide-card .pg-link {
      padding: 4px 10px;
    }

    .admin-agent-card {
      padding: 14px 16px;
      gap: 10px;
    }

    .admin-agent-title {
      font-size: 16px;
    }

    .admin-agent-summary {
      margin-top: 6px;
      font-size: 12px;
      line-height: 1.4;
    }

    .admin-agent-list {
      gap: 10px;
    }

    .admin-agent-run {
      min-height: 84px;
      padding: 10px 12px;
      gap: 6px;
    }
  }

  @media (max-width: 1100px) {
    .admin-top-grid {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 768px) {
    .admin-main {
      padding-bottom: 24px;
    }

    .admin-top-grid {
      margin: 12px 16px 0;
      gap: 12px;
    }

    .admin-agent-card {
      padding: 16px;
    }

    .admin-agent-head {
      flex-direction: column;
    }

    .error-banner {
      margin: 12px 16px 0;
    }
  }
`;

const AdminDashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [stats, setStats] = useState({
    totalDoctors: 0,
    totalEmployees: 0,
    totalVisits: 0,
    vipVisits: 0,
    regularVisits: 0,
    visitsThisWeek: 0,
    vipVisitsThisWeek: 0,
    regularVisitsThisWeek: 0,
    targetVisits: 0,
    actualVisits: 0,
    visitsToday: 0,
    vipVisitsToday: 0,
    regularVisitsToday: 0,
  });
  const [agentRuns, setAgentRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showGuide, setShowGuide] = useState(() => {
    if (typeof window === 'undefined') return true;
    return window.sessionStorage.getItem(ADMIN_GUIDE_STORAGE_KEY) !== '1';
  });
  const [selectedActivity, setSelectedActivity] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleViewAllActivity = () => navigate('/admin/activity');
  const handleActivityClick = (activity) => {
    setSelectedActivity(activity);
    setIsModalOpen(true);
  };
  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedActivity(null);
  };

  const hasTopPanels = showGuide || agentRuns.length > 0;
  const topGridClassName = [
    'admin-top-grid',
    showGuide && agentRuns.length > 0 ? '' : 'admin-top-grid--single',
    !showGuide && agentRuns.length > 0 ? 'admin-top-grid--agents-only' : '',
  ].filter(Boolean).join(' ');

  useEffect(() => {
    const controller = new AbortController();

    const fetchDashboardData = async () => {
      try {
        setLoading(true);
        setError(null);

        // Non-critical: load agent runs separately without blocking main data
        api.get('/erp/agents/runs?limit=3', { signal: controller.signal })
          .then((res) => setAgentRuns(res.data?.data || []))
          .catch(() => {});

        const [doctorsRes, usersRes, cptSummaryRes, todayStatsRes, cycleRes] = await Promise.all([
          // limit:1 triggers countDocuments on backend — gets true total without fetching all records
          doctorService.getAll({ limit: 1 }),
          api.get('/users', { params: { limit: 1 } }),
          scheduleService.getCPTGridSummary().catch(() => ({ data: [] })),
          visitService.getAdminTodayStats().catch(() => ({ data: {} })),
          scheduleService.getCycleSchedule().catch(() => ({ data: {} })),
        ]);

        const currentCycleNumber = Number.isInteger(cycleRes.data?.cycleNumber)
          ? cycleRes.data.cycleNumber
          : null;
        const currentCycleWeek = Number.isInteger(cycleRes.data?.currentWeek)
          ? cycleRes.data.currentWeek
          : getCycleWeek(new Date());

        const cycleParams = currentCycleNumber != null ? { cycleNumber: currentCycleNumber } : {};

        const [visitCycleStatsRes, clientCycleStatsRes] = await Promise.all([
          visitService.getStats(cycleParams),
          clientService.getStats(cycleParams),
        ]);

        const vipVisitsTotal = visitCycleStatsRes.data?.summary?.totalVisits || 0;
        const regularVisitsTotal = clientCycleStatsRes.data?.summary?.totalVisits || 0;

        let vipWeeklyVisits = 0;
        let regularWeeklyVisits = 0;

        if (currentCycleNumber != null) {
          const weekParams = { cycleNumber: currentCycleNumber, cycleWeek: currentCycleWeek };
          const [visitWeekStatsRes, clientWeekStatsRes] = await Promise.all([
            visitService.getStats(weekParams),
            clientService.getStats(weekParams),
          ]);
          vipWeeklyVisits = visitWeekStatsRes.data?.summary?.totalVisits || 0;
          regularWeeklyVisits = clientWeekStatsRes.data?.summary?.totalVisits || 0;
        } else {
          vipWeeklyVisits = visitCycleStatsRes.data?.weeklyBreakdown?.reduce((sum, week) => sum + week.visitCount, 0) || 0;
          regularWeeklyVisits = clientCycleStatsRes.data?.weeklyBreakdown?.reduce((sum, week) => sum + week.visitCount, 0) || 0;
        }

        const cptData = cptSummaryRes.data || [];
        let targetVisits = 0;
        let actualVisits = 0;
        cptData.forEach((bdm) => {
          targetVisits += bdm.dcrTotal?.targetEngagements || 0;
          actualVisits += bdm.dcrTotal?.totalEngagements || 0;
        });

        const todayData = todayStatsRes.data || {};

        setStats({
          totalDoctors: doctorsRes.pagination?.total || 0,
          totalEmployees: usersRes.data?.pagination?.total || 0,
          totalVisits: vipVisitsTotal + regularVisitsTotal,
          vipVisits: vipVisitsTotal,
          regularVisits: regularVisitsTotal,
          visitsThisWeek: vipWeeklyVisits + regularWeeklyVisits,
          vipVisitsThisWeek: vipWeeklyVisits,
          regularVisitsThisWeek: regularWeeklyVisits,
          targetVisits,
          actualVisits,
          visitsToday: todayData.totalVisitsToday || 0,
          vipVisitsToday: todayData.vipVisitsToday || 0,
          regularVisitsToday: todayData.regularVisitsToday || 0,
        });
      } catch {
        setError('Failed to load dashboard data. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
    return () => controller.abort();
  }, []);

  if (loading) return <LoadingSpinner fullScreen />;

  return (
    <div className="admin-page">
      <style>{pageStyles}</style>
      <Navbar />
      <div className="admin-content">
        <Sidebar />
        <main className="admin-main">
          {error && <div className="error-banner">{error}</div>}
          {hasTopPanels && (
            <div className={topGridClassName}>
              {showGuide && (
                <div className="admin-guide-card">
                  <PageGuide pageKey="admin-dashboard" onVisibilityChange={setShowGuide} />
                </div>
              )}
              {agentRuns.length > 0 && (
                <section className="admin-agent-card" aria-label="AI agent activity">
                  <div className="admin-agent-head">
                    <div>
                      <div className="admin-agent-kicker">AI Operations</div>
                      <h3 className="admin-agent-title">Agent Run Snapshot</h3>
                      <p className="admin-agent-summary">
                        Recent automation jobs stay visible here without pushing the dashboard cards into a cramped stack.
                      </p>
                    </div>
                    <div className="admin-agent-count">{agentRuns.length} recent runs</div>
                  </div>
                  <div className="admin-agent-list">
                    {agentRuns.map((run, index) => {
                      const statusClass = getAgentStatusClass(run.status);
                      return (
                        <article key={run._id || index} className="admin-agent-run">
                          <div className="admin-agent-run-top">
                            <div className="admin-agent-name">{run.agent_label || 'Agent'}</div>
                            <span className={`admin-agent-status ${statusClass}`}>
                              {run.status || 'unknown'}
                            </span>
                          </div>
                          <div className="admin-agent-time">
                            {run.run_date ? new Date(run.run_date).toLocaleString() : '--'}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </section>
              )}
            </div>
          )}
          <div className="admin-dashboard-stage">
            <Dashboard
              user={user}
              stats={stats}
              onViewAllActivity={handleViewAllActivity}
              onActivityClick={handleActivityClick}
            />
          </div>
        </main>
      </div>
      <ActivityDetailModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        activity={selectedActivity}
      />
    </div>
  );
};

export default AdminDashboard;
