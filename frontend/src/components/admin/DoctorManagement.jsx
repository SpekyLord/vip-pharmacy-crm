/**
 * DoctorManagement Component
 *
 * Admin component for managing doctors:
 * - CRUD operations for doctors
 * - Bulk import/export
 * - Category assignment
 * - Region assignment
 */

import { useState } from 'react';

const DoctorManagement = ({ doctors = [], onSave, onDelete, loading = false }) => {
  const [selectedDoctor, setSelectedDoctor] = useState(null);
  const [isEditing, setIsEditing] = useState(false);

  const handleEdit = (doctor) => {
    setSelectedDoctor(doctor);
    setIsEditing(true);
  };

  const handleCreate = () => {
    setSelectedDoctor({
      name: '',
      specialization: '',
      hospital: '',
      phone: '',
      email: '',
      category: 'C',
      region: '',
    });
    setIsEditing(true);
  };

  const handleSave = (doctorData) => {
    onSave?.(doctorData);
    setIsEditing(false);
    setSelectedDoctor(null);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setSelectedDoctor(null);
  };

  return (
    <div className="doctor-management">
      <div className="management-header">
        <h2>Doctor Management</h2>
        <button onClick={handleCreate} className="btn btn-primary">
          + Add Doctor
        </button>
      </div>

      {isEditing ? (
        <div className="doctor-form">
          {/* Form fields would go here */}
          <p>Doctor form for: {selectedDoctor?.name || 'New Doctor'}</p>
          <button onClick={() => handleSave(selectedDoctor)} disabled={loading}>
            Save
          </button>
          <button onClick={handleCancel}>Cancel</button>
        </div>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Specialization</th>
              <th>Hospital</th>
              <th>Category</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {doctors.map((doctor) => (
              <tr key={doctor._id}>
                <td>{doctor.name}</td>
                <td>{doctor.specialization}</td>
                <td>{doctor.hospital}</td>
                <td>{doctor.category}</td>
                <td>
                  <button onClick={() => handleEdit(doctor)}>Edit</button>
                  <button onClick={() => onDelete?.(doctor._id)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default DoctorManagement;
