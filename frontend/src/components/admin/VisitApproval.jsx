/**
 * VisitApproval Component
 *
 * Clean modal for reviewing visit details with GPS verification
 * Features collapsible sections for better organization
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
  Package,
  Camera,
  Briefcase,
  ChevronDown,
  ChevronUp,
  Phone,
  Mail,
} from 'lucide-react';
import VisitLocationMap from './VisitLocationMap';

/* =============================================================================
   MOCK DATA
   ============================================================================= */

const MOCK_VISIT_DATA = {
  id: 'visit-001',
  date: '2025-12-30',
  time: '09:30 AM',
  weekLabel: 'W1D2',
  status: 'pending',
  
  // Employee
  employeeName: 'Juan Dela Cruz',
  employeeId: 'EMP-001',
  employeeRole: 'Business Development Manager',
  employeeRegion: 'Region VI - Western Visayas',
  employeeContact: '+63 917 123 4567',
  employeeEmail: 'juan.delacruz@company.com',
  
  // Doctor/Client
  doctorName: 'Dr. Maria Santos',
  specialization: 'Cardiologist',
  hospital: 'Iloilo Doctors Hospital',
  clinicAddress: '123 General Luna St, Iloilo City',
  visitFrequency: 'Weekly',
  
  // Visit Info
  productsDiscussed: ['CardioMax 100mg', 'NeuroPlus 500mg', 'VitaPlus Daily'],
  photoProofs: ['clinic_entrance.jpg', 'with_doctor.jpg', 'product_display.jpg'],
  visitDuration: '45 minutes',
  visitType: 'Scheduled',
  
  // Notes
  purpose: 'Product presentation for CardioMax 100mg and follow-up on previous samples. Discussed new clinical trial results and answered questions about dosage recommendations for elderly patients.',
  clientFeedback: 'Doctor expressed strong interest in the new CardioMax formulation. She mentioned positive feedback from patients who tried the samples. Requested additional clinical studies and pricing information for bulk orders.',
  privateNotes: 'Schedule follow-up visit next week to bring updated brochures and sample packs. Doctor mentioned potential referral to colleagues in the cardiology department. High priority client.',
  
  // GPS
  clinicCoordinates: { lat: 10.6969, lng: 122.5648 },
  employeeCoordinates: { lat: 10.6975, lng: 122.5652 },
  gpsAccuracy: 12,
  checkInTime: '09:28 AM',
  checkOutTime: '10:15 AM',
};

/* =============================================================================
   STYLES
   ============================================================================= */

const styles = `
  .va-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: 20px;
  }

  .va-modal {
    background: white;
    border-radius: 16px;
    width: 100%;
    max-width: 640px;
    max-height: 85vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
    overflow: hidden;
  }

  /* Header */
  .va-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid #e5e7eb;
    background: #fafafa;
    flex-shrink: 0;
  }

  .va-header-info {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }

  .va-header-item {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 14px;
    color: #374151;
  }

  .va-week {
    padding: 4px 10px;
    background: #dbeafe;
    color: #1d4ed8;
    font-size: 12px;
    font-weight: 600;
    border-radius: 6px;
  }

  .va-status {
    padding: 4px 12px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .va-status.pending { background: #fef3c7; color: #92400e; }
  .va-status.approved { background: #dcfce7; color: #166534; }
  .va-status.rejected { background: #fee2e2; color: #dc2626; }

  .va-close {
    width: 36px;
    height: 36px;
    border: none;
    background: #f3f4f6;
    border-radius: 8px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #6b7280;
  }

  .va-close:hover {
    background: #e5e7eb;
    color: #374151;
  }

  /* Body - Scrollable */
  .va-body {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
  }

  /* Collapsible Section */
  .va-section {
    background: #fafafa;
    border: 1px solid #e5e7eb;
    border-radius: 12px;
    margin-bottom: 12px;
    overflow: hidden;
  }

  .va-section:last-child {
    margin-bottom: 0;
  }

  .va-section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 16px;
    cursor: pointer;
    user-select: none;
    background: white;
    transition: background 0.15s;
  }

  .va-section-header:hover {
    background: #f9fafb;
  }

  .va-section-title {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 14px;
    font-weight: 600;
    color: #1f2937;
  }

  .va-section-icon {
    width: 28px;
    height: 28px;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
  }

  .va-section-icon.cyan { background: #06b6d4; }
  .va-section-icon.blue { background: #3b82f6; }
  .va-section-icon.amber { background: #f59e0b; }
  .va-section-icon.purple { background: #8b5cf6; }
  .va-section-icon.green { background: #22c55e; }

  .va-section-toggle {
    color: #9ca3af;
    transition: transform 0.2s;
  }

  .va-section-toggle.open {
    transform: rotate(180deg);
  }

  .va-section-content {
    padding: 0 16px 16px;
  }

  /* Info Row */
  .va-row {
    display: flex;
    padding: 10px 0;
    border-bottom: 1px solid #f3f4f6;
  }

  .va-row:last-child {
    border-bottom: none;
    padding-bottom: 0;
  }

  .va-row:first-child {
    padding-top: 0;
  }

  .va-label {
    width: 120px;
    font-size: 12px;
    color: #6b7280;
    font-weight: 500;
    flex-shrink: 0;
  }

  .va-value {
    flex: 1;
    font-size: 14px;
    color: #1f2937;
  }

  .va-value.highlight {
    color: #2563eb;
    font-weight: 600;
  }

  /* Tags */
  .va-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .va-tag {
    padding: 4px 10px;
    background: #f3f4f6;
    border-radius: 16px;
    font-size: 12px;
    color: #4b5563;
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .va-tag.product { background: #dbeafe; color: #1d4ed8; }
  .va-tag.photo { background: #dcfce7; color: #166534; }

  /* Notes */
  .va-note {
    margin-bottom: 14px;
  }

  .va-note:last-child {
    margin-bottom: 0;
  }

  .va-note-label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    font-weight: 600;
    color: #6b7280;
    margin-bottom: 6px;
  }

  .va-note-text {
    font-size: 13px;
    line-height: 1.6;
    color: #374151;
    padding: 12px;
    background: white;
    border-radius: 8px;
    border-left: 3px solid #e5e7eb;
  }

  .va-note-text.purpose { border-left-color: #3b82f6; }
  .va-note-text.feedback { border-left-color: #22c55e; }
  .va-note-text.private { border-left-color: #f59e0b; background: #fffbeb; }

  /* GPS Section */
  .va-gps-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 14px;
    background: white;
    border-radius: 8px;
    margin-bottom: 12px;
    border: 1px solid #e5e7eb;
  }

  .va-gps-stats {
    display: flex;
    gap: 20px;
  }

  .va-gps-stat {
    text-align: center;
  }

  .va-gps-stat-label {
    font-size: 10px;
    color: #6b7280;
    text-transform: uppercase;
    font-weight: 600;
  }

  .va-gps-stat-value {
    font-size: 15px;
    font-weight: 700;
    margin-top: 2px;
  }

  .va-gps-stat-value.ok { color: #16a34a; }
  .va-gps-stat-value.bad { color: #dc2626; }

  .va-gps-badge {
    padding: 8px 14px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .va-gps-badge.verified {
    background: #dcfce7;
    color: #166534;
    border: 1px solid #86efac;
  }

  .va-gps-badge.suspicious {
    background: #fee2e2;
    color: #dc2626;
    border: 1px solid #fca5a5;
  }

  .va-coords {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    margin-bottom: 12px;
  }

  .va-coord {
    padding: 10px 12px;
    background: white;
    border-radius: 8px;
    border: 1px solid #e5e7eb;
  }

  .va-coord-label {
    font-size: 10px;
    color: #6b7280;
    text-transform: uppercase;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 4px;
    margin-bottom: 4px;
  }

  .va-coord-label .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }

  .va-coord-label .dot.blue { background: #3b82f6; }
  .va-coord-label .dot.red { background: #ef4444; }

  .va-coord-value {
    font-size: 12px;
    font-family: monospace;
    color: #374151;
  }

  /* Footer */
  .va-footer {
    padding: 14px 20px;
    border-top: 1px solid #e5e7eb;
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: #fafafa;
    flex-shrink: 0;
  }

  .va-footer-note {
    font-size: 12px;
    color: #6b7280;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .va-footer-actions {
    display: flex;
    gap: 10px;
  }

  .va-btn {
    padding: 10px 20px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 6px;
    border: none;
    transition: all 0.15s;
  }

  .va-btn.approve {
    background: #22c55e;
    color: white;
  }

  .va-btn.approve:hover {
    background: #16a34a;
  }

  .va-btn.reject {
    background: white;
    color: #dc2626;
    border: 1px solid #fecaca;
  }

  .va-btn.reject:hover {
    background: #fef2f2;
  }

  /* Reject Dialog */
  .va-dialog-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1100;
  }

  .va-dialog {
    background: white;
    border-radius: 16px;
    padding: 24px;
    width: 100%;
    max-width: 400px;
  }

  .va-dialog h3 {
    margin: 0 0 8px 0;
    font-size: 18px;
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .va-dialog p {
    margin: 0 0 16px 0;
    font-size: 14px;
    color: #6b7280;
  }

  .va-dialog textarea {
    width: 100%;
    min-height: 100px;
    padding: 12px;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    font-size: 14px;
    font-family: inherit;
    margin-bottom: 16px;
    resize: vertical;
  }

  .va-dialog textarea:focus {
    outline: none;
    border-color: #dc2626;
  }

  .va-dialog-actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
  }

  .va-dialog-btn {
    padding: 10px 18px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    border: none;
  }

  .va-dialog-btn.cancel {
    background: #f3f4f6;
    color: #374151;
  }

  .va-dialog-btn.confirm {
    background: #dc2626;
    color: white;
  }

  .va-dialog-btn.confirm:disabled {
    background: #fca5a5;
    cursor: not-allowed;
  }

  @media (max-width: 600px) {
    .va-modal {
      max-height: 95vh;
    }
    .va-coords {
      grid-template-columns: 1fr;
    }
    .va-gps-bar {
      flex-direction: column;
      gap: 12px;
    }
    .va-footer {
      flex-direction: column;
      gap: 12px;
    }
    .va-footer-actions {
      width: 100%;
    }
    .va-btn {
      flex: 1;
      justify-content: center;
    }
  }
`;

/* =============================================================================
   HELPER
   ============================================================================= */

const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
};

/* =============================================================================
   COLLAPSIBLE SECTION COMPONENT
   ============================================================================= */

const Section = ({ icon: Icon, iconColor, title, children, defaultOpen = true }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="va-section">
      <div className="va-section-header" onClick={() => setIsOpen(!isOpen)}>
        <div className="va-section-title">
          <div className={`va-section-icon ${iconColor}`}>
            <Icon size={14} />
          </div>
          {title}
        </div>
        <ChevronDown size={18} className={`va-section-toggle ${isOpen ? 'open' : ''}`} />
      </div>
      {isOpen && <div className="va-section-content">{children}</div>}
    </div>
  );
};

/* =============================================================================
   MAIN COMPONENT
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

  const data = visit || MOCK_VISIT_DATA;

  const gpsDistance = data.clinicCoordinates && data.employeeCoordinates
    ? calculateDistance(data.clinicCoordinates.lat, data.clinicCoordinates.lng, data.employeeCoordinates.lat, data.employeeCoordinates.lng)
    : 0;
  const gpsOk = gpsDistance <= 400;

  if (!isOpen) return null;

  const handleApprove = () => {
    if (onApprove) onApprove(data);
    onClose();
  };

  const handleReject = () => {
    if (onReject) onReject(data, rejectReason);
    setShowRejectDialog(false);
    setRejectReason('');
    onClose();
  };

  return (
    <div className="va-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <style>{styles}</style>
      <div className="va-modal">
        {/* Header */}
        <div className="va-header">
          <div className="va-header-info">
            <span className="va-header-item">
              <Calendar size={14} color="#6b7280" />
              {data.date}
            </span>
            <span className="va-header-item">
              <Clock size={14} color="#6b7280" />
              {data.time}
            </span>
            <span className="va-week">{data.weekLabel}</span>
            <span className={`va-status ${data.status}`}>
              <Clock size={12} />
              {data.status.charAt(0).toUpperCase() + data.status.slice(1)}
            </span>
          </div>
          <button className="va-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="va-body">
          {/* Employee Details */}
          <Section icon={Briefcase} iconColor="cyan" title="Employee Details" defaultOpen={false}>
            <div className="va-row">
              <span className="va-label">Name</span>
              <span className="va-value highlight">{data.employeeName}</span>
            </div>
            <div className="va-row">
              <span className="va-label">ID</span>
              <span className="va-value">{data.employeeId}</span>
            </div>
            <div className="va-row">
              <span className="va-label">Role</span>
              <span className="va-value">{data.employeeRole || 'BDM'}</span>
            </div>
            <div className="va-row">
              <span className="va-label">Region</span>
              <span className="va-value">{data.employeeRegion || data.region}</span>
            </div>
            {data.employeeContact && (
              <div className="va-row">
                <span className="va-label">Contact</span>
                <span className="va-value">{data.employeeContact}</span>
              </div>
            )}
          </Section>

          {/* VIP Client */}
          <Section icon={Stethoscope} iconColor="blue" title="VIP Client" defaultOpen={true}>
            <div className="va-row">
              <span className="va-label">Doctor</span>
              <span className="va-value highlight">{data.doctorName}</span>
            </div>
            <div className="va-row">
              <span className="va-label">Specialization</span>
              <span className="va-value">{data.specialization}</span>
            </div>
            <div className="va-row">
              <span className="va-label">Hospital</span>
              <span className="va-value">{data.hospital}</span>
            </div>
            <div className="va-row">
              <span className="va-label">Address</span>
              <span className="va-value">{data.clinicAddress}</span>
            </div>
            <div className="va-row">
              <span className="va-label">Frequency</span>
              <span className="va-value">{data.visitFrequency}</span>
            </div>
          </Section>

          {/* Visit Details */}
          <Section icon={Package} iconColor="amber" title="Visit Details" defaultOpen={false}>
            <div className="va-row">
              <span className="va-label">Type</span>
              <span className="va-value">{data.visitType || 'Scheduled'}</span>
            </div>
            <div className="va-row">
              <span className="va-label">Duration</span>
              <span className="va-value">{data.visitDuration || 'N/A'}</span>
            </div>
            <div className="va-row">
              <span className="va-label">Products</span>
              <div className="va-tags">
                {(data.productsDiscussed || []).map((p, i) => (
                  <span key={i} className="va-tag product">{p}</span>
                ))}
              </div>
            </div>
            <div className="va-row">
              <span className="va-label">Photos</span>
              <div className="va-tags">
                {(data.photoProofs || []).map((p, i) => (
                  <span key={i} className="va-tag photo">
                    <Camera size={10} />
                    {p}
                  </span>
                ))}
              </div>
            </div>
          </Section>

          {/* Notes & Feedback */}
          <Section icon={FileText} iconColor="purple" title="Notes & Feedback" defaultOpen={true}>
            <div className="va-note">
              <div className="va-note-label">
                <MessageSquare size={12} />
                Purpose of Visit
              </div>
              <div className="va-note-text purpose">{data.purpose || 'No purpose provided.'}</div>
            </div>
            <div className="va-note">
              <div className="va-note-label">
                <User size={12} />
                Client Feedback
              </div>
              <div className="va-note-text feedback">{data.clientFeedback || 'No feedback recorded.'}</div>
            </div>
            <div className="va-note">
              <div className="va-note-label">
                <Lock size={12} />
                Private Notes
              </div>
              <div className="va-note-text private">{data.privateNotes || 'No private notes.'}</div>
            </div>
          </Section>

          {/* Location Verification */}
          <Section icon={MapPin} iconColor="green" title="Location Verification" defaultOpen={true}>
            {/* GPS Status Bar */}
            <div className="va-gps-bar">
              <div className="va-gps-stats">
                <div className="va-gps-stat">
                  <div className="va-gps-stat-label">Distance</div>
                  <div className={`va-gps-stat-value ${gpsOk ? 'ok' : 'bad'}`}>{gpsDistance}m</div>
                </div>
                <div className="va-gps-stat">
                  <div className="va-gps-stat-label">Threshold</div>
                  <div className="va-gps-stat-value">400m</div>
                </div>
                <div className="va-gps-stat">
                  <div className="va-gps-stat-label">Accuracy</div>
                  <div className="va-gps-stat-value">±{data.gpsAccuracy}m</div>
                </div>
              </div>
              <div className={`va-gps-badge ${gpsOk ? 'verified' : 'suspicious'}`}>
                {gpsOk ? <CheckCircle size={16} /> : <AlertTriangle size={16} />}
                {gpsOk ? 'GPS Verified' : 'GPS Suspicious'}
              </div>
            </div>

            {/* Coordinates */}
            <div className="va-coords">
              <div className="va-coord">
                <div className="va-coord-label">
                  <span className="dot blue" />
                  Clinic Location
                </div>
                <div className="va-coord-value">
                  {data.clinicCoordinates?.lat.toFixed(6)}, {data.clinicCoordinates?.lng.toFixed(6)}
                </div>
              </div>
              <div className="va-coord">
                <div className="va-coord-label">
                  <span className="dot red" />
                  Photo Location
                </div>
                <div className="va-coord-value">
                  {data.employeeCoordinates?.lat.toFixed(6)}, {data.employeeCoordinates?.lng.toFixed(6)}
                </div>
              </div>
            </div>

            {/* Map */}
            <VisitLocationMap
              clinicCoords={data.clinicCoordinates}
              employeeCoords={data.employeeCoordinates}
              allowedRadius={400}
              accuracy={data.gpsAccuracy}
              height="240px"
            />
          </Section>
        </div>

        {/* Footer */}
        <div className="va-footer">
          <div className="va-footer-note">
            <AlertTriangle size={14} />
            GPS is informational only
          </div>
          <div className="va-footer-actions">
            <button className="va-btn reject" onClick={() => setShowRejectDialog(true)}>
              <XCircle size={16} />
              Reject
            </button>
            <button className="va-btn approve" onClick={handleApprove}>
              <CheckCircle size={16} />
              Approve
            </button>
          </div>
        </div>
      </div>

      {/* Reject Dialog */}
      {showRejectDialog && (
        <div className="va-dialog-backdrop" onClick={(e) => e.stopPropagation()}>
          <div className="va-dialog">
            <h3>
              <AlertTriangle size={20} color="#dc2626" />
              Reject Visit
            </h3>
            <p>Please provide a reason for rejecting this visit.</p>
            <textarea
              placeholder="Enter rejection reason..."
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              autoFocus
            />
            <div className="va-dialog-actions">
              <button className="va-dialog-btn cancel" onClick={() => { setShowRejectDialog(false); setRejectReason(''); }}>
                Cancel
              </button>
              <button className="va-dialog-btn confirm" onClick={handleReject} disabled={!rejectReason.trim()}>
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VisitApproval;