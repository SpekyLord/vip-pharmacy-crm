/**
 * MyVisits Page
 *
 * Employee's visit history with:
 * - Visit list with filters (status, date range, doctor)
 * - Visit details modal with photos
 * - Week labels (W1D2, W2D3 format)
 * - Pagination
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import VisitDetailModal from '../../components/common/VisitDetailModal';
import visitService from '../../services/visitService';
import clientService from '../../services/clientService';
import useDebounce from '../../hooks/useDebounce';
import toast from 'react-hot-toast';

const MyVisits = () => {
  const navigate = useNavigate();

  // Data state
  const [visits, setVisits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Category tab state
  const [visitCategory, setVisitCategory] = useState('all'); // 'all' | 'vip' | 'extra'

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

  // Debounce search input to avoid excessive API calls
  const debouncedSearch = useDebounce(doctorSearch, 400);

  // AbortController ref for request cancellation
  const abortControllerRef = useRef(null);

  // Fetch visits based on category tab
  const fetchVisits = useCallback(async () => {
    // Cancel any previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Create new AbortController for this request
    abortControllerRef.current = new AbortController();

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
        params.dateFrom = dateRange.start;
      }
      if (dateRange.end) {
        params.endDate = dateRange.end;
        params.dateTo = dateRange.end;
      }
      if (debouncedSearch.trim()) {
        params.search = debouncedSearch.trim();
      }

      const signal = abortControllerRef.current.signal;

      if (visitCategory === 'vip') {
        // VIP visits only
        const response = await visitService.getMy(params, { signal });
        const vipVisits = (response.data || []).map(v => ({ ...v, _visitCategory: 'vip' }));
        setVisits(vipVisits);
        setPagination(prev => ({
          ...prev,
          total: response.pagination?.total || 0,
          pages: response.pagination?.pages || 1,
        }));
      } else if (visitCategory === 'extra') {
        // Extra calls only
        const response = await clientService.getMyVisits(params, { signal });
        const extraVisits = (response.data || []).map(v => ({ ...v, _visitCategory: 'extra' }));
        setVisits(extraVisits);
        setPagination(prev => ({
          ...prev,
          total: response.pagination?.total || 0,
          pages: response.pagination?.pages || 1,
        }));
      } else {
        // All visits — fetch from both sources in parallel
        const [vipRes, extraRes] = await Promise.allSettled([
          visitService.getMy(params, { signal }),
          clientService.getMyVisits(params, { signal }),
        ]);

        const vipVisits = vipRes.status === 'fulfilled'
          ? (vipRes.value.data || []).map(v => ({ ...v, _visitCategory: 'vip' }))
          : [];
        const extraVisits = extraRes.status === 'fulfilled'
          ? (extraRes.value.data || []).map(v => ({ ...v, _visitCategory: 'extra' }))
          : [];

        // Merge and sort by visitDate descending
        const merged = [...vipVisits, ...extraVisits].sort(
          (a, b) => new Date(b.visitDate) - new Date(a.visitDate)
        );

        const vipTotal = vipRes.status === 'fulfilled' ? (vipRes.value.pagination?.total || 0) : 0;
        const extraTotal = extraRes.status === 'fulfilled' ? (extraRes.value.pagination?.total || 0) : 0;

        setVisits(merged);
        setPagination(prev => ({
          ...prev,
          total: vipTotal + extraTotal,
          pages: Math.ceil((vipTotal + extraTotal) / prev.limit),
        }));
      }
    } catch (err) {
      // Ignore abort errors
      if (err.name === 'AbortError' || err.name === 'CanceledError') {
        return;
      }
      setError('Failed to load visits. Please try again.');
      toast.error('Failed to load visits');
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit, statusFilter, dateRange, debouncedSearch, visitCategory]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

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
    setVisitCategory('all');
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
              onClick={() => navigate('/bdm')}
              className="btn btn-primary"
              title="Go to dashboard to select a doctor"
            >
              + New Visit
            </button>
          </div>

          {/* Category Tabs */}
          <div className="category-tabs">
            {[
              { key: 'all', label: 'All Visits' },
              { key: 'vip', label: 'VIP Visits' },
              { key: 'extra', label: 'Extra Calls' },
            ].map((tab) => (
              <button
                key={tab.key}
                className={`category-tab ${visitCategory === tab.key ? 'active' : ''}`}
                onClick={() => {
                  setVisitCategory(tab.key);
                  setPagination(prev => ({ ...prev, page: 1 }));
                }}
              >
                {tab.label}
              </button>
            ))}
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

              {/* Client Search */}
              <div className="filter-group">
                <label htmlFor="doctor-search">
                  {visitCategory === 'extra' ? 'Client' : visitCategory === 'vip' ? 'VIP Client' : 'Client Name'}
                </label>
                <input
                  id="doctor-search"
                  type="text"
                  placeholder={visitCategory === 'extra' ? 'Search by client name...' : 'Search by VIP Client name...'}
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
                      <th>Type</th>
                      <th>Week</th>
                      <th>Client</th>
                      <th>Status</th>
                      <th>Photos</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visits.map((visit) => {
                      const isExtra = visit._visitCategory === 'extra';
                      const clientName = isExtra
                        ? (visit.client?.fullName || `${visit.client?.firstName || ''} ${visit.client?.lastName || ''}`.trim() || 'Unknown')
                        : (visit.doctor?.fullName || visit.doctor?.name || `${visit.doctor?.firstName || ''} ${visit.doctor?.lastName || ''}`.trim() || 'Unknown');
                      const clientSpec = isExtra
                        ? (visit.client?.specialization || '')
                        : (visit.doctor?.specialization || '');

                      return (
                        <tr key={`${visit._visitCategory}-${visit._id}`}>
                          <td>
                            <div className="date-cell">
                              <span className="date">{formatDate(visit.visitDate)}</span>
                              <span className="time">{formatTime(visit.visitDate)}</span>
                            </div>
                          </td>
                          <td>
                            <span className={`visit-type-badge ${isExtra ? 'type-extra' : 'type-vip'}`}>
                              {isExtra ? 'Extra' : 'VIP'}
                            </span>
                          </td>
                          <td>
                            <span className="week-label">{visit.weekLabel || '-'}</span>
                          </td>
                          <td>
                            <div className="doctor-cell">
                              <span className="doctor-name">{clientName}</span>
                              <span className="doctor-spec">{clientSpec}</span>
                            </div>
                          </td>
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
                      );
                    })}
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
                  {statusFilter !== 'all' || dateRange.start || dateRange.end || doctorSearch || visitCategory !== 'all'
                    ? 'Try adjusting your filters or category'
                    : 'Start logging visits from the BDM Dashboard'}
                </p>
              </div>
            )}
          </div>

          {/* Visit Details Modal */}
          <VisitDetailModal
            visit={selectedVisit}
            onClose={() => setSelectedVisit(null)}
            onPhotosRefreshed={(visitId, newPhotos) => {
              setSelectedVisit(prev => prev ? { ...prev, photos: newPhotos } : prev);
              setVisits(prev => prev.map(v =>
                v._id === visitId ? { ...v, photos: newPhotos } : v
              ));
            }}
          />
        </main>
      </div>

      <style>{`
        .category-tabs {
          display: flex;
          gap: 0;
          margin-bottom: 1rem;
          background: white;
          border-radius: 8px;
          overflow: hidden;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }

        .category-tab {
          flex: 1;
          padding: 0.75rem 1rem;
          border: none;
          background: white;
          font-size: 0.875rem;
          font-weight: 500;
          color: #6b7280;
          cursor: pointer;
          transition: all 0.2s;
          border-bottom: 2px solid transparent;
        }

        .category-tab:hover {
          background: #f9fafb;
          color: #374151;
        }

        .category-tab.active {
          color: #2563eb;
          border-bottom-color: #2563eb;
          background: #eff6ff;
        }

        .visit-type-badge {
          display: inline-block;
          padding: 0.2rem 0.5rem;
          border-radius: 4px;
          font-size: 0.75rem;
          font-weight: 600;
          text-transform: uppercase;
        }

        .type-vip {
          background: #dbeafe;
          color: #1d4ed8;
        }

        .type-extra {
          background: #ede9fe;
          color: #7c3aed;
        }

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

        /* Modal responsive overrides */
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
        }

        @media (max-width: 480px) {
          .main-content {
            padding: 16px;
            padding-bottom: 80px;
          }

          .page-header {
            flex-direction: column;
            align-items: flex-start;
            gap: 12px;
          }

          .page-header h1 {
            font-size: 22px;
          }

          .page-header .btn {
            width: 100%;
            text-align: center;
            min-height: 44px;
          }

          .category-tab {
            padding: 0.6rem 0.5rem;
            font-size: 0.8rem;
          }

          .filter-group select,
          .filter-group input {
            min-width: unset;
            min-height: 44px;
          }

          .filter-actions {
            width: 100%;
          }

          .filter-actions .btn {
            flex: 1;
            min-height: 44px;
          }

          .visits-list {
            overflow-x: hidden;
          }

          /* Hide Type, Week, and Photos columns on mobile */
          .data-table th:nth-child(2),
          .data-table td:nth-child(2),
          .data-table th:nth-child(3),
          .data-table td:nth-child(3),
          .data-table th:nth-child(6),
          .data-table td:nth-child(6) {
            display: none;
          }

          .data-table {
            table-layout: fixed;
            width: 100%;
          }

          .data-table th,
          .data-table td {
            padding: 8px 4px;
            font-size: 12px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }

          .data-table .btn-link {
            font-size: 12px;
            padding: 4px 0;
          }

          .modal-overlay {
            padding: 0;
          }

          .modal-content {
            max-width: 100%;
            max-height: 100vh;
            border-radius: 0;
            height: 100vh;
          }

          .pagination .btn {
            min-height: 44px;
          }
        }
      `}</style>
    </div>
  );
};

export default MyVisits;
