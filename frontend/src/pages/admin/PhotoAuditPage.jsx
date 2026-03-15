/**
 * PhotoAuditPage
 *
 * Admin page to review visits with flagged photos:
 * - Date mismatch: Photo was taken on a different day than the visit
 * - Duplicate photo: Same photo hash used in multiple visits
 */

import { useState, useEffect, useCallback } from 'react';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import Pagination from '../../components/common/Pagination';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import visitService from '../../services/visitService';
import userService from '../../services/userService';
import { Camera, AlertTriangle, Clock, Copy, User, Calendar, Filter, X } from 'lucide-react';

const pageStyles = `
  .dashboard-layout {
    min-height: 100vh;
    background: #f3f4f6;
  }

  .dashboard-content {
    display: flex;
  }

  .main-content {
    flex: 1;
    padding: 24px;
    max-width: 1400px;
    margin: 0 auto;
  }

  .page-header {
    margin-bottom: 24px;
  }

  .page-header h1 {
    margin: 0 0 8px 0;
    font-size: 28px;
    color: #1f2937;
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .page-header p {
    color: #6b7280;
    margin: 0;
  }

  .summary-cards {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 16px;
    margin-bottom: 24px;
  }

  .summary-card {
    background: white;
    border-radius: 12px;
    padding: 20px;
    border: 1px solid #e5e7eb;
  }

  .summary-card h3 {
    font-size: 14px;
    color: #6b7280;
    margin: 0 0 8px 0;
    font-weight: 500;
  }

  .summary-card .value {
    font-size: 32px;
    font-weight: 700;
    color: #1f2937;
  }

  .summary-card.warning .value {
    color: #d97706;
  }

  .summary-card.danger .value {
    color: #dc2626;
  }

  .filters-section {
    background: white;
    border-radius: 12px;
    padding: 20px;
    margin-bottom: 24px;
    border: 1px solid #e5e7eb;
  }

  .filters-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 16px;
    font-weight: 600;
    color: #374151;
  }

  .filters-row {
    display: flex;
    gap: 16px;
    flex-wrap: wrap;
  }

  .filter-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 180px;
  }

  .filter-group label {
    font-size: 13px;
    color: #6b7280;
    font-weight: 500;
  }

  .filter-group select,
  .filter-group input {
    padding: 8px 12px;
    border: 1px solid #d1d5db;
    border-radius: 8px;
    font-size: 14px;
  }

  .filter-group select:focus,
  .filter-group input:focus {
    outline: none;
    border-color: #8b5cf6;
    box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.1);
  }

  .clear-filters-btn {
    align-self: flex-end;
    padding: 8px 16px;
    background: #f3f4f6;
    border: 1px solid #d1d5db;
    border-radius: 8px;
    font-size: 14px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .clear-filters-btn:hover {
    background: #e5e7eb;
  }

  .issues-list {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .issue-card {
    background: white;
    border-radius: 12px;
    border: 1px solid #e5e7eb;
    overflow: hidden;
  }

  .issue-header {
    padding: 16px 20px;
    border-bottom: 1px solid #e5e7eb;
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 12px;
  }

  .issue-meta {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .issue-title {
    font-weight: 600;
    color: #1f2937;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .issue-subtitle {
    font-size: 13px;
    color: #6b7280;
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .issue-subtitle span {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .flag-badges {
    display: flex;
    gap: 8px;
  }

  .flag-badge {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border-radius: 20px;
    font-size: 13px;
    font-weight: 500;
  }

  .flag-badge.date-mismatch {
    background: #fef3c7;
    color: #92400e;
  }

  .flag-badge.duplicate-photo {
    background: #fee2e2;
    color: #991b1b;
  }

  .type-badge {
    padding: 4px 10px;
    border-radius: 12px;
    font-size: 12px;
    font-weight: 500;
    text-transform: uppercase;
  }

  .type-badge.vip {
    background: #dbeafe;
    color: #1e40af;
  }

  .type-badge.regular {
    background: #e0e7ff;
    color: #3730a3;
  }

  .issue-body {
    padding: 16px 20px;
  }

  .photos-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 12px;
  }

  .photo-item {
    position: relative;
    border-radius: 8px;
    overflow: hidden;
    border: 2px solid #e5e7eb;
  }

  .photo-item.flagged {
    border-color: #fcd34d;
  }

  .photo-item img {
    width: 100%;
    height: 120px;
    object-fit: cover;
    display: block;
  }

  .photo-overlay {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    background: linear-gradient(transparent, rgba(0,0,0,0.8));
    padding: 8px;
    color: white;
    font-size: 11px;
  }

  .photo-flag-icon {
    position: absolute;
    top: 8px;
    right: 8px;
    background: #dc2626;
    color: white;
    border-radius: 50%;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .flag-details {
    margin-top: 16px;
    padding: 12px;
    background: #fffbeb;
    border-radius: 8px;
    border: 1px solid #fcd34d;
  }

  .flag-detail-item {
    font-size: 13px;
    color: #92400e;
    margin-bottom: 8px;
    display: flex;
    align-items: flex-start;
    gap: 8px;
  }

  .flag-detail-item:last-child {
    margin-bottom: 0;
  }

  .no-issues {
    text-align: center;
    padding: 60px 20px;
    color: #6b7280;
  }

  .no-issues-icon {
    width: 64px;
    height: 64px;
    margin: 0 auto 16px;
    color: #10b981;
  }

  .no-issues h3 {
    margin: 0 0 8px 0;
    color: #374151;
  }

  /* Dark mode */
  body.dark-mode .dashboard-layout {
    background: #0b1220;
  }

  body.dark-mode .page-header h1 {
    color: #f1f5f9;
  }

  body.dark-mode .page-header p {
    color: #94a3b8;
  }

  body.dark-mode .summary-card,
  body.dark-mode .filters-section,
  body.dark-mode .issue-card {
    background: #0f172a;
    border-color: #1e293b;
  }

  body.dark-mode .summary-card h3 {
    color: #94a3b8;
  }

  body.dark-mode .summary-card .value {
    color: #f1f5f9;
  }

  body.dark-mode .filters-header {
    color: #e2e8f0;
  }

  body.dark-mode .filter-group label {
    color: #94a3b8;
  }

  body.dark-mode .filter-group select,
  body.dark-mode .filter-group input {
    background: #0b1220;
    border-color: #1e293b;
    color: #e2e8f0;
  }

  body.dark-mode .clear-filters-btn {
    background: #1e293b;
    border-color: #334155;
    color: #e2e8f0;
  }

  body.dark-mode .issue-header {
    border-bottom-color: #1e293b;
  }

  body.dark-mode .issue-title {
    color: #f1f5f9;
  }

  body.dark-mode .issue-subtitle {
    color: #94a3b8;
  }

  body.dark-mode .photo-item {
    border-color: #1e293b;
  }

  body.dark-mode .flag-details {
    background: #451a03;
    border-color: #92400e;
  }

  body.dark-mode .no-issues {
    color: #94a3b8;
  }

  body.dark-mode .no-issues h3 {
    color: #e2e8f0;
  }

  @media (max-width: 768px) {
    .main-content {
      padding: 16px;
    }

    .filters-row {
      flex-direction: column;
    }

    .filter-group {
      min-width: 100%;
    }

    .issue-header {
      flex-direction: column;
      align-items: flex-start;
    }

    .photos-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }
`;

const PhotoAuditPage = () => {
  const [loading, setLoading] = useState(true);
  const [issues, setIssues] = useState([]);
  const [summary, setSummary] = useState({ totalFlagged: 0, dateMismatch: 0, duplicatePhoto: 0 });
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, pages: 0 });
  const [users, setUsers] = useState([]);

  // Filters
  const [flagType, setFlagType] = useState('all');
  const [userId, setUserId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const fetchUsers = useCallback(async () => {
    try {
      const res = await userService.getAll({ role: 'employee', limit: 0 });
      setUsers(res.data || []);
    } catch (err) {
      console.error('Failed to fetch users:', err);
    }
  }, []);

  const fetchIssues = useCallback(async (page = 1) => {
    try {
      setLoading(true);
      const params = {
        page,
        limit: pagination.limit,
      };
      if (flagType !== 'all') params.flagType = flagType;
      if (userId) params.userId = userId;
      if (dateFrom) params.dateFrom = dateFrom;
      if (dateTo) params.dateTo = dateTo;

      const res = await visitService.getPhotoAuditIssues(params);
      setIssues(res.data || []);
      setSummary(res.summary || { totalFlagged: 0, dateMismatch: 0, duplicatePhoto: 0 });
      setPagination(res.pagination || { page: 1, limit: 10, total: 0, pages: 0 });
    } catch (err) {
      console.error('Failed to fetch photo audit issues:', err);
    } finally {
      setLoading(false);
    }
  }, [flagType, userId, dateFrom, dateTo, pagination.limit]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  useEffect(() => {
    fetchIssues(1);
  }, [fetchIssues]);

  const handlePageChange = (newPage) => {
    fetchIssues(newPage);
  };

  const handleClearFilters = () => {
    setFlagType('all');
    setUserId('');
    setDateFrom('');
    setDateTo('');
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatDateTime = (dateStr) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading && issues.length === 0) {
    return <LoadingSpinner fullScreen />;
  }

  return (
    <div className="dashboard-layout">
      <style>{pageStyles}</style>
      <Navbar />
      <div className="dashboard-content">
        <Sidebar />
        <main className="main-content">
          <div className="page-header">
            <h1>
              <Camera size={28} />
              Photo Audit
            </h1>
            <p>Review visits with suspicious or flagged photos</p>
          </div>

          {/* Summary Cards */}
          <div className="summary-cards">
            <div className="summary-card">
              <h3>Total Flagged Visits</h3>
              <div className="value">{summary.totalFlagged}</div>
            </div>
            <div className="summary-card warning">
              <h3>Date Mismatches</h3>
              <div className="value">{summary.dateMismatch}</div>
            </div>
            <div className="summary-card danger">
              <h3>Duplicate Photos</h3>
              <div className="value">{summary.duplicatePhoto}</div>
            </div>
          </div>

          {/* Filters */}
          <div className="filters-section">
            <div className="filters-header">
              <Filter size={18} />
              Filters
            </div>
            <div className="filters-row">
              <div className="filter-group">
                <label>Flag Type</label>
                <select value={flagType} onChange={(e) => setFlagType(e.target.value)}>
                  <option value="all">All Flags</option>
                  <option value="date_mismatch">Date Mismatch</option>
                  <option value="duplicate_photo">Duplicate Photo</option>
                </select>
              </div>
              <div className="filter-group">
                <label>BDM</label>
                <select value={userId} onChange={(e) => setUserId(e.target.value)}>
                  <option value="">All BDMs</option>
                  {users.map((u) => (
                    <option key={u._id} value={u._id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="filter-group">
                <label>From Date</label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                />
              </div>
              <div className="filter-group">
                <label>To Date</label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                />
              </div>
              <button className="clear-filters-btn" onClick={handleClearFilters}>
                <X size={16} />
                Clear
              </button>
            </div>
          </div>

          {/* Issues List */}
          {issues.length === 0 ? (
            <div className="no-issues">
              <Camera className="no-issues-icon" />
              <h3>No Flagged Photos Found</h3>
              <p>All visit photos look good. No issues detected.</p>
            </div>
          ) : (
            <>
              <div className="issues-list">
                {issues.map((issue) => (
                  <div key={issue._id} className="issue-card">
                    <div className="issue-header">
                      <div className="issue-meta">
                        <div className="issue-title">
                          <span className={`type-badge ${issue.type}`}>
                            {issue.type === 'vip' ? 'VIP' : 'Regular'}
                          </span>
                          {issue.entity?.name || 'Unknown Client'}
                        </div>
                        <div className="issue-subtitle">
                          <span>
                            <User size={14} />
                            {issue.user?.name || 'Unknown BDM'}
                          </span>
                          <span>
                            <Calendar size={14} />
                            {formatDate(issue.visitDate)}
                          </span>
                        </div>
                      </div>
                      <div className="flag-badges">
                        {issue.photoFlags?.includes('date_mismatch') && (
                          <span className="flag-badge date-mismatch">
                            <Clock size={14} />
                            Date Mismatch
                          </span>
                        )}
                        {issue.photoFlags?.includes('duplicate_photo') && (
                          <span className="flag-badge duplicate-photo">
                            <Copy size={14} />
                            Duplicate Photo
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="issue-body">
                      {/* Photos */}
                      <div className="photos-grid">
                        {issue.photos?.map((photo, idx) => {
                          const isFlagged = issue.photoFlagDetails?.some(
                            (d) => d.photoIndex === idx
                          );
                          return (
                            <div
                              key={idx}
                              className={`photo-item ${isFlagged ? 'flagged' : ''}`}
                            >
                              <img src={photo.url} alt={`Photo ${idx + 1}`} />
                              {isFlagged && (
                                <div className="photo-flag-icon">
                                  <AlertTriangle size={14} />
                                </div>
                              )}
                              <div className="photo-overlay">
                                Taken: {formatDateTime(photo.capturedAt)}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Flag Details */}
                      {issue.photoFlagDetails && issue.photoFlagDetails.length > 0 && (
                        <div className="flag-details">
                          {issue.photoFlagDetails.map((detail, idx) => (
                            <div key={idx} className="flag-detail-item">
                              <AlertTriangle size={16} />
                              <span>
                                <strong>Photo {detail.photoIndex + 1}:</strong>{' '}
                                {detail.detail}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {pagination.pages > 1 && (
                <div style={{ marginTop: '24px' }}>
                  <Pagination
                    currentPage={pagination.page}
                    totalPages={pagination.pages}
                    onPageChange={handlePageChange}
                  />
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
};

export default PhotoAuditPage;
