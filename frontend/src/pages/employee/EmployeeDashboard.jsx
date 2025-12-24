/**
 * EmployeeDashboard Page
 *
 * Main dashboard for employees with:
 * - Today's visits summary
 * - Quick actions
 * - Assigned doctors list
 * - Weekly progress
 */

import { useState, useEffect } from 'react';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import DoctorList from '../../components/employee/DoctorList';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import { useAuth } from '../../hooks/useAuth';

const EmployeeDashboard = () => {
  const { user } = useAuth();
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    visitsToday: 0,
    visitsThisWeek: 0,
    pendingVisits: 0,
  });

  useEffect(() => {
    // TODO: Fetch dashboard data
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
          <h1>Welcome, {user?.name}</h1>

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
              <span className="stat-value">{stats.pendingVisits}</span>
              <span className="stat-label">Pending</span>
            </div>
          </div>

          <section className="dashboard-section">
            <h2>My Doctors</h2>
            <DoctorList doctors={doctors} loading={loading} />
          </section>
        </main>
      </div>
    </div>
  );
};

export default EmployeeDashboard;
