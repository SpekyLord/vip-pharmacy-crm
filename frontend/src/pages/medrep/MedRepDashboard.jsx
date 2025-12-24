/**
 * MedRepDashboard Page
 *
 * Med Rep dashboard with:
 * - Product assignments overview
 * - Target progress
 * - Doctor-product mappings
 * - Performance metrics
 */

import { useState, useEffect } from 'react';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import ProductAssignment from '../../components/medrep/ProductAssignment';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import { useAuth } from '../../hooks/useAuth';

const MedRepDashboard = () => {
  const { user } = useAuth();
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    activeAssignments: 0,
    completedTargets: 0,
    pendingTargets: 0,
  });

  useEffect(() => {
    // TODO: Fetch med rep dashboard data
    setLoading(false);
  }, []);

  const handleViewDetails = (assignment) => {
    // TODO: Show assignment details modal
    console.log('View assignment details:', assignment);
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

          <div className="stats-row">
            <div className="stat-card">
              <span className="stat-value">{stats.activeAssignments}</span>
              <span className="stat-label">Active Assignments</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">{stats.completedTargets}</span>
              <span className="stat-label">Completed Targets</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">{stats.pendingTargets}</span>
              <span className="stat-label">Pending Targets</span>
            </div>
          </div>

          <section className="dashboard-section">
            <ProductAssignment
              assignments={assignments}
              onViewDetails={handleViewDetails}
            />
          </section>
        </main>
      </div>
    </div>
  );
};

export default MedRepDashboard;
