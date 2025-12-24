/**
 * ProductAssignment Component
 *
 * Med Rep component for:
 * - Viewing assigned products
 * - Product details and materials
 * - Target tracking
 * - Assignment history
 */

const ProductAssignment = ({ assignments = [], onViewDetails }) => {
  return (
    <div className="product-assignment">
      <h2>My Product Assignments</h2>

      <div className="assignment-grid">
        {assignments.map((assignment) => (
          <div key={assignment._id} className="assignment-card">
            <div className="assignment-header">
              <h3>{assignment.product?.name}</h3>
              <span className={`status-badge status-${assignment.status}`}>
                {assignment.status}
              </span>
            </div>

            <div className="assignment-details">
              <div className="detail-row">
                <span className="label">Target:</span>
                <span className="value">{assignment.targetQuantity} units</span>
              </div>
              <div className="detail-row">
                <span className="label">Achieved:</span>
                <span className="value">{assignment.actualQuantity || 0} units</span>
              </div>
              <div className="detail-row">
                <span className="label">Progress:</span>
                <div className="progress-bar">
                  <div
                    className="progress-fill"
                    style={{
                      width: `${Math.min(
                        ((assignment.actualQuantity || 0) / assignment.targetQuantity) * 100,
                        100
                      )}%`,
                    }}
                  />
                </div>
              </div>
            </div>

            <button
              onClick={() => onViewDetails?.(assignment)}
              className="btn btn-secondary"
            >
              View Details
            </button>
          </div>
        ))}
      </div>

      {assignments.length === 0 && (
        <p className="no-assignments">No product assignments found</p>
      )}
    </div>
  );
};

export default ProductAssignment;
