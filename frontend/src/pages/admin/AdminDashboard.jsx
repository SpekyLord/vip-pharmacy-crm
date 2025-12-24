/**
 * AdminDashboard Page
 *
 * Admin dashboard with:
 * - Overview statistics
 * - Pending approvals
 * - Recent activity
 * - Quick navigation
 */

import { useState, useEffect } from 'react';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import Dashboard from '../../components/admin/Dashboard';
import LoadingSpinner from '../../components/common/LoadingSpinner';

const AdminDashboard = () => {
  const [stats, setStats] = useState({});
  const [recentActivity, setRecentActivity] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // TODO: Fetch admin dashboard data
    setStats({
      totalDoctors: 150,
      totalEmployees: 25,
      totalVisits: 1250,
      pendingApprovals: 8,
      visitsToday: 12,
      visitsThisWeek: 87,
    });
    setRecentActivity([
      { timestamp: new Date(), description: 'New visit logged by John Doe' },
      { timestamp: new Date(), description: 'Doctor Dr. Smith added' },
    ]);
    setLoading(false);
  }, []);

  if (loading) {
    return <LoadingSpinner fullScreen />;
  }

  return (
    <div className="dashboard-layout">
      <Navbar />
      <div className="dashboard-content">
        <Sidebar />
        <main className="main-content">
          <Dashboard stats={stats} recentActivity={recentActivity} />
        </main>
      </div>
    </div>
  );
};

export default AdminDashboard;
