/**
 * AdminDashboard Page - Redesigned
 *
 * Modern admin dashboard with:
 * - Welcome header with date
 * - Overview statistics
 * - Quick action buttons
 * - Activity feed
 */

import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
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
import {
  Stethoscope,
  Users,
  FileText,
  ChevronRight,
  Sparkles,
} from 'lucide-react';

/* =============================================================================
   STYLES
   ============================================================================= */

const pageStyles = `
  .admin-page {
    min-height: 100vh;
    background: #f8fafc;
  }

  .admin-content {
    display: flex;
  }

  .admin-main {
    flex: 1;
    padding: 24px 32px;
    max-width: 1400px;
    min-width: 0;
  }

  /* Header */
  .page-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 32px;
  }

  .page-header-left {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .page-greeting {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .page-greeting-icon {
    width: 32px;
    height: 32px;
    background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #d97706;
  }

  .page-header h1 {
    margin: 0;
    font-size: 28px;
    font-weight: 700;
    color: #0f172a;
  }

  .page-date {
    font-size: 14px;
    color: #64748b;
  }

  /* Quick Actions */
  .quick-actions {
    display: flex;
    gap: 12px;
  }

  .quick-action-btn {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 12px 20px;
    background: white;
    color: #374151;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    font-size: 14px;
    font-weight: 500;
    text-decoration: none;
    cursor: pointer;
    transition: all 0.2s;
    min-height: 44px;
  }

  .quick-action-btn:hover {
    background: #f8fafc;
    border-color: #cbd5e1;
  }

  .quick-action-btn:active {
    transform: scale(0.98);
  }

  .quick-action-btn.primary {
    background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
    color: white;
    border: none;
  }

  .quick-action-btn.primary:hover {
    box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
  }

  .quick-action-icon {
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  /* Error Banner */
  .error-banner {
    display: flex;
    align-items: center;
    gap: 12px;
    background: #fef2f2;
    color: #dc2626;
    padding: 16px 20px;
    border-radius: 12px;
    margin-bottom: 24px;
    border: 1px solid #fecaca;
  }

  /* Responsive - Tablet */
  @media (max-width: 1024px) {
    .admin-main {
      padding: 20px;
    }
    .page-header {
      flex-direction: column;
      align-items: flex-start;
      gap: 16px;
    }
    .quick-actions {
      flex-wrap: wrap;
    }
  }

  /* Responsive - Mobile */
  @media (max-width: 480px) {
    .admin-main {
      padding: 16px;
      padding-bottom: 80px;
    }
    .page-header {
      margin-bottom: 20px;
    }
    .page-header h1 {
      font-size: 22px;
    }
    .quick-actions {
      width: 100%;
      gap: 8px;
    }
    .quick-action-btn {
      flex: 1;
      justify-content: center;
      padding: 10px 12px;
      font-size: 13px;
    }
  }
`;

/* =============================================================================
   COMPONENT
   ============================================================================= */

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

  // Modal state
  const [selectedActivity, setSelectedActivity] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Get formatted date
  const formatDate = () => {
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    return new Date().toLocaleDateString('en-US', options);
  };

  // Get greeting based on time
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 18) return 'Good Afternoon';
    return 'Good Evening';
  };

  // Handlers
  const handleViewAllActivity = () => navigate('/admin/activity');
  const handleActivityClick = (activity) => {
    setSelectedActivity(activity);
    setIsModalOpen(true);
  };
  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedActivity(null);
  };

  // Fetch data
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

  if (loading) {
    return <LoadingSpinner fullScreen />;
  }

  return (
    <div className="admin-page">
      <style>{pageStyles}</style>
      <Navbar />
      <div className="admin-content">
        <Sidebar />
        <main className="admin-main">
          {/* Header */}
          <div className="page-header">
            <div className="page-header-left">
              <div className="page-greeting">
                <div className="page-greeting-icon">
                  <Sparkles size={18} />
                </div>
                <h1>{getGreeting()}, {user?.name?.split(' ')[0] || 'Admin'}</h1>
              </div>
              <p className="page-date">{formatDate()}</p>
            </div>

            <div className="quick-actions">
              <Link to="/admin/doctors" className="quick-action-btn primary">
                <span className="quick-action-icon">
                  <Stethoscope size={18} />
                </span>
                Manage Clients
                <ChevronRight size={16} />
              </Link>
              <Link to="/admin/employees" className="quick-action-btn">
                <span className="quick-action-icon">
                  <Users size={18} />
                </span>
                BDMs
              </Link>
              <Link to="/admin/reports" className="quick-action-btn">
                <span className="quick-action-icon">
                  <FileText size={18} />
                </span>
                Reports
              </Link>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="error-banner">
              {error}
            </div>
          )}

          {/* Dashboard */}
          <Dashboard
            stats={stats}
            onViewAllActivity={handleViewAllActivity}
            onActivityClick={handleActivityClick}
          />
        </main>
      </div>

      {/* Modal */}
      <ActivityDetailModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        activity={selectedActivity}
      />
    </div>
  );
};

export default AdminDashboard;