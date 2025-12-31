/**
 * Dashboard Component (Admin) - Redesigned
 *
 * Modern admin dashboard with:
 * - Key metrics overview with icons
 * - Visual stat cards
 * - Recent activity feed
 * - Clean layout
 */

import {
  Stethoscope,
  Users,
  MapPin,
  Clock,
  Calendar,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';
import LiveActivityFeed from './LiveActivityFeed';

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
    grid-template-columns: repeat(3, 1fr);
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

  .stat-card-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
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
  .stat-icon.amber { background: #fef3c7; color: #d97706; }
  .stat-icon.pink { background: #fce7f3; color: #db2777; }
  .stat-icon.cyan { background: #cffafe; color: #0891b2; }

  .stat-trend {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 600;
  }

  .stat-trend.up {
    background: #dcfce7;
    color: #16a34a;
  }

  .stat-trend.down {
    background: #fee2e2;
    color: #dc2626;
  }

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

  /* Highlight Card */
  .stat-card.highlight {
    background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
    border-color: #fbbf24;
  }

  .stat-card.highlight .stat-icon {
    background: rgba(217, 119, 6, 0.2);
    color: #b45309;
  }

  /* Two Column Layout */
  .dashboard-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 24px;
  }

  /* Quick Stats Row */
  .quick-stats {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 16px;
  }

  .quick-stat {
    background: white;
    border-radius: 12px;
    padding: 20px;
    border: 1px solid #e5e7eb;
    display: flex;
    align-items: center;
    gap: 14px;
  }

  .quick-stat-icon {
    width: 44px;
    height: 44px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .quick-stat-content {
    flex: 1;
  }

  .quick-stat-value {
    font-size: 24px;
    font-weight: 700;
    color: #1f2937;
  }

  .quick-stat-label {
    font-size: 13px;
    color: #6b7280;
  }

  /* Activity Section */
  .activity-section {
    grid-column: span 2;
  }

  /* Responsive */
  @media (max-width: 1200px) {
    .stats-grid {
      grid-template-columns: repeat(2, 1fr);
    }
    .quick-stats {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  @media (max-width: 768px) {
    .stats-grid {
      grid-template-columns: 1fr;
    }
    .quick-stats {
      grid-template-columns: 1fr;
    }
    .dashboard-grid {
      grid-template-columns: 1fr;
    }
    .activity-section {
      grid-column: span 1;
    }
  }
`;

/* =============================================================================
   COMPONENT
   ============================================================================= */

const Dashboard = ({ stats = {}, onViewAllActivity = null, onActivityClick = null }) => {
  const {
    totalDoctors = 0,
    totalEmployees = 0,
    totalVisits = 0,
    pendingApprovals = 0,
    visitsToday = 0,
    visitsThisWeek = 0,
  } = stats;

  return (
    <div className="dashboard">
      <style>{dashboardStyles}</style>

      {/* Main Stats */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-card-header">
            <div className="stat-icon blue">
              <Stethoscope size={24} />
            </div>
            <div className="stat-trend up">
              <ArrowUpRight size={14} />
              12%
            </div>
          </div>
          <div className="stat-content">
            <span className="stat-value">{totalDoctors}</span>
            <span className="stat-label">VIP Clients</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-card-header">
            <div className="stat-icon purple">
              <Users size={24} />
            </div>
            <div className="stat-trend up">
              <ArrowUpRight size={14} />
              8%
            </div>
          </div>
          <div className="stat-content">
            <span className="stat-value">{totalEmployees}</span>
            <span className="stat-label">Field Employees</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-card-header">
            <div className="stat-icon green">
              <MapPin size={24} />
            </div>
            <div className="stat-trend up">
              <ArrowUpRight size={14} />
              24%
            </div>
          </div>
          <div className="stat-content">
            <span className="stat-value">{totalVisits}</span>
            <span className="stat-label">Total Visits</span>
          </div>
        </div>

        <div className="stat-card highlight">
          <div className="stat-card-header">
            <div className="stat-icon amber">
              <Clock size={24} />
            </div>
          </div>
          <div className="stat-content">
            <span className="stat-value">{pendingApprovals}</span>
            <span className="stat-label">Pending Approvals</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-card-header">
            <div className="stat-icon cyan">
              <Calendar size={24} />
            </div>
          </div>
          <div className="stat-content">
            <span className="stat-value">{visitsToday}</span>
            <span className="stat-label">Visits Today</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-card-header">
            <div className="stat-icon pink">
              <TrendingUp size={24} />
            </div>
            <div className="stat-trend down">
              <ArrowDownRight size={14} />
              3%
            </div>
          </div>
          <div className="stat-content">
            <span className="stat-value">{visitsThisWeek}</span>
            <span className="stat-label">Visits This Week</span>
          </div>
        </div>
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