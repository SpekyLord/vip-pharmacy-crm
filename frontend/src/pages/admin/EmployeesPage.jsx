/**
 * EmployeesPage
 *
 * Admin page for employee management:
 * - Employee list with CRUD
 * - Role assignment
 * - Account status management
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import toast from 'react-hot-toast';
import { Users, UserCheck, UserX, RefreshCw } from 'lucide-react';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import EmployeeManagement from '../../components/admin/EmployeeManagement';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import userService from '../../services/userService';
import PageGuide from '../../components/common/PageGuide';

const employeesPageStyles = `
  .employees-layout {
    height: 100vh;
    display: flex;
    flex-direction: column;
    background: #f3f4f6;
    overflow: hidden;
  }

  .employees-content {
    display: flex;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  .employees-main {
    flex: 1;
    padding: 20px 24px;
    min-width: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  /* Page Header */
  .page-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 20px;
    flex-shrink: 0;
  }

  .page-header-left {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .page-header-icon {
    width: 40px;
    height: 40px;
    background: linear-gradient(135deg, #fbbf24, #f59e0b);
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
  }

  .page-header h1 {
    margin: 0;
    font-size: 24px;
    font-weight: 700;
    color: #1f2937;
  }

  .page-header-actions {
    display: flex;
    gap: 8px;
  }

  .header-action-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 14px;
    border-radius: 8px;
    border: 1px solid #e5e7eb;
    background: white;
    color: #6b7280;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }

  .header-action-btn:hover {
    background: #f9fafb;
    color: #374151;
    border-color: #d1d5db;
  }

  /* Stats Cards */
  .stats-row {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 16px;
    margin-bottom: 20px;
    flex-shrink: 0;
  }

  .stat-card {
    background: white;
    border-radius: 12px;
    padding: 16px 20px;
    border: 1px solid #e5e7eb;
    display: flex;
    align-items: center;
    gap: 14px;
  }

  .stat-icon {
    width: 48px;
    height: 48px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .stat-icon.total { background: #dbeafe; color: #2563eb; }
  .stat-icon.active { background: #dcfce7; color: #16a34a; }
  .stat-icon.inactive { background: #fee2e2; color: #dc2626; }

  .stat-info {
    display: flex;
    flex-direction: column;
  }

  .stat-value {
    font-size: 28px;
    font-weight: 700;
    color: #1f2937;
    line-height: 1.2;
  }

  .stat-label {
    font-size: 13px;
    color: #6b7280;
    margin-top: 2px;
  }

  /* Main content area */
  .employees-main > :last-child {
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  .error-banner {
    background: #fee2e2;
    color: #dc2626;
    padding: 12px 16px;
    border-radius: 8px;
    margin-bottom: 16px;
    font-size: 14px;
    flex-shrink: 0;
  }

  /* Responsive */
  @media (max-width: 768px) {
    .stats-row {
      grid-template-columns: repeat(3, 1fr);
      gap: 10px;
    }
    .stat-card {
      padding: 12px 14px;
      flex-direction: column;
      text-align: center;
      gap: 8px;
    }
    .stat-icon {
      width: 40px;
      height: 40px;
    }
    .stat-value {
      font-size: 22px;
    }
    .stat-label {
      font-size: 11px;
    }
  }

  @media (max-width: 640px) {
    .employees-layout { height: auto; min-height: 100vh; overflow-y: auto; }
    .employees-content { overflow: visible; }
    .employees-main { overflow: visible; }
    .employees-main > :last-child { flex: none; overflow: visible; }
  }

  @media (max-width: 480px) {
    .employees-layout {
      height: auto;
      min-height: 100vh;
      overflow: auto;
    }
    .employees-content {
      overflow: visible;
    }
    .employees-main {
      padding: 16px;
      overflow: visible;
    }
    .employees-main > :last-child {
      flex: none;
      overflow: visible;
    }
    .page-header {
      flex-direction: column;
      align-items: flex-start;
      gap: 12px;
    }
    .page-header-actions {
      width: 100%;
      justify-content: flex-end;
    }
    .page-header h1 {
      font-size: 20px;
    }
    .stats-row {
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
    }
    .stat-card {
      padding: 10px;
    }
    .stat-value {
      font-size: 18px;
    }
  }

  /* ===== DARK MODE ===== */
  body.dark-mode .employees-layout {
    background: #0a0f1e;
  }

  body.dark-mode .page-header h1 {
    color: #f1f5f9;
  }

  body.dark-mode .header-action-btn {
    background: #0f172a;
    border-color: #1e293b;
    color: #94a3b8;
  }

  body.dark-mode .header-action-btn:hover {
    background: #1e293b;
    color: #e2e8f0;
  }

  body.dark-mode .stat-card {
    background: #0f172a;
    border-color: #1e293b;
  }

  body.dark-mode .stat-value {
    color: #f1f5f9;
  }

  body.dark-mode .stat-label {
    color: #94a3b8;
  }

  body.dark-mode .stat-icon.total { background: #1e3a5f; color: #60a5fa; }
  body.dark-mode .stat-icon.active { background: #052e16; color: #4ade80; }
  body.dark-mode .stat-icon.inactive { background: #450a0a; color: #f87171; }

  body.dark-mode .error-banner {
    background: #450a0a;
    color: #fca5a5;
  }
`;

const EmployeesPage = () => {
  const fetchControllerRef = useRef(null);

  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    total: 0,
    pages: 0,
  });
  const [filters, setFilters] = useState({
    search: '',
    role: '',
    isActive: '',
  });

  const stats = useMemo(() => ({
    total: employees.length,
    active: employees.filter(e => e.isActive).length,
    inactive: employees.filter(e => !e.isActive).length,
  }), [employees]);

  // Abort in-flight requests on unmount
  useEffect(() => {
    return () => fetchControllerRef.current?.abort();
  }, []);

  const fetchEmployees = useCallback(async () => {
    fetchControllerRef.current?.abort();
    fetchControllerRef.current = new AbortController();
    const signal = fetchControllerRef.current.signal;

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

      const response = await userService.getAll(params, signal);
      setEmployees(response.data || []);
      setPagination((prev) => ({
        ...prev,
        total: response.pagination?.total || 0,
        pages: response.pagination?.pages || 0,
      }));
    } catch (err) {
      if (err?.name !== 'CanceledError' && err?.code !== 'ERR_CANCELED') {
        console.error('Failed to fetch employees:', err);
        setError('Failed to load BDMs. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit, filters]);

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  // Handle create/update employee
  const handleSaveEmployee = async (employeeData) => {
    try {
      if (employeeData._id) {
        await userService.update(employeeData._id, employeeData);
        toast.success('BDM updated successfully');
      } else {
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

  // Handle admin password reset
  const handleResetPassword = async (employeeId, newPassword) => {
    try {
      await userService.resetPassword(employeeId, newPassword);
      toast.success('Password reset successfully. BDM can now log in with the new password.');
      fetchEmployees();
      return true;
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to reset password');
      return false;
    }
  };

  // Handle unlock account
  const handleUnlockAccount = async (employeeId) => {
    try {
      await userService.unlockAccount(employeeId);
      toast.success('Account unlocked and reactivated. All ERP access preserved.');
      fetchEmployees();
      return true;
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to unlock account');
      return false;
    }
  };

  // Handle permanent delete
  const handlePermanentDelete = async (employeeId) => {
    try {
      await userService.permanentDelete(employeeId);
      toast.success('User permanently deleted');
      fetchEmployees();
      return true;
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete user');
      return false;
    }
  };

  // Handle filter changes
  const handleFilterChange = (newFilters) => {
    setFilters(newFilters);
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  // Handle page change
  const handlePageChange = (newPage) => {
    setPagination((prev) => ({ ...prev, page: newPage }));
  };

  // Handle refresh
  const handleRefresh = () => {
    fetchEmployees();
    toast.success('Data refreshed');
  };

  if (loading && employees.length === 0) {
    return <LoadingSpinner fullScreen />;
  }

  return (
    <div className="employees-layout">
      <style>{employeesPageStyles}</style>
      <Navbar />
      <div className="employees-content">
        <Sidebar />
        <main className="employees-main">
          <PageGuide pageKey="employees-page" />
          {/* Page Header */}
          <div className="page-header">
            <div className="page-header-left">
              <div className="page-header-icon">
                <Users size={20} />
              </div>
              <h1>BDM Management</h1>
            </div>
            <div className="page-header-actions">
              <button className="header-action-btn" onClick={handleRefresh} title="Refresh">
                <RefreshCw size={16} />
                Refresh
              </button>
            </div>
          </div>

          {/* Stats Cards */}
          <div className="stats-row">
            <div className="stat-card">
              <div className="stat-icon total">
                <Users size={22} />
              </div>
              <div className="stat-info">
                <span className="stat-value">{pagination.total || stats.total}</span>
                <span className="stat-label">Total BDMs</span>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon active">
                <UserCheck size={22} />
              </div>
              <div className="stat-info">
                <span className="stat-value">{stats.active}</span>
                <span className="stat-label">Active</span>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon inactive">
                <UserX size={22} />
              </div>
              <div className="stat-info">
                <span className="stat-value">{stats.inactive}</span>
                <span className="stat-label">Inactive</span>
              </div>
            </div>
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
            onResetPassword={handleResetPassword}
            onUnlock={handleUnlockAccount}
            onPermanentDelete={handlePermanentDelete}
            onFilterChange={handleFilterChange}
            onPageChange={handlePageChange}
          />
        </main>
      </div>
    </div>
  );
};

export default EmployeesPage;
