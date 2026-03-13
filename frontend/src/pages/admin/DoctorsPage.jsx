/**
 * DoctorsPage
 *
 * Admin page for doctor management:
 * - Doctor list with CRUD
 * - Search and filter
 * - Pagination
 * - Add/Edit modal
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import toast from 'react-hot-toast';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import DoctorManagement from '../../components/admin/DoctorManagement';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import doctorService from '../../services/doctorService';
import clientService from '../../services/clientService';

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

const DoctorsPage = () => {
  const [doctors, setDoctors] = useState([]);
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
    visitFrequency: '',
    specialization: '',
    supportDuringCoverage: '',
    programsToImplement: '',
    clientType: '', // '' = VIP only, 'all' = All, 'regular' = Regular only
  });

  // Regular client state
  const [regularClients, setRegularClients] = useState([]);
  const [regularLoading, setRegularLoading] = useState(false);
  const [regularPagination, setRegularPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    pages: 0,
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
      if (filters.visitFrequency) params.visitFrequency = filters.visitFrequency;
      if (filters.specialization) params.specialization = filters.specialization;
      if (filters.supportDuringCoverage) params.supportDuringCoverage = filters.supportDuringCoverage;
      if (filters.programsToImplement) params.programsToImplement = filters.programsToImplement;

      const response = await doctorService.getAll(params);
      const taggedDoctors = (response.data || []).map(doc => ({ ...doc, _clientType: 'vip' }));
      setDoctors(taggedDoctors);
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

  useEffect(() => {
    fetchDoctors();
  }, [fetchDoctors]);

  // Fetch regular clients when clientType filter includes them
  const fetchRegularClients = useCallback(async () => {
    try {
      setRegularLoading(true);
      const params = {
        page: regularPagination.page,
        limit: regularPagination.limit,
      };
      if (filters.search) params.search = filters.search;

      const response = await clientService.getAll(params);
      const clientsWithType = (response.data || []).map(client => ({
        ...client,
        _clientType: 'regular',
        _ownerName: client.createdBy?.name || 'Unknown',
      }));
      setRegularClients(clientsWithType);
      setRegularPagination(prev => ({
        ...prev,
        total: response.pagination?.total || 0,
        pages: response.pagination?.pages || 0,
      }));
    } catch {
      // Silent fail - regular clients are supplementary
    } finally {
      setRegularLoading(false);
    }
  }, [regularPagination.page, regularPagination.limit, filters.search]);

  useEffect(() => {
    if (filters.clientType === 'all' || filters.clientType === 'regular') {
      fetchRegularClients();
    } else {
      setRegularClients([]);
    }
  }, [filters.clientType, fetchRegularClients]);

  // Compute merged display list
  const displayList = useMemo(() => {
    if (filters.clientType === 'regular') return regularClients;
    if (filters.clientType === 'all') return [...doctors, ...regularClients];
    return doctors; // default: VIP only
  }, [filters.clientType, doctors, regularClients]);

  // Compute active pagination based on view
  const activePagination = useMemo(() => {
    if (filters.clientType === 'regular') return regularPagination;
    return pagination;
  }, [filters.clientType, regularPagination, pagination]);

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

  // Handle mass delete by BDM
  const handleMassDeleteByUser = async (userId) => {
    try {
      const response = await doctorService.deleteByUser(userId);
      toast.success(response.message || 'VIP Clients deactivated successfully');
      fetchDoctors();
      return true;
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to mass deactivate');
      return false;
    }
  };

  // Handle upgrade regular client to VIP
  const handleUpgradeToVIP = async (regularClient) => {
    if (!confirm(`Upgrade "${regularClient.firstName} ${regularClient.lastName}" to a VIP Client? This will create a new VIP Client record with the same info.`)) {
      return;
    }

    try {
      // Build VIP Client data from regular client fields
      const doctorData = {
        firstName: regularClient.firstName,
        lastName: regularClient.lastName,
        visitFrequency: regularClient.visitFrequency || 4,
      };
      if (regularClient.specialization) doctorData.specialization = regularClient.specialization;
      if (regularClient.clinicOfficeAddress) doctorData.clinicOfficeAddress = regularClient.clinicOfficeAddress;
      if (regularClient.phone) doctorData.phone = regularClient.phone;
      if (regularClient.email) doctorData.email = regularClient.email;
      if (regularClient.notes) doctorData.notes = regularClient.notes;
      if (regularClient.weekSchedule) doctorData.weekSchedule = regularClient.weekSchedule;
      if (regularClient.outletIndicator) doctorData.outletIndicator = regularClient.outletIndicator;
      if (regularClient.programsToImplement?.length) doctorData.programsToImplement = regularClient.programsToImplement;
      if (regularClient.supportDuringCoverage?.length) doctorData.supportDuringCoverage = regularClient.supportDuringCoverage;
      if (regularClient.levelOfEngagement) doctorData.levelOfEngagement = regularClient.levelOfEngagement;
      if (regularClient.secretaryName) doctorData.secretaryName = regularClient.secretaryName;
      if (regularClient.secretaryPhone) doctorData.secretaryPhone = regularClient.secretaryPhone;
      if (regularClient.birthday) doctorData.birthday = regularClient.birthday;
      if (regularClient.anniversary) doctorData.anniversary = regularClient.anniversary;
      if (regularClient.otherDetails) doctorData.otherDetails = regularClient.otherDetails;
      // Carry over assignedTo if the regular client has an owner BDM
      if (regularClient.createdBy?._id) doctorData.assignedTo = regularClient.createdBy._id;

      await doctorService.create(doctorData);
      // Soft-delete the regular client
      await clientService.delete(regularClient._id);

      toast.success(`${regularClient.firstName} ${regularClient.lastName} upgraded to VIP Client`);
      fetchDoctors();
      fetchRegularClients();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to upgrade to VIP');
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

  // Handle regular client page change
  const handleRegularPageChange = (newPage) => {
    setRegularPagination((prev) => ({ ...prev, page: newPage }));
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
          </div>

          {error && (
            <div className="error-banner">
              {error}
            </div>
          )}

          <DoctorManagement
            doctors={displayList}
            filters={filters}
            pagination={activePagination}
            loading={loading || regularLoading}
            onSave={handleSaveDoctor}
            onDelete={handleDeleteDoctor}
            onMassDeleteByUser={handleMassDeleteByUser}
            onUpgradeToVIP={handleUpgradeToVIP}
            onFilterChange={handleFilterChange}
            onPageChange={filters.clientType === 'regular' ? handleRegularPageChange : handlePageChange}
          />
        </main>
      </div>
    </div>
  );
};

export default DoctorsPage;
