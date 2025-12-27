/**
 * ProductAssignment Component
 *
 * Med Rep component for:
 * - Viewing assigned products
 * - Product details and priority
 * - Assignment management (view, edit, deactivate)
 * - Filtering by status
 */

import { useState } from 'react';

const productAssignmentStyles = `
  .product-assignment {
    width: 100%;
  }

  .assignment-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 24px;
  }

  .assignment-header h2 {
    margin: 0;
    font-size: 20px;
    color: #1f2937;
  }

  .filter-controls {
    display: flex;
    gap: 12px;
    align-items: center;
  }

  .filter-controls select {
    padding: 8px 12px;
    border: 1px solid #d1d5db;
    border-radius: 8px;
    font-size: 14px;
    background: white;
  }

  .filter-controls input {
    padding: 8px 12px;
    border: 1px solid #d1d5db;
    border-radius: 8px;
    font-size: 14px;
    width: 200px;
  }

  .assignment-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: 16px;
  }

  .assignment-card {
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 12px;
    padding: 20px;
    transition: box-shadow 0.2s, transform 0.2s;
  }

  .assignment-card:hover {
    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
    transform: translateY(-2px);
  }

  .assignment-card.inactive {
    opacity: 0.6;
    background: #f9fafb;
  }

  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 16px;
  }

  .card-header h3 {
    margin: 0;
    font-size: 16px;
    color: #1f2937;
    flex: 1;
  }

  .status-badge {
    display: inline-block;
    padding: 4px 10px;
    border-radius: 20px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
  }

  .status-badge.status-active {
    background: #dcfce7;
    color: #16a34a;
  }

  .status-badge.status-inactive {
    background: #f3f4f6;
    color: #6b7280;
  }

  .card-details {
    margin-bottom: 16px;
  }

  .detail-row {
    display: flex;
    justify-content: space-between;
    padding: 8px 0;
    border-bottom: 1px solid #f3f4f6;
  }

  .detail-row:last-child {
    border-bottom: none;
  }

  .detail-row .label {
    color: #6b7280;
    font-size: 13px;
  }

  .detail-row .value {
    color: #1f2937;
    font-weight: 500;
    font-size: 13px;
  }

  .priority-badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 12px;
    font-size: 11px;
    font-weight: 600;
  }

  .priority-badge.high {
    background: #fee2e2;
    color: #dc2626;
  }

  .priority-badge.medium {
    background: #fef3c7;
    color: #d97706;
  }

  .priority-badge.low {
    background: #dcfce7;
    color: #16a34a;
  }

  .card-actions {
    display: flex;
    gap: 8px;
    margin-top: 16px;
    padding-top: 16px;
    border-top: 1px solid #e5e7eb;
  }

  .card-actions button {
    flex: 1;
    padding: 8px 12px;
    border: none;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.2s;
  }

  .btn-view {
    background: #e5e7eb;
    color: #374151;
  }

  .btn-view:hover {
    background: #d1d5db;
  }

  .btn-edit {
    background: #dbeafe;
    color: #2563eb;
  }

  .btn-edit:hover {
    background: #bfdbfe;
  }

  .btn-deactivate {
    background: #fee2e2;
    color: #dc2626;
  }

  .btn-deactivate:hover {
    background: #fecaca;
  }

  .no-assignments {
    text-align: center;
    padding: 48px 24px;
    color: #6b7280;
  }

  .no-assignments-icon {
    font-size: 48px;
    margin-bottom: 16px;
  }

  .no-assignments h3 {
    margin: 0 0 8px;
    color: #374151;
  }

  .no-assignments p {
    margin: 0;
  }

  .assignment-count {
    font-size: 14px;
    color: #6b7280;
  }
`;

const ProductAssignment = ({
  assignments = [],
  onViewDetails,
  onEdit,
  onDeactivate
}) => {
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Get priority label
  const getPriorityLabel = (priority) => {
    switch (priority) {
      case 1: return 'high';
      case 2: return 'medium';
      case 3: return 'low';
      default: return 'medium';
    }
  };

  // Filter assignments
  const filteredAssignments = assignments.filter(assignment => {
    // Status filter
    if (statusFilter !== 'all' && assignment.status !== statusFilter) {
      return false;
    }

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const productName = assignment.product?.name?.toLowerCase() || '';
      const doctorName = assignment.doctor?.name?.toLowerCase() || '';
      if (!productName.includes(query) && !doctorName.includes(query)) {
        return false;
      }
    }

    return true;
  });

  return (
    <div className="product-assignment">
      <style>{productAssignmentStyles}</style>

      <div className="assignment-header">
        <div>
          <h2>My Product Assignments</h2>
          <span className="assignment-count">
            {filteredAssignments.length} of {assignments.length} assignments
          </span>
        </div>
        <div className="filter-controls">
          <input
            type="text"
            placeholder="Search product or doctor..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </div>

      {filteredAssignments.length > 0 ? (
        <div className="assignment-grid">
          {filteredAssignments.map((assignment) => (
            <div
              key={assignment._id}
              className={`assignment-card ${assignment.status === 'inactive' ? 'inactive' : ''}`}
            >
              <div className="card-header">
                <h3>{assignment.product?.name || 'Unknown Product'}</h3>
                <span className={`status-badge status-${assignment.status}`}>
                  {assignment.status}
                </span>
              </div>

              <div className="card-details">
                <div className="detail-row">
                  <span className="label">Doctor</span>
                  <span className="value">{assignment.doctor?.name || 'N/A'}</span>
                </div>
                <div className="detail-row">
                  <span className="label">Specialization</span>
                  <span className="value">{assignment.doctor?.specialization || 'N/A'}</span>
                </div>
                <div className="detail-row">
                  <span className="label">Priority</span>
                  <span className="value">
                    <span className={`priority-badge ${getPriorityLabel(assignment.priority)}`}>
                      {getPriorityLabel(assignment.priority).charAt(0).toUpperCase() +
                       getPriorityLabel(assignment.priority).slice(1)}
                    </span>
                  </span>
                </div>
                <div className="detail-row">
                  <span className="label">Assigned</span>
                  <span className="value">
                    {new Date(assignment.assignedDate || assignment.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>

              <div className="card-actions">
                <button
                  className="btn-view"
                  onClick={() => onViewDetails?.(assignment)}
                >
                  View
                </button>
                {assignment.status === 'active' && (
                  <>
                    <button
                      className="btn-edit"
                      onClick={() => onEdit?.(assignment)}
                    >
                      Edit
                    </button>
                    <button
                      className="btn-deactivate"
                      onClick={() => onDeactivate?.(assignment)}
                    >
                      Deactivate
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="no-assignments">
          <div className="no-assignments-icon">📦</div>
          <h3>No Assignments Found</h3>
          <p>
            {searchQuery || statusFilter !== 'all'
              ? 'Try adjusting your filters'
              : 'Go to Doctor-Product Mapping to create assignments'}
          </p>
        </div>
      )}
    </div>
  );
};

export default ProductAssignment;
