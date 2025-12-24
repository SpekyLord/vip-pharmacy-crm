/**
 * MyVisits Page
 *
 * Employee's visit history with:
 * - Visit list with filters
 * - Visit details modal
 * - Log new visit button
 * - Export functionality
 */

import { useState, useEffect } from 'react';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import VisitLogger from '../../components/employee/VisitLogger';
import LoadingSpinner from '../../components/common/LoadingSpinner';

const MyVisits = () => {
  const [visits, setVisits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showLogger, setShowLogger] = useState(false);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    // TODO: Fetch visits data
    setLoading(false);
  }, []);

  const filteredVisits = visits.filter((visit) => {
    if (filter === 'all') return true;
    return visit.status === filter;
  });

  if (loading) {
    return <LoadingSpinner fullScreen />;
  }

  return (
    <div className="dashboard-layout">
      <Navbar />
      <div className="dashboard-content">
        <Sidebar />
        <main className="main-content">
          <div className="page-header">
            <h1>My Visits</h1>
            <button
              onClick={() => setShowLogger(true)}
              className="btn btn-primary"
            >
              + Log New Visit
            </button>
          </div>

          <div className="filters">
            <select value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="all">All Visits</option>
              <option value="completed">Completed</option>
              <option value="pending">Pending</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          {showLogger && (
            <div className="modal-overlay">
              <div className="modal-content">
                <VisitLogger
                  onSubmit={(data) => {
                    console.log('Visit logged:', data);
                    setShowLogger(false);
                  }}
                />
                <button
                  onClick={() => setShowLogger(false)}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          <div className="visits-list">
            {filteredVisits.length > 0 ? (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Doctor</th>
                    <th>Purpose</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredVisits.map((visit) => (
                    <tr key={visit._id}>
                      <td>{new Date(visit.visitDate).toLocaleDateString()}</td>
                      <td>{visit.doctor?.name}</td>
                      <td>{visit.purpose}</td>
                      <td>
                        <span className={`status-badge status-${visit.status}`}>
                          {visit.status}
                        </span>
                      </td>
                      <td>
                        <button className="btn-link">View</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="no-data">No visits found</p>
            )}
          </div>
        </main>
      </div>
    </div>
  );
};

export default MyVisits;
