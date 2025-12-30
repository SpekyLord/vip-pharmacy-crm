/**
 * Dashboard Component (Admin)
 *
 * Admin dashboard with:
 * - Key metrics overview
 * - Recent activity feed (LiveActivityFeed)
 * - Charts and graphs
 * - Quick action buttons
 */

import LiveActivityFeed from './LiveActivityFeed';

const dashboardStyles = `
  .admin-dashboard {
    padding: 0;
  }

  .admin-dashboard h2 {
    margin: 0 0 24px 0;
    font-size: 20px;
    color: #1f2937;
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 20px;
    margin-bottom: 32px;
  }

  .stat-card {
    background: white;
    border-radius: 12px;
    padding: 20px;
    display: flex;
    align-items: center;
    gap: 16px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    transition: transform 0.2s, box-shadow 0.2s;
  }

  .stat-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }

  .stat-card.highlight {
    background: linear-gradient(135deg, #fef3c7, #fde68a);
    border: 1px solid #f59e0b;
  }

  .stat-icon {
    width: 48px;
    height: 48px;
    background: #f3f4f6;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 24px;
  }

  .stat-card.highlight .stat-icon {
    background: rgba(245, 158, 11, 0.2);
  }

  .stat-info {
    display: flex;
    flex-direction: column;
  }

  .stat-value {
    font-size: 28px;
    font-weight: 700;
    color: #1f2937;
    line-height: 1.2;
  }

  .stat-label {
    font-size: 14px;
    color: #6b7280;
    margin-top: 4px;
  }

  .recent-activity {
    background: white;
    border-radius: 12px;
    padding: 24px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }

  .recent-activity h3 {
    margin: 0 0 16px 0;
    font-size: 18px;
    color: #1f2937;
    border-bottom: 2px solid #e5e7eb;
    padding-bottom: 12px;
  }

  .activity-list {
    list-style: none;
    padding: 0;
    margin: 0;
  }

  .activity-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 0;
    border-bottom: 1px solid #f3f4f6;
  }

  .activity-item:last-child {
    border-bottom: none;
  }

  .activity-item.empty {
    color: #9ca3af;
    font-style: italic;
    justify-content: center;
    padding: 24px;
  }

  .activity-time {
    font-size: 12px;
    color: #9ca3af;
    min-width: 80px;
  }

  .activity-description {
    font-size: 14px;
    color: #374151;
  }
`;

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
    <div className="admin-dashboard">
      <style>{dashboardStyles}</style>
      <h2>Dashboard Overview</h2>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon">&#x1F468;&#x200D;&#x2695;&#xFE0F;</div>
          <div className="stat-info">
            <span className="stat-value">{totalDoctors}</span>
            <span className="stat-label">Total VIP Clients</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">&#x1F465;</div>
          <div className="stat-info">
            <span className="stat-value">{totalEmployees}</span>
            <span className="stat-label">Total BDMs</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">&#x1F4CD;</div>
          <div className="stat-info">
            <span className="stat-value">{totalVisits}</span>
            <span className="stat-label">Total Visits</span>
          </div>
        </div>

        <div className="stat-card highlight">
          <div className="stat-icon">&#x23F3;</div>
          <div className="stat-info">
            <span className="stat-value">{pendingApprovals}</span>
            <span className="stat-label">Pending Approvals</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">&#x1F4C5;</div>
          <div className="stat-info">
            <span className="stat-value">{visitsToday}</span>
            <span className="stat-label">Visits Today</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">&#x1F4CA;</div>
          <div className="stat-info">
            <span className="stat-value">{visitsThisWeek}</span>
            <span className="stat-label">Visits This Week</span>
          </div>
        </div>
      </div>

      {/* Recent Activity - Uses LiveActivityFeed component */}
      <LiveActivityFeed
        compact={true}
        limit={5}
        showFilters={false}
        onViewAll={onViewAllActivity}
        onActivityClick={onActivityClick}
      />
    </div>
  );
};

export default Dashboard;