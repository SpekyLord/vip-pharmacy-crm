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
import ClientList from '../../components/employee/ClientList';
import ClientAddModal from '../../components/employee/ClientAddModal';
import { useAuth } from '../../hooks/useAuth';
import doctorService from '../../services/doctorService';
import visitService from '../../services/visitService';
import clientService from '../../services/clientService';
import scheduleService from '../../services/scheduleService';

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

  /* Today's Schedule Section */
  .today-sched-section {
    background: white;
    padding: 20px;
    border-radius: 12px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    border: 1px solid #e5e7eb;
    margin-bottom: 24px;
  }

  .today-sched-section h2 {
    margin: 0 0 16px 0;
    font-size: 18px;
    font-weight: 600;
    color: #1f2937;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .today-sched-section h2 .sched-badge {
    background: #2563eb;
    color: white;
    font-size: 11px;
    padding: 2px 8px;
    border-radius: 10px;
    font-weight: 600;
  }

  .today-sched-cards {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 12px;
  }

  .today-sched-card {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 16px;
    border-radius: 10px;
    border: 1px solid #e5e7eb;
    background: #f8fafc;
    transition: border-color 0.15s;
  }

  .today-sched-card:hover {
    border-color: #3b82f6;
  }

  .today-sched-card .sched-info h4 {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    color: #1f2937;
  }

  .today-sched-card .sched-info p {
    margin: 2px 0 0 0;
    font-size: 12px;
    color: #6b7280;
  }

  .today-sched-card .sched-info .carried-tag {
    display: inline-block;
    margin-top: 4px;
    font-size: 11px;
    font-weight: 600;
    color: #92400e;
    background: #fef3c7;
    padding: 1px 6px;
    border-radius: 4px;
  }

  .today-sched-card .sched-log-btn {
    padding: 8px 16px;
    background: #2563eb;
    color: white;
    border: none;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
    transition: background 0.15s;
  }

  .today-sched-card .sched-log-btn:hover {
    background: #1d4ed8;
  }

  /* Mobile section tabs */
  .dash-section-tabs {
    display: none;
  }

  .dash-tab-btn {
    flex: 1;
    padding: 10px 8px;
    border: none;
    background: transparent;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 600;
    color: #6b7280;
    cursor: pointer;
    transition: all 0.15s;
    position: relative;
  }

  .dash-tab-btn:hover {
    color: #374151;
    background: #f3f4f6;
  }

  .dash-tab-btn.active {
    background: #2563eb;
    color: white;
  }

  .dash-tab-badge {
    position: absolute;
    top: 4px;
    right: 8px;
    min-width: 18px;
    height: 18px;
    padding: 0 5px;
    background: #ef4444;
    color: white;
    font-size: 10px;
    font-weight: 700;
    border-radius: 9px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .dash-tab-btn.active .dash-tab-badge {
    background: white;
    color: #2563eb;
  }

  .mobile-show-more {
    text-align: center;
    padding: 16px 0 8px;
  }

  .mobile-show-count {
    font-size: 13px;
    color: #6b7280;
    margin: 0 0 8px 0;
  }

  .mobile-show-more-btn {
    padding: 12px 32px;
    background: #f3f4f6;
    border: 1px solid #d1d5db;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 600;
    color: #374151;
    cursor: pointer;
    min-height: 44px;
    transition: all 0.15s;
  }

  .mobile-show-more-btn:hover {
    background: #e5e7eb;
  }

  .today-empty {
    text-align: center;
    padding: 32px 16px;
    color: #9ca3af;
    font-size: 14px;
  }

  @media (max-width: 768px) {
    .stats-row {
      grid-template-columns: repeat(2, 1fr);
    }

    .stat-card .stat-value {
      font-size: 28px;
    }
  }

  @media (max-width: 480px) {
    .main-content {
      padding: 16px !important;
      padding-bottom: 80px !important;
    }

    .main-content h1 {
      font-size: 22px;
      margin-bottom: 16px;
    }

    .stats-row {
      grid-template-columns: repeat(2, 1fr);
      gap: 10px;
      margin-bottom: 16px;
    }

    .stat-card {
      padding: 14px 12px;
    }

    .stat-card .stat-value {
      font-size: 24px;
    }

    .stat-card .stat-label {
      font-size: 12px;
    }

    .dash-section-tabs {
      display: flex;
      gap: 4px;
      margin-bottom: 16px;
      background: white;
      padding: 4px;
      border-radius: 10px;
      border: 1px solid #e5e7eb;
    }

    /* On mobile, hide desktop-only sections (controlled by JS) */
    .desktop-only-section {
      display: none;
    }

    .dashboard-section {
      padding: 16px;
    }

    .dashboard-section h2 {
      font-size: 17px;
      margin-bottom: 14px;
    }

    .today-sched-section {
      padding: 16px;
    }

    .today-sched-cards {
      grid-template-columns: 1fr;
    }

    .today-sched-card .sched-log-btn {
      padding: 10px 14px;
      min-height: 44px;
    }

    .compliance-bar {
      padding: 16px;
    }
  }
`;

const MOBILE_PAGE_SIZE = 10;

const EmployeeDashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [doctors, setDoctors] = useState([]);
  const [clients, setClients] = useState([]);
  const [showAddClient, setShowAddClient] = useState(false);
  const [editClient, setEditClient] = useState(null);
  const [todaySchedule, setTodaySchedule] = useState([]);
  const [dailyClientVisitCount, setDailyClientVisitCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [mobileShowCount, setMobileShowCount] = useState(MOBILE_PAGE_SIZE);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 480);
  const [dashboardTab, setDashboardTab] = useState('vip');
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
        clientService.getAll({ limit: 0 }),
        clientService.getTodayVisitCount(),
        scheduleService.getToday(),
      ]);

      // Extract results with fallbacks for failed requests
      const [doctorsResult, todayResult, statsResult, weeklyResult, clientsResult, clientCountResult, scheduleResult] = results;

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

      // Process regular clients - non-critical, use fallback
      const clientsList = clientsResult.status === 'fulfilled'
        ? (clientsResult.value.data || [])
        : [];
      setClients(clientsList);

      const clientDailyCount = clientCountResult.status === 'fulfilled'
        ? (clientCountResult.value.data?.dailyCount || 0)
        : 0;
      setDailyClientVisitCount(clientDailyCount);

      // Process today's schedule - non-critical, use fallback
      const scheduleData = scheduleResult.status === 'fulfilled'
        ? (scheduleResult.value.data || [])
        : [];
      setTodaySchedule(scheduleData);

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

  // Track mobile viewport for "Show More" pagination
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 480);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Handle doctor selection - navigate to info page
  const handleSelectDoctor = (doctor) => {
    navigate(`/employee/doctor/${doctor._id}`);
  };

  // Handle log visit button click
  const handleLogVisit = (doctor) => {
    navigate(`/employee/visit/new?doctorId=${doctor._id}`);
  };

  // Handle edit doctor - refresh dashboard data after save
  const handleEditDoctor = () => {
    fetchDashboardData();
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
              <span className="stat-label">VIP Clients Visited</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">{stats.totalDoctors}</span>
              <span className="stat-label">Total VIP Clients</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">{dailyClientVisitCount}/30</span>
              <span className="stat-label">Extra Calls Today</span>
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

          {/* Mobile section tabs - only visible on phones */}
          {isMobile && (
            <div className="dash-section-tabs">
              <button
                className={`dash-tab-btn${dashboardTab === 'vip' ? ' active' : ''}`}
                onClick={() => setDashboardTab('vip')}
              >
                VIP Clients
                {doctors.length > 0 && (
                  <span className="dash-tab-badge">{doctors.length}</span>
                )}
              </button>
              <button
                className={`dash-tab-btn${dashboardTab === 'today' ? ' active' : ''}`}
                onClick={() => setDashboardTab('today')}
              >
                Today
                {todaySchedule.length > 0 && (
                  <span className="dash-tab-badge">{todaySchedule.length}</span>
                )}
              </button>
              <button
                className={`dash-tab-btn${dashboardTab === 'regular' ? ' active' : ''}`}
                onClick={() => setDashboardTab('regular')}
              >
                Regular
                {clients.length > 0 && (
                  <span className="dash-tab-badge">{clients.length}</span>
                )}
              </button>
            </div>
          )}

          {/* VIP Clients section */}
          {(!isMobile || dashboardTab === 'vip') && (
            <section className="dashboard-section" style={{ marginBottom: '24px' }}>
              <h2>My VIP Clients</h2>
              <DoctorList
                doctors={isMobile ? doctors.slice(0, mobileShowCount) : doctors}
                loading={loading}
                onSelectDoctor={handleSelectDoctor}
                onLogVisit={handleLogVisit}
                onEditDoctor={handleEditDoctor}
              />
              {isMobile && doctors.length > mobileShowCount && (
                <div className="mobile-show-more">
                  <p className="mobile-show-count">
                    Showing {Math.min(mobileShowCount, doctors.length)} of {doctors.length} VIP Clients
                  </p>
                  <button
                    className="mobile-show-more-btn"
                    onClick={() => setMobileShowCount(prev => prev + MOBILE_PAGE_SIZE)}
                  >
                    Show More
                  </button>
                </div>
              )}
              {isMobile && doctors.length > 0 && mobileShowCount >= doctors.length && doctors.length > MOBILE_PAGE_SIZE && (
                <p className="mobile-show-count" style={{ textAlign: 'center', marginTop: 12 }}>
                  Showing all {doctors.length} VIP Clients
                </p>
              )}
            </section>
          )}

          {/* Today's Schedule section */}
          {(!isMobile || dashboardTab === 'today') && (
            <div className="today-sched-section">
              <h2>
                Today&apos;s Schedule
                <span className="sched-badge">{todaySchedule.length}</span>
              </h2>
              {todaySchedule.length > 0 ? (
                <div className="today-sched-cards">
                  {todaySchedule.map((entry) => (
                    <div key={entry._id} className="today-sched-card">
                      <div className="sched-info">
                        <h4>{entry.doctor?.firstName} {entry.doctor?.lastName}</h4>
                        <p>{entry.doctor?.specialization || 'N/A'} — {entry.scheduledLabel}</p>
                        {entry.status === 'carried' && (
                          <span className="carried-tag">Carried from W{entry.scheduledWeek}</span>
                        )}
                      </div>
                      <button
                        className="sched-log-btn"
                        onClick={() => navigate(`/employee/visit/new?doctorId=${entry.doctor?._id}`)}
                      >
                        Log Visit
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="today-empty">No scheduled visits for today</p>
              )}
            </div>
          )}

          {/* Regular Clients section */}
          {(!isMobile || dashboardTab === 'regular') && (
            <section className="dashboard-section" style={{ marginTop: '24px' }}>
              <h2>Regular Clients (Extra Calls)</h2>
              <ClientList
                clients={clients}
                loading={loading}
                onLogVisit={(client) => navigate(`/employee/regular-visit/new?clientId=${client._id}`)}
                onAddClient={() => setShowAddClient(true)}
                onEditClient={(client) => setEditClient(client)}
                dailyVisitCount={dailyClientVisitCount}
                dailyLimit={30}
              />
            </section>
          )}

          {(showAddClient || editClient) && (
            <ClientAddModal
              client={editClient || null}
              onClose={() => {
                setShowAddClient(false);
                setEditClient(null);
              }}
              onSaved={() => {
                setShowAddClient(false);
                setEditClient(null);
                fetchDashboardData();
              }}
            />
          )}
        </main>
      </div>
    </div>
  );
};

export default EmployeeDashboard;
