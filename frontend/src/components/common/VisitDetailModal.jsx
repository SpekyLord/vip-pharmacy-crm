/**
 * VisitDetailModal - Shared visit detail viewer
 *
 * Displays full visit details in a modal:
 * - Visit info (date, week, category, status)
 * - Client info (VIP or Regular)
 * - Notes & feedback
 * - GPS location with Google Maps link
 * - Products discussed
 * - Photos with source badges and taken-at timestamps
 * - Full-size image viewer
 * - Auto-refresh for expired S3 signed URLs
 */

import { useState } from 'react';
import visitService from '../../services/visitService';
import clientService from '../../services/clientService';
import toast from 'react-hot-toast';

const modalStyles = `
  .vdm-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000;
    padding: 1rem;
  }

  .vdm-content {
    background: white;
    border-radius: 8px;
    max-width: 800px;
    width: 100%;
    max-height: 90vh;
    overflow-y: auto;
  }

  .vdm-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem 1.5rem;
    border-bottom: 1px solid #eee;
  }

  .vdm-header h2 {
    margin: 0;
    font-size: 1.25rem;
  }

  .vdm-close {
    background: none;
    border: none;
    font-size: 1.5rem;
    cursor: pointer;
    color: #666;
  }

  .vdm-body {
    padding: 1.5rem;
  }

  .vdm-footer {
    padding: 1rem 1.5rem;
    border-top: 1px solid #eee;
    display: flex;
    justify-content: flex-end;
  }

  .vdm-section {
    margin-bottom: 1.5rem;
  }

  .vdm-section h3 {
    font-size: 1rem;
    color: #333;
    margin-bottom: 0.75rem;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid #eee;
  }

  .vdm-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 1rem;
  }

  .vdm-grid.full-width .vdm-item {
    grid-column: span 2;
  }

  .vdm-item {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .vdm-item label {
    font-size: 0.75rem;
    color: #666;
    font-weight: 500;
  }

  .vdm-item span {
    font-size: 0.875rem;
  }

  .vdm-week-label {
    background: #e3f2fd;
    color: #1976d2;
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    font-weight: 500;
    font-size: 0.875rem;
    display: inline-block;
  }

  .vdm-status {
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    font-size: 0.75rem;
    font-weight: 500;
    text-transform: capitalize;
    display: inline-block;
  }

  .vdm-status-completed {
    background: #e8f5e9;
    color: #2e7d32;
  }

  .vdm-status-cancelled {
    background: #ffebee;
    color: #c62828;
  }

  .vdm-type-badge {
    display: inline-block;
    padding: 0.2rem 0.5rem;
    border-radius: 4px;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
  }

  .vdm-type-vip {
    background: #dbeafe;
    color: #1d4ed8;
  }

  .vdm-type-extra {
    background: #ede9fe;
    color: #7c3aed;
  }

  .vdm-products-list {
    list-style: none;
    padding: 0;
    margin: 0;
  }

  .vdm-products-list li {
    padding: 0.5rem 0;
    border-bottom: 1px solid #eee;
  }

  .vdm-products-list li:last-child {
    border-bottom: none;
  }

  .vdm-product-name {
    font-weight: 500;
  }

  .vdm-product-feedback {
    color: #666;
    font-size: 0.875rem;
  }

  .vdm-photo-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 1rem;
  }

  .vdm-photo-item {
    position: relative;
    cursor: pointer;
    border-radius: 8px;
    overflow: hidden;
  }

  .vdm-photo-item img {
    width: 100%;
    height: 150px;
    object-fit: cover;
  }

  .vdm-photo-item:hover {
    opacity: 0.9;
  }

  .vdm-photo-meta {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    background: rgba(0,0,0,0.7);
    color: white;
    font-size: 0.7rem;
    padding: 4px 6px;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .vdm-source-tag {
    display: inline-block;
    font-size: 9px;
    padding: 1px 5px;
    border-radius: 3px;
    font-weight: 600;
    text-transform: uppercase;
    width: fit-content;
  }

  .vdm-src-camera {
    background: #2563eb;
    color: white;
  }

  .vdm-src-gallery {
    background: #7c3aed;
    color: white;
  }

  .vdm-src-clipboard {
    background: #0891b2;
    color: white;
  }

  .vdm-taken-date {
    color: #d1d5db;
    font-size: 10px;
  }

  .vdm-no-photos {
    color: #999;
    font-style: italic;
  }

  .vdm-refreshing {
    font-size: 0.75rem;
    color: #1976d2;
    font-weight: normal;
    margin-left: 0.5rem;
  }

  .vdm-image-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.9);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1100;
    padding: 1rem;
  }

  .vdm-full-image {
    position: relative;
    max-width: 90vw;
    max-height: 90vh;
  }

  .vdm-full-image img {
    max-width: 100%;
    max-height: 90vh;
    object-fit: contain;
  }

  .vdm-full-image .vdm-close {
    position: absolute;
    top: -40px;
    right: 0;
    color: white;
    font-size: 2rem;
  }

  @media (max-width: 768px) {
    .vdm-grid {
      grid-template-columns: 1fr;
    }

    .vdm-grid.full-width .vdm-item {
      grid-column: span 1;
    }

    .vdm-photo-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  @media (max-width: 480px) {
    .vdm-overlay {
      padding: 0;
    }

    .vdm-content {
      max-width: 100%;
      max-height: 100vh;
      border-radius: 0;
      height: 100vh;
    }
  }
`;

const VisitDetailModal = ({ visit, onClose, onPhotosRefreshed }) => {
  const [fullImageUrl, setFullImageUrl] = useState(null);
  const [refreshingPhotos, setRefreshingPhotos] = useState(false);

  if (!visit) return null;

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatTime = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatPhotoDate = (dateString) => {
    if (!dateString) return null;
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return null;
      return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });
    } catch {
      return null;
    }
  };

  const getStatusClass = (status) => {
    switch (status) {
      case 'completed': return 'vdm-status vdm-status-completed';
      case 'cancelled': return 'vdm-status vdm-status-cancelled';
      default: return 'vdm-status';
    }
  };

  const handleImageError = async (e) => {
    if (e.target.dataset.retried) return;
    e.target.dataset.retried = 'true';
    if (refreshingPhotos) return;

    setRefreshingPhotos(true);
    try {
      // Use correct service based on visit type
      const response = visit._visitType === 'regular'
        ? await clientService.refreshVisitPhotos(visit._id)
        : await visitService.refreshPhotos(visit._id);
      if (response.success && response.data?.photos) {
        onPhotosRefreshed?.(visit._id, response.data.photos);
        toast.success('Photos refreshed');
      }
    } catch (err) {
      console.error('Failed to refresh photo URLs:', err);
      toast.error('Failed to load photos. Please try again.');
    } finally {
      setRefreshingPhotos(false);
    }
  };

  const isExtra = visit._visitCategory === 'extra';

  return (
    <>
      <style>{modalStyles}</style>

      <div className="vdm-overlay" onClick={onClose}>
        <div className="vdm-content" onClick={(e) => e.stopPropagation()}>
          <div className="vdm-header">
            <h2>Visit Details</h2>
            <button onClick={onClose} className="vdm-close">&times;</button>
          </div>

          <div className="vdm-body">
            {/* Visit Info */}
            <div className="vdm-section">
              <h3>Visit Information</h3>
              <div className="vdm-grid">
                <div className="vdm-item">
                  <label>Date & Time</label>
                  <span>{formatDate(visit.visitDate)} at {formatTime(visit.visitDate)}</span>
                </div>
                {!isExtra && (
                  <div className="vdm-item">
                    <label>Week Label</label>
                    <span className="vdm-week-label">{visit.weekLabel || '-'}</span>
                  </div>
                )}
                <div className="vdm-item">
                  <label>Category</label>
                  <span className={`vdm-type-badge ${isExtra ? 'vdm-type-extra' : 'vdm-type-vip'}`}>
                    {isExtra ? 'Extra Call' : 'VIP Visit'}
                  </span>
                </div>
                <div className="vdm-item">
                  <label>Status</label>
                  <span className={getStatusClass(visit.status)}>{visit.status}</span>
                </div>
                {visit.user?.name && (
                  <div className="vdm-item">
                    <label>BDM</label>
                    <span>{visit.user.name}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Client Info */}
            <div className="vdm-section">
              <h3>{isExtra ? 'Regular Client' : 'VIP Client'}</h3>
              {isExtra ? (
                <div className="vdm-grid">
                  <div className="vdm-item">
                    <label>Name</label>
                    <span>{visit.client?.fullName || `${visit.client?.firstName || ''} ${visit.client?.lastName || ''}`.trim() || 'Unknown'}</span>
                  </div>
                  <div className="vdm-item">
                    <label>Specialization</label>
                    <span>{visit.client?.specialization || '-'}</span>
                  </div>
                  <div className="vdm-item">
                    <label>Address</label>
                    <span>{visit.client?.clinicOfficeAddress || '-'}</span>
                  </div>
                  {visit.client?.phone && (
                    <div className="vdm-item">
                      <label>Phone</label>
                      <span>{visit.client.phone}</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="vdm-grid">
                  <div className="vdm-item">
                    <label>Name</label>
                    <span>{visit.doctor?.fullName || visit.doctor?.name || `${visit.doctor?.firstName || ''} ${visit.doctor?.lastName || ''}`.trim() || 'Unknown'}</span>
                  </div>
                  <div className="vdm-item">
                    <label>Specialization</label>
                    <span>{visit.doctor?.specialization || '-'}</span>
                  </div>
                  <div className="vdm-item">
                    <label>Hospital/Clinic</label>
                    <span>{visit.doctor?.clinicOfficeAddress || visit.doctor?.hospital || '-'}</span>
                  </div>
                  <div className="vdm-item">
                    <label>Visit Frequency</label>
                    <span>{visit.doctor?.visitFrequency || 4}x per month</span>
                  </div>
                </div>
              )}
            </div>

            {/* Notes & Feedback */}
            <div className="vdm-section">
              <h3>Notes & Feedback</h3>
              <div className="vdm-grid full-width">
                <div className="vdm-item">
                  <label>Purpose</label>
                  <span>{visit.purpose || 'N/A'}</span>
                </div>
                <div className="vdm-item">
                  <label>VIP Client Feedback</label>
                  <span>{visit.doctorFeedback || 'N/A'}</span>
                </div>
                <div className="vdm-item">
                  <label>Notes</label>
                  <span>{visit.notes || 'N/A'}</span>
                </div>
                {visit.nextVisitDate && (
                  <div className="vdm-item">
                    <label>Next Visit Date</label>
                    <span>{formatDate(visit.nextVisitDate)}</span>
                  </div>
                )}
              </div>
            </div>

            {/* GPS Location */}
            {visit.location && (visit.location.latitude || visit.location.longitude) && (
              <div className="vdm-section">
                <h3>Location</h3>
                <div className="vdm-grid">
                  <div className="vdm-item">
                    <label>Coordinates</label>
                    <span>
                      {visit.location?.latitude?.toFixed(6) || '-'},
                      {visit.location?.longitude?.toFixed(6) || '-'}
                    </span>
                  </div>
                  <div className="vdm-item">
                    <label>Accuracy</label>
                    <span>{visit.location?.accuracy ? `${Math.round(visit.location.accuracy)}m` : '-'}</span>
                  </div>
                  {visit.location?.latitude && visit.location?.longitude && (
                    <div className="vdm-item">
                      <label>Map</label>
                      <a
                        href={`https://www.google.com/maps?q=${visit.location.latitude},${visit.location.longitude}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-link"
                      >
                        View on Google Maps
                      </a>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Products Discussed */}
            {!isExtra && visit.productsDiscussed?.length > 0 && (
              <div className="vdm-section">
                <h3>Products Discussed</h3>
                <ul className="vdm-products-list">
                  {visit.productsDiscussed.map((item, index) => (
                    <li key={index}>
                      <span className="vdm-product-name">{item.product?.name || 'Unknown Product'}</span>
                      {item.feedback && <span className="vdm-product-feedback"> - {item.feedback}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Photos */}
            <div className="vdm-section">
              <h3>
                Photos ({visit.photos?.length || 0})
                {refreshingPhotos && <span className="vdm-refreshing"> Refreshing...</span>}
              </h3>
              {visit.photos?.length > 0 ? (
                <div className="vdm-photo-grid">
                  {visit.photos.map((photo, index) => (
                    <div key={index} className="vdm-photo-item" onClick={() => setFullImageUrl(photo.url)}>
                      <img
                        src={photo.url}
                        alt={`Visit photo ${index + 1}`}
                        onError={handleImageError}
                      />
                      <div className="vdm-photo-meta">
                        {photo.source && (
                          <span className={`vdm-source-tag vdm-src-${photo.source}`}>
                            {photo.source === 'gallery' ? 'Gallery' : photo.source === 'clipboard' ? 'Clipboard' : 'Camera'}
                          </span>
                        )}
                        {photo.capturedAt && (
                          <span className="vdm-taken-date">
                            {formatPhotoDate(photo.capturedAt)}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="vdm-no-photos">No photos available</p>
              )}
            </div>
          </div>

          <div className="vdm-footer">
            <button onClick={onClose} className="btn btn-secondary">Close</button>
          </div>
        </div>
      </div>

      {/* Full Image Overlay */}
      {fullImageUrl && (
        <div className="vdm-image-overlay" onClick={() => setFullImageUrl(null)}>
          <div className="vdm-full-image">
            <img src={fullImageUrl} alt="Full size" />
            <button className="vdm-close" onClick={() => setFullImageUrl(null)}>&times;</button>
          </div>
        </div>
      )}
    </>
  );
};

export default VisitDetailModal;
