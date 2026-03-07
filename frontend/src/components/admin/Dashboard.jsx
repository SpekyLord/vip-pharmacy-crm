/**
 * Dashboard Component (Admin)
 *
 * Clean admin dashboard with:
 * - 4 stat cards showing real data only
 * - Recent activity feed
 */

import { Stethoscope, Users, MapPin, Calendar } from 'lucide-react';
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

  /* Activity Section */
  .activity-section {
    grid-column: span 2;
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

const Dashboard = ({ stats = {}, onViewAllActivity = null, onActivityClick = null }) => {
  const {
    totalDoctors = 0,
    totalEmployees = 0,
    totalVisits = 0,
    visitsThisWeek = 0,
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
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon cyan">
            <Calendar size={24} />
          </div>
          <div className="stat-content">
            <span className="stat-value">{visitsThisWeek}</span>
            <span className="stat-label">This Week</span>
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
