/**
 * GPSVerificationPage
 *
 * GPS Location Verification for admin review (Task D.2)
 * Shows real visit GPS data with distance calculations.
 *
 * Threshold: Configurable via ERP Settings (GPS_VERIFICATION_THRESHOLD_M, default 400m)
 * - Within threshold = VERIFIED
 * - Beyond threshold = SUSPICIOUS
 *
 * Route: /admin/gps-verification
 */

import { useState, useEffect, useCallback } from 'react';
import {
  MapPin,
  AlertTriangle,
  CheckCircle,
  Info,
  RefreshCw,
  Filter,
  Loader,
  Clock,
  User,
  Navigation,
} from 'lucide-react';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import PageGuide from '../../components/common/PageGuide';
import VisitLocationMap from '../../components/admin/VisitLocationMap';
import visitService from '../../services/visitService';

import SelectField from '../../components/common/Select';

/* =============================================================================
   STYLES
   ============================================================================= */

const pageStyles = `
  .gps-page-layout {
    min-height: 100vh;
    background: #f3f4f6;
  }

  .gps-page-content {
    display: flex;
  }

  .gps-page-main {
    flex: 1;
    padding: 24px;
    max-width: 1400px;
  }

  /* Page Header */
  .page-header {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-bottom: 24px;
  }

  .page-header h1 {
    margin: 0;
    font-size: 28px;
    color: #1f2937;
  }

  .page-header-icon {
    width: 48px;
    height: 48px;
    background: linear-gradient(135deg, #3b82f6, #2563eb);
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
  }

  /* Info Banner */
  .info-banner {
    background: linear-gradient(135deg, #eff6ff, #dbeafe);
    border: 1px solid #bfdbfe;
    border-radius: 12px;
    padding: 16px 20px;
    margin-bottom: 24px;
    display: flex;
    align-items: center;
    gap: 14px;
  }

  .info-banner-icon {
    width: 40px;
    height: 40px;
    background: white;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #2563eb;
    flex-shrink: 0;
  }

  .info-banner-content { flex: 1; }

  .info-banner-title {
    font-weight: 600;
    color: #1e40af;
    margin-bottom: 2px;
  }

  .info-banner-text {
    font-size: 14px;
    color: #3b82f6;
  }

  /* Filter Bar */
  .gps-filter-bar {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 20px;
    flex-wrap: wrap;
  }

  .gps-filter-bar select {
    padding: 8px 14px;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    font-size: 14px;
    color: #374151;
    background: white;
    cursor: pointer;
    min-width: 160px;
  }

  .gps-filter-bar select:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }

  .gps-refresh-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 14px;
    background: #3b82f6;
    color: white;
    border: none;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.2s;
  }

  .gps-refresh-btn:hover { background: #2563eb; }

  .gps-refresh-btn:disabled {
    background: #93c5fd;
    cursor: not-allowed;
  }

  .gps-refresh-btn.loading svg {
    animation: gpsspin 1s linear infinite;
  }

  @keyframes gpsspin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  /* Stats Row */
  .gps-stats-row {
    display: flex;
    gap: 16px;
    margin-bottom: 24px;
    flex-wrap: wrap;
  }

  .gps-stat-badge {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    border-radius: 10px;
    font-size: 14px;
    font-weight: 600;
  }

  .gps-stat-badge.verified {
    background: #dcfce7;
    color: #15803d;
    border: 1px solid #86efac;
  }

  .gps-stat-badge.suspicious {
    background: #fee2e2;
    color: #dc2626;
    border: 1px solid #fca5a5;
  }

  .gps-stat-badge.nodata {
    background: #f3f4f6;
    color: #6b7280;
    border: 1px solid #d1d5db;
  }

  /* Two Column Layout */
  .gps-two-col {
    display: grid;
    grid-template-columns: 380px 1fr;
    gap: 24px;
    align-items: start;
  }

  /* ===== DARK MODE ===== */
  body.dark-mode .gps-page-layout {
    background: #0b1220;
  }

  body.dark-mode .page-header h1 {
    color: #f1f5f9;
  }

  body.dark-mode .gps-filter-bar select {
    background: #0b1220;
    border-color: #1e293b;
    color: #e2e8f0;
  }

  body.dark-mode .gps-visit-list,
  body.dark-mode .gps-map-card,
  body.dark-mode .gps-details-card {
    background: #0f172a;
    border-color: #1e293b;
    box-shadow: none;
  }

  body.dark-mode .gps-visit-list-header {
    background: #0b1220;
    border-bottom-color: #1e293b;
    color: #f1f5f9;
  }

  @media (max-width: 960px) {
    .gps-two-col {
      grid-template-columns: 1fr;
    }
  }

  /* Visit List */
  .gps-visit-list {
    background: white;
    border-radius: 12px;
    border: 1px solid #e5e7eb;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
    overflow: hidden;
    max-height: 600px;
    display: flex;
    flex-direction: column;
  }

  .gps-visit-list-header {
    padding: 14px 16px;
    border-bottom: 1px solid #e5e7eb;
    font-weight: 600;
    font-size: 15px;
    color: #1f2937;
    background: #f9fafb;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .gps-visit-list-body {
    overflow-y: auto;
    flex: 1;
  }

  .gps-visit-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    border-bottom: 1px solid #f3f4f6;
    cursor: pointer;
    transition: all 0.15s;
    border-left: 3px solid transparent;
  }

  .gps-visit-row:last-child { border-bottom: none; }

  .gps-visit-row:hover {
    background: #f9fafb;
  }

  .gps-visit-row.selected {
    background: #eff6ff;
    border-left-color: #3b82f6;
  }

  .gps-visit-row.verified-row:hover { border-left-color: #22c55e; }
  .gps-visit-row.suspicious-row:hover { border-left-color: #ef4444; }
  .gps-visit-row.nodata-row:hover { border-left-color: #9ca3af; }
  .gps-visit-row.selected.verified-row { border-left-color: #22c55e; }
  .gps-visit-row.selected.suspicious-row { border-left-color: #ef4444; }
  .gps-visit-row.selected.nodata-row { border-left-color: #9ca3af; }

  .gps-visit-info {
    flex: 1;
    min-width: 0;
  }

  .gps-visit-doctor {
    font-size: 14px;
    font-weight: 600;
    color: #1f2937;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .gps-visit-meta {
    font-size: 12px;
    color: #6b7280;
    margin-top: 2px;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .gps-distance-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 700;
    white-space: nowrap;
  }

  .gps-distance-badge.verified {
    background: #dcfce7;
    color: #15803d;
  }

  .gps-distance-badge.suspicious {
    background: #fee2e2;
    color: #dc2626;
  }

  .gps-distance-badge.nodata {
    background: #f3f4f6;
    color: #6b7280;
  }

  /* Map Panel */
  .gps-map-panel {
    position: sticky;
    top: 24px;
  }

  .gps-map-placeholder {
    background: white;
    border-radius: 12px;
    border: 1px solid #e5e7eb;
    padding: 60px 20px;
    text-align: center;
    color: #6b7280;
  }

  .gps-map-placeholder-icon {
    width: 64px;
    height: 64px;
    margin: 0 auto 16px;
    background: #f3f4f6;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #9ca3af;
  }

  .gps-map-placeholder p {
    margin: 0;
    font-size: 14px;
  }

  /* Loading / Empty */
  .gps-loading, .gps-empty {
    padding: 60px 20px;
    text-align: center;
    color: #6b7280;
  }

  .gps-loading-icon {
    animation: gpsspin 1s linear infinite;
    margin-bottom: 12px;
  }

  @media (max-width: 480px) {
    .gps-page-main {
      padding: 16px;
      padding-bottom: 80px;
    }
    .page-header {
      flex-direction: column;
      align-items: flex-start;
      gap: 10px;
    }
    .page-header h1 {
      font-size: 22px;
    }
    .info-banner {
      flex-direction: column;
      text-align: center;
      padding: 14px;
    }
    .gps-filter-bar {
      flex-direction: column;
      align-items: stretch;
    }
    .gps-filter-bar select {
      min-width: unset;
      width: 100%;
      min-height: 44px;
    }
    .gps-refresh-btn {
      width: 100%;
      justify-content: center;
      min-height: 44px;
    }
    .gps-stats-row {
      flex-direction: column;
    }
    .gps-two-col {
      grid-template-columns: 1fr;
    }
    .gps-visit-list {
      max-height: 400px;
    }
  }
`;

/* =============================================================================
   COMPONENT: GPSVerificationPage
   ============================================================================= */

const GPSVerificationPage = () => {
  const [visits, setVisits] = useState([]);
  const [selectedVisit, setSelectedVisit] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [stats, setStats] = useState({ verified: 0, suspicious: 0, noData: 0 });
  const [thresholdM, setThresholdM] = useState(400);

  /* ---------------------------------------------------------------------------
     Fetch GPS Review Data
     --------------------------------------------------------------------------- */

  const fetchData = useCallback(async () => {
    try {
      const res = await visitService.getGPSReview({
        limit: 50,
        status: statusFilter !== 'all' ? statusFilter : undefined,
      });

      setVisits(res.data || []);
      if (res.stats) {
        setStats(res.stats);
      }
      if (res.thresholdM) {
        setThresholdM(res.thresholdM);
      }
    } catch (err) {
      console.error('Failed to fetch GPS review data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    setLoading(true);
    fetchData();
  }, [fetchData]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  /* ---------------------------------------------------------------------------
     Build map props for selected visit
     --------------------------------------------------------------------------- */

  const getMapProps = (visit) => {
    if (!visit) return null;

    const hasEmployeeCoords = visit.employeeLocation?.lat && visit.employeeLocation?.lng;
    const hasClinicCoords = visit.clinicLocation?.lat && visit.clinicLocation?.lng;

    if (!hasEmployeeCoords || !hasClinicCoords) return null;

    return {
      clinicCoords: visit.clinicLocation,
      employeeCoords: visit.employeeLocation,
      accuracy: visit.accuracy || 10,
      allowedRadius: thresholdM,
      height: '400px',
    };
  };

  const mapProps = getMapProps(selectedVisit);

  /* ---------------------------------------------------------------------------
     Render
     --------------------------------------------------------------------------- */

  return (
    <div className="gps-page-layout">
      <style>{pageStyles}</style>
      <Navbar />
      <div className="gps-page-content">
        <Sidebar />
        <main className="gps-page-main">
          {/* Page Header */}
          <div className="page-header">
            <div className="page-header-icon">
              <MapPin size={24} />
            </div>
            <h1>GPS Verification</h1>
          </div>

          <PageGuide pageKey="gps-verification" />

          {/* Info Banner */}
          <div className="info-banner">
            <div className="info-banner-icon">
              <Info size={20} />
            </div>
            <div className="info-banner-content">
              <div className="info-banner-title">Verification Threshold: {thresholdM} meters</div>
              <div className="info-banner-text">
                Visits with BDM photo taken within {thresholdM}m of the clinic are marked as VERIFIED.
                Beyond {thresholdM}m is flagged as SUSPICIOUS.
              </div>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="gps-filter-bar">
            <Filter size={16} style={{ color: '#6b7280' }} />
            <SelectField
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">All Visits</option>
              <option value="suspicious">Suspicious Only</option>
              <option value="verified">Verified Only</option>
            </SelectField>
            <button
              className={`gps-refresh-btn ${refreshing ? 'loading' : ''}`}
              onClick={handleRefresh}
              disabled={refreshing}
            >
              <RefreshCw size={14} />
              {refreshing ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>

          {/* Stats Row */}
          <div className="gps-stats-row">
            <div className="gps-stat-badge verified">
              <CheckCircle size={16} />
              {stats.verified} Verified
            </div>
            <div className="gps-stat-badge suspicious">
              <AlertTriangle size={16} />
              {stats.suspicious} Suspicious
            </div>
            <div className="gps-stat-badge nodata">
              <Navigation size={16} />
              {stats.noData} No Data
            </div>
          </div>

          {/* Loading */}
          {loading ? (
            <div className="gps-loading">
              <Loader size={32} className="gps-loading-icon" />
              <p>Loading GPS verification data...</p>
            </div>
          ) : visits.length === 0 ? (
            <div className="gps-empty">
              <div className="gps-map-placeholder-icon" style={{ margin: '0 auto 16px' }}>
                <MapPin size={28} />
              </div>
              <p>No visits with GPS data found</p>
            </div>
          ) : (
            /* Two Column Layout */
            (<div className="gps-two-col">
              {/* Left: Visit List */}
              <div className="gps-visit-list">
                <div className="gps-visit-list-header">
                  <MapPin size={16} />
                  Visits ({visits.length})
                </div>
                <div className="gps-visit-list-body">
                  {visits.map((visit) => {
                    const verClass = visit.verification === 'verified'
                      ? 'verified-row'
                      : visit.verification === 'suspicious'
                        ? 'suspicious-row'
                        : 'nodata-row';
                    const isSelected = selectedVisit?._id === visit._id;
                    const doctorName = visit.doctor
                      ? `${visit.doctor.firstName || ''} ${visit.doctor.lastName || ''}`.trim()
                      : 'Unknown';
                    const employeeName = visit.user?.name || 'Unknown';
                    const visitDate = visit.visitDate
                      ? new Date(visit.visitDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                      : '';

                    return (
                      <div
                        key={visit._id}
                        className={`gps-visit-row ${verClass} ${isSelected ? 'selected' : ''}`}
                        onClick={() => setSelectedVisit(visit)}
                      >
                        <div className="gps-visit-info">
                          <div className="gps-visit-doctor">{doctorName}</div>
                          <div className="gps-visit-meta">
                            <User size={11} />
                            {employeeName}
                            <Clock size={11} style={{ marginLeft: 4 }} />
                            {visitDate}
                          </div>
                        </div>
                        <div
                          className={`gps-distance-badge ${
                            visit.verification === 'verified'
                              ? 'verified'
                              : visit.verification === 'suspicious'
                                ? 'suspicious'
                                : 'nodata'
                          }`}
                        >
                          {visit.distance != null
                            ? `${visit.distance}m`
                            : 'N/A'}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              {/* Right: Map */}
              <div className="gps-map-panel">
                {selectedVisit && mapProps ? (
                  <VisitLocationMap
                    key={selectedVisit._id}
                    clinicCoords={mapProps.clinicCoords}
                    employeeCoords={mapProps.employeeCoords}
                    accuracy={mapProps.accuracy}
                    allowedRadius={mapProps.allowedRadius}
                    height={mapProps.height}
                  />
                ) : (
                  <div className="gps-map-placeholder">
                    <div className="gps-map-placeholder-icon">
                      <MapPin size={28} />
                    </div>
                    <p>{selectedVisit ? 'GPS data not available for this visit' : 'Select a visit to view on map'}</p>
                  </div>
                )}
              </div>
            </div>)
          )}
        </main>
      </div>
    </div>
  );
};

export default GPSVerificationPage;
