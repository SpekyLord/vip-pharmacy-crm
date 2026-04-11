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
import { Stethoscope, RefreshCw } from 'lucide-react';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import DoctorManagement from '../../components/admin/DoctorManagement';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import doctorService from '../../services/doctorService';
import clientService from '../../services/clientService';
import PageGuide from '../../components/common/PageGuide';

const doctorsPageStyles = `
  .doctors-layout {
    height: 100vh;
    display: flex;
    flex-direction: column;
    background: #f3f4f6;
    overflow: hidden;
  }

  .doctors-content {
    display: flex;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  .doctors-main {
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

  /* Page Search Bar */
  .page-search-bar {
    position: relative;
    display: flex;
    align-items: center;
    margin-bottom: 20px;
    flex-shrink: 0;
  }

  .page-search-icon {
    position: absolute;
    left: 14px;
    color: #9ca3af;
    pointer-events: none;
  }

  .page-search-input {
    width: 100%;
    padding: 12px 40px 12px 44px;
    border: 1px solid #e5e7eb;
    border-radius: 10px;
    font-size: 15px;
    background: white;
    color: #374151;
    transition: border-color 0.15s, box-shadow 0.15s;
  }

  .page-search-input::placeholder {
    color: #9ca3af;
  }

  .page-search-input:focus {
    outline: none;
    border-color: #f59e0b;
    box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.1);
  }

  .page-search-clear {
    position: absolute;
    right: 12px;
    background: none;
    border: none;
    cursor: pointer;
    color: #9ca3af;
    padding: 4px;
    display: flex;
    align-items: center;
    border-radius: 4px;
    transition: color 0.15s, background 0.15s;
  }

  .page-search-clear:hover {
    color: #6b7280;
    background: #f3f4f6;
  }

  /* Main content area */
  .doctors-main > :last-child {
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

  @media (max-width: 900px) {
    .doctors-layout { height: auto; min-height: 100vh; overflow-y: auto; }
    .doctors-content { overflow: visible; }
    .doctors-main { overflow: visible; }
    .doctors-main > :last-child { flex: none; overflow: visible; }
  }

  @media (max-width: 768px) {
  }

  @media (max-width: 480px) {
    .doctors-layout {
      height: auto;
      min-height: 100vh;
      overflow: auto;
    }
    .doctors-content {
      overflow: visible;
    }
    .doctors-main {
      padding: 16px;
      overflow: visible;
    }
    .doctors-main > :last-child {
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
  }

  /* ===== DARK MODE ===== */
  body.dark-mode .doctors-layout {
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

  body.dark-mode .page-search-input {
    background: #0f172a;
    border-color: #1e293b;
    color: #e2e8f0;
  }

  body.dark-mode .page-search-input:focus {
    border-color: #f59e0b;
  }

  body.dark-mode .page-search-input::placeholder {
    color: #475569;
  }

  body.dark-mode .page-search-clear:hover {
    background: #1e293b;
    color: #94a3b8;
  }

  body.dark-mode .error-banner {
    background: #450a0a;
    color: #fca5a5;
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
    clientType: '',
    vipClientType: '',
    assignedTo: '',
  });
  const [searchInput, setSearchInput] = useState('');

  useEffect(() => {
    const t = setTimeout(() => {
      setFilters(prev => ({ ...prev, search: searchInput }));
      setPagination(prev => ({ ...prev, page: 1 }));
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const [regularClients, setRegularClients] = useState([]);
  const [regularLoading, setRegularLoading] = useState(false);
  const [regularPagination, setRegularPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    pages: 0,
  });

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
      if (filters.assignedTo) params.assignedTo = filters.assignedTo;
      if (filters.vipClientType) params.clientType = filters.vipClientType;

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
      // Silent fail
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

  const displayList = useMemo(() => {
    if (filters.clientType === 'regular') return regularClients;
    if (filters.clientType === 'all') return [...doctors, ...regularClients];
    return doctors;
  }, [filters.clientType, doctors, regularClients]);

  const activePagination = useMemo(() => {
    if (filters.clientType === 'regular') return regularPagination;
    return pagination;
  }, [filters.clientType, regularPagination, pagination]);

  const handleSaveDoctor = async (doctorData) => {
    try {
      if (doctorData._id) {
        await doctorService.update(doctorData._id, doctorData);
        toast.success('Doctor updated successfully');
      } else {
        await doctorService.create(doctorData);
        toast.success('Doctor created successfully');
      }
      fetchDoctors();
      return true;
    } catch (err) {
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

  const handleDeleteDoctor = async (doctorId, permanent = false) => {
    try {
      await doctorService.delete(doctorId, permanent);
      toast.success(permanent ? 'VIP Client permanently deleted' : 'VIP Client deactivated');
      fetchDoctors();
      return true;
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete VIP Client');
      return false;
    }
  };

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

  const handleUpgradeToVIP = async (regularClient) => {
    if (!confirm(`Upgrade "${regularClient.firstName} ${regularClient.lastName}" to a VIP Client? This will create a new VIP Client record with the same info.`)) {
      return;
    }

    try {
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
      if (regularClient.createdBy?._id) doctorData.assignedTo = regularClient.createdBy._id;

      await doctorService.create(doctorData);
      await clientService.delete(regularClient._id);

      toast.success(`${regularClient.firstName} ${regularClient.lastName} upgraded to VIP Client`);
      fetchDoctors();
      fetchRegularClients();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to upgrade to VIP');
    }
  };

  const handleFilterChange = (newFilters) => {
    setFilters(newFilters);
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  const handlePageChange = (newPage) => {
    setPagination((prev) => ({ ...prev, page: newPage }));
  };

  const handleRegularPageChange = (newPage) => {
    setRegularPagination((prev) => ({ ...prev, page: newPage }));
  };

  const handleRefresh = () => {
    fetchDoctors();
    if (filters.clientType === 'all' || filters.clientType === 'regular') {
      fetchRegularClients();
    }
    toast.success('Data refreshed');
  };

  if (loading && doctors.length === 0) {
    return <LoadingSpinner fullScreen />;
  }

  return (
    <div className="doctors-layout">
      <style>{doctorsPageStyles}</style>
      <Navbar />
      <div className="doctors-content">
        <Sidebar />
        <main className="doctors-main">
          <PageGuide pageKey="doctors-page" />
          {/* Page Header */}
          <div className="page-header">
            <div className="page-header-left">
              <div className="page-header-icon">
                <Stethoscope size={20} />
              </div>
              <h1>VIP Client Management</h1>
            </div>
            <div className="page-header-actions">
              <button className="header-action-btn" onClick={handleRefresh}>
                <RefreshCw size={16} />
                Refresh
              </button>
            </div>
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
            searchInput={searchInput}
            onSave={handleSaveDoctor}
            onDelete={handleDeleteDoctor}
            onMassDeleteByUser={handleMassDeleteByUser}
            onUpgradeToVIP={handleUpgradeToVIP}
            onFilterChange={handleFilterChange}
            onPageChange={filters.clientType === 'regular' ? handleRegularPageChange : handlePageChange}
            onSearchChange={setSearchInput}
          />
        </main>
      </div>
    </div>
  );
};

export default DoctorsPage;
