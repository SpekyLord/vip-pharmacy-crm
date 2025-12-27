/**
 * MyVisits Page
 *
 * Employee's visit history with:
 * - Visit list with filters (status, date range, doctor)
 * - Visit details modal with photos
 * - Week labels (W1D2, W2D3 format)
 * - Pagination
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import visitService from '../../services/visitService';
import toast from 'react-hot-toast';

const MyVisits = () => {
  const navigate = useNavigate();

  // Data state
  const [visits, setVisits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filter state
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [doctorSearch, setDoctorSearch] = useState('');

  // Pagination state
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    total: 0,
    pages: 0,
  });

  // Modal state
  const [selectedVisit, setSelectedVisit] = useState(null);
  const [fullImageUrl, setFullImageUrl] = useState(null);
  const [refreshingPhotos, setRefreshingPhotos] = useState(false);

  // Fetch visits
  const fetchVisits = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = {
        page: pagination.page,
        limit: pagination.limit,
      };

      // Add filters if set
      if (statusFilter !== 'all') {
        params.status = statusFilter;
      }
      if (dateRange.start) {
        params.startDate = dateRange.start;
      }
      if (dateRange.end) {
        params.endDate = dateRange.end;
      }
      if (doctorSearch.trim()) {
        params.search = doctorSearch.trim();
      }

      const response = await visitService.getMy(params);

      setVisits(response.data || []);
      setPagination(prev => ({
        ...prev,
        total: response.pagination?.total || 0,
        pages: response.pagination?.pages || 1,
      }));
    } catch (err) {
      console.error('Error fetching visits:', err);
      setError('Failed to load visits. Please try again.');
      toast.error('Failed to load visits');
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit, statusFilter, dateRange, doctorSearch]);

  // Initial fetch
  useEffect(() => {
    fetchVisits();
  }, [fetchVisits]);

  // Format date for display
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  // Format time
  const formatTime = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Handle page change
  const changePage = (delta) => {
    setPagination(prev => ({
      ...prev,
      page: Math.max(1, Math.min(prev.pages, prev.page + delta)),
    }));
  };

  // Clear all filters
  const clearFilters = () => {
    setStatusFilter('all');
    setDateRange({ start: '', end: '' });
    setDoctorSearch('');
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  // Apply filters (reset to page 1)
  const applyFilters = () => {
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  // Get status badge class
  const getStatusBadgeClass = (status) => {
    switch (status) {
      case 'completed':
        return 'status-badge status-completed';
      case 'cancelled':
        return 'status-badge status-cancelled';
      case 'pending':
        return 'status-badge status-pending';
      default:
        return 'status-badge';
    }
  };

  // Open full image in modal
  const openFullImage = (url) => {
    setFullImageUrl(url);
  };

  // Close full image modal
  const closeFullImage = () => {
    setFullImageUrl(null);
  };

  // Handle image load error (expired presigned URL)
  const handleImageError = async (e, visitId) => {
    // Prevent infinite loops - only try once
    if (e.target.dataset.retried) return;
    e.target.dataset.retried = 'true';

    // Don't refresh if already refreshing
    if (refreshingPhotos) return;

    setRefreshingPhotos(true);
    try {
      const response = await visitService.refreshPhotos(visitId);
      if (response.success && response.data?.photos) {
        // Update the selected visit's photos with fresh URLs
        setSelectedVisit(prev => ({
          ...prev,
          photos: response.data.photos
        }));

        // Also update in the visits list
        setVisits(prev => prev.map(v =>
          v._id === visitId
            ? { ...v, photos: response.data.photos }
            : v
        ));

        toast.success('Photos refreshed');
      }
    } catch (err) {
      console.error('Failed to refresh photo URLs:', err);
      toast.error('Failed to load photos. Please try again.');
    } finally {
      setRefreshingPhotos(false);
    }
  };

  if (loading && visits.length === 0) {
    return <LoadingSpinner fullScreen />;
  }

  return (
    <div className="dashboard-layout">
      <Navbar />
      <div className="dashboard-content">
        <Sidebar />
        <main className="main-content">
          {/* Page Header */}
          <div className="page-header">
            <h1>My Visits</h1>
            <button
              onClick={() => navigate('/employee')}
              className="btn btn-primary"
              title="Go to dashboard to select a doctor"
            >
              + New Visit
            </button>
          </div>

          {/* Filters Section */}
          <div className="filters-section">
            <div className="filters-row">
              {/* Status Filter */}
              <div className="filter-group">
                <label htmlFor="status-filter">Status</label>
                <select
                  id="status-filter"
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value);
                    setPagination(prev => ({ ...prev, page: 1 }));
                  }}
                >
                  <option value="all">All Status</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>

              {/* Date Range */}
              <div className="filter-group">
                <label htmlFor="start-date">From</label>
                <input
                  id="start-date"
                  type="date"
                  value={dateRange.start}
                  onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                />
              </div>

              <div className="filter-group">
                <label htmlFor="end-date">To</label>
                <input
                  id="end-date"
                  type="date"
                  value={dateRange.end}
                  onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                />
              </div>

              {/* Doctor Search */}
              <div className="filter-group">
                <label htmlFor="doctor-search">Doctor</label>
                <input
                  id="doctor-search"
                  type="text"
                  placeholder="Search by doctor name..."
                  value={doctorSearch}
                  onChange={(e) => setDoctorSearch(e.target.value)}
                />
              </div>

              {/* Filter Actions */}
              <div className="filter-actions">
                <button onClick={applyFilters} className="btn btn-primary btn-sm">
                  Apply
                </button>
                <button onClick={clearFilters} className="btn btn-secondary btn-sm">
                  Clear
                </button>
              </div>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="error-message">
              {error}
              <button onClick={fetchVisits} className="btn btn-link">Retry</button>
            </div>
          )}

          {/* Visits Table */}
          <div className="visits-list">
            {loading && <div className="loading-overlay"><LoadingSpinner /></div>}

            {visits.length > 0 ? (
              <>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Week</th>
                      <th>Doctor</th>
                      <th>Type</th>
                      <th>Status</th>
                      <th>Photos</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visits.map((visit) => (
                      <tr key={visit._id}>
                        <td>
                          <div className="date-cell">
                            <span className="date">{formatDate(visit.visitDate)}</span>
                            <span className="time">{formatTime(visit.visitDate)}</span>
                          </div>
                        </td>
                        <td>
                          <span className="week-label">{visit.weekLabel || '-'}</span>
                        </td>
                        <td>
                          <div className="doctor-cell">
                            <span className="doctor-name">{visit.doctor?.name || 'Unknown'}</span>
                            <span className="doctor-spec">{visit.doctor?.specialization || ''}</span>
                          </div>
                        </td>
                        <td className="visit-type">{visit.visitType || 'regular'}</td>
                        <td>
                          <span className={getStatusBadgeClass(visit.status)}>
                            {visit.status}
                          </span>
                        </td>
                        <td>
                          <span className="photo-count">
                            {visit.photos?.length || 0} photo{visit.photos?.length !== 1 ? 's' : ''}
                          </span>
                        </td>
                        <td>
                          <button
                            onClick={() => setSelectedVisit(visit)}
                            className="btn btn-link"
                          >
                            View Details
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Pagination */}
                <div className="pagination">
                  <button
                    onClick={() => changePage(-1)}
                    disabled={pagination.page === 1}
                    className="btn btn-secondary btn-sm"
                  >
                    Previous
                  </button>
                  <span className="pagination-info">
                    Page {pagination.page} of {pagination.pages} ({pagination.total} total)
                  </span>
                  <button
                    onClick={() => changePage(1)}
                    disabled={pagination.page >= pagination.pages}
                    className="btn btn-secondary btn-sm"
                  >
                    Next
                  </button>
                </div>
              </>
            ) : (
              <div className="no-data">
                <p>No visits found</p>
                <p className="hint">
                  {statusFilter !== 'all' || dateRange.start || dateRange.end || doctorSearch
                    ? 'Try adjusting your filters'
                    : 'Start logging visits from the Employee Dashboard'}
                </p>
              </div>
            )}
          </div>

          {/* Visit Details Modal */}
          {selectedVisit && (
            <div className="modal-overlay" onClick={() => setSelectedVisit(null)}>
              <div className="modal-content visit-detail-modal" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                  <h2>Visit Details</h2>
                  <button
                    onClick={() => setSelectedVisit(null)}
                    className="modal-close"
                  >
                    &times;
                  </button>
                </div>

                <div className="modal-body">
                  {/* Visit Info */}
                  <div className="visit-info-section">
                    <h3>Visit Information</h3>
                    <div className="info-grid">
                      <div className="info-item">
                        <label>Date & Time</label>
                        <span>{formatDate(selectedVisit.visitDate)} at {formatTime(selectedVisit.visitDate)}</span>
                      </div>
                      <div className="info-item">
                        <label>Week Label</label>
                        <span className="week-label">{selectedVisit.weekLabel || '-'}</span>
                      </div>
                      <div className="info-item">
                        <label>Visit Type</label>
                        <span>{selectedVisit.visitType || 'regular'}</span>
                      </div>
                      <div className="info-item">
                        <label>Status</label>
                        <span className={getStatusBadgeClass(selectedVisit.status)}>
                          {selectedVisit.status}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Doctor Info */}
                  <div className="visit-info-section">
                    <h3>Doctor</h3>
                    <div className="info-grid">
                      <div className="info-item">
                        <label>Name</label>
                        <span>{selectedVisit.doctor?.name || 'Unknown'}</span>
                      </div>
                      <div className="info-item">
                        <label>Specialization</label>
                        <span>{selectedVisit.doctor?.specialization || '-'}</span>
                      </div>
                      <div className="info-item">
                        <label>Hospital/Clinic</label>
                        <span>{selectedVisit.doctor?.hospital || '-'}</span>
                      </div>
                      <div className="info-item">
                        <label>Visit Frequency</label>
                        <span>{selectedVisit.doctor?.visitFrequency || 4}x per month</span>
                      </div>
                    </div>
                  </div>

                  {/* Visit Notes */}
                  <div className="visit-info-section">
                    <h3>Notes & Feedback</h3>
                    <div className="info-grid full-width">
                      <div className="info-item">
                        <label>Purpose</label>
                        <span>{selectedVisit.purpose || 'N/A'}</span>
                      </div>
                      <div className="info-item">
                        <label>Doctor Feedback</label>
                        <span>{selectedVisit.doctorFeedback || 'N/A'}</span>
                      </div>
                      <div className="info-item">
                        <label>Notes</label>
                        <span>{selectedVisit.notes || 'N/A'}</span>
                      </div>
                      {selectedVisit.nextVisitDate && (
                        <div className="info-item">
                          <label>Next Visit Date</label>
                          <span>{formatDate(selectedVisit.nextVisitDate)}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* GPS Location */}
                  <div className="visit-info-section">
                    <h3>Location</h3>
                    <div className="info-grid">
                      <div className="info-item">
                        <label>Coordinates</label>
                        <span>
                          {selectedVisit.location?.latitude?.toFixed(6) || '-'},
                          {selectedVisit.location?.longitude?.toFixed(6) || '-'}
                        </span>
                      </div>
                      <div className="info-item">
                        <label>Accuracy</label>
                        <span>{selectedVisit.location?.accuracy ? `${Math.round(selectedVisit.location.accuracy)}m` : '-'}</span>
                      </div>
                      {selectedVisit.location?.latitude && selectedVisit.location?.longitude && (
                        <div className="info-item">
                          <label>Map</label>
                          <a
                            href={`https://www.google.com/maps?q=${selectedVisit.location.latitude},${selectedVisit.location.longitude}`}
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

                  {/* Products Discussed */}
                  {selectedVisit.productsDiscussed?.length > 0 && (
                    <div className="visit-info-section">
                      <h3>Products Discussed</h3>
                      <ul className="products-list">
                        {selectedVisit.productsDiscussed.map((item, index) => (
                          <li key={index}>
                            <span className="product-name">{item.product?.name || 'Unknown Product'}</span>
                            {item.feedback && <span className="product-feedback"> - {item.feedback}</span>}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Photos */}
                  <div className="visit-info-section">
                    <h3>
                      Photos ({selectedVisit.photos?.length || 0})
                      {refreshingPhotos && <span className="refreshing-indicator"> Refreshing...</span>}
                    </h3>
                    {selectedVisit.photos?.length > 0 ? (
                      <div className="photo-grid">
                        {selectedVisit.photos.map((photo, index) => (
                          <div key={index} className="photo-item" onClick={() => openFullImage(photo.url)}>
                            <img
                              src={photo.url}
                              alt={`Visit photo ${index + 1}`}
                              onError={(e) => handleImageError(e, selectedVisit._id)}
                            />
                            <span className="photo-time">
                              {photo.capturedAt ? formatTime(photo.capturedAt) : ''}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="no-photos">No photos available</p>
                    )}
                  </div>
                </div>

                <div className="modal-footer">
                  <button
                    onClick={() => setSelectedVisit(null)}
                    className="btn btn-secondary"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Full Image Modal */}
          {fullImageUrl && (
            <div className="modal-overlay image-modal" onClick={closeFullImage}>
              <div className="full-image-container">
                <img src={fullImageUrl} alt="Full size" />
                <button className="modal-close" onClick={closeFullImage}>&times;</button>
              </div>
            </div>
          )}
        </main>
      </div>

      <style>{`
        .filters-section {
          background: white;
          padding: 1rem;
          border-radius: 8px;
          margin-bottom: 1rem;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }

        .filters-row {
          display: flex;
          flex-wrap: wrap;
          gap: 1rem;
          align-items: flex-end;
        }

        .filter-group {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }

        .filter-group label {
          font-size: 0.75rem;
          color: #666;
          font-weight: 500;
        }

        .filter-group select,
        .filter-group input {
          padding: 0.5rem;
          border: 1px solid #ddd;
          border-radius: 4px;
          font-size: 0.875rem;
          min-width: 150px;
        }

        .filter-actions {
          display: flex;
          gap: 0.5rem;
        }

        .btn-sm {
          padding: 0.5rem 1rem;
          font-size: 0.875rem;
        }

        .date-cell {
          display: flex;
          flex-direction: column;
        }

        .date-cell .date {
          font-weight: 500;
        }

        .date-cell .time {
          font-size: 0.75rem;
          color: #666;
        }

        .doctor-cell {
          display: flex;
          flex-direction: column;
        }

        .doctor-cell .doctor-name {
          font-weight: 500;
        }

        .doctor-cell .doctor-spec {
          font-size: 0.75rem;
          color: #666;
        }

        .week-label {
          background: #e3f2fd;
          color: #1976d2;
          padding: 0.25rem 0.5rem;
          border-radius: 4px;
          font-weight: 500;
          font-size: 0.875rem;
        }

        .status-badge {
          padding: 0.25rem 0.5rem;
          border-radius: 4px;
          font-size: 0.75rem;
          font-weight: 500;
          text-transform: capitalize;
        }

        .status-completed {
          background: #e8f5e9;
          color: #2e7d32;
        }

        .status-cancelled {
          background: #ffebee;
          color: #c62828;
        }

        .status-pending {
          background: #fff3e0;
          color: #ef6c00;
        }

        .photo-count {
          color: #666;
          font-size: 0.875rem;
        }

        .pagination {
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 1rem;
          padding: 1rem;
        }

        .pagination-info {
          color: #666;
          font-size: 0.875rem;
        }

        .no-data {
          text-align: center;
          padding: 3rem;
          color: #666;
        }

        .no-data .hint {
          font-size: 0.875rem;
          color: #999;
          margin-top: 0.5rem;
        }

        .loading-overlay {
          display: flex;
          justify-content: center;
          padding: 2rem;
        }

        /* Modal Styles */
        .modal-overlay {
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

        .modal-content {
          background: white;
          border-radius: 8px;
          max-width: 800px;
          width: 100%;
          max-height: 90vh;
          overflow-y: auto;
        }

        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1rem 1.5rem;
          border-bottom: 1px solid #eee;
        }

        .modal-header h2 {
          margin: 0;
          font-size: 1.25rem;
        }

        .modal-close {
          background: none;
          border: none;
          font-size: 1.5rem;
          cursor: pointer;
          color: #666;
        }

        .modal-body {
          padding: 1.5rem;
        }

        .modal-footer {
          padding: 1rem 1.5rem;
          border-top: 1px solid #eee;
          display: flex;
          justify-content: flex-end;
        }

        .visit-info-section {
          margin-bottom: 1.5rem;
        }

        .visit-info-section h3 {
          font-size: 1rem;
          color: #333;
          margin-bottom: 0.75rem;
          padding-bottom: 0.5rem;
          border-bottom: 1px solid #eee;
        }

        .info-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 1rem;
        }

        .info-grid.full-width .info-item {
          grid-column: span 2;
        }

        .info-item {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }

        .info-item label {
          font-size: 0.75rem;
          color: #666;
          font-weight: 500;
        }

        .info-item span {
          font-size: 0.875rem;
        }

        .products-list {
          list-style: none;
          padding: 0;
          margin: 0;
        }

        .products-list li {
          padding: 0.5rem 0;
          border-bottom: 1px solid #eee;
        }

        .products-list li:last-child {
          border-bottom: none;
        }

        .product-name {
          font-weight: 500;
        }

        .product-feedback {
          color: #666;
          font-size: 0.875rem;
        }

        .photo-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
          gap: 1rem;
        }

        .photo-item {
          position: relative;
          cursor: pointer;
          border-radius: 8px;
          overflow: hidden;
        }

        .photo-item img {
          width: 100%;
          height: 150px;
          object-fit: cover;
        }

        .photo-item:hover {
          opacity: 0.9;
        }

        .photo-time {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          background: rgba(0,0,0,0.6);
          color: white;
          font-size: 0.75rem;
          padding: 0.25rem;
          text-align: center;
        }

        .no-photos {
          color: #999;
          font-style: italic;
        }

        .refreshing-indicator {
          font-size: 0.75rem;
          color: #1976d2;
          font-weight: normal;
          margin-left: 0.5rem;
        }

        .image-modal .full-image-container {
          position: relative;
          max-width: 90vw;
          max-height: 90vh;
        }

        .image-modal img {
          max-width: 100%;
          max-height: 90vh;
          object-fit: contain;
        }

        .image-modal .modal-close {
          position: absolute;
          top: -40px;
          right: 0;
          color: white;
          font-size: 2rem;
        }

        @media (max-width: 768px) {
          .filters-row {
            flex-direction: column;
          }

          .filter-group {
            width: 100%;
          }

          .filter-group select,
          .filter-group input {
            width: 100%;
          }

          .info-grid {
            grid-template-columns: 1fr;
          }

          .info-grid.full-width .info-item {
            grid-column: span 1;
          }

          .photo-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }
      `}</style>
    </div>
  );
};

export default MyVisits;
