/**
 * DoctorsPage
 *
 * Admin page for doctor management:
 * - Doctor list with CRUD
 * - Search and filter
 * - Pagination
 * - Add/Edit modal
 */

import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import DoctorManagement from '../../components/admin/DoctorManagement';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import doctorService from '../../services/doctorService';
import regionService from '../../services/regionService';
import assignmentService from '../../services/assignmentService';
import { useAuth } from '../../hooks/useAuth';
import { exportToExcel, exportToCSV } from '../../utils/exportCallPlan';

const doctorsPageStyles = `
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

  .header-actions {
    display: flex;
    gap: 12px;
  }

  .export-btn {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 10px 16px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }

  .export-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .export-btn-excel {
    background: #22c55e;
    color: white;
    border: none;
  }

  .export-btn-excel:hover:not(:disabled) {
    background: #16a34a;
  }

  .export-btn-csv {
    background: white;
    color: #374151;
    border: 1px solid #d1d5db;
  }

  .export-btn-csv:hover:not(:disabled) {
    background: #f9fafb;
    border-color: #9ca3af;
  }
`;

const DoctorsPage = () => {
  const { user } = useAuth();
  const [doctors, setDoctors] = useState([]);
  const [regions, setRegions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState(null);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    pages: 0,
  });
  const [filters, setFilters] = useState({
    search: '',
    region: '',
    visitFrequency: '',
    specialization: '',
    supportDuringCoverage: '',
    programsToImplement: '',
  });

  // Fetch doctors with current filters and pagination
  const fetchDoctors = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params = {
        page: pagination.page,
        limit: pagination.limit,
      };

      if (filters.search) params.search = filters.search;
      if (filters.region) params.region = filters.region;
      if (filters.visitFrequency) params.visitFrequency = filters.visitFrequency;
      if (filters.specialization) params.specialization = filters.specialization;
      if (filters.supportDuringCoverage) params.supportDuringCoverage = filters.supportDuringCoverage;
      if (filters.programsToImplement) params.programsToImplement = filters.programsToImplement;

      const response = await doctorService.getAll(params);
      setDoctors(response.data || []);
      setPagination((prev) => ({
        ...prev,
        total: response.pagination?.total || 0,
        pages: response.pagination?.pages || 0,
      }));
    } catch {
      setError('Failed to load doctors. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit, filters]);

  // Flatten hierarchy tree into array with depth for indented dropdown
  const flattenHierarchy = (nodes, depth = 0) => {
    let result = [];
    for (const node of nodes) {
      result.push({ ...node, depth });
      if (node.children && node.children.length > 0) {
        result = result.concat(flattenHierarchy(node.children, depth + 1));
      }
    }
    return result;
  };

  // Fetch regions hierarchy for dropdown
  const fetchRegions = async () => {
    try {
      const response = await regionService.getHierarchy();
      const flatRegions = flattenHierarchy(response.data || []);
      setRegions(flatRegions);
    } catch {
      // Region fetch failed - filter dropdown will be empty
    }
  };

  useEffect(() => {
    fetchRegions();
  }, []);

  useEffect(() => {
    fetchDoctors();
  }, [fetchDoctors]);

  // Handle create doctor
  const handleSaveDoctor = async (doctorData) => {
    try {
      if (doctorData._id) {
        // Update existing doctor
        await doctorService.update(doctorData._id, doctorData);
        toast.success('Doctor updated successfully');
      } else {
        // Create new doctor
        await doctorService.create(doctorData);
        toast.success('Doctor created successfully');
      }
      fetchDoctors();
      return true;
    } catch (err) {
      // Show validation errors if available
      const errors = err.response?.data?.errors;
      if (errors && errors.length > 0) {
        const errorMessages = errors.map(e => `${e.field}: ${e.message}`).join(', ');
        toast.error(`Validation failed: ${errorMessages}`);
      } else {
        toast.error(err.response?.data?.message || 'Failed to save doctor');
      }
      return false;
    }
  };

  // Handle delete doctor
  const handleDeleteDoctor = async (doctorId) => {
    try {
      await doctorService.delete(doctorId);
      toast.success('Doctor deactivated successfully');
      fetchDoctors();
      return true;
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete doctor');
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

  // Get current month/year for export
  const getCurrentMonthYear = () => {
    const now = new Date();
    return now.toLocaleString('en-US', { month: 'long', year: 'numeric' });
  };

  // Get area name for export
  const getAreaName = () => {
    if (filters.region) {
      const region = regions.find((r) => r._id === filters.region);
      return region?.name || 'Selected Region';
    }
    return 'All Regions';
  };

  // Handle export to Excel
  const handleExportExcel = async () => {
    try {
      setExporting(true);

      // Fetch ALL doctors with current filters (no pagination limit)
      const params = { limit: 0 };
      if (filters.search) params.search = filters.search;
      if (filters.region) params.region = filters.region;
      if (filters.visitFrequency) params.visitFrequency = filters.visitFrequency;
      if (filters.specialization) params.specialization = filters.specialization;
      if (filters.supportDuringCoverage) params.supportDuringCoverage = filters.supportDuringCoverage;
      if (filters.programsToImplement) params.programsToImplement = filters.programsToImplement;

      const [doctorsResponse, assignmentsResponse] = await Promise.all([
        doctorService.getAll(params),
        assignmentService.getAll(),
      ]);

      const allDoctors = doctorsResponse.data || [];
      const allAssignments = assignmentsResponse.data || [];

      if (allDoctors.length === 0) {
        toast.error('No doctors to export');
        return;
      }

      const config = {
        employeeName: user?.name || 'Admin',
        areaAssigned: getAreaName(),
        monthYear: getCurrentMonthYear(),
        assignments: allAssignments,
      };

      exportToExcel(allDoctors, config);
      toast.success(`Exported ${allDoctors.length} doctors to Excel`);
    } catch (err) {
      toast.error('Failed to export to Excel');
    } finally {
      setExporting(false);
    }
  };

  // Handle export to CSV
  const handleExportCSV = async () => {
    try {
      setExporting(true);

      // Fetch ALL doctors with current filters (no pagination limit)
      const params = { limit: 0 };
      if (filters.search) params.search = filters.search;
      if (filters.region) params.region = filters.region;
      if (filters.visitFrequency) params.visitFrequency = filters.visitFrequency;
      if (filters.specialization) params.specialization = filters.specialization;
      if (filters.supportDuringCoverage) params.supportDuringCoverage = filters.supportDuringCoverage;
      if (filters.programsToImplement) params.programsToImplement = filters.programsToImplement;

      const [doctorsResponse, assignmentsResponse] = await Promise.all([
        doctorService.getAll(params),
        assignmentService.getAll(),
      ]);

      const allDoctors = doctorsResponse.data || [];
      const allAssignments = assignmentsResponse.data || [];

      if (allDoctors.length === 0) {
        toast.error('No doctors to export');
        return;
      }

      const config = {
        employeeName: user?.name || 'Admin',
        areaAssigned: getAreaName(),
        monthYear: getCurrentMonthYear(),
        assignments: allAssignments,
      };

      exportToCSV(allDoctors, config);
      toast.success(`Exported ${allDoctors.length} doctors to CSV`);
    } catch (err) {
      toast.error('Failed to export to CSV');
    } finally {
      setExporting(false);
    }
  };

  if (loading && doctors.length === 0) {
    return <LoadingSpinner fullScreen />;
  }

  return (
    <div className="dashboard-layout">
      <style>{doctorsPageStyles}</style>
      <Navbar />
      <div className="dashboard-content">
        <Sidebar />
        <main className="main-content">
          <div className="page-header">
            <h1>VIP Client Management</h1>
            <div className="header-actions">
              <button
                className="export-btn export-btn-excel"
                onClick={handleExportExcel}
                disabled={exporting}
              >
                {exporting ? 'Exporting...' : '↓ Export Excel'}
              </button>
              <button
                className="export-btn export-btn-csv"
                onClick={handleExportCSV}
                disabled={exporting}
              >
                {exporting ? 'Exporting...' : '↓ Export CSV'}
              </button>
            </div>
          </div>

          {error && (
            <div className="error-banner">
              {error}
            </div>
          )}

          <DoctorManagement
            doctors={doctors}
            regions={regions}
            filters={filters}
            pagination={pagination}
            loading={loading}
            onSave={handleSaveDoctor}
            onDelete={handleDeleteDoctor}
            onFilterChange={handleFilterChange}
            onPageChange={handlePageChange}
          />
        </main>
      </div>
    </div>
  );
};

export default DoctorsPage;
