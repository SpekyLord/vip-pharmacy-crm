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
import useLookupData from '../../hooks/useLookupData';

// Custom dropdown component for mobile
const CustomDropdown = ({ label, value, options, onChange, placeholder }) => {
  const [isOpen, setIsOpen] = useState(false);

  const handleSelect = (optionValue) => {
    onChange(optionValue);
    setIsOpen(false);
  };

  const selectedOption = options.find(opt => opt.value === value);
  const displayText = selectedOption?.label || placeholder;

  return (
    <>
      <button
        type="button"
        className="custom-dropdown-trigger"
        onClick={() => setIsOpen(true)}
      >
        <span className="custom-dropdown-label">{label}</span>
        <span className="custom-dropdown-value">{displayText}</span>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M4 6l4 4 4-4z"/>
        </svg>
      </button>

      {isOpen && (
        <div className="custom-dropdown-overlay" onClick={() => setIsOpen(false)}>
          <div className="custom-dropdown-modal" onClick={(e) => e.stopPropagation()}>
            <div className="custom-dropdown-header">
              <h3>{label}</h3>
              <button
                type="button"
                className="custom-dropdown-close"
                onClick={() => setIsOpen(false)}
              >
                ×
              </button>
            </div>
            <div className="custom-dropdown-options">
              {options.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`custom-dropdown-option${value === option.value ? ' selected' : ''}`}
                  onClick={() => handleSelect(option.value)}
                >
                  {option.label}
                  {value === option.value && (
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"/>
                    </svg>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

const doctorListStyles = `
  .doctor-list {
    padding: 0;
    overflow-x: hidden;
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
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    color: #dc2626;
    font-weight: 600;
    margin-top: 6px;
    padding: 4px 10px;
    background: #fef2f2;
    border: 1px solid #fecaca;
    border-radius: 6px;
  }

  .doctor-card.visit-blocked {
    border-color: #fca5a5;
    background: #fffbfb;
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
    background: #e5e7eb;
    color: #9ca3af;
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

  .filter-toggle-row {
    display: none;
  }

  .filter-toggle-btn {
    padding: 10px 16px;
    background: #f3f4f6;
    border: 1px solid #d1d5db;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 600;
    color: #374151;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 8px;
    transition: all 0.15s;
    margin-top: 12px;
    width: 100%;
    justify-content: center;
    min-height: 44px;
  }

  .filter-toggle-btn:hover {
    background: #e5e7eb;
  }

  .filter-toggle-btn.active {
    background: #dbeafe;
    border-color: #93c5fd;
    color: #1d4ed8;
  }

  .filter-dropdown-group {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-top: 12px;
  }

  .frequency-select option {
    padding: 12px;
  }

  .desktop-filter-selects {
    display: contents;
  }

  /* Custom Dropdown Styles */
  .custom-dropdown-trigger {
    width: 100%;
    padding: 10px 16px;
    background: white;
    border: 1px solid #d1d5db;
    border-radius: 8px;
    font-size: 14px;
    text-align: left;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    position: relative;
    min-height: 56px;
    transition: border-color 0.15s;
  }

  .custom-dropdown-trigger:hover {
    border-color: #9ca3af;
  }

  .custom-dropdown-trigger > svg {
    position: absolute;
    right: 16px;
    top: 50%;
    transform: translateY(-50%);
    color: #6b7280;
    pointer-events: none;
  }

  .custom-dropdown-label {
    font-size: 11px;
    color: #6b7280;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 4px;
  }

  .custom-dropdown-value {
    color: #1f2937;
    font-weight: 500;
    font-size: 15px;
    padding-right: 24px;
  }

  .custom-dropdown-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: 9999;
    display: flex;
    align-items: flex-end;
    animation: fadeIn 0.15s;
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .custom-dropdown-modal {
    width: 100%;
    max-height: 70vh;
    background: white;
    border-radius: 16px 16px 0 0;
    display: flex;
    flex-direction: column;
    animation: slideUp 0.2s ease-out;
  }

  @keyframes slideUp {
    from { transform: translateY(100%); }
    to { transform: translateY(0); }
  }

  .custom-dropdown-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 20px;
    border-bottom: 1px solid #e5e7eb;
  }

  .custom-dropdown-header h3 {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
    color: #1f2937;
  }

  .custom-dropdown-close {
    width: 36px;
    height: 36px;
    border: none;
    background: #f3f4f6;
    border-radius: 8px;
    font-size: 28px;
    color: #6b7280;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    line-height: 1;
    padding: 0;
    transition: background 0.15s;
  }

  .custom-dropdown-close:hover {
    background: #e5e7eb;
  }

  .custom-dropdown-options {
    overflow-y: auto;
    flex: 1;
    padding: 8px;
  }

  .custom-dropdown-option {
    width: 100%;
    padding: 16px 20px;
    background: white;
    border: none;
    border-radius: 8px;
    text-align: left;
    font-size: 15px;
    color: #1f2937;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: space-between;
    transition: background 0.15s;
    min-height: 52px;
  }

  .custom-dropdown-option:hover {
    background: #f3f4f6;
  }

  .custom-dropdown-option.selected {
    background: #dbeafe;
    color: #1d4ed8;
    font-weight: 600;
  }

  .custom-dropdown-option svg {
    flex-shrink: 0;
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

  @media (max-width: 480px) {
    .doctor-list-filters {
      flex-direction: column;
      gap: 0;
      margin-bottom: 12px;
      overflow: visible;
      position: relative;
    }

    .desktop-filter-selects {
      display: none;
    }

    .filter-toggle-row {
      display: block;
    }

    .filter-dropdown-group {
      display: none;
    }

    .filter-dropdown-group.show {
      display: flex;
    }

    .search-input,
    .frequency-select {
      min-width: unset;
      min-height: 44px;
      font-size: 16px;
    }
    .doctor-list-grid {
      gap: 12px;
    }
    .doctor-card {
      padding: 12px;
    }
    .doctor-card-header h3 {
      font-size: 15px;
    }
    /* Hide address on mobile to save space */
    .doctor-hospital {
      display: none;
    }
    /* Inline engagement badge next to specialization */
    .engagement-badge {
      margin-bottom: 8px;
      font-size: 11px;
      padding: 2px 6px;
    }
    .visit-status {
      margin-bottom: 10px;
    }
    .doctor-card-actions {
      margin-top: 10px;
      gap: 8px;
    }
    .log-visit-btn {
      min-height: 44px;
      flex: 1;
    }
    /* Make Edit and Products icon-sized on mobile */
    .products-btn,
    .edit-btn {
      min-height: 36px;
      padding: 8px 12px;
      font-size: 12px;
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
  const { programs: lookupPrograms, supportTypes: lookupSupportTypes } = useLookupData();

  // Merge lookup data with unique values from loaded doctors as fallback
  const programs = useMemo(() => {
    const fromDoctors = [...new Set(doctors.flatMap(d => d.programsToImplement || []).filter(Boolean))];
    return [...new Set([...lookupPrograms, ...fromDoctors])].sort();
  }, [lookupPrograms, doctors]);

  const supportTypes = useMemo(() => {
    const fromDoctors = [...new Set(doctors.flatMap(d => d.supportDuringCoverage || []).filter(Boolean))];
    return [...new Set([...lookupSupportTypes, ...fromDoctors])].sort();
  }, [lookupSupportTypes, doctors]);

  const [searchTerm, setSearchTerm] = useState('');
  const [frequencyFilter, setFrequencyFilter] = useState('all');
  const [supportFilter, setSupportFilter] = useState('');
  const [programFilter, setProgramFilter] = useState('');
  const [showFilters, setShowFilters] = useState(false);
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

        {/* Desktop: show all filters inline */}
        <div className="desktop-filter-selects">
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
            {supportTypes.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <select
            value={programFilter}
            onChange={(e) => setProgramFilter(e.target.value)}
            className="frequency-select"
          >
            <option value="">All Programs</option>
            {programs.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>

        {/* Mobile: toggle button and collapsible dropdown group */}
        <div className="filter-toggle-row">
          <button
            className={`filter-toggle-btn${showFilters ? ' active' : ''}`}
            onClick={() => setShowFilters(!showFilters)}
            type="button"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M0 2h16v2H0V2zm3 5h10v2H3V7zm2 5h6v2H5v-2z"/>
            </svg>
            {showFilters ? 'Hide Filters' : 'Show Filters'}
          </button>
          {showFilters && (
            <div className="filter-dropdown-group show">
              <CustomDropdown
                label="Visit Frequency"
                value={frequencyFilter}
                options={[
                  { value: 'all', label: 'All Frequencies' },
                  { value: '2', label: '2x per month' },
                  { value: '4', label: '4x per month' },
                ]}
                onChange={setFrequencyFilter}
                placeholder="All Frequencies"
              />
              <CustomDropdown
                label="Support Type"
                value={supportFilter}
                options={[
                  { value: '', label: 'All Support Types' },
                  ...supportTypes.map((s) => ({ value: s, label: s })),
                ]}
                onChange={setSupportFilter}
                placeholder="All Support Types"
              />
              <CustomDropdown
                label="Program"
                value={programFilter}
                options={[
                  { value: '', label: 'All Programs' },
                  ...programs.map((p) => ({ value: p, label: p })),
                ]}
                onChange={setProgramFilter}
                placeholder="All Programs"
              />
            </div>
          )}
        </div>
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
              className={`doctor-card ${statusDisplay?.isComplete ? 'completed' : ''} ${!canVisit ? 'visit-blocked' : ''}`}
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
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
                      </svg>
                      {statusDisplay.reason?.toLowerCase().includes('weekend')
                        ? 'Weekend — carried only'
                        : statusDisplay.reason?.toLowerCase().includes('already visited')
                        ? 'Visited this week'
                        : statusDisplay.reason?.toLowerCase().includes('quota reached')
                        ? 'Monthly limit reached'
                        : statusDisplay.reason?.toLowerCase().includes('completed')
                        ? 'All visits completed'
                        : statusDisplay.reason?.toLowerCase().includes('scheduled for')
                        ? 'Not scheduled this week'
                        : 'Cannot visit'}
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
