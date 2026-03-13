/**
 * AdminDashboard Page
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import Dashboard from '../../components/admin/Dashboard';
import ActivityDetailModal from '../../components/admin/ActivityDetailModal';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import doctorService from '../../services/doctorService';
import visitService from '../../services/visitService';
import clientService from '../../services/clientService';
import api from '../../services/api';

const pageStyles = `
  :root {
    --page-bg: #f1f5f9;
  }

  body.dark-mode {
    --page-bg: #0f172a;
  }

  .admin-page {
    min-height: 100vh;
    background: var(--page-bg);
    transition: background-color 0.3s;
  }

  .admin-content {
    display: flex;
  }

  .admin-main {
    flex: 1;
    padding: 0;
    min-width: 0;
    overflow: hidden;
  }

  .error-banner {
    display: flex;
    align-items: center;
    gap: 12px;
    background: #fef2f2;
    color: #dc2626;
    padding: 12px 16px;
    border-radius: 8px;
    margin: 16px 24px;
    border: 1px solid #fecaca;
    font-size: 13px;
  }

  body.dark-mode .error-banner {
    background: #7f1d1d;
    color: #fca5a5;
    border-color: #991b1b;
  }
`;

const AdminDashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [stats, setStats] = useState({
    totalDoctors: 0,
    totalEmployees: 0,
    totalVisits: 0,
    vipVisits: 0,
    regularVisits: 0,
    visitsThisWeek: 0,
    vipVisitsThisWeek: 0,
    regularVisitsThisWeek: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [selectedActivity, setSelectedActivity] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleViewAllActivity = () => navigate('/admin/activity');
  const handleActivityClick = (activity) => { setSelectedActivity(activity); setIsModalOpen(true); };
  const handleCloseModal = () => { setIsModalOpen(false); setSelectedActivity(null); };

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        setLoading(true);
        setError(null);
        const [doctorsRes, visitStatsRes, clientStatsRes, usersRes] = await Promise.all([
          doctorService.getAll({ limit: 0 }),
          visitService.getStats(),
          clientService.getStats(),
          api.get('/users', { params: { limit: 0 } }),
        ]);
        const vipVisitsTotal = visitStatsRes.data?.summary?.totalVisits || 0;
        const regularVisitsTotal = clientStatsRes.data?.summary?.totalVisits || 0;
        const vipWeeklyVisits = visitStatsRes.data?.weeklyBreakdown?.reduce((sum, w) => sum + w.visitCount, 0) || 0;
        const regularWeeklyVisits = clientStatsRes.data?.weeklyBreakdown?.reduce((sum, w) => sum + w.visitCount, 0) || 0;
        setStats({
          totalDoctors: doctorsRes.pagination?.total || 0,
          totalEmployees: usersRes.data?.pagination?.total || 0,
          totalVisits: vipVisitsTotal + regularVisitsTotal,
          vipVisits: vipVisitsTotal,
          regularVisits: regularVisitsTotal,
          visitsThisWeek: vipWeeklyVisits + regularWeeklyVisits,
          vipVisitsThisWeek: vipWeeklyVisits,
          regularVisitsThisWeek: regularWeeklyVisits,
        });
      } catch {
        setError('Failed to load dashboard data. Please try again.');
      } finally {
        setLoading(false);
      }
    };
    fetchDashboardData();
  }, []);

  if (loading) return <LoadingSpinner fullScreen />;

  return (
    <div className="admin-page">
      <style>{pageStyles}</style>
      <Navbar />
      <div className="admin-content">
        <Sidebar />
        <main className="admin-main">
          {error && <div className="error-banner">{error}</div>}
          <Dashboard
            user={user}
            stats={stats}
            onViewAllActivity={handleViewAllActivity}
            onActivityClick={handleActivityClick}
          />
        </main>
      </div>
      <ActivityDetailModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        activity={selectedActivity}
      />
    </div>
  );
};

export default AdminDashboard;
