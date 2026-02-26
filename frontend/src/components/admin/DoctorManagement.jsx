/**
 * DoctorManagement Component
 *
 * Admin component for managing doctors:
 * - CRUD operations for doctors
 * - Search and filter
 * - Pagination
 * - Add/Edit modal with cascading region dropdowns
 */

import { useState, useEffect } from 'react';
import regionService from '../../services/regionService';

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

  /* Confirm modal */
  .confirm-modal-content {
    max-width: 400px;
    text-align: center;
  }

  .confirm-modal-content p {
    margin: 0 0 24px 0;
    color: #374151;
  }

  .confirm-actions {
    display: flex;
    justify-content: center;
    gap: 12px;
  }
`;

const DoctorManagement = ({
  doctors = [],
  regions = [],
  filters = {},
  pagination = {},
  loading = false,
  onSave,
  onDelete,
  onFilterChange,
  onPageChange,
}) => {
  const [showModal, setShowModal] = useState(false);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [selectedDoctor, setSelectedDoctor] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    specialization: '',
    hospital: '',
    addressStreet: '',
    phone: '',
    email: '',
    region: '',
    visitFrequency: 4,
    notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [localFilters, setLocalFilters] = useState(filters);

  // Cascading region dropdown state
  const [selectedCountry, setSelectedCountry] = useState('');
  const [selectedRegion, setSelectedRegion] = useState('');
  const [selectedProvince, setSelectedProvince] = useState('');
  const [selectedCity, setSelectedCity] = useState('');
  const [selectedDistrict, setSelectedDistrict] = useState('');

  const [countries, setCountries] = useState([]);
  const [regionOptions, setRegionOptions] = useState([]);
  const [provinceOptions, setProvinceOptions] = useState([]);
  const [cityOptions, setCityOptions] = useState([]);
  const [districtOptions, setDistrictOptions] = useState([]);
  const [loadingRegions, setLoadingRegions] = useState(false);

  // Load countries (root level) on mount
  useEffect(() => {
    const loadCountries = async () => {
      try {
        const response = await regionService.getHierarchy();
        // Root level items are countries
        setCountries(response.data || []);
      } catch (error) {
        console.error('Failed to load countries:', error);
      }
    };
    loadCountries();
  }, []);

  // Update formData.region when any cascading selection changes
  useEffect(() => {
    // Use the most specific selection
    const finalRegion = selectedDistrict || selectedCity || selectedProvince || selectedRegion || selectedCountry || '';
    setFormData((prev) => ({ ...prev, region: finalRegion }));
  }, [selectedCountry, selectedRegion, selectedProvince, selectedCity, selectedDistrict]);

  // Handler for country change - load regions
  const handleCountryChange = async (countryId) => {
    setSelectedCountry(countryId);
    // Clear downstream
    setSelectedRegion('');
    setSelectedProvince('');
    setSelectedCity('');
    setSelectedDistrict('');
    setProvinceOptions([]);
    setCityOptions([]);
    setDistrictOptions([]);

    if (countryId) {
      setLoadingRegions(true);
      try {
        const response = await regionService.getChildren(countryId);
        setRegionOptions(response.data?.children || []);
      } catch (error) {
        console.error('Failed to load regions:', error);
        setRegionOptions([]);
      }
      setLoadingRegions(false);
    } else {
      setRegionOptions([]);
    }
  };

  // Handler for region change - load provinces
  const handleRegionChange = async (regionId) => {
    setSelectedRegion(regionId);
    // Clear downstream
    setSelectedProvince('');
    setSelectedCity('');
    setSelectedDistrict('');
    setCityOptions([]);
    setDistrictOptions([]);

    if (regionId) {
      setLoadingRegions(true);
      try {
        const response = await regionService.getChildren(regionId);
        setProvinceOptions(response.data?.children || []);
      } catch (error) {
        console.error('Failed to load provinces:', error);
        setProvinceOptions([]);
      }
      setLoadingRegions(false);
    } else {
      setProvinceOptions([]);
    }
  };

  // Handler for province change - load cities
  const handleProvinceChange = async (provinceId) => {
    setSelectedProvince(provinceId);
    // Clear downstream
    setSelectedCity('');
    setSelectedDistrict('');
    setDistrictOptions([]);

    if (provinceId) {
      setLoadingRegions(true);
      try {
        const response = await regionService.getChildren(provinceId);
        setCityOptions(response.data?.children || []);
      } catch (error) {
        console.error('Failed to load cities:', error);
        setCityOptions([]);
      }
      setLoadingRegions(false);
    } else {
      setCityOptions([]);
    }
  };

  // Handler for city change - load districts
  const handleCityChange = async (cityId) => {
    setSelectedCity(cityId);
    // Clear downstream
    setSelectedDistrict('');

    if (cityId) {
      setLoadingRegions(true);
      try {
        const response = await regionService.getChildren(cityId);
        setDistrictOptions(response.data?.children || []);
      } catch (error) {
        console.error('Failed to load districts:', error);
        setDistrictOptions([]);
      }
      setLoadingRegions(false);
    } else {
      setDistrictOptions([]);
    }
  };

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

  // Helper to ensure value is an array
  const ensureArray = (value) => {
    if (Array.isArray(value)) return value;
    return [];
  };

  // Helper function to populate cascading dropdowns for edit mode
  const populateCascadingDropdowns = async (doctorRegion) => {
    if (!doctorRegion) return;

    const regionId = doctorRegion._id || doctorRegion;

    try {
      // Get the ancestor chain for this region
      const hierarchyResponse = await regionService.getHierarchy();
      const hierarchy = ensureArray(hierarchyResponse?.data);

      // Find the region and its ancestors in the hierarchy
      const findRegionPath = (nodes, targetId, path = []) => {
        for (const node of nodes) {
          const currentPath = [...path, node];
          if (node._id === targetId) {
            return currentPath;
          }
          if (node.children && node.children.length > 0) {
            const found = findRegionPath(node.children, targetId, currentPath);
            if (found) return found;
          }
        }
        return null;
      };

      const regionPath = findRegionPath(hierarchy, regionId);

      if (regionPath && regionPath.length > 0) {
        // Set each level based on the path
        // Path order: [country, region, province, city, district, ...]
        const countryNode = regionPath[0];
        setSelectedCountry(countryNode._id);
        setCountries(hierarchy);

        if (regionPath.length > 1) {
          const regionNode = regionPath[1];
          setRegionOptions(ensureArray(countryNode.children));
          setSelectedRegion(regionNode._id);

          if (regionPath.length > 2) {
            const provinceNode = regionPath[2];
            setProvinceOptions(ensureArray(regionNode.children));
            setSelectedProvince(provinceNode._id);

            if (regionPath.length > 3) {
              const cityNode = regionPath[3];
              setCityOptions(ensureArray(provinceNode.children));
              setSelectedCity(cityNode._id);

              if (regionPath.length > 4) {
                const districtNode = regionPath[4];
                setDistrictOptions(ensureArray(cityNode.children));
                setSelectedDistrict(districtNode._id);
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('Failed to populate cascading dropdowns:', error);
      // Reset all options to empty arrays on error
      setRegionOptions([]);
      setProvinceOptions([]);
      setCityOptions([]);
      setDistrictOptions([]);
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
      region: '',
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
    });
    // Reset cascading dropdowns
    setSelectedCountry('');
    setSelectedRegion('');
    setSelectedProvince('');
    setSelectedCity('');
    setSelectedDistrict('');
    setRegionOptions([]);
    setProvinceOptions([]);
    setCityOptions([]);
    setDistrictOptions([]);
    setShowModal(true);
  };

  const handleEdit = async (doctor) => {
    setSelectedDoctor(doctor);

    setFormData({
      firstName: doctor.firstName || '',
      lastName: doctor.lastName || '',
      specialization: doctor.specialization || '',
      clinicOfficeAddress: doctor.clinicOfficeAddress || '',
      phone: doctor.phone || '',
      email: doctor.email || '',
      region: doctor.region?._id || doctor.region || '',
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
    });

    // Show modal first so user sees immediate feedback
    setShowModal(true);

    // Populate cascading dropdowns with error handling
    try {
      await populateCascadingDropdowns(doctor.region);
    } catch (error) {
      console.error('Failed to populate region dropdowns:', error);
      // Modal is already shown, user can still edit other fields
    }
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
      region: formData.region,
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
        <h2>VIP Clients ({pagination.total || doctors.length})</h2>
        <button onClick={handleCreate} className="btn btn-primary">
          + Add VIP Client
        </button>
      </div>

      {/* Filters */}
      <div className="filters-bar">
        <input
          type="text"
          placeholder="Search by name or hospital..."
          value={localFilters.search || ''}
          onChange={(e) => handleFilterChange('search', e.target.value)}
        />
        <select
          value={filters.region || ''}
          onChange={(e) => handleFilterChange('region', e.target.value)}
        >
          <option value="">All Regions</option>
          {regions.map((region) => (
            <option key={region._id} value={region._id}>
              {'──'.repeat(region.depth || 0)} {region.name}
            </option>
          ))}
        </select>
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
      </div>

      {/* Table */}
      <div className={loading ? 'table-loading' : ''}>
        {doctors.length > 0 ? (
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Specialization</th>
                <th>Hospital</th>
                <th>Region</th>
                <th>Visit Freq</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {doctors.map((doctor) => (
                <tr key={doctor._id}>
                  <td>{doctor.fullName || `${doctor.firstName} ${doctor.lastName}`}</td>
                  <td>{doctor.specialization || '-'}</td>
                  <td>{doctor.clinicOfficeAddress || '-'}</td>
                  <td>{doctor.region?.name || '-'}</td>
                  <td>
                    <span className={`visit-freq-badge freq-${doctor.visitFrequency}`}>
                      {doctor.visitFrequency}x/mo
                    </span>
                  </td>
                  <td className="actions">
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
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty-state">
            <p>No VIP Clients found</p>
          </div>
        )}
      </div>

      {/* Pagination */}
      {pagination.pages > 1 && (
        <div className="pagination">
          <div className="pagination-info">
            Showing {(pagination.page - 1) * pagination.limit + 1} to{' '}
            {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
            {pagination.total} VIP Clients
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
                  <input
                    type="text"
                    id="specialization"
                    name="specialization"
                    value={formData.specialization}
                    onChange={handleFormChange}
                    placeholder="e.g. Pedia Hema, Im Car, Breast Surg"
                  />
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

              {/* Cascading Region Dropdowns */}
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="country">Country *</label>
                  <select
                    id="country"
                    value={selectedCountry}
                    onChange={(e) => handleCountryChange(e.target.value)}
                    required
                    disabled={loadingRegions}
                  >
                    <option value="">Select Country</option>
                    {Array.isArray(countries) && countries.map((country) => (
                      <option key={country._id} value={country._id}>
                        {country.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="regionSelect">Region</label>
                  <select
                    id="regionSelect"
                    value={selectedRegion}
                    onChange={(e) => handleRegionChange(e.target.value)}
                    disabled={!selectedCountry || loadingRegions}
                  >
                    <option value="">{Array.isArray(regionOptions) && regionOptions.length > 0 ? 'Select Region (optional)' : 'No regions available'}</option>
                    {Array.isArray(regionOptions) && regionOptions.map((region) => (
                      <option key={region._id} value={region._id}>
                        {region.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="province">Province</label>
                  <select
                    id="province"
                    value={selectedProvince}
                    onChange={(e) => handleProvinceChange(e.target.value)}
                    disabled={!selectedRegion || loadingRegions}
                  >
                    <option value="">{Array.isArray(provinceOptions) && provinceOptions.length > 0 ? 'Select Province (optional)' : 'No provinces available'}</option>
                    {Array.isArray(provinceOptions) && provinceOptions.map((province) => (
                      <option key={province._id} value={province._id}>
                        {province.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="city">City/Municipality</label>
                  <select
                    id="city"
                    value={selectedCity}
                    onChange={(e) => handleCityChange(e.target.value)}
                    disabled={!selectedProvince || loadingRegions}
                  >
                    <option value="">{Array.isArray(cityOptions) && cityOptions.length > 0 ? 'Select City (optional)' : 'No cities available'}</option>
                    {Array.isArray(cityOptions) && cityOptions.map((city) => (
                      <option key={city._id} value={city._id}>
                        {city.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {Array.isArray(districtOptions) && districtOptions.length > 0 && (
                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="district">District/Area</label>
                    <select
                      id="district"
                      value={selectedDistrict}
                      onChange={(e) => setSelectedDistrict(e.target.value)}
                      disabled={!selectedCity || loadingRegions}
                    >
                      <option value="">Select District (optional)</option>
                      {districtOptions.map((district) => (
                        <option key={district._id} value={district._id}>
                          {district.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {loadingRegions && (
                <p style={{ fontSize: '12px', color: '#6b7280', margin: '8px 0' }}>Loading regions...</p>
              )}

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
      {showConfirmDelete && (
        <div className="modal-overlay" onClick={() => setShowConfirmDelete(false)}>
          <div
            className="modal-content confirm-modal-content"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h3>Confirm Delete</h3>
              <button
                className="modal-close"
                onClick={() => setShowConfirmDelete(false)}
              >
                &times;
              </button>
            </div>
            <p>
              Are you sure you want to deactivate <strong>{selectedDoctor?.fullName || `${selectedDoctor?.firstName} ${selectedDoctor?.lastName}`}</strong>?
              This action can be undone later.
            </p>
            <div className="confirm-actions">
              <button
                onClick={() => setShowConfirmDelete(false)}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button onClick={handleConfirmDelete} className="btn btn-danger">
                Deactivate
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DoctorManagement;
