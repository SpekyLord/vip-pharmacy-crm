/**
 * EmployeesPage
 *
 * Admin page for employee management:
 * - Employee list with CRUD
 * - Role assignment
 * - Account status management
 */

import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import EmployeeManagement from '../../components/admin/EmployeeManagement';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import userService from '../../services/userService';

const employeesPageStyles = `
  .dashboard-layout {
    min-height: 100vh;
    background: #f3f4f6;
  }

  .dashboard-content {
    display: flex;
  }

  .main-content {
    flex: 1;
    padding: 24px;
    max-width: 1400px;
  }

  .page-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 24px;
  }

  .page-header h1 {
    margin: 0;
    font-size: 28px;
    color: #1f2937;
  }

  .error-banner {
    background: #fee2e2;
    color: #dc2626;
    padding: 16px;
    border-radius: 8px;
    margin-bottom: 24px;
  }

  @media (max-width: 480px) {
    .main-content {
      padding: 16px;
      padding-bottom: 80px;
    }

    .page-header h1 {
      font-size: 22px;
    }
  }
`;

const EmployeesPage = () => {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    pages: 0,
  });
  const [filters, setFilters] = useState({
    search: '',
    role: '',
    isActive: '',
  });

  // Fetch employees with current filters and pagination
  const fetchEmployees = async () => {
    try {
      setLoading(true);
      setError(null);

      const params = {
        page: pagination.page,
        limit: pagination.limit,
      };

      if (filters.search) params.search = filters.search;
      if (filters.role) params.role = filters.role;
      if (filters.isActive !== '') params.isActive = filters.isActive;

      const response = await userService.getAll(params);
      setEmployees(response.data || []);
      setPagination((prev) => ({
        ...prev,
        total: response.pagination?.total || 0,
        pages: response.pagination?.pages || 0,
      }));
    } catch (err) {
      console.error('Failed to fetch employees:', err);
      setError('Failed to load BDMs. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEmployees();
  }, [pagination.page, filters]);

  // Handle create/update employee
  const handleSaveEmployee = async (employeeData) => {
    try {
      if (employeeData._id) {
        // Update existing employee
        await userService.update(employeeData._id, employeeData);
        toast.success('BDM updated successfully');
      } else {
        // Create new employee
        await userService.create(employeeData);
        toast.success('BDM created successfully');
      }
      fetchEmployees();
      return true;
    } catch (err) {
      console.error('Failed to save employee:', err);
      toast.error(err.response?.data?.message || 'Failed to save BDM');
      return false;
    }
  };

  // Handle delete (soft delete) employee
  const handleDeleteEmployee = async (employeeId) => {
    try {
      await userService.delete(employeeId);
      toast.success('BDM deactivated successfully');
      fetchEmployees();
      return true;
    } catch (err) {
      console.error('Failed to delete employee:', err);
      toast.error(err.response?.data?.message || 'Failed to delete BDM');
      return false;
    }
  };

  // Handle toggle active status
  const handleToggleStatus = async (employee) => {
    try {
      await userService.update(employee._id, { isActive: !employee.isActive });
      toast.success(`BDM ${employee.isActive ? 'deactivated' : 'activated'} successfully`);
      fetchEmployees();
      return true;
    } catch (err) {
      console.error('Failed to toggle status:', err);
      toast.error(err.response?.data?.message || 'Failed to update status');
      return false;
    }
  };

  // Handle filter changes
  const handleFilterChange = (newFilters) => {
    setFilters(newFilters);
    setPagination((prev) => ({ ...prev, page: 1 })); // Reset to first page
  };

  // Handle page change
  const handlePageChange = (newPage) => {
    setPagination((prev) => ({ ...prev, page: newPage }));
  };

  if (loading && employees.length === 0) {
    return <LoadingSpinner fullScreen />;
  }

  return (
    <div className="dashboard-layout">
      <style>{employeesPageStyles}</style>
      <Navbar />
      <div className="dashboard-content">
        <Sidebar />
        <main className="main-content">
          <div className="page-header">
            <h1>BDM Management</h1>
          </div>

          {error && (
            <div className="error-banner">
              {error}
            </div>
          )}

          <EmployeeManagement
            employees={employees}
            filters={filters}
            pagination={pagination}
            loading={loading}
            onSave={handleSaveEmployee}
            onDelete={handleDeleteEmployee}
            onToggleStatus={handleToggleStatus}
            onFilterChange={handleFilterChange}
            onPageChange={handlePageChange}
          />
        </main>
      </div>
    </div>
  );
};

export default EmployeesPage;
