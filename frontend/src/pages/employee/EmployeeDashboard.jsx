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

  // Fetch all dashboard data
  const fetchDashboardData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch data in parallel
      const [doctorsRes, todayRes, statsRes, weeklyRes] = await Promise.all([
        doctorService.getAll(),
        visitService.getToday(),
        visitService.getStats({ monthYear: getCurrentMonthYear() }),
        visitService.getWeeklyCompliance(getCurrentMonthYear()),
      ]);

      // Set doctors list
      const doctorsList = doctorsRes.data || [];
      setDoctors(doctorsList);

      // Calculate stats from responses
      const todayCount = todayRes.count || todayRes.data?.length || 0;
      const weeklyData = weeklyRes.data || {};
      const statsData = statsRes.data || {};

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
