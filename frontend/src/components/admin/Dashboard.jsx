/**
 * Dashboard Component (Admin)
 *
 * Clean admin dashboard with:
 * - 4 stat cards showing real data only
 * - Active BDMs widget
 * - Recent activity feed
 */

import { useState, useEffect, useCallback } from 'react';
import { Stethoscope, Users, MapPin, Calendar } from 'lucide-react';
import LiveActivityFeed from './LiveActivityFeed';
import userService from '../../services/userService';

/* =============================================================================
   STYLES
   ============================================================================= */

const dashboardStyles = `
  .dashboard {
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  /* Stats Grid */
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 20px;
  }

  .stat-card {
    background: white;
    border-radius: 16px;
    padding: 24px;
    border: 1px solid #e5e7eb;
    display: flex;
    flex-direction: column;
    gap: 16px;
    transition: all 0.2s;
  }

  .stat-card:hover {
    border-color: #d1d5db;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
  }

  .stat-icon {
    width: 48px;
    height: 48px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .stat-icon.blue { background: #dbeafe; color: #2563eb; }
  .stat-icon.purple { background: #f3e8ff; color: #7c3aed; }
  .stat-icon.green { background: #dcfce7; color: #16a34a; }
  .stat-icon.cyan { background: #cffafe; color: #0891b2; }

  .stat-content {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .stat-value {
    font-size: 32px;
    font-weight: 700;
    color: #1f2937;
    line-height: 1;
  }

  .stat-label {
    font-size: 14px;
    color: #6b7280;
  }

  .stat-breakdown {
    font-size: 12px;
    color: #9ca3af;
    margin-top: 6px;
    display: flex;
    gap: 12px;
  }

  .stat-breakdown span {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  .stat-breakdown .vip-badge {
    width: 8px;
    height: 8px;
    background: #fbbf24;
    border-radius: 50%;
  }

  .stat-breakdown .regular-badge {
    width: 8px;
    height: 8px;
    background: #60a5fa;
    border-radius: 50%;
  }

  /* Activity Section */
  .activity-section {
    grid-column: span 2;
  }

  /* Active Now Widget */
  .active-now-card {
    background: white;
    border-radius: 16px;
    border: 1px solid #e5e7eb;
    padding: 20px 24px;
  }

  .active-now-header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 16px;
  }

  .active-now-dot {
    width: 10px;
    height: 10px;
    background: #22c55e;
    border-radius: 50%;
    animation: pulse-dot 2s infinite;
  }

  @keyframes pulse-dot {
    0%, 100% { opacity: 1; box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.4); }
    50% { opacity: 0.8; box-shadow: 0 0 0 6px rgba(34, 197, 94, 0); }
  }

  .active-now-title {
    font-size: 16px;
    font-weight: 600;
    color: #1f2937;
  }

  .active-now-count {
    margin-left: auto;
    background: #f0fdf4;
    color: #16a34a;
    font-size: 13px;
    font-weight: 600;
    padding: 4px 10px;
    border-radius: 12px;
  }

  .active-now-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .active-user-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 0;
  }

  .active-user-avatar {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%);
    color: #2563eb;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    font-weight: 600;
    flex-shrink: 0;
    position: relative;
  }

  .active-user-avatar::after {
    content: '';
    position: absolute;
    bottom: 0;
    right: 0;
    width: 10px;
    height: 10px;
    background: #22c55e;
    border-radius: 50%;
    border: 2px solid white;
  }

  .active-user-info {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .active-user-name {
    font-size: 14px;
    font-weight: 500;
    color: #1f2937;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .active-user-time {
    font-size: 12px;
    color: #9ca3af;
  }

  .active-now-empty {
    text-align: center;
    padding: 16px 0;
    color: #9ca3af;
    font-size: 14px;
  }

  /* Responsive */
  @media (max-width: 1200px) {
    .stats-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  @media (max-width: 768px) {
    .stats-grid {
      grid-template-columns: repeat(2, 1fr);
      gap: 12px;
    }
    .activity-section {
      grid-column: span 1;
    }
  }

  @media (max-width: 480px) {
    .stats-grid {
      grid-template-columns: repeat(2, 1fr);
      gap: 10px;
    }
    .stat-card {
      padding: 16px;
      gap: 10px;
    }
    .stat-icon {
      width: 40px;
      height: 40px;
      border-radius: 10px;
    }
    .stat-value {
      font-size: 24px;
    }
    .stat-label {
      font-size: 13px;
    }
    .dashboard {
      gap: 16px;
    }
  }
`;

/* =============================================================================
   COMPONENT
   ============================================================================= */

const getInitials = (name) => {
  if (!name) return '?';
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
};

const getTimeAgo = (date) => {
  const diff = Math.floor((Date.now() - new Date(date)) / 1000);
  if (diff < 60) return 'just now';
  const mins = Math.floor(diff / 60);
  return `${mins}m ago`;
};

const Dashboard = ({ stats = {}, onViewAllActivity = null, onActivityClick = null }) => {
  const [activeUsers, setActiveUsers] = useState([]);

  const fetchActiveUsers = useCallback(async () => {
    try {
      const res = await userService.getActiveUsers();
      setActiveUsers(res.data || []);
    } catch {
      // Silently fail — not critical
    }
  }, []);

  useEffect(() => {
    fetchActiveUsers();
    const interval = setInterval(fetchActiveUsers, 30000);
    return () => clearInterval(interval);
  }, [fetchActiveUsers]);
  const {
    totalDoctors = 0,
    totalEmployees = 0,
    totalVisits = 0,
    vipVisits = 0,
    regularVisits = 0,
    visitsThisWeek = 0,
    vipVisitsThisWeek = 0,
    regularVisitsThisWeek = 0,
  } = stats;

  return (
    <div className="dashboard">
      <style>{dashboardStyles}</style>

      {/* Stat Cards */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon blue">
            <Stethoscope size={24} />
          </div>
          <div className="stat-content">
            <span className="stat-value">{totalDoctors}</span>
            <span className="stat-label">VIP Clients</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon purple">
            <Users size={24} />
          </div>
          <div className="stat-content">
            <span className="stat-value">{totalEmployees}</span>
            <span className="stat-label">BDMs</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon green">
            <MapPin size={24} />
          </div>
          <div className="stat-content">
            <span className="stat-value">{totalVisits}</span>
            <span className="stat-label">Total Visits</span>
            <div className="stat-breakdown">
              <span>
                <span className="vip-badge"></span>
                VIP: {vipVisits}
              </span>
              <span>
                <span className="regular-badge"></span>
                Regular: {regularVisits}
              </span>
            </div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon cyan">
            <Calendar size={24} />
          </div>
          <div className="stat-content">
            <span className="stat-value">{visitsThisWeek}</span>
            <span className="stat-label">This Week</span>
            <div className="stat-breakdown">
              <span>
                <span className="vip-badge"></span>
                VIP: {vipVisitsThisWeek}
              </span>
              <span>
                <span className="regular-badge"></span>
                Regular: {regularVisitsThisWeek}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Active Now */}
      <div className="active-now-card">
        <div className="active-now-header">
          <span className="active-now-dot"></span>
          <span className="active-now-title">Active Now</span>
          <span className="active-now-count">{activeUsers.length} online</span>
        </div>
        {activeUsers.length > 0 ? (
          <div className="active-now-list">
            {activeUsers.map((u) => (
              <div key={u._id} className="active-user-item">
                <div className="active-user-avatar">
                  {getInitials(u.name)}
                </div>
                <div className="active-user-info">
                  <span className="active-user-name">{u.name}</span>
                  <span className="active-user-time">{getTimeAgo(u.lastActivity)}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="active-now-empty">No BDMs currently active</div>
        )}
      </div>

      {/* Activity Feed */}
      <div className="activity-section">
        <LiveActivityFeed
          compact={true}
          limit={5}
          showFilters={false}
          onViewAll={onViewAllActivity}
          onActivityClick={onActivityClick}
        />
      </div>
    </div>
  );
};

export default Dashboard;
