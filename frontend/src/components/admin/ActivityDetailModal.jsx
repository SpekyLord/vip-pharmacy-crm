/**
 * ActivityDetailModal Component
 *
 * Modal/Popup for displaying detailed activity information (Task 2.6)
 * Shows different fields based on activity type:
 * - VISIT: Doctor Name, Location, Notes, Photo attachments
 * - AUTH: IP Address, Device Type, Browser
 * - DOCTOR_UPDATE: Field Changed (From -> To)
 * - PRODUCT_ASSIGN: SKU, Quantity, Approval Status
 *
 * @prop {boolean} isOpen - Controls modal visibility
 * @prop {function} onClose - Callback to close modal
 * @prop {object} activity - The selected activity data
 */

import {
  X,
  MapPin,
  LogIn,
  LogOut,
  UserCog,
  Package,
  User,
  Clock,
  Globe,
  Monitor,
  Smartphone,
  FileText,
  Camera,
  CheckCircle,
  AlertCircle,
  ArrowRight,
  Stethoscope,
  Building,
  Hash,
  Box,
} from 'lucide-react';

/* =============================================================================
   STYLES
   ============================================================================= */

const modalStyles = `
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: 20px;
    animation: fadeIn 0.2s ease-out;
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .modal-container {
    background: white;
    border-radius: 16px;
    width: 100%;
    max-width: 520px;
    max-height: 90vh;
    overflow: hidden;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
    animation: slideUp 0.3s ease-out;
  }

  @keyframes slideUp {
    from {
      opacity: 0;
      transform: translateY(20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 20px 24px;
    border-bottom: 1px solid #e5e7eb;
  }

  .modal-header-left {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .modal-type-icon {
    width: 44px;
    height: 44px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .modal-type-icon.visit { background: #dbeafe; color: #2563eb; }
  .modal-type-icon.auth { background: #dcfce7; color: #16a34a; }
  .modal-type-icon.doctor { background: #f3e8ff; color: #9333ea; }
  .modal-type-icon.product { background: #fef3c7; color: #d97706; }

  .modal-title {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
    color: #1f2937;
  }

  .modal-subtitle {
    margin: 4px 0 0;
    font-size: 13px;
    color: #6b7280;
  }

  .close-btn {
    width: 36px;
    height: 36px;
    border-radius: 8px;
    border: none;
    background: #f3f4f6;
    color: #6b7280;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
  }

  .close-btn:hover {
    background: #e5e7eb;
    color: #374151;
  }

  .modal-body {
    padding: 24px;
    overflow-y: auto;
    max-height: calc(90vh - 160px);
  }

  .detail-section {
    margin-bottom: 20px;
  }

  .detail-section:last-child {
    margin-bottom: 0;
  }

  .section-label {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #9ca3af;
    margin-bottom: 8px;
  }

  .detail-card {
    background: #f9fafb;
    border-radius: 10px;
    padding: 14px 16px;
  }

  .detail-row {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 10px 0;
    border-bottom: 1px solid #e5e7eb;
  }

  .detail-row:first-child {
    padding-top: 0;
  }

  .detail-row:last-child {
    padding-bottom: 0;
    border-bottom: none;
  }

  .detail-icon {
    width: 32px;
    height: 32px;
    border-radius: 8px;
    background: white;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #6b7280;
    flex-shrink: 0;
  }

  .detail-content {
    flex: 1;
    min-width: 0;
  }

  .detail-label {
    font-size: 12px;
    color: #6b7280;
    margin-bottom: 2px;
  }

  .detail-value {
    font-size: 14px;
    font-weight: 500;
    color: #1f2937;
    word-break: break-word;
  }

  .detail-value.small {
    font-size: 13px;
    font-weight: 400;
  }

  /* Change indicator (for updates) */
  .change-indicator {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px;
    background: white;
    border-radius: 8px;
    margin-top: 8px;
  }

  .change-value {
    flex: 1;
    padding: 8px 12px;
    border-radius: 6px;
    font-size: 13px;
  }

  .change-value.from {
    background: #fef2f2;
    color: #dc2626;
    text-decoration: line-through;
  }

  .change-value.to {
    background: #f0fdf4;
    color: #16a34a;
  }

  .change-arrow {
    color: #9ca3af;
  }

  /* Status badge */
  .status-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border-radius: 20px;
    font-size: 13px;
    font-weight: 500;
  }

  .status-badge.approved {
    background: #dcfce7;
    color: #16a34a;
  }

  .status-badge.pending {
    background: #fef3c7;
    color: #d97706;
  }

  .status-badge.rejected {
    background: #fee2e2;
    color: #dc2626;
  }

  /* Photo attachments */
  .photo-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
    margin-top: 8px;
  }

  .photo-placeholder {
    aspect-ratio: 1;
    background: #e5e7eb;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #9ca3af;
  }

  /* Timestamp footer */
  .modal-footer {
    padding: 16px 24px;
    background: #f9fafb;
    border-top: 1px solid #e5e7eb;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .timestamp-info {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: #6b7280;
  }

  .timestamp-info svg {
    color: #9ca3af;
  }

  .action-btn {
    padding: 8px 16px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }

  .action-btn.primary {
    background: #2563eb;
    color: white;
    border: none;
  }

  .action-btn.primary:hover {
    background: #1d4ed8;
  }
`;

/* =============================================================================
   HELPER: Get type-specific config
   ============================================================================= */

const getTypeConfig = (type) => {
  const configs = {
    VISIT_LOG: {
      icon: MapPin,
      colorClass: 'visit',
      title: 'Visit Activity',
    },
    AUTH: {
      icon: User,
      colorClass: 'auth',
      title: 'Authentication',
    },
    DOCTOR_UPDATE: {
      icon: Stethoscope,
      colorClass: 'doctor',
      title: 'VIP Client Update',
    },
    PRODUCT_ASSIGN: {
      icon: Box,
      colorClass: 'product',
      title: 'Product Assignment',
    },
  };
  return configs[type] || configs.AUTH;
};

/* =============================================================================
   COMPONENT: ActivityDetailModal
   ============================================================================= */

const ActivityDetailModal = ({ isOpen, onClose, activity }) => {
  if (!isOpen || !activity) return null;

  const config = getTypeConfig(activity.type);
  const IconComponent = config.icon;

  // Format timestamp
  const formatDate = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  // Handle backdrop click
  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div className="modal-backdrop" onClick={handleBackdropClick}>
      <style>{modalStyles}</style>
      <div className="modal-container">
        {/* Header */}
        <div className="modal-header">
          <div className="modal-header-left">
            <div className={`modal-type-icon ${config.colorClass}`}>
              <IconComponent size={22} />
            </div>
            <div>
              <h2 className="modal-title">{config.title}</h2>
              <p className="modal-subtitle">{activity.employeeName}</p>
            </div>
          </div>
          <button className="close-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Body - Dynamic content based on type */}
        <div className="modal-body">
          {/* Common: Activity Message */}
          <div className="detail-section">
            <div className="section-label">Activity</div>
            <div className="detail-card">
              <div className="detail-row">
                <div className="detail-icon">
                  <FileText size={16} />
                </div>
                <div className="detail-content">
                  <div className="detail-label">Description</div>
                  <div className="detail-value">{activity.message}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Type-specific details */}
          {activity.type === 'VISIT_LOG' && (
            <VisitDetails details={activity.details} />
          )}

          {activity.type === 'AUTH' && (
            <AuthDetails details={activity.details} subType={activity.subType} />
          )}

          {activity.type === 'DOCTOR_UPDATE' && (
            <DoctorUpdateDetails details={activity.details} />
          )}

          {activity.type === 'PRODUCT_ASSIGN' && (
            <ProductAssignDetails details={activity.details} />
          )}
        </div>

        {/* Footer */}
        <div className="modal-footer">
          <div className="timestamp-info">
            <Clock size={14} />
            {formatDate(activity.timestamp)}
          </div>
          <button className="action-btn primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

/* =============================================================================
   SUB-COMPONENTS: Type-specific detail views
   ============================================================================= */

const VisitDetails = ({ details }) => {
  if (!details) return null;

  return (
    <>
      <div className="detail-section">
        <div className="section-label">Visit Information</div>
        <div className="detail-card">
          <div className="detail-row">
            <div className="detail-icon">
              <Stethoscope size={16} />
            </div>
            <div className="detail-content">
              <div className="detail-label">VIP Client</div>
              <div className="detail-value">{details.doctorName || 'N/A'}</div>
            </div>
          </div>

          <div className="detail-row">
            <div className="detail-icon">
              <Building size={16} />
            </div>
            <div className="detail-content">
              <div className="detail-label">Clinic / Hospital</div>
              <div className="detail-value">{details.clinicName || 'N/A'}</div>
            </div>
          </div>

          <div className="detail-row">
            <div className="detail-icon">
              <MapPin size={16} />
            </div>
            <div className="detail-content">
              <div className="detail-label">Location</div>
              <div className="detail-value small">{details.address || 'N/A'}</div>
              {details.coordinates && (
                <div className="detail-value small" style={{ color: '#6b7280', marginTop: 4 }}>
                  📍 {details.coordinates.lat}, {details.coordinates.lng}
                </div>
              )}
            </div>
          </div>

          {details.notes && (
            <div className="detail-row">
              <div className="detail-icon">
                <FileText size={16} />
              </div>
              <div className="detail-content">
                <div className="detail-label">Visit Notes</div>
                <div className="detail-value small">{details.notes}</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Photo Attachments */}
      {details.photos && details.photos.length > 0 && (
        <div className="detail-section">
          <div className="section-label">Photo Attachments ({details.photos.length})</div>
          <div className="photo-grid">
            {details.photos.map((photo, idx) => (
              <div key={idx} className="photo-placeholder">
                <Camera size={20} />
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
};

const AuthDetails = ({ details, subType }) => {
  if (!details) return null;

  const isLogin = subType === 'LOGIN';

  return (
    <div className="detail-section">
      <div className="section-label">Session Information</div>
      <div className="detail-card">
        <div className="detail-row">
          <div className="detail-icon">
            {isLogin ? <LogIn size={16} /> : <LogOut size={16} />}
          </div>
          <div className="detail-content">
            <div className="detail-label">Action</div>
            <div className="detail-value">{isLogin ? 'User Logged In' : 'User Logged Out'}</div>
          </div>
        </div>

        <div className="detail-row">
          <div className="detail-icon">
            <Globe size={16} />
          </div>
          <div className="detail-content">
            <div className="detail-label">IP Address</div>
            <div className="detail-value">{details.ipAddress || 'N/A'}</div>
          </div>
        </div>

        <div className="detail-row">
          <div className="detail-icon">
            {details.deviceType === 'Mobile' ? <Smartphone size={16} /> : <Monitor size={16} />}
          </div>
          <div className="detail-content">
            <div className="detail-label">Device</div>
            <div className="detail-value">{details.device || 'N/A'}</div>
          </div>
        </div>

        <div className="detail-row">
          <div className="detail-icon">
            <Monitor size={16} />
          </div>
          <div className="detail-content">
            <div className="detail-label">Browser</div>
            <div className="detail-value">{details.browser || 'N/A'}</div>
          </div>
        </div>

        {details.sessionDuration && (
          <div className="detail-row">
            <div className="detail-icon">
              <Clock size={16} />
            </div>
            <div className="detail-content">
              <div className="detail-label">Session Duration</div>
              <div className="detail-value">{details.sessionDuration}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const DoctorUpdateDetails = ({ details }) => {
  if (!details) return null;

  return (
    <div className="detail-section">
      <div className="section-label">Change Details</div>
      <div className="detail-card">
        <div className="detail-row">
          <div className="detail-icon">
            <Stethoscope size={16} />
          </div>
          <div className="detail-content">
            <div className="detail-label">VIP Client</div>
            <div className="detail-value">{details.doctorName || 'N/A'}</div>
          </div>
        </div>

        <div className="detail-row">
          <div className="detail-icon">
            <UserCog size={16} />
          </div>
          <div className="detail-content">
            <div className="detail-label">Action</div>
            <div className="detail-value" style={{ textTransform: 'capitalize' }}>
              {details.action || 'Update'}
            </div>
          </div>
        </div>

        {details.fieldsChanged && details.fieldsChanged.length > 0 && (
          <div className="detail-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
            <div className="detail-label" style={{ marginBottom: 8 }}>Fields Changed</div>
            {details.fieldsChanged.map((field, idx) => (
              <div key={idx} className="change-indicator">
                <div className="change-value from">{field.from || '(empty)'}</div>
                <ArrowRight size={16} className="change-arrow" />
                <div className="change-value to">{field.to}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const ProductAssignDetails = ({ details }) => {
  if (!details) return null;

  const getStatusBadge = (status) => {
    const statusConfig = {
      approved: { class: 'approved', icon: CheckCircle, text: 'Approved' },
      pending: { class: 'pending', icon: Clock, text: 'Pending' },
      rejected: { class: 'rejected', icon: AlertCircle, text: 'Rejected' },
    };
    const config = statusConfig[status] || statusConfig.pending;
    const Icon = config.icon;

    return (
      <span className={`status-badge ${config.class}`}>
        <Icon size={14} />
        {config.text}
      </span>
    );
  };

  return (
    <div className="detail-section">
      <div className="section-label">Assignment Details</div>
      <div className="detail-card">
        <div className="detail-row">
          <div className="detail-icon">
            <Package size={16} />
          </div>
          <div className="detail-content">
            <div className="detail-label">Product</div>
            <div className="detail-value">{details.productName || 'N/A'}</div>
          </div>
        </div>

        {details.sku && (
          <div className="detail-row">
            <div className="detail-icon">
              <Hash size={16} />
            </div>
            <div className="detail-content">
              <div className="detail-label">SKU</div>
              <div className="detail-value">{details.sku}</div>
            </div>
          </div>
        )}

        {details.quantity && (
          <div className="detail-row">
            <div className="detail-icon">
              <Box size={16} />
            </div>
            <div className="detail-content">
              <div className="detail-label">Quantity</div>
              <div className="detail-value">{details.quantity} units</div>
            </div>
          </div>
        )}

        <div className="detail-row">
          <div className="detail-icon">
            <Stethoscope size={16} />
          </div>
          <div className="detail-content">
            <div className="detail-label">Assigned To</div>
            <div className="detail-value">{details.doctorName || 'N/A'}</div>
          </div>
        </div>

        {details.approvalStatus && (
          <div className="detail-row">
            <div className="detail-icon">
              <CheckCircle size={16} />
            </div>
            <div className="detail-content">
              <div className="detail-label">Approval Status</div>
              <div className="detail-value">
                {getStatusBadge(details.approvalStatus)}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ActivityDetailModal;