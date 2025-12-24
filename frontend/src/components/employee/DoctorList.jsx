/**
 * DoctorList Component
 *
 * Displays list of doctors with:
 * - Search and filter functionality
 * - Doctor cards with key info
 * - Click to view details/log visit
 * - Category badges (A, B, C, D)
 */

import { useState } from 'react';
import LoadingSpinner from '../common/LoadingSpinner';

const DoctorList = ({ doctors = [], loading = false, onSelectDoctor }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');

  const filteredDoctors = doctors.filter((doctor) => {
    const matchesSearch =
      doctor.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      doctor.specialization.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory =
      categoryFilter === 'all' || doctor.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  if (loading) {
    return <LoadingSpinner text="Loading doctors..." />;
  }

  return (
    <div className="doctor-list">
      <div className="doctor-list-filters">
        <input
          type="text"
          placeholder="Search doctors..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="search-input"
        />
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="category-select"
        >
          <option value="all">All Categories</option>
          <option value="A">Category A</option>
          <option value="B">Category B</option>
          <option value="C">Category C</option>
          <option value="D">Category D</option>
        </select>
      </div>

      <div className="doctor-list-grid">
        {filteredDoctors.map((doctor) => (
          <div
            key={doctor._id}
            className="doctor-card"
            onClick={() => onSelectDoctor?.(doctor)}
          >
            <div className="doctor-card-header">
              <h3>{doctor.name}</h3>
              <span className={`category-badge category-${doctor.category}`}>
                {doctor.category}
              </span>
            </div>
            <p className="doctor-specialization">{doctor.specialization}</p>
            <p className="doctor-hospital">{doctor.hospital}</p>
          </div>
        ))}
      </div>

      {filteredDoctors.length === 0 && (
        <p className="no-results">No doctors found</p>
      )}
    </div>
  );
};

export default DoctorList;
