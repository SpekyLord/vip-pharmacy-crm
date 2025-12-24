/**
 * EmployeeManagement Component
 *
 * Admin component for managing employees:
 * - CRUD operations for employees
 * - Role assignment
 * - Region assignment
 * - Account activation/deactivation
 */

import { useState } from 'react';

const EmployeeManagement = ({ employees = [], onSave, onDelete, onToggleStatus, loading = false }) => {
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [isEditing, setIsEditing] = useState(false);

  const handleEdit = (employee) => {
    setSelectedEmployee(employee);
    setIsEditing(true);
  };

  const handleCreate = () => {
    setSelectedEmployee({
      name: '',
      email: '',
      phone: '',
      role: 'employee',
      region: '',
      isActive: true,
    });
    setIsEditing(true);
  };

  const handleSave = (employeeData) => {
    onSave?.(employeeData);
    setIsEditing(false);
    setSelectedEmployee(null);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setSelectedEmployee(null);
  };

  return (
    <div className="employee-management">
      <div className="management-header">
        <h2>Employee Management</h2>
        <button onClick={handleCreate} className="btn btn-primary">
          + Add Employee
        </button>
      </div>

      {isEditing ? (
        <div className="employee-form">
          {/* Form fields would go here */}
          <p>Employee form for: {selectedEmployee?.name || 'New Employee'}</p>
          <button onClick={() => handleSave(selectedEmployee)} disabled={loading}>
            Save
          </button>
          <button onClick={handleCancel}>Cancel</button>
        </div>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
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
                <td>{employee.role}</td>
                <td>
                  <span className={employee.isActive ? 'status-active' : 'status-inactive'}>
                    {employee.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td>
                  <button onClick={() => handleEdit(employee)}>Edit</button>
                  <button onClick={() => onToggleStatus?.(employee._id)}>
                    {employee.isActive ? 'Deactivate' : 'Activate'}
                  </button>
                  <button onClick={() => onDelete?.(employee._id)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default EmployeeManagement;
