/**
 * AdminDashboard Page
 *
 * Admin dashboard with:
 * - Overview statistics from real API
 * - Recent activity
 * - Quick navigation
 */

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import Dashboard from '../../components/admin/Dashboard';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import doctorService from '../../services/doctorService';
import visitService from '../../services/visitService';
import api from '../../services/api';

const adminDashboardStyles = `
  .dashboard-layout {
    min-height: 100vh;
    background: #f3f4f6;
  }

  .dashboard-content {
    display: flex;
  }

  .main-content {
    flex: 1;
    padding: 24px;
    max-width: 1400px;
  }

  .page-header {
    margin-bottom: 24px;
  }

  .page-header h1 {
    margin: 0;
    font-size: 28px;
    color: #1f2937;
  }

  .quick-actions {
    display: flex;
    gap: 12px;
    margin-top: 24px;
    flex-wrap: wrap;
  }

  .quick-action-btn {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 12px 20px;
    background: #2563eb;
    color: white;
    border: none;
    border-radius: 8px;
    font-size: 14px;
    text-decoration: none;
    cursor: pointer;
    transition: background 0.2s;
  }

  .quick-action-btn:hover {
    background: #1d4ed8;
  }

  .quick-action-btn.secondary {
    background: #6b7280;
  }

  .quick-action-btn.secondary:hover {
    background: #4b5563;
  }

  .error-banner {
    background: #fee2e2;
    color: #dc2626;
    padding: 16px;
    border-radius: 8px;
    margin-bottom: 24px;
  }
`;

const AdminDashboard = () => {
  const [stats, setStats] = useState({
    totalDoctors: 0,
    totalEmployees: 0,
    totalVisits: 0,
    pendingApprovals: 0,
    visitsToday: 0,
    visitsThisWeek: 0,
  });
  const [recentActivity, setRecentActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch data in parallel - use limit: 0 to only get count without data
        const [doctorsRes, visitStatsRes, usersRes] = await Promise.all([
          doctorService.getAll({ limit: 0 }),
          visitService.getStats(),
          api.get('/users', { params: { limit: 0 } }),
        ]);

        setStats({
          totalDoctors: doctorsRes.pagination?.total || 0,
          totalEmployees: usersRes.data?.pagination?.total || 0,
          totalVisits: visitStatsRes.data?.summary?.totalVisits || 0,
          pendingApprovals: 0, // Phase 2: approval workflow
          visitsToday: visitStatsRes.data?.summary?.totalVisits || 0,
          visitsThisWeek: visitStatsRes.data?.weeklyBreakdown?.reduce((sum, w) => sum + w.visitCount, 0) || 0,
        });

        // Recent activity placeholder (Phase 2: audit log)
        setRecentActivity([]);

      } catch {
        setError('Failed to load dashboard data. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  if (loading) {
    return <LoadingSpinner fullScreen />;
  }

  return (
    <div className="dashboard-layout">
      <style>{adminDashboardStyles}</style>
      <Navbar />
      <div className="dashboard-content">
        <Sidebar />
        <main className="main-content">
          <div className="page-header">
            <h1>Admin Dashboard</h1>
          </div>

          {error && (
            <div className="error-banner">
              {error}
            </div>
          )}

          <Dashboard stats={stats} recentActivity={recentActivity} />

          <div className="quick-actions">
            <Link to="/admin/doctors" className="quick-action-btn">
              Manage Doctors
            </Link>
            <Link to="/admin/employees" className="quick-action-btn secondary">
              Manage Employees
            </Link>
            <Link to="/admin/reports" className="quick-action-btn secondary">
              View Reports
            </Link>
          </div>
        </main>
      </div>
    </div>
  );
};

export default AdminDashboard;
