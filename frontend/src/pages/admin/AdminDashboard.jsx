/**
 * AdminDashboard Page
 */

import { useState, useEffect } from 'react';
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

const CYCLE_ANCHOR = new Date(2026, 0, 5);

const getCycleWeek = (date) => {
  const diffDays = Math.floor((date.getTime() - CYCLE_ANCHOR.getTime()) / 86400000);
  const dayInCycle = ((diffDays % 28) + 28) % 28;
  return Math.floor(dayInCycle / 7) + 1; // 1-4
};

const pageStyles = `
  :root {
    --page-bg: #f1f5f9;
  }

  body.dark-mode {
    --page-bg: #0f172a;
  }

  .admin-page {
    min-height: 100vh;
    height: 100vh;
    height: 100dvh;
    background: var(--page-bg);
    transition: background-color 0.3s;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .admin-content {
    display: flex;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  .admin-main {
    flex: 1;
    padding: 0;
    min-width: 0;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    display: flex;
    flex-direction: column;
  }

  .admin-main .db-shell {
    flex: 1;
    min-height: 0;
  }

  .error-banner {
    display: flex;
    align-items: center;
    gap: 12px;
    background: #fef2f2;
    color: #dc2626;
    padding: 12px 16px;
    border-radius: 8px;
    margin: 16px 24px;
    border: 1px solid #fecaca;
    font-size: 13px;
  }

  body.dark-mode .error-banner {
    background: #7f1d1d;
    color: #fca5a5;
    border-color: #991b1b;
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
    // Target vs Actual
    targetVisits: 0,
    actualVisits: 0,
    // Today
    visitsToday: 0,
    vipVisitsToday: 0,
    regularVisitsToday: 0,
  });
  const [agentRuns, setAgentRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [selectedActivity, setSelectedActivity] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleViewAllActivity = () => navigate('/admin/activity');
  const handleActivityClick = (activity) => { setSelectedActivity(activity); setIsModalOpen(true); };
  const handleCloseModal = () => { setIsModalOpen(false); setSelectedActivity(null); };

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch AI agent runs (non-blocking)
        api.get('/erp/agents/runs?limit=3').then(res => setAgentRuns(res.data?.data || [])).catch(() => {});

        const [doctorsRes, usersRes, cptSummaryRes, todayStatsRes, cycleRes] = await Promise.all([
          doctorService.getAll({ limit: 0 }),
          api.get('/users', { params: { limit: 0 } }),
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
          // Fallback if cycle context is unavailable.
          vipWeeklyVisits = visitCycleStatsRes.data?.weeklyBreakdown?.reduce((sum, w) => sum + w.visitCount, 0) || 0;
          regularWeeklyVisits = clientCycleStatsRes.data?.weeklyBreakdown?.reduce((sum, w) => sum + w.visitCount, 0) || 0;
        }

        // Aggregate target vs actual from CPT summary
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
          {agentRuns.length > 0 && (
            <div style={{ background: 'var(--erp-panel, #fff)', border: '1px solid var(--erp-border, #e5e7eb)', borderRadius: 12, padding: 16, margin: '16px 24px 0' }}>
              <h3 style={{ fontSize: 13, fontWeight: 700, margin: '0 0 10px', color: 'var(--erp-text, #1f2937)', display: 'flex', alignItems: 'center', gap: 6 }}>🤖 AI Agents</h3>
              {agentRuns.map((r, i) => (
                <div key={r._id || i} style={{ padding: '8px 0', borderTop: i > 0 ? '1px solid var(--erp-border, #e5e7eb)' : 'none', fontSize: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 600, color: 'var(--erp-text, #1f2937)' }}>{r.agent_label || 'Agent'}</div>
                    <div style={{ color: 'var(--erp-muted, #6b7280)', fontSize: 11 }}>{r.run_date ? new Date(r.run_date).toLocaleString() : '--'}</div>
                  </div>
                  <span style={{ padding: '2px 8px', borderRadius: 8, fontSize: 10, fontWeight: 600, background: r.status === 'success' ? '#dcfce7' : r.status === 'error' ? '#fef2f2' : '#e8efff', color: r.status === 'success' ? '#16a34a' : r.status === 'error' ? '#dc2626' : '#2563eb' }}>
                    {r.status || 'unknown'}
                  </span>
                </div>
              ))}
            </div>
          )}
          <Dashboard
            user={user}
            stats={stats}
            onViewAllActivity={handleViewAllActivity}
            onActivityClick={handleActivityClick}
          />
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
