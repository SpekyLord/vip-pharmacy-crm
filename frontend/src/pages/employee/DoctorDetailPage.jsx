/**
 * DoctorDetailPage - VIP Client Info Page
 *
 * Displays full VIP Client profile before visit logging:
 * - Profile header with name, specialization, badges
 * - Contact details, clinic schedule
 * - Programs & support tracking
 * - Target products with status
 * - Recent visit history
 * - Actions: Log Visit, Edit, Back
 */

import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import ErrorMessage from '../../components/common/ErrorMessage';
import DoctorEditForm from '../../components/employee/DoctorEditForm';
import ProductDetailModal from '../../components/employee/ProductDetailModal';
import doctorService from '../../services/doctorService';
import visitService from '../../services/visitService';
import productService from '../../services/productService';

const ENGAGEMENT_LABELS = {
  1: 'Visited 4x',
  2: 'Knows BDM/products',
  3: 'Tried products',
  4: 'In group chat',
  5: 'Active partner',
};

const getEngagementClass = (level) => {
  if (level <= 2) return 'eng-low';
  if (level === 3) return 'eng-mid';
  return 'eng-high';
};

const DAY_NAMES = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
const VISIT_STATUS_UNAVAILABLE_REASON = 'Visit status unavailable. Please retry.';

const pageStyles = `
  .ddp-back-row {
    margin-bottom: 20px;
  }

  .ddp-back-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 16px;
    background: #f3f4f6;
    color: #374151;
    border: 1px solid #d1d5db;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
  }

  .ddp-back-btn:hover {
    background: #e5e7eb;
    border-color: #9ca3af;
  }

  .ddp-header-card {
    background: white;
    border-radius: 12px;
    padding: 24px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    border: 1px solid #e5e7eb;
    margin-bottom: 20px;
  }

  .ddp-header-top {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 16px;
    flex-wrap: wrap;
  }

  .ddp-header-info {
    flex: 1;
    min-width: 200px;
  }

  .ddp-header-info h1 {
    margin: 0 0 8px 0;
    font-size: 24px;
    font-weight: 700;
    color: #1f2937;
  }

  .ddp-header-info .ddp-spec {
    margin: 0 0 12px 0;
    font-size: 15px;
    color: #4b5563;
  }

  .ddp-badges {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .ddp-badge {
    display: inline-block;
    padding: 4px 10px;
    border-radius: 20px;
    font-size: 12px;
    font-weight: 600;
    white-space: nowrap;
  }

  .ddp-badge.freq-2 {
    background: #dbeafe;
    color: #1d4ed8;
  }

  .ddp-badge.freq-4 {
    background: #dcfce7;
    color: #16a34a;
  }

  .ddp-badge.vip {
    background: #fef3c7;
    color: #92400e;
  }

  .ddp-badge.eng-low {
    background: #fef2f2;
    color: #dc2626;
  }

  .ddp-badge.eng-mid {
    background: #fefce8;
    color: #a16207;
  }

  .ddp-badge.eng-high {
    background: #f0fdf4;
    color: #16a34a;
  }

  .ddp-header-actions {
    display: flex;
    gap: 10px;
    flex-shrink: 0;
  }

  .ddp-btn {
    padding: 10px 20px;
    border: none;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s;
    white-space: nowrap;
  }

  .ddp-btn-primary {
    background: #2563eb;
    color: white;
  }

  .ddp-btn-primary:hover:not(:disabled) {
    background: #1d4ed8;
  }

  .ddp-btn-primary:disabled {
    background: #9ca3af;
    cursor: not-allowed;
  }

  .ddp-btn-secondary {
    background: #f3f4f6;
    color: #374151;
    border: 1px solid #d1d5db;
  }

  .ddp-btn-secondary:hover {
    background: #e5e7eb;
  }

  .ddp-visit-hint {
    margin-top: 8px;
    font-size: 13px;
    color: #dc2626;
    font-weight: 500;
  }

  .ddp-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
    margin-bottom: 20px;
  }

  .ddp-section {
    background: white;
    border-radius: 12px;
    padding: 20px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    border: 1px solid #e5e7eb;
  }

  .ddp-section-full {
    grid-column: 1 / -1;
  }

  .ddp-section h2 {
    margin: 0 0 16px 0;
    font-size: 16px;
    font-weight: 600;
    color: #1f2937;
    padding-bottom: 10px;
    border-bottom: 1px solid #f3f4f6;
  }

  .ddp-detail-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }

  .ddp-detail-item {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .ddp-detail-item.full-width {
    grid-column: 1 / -1;
  }

  .ddp-detail-label {
    font-size: 12px;
    font-weight: 600;
    color: #6b7280;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }

  .ddp-detail-value {
    font-size: 14px;
    color: #1f2937;
    word-break: break-word;
  }

  .ddp-detail-value.empty {
    color: #9ca3af;
    font-style: italic;
  }

  .ddp-schedule-dots {
    display: flex;
    gap: 8px;
    margin-top: 4px;
  }

  .ddp-day-dot {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }

  .ddp-day-dot .dot {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    font-weight: 600;
  }

  .ddp-day-dot .dot.available {
    background: #dcfce7;
    color: #16a34a;
  }

  .ddp-day-dot .dot.unavailable {
    background: #f3f4f6;
    color: #9ca3af;
  }

  .ddp-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .ddp-chip {
    padding: 4px 12px;
    background: #eff6ff;
    color: #1d4ed8;
    border-radius: 16px;
    font-size: 13px;
    font-weight: 500;
  }

  .ddp-chip.support {
    background: #f0fdf4;
    color: #16a34a;
  }

  .ddp-empty-text {
    font-size: 13px;
    color: #9ca3af;
    font-style: italic;
  }

  .ddp-product-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .ddp-product-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 14px;
    background: #f8fafc;
    border-radius: 8px;
    border: 1px solid #e5e7eb;
    cursor: pointer;
    transition: all 0.15s;
  }

  .ddp-product-item:hover {
    background: #eff6ff;
    border-color: #bfdbfe;
  }

  .ddp-product-name {
    font-size: 14px;
    font-weight: 500;
    color: #1f2937;
  }

  .ddp-product-view-hint {
    font-size: 11px;
    color: #9ca3af;
    margin-top: 8px;
    text-align: center;
  }

  .ddp-product-status {
    font-size: 12px;
    font-weight: 600;
    padding: 3px 10px;
    border-radius: 12px;
  }

  .ddp-product-status.showcasing {
    background: #dbeafe;
    color: #1d4ed8;
  }

  .ddp-product-status.accepted {
    background: #dcfce7;
    color: #16a34a;
  }

  .ddp-visit-table {
    width: 100%;
    border-collapse: collapse;
  }

  .ddp-visit-table th {
    text-align: left;
    padding: 10px 12px;
    font-size: 12px;
    font-weight: 600;
    color: #6b7280;
    text-transform: uppercase;
    border-bottom: 2px solid #e5e7eb;
  }

  .ddp-visit-table td {
    padding: 10px 12px;
    font-size: 14px;
    color: #374151;
    border-bottom: 1px solid #f3f4f6;
  }

  .ddp-visit-table tr:last-child td {
    border-bottom: none;
  }

  .ddp-view-all {
    display: inline-block;
    margin-top: 12px;
    font-size: 14px;
    font-weight: 600;
    color: #2563eb;
    cursor: pointer;
    background: none;
    border: none;
    padding: 0;
  }

  .ddp-view-all:hover {
    text-decoration: underline;
  }

  .ddp-notes-text {
    font-size: 14px;
    color: #374151;
    line-height: 1.6;
    white-space: pre-wrap;
  }

  /* ===== DARK MODE ===== */
  body.dark-mode .dashboard-layout,
  body.dark-mode .main-content {
    background: #0b1220;
  }

  body.dark-mode .ddp-back-btn {
    background: #0f172a;
    color: #e2e8f0;
    border-color: #1e293b;
  }

  body.dark-mode .ddp-back-btn:hover {
    background: #1e293b;
    border-color: #334155;
  }

  body.dark-mode .ddp-header-card,
  body.dark-mode .ddp-section {
    background: #0f172a;
    border-color: #1e293b;
    box-shadow: none;
  }

  body.dark-mode .ddp-header-info h1,
  body.dark-mode .ddp-section h2 {
    color: #f1f5f9;
  }

  body.dark-mode .ddp-header-info .ddp-spec {
    color: #94a3b8;
  }

  body.dark-mode .ddp-section h2 {
    border-bottom-color: #1e293b;
  }

  body.dark-mode .ddp-detail-label {
    color: #94a3b8;
  }

  body.dark-mode .ddp-detail-value {
    color: #e2e8f0;
  }

  body.dark-mode .ddp-detail-value.empty,
  body.dark-mode .ddp-empty-text {
    color: #64748b;
  }

  body.dark-mode .ddp-day-dot .dot.unavailable {
    background: #1e293b;
    color: #94a3b8;
  }

  body.dark-mode .ddp-chip {
    background: #1e3a8a;
    color: #bfdbfe;
  }

  body.dark-mode .ddp-chip.support {
    background: #064e3b;
    color: #a7f3d0;
  }

  body.dark-mode .ddp-product-item {
    background: #0b1220;
    border-color: #1e293b;
  }

  body.dark-mode .ddp-product-item:hover {
    background: #1e293b;
    border-color: #334155;
  }

  body.dark-mode .ddp-product-name,
  body.dark-mode .ddp-notes-text {
    color: #e2e8f0;
  }

  body.dark-mode .ddp-product-view-hint {
    color: #94a3b8;
  }

  body.dark-mode .ddp-visit-table th {
    color: #94a3b8;
    border-bottom-color: #1e293b;
  }

  body.dark-mode .ddp-visit-table td {
    color: #e2e8f0;
    border-bottom-color: #1e293b;
  }

  body.dark-mode .ddp-view-all {
    color: #93c5fd;
  }

  body.dark-mode .ddp-btn-secondary {
    background: #0f172a;
    color: #e2e8f0;
    border-color: #1e293b;
  }

  body.dark-mode .ddp-btn-secondary:hover {
    background: #1e293b;
  }

  body.dark-mode .ddp-section hr {
    border-top-color: #1e293b !important;
  }

  @media (max-width: 768px) {
    .ddp-grid {
      grid-template-columns: 1fr;
    }

    .ddp-header-top {
      flex-direction: column;
    }

    .ddp-header-actions {
      width: 100%;
    }

    .ddp-header-actions .ddp-btn {
      flex: 1;
    }

    .ddp-detail-grid {
      grid-template-columns: 1fr;
    }

    .ddp-visit-table {
      font-size: 13px;
    }

    .ddp-visit-table th,
    .ddp-visit-table td {
      padding: 8px 6px;
    }
  }

  @media (max-width: 480px) {
    .main-content {
      padding: 16px;
      padding-bottom: 80px;
    }
    .ddp-header-info h1 {
      font-size: 22px;
    }
    .ddp-header-card {
      padding: 16px;
    }
    .ddp-header-actions {
      flex-direction: column;
    }
    .ddp-header-actions .ddp-btn {
      min-height: 44px;
      text-align: center;
    }
    .ddp-section {
      padding: 16px;
    }
    .ddp-back-btn {
      min-height: 44px;
    }
  }
`;

const DoctorDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [doctor, setDoctor] = useState(null);
  const [visitEligibility, setVisitEligibility] = useState(null);
  const [visits, setVisits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [detailProduct, setDetailProduct] = useState(null);
  const [loadingProductId, setLoadingProductId] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [doctorRes, canVisitRes, visitsRes] = await Promise.allSettled([
        doctorService.getById(id),
        visitService.canVisit(id),
        doctorService.getVisitHistory(id),
      ]);

      if (doctorRes.status === 'rejected') {
        setError(doctorRes.reason?.response?.data?.message || 'Failed to load VIP Client');
        return;
      }

      setDoctor(doctorRes.value.data);

      if (canVisitRes.status === 'fulfilled') {
        setVisitEligibility(canVisitRes.value.data);
      } else {
        setVisitEligibility({
          canVisit: false,
          reason: VISIT_STATUS_UNAVAILABLE_REASON,
        });
      }

      if (visitsRes.status === 'fulfilled') {
        setVisits(visitsRes.value.data || []);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load VIP Client');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleLogVisit = () => {
    if (visitEligibility?.canVisit !== true) {
      return;
    }
    navigate(`/bdm/visit/new?doctorId=${id}`);
  };

  const handleEditSaved = () => {
    setShowEditModal(false);
    fetchData();
  };

  const handleProductClick = async (tp) => {
    const productId = tp.product?._id || tp.product;
    if (!productId || loadingProductId) return;
    setLoadingProductId(productId);
    try {
      const res = await productService.getById(productId);
      setDetailProduct(res.data);
    } catch {
      // If fetch fails, show what we have
      setDetailProduct(tp.product && typeof tp.product === 'object' ? tp.product : { _id: productId, name: 'Product' });
    } finally {
      setLoadingProductId(null);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return null;
    try {
      return new Date(dateStr).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  if (loading) {
    return <LoadingSpinner fullScreen />;
  }

  if (error) {
    return (
      <div className="dashboard-layout">
        <Navbar />
        <div className="dashboard-content">
          <Sidebar />
          <main className="main-content">
            <ErrorMessage message={error} onRetry={fetchData} />
          </main>
        </div>
      </div>
    );
  }

  if (!doctor) return null;

  const fullName = doctor.fullName || `${doctor.firstName || ''} ${doctor.lastName || ''}`.trim();
  const canVisit = visitEligibility?.canVisit === true;
  const visitReason = canVisit
    ? ''
    : (visitEligibility?.reason || VISIT_STATUS_UNAVAILABLE_REASON);
  const assignedToName = doctor.assignedTo?.name || '';
  const schedule = doctor.clinicSchedule || {};
  const targetProducts = doctor.targetProducts || [];
  const programs = doctor.programsToImplement || [];
  const support = doctor.supportDuringCoverage || [];

  return (
    <div className="dashboard-layout">
      <style>{pageStyles}</style>
      <Navbar />
      <div className="dashboard-content">
        <Sidebar />
        <main className="main-content">
          {/* Back button */}
          <div className="ddp-back-row">
            <button className="ddp-back-btn" onClick={() => navigate('/bdm')}>
              &larr; Back to Dashboard
            </button>
          </div>

          {/* Header Card */}
          <div className="ddp-header-card">
            <div className="ddp-header-top">
              <div className="ddp-header-info">
                <h1>{fullName}</h1>
                {doctor.specialization && (
                  <p className="ddp-spec">{doctor.specialization}</p>
                )}
                <div className="ddp-badges">
                  <span className={`ddp-badge freq-${doctor.visitFrequency}`}>
                    {doctor.visitFrequency}x/month
                  </span>
                  {doctor.isVipAssociated && (
                    <span className="ddp-badge vip">VIP Associated</span>
                  )}
                  {doctor.levelOfEngagement && (
                    <span className={`ddp-badge ${getEngagementClass(doctor.levelOfEngagement)}`}>
                      Eng: {doctor.levelOfEngagement}/5 - {ENGAGEMENT_LABELS[doctor.levelOfEngagement]}
                    </span>
                  )}
                </div>
              </div>
              <div className="ddp-header-actions">
                <button
                  className="ddp-btn ddp-btn-primary"
                  onClick={handleLogVisit}
                  disabled={!canVisit}
                  title={!canVisit ? visitReason : 'Log a visit for this VIP Client'}
                >
                  {canVisit ? 'Log Visit' : 'Cannot Visit'}
                </button>
                <button
                  className="ddp-btn ddp-btn-secondary"
                  onClick={() => setShowEditModal(true)}
                >
                  Edit
                </button>
              </div>
            </div>
            {!canVisit && visitReason && (
              <p className="ddp-visit-hint">{visitReason}</p>
            )}
          </div>

          <div className="ddp-grid">
            {/* Profile Details */}
            <div className="ddp-section">
              <h2>Profile Details</h2>
              <div className="ddp-detail-grid">
                <div className="ddp-detail-item full-width">
                  <span className="ddp-detail-label">Clinic/Office Address</span>
                  <span className={`ddp-detail-value ${!doctor.clinicOfficeAddress ? 'empty' : ''}`}>
                    {doctor.clinicOfficeAddress || 'Not set'}
                  </span>
                </div>
                {doctor.outletIndicator && (
                  <div className="ddp-detail-item">
                    <span className="ddp-detail-label">Outlet</span>
                    <span className="ddp-detail-value">{doctor.outletIndicator}</span>
                  </div>
                )}
                <div className="ddp-detail-item">
                  <span className="ddp-detail-label">Assigned BDM</span>
                  <span className={`ddp-detail-value ${!assignedToName ? 'empty' : ''}`}>
                    {assignedToName || 'Unassigned'}
                  </span>
                </div>
                <div className="ddp-detail-item">
                  <span className="ddp-detail-label">Phone</span>
                  <span className={`ddp-detail-value ${!doctor.phone ? 'empty' : ''}`}>
                    {doctor.phone || 'Not set'}
                  </span>
                </div>
                <div className="ddp-detail-item">
                  <span className="ddp-detail-label">Email</span>
                  <span className={`ddp-detail-value ${!doctor.email ? 'empty' : ''}`}>
                    {doctor.email || 'Not set'}
                  </span>
                </div>
                <div className="ddp-detail-item">
                  <span className="ddp-detail-label">Secretary</span>
                  <span className={`ddp-detail-value ${!doctor.secretaryName ? 'empty' : ''}`}>
                    {doctor.secretaryName || 'Not set'}
                    {doctor.secretaryPhone && ` (${doctor.secretaryPhone})`}
                  </span>
                </div>
                <div className="ddp-detail-item">
                  <span className="ddp-detail-label">Birthday</span>
                  <span className={`ddp-detail-value ${!doctor.birthday ? 'empty' : ''}`}>
                    {formatDate(doctor.birthday) || 'Not set'}
                  </span>
                </div>
                <div className="ddp-detail-item">
                  <span className="ddp-detail-label">Anniversary</span>
                  <span className={`ddp-detail-value ${!doctor.anniversary ? 'empty' : ''}`}>
                    {formatDate(doctor.anniversary) || 'Not set'}
                  </span>
                </div>
              </div>
            </div>

            {/* Clinic Schedule + Programs & Support */}
            <div className="ddp-section">
              <h2>Clinic Schedule</h2>
              <div className="ddp-schedule-dots">
                {DAY_NAMES.map((day, i) => (
                  <div key={day} className="ddp-day-dot">
                    <div className={`dot ${schedule[day] !== false ? 'available' : 'unavailable'}`}>
                      {DAY_LABELS[i]}
                    </div>
                  </div>
                ))}
              </div>

              <h2 style={{ marginTop: 20 }}>Programs to Implement</h2>
              {programs.length > 0 ? (
                <div className="ddp-chips">
                  {programs.map((p) => (
                    <span key={p} className="ddp-chip">{p}</span>
                  ))}
                </div>
              ) : (
                <p className="ddp-empty-text">No programs assigned</p>
              )}

              <h2 style={{ marginTop: 20 }}>Support During Coverage</h2>
              {support.length > 0 ? (
                <div className="ddp-chips">
                  {support.map((s) => (
                    <span key={s} className="ddp-chip support">{s}</span>
                  ))}
                </div>
              ) : (
                <p className="ddp-empty-text">No support types assigned</p>
              )}
            </div>

            {/* Target Products */}
            <div className="ddp-section">
              <h2>Target Products</h2>
              {targetProducts.length > 0 ? (
                <div className="ddp-product-list">
                  {targetProducts.map((tp, idx) => {
                    const productName = tp.product?.name || tp.product?.toString() || `Product ${idx + 1}`;
                    const productId = tp.product?._id || tp.product;
                    const isLoading = loadingProductId === productId;
                    return (
                      <div
                        key={idx}
                        className="ddp-product-item"
                        onClick={() => handleProductClick(tp)}
                        title="Tap to view product details"
                      >
                        <span className="ddp-product-name">
                          {isLoading ? 'Loading...' : productName}
                        </span>
                        <span className={`ddp-product-status ${tp.status}`}>
                          {tp.status === 'accepted' ? 'Accepted' : 'Showcasing'}
                        </span>
                      </div>
                    );
                  })}
                  <p className="ddp-product-view-hint">Tap a product to view details</p>
                </div>
              ) : (
                <p className="ddp-empty-text">No target products assigned</p>
              )}
            </div>

            {/* Notes */}
            {(doctor.notes || doctor.otherDetails) && (
              <div className="ddp-section">
                <h2>Notes</h2>
                {doctor.notes && (
                  <p className="ddp-notes-text">{doctor.notes}</p>
                )}
                {doctor.otherDetails && (
                  <>
                    {doctor.notes && <hr style={{ margin: '12px 0', border: 'none', borderTop: '1px solid #f3f4f6' }} />}
                    <p className="ddp-detail-label" style={{ marginBottom: 4 }}>Other Details</p>
                    <p className="ddp-notes-text">{doctor.otherDetails}</p>
                  </>
                )}
              </div>
            )}

            {/* Visit History */}
            <div className="ddp-section ddp-section-full">
              <h2>Recent Visit History</h2>
              {visits.length > 0 ? (
                <>
                  <div style={{ overflowX: 'auto' }}>
                    <table className="ddp-visit-table">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Week</th>
                          <th>Purpose</th>
                          <th>Notes</th>
                          <th>Photos</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visits.slice(0, 10).map((visit) => (
                          <tr key={visit._id}>
                            <td>{formatDate(visit.visitDate || visit.createdAt)}</td>
                            <td>{visit.weekLabel || `W${visit.weekOfMonth || '?'}`}</td>
                            <td>{visit.purpose || '-'}</td>
                            <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {visit.notes || '-'}
                            </td>
                            <td>{visit.photos?.length || 0}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {visits.length > 10 && (
                    <button
                      className="ddp-view-all"
                      onClick={() => navigate(`/bdm/visits?doctorId=${id}`)}
                    >
                      View all {visits.length} visits &rarr;
                    </button>
                  )}
                </>
              ) : (
                <p className="ddp-empty-text">No visits recorded yet</p>
              )}
            </div>
          </div>

          {/* Edit Modal */}
          {showEditModal && (
            <DoctorEditForm
              doctor={doctor}
              onClose={() => setShowEditModal(false)}
              onSaved={handleEditSaved}
            />
          )}

          {/* Product Detail Modal */}
          {detailProduct && (
            <ProductDetailModal
              product={detailProduct}
              onClose={() => setDetailProduct(null)}
            />
          )}
        </main>
      </div>
    </div>
  );
};

export default DoctorDetailPage;
