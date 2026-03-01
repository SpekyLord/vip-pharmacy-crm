/**
 * DoctorList Component
 *
 * Displays list of doctors with:
 * - Search and filter functionality
 * - Doctor cards with key info
 * - Visit frequency badges (2x or 4x per month)
 * - Visit status indicators
 * - Log Visit button
 */

import { useState, useEffect, useMemo, memo } from 'react';
import LoadingSpinner from '../common/LoadingSpinner';
import visitService from '../../services/visitService';
import TargetProductsModal from './TargetProductsModal';
import DoctorEditForm from './DoctorEditForm';

const doctorListStyles = `
  .doctor-list {
    padding: 0;
  }

  .doctor-list-filters {
    display: flex;
    gap: 16px;
    margin-bottom: 20px;
    flex-wrap: wrap;
  }

  .search-input {
    flex: 1;
    min-width: 250px;
    padding: 12px 16px;
    border: 1px solid #d1d5db;
    border-radius: 8px;
    font-size: 14px;
    transition: border-color 0.2s, box-shadow 0.2s;
  }

  .search-input:focus {
    outline: none;
    border-color: #2563eb;
    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
  }

  .frequency-select {
    padding: 12px 16px;
    border: 1px solid #d1d5db;
    border-radius: 8px;
    font-size: 14px;
    background: white;
    cursor: pointer;
    min-width: 160px;
  }

  .frequency-select:focus {
    outline: none;
    border-color: #2563eb;
    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
  }

  .loading-status {
    text-align: center;
    color: #6b7280;
    padding: 8px;
    font-size: 14px;
  }

  .doctor-list-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 20px;
  }

  .doctor-card {
    background: white;
    border-radius: 12px;
    padding: 20px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    cursor: pointer;
    transition: transform 0.2s, box-shadow 0.2s;
    border: 1px solid #e5e7eb;
  }

  .doctor-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }

  .doctor-card.completed {
    background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%);
    border-color: #86efac;
  }

  .doctor-card-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 12px;
  }

  .doctor-card-header h3 {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
    color: #1f2937;
  }

  .frequency-badge {
    display: inline-block;
    padding: 4px 10px;
    border-radius: 20px;
    font-size: 12px;
    font-weight: 600;
    white-space: nowrap;
  }

  .frequency-2 {
    background: #dbeafe;
    color: #1d4ed8;
  }

  .frequency-4 {
    background: #dcfce7;
    color: #16a34a;
  }

  .doctor-specialization {
    margin: 0 0 4px 0;
    color: #4b5563;
    font-size: 14px;
  }

  .doctor-hospital {
    margin: 0 0 16px 0;
    color: #6b7280;
    font-size: 13px;
  }

  .visit-status {
    margin-bottom: 16px;
  }

  .visit-progress {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 8px;
  }

  .visit-count {
    font-size: 13px;
    color: #4b5563;
    font-weight: 500;
    white-space: nowrap;
  }

  .progress-bar {
    flex: 1;
    height: 8px;
    background: #e5e7eb;
    border-radius: 4px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    border-radius: 4px;
    transition: width 0.3s ease;
  }

  .progress-fill.low {
    background: #3b82f6;
  }

  .progress-fill.medium {
    background: #f59e0b;
  }

  .progress-fill.complete {
    background: #22c55e;
  }

  .visit-limit-reached {
    display: block;
    font-size: 12px;
    color: #dc2626;
    font-weight: 500;
    margin-top: 4px;
  }

  .doctor-card-actions {
    margin-top: 16px;
    display: flex;
    gap: 10px;
  }

  .log-visit-btn {
    flex: 1;
    padding: 12px 20px;
    border: none;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    background: #2563eb;
    color: white;
  }

  .log-visit-btn:hover:not(:disabled) {
    background: #1d4ed8;
  }

  .log-visit-btn.disabled,
  .log-visit-btn:disabled {
    background: #9ca3af;
    cursor: not-allowed;
  }

  .products-btn,
  .edit-btn {
    padding: 12px 16px;
    border: 1px solid #d1d5db;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    background: #fff;
    color: #374151;
    white-space: nowrap;
  }

  .products-btn:hover,
  .edit-btn:hover {
    background: #f3f4f6;
    border-color: #9ca3af;
  }

  .engagement-badge {
    display: inline-block;
    padding: 3px 8px;
    border-radius: 12px;
    font-size: 12px;
    font-weight: 500;
    margin-bottom: 12px;
  }

  .engagement-badge.eng-low {
    background: #fef2f2;
    color: #dc2626;
  }

  .engagement-badge.eng-mid {
    background: #fefce8;
    color: #a16207;
  }

  .engagement-badge.eng-high {
    background: #f0fdf4;
    color: #16a34a;
  }

  .no-results {
    text-align: center;
    padding: 40px 20px;
    color: #6b7280;
    font-size: 15px;
  }

  @media (max-width: 640px) {
    .doctor-list-filters {
      flex-direction: column;
    }

    .search-input,
    .frequency-select {
      width: 100%;
    }

    .doctor-list-grid {
      grid-template-columns: 1fr;
    }
  }
`;

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

const DoctorList = memo(function DoctorList({
  doctors = [],
  loading = false,
  onSelectDoctor,
  onLogVisit,
  onEditDoctor,
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [frequencyFilter, setFrequencyFilter] = useState('all');
  const [supportFilter, setSupportFilter] = useState('');
  const [programFilter, setProgramFilter] = useState('');
  const [visitStatus, setVisitStatus] = useState({});
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [productsDoctor, setProductsDoctor] = useState(null);
  const [editDoctor, setEditDoctor] = useState(null);

  // Fetch visit status for all doctors using batch endpoint (eliminates N+1 problem)
  useEffect(() => {
    let isMounted = true;
    const abortController = new AbortController();

    const fetchVisitStatus = async () => {
      if (doctors.length === 0) return;

      setLoadingStatus(true);

      try {
        // Use batch endpoint - single API call instead of N calls
        const doctorIds = doctors.map((doctor) => doctor._id);
        const response = await visitService.canVisitBatch(doctorIds);

        // Only update state if component is still mounted
        if (isMounted) {
          setVisitStatus(response.data || {});
        }
      } catch (error) {
        // Fallback: set all as visitable if batch fails
        if (isMounted) {
          const fallbackStatus = {};
          doctors.forEach((doctor) => {
            fallbackStatus[doctor._id] = { canVisit: true };
          });
          setVisitStatus(fallbackStatus);
        }
      } finally {
        if (isMounted) {
          setLoadingStatus(false);
        }
      }
    };

    fetchVisitStatus();

    // Cleanup function to prevent memory leaks
    return () => {
      isMounted = false;
      abortController.abort();
    };
  }, [doctors]);

  // Memoize filtered doctors to prevent recalculation on every render
  const filteredDoctors = useMemo(() => {
    return doctors.filter((doctor) => {
      const searchLower = searchTerm.toLowerCase();
      const matchesSearch =
        doctor.firstName?.toLowerCase().includes(searchLower) ||
        doctor.lastName?.toLowerCase().includes(searchLower) ||
        doctor.fullName?.toLowerCase().includes(searchLower) ||
        doctor.specialization?.toLowerCase().includes(searchLower) ||
        doctor.clinicOfficeAddress?.toLowerCase().includes(searchLower);
      const matchesFrequency =
        frequencyFilter === 'all' ||
        doctor.visitFrequency === parseInt(frequencyFilter);
      const matchesSupport =
        !supportFilter ||
        (doctor.supportDuringCoverage && doctor.supportDuringCoverage.includes(supportFilter));
      const matchesProgram =
        !programFilter ||
        (doctor.programsToImplement && doctor.programsToImplement.includes(programFilter));
      return matchesSearch && matchesFrequency && matchesSupport && matchesProgram;
    });
  }, [doctors, searchTerm, frequencyFilter, supportFilter, programFilter]);

  // Get visit status display for a doctor
  const getVisitStatusDisplay = (doctor) => {
    const status = visitStatus[doctor._id];
    if (!status) return null;

    const { monthlyCount = 0, monthlyLimit = doctor.visitFrequency || 4 } = status;

    return {
      monthlyCount,
      monthlyLimit,
      isComplete: monthlyCount >= monthlyLimit,
      canVisit: status.canVisit,
      reason: status.reason,
    };
  };

  // Get progress bar color class based on completion percentage
  const getProgressColorClass = (count, limit) => {
    const percentage = (count / limit) * 100;
    if (percentage >= 100) return 'complete';
    if (percentage >= 50) return 'medium';
    return 'low';
  };

  if (loading) {
    return <LoadingSpinner text="Loading VIP Clients..." />;
  }

  return (
    <div className="doctor-list">
      <style>{doctorListStyles}</style>
      <div className="doctor-list-filters">
        <input
          type="text"
          placeholder="Search by name, specialization, or address..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="search-input"
        />
        <select
          value={frequencyFilter}
          onChange={(e) => setFrequencyFilter(e.target.value)}
          className="frequency-select"
        >
          <option value="all">All Frequencies</option>
          <option value="2">2x per month</option>
          <option value="4">4x per month</option>
        </select>
        <select
          value={supportFilter}
          onChange={(e) => setSupportFilter(e.target.value)}
          className="frequency-select"
        >
          <option value="">All Support Types</option>
          <option value="STARTER DOSES">STARTER DOSES</option>
          <option value="PROMATS">PROMATS</option>
          <option value="FULL DOSE">FULL DOSE</option>
          <option value="PATIENT DISCOUNT">PATIENT DISCOUNT</option>
          <option value="AIR FRESHENER">AIR FRESHENER</option>
        </select>
        <select
          value={programFilter}
          onChange={(e) => setProgramFilter(e.target.value)}
          className="frequency-select"
        >
          <option value="">All Programs</option>
          <option value="CME GRANT">CME GRANT</option>
          <option value="REBATES / MONEY">REBATES / MONEY</option>
          <option value="REST AND RECREATION">REST AND RECREATION</option>
          <option value="MED SOCIETY PARTICIPATION">MED SOCIETY PARTICIPATION</option>
        </select>
      </div>

      {loadingStatus && (
        <p className="loading-status">Loading visit status...</p>
      )}

      <div className="doctor-list-grid">
        {filteredDoctors.map((doctor) => {
          const statusDisplay = getVisitStatusDisplay(doctor);
          const canVisit = statusDisplay?.canVisit ?? true;

          return (
            <div
              key={doctor._id}
              className={`doctor-card ${statusDisplay?.isComplete ? 'completed' : ''}`}
              onClick={() => onSelectDoctor?.(doctor)}
            >
              <div className="doctor-card-header">
                <h3>{doctor.fullName || `${doctor.firstName} ${doctor.lastName}`}</h3>
                <span className={`frequency-badge frequency-${doctor.visitFrequency}`}>
                  {doctor.visitFrequency}x/mo
                </span>
              </div>

              <p className="doctor-specialization">{doctor.specialization || '-'}</p>
              <p className="doctor-hospital">{doctor.clinicOfficeAddress || '-'}</p>

              {doctor.levelOfEngagement && (
                <span className={`engagement-badge ${getEngagementClass(doctor.levelOfEngagement)}`}>
                  Eng: {doctor.levelOfEngagement}/5 - {ENGAGEMENT_LABELS[doctor.levelOfEngagement]}
                </span>
              )}

              {statusDisplay && (
                <div className="visit-status">
                  <div className="visit-progress">
                    <span className="visit-count">
                      {statusDisplay.monthlyCount}/{statusDisplay.monthlyLimit} visits
                    </span>
                    <div className="progress-bar">
                      <div
                        className={`progress-fill ${getProgressColorClass(statusDisplay.monthlyCount, statusDisplay.monthlyLimit)}`}
                        style={{
                          width: `${Math.min((statusDisplay.monthlyCount / statusDisplay.monthlyLimit) * 100, 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                  {!canVisit && (
                    <span className="visit-limit-reached">
                      {statusDisplay.reason?.includes('week')
                        ? 'Visited this week'
                        : 'Monthly limit reached'}
                    </span>
                  )}
                </div>
              )}

              <div className="doctor-card-actions">
                <button
                  className={`log-visit-btn ${!canVisit ? 'disabled' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (canVisit && onLogVisit) {
                      onLogVisit(doctor);
                    }
                  }}
                  disabled={!canVisit}
                  title={!canVisit ? statusDisplay?.reason : 'Log a visit for this VIP Client'}
                >
                  {canVisit ? 'Log Visit' : 'Cannot Visit'}
                </button>
                <button
                  className="edit-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditDoctor(doctor);
                  }}
                  title="Edit VIP Client details"
                >
                  Edit
                </button>
                <button
                  className="products-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    setProductsDoctor(doctor);
                  }}
                  title="Manage target products"
                >
                  Products
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {filteredDoctors.length === 0 && (
        <p className="no-results">
          {doctors.length === 0
            ? 'No VIP Clients assigned to you'
            : 'No VIP Clients match your search criteria'}
        </p>
      )}

      {productsDoctor && (
        <TargetProductsModal
          doctor={productsDoctor}
          onClose={() => setProductsDoctor(null)}
          onSaved={() => setProductsDoctor(null)}
        />
      )}

      {editDoctor && (
        <DoctorEditForm
          doctor={editDoctor}
          onClose={() => setEditDoctor(null)}
          onSaved={() => {
            setEditDoctor(null);
            onEditDoctor?.();
          }}
        />
      )}
    </div>
  );
});

export default DoctorList;
