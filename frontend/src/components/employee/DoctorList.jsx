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

import { useState, useEffect } from 'react';
import LoadingSpinner from '../common/LoadingSpinner';
import visitService from '../../services/visitService';

const DoctorList = ({
  doctors = [],
  loading = false,
  onSelectDoctor,
  onLogVisit,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [frequencyFilter, setFrequencyFilter] = useState('all');
  const [visitStatus, setVisitStatus] = useState({});
  const [loadingStatus, setLoadingStatus] = useState(false);

  // Fetch visit status for all doctors
  useEffect(() => {
    const fetchVisitStatus = async () => {
      if (doctors.length === 0) return;

      setLoadingStatus(true);
      const statusMap = {};

      // Fetch visit status for each doctor in parallel (batched)
      const batchSize = 10;
      for (let i = 0; i < doctors.length; i += batchSize) {
        const batch = doctors.slice(i, i + batchSize);
        const promises = batch.map(async (doctor) => {
          try {
            const response = await visitService.canVisit(doctor._id);
            return { id: doctor._id, data: response.data };
          } catch {
            return { id: doctor._id, data: { canVisit: true } };
          }
        });

        const results = await Promise.all(promises);
        results.forEach(({ id, data }) => {
          statusMap[id] = data;
        });
      }

      setVisitStatus(statusMap);
      setLoadingStatus(false);
    };

    fetchVisitStatus();
  }, [doctors]);

  const filteredDoctors = doctors.filter((doctor) => {
    const matchesSearch =
      doctor.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      doctor.specialization?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      doctor.hospital?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFrequency =
      frequencyFilter === 'all' ||
      doctor.visitFrequency === parseInt(frequencyFilter);
    return matchesSearch && matchesFrequency;
  });

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

  if (loading) {
    return <LoadingSpinner text="Loading doctors..." />;
  }

  return (
    <div className="doctor-list">
      <div className="doctor-list-filters">
        <input
          type="text"
          placeholder="Search by name, specialization, or hospital..."
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
                <h3>{doctor.name}</h3>
                <span className={`frequency-badge frequency-${doctor.visitFrequency}`}>
                  {doctor.visitFrequency}x/mo
                </span>
              </div>

              <p className="doctor-specialization">{doctor.specialization}</p>
              <p className="doctor-hospital">{doctor.hospital}</p>

              {statusDisplay && (
                <div className="visit-status">
                  <div className="visit-progress">
                    <span className="visit-count">
                      {statusDisplay.monthlyCount}/{statusDisplay.monthlyLimit} visits
                    </span>
                    <div className="progress-bar">
                      <div
                        className="progress-fill"
                        style={{
                          width: `${(statusDisplay.monthlyCount / statusDisplay.monthlyLimit) * 100}%`,
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
                  title={!canVisit ? statusDisplay?.reason : 'Log a visit for this doctor'}
                >
                  {canVisit ? 'Log Visit' : 'Cannot Visit'}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {filteredDoctors.length === 0 && (
        <p className="no-results">
          {doctors.length === 0
            ? 'No doctors assigned to your region'
            : 'No doctors match your search criteria'}
        </p>
      )}
    </div>
  );
};

export default DoctorList;
