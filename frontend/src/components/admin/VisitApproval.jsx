/**
 * VisitApproval Component
 *
 * Modal/Panel for reviewing visit details with GPS verification (Task 2.8 + 2.9)
 * Clean, organized layout matching the design reference.
 *
 * Sections:
 * - Header: Date & Time, Week Label, Status Badge
 * - VIP Client: Doctor info, Specialization, Hospital, Visit Frequency
 * - Notes & Feedback: Purpose, Client Feedback, Private Notes
 * - Location: GPS coordinates, Accuracy, Embedded Map
 * - Actions: Approve/Reject buttons
 *
 * @prop {object} visit - The visit data to display
 * @prop {boolean} isOpen - Controls modal visibility
 * @prop {function} onClose - Callback to close modal
 * @prop {function} onApprove - Callback when visit is approved
 * @prop {function} onReject - Callback when visit is rejected
 */

import { useState } from 'react';
import {
  X,
  Calendar,
  Clock,
  User,
  Stethoscope,
  Building,
  MapPin,
  FileText,
  MessageSquare,
  Lock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Navigation,
  Target,
  Repeat,
} from 'lucide-react';
import VisitLocationMap from './VisitLocationMap';

/* =============================================================================
   MOCK DATA
   Complete visit data with all required fields for the UI
   ============================================================================= */

const MOCK_VISIT_DATA = {
  id: 'visit-001',
  
  // Header Info
  date: '2025-12-30',
  time: '09:30 AM',
  weekLabel: 'W1D2', // Week 1, Day 2
  status: 'pending', // pending | approved | rejected
  
  // VIP Client Info
  doctorName: 'Dr. Maria Santos',
  specialization: 'Cardiologist',
  hospital: 'Iloilo Doctors Hospital',
  clinicAddress: '123 General Luna St, Iloilo City',
  visitFrequency: 'Weekly',
  
  // Notes & Feedback
  purpose: 'Product presentation for CardioMax 100mg and follow-up on previous samples.',
  clientFeedback: 'Doctor expressed interest in the new formulation. Requested additional clinical studies.',
  privateNotes: 'Schedule follow-up visit next week. Bring updated brochures.',
  
  // Location Data
  clinicCoordinates: {
    lat: 10.6969,
    lng: 122.5648,
  },
  employeeCoordinates: {
    lat: 10.6985,  // ~180m away (within range)
    lng: 122.5660,
  },
  gpsAccuracy: 12, // meters
  
  // Employee Info
  employeeName: 'Juan Dela Cruz',
  employeeId: 'EMP-001',
  region: 'Region VI - Western Visayas',
  
  // Products
  productsDiscussed: ['CardioMax 100mg', 'NeuroPlus 500mg'],
  
  // Photos
  photoProofs: ['photo1.jpg', 'photo2.jpg'],
};

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
    background: #f9fafb;
    border-radius: 16px;
    width: 100%;
    max-width: 720px;
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

  /* Modal Header */
  .va-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    background: white;
    border-bottom: 1px solid #e5e7eb;
  }

  .va-header-left {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .va-date-time {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .va-date-time-item {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 14px;
    color: #374151;
  }

  .va-week-label {
    padding: 4px 10px;
    background: #dbeafe;
    color: #1d4ed8;
    font-size: 12px;
    font-weight: 600;
    border-radius: 6px;
  }

  .va-status-badge {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 600;
  }

  .va-status-badge.pending {
    background: #fef3c7;
    color: #b45309;
  }

  .va-status-badge.approved {
    background: #dcfce7;
    color: #15803d;
  }

  .va-status-badge.rejected {
    background: #fee2e2;
    color: #dc2626;
  }

  .va-close-btn {
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

  .va-close-btn:hover {
    background: #e5e7eb;
    color: #374151;
  }

  /* Modal Body */
  .va-body {
    padding: 20px;
    overflow-y: auto;
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  /* Section Card */
  .va-section {
    background: white;
    border-radius: 12px;
    border: 1px solid #e5e7eb;
    overflow: hidden;
  }

  .va-section-header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 16px;
    background: #f9fafb;
    border-bottom: 1px solid #e5e7eb;
    font-size: 14px;
    font-weight: 600;
    color: #374151;
  }

  .va-section-header .icon {
    width: 28px;
    height: 28px;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
  }

  .va-section-header .icon.blue { background: #3b82f6; }
  .va-section-header .icon.green { background: #22c55e; }
  .va-section-header .icon.purple { background: #8b5cf6; }
  .va-section-header .icon.amber { background: #f59e0b; }

  .va-section-body {
    padding: 16px;
  }

  /* Info Grid */
  .va-info-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 14px;
  }

  .va-info-grid.single {
    grid-template-columns: 1fr;
  }

  .va-info-item {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .va-info-item.full {
    grid-column: span 2;
  }

  .va-info-label {
    font-size: 11px;
    font-weight: 500;
    color: #6b7280;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }

  .va-info-value {
    font-size: 14px;
    color: #1f2937;
    font-weight: 500;
  }

  .va-info-value.highlight {
    color: #3b82f6;
    font-weight: 600;
  }

  /* Notes Text */
  .va-notes-text {
    font-size: 14px;
    color: #374151;
    line-height: 1.6;
    padding: 12px;
    background: #f9fafb;
    border-radius: 8px;
    margin-bottom: 12px;
  }

  .va-notes-text:last-child {
    margin-bottom: 0;
  }

  .va-notes-label {
    font-size: 11px;
    font-weight: 600;
    color: #6b7280;
    text-transform: uppercase;
    margin-bottom: 6px;
  }

  /* Location Coords */
  .va-coords-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    margin-bottom: 16px;
  }

  .va-coord-card {
    padding: 12px;
    background: #f9fafb;
    border-radius: 8px;
    display: flex;
    align-items: flex-start;
    gap: 10px;
  }

  .va-coord-icon {
    width: 32px;
    height: 32px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .va-coord-icon.blue { background: #dbeafe; color: #2563eb; }
  .va-coord-icon.red { background: #fee2e2; color: #dc2626; }
  .va-coord-icon.amber { background: #fef3c7; color: #d97706; }

  .va-coord-content {
    flex: 1;
    min-width: 0;
  }

  .va-coord-label {
    font-size: 11px;
    color: #6b7280;
    margin-bottom: 2px;
  }

  .va-coord-value {
    font-size: 12px;
    font-family: monospace;
    color: #374151;
  }

  /* Footer Actions */
  .va-footer {
    padding: 16px 20px;
    background: white;
    border-top: 1px solid #e5e7eb;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 12px;
  }

  .va-action-btn {
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

  .va-action-btn.approve {
    background: linear-gradient(135deg, #22c55e, #16a34a);
    color: white;
  }

  .va-action-btn.approve:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(34, 197, 94, 0.4);
  }

  .va-action-btn.reject {
    background: white;
    color: #dc2626;
    border: 2px solid #fecaca;
  }

  .va-action-btn.reject:hover {
    background: #fef2f2;
    border-color: #dc2626;
  }

  /* Rejection Dialog */
  .va-reject-dialog-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1100;
  }

  .va-reject-dialog {
    background: white;
    border-radius: 16px;
    padding: 24px;
    width: 100%;
    max-width: 420px;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
  }

  .va-reject-dialog h3 {
    margin: 0 0 8px 0;
    font-size: 18px;
    color: #1f2937;
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .va-reject-dialog p {
    margin: 0 0 16px 0;
    font-size: 14px;
    color: #6b7280;
  }

  .va-reject-dialog textarea {
    width: 100%;
    min-height: 100px;
    padding: 12px;
    border: 1px solid #e5e7eb;
    border-radius: 10px;
    font-size: 14px;
    font-family: inherit;
    resize: vertical;
    margin-bottom: 16px;
  }

  .va-reject-dialog textarea:focus {
    outline: none;
    border-color: #dc2626;
    box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.1);
  }

  .va-reject-actions {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
  }

  .va-dialog-btn {
    padding: 10px 20px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    border: none;
  }

  .va-dialog-btn.cancel {
    background: #f3f4f6;
    color: #374151;
  }

  .va-dialog-btn.cancel:hover {
    background: #e5e7eb;
  }

  .va-dialog-btn.confirm {
    background: #dc2626;
    color: white;
  }

  .va-dialog-btn.confirm:hover {
    background: #b91c1c;
  }

  .va-dialog-btn.confirm:disabled {
    background: #fca5a5;
    cursor: not-allowed;
  }

  @media (max-width: 640px) {
    .va-info-grid {
      grid-template-columns: 1fr;
    }
    .va-info-item.full {
      grid-column: span 1;
    }
    .va-coords-grid {
      grid-template-columns: 1fr;
    }
    .va-header-left {
      flex-direction: column;
      align-items: flex-start;
      gap: 8px;
    }
  }
`;

/* =============================================================================
   COMPONENT: VisitApproval
   ============================================================================= */

const VisitApproval = ({
  visit = null,
  isOpen = false,
  onClose = () => {},
  onApprove = null,
  onReject = null,
}) => {
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  // Use mock data if no visit provided
  const visitData = visit || MOCK_VISIT_DATA;

  if (!isOpen) return null;

  // Format date
  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  // Get status icon
  const getStatusIcon = (status) => {
    switch (status) {
      case 'approved':
        return <CheckCircle size={14} />;
      case 'rejected':
        return <XCircle size={14} />;
      default:
        return <Clock size={14} />;
    }
  };

  // Handle backdrop click
  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  // Handle approve
  const handleApprove = () => {
    console.log('✅ Approved visit:', visitData.id);
    if (onApprove) onApprove(visitData);
    onClose();
  };

  // Handle reject click
  const handleRejectClick = () => {
    setShowRejectDialog(true);
  };

  // Handle reject confirm
  const handleRejectConfirm = () => {
    console.log('❌ Rejected visit:', visitData.id, 'Reason:', rejectReason);
    if (onReject) onReject(visitData, rejectReason);
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
        <div className="va-header">
          <div className="va-header-left">
            <div className="va-date-time">
              <div className="va-date-time-item">
                <Calendar size={16} color="#6b7280" />
                {formatDate(visitData.date)}
              </div>
              <div className="va-date-time-item">
                <Clock size={16} color="#6b7280" />
                {visitData.time}
              </div>
            </div>
            <span className="va-week-label">{visitData.weekLabel}</span>
            <span className={`va-status-badge ${visitData.status}`}>
              {getStatusIcon(visitData.status)}
              {visitData.status.charAt(0).toUpperCase() + visitData.status.slice(1)}
            </span>
          </div>
          <button className="va-close-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="va-body">
          {/* VIP Client Section */}
          <div className="va-section">
            <div className="va-section-header">
              <div className="icon blue">
                <Stethoscope size={14} />
              </div>
              VIP Client
            </div>
            <div className="va-section-body">
              <div className="va-info-grid">
                <div className="va-info-item">
                  <span className="va-info-label">Doctor Name</span>
                  <span className="va-info-value highlight">{visitData.doctorName}</span>
                </div>
                <div className="va-info-item">
                  <span className="va-info-label">Specialization</span>
                  <span className="va-info-value">{visitData.specialization}</span>
                </div>
                <div className="va-info-item">
                  <span className="va-info-label">Hospital / Clinic</span>
                  <span className="va-info-value">{visitData.hospital}</span>
                </div>
                <div className="va-info-item">
                  <span className="va-info-label">Visit Frequency</span>
                  <span className="va-info-value">
                    <Repeat size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                    {visitData.visitFrequency}
                  </span>
                </div>
                <div className="va-info-item full">
                  <span className="va-info-label">Address</span>
                  <span className="va-info-value">{visitData.clinicAddress}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Notes & Feedback Section */}
          <div className="va-section">
            <div className="va-section-header">
              <div className="icon purple">
                <FileText size={14} />
              </div>
              Notes & Feedback
            </div>
            <div className="va-section-body">
              <div className="va-notes-label">
                <MessageSquare size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                Purpose of Visit
              </div>
              <div className="va-notes-text">{visitData.purpose}</div>

              <div className="va-notes-label">
                <User size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                Client Feedback
              </div>
              <div className="va-notes-text">{visitData.clientFeedback}</div>

              <div className="va-notes-label">
                <Lock size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                Private Notes
              </div>
              <div className="va-notes-text">{visitData.privateNotes}</div>
            </div>
          </div>

          {/* Location Section */}
          <div className="va-section">
            <div className="va-section-header">
              <div className="icon green">
                <MapPin size={14} />
              </div>
              Location Verification
            </div>
            <div className="va-section-body">
              {/* Coordinates Info */}
              <div className="va-coords-grid">
                <div className="va-coord-card">
                  <div className="va-coord-icon blue">
                    <Building size={16} />
                  </div>
                  <div className="va-coord-content">
                    <div className="va-coord-label">Clinic Coordinates</div>
                    <div className="va-coord-value">
                      {visitData.clinicCoordinates.lat.toFixed(6)}, {visitData.clinicCoordinates.lng.toFixed(6)}
                    </div>
                  </div>
                </div>
                <div className="va-coord-card">
                  <div className="va-coord-icon red">
                    <Navigation size={16} />
                  </div>
                  <div className="va-coord-content">
                    <div className="va-coord-label">Photo Coordinates</div>
                    <div className="va-coord-value">
                      {visitData.employeeCoordinates.lat.toFixed(6)}, {visitData.employeeCoordinates.lng.toFixed(6)}
                    </div>
                  </div>
                </div>
                <div className="va-coord-card" style={{ gridColumn: 'span 2' }}>
                  <div className="va-coord-icon amber">
                    <Target size={16} />
                  </div>
                  <div className="va-coord-content">
                    <div className="va-coord-label">GPS Accuracy</div>
                    <div className="va-coord-value">±{visitData.gpsAccuracy} meters</div>
                  </div>
                </div>
              </div>

              {/* Map Component */}
              <VisitLocationMap
                clinicCoords={visitData.clinicCoordinates}
                employeeCoords={visitData.employeeCoordinates}
                allowedRadius={200}
                accuracy={visitData.gpsAccuracy}
                height="280px"
              />
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="va-footer">
          <button className="va-action-btn reject" onClick={handleRejectClick}>
            <XCircle size={18} />
            Reject
          </button>
          <button className="va-action-btn approve" onClick={handleApprove}>
            <CheckCircle size={18} />
            Approve Visit
          </button>
        </div>
      </div>

      {/* Rejection Dialog */}
      {showRejectDialog && (
        <div className="va-reject-dialog-backdrop" onClick={(e) => e.stopPropagation()}>
          <div className="va-reject-dialog">
            <h3>
              <AlertTriangle size={20} style={{ color: '#dc2626' }} />
              Reject Visit
            </h3>
            <p>Please provide a reason for rejecting this visit.</p>
            <textarea
              placeholder="Enter rejection reason..."
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              autoFocus
            />
            <div className="va-reject-actions">
              <button className="va-dialog-btn cancel" onClick={handleRejectCancel}>
                Cancel
              </button>
              <button
                className="va-dialog-btn confirm"
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