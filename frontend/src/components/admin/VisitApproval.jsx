/**
 * VisitApproval Component
 *
 * Detail view for reviewing a pending visit (Task 2.8)
 * Shows visit information, map location, photo proofs, and approval actions.
 *
 * Features:
 * - Interactive map with GPS marker (react-leaflet)
 * - Photo proof gallery
 * - Products discussed list
 * - Approve/Reject actions with rejection reason dialog
 *
 * @prop {object} visit - The visit data to display
 * @prop {boolean} isOpen - Controls modal visibility
 * @prop {function} onClose - Callback to close modal
 * @prop {function} onApprove - Callback when visit is approved
 * @prop {function} onReject - Callback when visit is rejected (receives reason)
 */

import { useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  X,
  MapPin,
  User,
  Stethoscope,
  Calendar,
  Clock,
  Package,
  Image,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Navigation,
  Building,
} from 'lucide-react';

/* =============================================================================
   FIX: Leaflet Default Marker Icon Issue
   Creates a custom DivIcon since default markers don't load properly in React
   ============================================================================= */

const customMarkerIcon = new L.DivIcon({
  className: 'custom-map-marker',
  html: `
    <div style="
      width: 32px;
      height: 32px;
      background: linear-gradient(135deg, #22c55e, #16a34a);
      border-radius: 50% 50% 50% 0;
      transform: rotate(-45deg);
      border: 3px solid white;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      display: flex;
      align-items: center;
      justify-content: center;
    ">
      <div style="
        transform: rotate(45deg);
        color: white;
        font-size: 14px;
      ">📍</div>
    </div>
  `,
  iconSize: [32, 32],
  iconAnchor: [16, 32],
  popupAnchor: [0, -32],
});

/* =============================================================================
   STYLES
   ============================================================================= */

const modalStyles = `
  .visit-approval-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
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

  .visit-approval-modal {
    background: white;
    border-radius: 16px;
    width: 100%;
    max-width: 900px;
    max-height: 90vh;
    overflow: hidden;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
    animation: slideUp 0.3s ease-out;
    display: flex;
    flex-direction: column;
  }

  @keyframes slideUp {
    from { opacity: 0; transform: translateY(20px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .visit-approval-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 20px 24px;
    border-bottom: 1px solid #e5e7eb;
    background: linear-gradient(135deg, #f0fdf4, #dcfce7);
  }

  .visit-approval-header h2 {
    margin: 0;
    font-size: 20px;
    font-weight: 600;
    color: #1f2937;
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .visit-approval-header .status-badge {
    padding: 4px 12px;
    background: #fef3c7;
    color: #b45309;
    font-size: 12px;
    font-weight: 600;
    border-radius: 20px;
  }

  .close-btn {
    width: 36px;
    height: 36px;
    border-radius: 8px;
    border: none;
    background: white;
    color: #6b7280;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
  }

  .close-btn:hover {
    background: #f3f4f6;
    color: #374151;
  }

  .visit-approval-body {
    padding: 24px;
    overflow-y: auto;
    flex: 1;
  }

  .info-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 16px;
    margin-bottom: 24px;
  }

  .info-card {
    background: #f9fafb;
    border-radius: 12px;
    padding: 16px;
    display: flex;
    align-items: flex-start;
    gap: 12px;
  }

  .info-card.full-width {
    grid-column: span 2;
  }

  .info-icon {
    width: 40px;
    height: 40px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .info-icon.blue { background: #dbeafe; color: #2563eb; }
  .info-icon.green { background: #dcfce7; color: #16a34a; }
  .info-icon.purple { background: #f3e8ff; color: #9333ea; }
  .info-icon.amber { background: #fef3c7; color: #d97706; }

  .info-content {
    flex: 1;
    min-width: 0;
  }

  .info-label {
    font-size: 12px;
    color: #6b7280;
    margin-bottom: 4px;
  }

  .info-value {
    font-size: 15px;
    font-weight: 500;
    color: #1f2937;
  }

  /* Map Section */
  .section-title {
    font-size: 16px;
    font-weight: 600;
    color: #1f2937;
    margin-bottom: 12px;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .map-container {
    height: 250px;
    border-radius: 12px;
    overflow: hidden;
    border: 1px solid #e5e7eb;
    margin-bottom: 24px;
  }

  .map-container .leaflet-container {
    height: 100%;
    width: 100%;
    border-radius: 12px;
  }

  .gps-coords {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 8px;
    font-size: 13px;
    color: #6b7280;
  }

  /* Photo Proofs */
  .photo-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
    margin-bottom: 24px;
  }

  .photo-item {
    aspect-ratio: 1;
    background: #f3f4f6;
    border-radius: 12px;
    overflow: hidden;
    border: 1px solid #e5e7eb;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.2s;
  }

  .photo-item:hover {
    transform: scale(1.02);
    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
  }

  .photo-item img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .photo-placeholder {
    color: #9ca3af;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    font-size: 12px;
  }

  /* Products List */
  .products-list {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 24px;
  }

  .product-tag {
    padding: 6px 12px;
    background: #ede9fe;
    color: #7c3aed;
    border-radius: 20px;
    font-size: 13px;
    font-weight: 500;
  }

  /* Actions Footer */
  .visit-approval-footer {
    padding: 20px 24px;
    border-top: 1px solid #e5e7eb;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 12px;
    background: #f9fafb;
  }

  .action-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 24px;
    border-radius: 10px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    border: none;
  }

  .action-btn.approve {
    background: linear-gradient(135deg, #22c55e, #16a34a);
    color: white;
  }

  .action-btn.approve:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(34, 197, 94, 0.4);
  }

  .action-btn.reject {
    background: white;
    color: #dc2626;
    border: 2px solid #fecaca;
  }

  .action-btn.reject:hover {
    background: #fef2f2;
    border-color: #dc2626;
  }

  /* Rejection Dialog */
  .rejection-dialog-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1100;
  }

  .rejection-dialog {
    background: white;
    border-radius: 16px;
    padding: 24px;
    width: 100%;
    max-width: 440px;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
  }

  .rejection-dialog h3 {
    margin: 0 0 8px 0;
    font-size: 18px;
    color: #1f2937;
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .rejection-dialog p {
    margin: 0 0 16px 0;
    font-size: 14px;
    color: #6b7280;
  }

  .rejection-dialog textarea {
    width: 100%;
    min-height: 100px;
    padding: 12px;
    border: 1px solid #e5e7eb;
    border-radius: 10px;
    font-size: 14px;
    resize: vertical;
    margin-bottom: 16px;
    font-family: inherit;
  }

  .rejection-dialog textarea:focus {
    outline: none;
    border-color: #dc2626;
    box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.1);
  }

  .rejection-dialog-actions {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
  }

  .dialog-btn {
    padding: 10px 20px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }

  .dialog-btn.cancel {
    background: #f3f4f6;
    color: #374151;
    border: none;
  }

  .dialog-btn.cancel:hover {
    background: #e5e7eb;
  }

  .dialog-btn.confirm {
    background: #dc2626;
    color: white;
    border: none;
  }

  .dialog-btn.confirm:hover {
    background: #b91c1c;
  }

  .dialog-btn.confirm:disabled {
    background: #fca5a5;
    cursor: not-allowed;
  }

  @media (max-width: 768px) {
    .info-grid {
      grid-template-columns: 1fr;
    }
    .info-card.full-width {
      grid-column: span 1;
    }
    .photo-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }
`;

/* =============================================================================
   COMPONENT: VisitApproval
   ============================================================================= */

const VisitApproval = ({ visit, isOpen, onClose, onApprove, onReject }) => {
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  if (!isOpen || !visit) return null;

  // Format date/time
  const formatDateTime = (isoString) => {
    const date = new Date(isoString);
    return {
      date: date.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }),
      time: date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      }),
    };
  };

  const { date, time } = formatDateTime(visit.dateTime);

  // Handle backdrop click
  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  // Handle approve
  const handleApprove = () => {
    console.log('✅ Approving visit:', visit.id);
    if (onApprove) onApprove(visit);
    onClose();
  };

  // Handle reject button click
  const handleRejectClick = () => {
    setShowRejectDialog(true);
  };

  // Handle reject confirm
  const handleRejectConfirm = () => {
    console.log('❌ Rejecting visit:', visit.id, 'Reason:', rejectReason);
    if (onReject) onReject(visit, rejectReason);
    setShowRejectDialog(false);
    setRejectReason('');
    onClose();
  };

  // Handle reject cancel
  const handleRejectCancel = () => {
    setShowRejectDialog(false);
    setRejectReason('');
  };

  return (
    <div className="visit-approval-backdrop" onClick={handleBackdropClick}>
      <style>{modalStyles}</style>
      <div className="visit-approval-modal">
        {/* Header */}
        <div className="visit-approval-header">
          <h2>
            <CheckCircle size={24} className="text-green-500" />
            Visit Review
            <span className="status-badge">Pending Approval</span>
          </h2>
          <button className="close-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="visit-approval-body">
          {/* Info Grid */}
          <div className="info-grid">
            <div className="info-card">
              <div className="info-icon blue">
                <User size={20} />
              </div>
              <div className="info-content">
                <div className="info-label">Employee</div>
                <div className="info-value">{visit.employeeName}</div>
              </div>
            </div>

            <div className="info-card">
              <div className="info-icon green">
                <Stethoscope size={20} />
              </div>
              <div className="info-content">
                <div className="info-label">Doctor Visited</div>
                <div className="info-value">{visit.doctorVisited}</div>
              </div>
            </div>

            <div className="info-card">
              <div className="info-icon purple">
                <Calendar size={20} />
              </div>
              <div className="info-content">
                <div className="info-label">Date</div>
                <div className="info-value">{date}</div>
              </div>
            </div>

            <div className="info-card">
              <div className="info-icon amber">
                <Clock size={20} />
              </div>
              <div className="info-content">
                <div className="info-label">Time</div>
                <div className="info-value">{time}</div>
              </div>
            </div>

            <div className="info-card full-width">
              <div className="info-icon blue">
                <Building size={20} />
              </div>
              <div className="info-content">
                <div className="info-label">Region</div>
                <div className="info-value">{visit.region}</div>
              </div>
            </div>
          </div>

          {/* Map Section */}
          <div className="section-title">
            <MapPin size={18} className="text-green-500" />
            Visit Location
          </div>
          <div className="map-container">
            <MapContainer
              center={[visit.gpsLocation.lat, visit.gpsLocation.lng]}
              zoom={15}
              scrollWheelZoom={false}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <Marker
                position={[visit.gpsLocation.lat, visit.gpsLocation.lng]}
                icon={customMarkerIcon}
              >
                <Popup>
                  <strong>{visit.doctorVisited}</strong>
                  <br />
                  Visited by {visit.employeeName}
                </Popup>
              </Marker>
            </MapContainer>
          </div>
          <div className="gps-coords">
            <Navigation size={14} />
            GPS: {visit.gpsLocation.lat.toFixed(6)}, {visit.gpsLocation.lng.toFixed(6)}
          </div>

          {/* Photo Proofs */}
          <div className="section-title" style={{ marginTop: 24 }}>
            <Image size={18} className="text-green-500" />
            Photo Proofs ({visit.photoProofs?.length || 0})
          </div>
          <div className="photo-grid">
            {visit.photoProofs && visit.photoProofs.length > 0 ? (
              visit.photoProofs.map((photo, idx) => (
                <div key={idx} className="photo-item">
                  {photo.startsWith('http') ? (
                    <img src={photo} alt={`Proof ${idx + 1}`} />
                  ) : (
                    <div className="photo-placeholder">
                      <Image size={32} />
                      <span>Photo {idx + 1}</span>
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div className="photo-item">
                <div className="photo-placeholder">
                  <Image size={32} />
                  <span>No photos</span>
                </div>
              </div>
            )}
          </div>

          {/* Products Discussed */}
          <div className="section-title">
            <Package size={18} className="text-green-500" />
            Products Discussed
          </div>
          <div className="products-list">
            {visit.productsDiscussed && visit.productsDiscussed.length > 0 ? (
              visit.productsDiscussed.map((product, idx) => (
                <span key={idx} className="product-tag">
                  {product}
                </span>
              ))
            ) : (
              <span className="product-tag" style={{ background: '#f3f4f6', color: '#6b7280' }}>
                No products recorded
              </span>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="visit-approval-footer">
          <button className="action-btn reject" onClick={handleRejectClick}>
            <XCircle size={18} />
            Reject
          </button>
          <button className="action-btn approve" onClick={handleApprove}>
            <CheckCircle size={18} />
            Approve Visit
          </button>
        </div>
      </div>

      {/* Rejection Dialog */}
      {showRejectDialog && (
        <div className="rejection-dialog-backdrop" onClick={(e) => e.stopPropagation()}>
          <div className="rejection-dialog">
            <h3>
              <AlertTriangle size={20} className="text-red-500" />
              Reject Visit
            </h3>
            <p>Please provide a reason for rejecting this visit. This will be sent to the employee.</p>
            <textarea
              placeholder="Enter rejection reason..."
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              autoFocus
            />
            <div className="rejection-dialog-actions">
              <button className="dialog-btn cancel" onClick={handleRejectCancel}>
                Cancel
              </button>
              <button
                className="dialog-btn confirm"
                onClick={handleRejectConfirm}
                disabled={!rejectReason.trim()}
              >
                Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VisitApproval;