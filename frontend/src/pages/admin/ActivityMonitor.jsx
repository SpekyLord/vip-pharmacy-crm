/**
 * ActivityMonitor Page
 *
 * Dedicated page for real-time system activity monitoring (Task 2.6)
 * Provides comprehensive view of all system activities with filtering.
 *
 * Features:
 * - Full activity feed with all filter options
 * - Activity statistics summary cards
 * - Auto-refresh every 30 seconds
 * - Detail modal on click (no page navigation)
 *
 * Route: /admin/activity
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Activity,
  MapPin,
  LogIn,
  UserCog,
  Package,
  TrendingUp,
  Clock,
  Users,
} from 'lucide-react';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import LiveActivityFeed from '../../components/admin/LiveActivityFeed';
import ActivityDetailModal from '../../components/admin/ActivityDetailModal';
import auditLogService from '../../services/auditLogService';
import visitService from '../../services/visitService';

/* =============================================================================
   STYLES
   ============================================================================= */

const pageStyles = `
  .activity-monitor-layout {
    min-height: 100vh;
    background: #f3f4f6;
  }

  .activity-monitor-content {
    display: flex;
  }

  .activity-monitor-main {
    flex: 1;
    padding: 24px;
    max-width: 1400px;
  }

  .page-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 24px;
  }

  .page-header h1 {
    margin: 0;
    font-size: 28px;
    color: #1f2937;
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .page-header-icon {
    width: 40px;
    height: 40px;
    background: linear-gradient(135deg, #22c55e, #16a34a);
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
  }

  .live-indicator {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 16px;
    background: white;
    border-radius: 10px;
    border: 1px solid #e5e7eb;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  }

  .live-dot {
    width: 8px;
    height: 8px;
    background: #22c55e;
    border-radius: 50%;
    animation: pulse 2s infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  .live-time {
    font-size: 14px;
    font-weight: 500;
    color: #374151;
  }

  .live-date {
    font-size: 12px;
    color: #9ca3af;
  }

  /* Stats Grid */
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 16px;
    margin-bottom: 24px;
  }

  .stat-card {
    background: white;
    border-radius: 12px;
    padding: 16px;
    border: 1px solid #e5e7eb;
    display: flex;
    align-items: center;
    gap: 14px;
    transition: all 0.2s;
  }

  .stat-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  }

  .stat-icon {
    width: 44px;
    height: 44px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .stat-icon.green { background: #dcfce7; color: #16a34a; }
  .stat-icon.blue { background: #dbeafe; color: #2563eb; }
  .stat-icon.emerald { background: #d1fae5; color: #059669; }
  .stat-icon.purple { background: #f3e8ff; color: #9333ea; }
  .stat-icon.amber { background: #fef3c7; color: #d97706; }
  .stat-icon.gray { background: #f3f4f6; color: #6b7280; }

  .stat-info {
    display: flex;
    flex-direction: column;
  }

  .stat-value {
    font-size: 22px;
    font-weight: 700;
    color: #1f2937;
    line-height: 1.2;
  }

  .stat-label {
    font-size: 13px;
    color: #6b7280;
    margin-top: 2px;
  }

  @media (max-width: 768px) {
    .stats-grid {
      grid-template-columns: repeat(2, 1fr);
      gap: 12px;
    }

    .stat-card {
      padding: 14px;
    }

    .stat-value {
      font-size: 20px;
    }
  }

  @media (max-width: 480px) {
    .activity-monitor-main {
      padding: 16px;
      padding-bottom: 80px;
    }
    .page-header {
      flex-direction: column;
      align-items: flex-start;
      gap: 12px;
    }
    .page-header h1 {
      font-size: 22px;
    }
    .stats-grid {
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }
    .stat-card {
      padding: 12px;
    }
    .stat-value {
      font-size: 18px;
    }
    .live-indicator {
      padding: 8px 12px;
    }
  }
`;

/* =============================================================================
   COMPONENT: ActivityMonitor
   ============================================================================= */

const ActivityMonitor = () => {
  const [stats, setStats] = useState({
    totalToday: 0,
    visitsLogged: 0,
    authEvents: 0,
    systemUpdates: 0,
    activeUsers: 0,
    peakHour: '—',
  });
  const [currentTime, setCurrentTime] = useState(new Date());

  // Modal state
  const [selectedActivity, setSelectedActivity] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  /* ---------------------------------------------------------------------------
     Fetch Real Stats
     --------------------------------------------------------------------------- */

  const fetchStats = useCallback(async () => {
    try {
      const todayISO = new Date().toISOString().split('T')[0];

      const [auditStatsRes, visitsRes] = await Promise.all([
        auditLogService.getStats({ date: todayISO }).catch(() => ({ data: {} })),
        visitService.getAll({ dateFrom: todayISO, dateTo: todayISO, limit: 0 }).catch(() => ({ pagination: { total: 0 } })),
      ]);

      const auditData = auditStatsRes.data || {};
      const visitsLogged = visitsRes.pagination?.total ?? (visitsRes.data?.length || 0);
      const authEvents = auditData.authEvents || 0;
      const activeUsers = auditData.activeUsers || 0;
      const peakHour = auditData.peakHour || '—';

      setStats({
        totalToday: visitsLogged + authEvents,
        visitsLogged,
        authEvents,
        systemUpdates: 0,
        activeUsers,
        peakHour,
      });
    } catch (err) {
      console.error('Failed to fetch activity stats:', err);
    }
  }, []);

  /* ---------------------------------------------------------------------------
     Live Clock Update + Stats Refresh
     --------------------------------------------------------------------------- */

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 60000);
    return () => clearInterval(interval);
  }, [fetchStats]);

  /* ---------------------------------------------------------------------------
     Modal Handlers
     --------------------------------------------------------------------------- */

  const handleActivityClick = (activity) => {
    setSelectedActivity(activity);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedActivity(null);
  };

  /* ---------------------------------------------------------------------------
     Render
     --------------------------------------------------------------------------- */

  return (
    <div className="activity-monitor-layout">
      <style>{pageStyles}</style>
      <Navbar />
      <div className="activity-monitor-content">
        <Sidebar />
        <main className="activity-monitor-main">
          {/* Page Header */}
          <div className="page-header">
            <h1>
              <div className="page-header-icon">
                <Activity size={20} />
              </div>
              Activity Monitor
            </h1>

            {/* Live Clock */}
            <div className="live-indicator">
              <div className="live-dot" />
              <span className="live-time">
                {currentTime.toLocaleTimeString()}
              </span>
              <span className="live-date">
                {currentTime.toLocaleDateString('en-US', {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                })}
              </span>
            </div>
          </div>

          {/* Stats Cards */}
          <div className="stats-grid">
            <StatCard
              icon={TrendingUp}
              label="Total Today"
              value={stats.totalToday}
              color="green"
            />
            <StatCard
              icon={MapPin}
              label="Visits Logged"
              value={stats.visitsLogged}
              color="blue"
            />
            <StatCard
              icon={LogIn}
              label="Auth Events"
              value={stats.authEvents}
              color="emerald"
            />
            <StatCard
              icon={UserCog}
              label="System Updates"
              value={stats.systemUpdates}
              color="purple"
            />
            <StatCard
              icon={Users}
              label="Active Now"
              value={stats.activeUsers}
              color="amber"
            />
            <StatCard
              icon={Clock}
              label="Peak Hour"
              value={stats.peakHour}
              color="gray"
              isText
            />
          </div>

          {/* Activity Feed - passes click handler */}
          <LiveActivityFeed
            compact={false}
            limit={50}
            showFilters={true}
            onActivityClick={handleActivityClick}
          />
        </main>
      </div>

      {/* Activity Detail Modal */}
      <ActivityDetailModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        activity={selectedActivity}
      />
    </div>
  );
};

/* =============================================================================
   COMPONENT: StatCard
   Small stat card for the overview section.
   ============================================================================= */

const StatCard = ({ icon: Icon, label, value, color, isText = false }) => {
  return (
    <div className="stat-card">
      <div className={`stat-icon ${color}`}>
        <Icon size={20} />
      </div>
      <div className="stat-info">
        <span className={`stat-value ${isText ? 'text-lg' : ''}`}>{value}</span>
        <span className="stat-label">{label}</span>
      </div>
    </div>
  );
};

export default ActivityMonitor;