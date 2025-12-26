/**
 * EmployeeDashboard Page
 *
 * Main dashboard for employees with:
 * - Today's visits summary
 * - Quick actions
 * - Assigned doctors list
 * - Weekly progress
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import DoctorList from '../../components/employee/DoctorList';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import ErrorMessage from '../../components/common/ErrorMessage';
import { useAuth } from '../../hooks/useAuth';
import doctorService from '../../services/doctorService';
import visitService from '../../services/visitService';

const dashboardStyles = `
  .main-content h1 {
    margin: 0 0 24px 0;
    font-size: 28px;
    font-weight: 600;
    color: #1f2937;
  }

  .stats-row {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 16px;
    margin-bottom: 24px;
  }

  .stat-card {
    background: white;
    padding: 20px;
    border-radius: 12px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    border: 1px solid #e5e7eb;
  }

  .stat-card .stat-value {
    font-size: 36px;
    font-weight: 700;
    color: #2563eb;
    line-height: 1;
    margin-bottom: 8px;
  }

  .stat-card .stat-label {
    font-size: 14px;
    color: #6b7280;
    font-weight: 500;
  }

  .compliance-bar {
    background: white;
    padding: 20px;
    border-radius: 12px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    margin-bottom: 24px;
    border: 1px solid #e5e7eb;
  }

  .compliance-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
  }

  .compliance-header span:first-child {
    font-size: 16px;
    font-weight: 600;
    color: #1f2937;
  }

  .compliance-header span:last-child {
    font-size: 18px;
    font-weight: 700;
    color: #2563eb;
  }

  .progress-track {
    height: 12px;
    background: #e5e7eb;
    border-radius: 6px;
    overflow: hidden;
  }

  .progress-track .progress-fill {
    height: 100%;
    background: linear-gradient(90deg, #2563eb, #3b82f6);
    border-radius: 6px;
    transition: width 0.5s ease;
  }

  .dashboard-section {
    background: white;
    padding: 24px;
    border-radius: 12px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    border: 1px solid #e5e7eb;
  }

  .dashboard-section h2 {
    margin: 0 0 20px 0;
    font-size: 20px;
    font-weight: 600;
    color: #1f2937;
    padding-bottom: 12px;
    border-bottom: 2px solid #e5e7eb;
  }

  @media (max-width: 768px) {
    .stats-row {
      grid-template-columns: repeat(2, 1fr);
    }

    .stat-card .stat-value {
      font-size: 28px;
    }
  }
`;

const EmployeeDashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState({
    visitsToday: 0,
    visitsThisWeek: 0,
    totalDoctors: 0,
    doctorsVisitedThisMonth: 0,
    compliancePercentage: 0,
  });

  // Get current month-year for API calls
  const getCurrentMonthYear = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  };

  // Fetch all dashboard data with graceful degradation
  const fetchDashboardData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const monthYear = getCurrentMonthYear();

      // Use Promise.allSettled for graceful degradation on partial failures
      // Fetch ALL doctors (limit=0) so employee can see their full assigned list
      const results = await Promise.allSettled([
        doctorService.getAll({ limit: 0 }),
        visitService.getToday(),
        visitService.getStats({ monthYear }),
        visitService.getWeeklyCompliance(monthYear),
      ]);

      // Extract results with fallbacks for failed requests
      const [doctorsResult, todayResult, statsResult, weeklyResult] = results;

      // Process doctors - critical, show error if fails
      const doctorsList = doctorsResult.status === 'fulfilled'
        ? (doctorsResult.value.data || [])
        : [];
      setDoctors(doctorsList);

      if (doctorsResult.status === 'rejected') {
        console.error('Failed to fetch doctors:', doctorsResult.reason);
      }

      // Process today's visits - non-critical, use fallback
      const todayCount = todayResult.status === 'fulfilled'
        ? (todayResult.value.count || todayResult.value.data?.length || 0)
        : 0;

      // Process stats - non-critical, use fallback
      const statsData = statsResult.status === 'fulfilled'
        ? (statsResult.value.data || {})
        : {};

      // Process weekly data - non-critical, use fallback
      const weeklyData = weeklyResult.status === 'fulfilled'
        ? (weeklyResult.value.data || {})
        : {};

      // Get current week's visits from weekly breakdown
      const currentWeek = Math.ceil(new Date().getDate() / 7);
      const weeklyBreakdown = statsData.weeklyBreakdown || [];
      const thisWeekData = weeklyBreakdown.find(w => w.week === currentWeek) || {};

      setStats({
        visitsToday: todayCount,
        visitsThisWeek: thisWeekData.visitCount || 0,
        totalDoctors: doctorsList.length,
        doctorsVisitedThisMonth: weeklyData.uniqueDoctorsVisited || statsData.summary?.uniqueDoctorsCount || 0,
        compliancePercentage: weeklyData.compliancePercentage || 0,
      });

      // Show error only if all requests failed
      const allFailed = results.every(r => r.status === 'rejected');
      if (allFailed) {
        setError('Failed to load dashboard data. Please try again.');
      }
    } catch (err) {
      console.error('Failed to fetch dashboard data:', err);
      setError(err.response?.data?.message || 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  // Handle doctor selection - navigate to visit logger
  const handleSelectDoctor = (doctor) => {
    navigate(`/employee/visit/new?doctorId=${doctor._id}`);
  };

  // Handle log visit button click
  const handleLogVisit = (doctor) => {
    navigate(`/employee/visit/new?doctorId=${doctor._id}`);
  };

  if (loading) {
    return <LoadingSpinner fullScreen />;
  }

  return (
    <div className="dashboard-layout">
      <style>{dashboardStyles}</style>
      <Navbar />
      <div className="dashboard-content">
        <Sidebar />
        <main className="main-content">
          <h1>Welcome, {user?.name}</h1>

          {error && (
            <ErrorMessage
              message={error}
              onRetry={fetchDashboardData}
            />
          )}

          <div className="stats-row">
            <div className="stat-card">
              <span className="stat-value">{stats.visitsToday}</span>
              <span className="stat-label">Visits Today</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">{stats.visitsThisWeek}</span>
              <span className="stat-label">This Week</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">{stats.doctorsVisitedThisMonth}</span>
              <span className="stat-label">Doctors Visited</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">{stats.totalDoctors}</span>
              <span className="stat-label">Total Doctors</span>
            </div>
          </div>

          {stats.compliancePercentage > 0 && (
            <div className="compliance-bar">
              <div className="compliance-header">
                <span>Monthly Progress</span>
                <span>{stats.compliancePercentage}%</span>
              </div>
              <div className="progress-track">
                <div
                  className="progress-fill"
                  style={{ width: `${Math.min(stats.compliancePercentage, 100)}%` }}
                />
              </div>
            </div>
          )}

          <section className="dashboard-section">
            <h2>My Doctors</h2>
            <DoctorList
              doctors={doctors}
              loading={loading}
              onSelectDoctor={handleSelectDoctor}
              onLogVisit={handleLogVisit}
            />
          </section>
        </main>
      </div>
    </div>
  );
};

export default EmployeeDashboard;
