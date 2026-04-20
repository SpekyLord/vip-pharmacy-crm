/**
 * DoctorsPage
 *
 * Admin page for doctor management:
 * - Doctor list with CRUD
 * - Search and filter
 * - Pagination
 * - Add/Edit modal
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import toast from 'react-hot-toast';
import { Stethoscope, RefreshCw, Sparkles, CheckSquare, Square, AlertTriangle, X } from 'lucide-react';
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

  /* ===== NAME CLEANER MODAL ===== */
  .nc-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: 20px;
  }
  .nc-modal {
    background: white;
    border-radius: 12px;
    width: 100%;
    max-width: 800px;
    max-height: 85vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25);
  }
  .nc-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid #e5e7eb;
    flex-shrink: 0;
  }
  .nc-header h2 {
    font-size: 18px;
    font-weight: 600;
    color: #111827;
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0;
  }
  .nc-close {
    background: none;
    border: none;
    cursor: pointer;
    color: #6b7280;
    padding: 4px;
    border-radius: 6px;
  }
  .nc-close:hover { background: #f3f4f6; color: #374151; }
  .nc-summary {
    display: flex;
    gap: 16px;
    padding: 12px 20px;
    background: #f9fafb;
    border-bottom: 1px solid #e5e7eb;
    font-size: 13px;
    color: #6b7280;
    flex-shrink: 0;
    flex-wrap: wrap;
  }
  .nc-summary strong { color: #111827; }
  .nc-tabs {
    display: flex;
    gap: 0;
    border-bottom: 1px solid #e5e7eb;
    padding: 0 20px;
    flex-shrink: 0;
  }
  .nc-tab {
    padding: 10px 16px;
    font-size: 13px;
    font-weight: 500;
    color: #6b7280;
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    cursor: pointer;
    transition: all 0.15s;
  }
  .nc-tab:hover { color: #374151; }
  .nc-tab.active { color: #f59e0b; border-bottom-color: #f59e0b; }
  .nc-body {
    flex: 1;
    overflow-y: auto;
    padding: 0;
  }
  .nc-toolbar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 20px;
    border-bottom: 1px solid #f3f4f6;
    flex-shrink: 0;
  }
  .nc-toolbar button {
    font-size: 12px;
    padding: 4px 10px;
    border-radius: 6px;
    border: 1px solid #e5e7eb;
    background: white;
    color: #6b7280;
    cursor: pointer;
    transition: all 0.15s;
  }
  .nc-toolbar button:hover { background: #f9fafb; color: #374151; }
  .nc-toolbar .nc-count { font-size: 12px; color: #9ca3af; margin-left: auto; }
  .nc-table {
    width: 100%;
    font-size: 13px;
    border-collapse: collapse;
  }
  .nc-table th {
    text-align: left;
    padding: 8px 12px;
    font-weight: 600;
    color: #6b7280;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    background: #f9fafb;
    position: sticky;
    top: 0;
  }
  .nc-table td {
    padding: 8px 12px;
    border-top: 1px solid #f3f4f6;
    vertical-align: middle;
  }
  .nc-table tr:hover td { background: #fffbeb; }
  .nc-table .nc-check {
    width: 32px;
    text-align: center;
    cursor: pointer;
  }
  .nc-old { color: #dc2626; text-decoration: line-through; font-size: 12px; }
  .nc-new { color: #059669; font-weight: 600; }
  .nc-arrow { color: #d1d5db; margin: 0 4px; }
  .nc-dup-group {
    margin: 12px 20px;
    padding: 12px 16px;
    background: #fefce8;
    border: 1px solid #fde68a;
    border-radius: 8px;
  }
  .nc-dup-group h4 {
    font-size: 13px;
    font-weight: 600;
    color: #92400e;
    margin: 0 0 6px 0;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .nc-dup-group ul {
    margin: 0;
    padding-left: 20px;
    font-size: 13px;
    color: #78350f;
  }
  .nc-empty {
    text-align: center;
    padding: 40px 20px;
    color: #9ca3af;
    font-size: 14px;
  }
  .nc-footer {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 10px;
    padding: 14px 20px;
    border-top: 1px solid #e5e7eb;
    flex-shrink: 0;
  }
  .nc-footer button {
    padding: 8px 16px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
  }
  .nc-cancel {
    background: white;
    border: 1px solid #e5e7eb;
    color: #6b7280;
  }
  .nc-cancel:hover { background: #f9fafb; }
  .nc-apply {
    background: #f59e0b;
    border: 1px solid #f59e0b;
    color: white;
  }
  .nc-apply:hover { background: #d97706; }
  .nc-apply:disabled { opacity: 0.5; cursor: not-allowed; }

  /* Name cleaner dark mode */
  body.dark-mode .nc-modal { background: #0f172a; }
  body.dark-mode .nc-header { border-color: #1e293b; }
  body.dark-mode .nc-header h2 { color: #f1f5f9; }
  body.dark-mode .nc-close { color: #94a3b8; }
  body.dark-mode .nc-close:hover { background: #1e293b; color: #e2e8f0; }
  body.dark-mode .nc-summary { background: #1e293b; border-color: #334155; color: #94a3b8; }
  body.dark-mode .nc-summary strong { color: #f1f5f9; }
  body.dark-mode .nc-tabs { border-color: #1e293b; }
  body.dark-mode .nc-tab { color: #94a3b8; }
  body.dark-mode .nc-tab:hover { color: #e2e8f0; }
  body.dark-mode .nc-tab.active { color: #f59e0b; border-bottom-color: #f59e0b; }
  body.dark-mode .nc-toolbar { border-color: #1e293b; }
  body.dark-mode .nc-toolbar button { background: #0f172a; border-color: #1e293b; color: #94a3b8; }
  body.dark-mode .nc-toolbar button:hover { background: #1e293b; color: #e2e8f0; }
  body.dark-mode .nc-table th { background: #1e293b; color: #94a3b8; }
  body.dark-mode .nc-table td { border-color: #1e293b; }
  body.dark-mode .nc-table tr:hover td { background: #1a1a2e; }
  body.dark-mode .nc-old { color: #f87171; }
  body.dark-mode .nc-new { color: #34d399; }
  body.dark-mode .nc-dup-group { background: #1a1a2e; border-color: #854d0e; }
  body.dark-mode .nc-dup-group h4 { color: #fbbf24; }
  body.dark-mode .nc-dup-group ul { color: #fcd34d; }
  body.dark-mode .nc-footer { border-color: #1e293b; }
  body.dark-mode .nc-cancel { background: #0f172a; border-color: #1e293b; color: #94a3b8; }
  body.dark-mode .nc-cancel:hover { background: #1e293b; }
`;

const DoctorsPage = () => {
  const fetchDoctorsControllerRef = useRef(null);
  const fetchClientsControllerRef = useRef(null);

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

  // Abort in-flight requests on unmount
  useEffect(() => {
    return () => {
      fetchDoctorsControllerRef.current?.abort();
      fetchClientsControllerRef.current?.abort();
    };
  }, []);

  const [regularClients, setRegularClients] = useState([]);
  const [regularLoading, setRegularLoading] = useState(false);
  const [regularPagination, setRegularPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    pages: 0,
  });

  // Name cleaner state
  const [ncOpen, setNcOpen] = useState(false);
  const [ncLoading, setNcLoading] = useState(false);
  const [ncApplying, setNcApplying] = useState(false);
  const [ncChanges, setNcChanges] = useState([]);
  const [ncDuplicates, setNcDuplicates] = useState([]);
  const [ncSelected, setNcSelected] = useState(new Set());
  const [ncTotalScanned, setNcTotalScanned] = useState(0);
  const [ncTab, setNcTab] = useState('changes');

  const handleOpenNameCleaner = useCallback(async () => {
    setNcOpen(true);
    setNcLoading(true);
    setNcTab('changes');
    try {
      const result = await doctorService.previewNameCleanup();
      const changes = result.data?.changes || [];
      const duplicates = result.data?.duplicates || [];
      setNcChanges(changes);
      setNcDuplicates(duplicates);
      setNcTotalScanned(result.data?.totalScanned || 0);
      setNcSelected(new Set(changes.map((c) => c._id)));
    } catch (err) {
      toast.error('Failed to scan names: ' + (err.response?.data?.message || err.message));
      setNcOpen(false);
    }
    setNcLoading(false);
  }, []);

  // refreshAfterCleanup is set to true when names are applied — triggers fetchDoctors via useEffect
  const [refreshAfterCleanup, setRefreshAfterCleanup] = useState(0);

  const handleApplyNameCleanup = useCallback(async () => {
    if (ncSelected.size === 0) return;
    const approved = ncChanges
      .filter((c) => ncSelected.has(c._id))
      .map((c) => ({ _id: c._id, firstName: c.cleanedFirstName, lastName: c.cleanedLastName }));

    if (!window.confirm(`Apply name changes to ${approved.length} VIP Client record${approved.length !== 1 ? 's' : ''}? This cannot be undone.`)) return;

    setNcApplying(true);
    try {
      const result = await doctorService.applyNameCleanup(approved);
      toast.success(result.message || `${result.data?.modifiedCount || 0} names updated`);
      setNcOpen(false);
      setRefreshAfterCleanup((k) => k + 1);
    } catch (err) {
      toast.error('Failed to apply: ' + (err.response?.data?.message || err.message));
    }
    setNcApplying(false);
  }, [ncSelected, ncChanges]);

  const ncToggle = useCallback((id) => {
    setNcSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const ncSelectAll = useCallback(() => {
    setNcSelected(new Set(ncChanges.map((c) => c._id)));
  }, [ncChanges]);

  const ncDeselectAll = useCallback(() => {
    setNcSelected(new Set());
  }, []);

  const fetchDoctors = useCallback(async () => {
    fetchDoctorsControllerRef.current?.abort();
    fetchDoctorsControllerRef.current = new AbortController();
    const signal = fetchDoctorsControllerRef.current.signal;

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

      const response = await doctorService.getAll(params, signal);
      const taggedDoctors = (response.data || []).map(doc => ({ ...doc, _clientType: 'vip' }));
      setDoctors(taggedDoctors);
      setPagination((prev) => ({
        ...prev,
        total: response.pagination?.total || 0,
        pages: response.pagination?.pages || 0,
      }));
    } catch (err) {
      if (err?.name !== 'CanceledError' && err?.code !== 'ERR_CANCELED') {
        setError('Failed to load doctors. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit, filters]);

  useEffect(() => {
    fetchDoctors();
  }, [fetchDoctors]);

  // Re-fetch after name cleanup is applied
  useEffect(() => {
    if (refreshAfterCleanup > 0) fetchDoctors();
  }, [refreshAfterCleanup]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchRegularClients = useCallback(async () => {
    fetchClientsControllerRef.current?.abort();
    fetchClientsControllerRef.current = new AbortController();
    const signal = fetchClientsControllerRef.current.signal;

    try {
      setRegularLoading(true);
      const params = {
        page: regularPagination.page,
        limit: regularPagination.limit,
      };
      if (filters.search) params.search = filters.search;

      const response = await clientService.getAll(params, signal);
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
              <button className="header-action-btn" onClick={handleOpenNameCleaner}>
                <Sparkles size={16} />
                Clean Names
              </button>
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

      {/* Name Cleaner Modal */}
      {ncOpen && (
        <div className="nc-overlay" onClick={() => !ncLoading && !ncApplying && setNcOpen(false)}>
          <div className="nc-modal" onClick={(e) => e.stopPropagation()}>
            <div className="nc-header">
              <h2><Sparkles size={18} /> Name Cleaner</h2>
              <button className="nc-close" onClick={() => setNcOpen(false)} disabled={ncApplying}>
                <X size={18} />
              </button>
            </div>

            <div className="nc-summary">
              <span><strong>{ncTotalScanned}</strong> scanned</span>
              <span><strong>{ncChanges.length}</strong> need cleanup</span>
              <span><strong>{ncDuplicates.length}</strong> potential duplicates</span>
            </div>

            <div className="nc-tabs">
              <button className={`nc-tab ${ncTab === 'changes' ? 'active' : ''}`} onClick={() => setNcTab('changes')}>
                Changes ({ncChanges.length})
              </button>
              <button className={`nc-tab ${ncTab === 'duplicates' ? 'active' : ''}`} onClick={() => setNcTab('duplicates')}>
                Duplicates ({ncDuplicates.length})
              </button>
            </div>

            {ncLoading ? (
              <div className="nc-empty">Scanning VIP Client names...</div>
            ) : ncTab === 'changes' ? (
              <>
                {ncChanges.length > 0 && (
                  <div className="nc-toolbar">
                    <button onClick={ncSelectAll}>Select All</button>
                    <button onClick={ncDeselectAll}>Deselect All</button>
                    <span className="nc-count">{ncSelected.size} of {ncChanges.length} selected</span>
                  </div>
                )}
                <div className="nc-body">
                  {ncChanges.length === 0 ? (
                    <div className="nc-empty">All VIP Client names are already properly formatted.</div>
                  ) : (
                    <table className="nc-table">
                      <thead>
                        <tr>
                          <th className="nc-check"></th>
                          <th>First Name</th>
                          <th>Last Name</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ncChanges.map((c) => (
                          <tr key={c._id}>
                            <td className="nc-check" onClick={() => ncToggle(c._id)}>
                              {ncSelected.has(c._id) ? <CheckSquare size={16} color="#f59e0b" /> : <Square size={16} />}
                            </td>
                            <td>
                              {c.originalFirstName !== c.cleanedFirstName ? (
                                <><span className="nc-old">{c.originalFirstName}</span><span className="nc-arrow">&rarr;</span><span className="nc-new">{c.cleanedFirstName}</span></>
                              ) : c.originalFirstName}
                            </td>
                            <td>
                              {c.originalLastName !== c.cleanedLastName ? (
                                <><span className="nc-old">{c.originalLastName}</span><span className="nc-arrow">&rarr;</span><span className="nc-new">{c.cleanedLastName}</span></>
                              ) : c.originalLastName}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </>
            ) : (
              <div className="nc-body">
                {ncDuplicates.length === 0 ? (
                  <div className="nc-empty">No potential duplicates found.</div>
                ) : (
                  ncDuplicates.map((group, idx) => (
                    <div key={idx} className="nc-dup-group">
                      <h4><AlertTriangle size={14} /> Potential Duplicate Group</h4>
                      <ul>
                        {group.map((d) => (
                          <li key={d._id}>{d.firstName} {d.lastName}</li>
                        ))}
                      </ul>
                    </div>
                  ))
                )}
              </div>
            )}

            <div className="nc-footer">
              <button className="nc-cancel" onClick={() => setNcOpen(false)} disabled={ncApplying}>Cancel</button>
              {ncTab === 'changes' && ncChanges.length > 0 && (
                <button className="nc-apply" onClick={handleApplyNameCleanup} disabled={ncSelected.size === 0 || ncApplying}>
                  {ncApplying ? 'Applying...' : `Apply ${ncSelected.size} Change${ncSelected.size !== 1 ? 's' : ''}`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DoctorsPage;
