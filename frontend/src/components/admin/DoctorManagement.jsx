/**
 * DoctorManagement Component
 *
 * Admin component for managing doctors:
 * - CRUD operations for doctors
 * - Search and filter
 * - Pagination
 * - Add/Edit modal
 */

import { useState, useEffect } from 'react';
import doctorService from '../../services/doctorService';
import userService from '../../services/userService';
import ConfirmDeleteModal from '../common/ConfirmDeleteModal';

// Enum options for programs and support types (matching backend Doctor.js)
const PROGRAMS = ['CME GRANT', 'REBATES / MONEY', 'REST AND RECREATION', 'MED SOCIETY PARTICIPATION'];
const SUPPORT_TYPES = ['STARTER DOSES', 'PROMATS', 'FULL DOSE', 'PATIENT DISCOUNT', 'AIR FRESHENER'];
const ENGAGEMENT_LEVELS = [
  { value: 1, label: '1 - Visited 4 times' },
  { value: 2, label: '2 - Knows BDM/products' },
  { value: 3, label: '3 - Tried products' },
  { value: 4, label: '4 - In group chat' },
  { value: 5, label: '5 - Active partner' },
];

const doctorManagementStyles = `
  .doctor-management {
    background: white;
    border-radius: 12px;
    padding: 24px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }

  .management-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 24px;
  }

  .management-header h2 {
    margin: 0;
    font-size: 20px;
    color: #1f2937;
  }

  .btn {
    padding: 10px 20px;
    border: none;
    border-radius: 8px;
    font-size: 14px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-primary {
    background: #2563eb;
    color: white;
  }

  .btn-primary:hover {
    background: #1d4ed8;
  }

  .btn-secondary {
    background: #6b7280;
    color: white;
  }

  .btn-secondary:hover {
    background: #4b5563;
  }

  .btn-danger {
    background: #dc2626;
    color: white;
  }

  .btn-danger:hover {
    background: #b91c1c;
  }

  .btn-sm {
    padding: 6px 12px;
    font-size: 12px;
  }

  /* Filters */
  .filters-bar {
    display: flex;
    gap: 12px;
    margin-bottom: 20px;
    flex-wrap: wrap;
  }

  .filters-bar input,
  .filters-bar select {
    padding: 10px 12px;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    font-size: 14px;
  }

  .filters-bar input {
    flex: 1;
    min-width: 200px;
  }

  .filters-bar select {
    min-width: 150px;
  }

  .filters-bar input:focus,
  .filters-bar select:focus {
    outline: none;
    border-color: #2563eb;
    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
  }

  /* Table */
  .data-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 14px;
  }

  .data-table th,
  .data-table td {
    padding: 12px;
    text-align: left;
    border-bottom: 1px solid #e5e7eb;
  }

  .data-table th {
    background: #f9fafb;
    font-weight: 600;
    color: #374151;
  }

  .data-table tr:hover {
    background: #f9fafb;
  }

  .data-table .actions {
    display: flex;
    gap: 8px;
  }

  .visit-freq-badge {
    display: inline-block;
    padding: 4px 8px;
    border-radius: 12px;
    font-size: 12px;
    font-weight: 500;
  }

  .visit-freq-badge.freq-2 {
    background: #dbeafe;
    color: #1d4ed8;
  }

  .visit-freq-badge.freq-4 {
    background: #dcfce7;
    color: #16a34a;
  }

  .eng-badge {
    display: inline-block;
    padding: 4px 8px;
    border-radius: 12px;
    font-size: 12px;
    font-weight: 500;
  }

  .eng-badge.eng-low {
    background: #fef2f2;
    color: #dc2626;
  }

  .eng-badge.eng-mid {
    background: #fefce8;
    color: #a16207;
  }

  .eng-badge.eng-high {
    background: #f0fdf4;
    color: #16a34a;
  }

  /* Pagination */
  .pagination {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 20px;
    padding-top: 20px;
    border-top: 1px solid #e5e7eb;
  }

  .pagination-info {
    color: #6b7280;
    font-size: 14px;
  }

  .pagination-buttons {
    display: flex;
    gap: 8px;
  }

  .pagination-btn {
    padding: 8px 16px;
    border: 1px solid #d1d5db;
    background: white;
    border-radius: 6px;
    cursor: pointer;
    font-size: 14px;
  }

  .pagination-btn:hover:not(:disabled) {
    background: #f3f4f6;
  }

  .pagination-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Modal */
  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .modal-content {
    background: white;
    border-radius: 12px;
    padding: 24px;
    width: 90%;
    max-width: 600px;
    max-height: 90vh;
    overflow-y: auto;
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
    padding-bottom: 16px;
    border-bottom: 1px solid #e5e7eb;
  }

  .modal-header h3 {
    margin: 0;
    font-size: 18px;
    color: #1f2937;
  }

  .modal-close {
    background: none;
    border: none;
    font-size: 24px;
    cursor: pointer;
    color: #6b7280;
  }

  .modal-close:hover {
    color: #1f2937;
  }

  /* Form */
  .form-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    margin-bottom: 16px;
  }

  .form-group {
    margin-bottom: 16px;
  }

  .form-group.full-width {
    grid-column: 1 / -1;
  }

  .form-group label {
    display: block;
    margin-bottom: 6px;
    font-weight: 500;
    color: #374151;
    font-size: 14px;
  }

  .form-group input,
  .form-group select,
  .form-group textarea {
    width: 100%;
    padding: 10px 12px;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    font-size: 14px;
    box-sizing: border-box;
  }

  .form-group input:focus,
  .form-group select:focus,
  .form-group textarea:focus {
    outline: none;
    border-color: #2563eb;
    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
  }

  .form-group textarea {
    resize: vertical;
    min-height: 80px;
  }

  .form-actions {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    margin-top: 24px;
    padding-top: 16px;
    border-top: 1px solid #e5e7eb;
  }

  /* Empty state */
  .empty-state {
    text-align: center;
    padding: 48px;
    color: #6b7280;
  }

  .empty-state p {
    margin: 0;
    font-size: 16px;
  }

  /* Loading overlay */
  .table-loading {
    opacity: 0.5;
    pointer-events: none;
  }

  /* Mass delete styles */
  .dm-mass-delete-modal {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .dm-mass-delete-content {
    background: white;
    border-radius: 12px;
    padding: 24px;
    width: 90%;
    max-width: 460px;
  }

  .dm-mass-delete-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
    padding-bottom: 12px;
    border-bottom: 1px solid #e5e7eb;
  }

  .dm-mass-delete-header h3 {
    margin: 0;
    font-size: 18px;
    color: #1f2937;
  }

  .dm-mass-close {
    background: none;
    border: none;
    font-size: 24px;
    cursor: pointer;
    color: #6b7280;
    line-height: 1;
  }

  .dm-mass-close:hover {
    color: #1f2937;
  }

  .dm-mass-select {
    width: 100%;
    padding: 10px 12px;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    font-size: 14px;
    margin-bottom: 16px;
  }

  .dm-mass-count {
    background: #fef3c7;
    color: #92400e;
    padding: 10px 14px;
    border-radius: 6px;
    font-size: 14px;
    font-weight: 500;
    margin-bottom: 16px;
    text-align: center;
  }

  .dm-mass-zero {
    background: #f3f4f6;
    color: #6b7280;
    padding: 10px 14px;
    border-radius: 6px;
    font-size: 14px;
    margin-bottom: 16px;
    text-align: center;
  }

  .dm-mass-actions {
    display: flex;
    gap: 12px;
    justify-content: flex-end;
  }

  .dm-mass-actions .btn {
    min-width: 100px;
  }

  /* Mobile Card View */
  .mobile-card-list {
    display: none;
  }

  .mobile-card {
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 12px;
    padding: 16px;
    margin-bottom: 12px;
  }

  .mobile-card-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 10px;
  }

  .mobile-card-name {
    font-size: 15px;
    font-weight: 600;
    color: #1f2937;
  }

  .mobile-card-meta {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 12px;
  }

  .mobile-card-row {
    display: flex;
    justify-content: space-between;
    font-size: 13px;
    color: #6b7280;
  }

  .mobile-card-row span:last-child {
    color: #374151;
    font-weight: 500;
  }

  .mobile-card-actions {
    display: flex;
    gap: 8px;
    padding-top: 12px;
    border-top: 1px solid #f3f4f6;
  }

  .mobile-card-actions .btn {
    flex: 1;
    text-align: center;
    min-height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  /* Responsive - Tablet */
  @media (max-width: 1024px) {
    .data-table th:nth-child(3),
    .data-table td:nth-child(3) {
      display: none;
    }
    .doctor-management {
      padding: 16px;
    }
  }

  /* Responsive - Mobile */
  @media (max-width: 480px) {
    .doctor-management {
      padding: 12px;
      border-radius: 10px;
    }

    .management-header {
      flex-direction: column;
      gap: 12px;
      align-items: stretch;
    }

    .management-header .btn {
      width: 100%;
      min-height: 44px;
      text-align: center;
    }

    .filters-bar {
      flex-direction: column;
    }

    .filters-bar input,
    .filters-bar select {
      min-width: 0;
      width: 100%;
      min-height: 44px;
    }

    .data-table {
      display: none;
    }

    .mobile-card-list {
      display: block;
    }

    .pagination {
      flex-direction: column;
      gap: 12px;
      align-items: center;
    }

    .pagination-info {
      font-size: 13px;
    }

    .pagination-btn {
      min-height: 44px;
      padding: 10px 20px;
    }

    /* Modal full-screen on mobile */
    .modal-content {
      width: 100%;
      max-width: 100%;
      height: 100vh;
      max-height: 100vh;
      border-radius: 0;
      padding: 16px;
    }

    .form-row {
      grid-template-columns: 1fr;
      gap: 0;
    }

    .form-group input,
    .form-group select,
    .form-group textarea {
      min-height: 44px;
      font-size: 16px;
    }

    .form-actions {
      flex-direction: column-reverse;
    }

    .form-actions .btn {
      width: 100%;
      min-height: 48px;
    }

    .dm-mass-delete-content {
      width: 92%;
    }

    .dm-mass-actions {
      flex-direction: column-reverse;
    }

    .dm-mass-actions .btn {
      width: 100%;
      min-height: 44px;
    }
  }
`;

const DoctorManagement = ({
  doctors = [],
  filters = {},
  pagination = {},
  loading = false,
  onSave,
  onDelete,
  onMassDeleteByUser,
  onUpgradeToVIP,
  onFilterChange,
  onPageChange,
}) => {
  const [showModal, setShowModal] = useState(false);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [selectedDoctor, setSelectedDoctor] = useState(null);

  // Mass delete state
  const [showMassDelete, setShowMassDelete] = useState(false);
  const [showMassDeleteConfirm, setShowMassDeleteConfirm] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [selectedBdmId, setSelectedBdmId] = useState('');
  const [massDeleteCount, setMassDeleteCount] = useState(null);
  const [massDeleteLoading, setMassDeleteLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    specialization: '',
    hospital: '',
    addressStreet: '',
    phone: '',
    email: '',
    visitFrequency: 4,
    notes: '',
    assignedTo: '',
  });
  const [saving, setSaving] = useState(false);
  const [localFilters, setLocalFilters] = useState(filters);
  const [specializations, setSpecializations] = useState([]);

  // Fetch distinct specializations from database
  useEffect(() => {
    doctorService.getSpecializations()
      .then((res) => setSpecializations(res.data || []))
      .catch(() => setSpecializations([]));
  }, []);

  // Fetch employees list for mass delete BDM dropdown
  useEffect(() => {
    userService.getEmployees()
      .then((res) => setEmployees(res.data || []))
      .catch(() => setEmployees([]));
  }, []);

  // Fetch count when BDM is selected for mass delete
  useEffect(() => {
    if (!selectedBdmId) {
      setMassDeleteCount(null);
      return;
    }
    doctorService.countByUser(selectedBdmId)
      .then((res) => setMassDeleteCount(res.data?.count ?? 0))
      .catch(() => setMassDeleteCount(null));
  }, [selectedBdmId]);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (localFilters.search !== filters.search) {
        onFilterChange?.({ ...filters, search: localFilters.search });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [localFilters.search]);

  const handleFilterChange = (field, value) => {
    if (field === 'search') {
      setLocalFilters((prev) => ({ ...prev, search: value }));
    } else {
      onFilterChange?.({ ...filters, [field]: value });
    }
  };

  const handleCreate = () => {
    setSelectedDoctor(null);
    setFormData({
      firstName: '',
      lastName: '',
      specialization: '',
      clinicOfficeAddress: '',
      phone: '',
      email: '',
      visitFrequency: 4,
      notes: '',
      outletIndicator: '',
      programsToImplement: [],
      supportDuringCoverage: [],
      levelOfEngagement: '',
      secretaryName: '',
      secretaryPhone: '',
      birthday: '',
      anniversary: '',
      otherDetails: '',
      assignedTo: '',
    });
    setShowModal(true);
  };

  const handleEdit = (doctor) => {
    setSelectedDoctor(doctor);

    setFormData({
      firstName: doctor.firstName || '',
      lastName: doctor.lastName || '',
      specialization: doctor.specialization || '',
      clinicOfficeAddress: doctor.clinicOfficeAddress || '',
      phone: doctor.phone || '',
      email: doctor.email || '',
      visitFrequency: doctor.visitFrequency || 4,
      notes: doctor.notes || '',
      outletIndicator: doctor.outletIndicator || '',
      programsToImplement: doctor.programsToImplement || [],
      supportDuringCoverage: doctor.supportDuringCoverage || [],
      levelOfEngagement: doctor.levelOfEngagement || '',
      secretaryName: doctor.secretaryName || '',
      secretaryPhone: doctor.secretaryPhone || '',
      birthday: doctor.birthday ? doctor.birthday.split('T')[0] : '',
      anniversary: doctor.anniversary ? doctor.anniversary.split('T')[0] : '',
      otherDetails: doctor.otherDetails || '',
      assignedTo: doctor.assignedTo?._id || doctor.assignedTo || '',
    });

    setShowModal(true);
  };

  const handleDeleteClick = (doctor) => {
    setSelectedDoctor(doctor);
    setShowConfirmDelete(true);
  };

  const handleConfirmDelete = async () => {
    if (selectedDoctor) {
      await onDelete?.(selectedDoctor._id);
      setShowConfirmDelete(false);
      setSelectedDoctor(null);
    }
  };

  const handleOpenMassDelete = () => {
    setSelectedBdmId('');
    setMassDeleteCount(null);
    setShowMassDelete(true);
  };

  const handleMassDeleteProceed = () => {
    setShowMassDelete(false);
    setShowMassDeleteConfirm(true);
  };

  const handleMassDeleteConfirm = async () => {
    if (!selectedBdmId) return;
    setMassDeleteLoading(true);
    try {
      await onMassDeleteByUser?.(selectedBdmId);
      setShowMassDeleteConfirm(false);
      setSelectedBdmId('');
      setMassDeleteCount(null);
    } finally {
      setMassDeleteLoading(false);
    }
  };

  const handleMassDeleteCancel = () => {
    setShowMassDeleteConfirm(false);
    setSelectedBdmId('');
    setMassDeleteCount(null);
  };

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: name === 'visitFrequency' ? parseInt(value) : value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);

    // Build doctor data
    const doctorData = {
      firstName: formData.firstName,
      lastName: formData.lastName,
      visitFrequency: formData.visitFrequency,
    };

    // Only include optional fields if they have values
    if (formData.specialization && formData.specialization.trim()) {
      doctorData.specialization = formData.specialization.trim();
    }
    if (formData.clinicOfficeAddress && formData.clinicOfficeAddress.trim()) {
      doctorData.clinicOfficeAddress = formData.clinicOfficeAddress.trim();
    }
    if (formData.phone && formData.phone.trim()) {
      doctorData.phone = formData.phone.trim();
    }
    if (formData.email && formData.email.trim()) {
      doctorData.email = formData.email.trim();
    }
    if (formData.notes && formData.notes.trim()) {
      doctorData.notes = formData.notes.trim();
    }
    if (formData.outletIndicator && formData.outletIndicator.trim()) {
      doctorData.outletIndicator = formData.outletIndicator.trim();
    }
    if (formData.programsToImplement && formData.programsToImplement.length > 0) {
      doctorData.programsToImplement = formData.programsToImplement;
    }
    if (formData.supportDuringCoverage && formData.supportDuringCoverage.length > 0) {
      doctorData.supportDuringCoverage = formData.supportDuringCoverage;
    }
    if (formData.levelOfEngagement) {
      doctorData.levelOfEngagement = parseInt(formData.levelOfEngagement);
    }
    if (formData.secretaryName && formData.secretaryName.trim()) {
      doctorData.secretaryName = formData.secretaryName.trim();
    }
    if (formData.secretaryPhone && formData.secretaryPhone.trim()) {
      doctorData.secretaryPhone = formData.secretaryPhone.trim();
    }
    if (formData.birthday) {
      doctorData.birthday = formData.birthday;
    }
    if (formData.anniversary) {
      doctorData.anniversary = formData.anniversary;
    }
    if (formData.otherDetails && formData.otherDetails.trim()) {
      doctorData.otherDetails = formData.otherDetails.trim();
    }

    // Assign BDM (or explicitly unassign)
    if (formData.assignedTo) {
      doctorData.assignedTo = formData.assignedTo;
    } else {
      doctorData.assignedTo = null;
    }

    if (selectedDoctor) {
      doctorData._id = selectedDoctor._id;
    }

    const success = await onSave?.(doctorData);
    setSaving(false);

    if (success) {
      setShowModal(false);
      setSelectedDoctor(null);
    }
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setSelectedDoctor(null);
  };

  return (
    <div className="doctor-management">
      <style>{doctorManagementStyles}</style>

      <div className="management-header">
        <h2>
          {filters.clientType === 'regular'
            ? `Regular Clients (${pagination.total || doctors.length})`
            : filters.clientType === 'all'
              ? `All Clients (${pagination.total || doctors.length})`
              : `VIP Clients (${pagination.total || doctors.length})`}
        </h2>
        <div style={{ display: 'flex', gap: '8px' }}>
          {onMassDeleteByUser && (
            <button onClick={handleOpenMassDelete} className="btn btn-danger">
              Mass Deactivate
            </button>
          )}
          <button onClick={handleCreate} className="btn btn-primary">
            + Add VIP Client
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="filters-bar">
        <select
          value={filters.clientType || ''}
          onChange={(e) => handleFilterChange('clientType', e.target.value)}
        >
          <option value="">VIP Clients Only</option>
          <option value="all">All (VIP + Regular)</option>
          <option value="regular">Regular Clients Only</option>
        </select>
        <input
          type="text"
          placeholder="Search by name or address..."
          value={localFilters.search || ''}
          onChange={(e) => handleFilterChange('search', e.target.value)}
        />
        {filters.clientType !== 'regular' && (
          <>
            <select
              value={filters.visitFrequency || ''}
              onChange={(e) => handleFilterChange('visitFrequency', e.target.value)}
            >
              <option value="">All Frequencies</option>
              <option value="2">2x per month</option>
              <option value="4">4x per month</option>
            </select>
            <select
              value={filters.supportDuringCoverage || ''}
              onChange={(e) => handleFilterChange('supportDuringCoverage', e.target.value)}
            >
              <option value="">All Support Types</option>
              {SUPPORT_TYPES.map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
            <select
              value={filters.programsToImplement || ''}
              onChange={(e) => handleFilterChange('programsToImplement', e.target.value)}
            >
              <option value="">All Programs</option>
              {PROGRAMS.map((prog) => (
                <option key={prog} value={prog}>{prog}</option>
              ))}
            </select>
          </>
        )}
      </div>

      {/* Table (Desktop/Tablet) + Card List (Mobile) */}
      <div className={loading ? 'table-loading' : ''}>
        {doctors.length > 0 ? (
          <>
            {/* Desktop Table */}
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Type</th>
                    <th>Specialization</th>
                    <th>Hospital</th>
                    <th>Assigned BDM</th>
                    <th>Visit Freq</th>
                    <th>Engagement</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {doctors.map((doctor) => (
                    <tr key={doctor._id}>
                      <td>{doctor.fullName || `${doctor.firstName} ${doctor.lastName}`}</td>
                      <td>
                        {doctor._clientType === 'regular' ? (
                          <span style={{ display: 'inline-block', padding: '3px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 600, background: '#fef3c7', color: '#92400e' }}>Regular</span>
                        ) : (
                          <span style={{ display: 'inline-block', padding: '3px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 600, background: '#dbeafe', color: '#1d4ed8' }}>VIP</span>
                        )}
                      </td>
                      <td>{doctor.specialization || '-'}</td>
                      <td>{doctor.clinicOfficeAddress || '-'}</td>
                      <td>{doctor.assignedTo?.name || doctor._ownerName || '-'}</td>
                      <td>
                        {doctor.visitFrequency ? (
                          <span className={`visit-freq-badge freq-${doctor.visitFrequency}`}>
                            {doctor.visitFrequency}x/mo
                          </span>
                        ) : '-'}
                      </td>
                      <td>
                        {doctor.levelOfEngagement ? (
                          <span className={`eng-badge ${doctor.levelOfEngagement <= 2 ? 'eng-low' : doctor.levelOfEngagement === 3 ? 'eng-mid' : 'eng-high'}`}>
                            {doctor.levelOfEngagement}/5
                          </span>
                        ) : '-'}
                      </td>
                      <td className="actions">
                        {doctor._clientType !== 'regular' ? (
                          <>
                            <button
                              onClick={() => handleEdit(doctor)}
                              className="btn btn-secondary btn-sm"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleDeleteClick(doctor)}
                              className="btn btn-danger btn-sm"
                            >
                              Delete
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => onUpgradeToVIP?.(doctor)}
                            className="btn btn-sm"
                            style={{ background: '#8b5cf6', color: 'white', fontSize: '12px' }}
                          >
                            Upgrade to VIP
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Card List */}
            <div className="mobile-card-list">
              {doctors.map((doctor) => (
                <div key={doctor._id} className="mobile-card">
                  <div className="mobile-card-header">
                    <span className="mobile-card-name">
                      {doctor.fullName || `${doctor.firstName} ${doctor.lastName}`}
                    </span>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      {doctor._clientType === 'regular' ? (
                        <span style={{ padding: '2px 6px', borderRadius: '10px', fontSize: '10px', fontWeight: 600, background: '#fef3c7', color: '#92400e' }}>Regular</span>
                      ) : (
                        <span style={{ padding: '2px 6px', borderRadius: '10px', fontSize: '10px', fontWeight: 600, background: '#dbeafe', color: '#1d4ed8' }}>VIP</span>
                      )}
                      {doctor.visitFrequency && (
                        <span className={`visit-freq-badge freq-${doctor.visitFrequency}`}>
                          {doctor.visitFrequency}x/mo
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="mobile-card-meta">
                    {doctor.specialization && (
                      <div className="mobile-card-row">
                        <span>Specialty</span>
                        <span>{doctor.specialization}</span>
                      </div>
                    )}
                    {doctor.clinicOfficeAddress && (
                      <div className="mobile-card-row">
                        <span>Address</span>
                        <span>{doctor.clinicOfficeAddress}</span>
                      </div>
                    )}
                    {(doctor.assignedTo?.name || doctor._ownerName) && (
                      <div className="mobile-card-row">
                        <span>BDM</span>
                        <span>{doctor.assignedTo?.name || doctor._ownerName}</span>
                      </div>
                    )}
                    {doctor.levelOfEngagement && (
                      <div className="mobile-card-row">
                        <span>Engagement</span>
                        <span className={`eng-badge ${doctor.levelOfEngagement <= 2 ? 'eng-low' : doctor.levelOfEngagement === 3 ? 'eng-mid' : 'eng-high'}`}>
                          {doctor.levelOfEngagement}/5
                        </span>
                      </div>
                    )}
                  </div>
                  {doctor._clientType !== 'regular' ? (
                    <div className="mobile-card-actions">
                      <button
                        onClick={() => handleEdit(doctor)}
                        className="btn btn-secondary btn-sm"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteClick(doctor)}
                        className="btn btn-danger btn-sm"
                      >
                        Delete
                      </button>
                    </div>
                  ) : (
                    <div className="mobile-card-actions">
                      <button
                        onClick={() => onUpgradeToVIP?.(doctor)}
                        className="btn btn-sm"
                        style={{ background: '#8b5cf6', color: 'white', fontSize: '12px', width: '100%' }}
                      >
                        Upgrade to VIP
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="empty-state">
            <p>
              {filters.clientType === 'regular'
                ? 'No Regular Clients found'
                : 'No VIP Clients found'}
            </p>
          </div>
        )}
      </div>

      {/* Pagination */}
      {pagination.pages > 1 && (
        <div className="pagination">
          <div className="pagination-info">
            Showing {(pagination.page - 1) * pagination.limit + 1} to{' '}
            {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
            {pagination.total} {filters.clientType === 'regular' ? 'Clients' : 'VIP Clients'}
          </div>
          <div className="pagination-buttons">
            <button
              className="pagination-btn"
              onClick={() => onPageChange?.(pagination.page - 1)}
              disabled={pagination.page <= 1}
            >
              Previous
            </button>
            <button
              className="pagination-btn"
              onClick={() => onPageChange?.(pagination.page + 1)}
              disabled={pagination.page >= pagination.pages}
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={handleCloseModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{selectedDoctor ? 'Edit VIP Client' : 'Add New VIP Client'}</h3>
              <button className="modal-close" onClick={handleCloseModal}>
                &times;
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="lastName">Last Name *</label>
                  <input
                    type="text"
                    id="lastName"
                    name="lastName"
                    value={formData.lastName}
                    onChange={handleFormChange}
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="firstName">First Name *</label>
                  <input
                    type="text"
                    id="firstName"
                    name="firstName"
                    value={formData.firstName}
                    onChange={handleFormChange}
                    required
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="specialization">VIP Specialty</label>
                  <select
                    id="specialization"
                    name="specialization"
                    value={formData.specialization}
                    onChange={handleFormChange}
                  >
                    <option value="">— Select —</option>
                    {specializations.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="outletIndicator">Outlet Indicator</label>
                  <input
                    type="text"
                    id="outletIndicator"
                    name="outletIndicator"
                    value={formData.outletIndicator}
                    onChange={handleFormChange}
                  />
                </div>
              </div>

              <div className="form-group full-width">
                <label htmlFor="clinicOfficeAddress">Clinic/Office Address</label>
                <input
                  type="text"
                  id="clinicOfficeAddress"
                  name="clinicOfficeAddress"
                  value={formData.clinicOfficeAddress}
                  onChange={handleFormChange}
                  placeholder="Hospital, clinic, or office address"
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="phone">Phone</label>
                  <input
                    type="tel"
                    id="phone"
                    name="phone"
                    value={formData.phone}
                    onChange={handleFormChange}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="email">Email</label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    value={formData.email}
                    onChange={handleFormChange}
                  />
                </div>
              </div>

              <div className="form-group full-width">
                <label htmlFor="notes">Notes</label>
                <textarea
                  id="notes"
                  name="notes"
                  value={formData.notes}
                  onChange={handleFormChange}
                  placeholder="Additional notes about this VIP Client..."
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="levelOfEngagement">Level of Engagement</label>
                  <select
                    id="levelOfEngagement"
                    name="levelOfEngagement"
                    value={formData.levelOfEngagement}
                    onChange={handleFormChange}
                  >
                    <option value="">Select Level</option>
                    {ENGAGEMENT_LEVELS.map((level) => (
                      <option key={level.value} value={level.value}>
                        {level.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="visitFrequencyNew">Visit Frequency *</label>
                  <select
                    id="visitFrequencyNew"
                    name="visitFrequency"
                    value={formData.visitFrequency}
                    onChange={handleFormChange}
                    required
                  >
                    <option value={2}>2x per month</option>
                    <option value={4}>4x per month</option>
                  </select>
                </div>
              </div>

              <div className="form-group full-width">
                <label htmlFor="assignedTo">Assigned BDM</label>
                <select
                  id="assignedTo"
                  name="assignedTo"
                  value={formData.assignedTo}
                  onChange={handleFormChange}
                >
                  <option value="">-- No BDM Assigned --</option>
                  {employees.map((emp) => (
                    <option key={emp._id} value={emp._id}>{emp.name}</option>
                  ))}
                </select>
              </div>

              <div className="form-group full-width">
                <label>Programs to Implement</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '4px' }}>
                  {PROGRAMS.map((program) => (
                    <label key={program} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '13px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        style={{ width: '14px', height: '14px', flexShrink: 0 }}
                        checked={formData.programsToImplement?.includes(program) || false}
                        onChange={(e) => {
                          const updated = e.target.checked
                            ? [...(formData.programsToImplement || []), program]
                            : (formData.programsToImplement || []).filter((p) => p !== program);
                          setFormData((prev) => ({ ...prev, programsToImplement: updated }));
                        }}
                      />
                      {program}
                    </label>
                  ))}
                </div>
              </div>

              <div className="form-group full-width">
                <label>Support During Coverage</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '4px' }}>
                  {SUPPORT_TYPES.map((support) => (
                    <label key={support} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '13px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        style={{ width: '14px', height: '14px', flexShrink: 0 }}
                        checked={formData.supportDuringCoverage?.includes(support) || false}
                        onChange={(e) => {
                          const updated = e.target.checked
                            ? [...(formData.supportDuringCoverage || []), support]
                            : (formData.supportDuringCoverage || []).filter((s) => s !== support);
                          setFormData((prev) => ({ ...prev, supportDuringCoverage: updated }));
                        }}
                      />
                      {support}
                    </label>
                  ))}
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="secretaryName">Secretary Name</label>
                  <input
                    type="text"
                    id="secretaryName"
                    name="secretaryName"
                    value={formData.secretaryName}
                    onChange={handleFormChange}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="secretaryPhone">Secretary Phone</label>
                  <input
                    type="tel"
                    id="secretaryPhone"
                    name="secretaryPhone"
                    value={formData.secretaryPhone}
                    onChange={handleFormChange}
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="birthday">Birthday</label>
                  <input
                    type="date"
                    id="birthday"
                    name="birthday"
                    value={formData.birthday}
                    onChange={handleFormChange}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="anniversary">Anniversary</label>
                  <input
                    type="date"
                    id="anniversary"
                    name="anniversary"
                    value={formData.anniversary}
                    onChange={handleFormChange}
                  />
                </div>
              </div>

              <div className="form-group full-width">
                <label htmlFor="otherDetails">Other Details</label>
                <textarea
                  id="otherDetails"
                  name="otherDetails"
                  value={formData.otherDetails}
                  onChange={handleFormChange}
                  placeholder="Any additional information..."
                />
              </div>

              <div className="form-actions">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={saving}
                >
                  {saving ? 'Saving...' : selectedDoctor ? 'Update VIP Client' : 'Add VIP Client'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmDeleteModal
        isOpen={showConfirmDelete}
        onClose={() => { setShowConfirmDelete(false); setSelectedDoctor(null); }}
        onConfirm={handleConfirmDelete}
        title="Deactivate VIP Client"
        message={
          <p>
            Are you sure you want to deactivate <strong>{selectedDoctor?.fullName || `${selectedDoctor?.firstName} ${selectedDoctor?.lastName}`}</strong>?
            This action can be undone later.
          </p>
        }
        confirmButtonText="Deactivate"
      />

      {/* Mass Delete - Step 1: BDM Picker */}
      {showMassDelete && (
        <div className="dm-mass-delete-modal" onClick={() => setShowMassDelete(false)}>
          <div className="dm-mass-delete-content" onClick={(e) => e.stopPropagation()}>
            <div className="dm-mass-delete-header">
              <h3>Mass Deactivate VIP Clients</h3>
              <button className="dm-mass-close" onClick={() => setShowMassDelete(false)}>&times;</button>
            </div>
            <p style={{ color: '#374151', marginBottom: '16px' }}>
              Select a BDM to deactivate all their assigned VIP Clients.
            </p>
            <select
              className="dm-mass-select"
              value={selectedBdmId}
              onChange={(e) => setSelectedBdmId(e.target.value)}
            >
              <option value="">-- Select a BDM --</option>
              {employees.map((emp) => (
                <option key={emp._id} value={emp._id}>{emp.name}</option>
              ))}
            </select>
            {selectedBdmId && massDeleteCount !== null && massDeleteCount > 0 && (
              <div className="dm-mass-count">
                {massDeleteCount} active VIP Client{massDeleteCount !== 1 ? 's' : ''} assigned to this BDM
              </div>
            )}
            {selectedBdmId && massDeleteCount === 0 && (
              <div className="dm-mass-zero">
                No active VIP Clients assigned to this BDM
              </div>
            )}
            <div className="dm-mass-actions">
              <button onClick={() => setShowMassDelete(false)} className="btn btn-secondary">
                Cancel
              </button>
              <button
                onClick={handleMassDeleteProceed}
                className="btn btn-danger"
                disabled={!selectedBdmId || !massDeleteCount}
              >
                Proceed
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mass Delete - Step 2: Type to Confirm */}
      <ConfirmDeleteModal
        isOpen={showMassDeleteConfirm}
        onClose={handleMassDeleteCancel}
        onConfirm={handleMassDeleteConfirm}
        title="Confirm Mass Deactivation"
        message={
          <p>
            This will deactivate <strong>all active VIP Clients</strong> assigned to{' '}
            <strong>{employees.find((e) => e._id === selectedBdmId)?.name || 'this BDM'}</strong>.
            This action can be undone later by reactivating individual VIP Clients.
          </p>
        }
        confirmButtonText="Deactivate All"
        loading={massDeleteLoading}
        itemCount={massDeleteCount}
      />
    </div>
  );
};

export default DoctorManagement;
