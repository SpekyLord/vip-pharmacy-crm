/**
 * EmployeeManagement Component
 *
 * Admin component for managing employees:
 * - CRUD operations for employees
 * - Role assignment
 * - Account activation/deactivation
 */

import { useState, useEffect } from 'react';

const employeeManagementStyles = `
  .employee-management {
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

  .btn-success {
    background: #16a34a;
    color: white;
  }

  .btn-success:hover {
    background: #15803d;
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

  /* Badges */
  .role-badge {
    display: inline-block;
    padding: 4px 8px;
    border-radius: 12px;
    font-size: 12px;
    font-weight: 500;
    text-transform: capitalize;
  }

  .role-badge.role-admin {
    background: #fef3c7;
    color: #d97706;
  }

  .role-badge.role-employee {
    background: #dcfce7;
    color: #16a34a;
  }

  .status-badge {
    display: inline-block;
    padding: 4px 8px;
    border-radius: 12px;
    font-size: 12px;
    font-weight: 500;
  }

  .status-badge.status-active {
    background: #dcfce7;
    color: #16a34a;
  }

  .status-badge.status-inactive {
    background: #fee2e2;
    color: #dc2626;
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
  .form-group select {
    width: 100%;
    padding: 10px 12px;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    font-size: 14px;
    box-sizing: border-box;
  }

  .form-group input:focus,
  .form-group select:focus {
    outline: none;
    border-color: #2563eb;
    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
  }

  .form-group input:disabled {
    background: #f3f4f6;
    cursor: not-allowed;
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

  /* Password hint */
  .password-hint {
    font-size: 12px;
    color: #6b7280;
    margin-top: 4px;
  }
`;

const EmployeeManagement = ({
  employees = [],
  filters = {},
  pagination = {},
  loading = false,
  onSave,
  onDelete,
  onToggleStatus,
  onFilterChange,
  onPageChange,
}) => {
  const [showModal, setShowModal] = useState(false);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    phone: '',
    role: 'employee',
  });
  const [saving, setSaving] = useState(false);
  const [localFilters, setLocalFilters] = useState(filters);

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
    setSelectedEmployee(null);
    setFormData({
      name: '',
      email: '',
      password: '',
      phone: '',
      role: 'employee',
    });
    setShowModal(true);
  };

  const handleEdit = (employee) => {
    setSelectedEmployee(employee);
    setFormData({
      name: employee.name || '',
      email: employee.email || '',
      password: '', // Don't show existing password
      phone: employee.phone || '',
      role: employee.role || 'employee',
    });
    setShowModal(true);
  };

  const handleDeleteClick = (employee) => {
    setSelectedEmployee(employee);
    setShowConfirmDelete(true);
  };

  const handleConfirmDelete = async () => {
    if (selectedEmployee) {
      await onDelete?.(selectedEmployee._id);
      setShowConfirmDelete(false);
      setSelectedEmployee(null);
    }
  };

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);

    const employeeData = {
      name: formData.name,
      email: formData.email,
      phone: formData.phone,
      role: formData.role,
    };

    // Only include password for new employees or if it's been changed
    if (!selectedEmployee && formData.password) {
      employeeData.password = formData.password;
    } else if (selectedEmployee && formData.password) {
      employeeData.password = formData.password;
    }

    if (selectedEmployee) {
      employeeData._id = selectedEmployee._id;
    }

    const success = await onSave?.(employeeData);
    setSaving(false);

    if (success) {
      setShowModal(false);
      setSelectedEmployee(null);
    }
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setSelectedEmployee(null);
  };

  return (
    <div className="employee-management">
      <style>{employeeManagementStyles}</style>

      <div className="management-header">
        <h2>BDMs ({pagination.total || employees.length})</h2>
        <button onClick={handleCreate} className="btn btn-primary">
          + Add BDM
        </button>
      </div>

      {/* Filters */}
      <div className="filters-bar">
        <input
          type="text"
          placeholder="Search by name or email..."
          value={localFilters.search || ''}
          onChange={(e) => handleFilterChange('search', e.target.value)}
        />
        <select
          value={filters.role || ''}
          onChange={(e) => handleFilterChange('role', e.target.value)}
        >
          <option value="">All Roles</option>
          <option value="admin">Admin</option>
          <option value="employee">BDM</option>
        </select>
        <select
          value={filters.isActive === '' ? '' : filters.isActive}
          onChange={(e) => handleFilterChange('isActive', e.target.value)}
        >
          <option value="">All Status</option>
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </select>
      </div>

      {/* Table */}
      <div className={loading ? 'table-loading' : ''}>
        {employees.length > 0 ? (
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Role</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((employee) => (
                <tr key={employee._id}>
                  <td>{employee.name}</td>
                  <td>{employee.email}</td>
                  <td>{employee.phone || '-'}</td>
                  <td>
                    <span className={`role-badge role-${employee.role}`}>
                      {employee.role === 'employee' ? 'BDM' : 'Admin'}
                    </span>
                  </td>
                  <td>
                    <span
                      className={`status-badge ${
                        employee.isActive ? 'status-active' : 'status-inactive'
                      }`}
                    >
                      {employee.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="actions">
                    <button
                      onClick={() => handleEdit(employee)}
                      className="btn btn-secondary btn-sm"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => onToggleStatus?.(employee)}
                      className={`btn btn-sm ${employee.isActive ? 'btn-danger' : 'btn-success'}`}
                    >
                      {employee.isActive ? 'Deactivate' : 'Activate'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty-state">
            <p>No BDMs found</p>
          </div>
        )}
      </div>

      {/* Pagination */}
      {pagination.pages > 1 && (
        <div className="pagination">
          <div className="pagination-info">
            Showing {(pagination.page - 1) * pagination.limit + 1} to{' '}
            {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
            {pagination.total} BDMs
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
              <h3>{selectedEmployee ? 'Edit BDM' : 'Add New BDM'}</h3>
              <button className="modal-close" onClick={handleCloseModal}>
                &times;
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="name">Full Name *</label>
                  <input
                    type="text"
                    id="name"
                    name="name"
                    value={formData.name}
                    onChange={handleFormChange}
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="email">Email *</label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    value={formData.email}
                    onChange={handleFormChange}
                    required
                    disabled={!!selectedEmployee}
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="password">
                    {selectedEmployee ? 'New Password' : 'Password *'}
                  </label>
                  <input
                    type="password"
                    id="password"
                    name="password"
                    value={formData.password}
                    onChange={handleFormChange}
                    required={!selectedEmployee}
                    placeholder={selectedEmployee ? 'Leave blank to keep current' : ''}
                    minLength={8}
                  />
                  <p className="password-hint">Minimum 8 characters</p>
                </div>
                <div className="form-group">
                  <label htmlFor="phone">Phone</label>
                  <input
                    type="tel"
                    id="phone"
                    name="phone"
                    value={formData.phone}
                    onChange={handleFormChange}
                    placeholder="+63..."
                  />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="role">Role *</label>
                <select
                  id="role"
                  name="role"
                  value={formData.role}
                  onChange={handleFormChange}
                  required
                >
                  <option value="employee">BDM (Field Rep)</option>
                  <option value="admin">Admin</option>
                </select>
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
                  {saving ? 'Saving...' : selectedEmployee ? 'Update BDM' : 'Add BDM'}
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
              <h3>Confirm Deactivation</h3>
              <button
                className="modal-close"
                onClick={() => setShowConfirmDelete(false)}
              >
                &times;
              </button>
            </div>
            <p>
              Are you sure you want to deactivate <strong>{selectedEmployee?.name}</strong>?
              They will no longer be able to log in.
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

export default EmployeeManagement;
