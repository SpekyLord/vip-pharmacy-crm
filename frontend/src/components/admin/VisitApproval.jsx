/**
 * VisitApproval Component
 *
 * Admin component for approving visits:
 * - List of pending visits
 * - Visit details view
 * - Approve/reject functionality
 * - Bulk actions
 */

import { useState } from 'react';

const VisitApproval = ({ visits = [], onApprove, onReject, loading = false }) => {
  const [selectedVisit, setSelectedVisit] = useState(null);

  const pendingVisits = visits.filter((visit) => visit.status === 'pending');

  const handleViewDetails = (visit) => {
    setSelectedVisit(visit);
  };

  const handleCloseDetails = () => {
    setSelectedVisit(null);
  };

  return (
    <div className="visit-approval">
      <h2>Visit Approval</h2>
      <p className="pending-count">{pendingVisits.length} visits pending approval</p>

      {selectedVisit ? (
        <div className="visit-details">
          <h3>Visit Details</h3>
          <div className="detail-row">
            <strong>Employee:</strong> {selectedVisit.user?.name}
          </div>
          <div className="detail-row">
            <strong>Doctor:</strong> {selectedVisit.doctor?.name}
          </div>
          <div className="detail-row">
            <strong>Date:</strong> {new Date(selectedVisit.visitDate).toLocaleDateString()}
          </div>
          <div className="detail-row">
            <strong>Purpose:</strong> {selectedVisit.purpose}
          </div>
          <div className="detail-row">
            <strong>Notes:</strong> {selectedVisit.notes}
          </div>

          <div className="approval-actions">
            <button
              onClick={() => onApprove?.(selectedVisit._id)}
              disabled={loading}
              className="btn btn-success"
            >
              Approve
            </button>
            <button
              onClick={() => onReject?.(selectedVisit._id)}
              disabled={loading}
              className="btn btn-danger"
            >
              Reject
            </button>
            <button onClick={handleCloseDetails} className="btn btn-secondary">
              Close
            </button>
          </div>
        </div>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Employee</th>
              <th>Doctor</th>
              <th>Purpose</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {pendingVisits.map((visit) => (
              <tr key={visit._id}>
                <td>{new Date(visit.visitDate).toLocaleDateString()}</td>
                <td>{visit.user?.name}</td>
                <td>{visit.doctor?.name}</td>
                <td>{visit.purpose}</td>
                <td>
                  <button onClick={() => handleViewDetails(visit)}>View</button>
                  <button onClick={() => onApprove?.(visit._id)} disabled={loading}>
                    Approve
                  </button>
                  <button onClick={() => onReject?.(visit._id)} disabled={loading}>
                    Reject
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {pendingVisits.length === 0 && !selectedVisit && (
        <p className="no-pending">No visits pending approval</p>
      )}
    </div>
  );
};

export default VisitApproval;
