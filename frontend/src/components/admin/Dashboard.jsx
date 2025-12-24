/**
 * Dashboard Component (Admin)
 *
 * Admin dashboard with:
 * - Key metrics overview
 * - Recent activity feed
 * - Charts and graphs
 * - Quick action buttons
 */

const Dashboard = ({ stats = {}, recentActivity = [] }) => {
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
      <h2>Dashboard Overview</h2>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon">👨‍⚕️</div>
          <div className="stat-info">
            <span className="stat-value">{totalDoctors}</span>
            <span className="stat-label">Total Doctors</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">👥</div>
          <div className="stat-info">
            <span className="stat-value">{totalEmployees}</span>
            <span className="stat-label">Total Employees</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">📍</div>
          <div className="stat-info">
            <span className="stat-value">{totalVisits}</span>
            <span className="stat-label">Total Visits</span>
          </div>
        </div>

        <div className="stat-card highlight">
          <div className="stat-icon">⏳</div>
          <div className="stat-info">
            <span className="stat-value">{pendingApprovals}</span>
            <span className="stat-label">Pending Approvals</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">📅</div>
          <div className="stat-info">
            <span className="stat-value">{visitsToday}</span>
            <span className="stat-label">Visits Today</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">📊</div>
          <div className="stat-info">
            <span className="stat-value">{visitsThisWeek}</span>
            <span className="stat-label">Visits This Week</span>
          </div>
        </div>
      </div>

      <div className="recent-activity">
        <h3>Recent Activity</h3>
        <ul className="activity-list">
          {recentActivity.length > 0 ? (
            recentActivity.map((activity, index) => (
              <li key={index} className="activity-item">
                <span className="activity-time">
                  {new Date(activity.timestamp).toLocaleTimeString()}
                </span>
                <span className="activity-description">{activity.description}</span>
              </li>
            ))
          ) : (
            <li className="activity-item empty">No recent activity</li>
          )}
        </ul>
      </div>
    </div>
  );
};

export default Dashboard;
