/**
 * BDMVisitsPage
 *
 * Admin page to view a specific BDM's visit history:
 * - Fetches BDM info and their visits
 * - Filters: status, client type, engagement type, date range
 * - Visit table with pagination
 * - VisitDetailModal for full details
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import EngagementTypeSelector from '../../components/employee/EngagementTypeSelector';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import VisitDetailModal from '../../components/common/VisitDetailModal';
import visitService from '../../services/visitService';
import clientService from '../../services/clientService';
import userService from '../../services/userService';
import toast from 'react-hot-toast';

const BDMVisitsPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  // BDM info
  const [bdm, setBdm] = useState(null);
  const [bdmLoading, setBdmLoading] = useState(true);

  // Visits data
  const [visits, setVisits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState('all');
  const [visitTypeFilter, setVisitTypeFilter] = useState('all');
  const [engagementTypeFilter, setEngagementTypeFilter] = useState([]);
  const [dateRange, setDateRange] = useState({ start: '', end: '' });

  // Pagination
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 15,
    total: 0,
    pages: 0,
  });

  // Modal state
  const [selectedVisit, setSelectedVisit] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // AbortController for cancellation
  const abortControllerRef = useRef(null);

  // Fetch BDM info
  useEffect(() => {
    const fetchBDM = async () => {
      try {
        setBdmLoading(true);
        const response = await userService.getById(id);
        setBdm(response.data);
      } catch (err) {
        console.error('Failed to fetch BDM info:', err);
        toast.error('Failed to load BDM information');
        navigate('/admin/employees');
      } finally {
        setBdmLoading(false);
      }
    };
    fetchBDM();
  }, [id, navigate]);

  // Fetch visits
  const fetchVisits = useCallback(async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setLoading(true);
    setError(null);

    try {
      const params = {
        userId: id,
        page: pagination.page,
        limit: pagination.limit,
      };

      if (statusFilter !== 'all') {
        params.status = statusFilter;
      }
      if (dateRange.start) {
        params.dateFrom = dateRange.start;
      }
      if (dateRange.end) {
        params.dateTo = dateRange.end;
      }
      if (engagementTypeFilter.length > 0) {
        params.engagementTypes = engagementTypeFilter.join(',');
      }

      // Fetch VIP visits
      let vipVisits = [];
      if (visitTypeFilter !== 'regular') {
        const response = await visitService.getAll(params);
        vipVisits = (response.data || []).map(v => ({ ...v, _visitType: 'vip' }));
        setPagination(prev => ({
          ...prev,
          total: response.pagination?.total || 0,
          pages: response.pagination?.pages || 1,
        }));
      }

      // Fetch regular client visits
      let regularVisits = [];
      if (visitTypeFilter !== 'vip') {
        try {
          const regularParams = {};
          if (statusFilter !== 'all') regularParams.status = statusFilter;
          if (dateRange.start) regularParams.dateFrom = dateRange.start;
          if (dateRange.end) regularParams.dateTo = dateRange.end;
          if (engagementTypeFilter.length > 0) {
            regularParams.engagementTypes = engagementTypeFilter.join(',');
          }
          const regularResponse = await clientService.getVisitsByUser(id, {
            page: pagination.page,
            limit: pagination.limit,
            ...regularParams,
          });
          regularVisits = (regularResponse.data || []).map(v => ({
            ...v,
            _visitType: 'regular',
            doctor: v.client ? {
              firstName: v.client.firstName,
              lastName: v.client.lastName,
              fullName: `${v.client.firstName || ''} ${v.client.lastName || ''}`.trim(),
              specialization: v.client.specialization,
              clinicOfficeAddress: v.client.clinicOfficeAddress,
            } : null,
          }));

          if (visitTypeFilter === 'regular') {
            setPagination(prev => ({
              ...prev,
              total: regularResponse.pagination?.total || 0,
              pages: regularResponse.pagination?.pages || 1,
            }));
          }
        } catch {
          // Silent fail for regular visits
        }
      }

      // Merge and sort
      let merged;
      if (visitTypeFilter === 'vip') {
        merged = vipVisits;
      } else if (visitTypeFilter === 'regular') {
        merged = regularVisits;
      } else {
        merged = [...vipVisits, ...regularVisits].sort(
          (a, b) => new Date(b.visitDate) - new Date(a.visitDate)
        );
      }

      setVisits(merged);
    } catch (err) {
      if (err.name === 'AbortError' || err.name === 'CanceledError') return;
      setError('Failed to load visits. Please try again.');
      toast.error('Failed to load visits');
    } finally {
      setLoading(false);
    }
  }, [id, pagination.page, pagination.limit, statusFilter, dateRange, visitTypeFilter, engagementTypeFilter]);

  useEffect(() => {
    fetchVisits();
  }, [fetchVisits]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // View visit details — fetch full visit with populated products
  const handleViewDetails = async (visit) => {
    setDetailLoading(true);
    try {
      // Use correct service based on visit type
      const response = visit._visitType === 'regular'
        ? await clientService.getVisitById(visit._id)
        : await visitService.getById(visit._id);
      // Preserve _visitType so VisitDetailModal uses the correct refresh endpoint
      setSelectedVisit({ ...response.data, _visitType: visit._visitType });
    } catch (err) {
      console.error('Failed to fetch visit details:', err);
      toast.error('Failed to load visit details');
    } finally {
      setDetailLoading(false);
    }
  };

  // Helpers
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

  const getStatusBadgeClass = (status) => {
    switch (status) {
      case 'completed': return 'bvp-status bvp-status-completed';
      case 'cancelled': return 'bvp-status bvp-status-cancelled';
      default: return 'bvp-status';
    }
  };

  const changePage = (delta) => {
    setPagination(prev => ({
      ...prev,
      page: Math.max(1, Math.min(prev.pages, prev.page + delta)),
    }));
  };

  const clearFilters = () => {
    setStatusFilter('all');
    setVisitTypeFilter('all');
    setEngagementTypeFilter([]);
    setDateRange({ start: '', end: '' });
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  if (bdmLoading) {
    return <LoadingSpinner fullScreen />;
  }

  return (
    <div className="dashboard-layout">
      <style>{pageStyles}</style>
      <Navbar />
      <div className="dashboard-content">
        <Sidebar />
        <main className="main-content">
          {/* Page Header */}
          <div className="bvp-header">
            <div className="bvp-header-left">
              <button onClick={() => navigate('/admin/employees')} className="bvp-back-btn">
                &larr; Back
              </button>
              <h1>{bdm?.name ? `${bdm.name}'s Visits` : 'BDM Visits'}</h1>
            </div>
          </div>

          {/* Filters */}
          <div className="bvp-filters">
            <div className="bvp-filters-row">
              <div className="bvp-filter-group">
                <label htmlFor="bvp-status">Status</label>
                <select
                  id="bvp-status"
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

              <div className="bvp-filter-group">
                <label htmlFor="bvp-visit-type">Client Type</label>
                <select
                  id="bvp-visit-type"
                  value={visitTypeFilter}
                  onChange={(e) => {
                    setVisitTypeFilter(e.target.value);
                    setPagination(prev => ({ ...prev, page: 1 }));
                  }}
                >
                  <option value="all">All Client Types</option>
                  <option value="vip">VIP Clients</option>
                  <option value="regular">Regular Clients</option>
                </select>
              </div>

              <div className="bvp-filter-group bvp-filter-group-wide">
                <label>Engagement Type</label>
                <EngagementTypeSelector
                  selected={engagementTypeFilter}
                  onChange={(types) => {
                    setEngagementTypeFilter(types);
                    setPagination(prev => ({ ...prev, page: 1 }));
                  }}
                />
              </div>

              <div className="bvp-filter-group">
                <label htmlFor="bvp-date-from">From</label>
                <input
                  id="bvp-date-from"
                  type="date"
                  value={dateRange.start}
                  onChange={(e) => {
                    setDateRange(prev => ({ ...prev, start: e.target.value }));
                    setPagination(prev => ({ ...prev, page: 1 }));
                  }}
                />
              </div>

              <div className="bvp-filter-group">
                <label htmlFor="bvp-date-to">To</label>
                <input
                  id="bvp-date-to"
                  type="date"
                  value={dateRange.end}
                  onChange={(e) => {
                    setDateRange(prev => ({ ...prev, end: e.target.value }));
                    setPagination(prev => ({ ...prev, page: 1 }));
                  }}
                />
              </div>

              <div className="bvp-filter-actions">
                <button onClick={clearFilters} className="btn btn-secondary btn-sm">
                  Clear
                </button>
              </div>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="bvp-error">
              {error}
              <button onClick={fetchVisits} className="btn btn-link">Retry</button>
            </div>
          )}

          {/* Visits Table */}
          <div className="bvp-table-wrap">
            {loading && <div className="bvp-loading-overlay"><LoadingSpinner /></div>}

            {visits.length > 0 ? (
              <>
                <table className="bvp-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Week</th>
                      <th>Client</th>
                      <th>Type</th>
                      <th>Status</th>
                      <th>Photos</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visits.map((visit) => {
                      const doctorName = visit.doctor?.fullName
                        || `${visit.doctor?.firstName || ''} ${visit.doctor?.lastName || ''}`.trim()
                        || 'Unknown';
                      const spec = visit.doctor?.specialization || '';

                      return (
                        <tr key={visit._id}>
                          <td>
                            <div className="bvp-date-cell">
                              <span className="bvp-date">{formatDate(visit.visitDate)}</span>
                              <span className="bvp-time">{formatTime(visit.visitDate)}</span>
                            </div>
                          </td>
                          <td>
                            <span className="bvp-week-label">{visit.weekLabel || '-'}</span>
                          </td>
                          <td>
                            <div className="bvp-doctor-cell">
                              <span className="bvp-doctor-name">{doctorName}</span>
                              <span className="bvp-doctor-spec">{spec}</span>
                            </div>
                          </td>
                          <td>
                            <span className={`bvp-type-badge ${visit._visitType === 'regular' ? 'bvp-type-regular' : 'bvp-type-vip'}`}>
                              {visit._visitType === 'regular' ? 'Regular' : 'VIP'}
                            </span>
                          </td>
                          <td>
                            <span className={getStatusBadgeClass(visit.status)}>
                              {visit.status}
                            </span>
                          </td>
                          <td>
                            <span className="bvp-photo-count">
                              {visit.photos?.length || 0}
                            </span>
                          </td>
                          <td>
                            <button
                              onClick={() => handleViewDetails(visit)}
                              className="btn btn-link"
                              disabled={detailLoading}
                            >
                              View Details
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {/* Mobile Card View */}
                <div className="bvp-mobile-cards">
                  {visits.map((visit) => {
                    const doctorName = visit.doctor?.fullName
                      || `${visit.doctor?.firstName || ''} ${visit.doctor?.lastName || ''}`.trim()
                      || 'Unknown';
                    const spec = visit.doctor?.specialization || '';

                    return (
                      <div key={visit._id} className="bvp-card">
                        <div className="bvp-card-top">
                          <div>
                            <div className="bvp-card-doctor">{doctorName}</div>
                            {spec && <div className="bvp-card-spec">{spec}</div>}
                          </div>
                          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                            <span className={`bvp-type-badge ${visit._visitType === 'regular' ? 'bvp-type-regular' : 'bvp-type-vip'}`}>
                              {visit._visitType === 'regular' ? 'Regular' : 'VIP'}
                            </span>
                            <span className={getStatusBadgeClass(visit.status)}>
                              {visit.status}
                            </span>
                          </div>
                        </div>
                        <div className="bvp-card-meta">
                          <div className="bvp-card-row">
                            <span>Date</span>
                            <span>{formatDate(visit.visitDate)} {formatTime(visit.visitDate)}</span>
                          </div>
                          <div className="bvp-card-row">
                            <span>Week</span>
                            <span>{visit.weekLabel || '-'}</span>
                          </div>
                          <div className="bvp-card-row">
                            <span>Photos</span>
                            <span>{visit.photos?.length || 0}</span>
                          </div>
                        </div>
                        <button
                          onClick={() => handleViewDetails(visit)}
                          className="btn btn-primary btn-sm bvp-card-btn"
                          disabled={detailLoading}
                        >
                          View Details
                        </button>
                      </div>
                    );
                  })}
                </div>

                {/* Pagination */}
                <div className="bvp-pagination">
                  <button
                    onClick={() => changePage(-1)}
                    disabled={pagination.page === 1}
                    className="btn btn-secondary btn-sm"
                  >
                    Previous
                  </button>
                  <span className="bvp-pagination-info">
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
            ) : !loading ? (
              <div className="bvp-empty">
                <p>No visits found</p>
                <p className="bvp-empty-hint">
                  {statusFilter !== 'all' || engagementTypeFilter.length > 0 || dateRange.start || dateRange.end
                    ? 'Try adjusting your filters'
                    : 'This BDM has not logged any visits yet'}
                </p>
              </div>
            ) : null}
          </div>

          {/* Visit Detail Modal */}
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
    </div>
  );
};

const pageStyles = `
  .bvp-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1.5rem;
  }

  .bvp-header-left {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .bvp-header-left h1 {
    margin: 0;
    font-size: 1.5rem;
    color: #1f2937;
  }

  .bvp-back-btn {
    background: #f3f4f6;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    padding: 8px 14px;
    font-size: 14px;
    cursor: pointer;
    color: #374151;
    transition: background 0.2s;
  }

  .bvp-back-btn:hover {
    background: #e5e7eb;
  }

  .bvp-filters {
    background: white;
    padding: 1rem;
    border-radius: 8px;
    margin-bottom: 1rem;
    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
  }

  .bvp-filters-row {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
    align-items: flex-end;
  }

  .bvp-filter-group {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .bvp-filter-group-wide {
    flex: 1 1 100%;
  }

  .bvp-filter-group label {
    font-size: 0.75rem;
    color: #666;
    font-weight: 500;
  }

  .bvp-filter-group-wide .engagement-selector {
    width: 100%;
  }

  .bvp-filter-group select,
  .bvp-filter-group input {
    padding: 0.5rem;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-size: 0.875rem;
    min-width: 150px;
  }

  .bvp-filter-actions {
    display: flex;
    gap: 0.5rem;
  }

  .bvp-error {
    background: #fee2e2;
    color: #dc2626;
    padding: 12px 16px;
    border-radius: 8px;
    margin-bottom: 1rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .bvp-table-wrap {
    position: relative;
  }

  .bvp-loading-overlay {
    display: flex;
    justify-content: center;
    padding: 2rem;
  }

  .bvp-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 14px;
    background: white;
    border-radius: 8px;
    overflow: hidden;
    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
  }

  .bvp-table th,
  .bvp-table td {
    padding: 12px;
    text-align: left;
    border-bottom: 1px solid #e5e7eb;
  }

  .bvp-table th {
    background: #f9fafb;
    font-weight: 600;
    color: #374151;
  }

  .bvp-table tr:hover {
    background: #f9fafb;
  }

  .bvp-date-cell {
    display: flex;
    flex-direction: column;
  }

  .bvp-date {
    font-weight: 500;
  }

  .bvp-time {
    font-size: 0.75rem;
    color: #666;
  }

  .bvp-week-label {
    background: #e3f2fd;
    color: #1976d2;
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    font-weight: 500;
    font-size: 0.875rem;
  }

  .bvp-doctor-cell {
    display: flex;
    flex-direction: column;
  }

  .bvp-doctor-name {
    font-weight: 500;
  }

  .bvp-doctor-spec {
    font-size: 0.75rem;
    color: #666;
  }

  .bvp-status {
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    font-size: 0.75rem;
    font-weight: 500;
    text-transform: capitalize;
    display: inline-block;
  }

  .bvp-status-completed {
    background: #e8f5e9;
    color: #2e7d32;
  }

  .bvp-status-cancelled {
    background: #ffebee;
    color: #c62828;
  }

  .bvp-type-badge {
    padding: 3px 10px;
    border-radius: 4px;
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    display: inline-block;
  }

  .bvp-type-vip {
    background: #fef3c7;
    color: #d97706;
  }

  .bvp-type-regular {
    background: #dbeafe;
    color: #2563eb;
  }

  .bvp-photo-count {
    color: #666;
    font-size: 0.875rem;
  }

  .bvp-pagination {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 1rem;
    padding: 1rem;
  }

  .bvp-pagination-info {
    color: #666;
    font-size: 0.875rem;
  }

  .bvp-empty {
    text-align: center;
    padding: 3rem;
    color: #666;
    background: white;
    border-radius: 8px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
  }

  .bvp-empty-hint {
    font-size: 0.875rem;
    color: #999;
    margin-top: 0.5rem;
  }

  /* Mobile cards — hidden on desktop */
  .bvp-mobile-cards {
    display: none;
  }

  .bvp-card {
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 10px;
    padding: 14px;
    margin-bottom: 10px;
  }

  .bvp-card-top {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 10px;
  }

  .bvp-card-doctor {
    font-weight: 600;
    font-size: 15px;
    color: #1f2937;
  }

  .bvp-card-spec {
    font-size: 12px;
    color: #6b7280;
  }

  .bvp-card-meta {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 12px;
  }

  .bvp-card-row {
    display: flex;
    justify-content: space-between;
    font-size: 13px;
    color: #6b7280;
  }

  .bvp-card-row span:last-child {
    color: #374151;
    font-weight: 500;
  }

  .bvp-card-btn {
    width: 100%;
    min-height: 44px;
  }

  /* ===== DARK MODE ===== */
  body.dark-mode .bvp-header-left h1 {
    color: #f1f5f9;
  }

  body.dark-mode .bvp-back-btn {
    background: #0f172a;
    border-color: #1e293b;
    color: #e2e8f0;
  }

  body.dark-mode .bvp-back-btn:hover {
    background: #1e293b;
  }

  body.dark-mode .bvp-filters,
  body.dark-mode .bvp-table,
  body.dark-mode .bvp-empty,
  body.dark-mode .bvp-card {
    background: #0f172a;
    box-shadow: none;
  }

  body.dark-mode .bvp-filters {
    border: 1px solid #1e293b;
  }

  body.dark-mode .bvp-filter-group label {
    color: #94a3b8;
  }

  body.dark-mode .bvp-filter-group select,
  body.dark-mode .bvp-filter-group input {
    background: #0b1220;
    border-color: #1e293b;
    color: #e2e8f0;
  }

  body.dark-mode .bvp-table th {
    background: #0b1220;
    color: #94a3b8;
    border-bottom-color: #1e293b;
  }

  body.dark-mode .bvp-table td {
    color: #e2e8f0;
    border-bottom-color: #1e293b;
  }

  body.dark-mode .bvp-table tr:hover {
    background: #1e293b;
  }

  body.dark-mode .bvp-time,
  body.dark-mode .bvp-doctor-spec,
  body.dark-mode .bvp-photo-count,
  body.dark-mode .bvp-pagination-info,
  body.dark-mode .bvp-empty,
  body.dark-mode .bvp-empty-hint {
    color: #94a3b8;
  }

  body.dark-mode .bvp-card-doctor {
    color: #f1f5f9;
  }

  body.dark-mode .bvp-card-row {
    color: #94a3b8;
  }

  body.dark-mode .bvp-card-row span:last-child {
    color: #e2e8f0;
  }

  /* Responsive */
  @media (max-width: 768px) {
    .bvp-filters-row {
      flex-direction: column;
    }

    .bvp-filter-group {
      width: 100%;
    }

    .bvp-filter-group select,
    .bvp-filter-group input {
      width: 100%;
      min-width: unset;
    }
  }

  @media (max-width: 480px) {
    .bvp-header-left {
      flex-direction: column;
      align-items: flex-start;
      gap: 8px;
    }

    .bvp-header-left h1 {
      font-size: 1.2rem;
    }

    .bvp-table {
      display: none;
    }

    .bvp-mobile-cards {
      display: block;
    }

    .bvp-filter-actions {
      width: 100%;
    }

    .bvp-filter-actions .btn {
      flex: 1;
      min-height: 44px;
    }

    .bvp-pagination .btn {
      min-height: 44px;
    }
  }
`;

export default BDMVisitsPage;
