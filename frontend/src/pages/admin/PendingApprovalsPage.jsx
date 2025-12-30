/**
 * PendingApprovalsPage
 *
 * Admin page for reviewing and approving pending visits (Task 2.8)
 *
 * Features:
 * - Table of pending visits with filtering and sorting
 * - Bulk selection and operations (approve/reject multiple)
 * - Individual row actions
 * - Detail modal view with map
 * - Search, Region, Date filters
 *
 * Route: /admin/approvals
 */

import { useState, useMemo } from 'react';
import {
  Search,
  Filter,
  CheckCircle,
  XCircle,
  Eye,
  Calendar,
  MapPin,
  User,
  Stethoscope,
  ChevronDown,
  CheckSquare,
  Square,
  ArrowUpDown,
  Clock,
  AlertTriangle,
  X,
} from 'lucide-react';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import VisitApproval from '../../components/admin/VisitApproval';

/* =============================================================================
   MOCK DATA
   Pending visits with Iloilo City GPS coordinates for realistic map display
   ============================================================================= */

const MOCK_PENDING_VISITS = [
  {
    id: 'visit-001',
    employeeName: 'Juan Dela Cruz',
    employeeId: 'emp-001',
    doctorVisited: 'Dr. Maria Santos',
    dateTime: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
    region: 'Region VI - Western Visayas',
    photoProofs: ['photo1.jpg', 'photo2.jpg', 'photo3.jpg'],
    productsDiscussed: ['CardioMax 100mg', 'NeuroPlus 500mg'],
    gpsLocation: { lat: 10.7202, lng: 122.5621 }, // Iloilo City Center
  },
  {
    id: 'visit-002',
    employeeName: 'Maria Garcia',
    employeeId: 'emp-002',
    doctorVisited: 'Dr. Jose Rizal',
    dateTime: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(), // 5 hours ago
    region: 'NCR - Metro Manila',
    photoProofs: ['clinic_photo.jpg'],
    productsDiscussed: ['GastroShield 250mg'],
    gpsLocation: { lat: 14.5995, lng: 120.9842 }, // Manila
  },
  {
    id: 'visit-003',
    employeeName: 'Pedro Martinez',
    employeeId: 'emp-003',
    doctorVisited: 'Dr. Angela Yu',
    dateTime: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(), // 8 hours ago
    region: 'Region VI - Western Visayas',
    photoProofs: ['visit1.jpg', 'visit2.jpg'],
    productsDiscussed: ['CardioMax 100mg', 'ImmunoBoost', 'VitaPlus'],
    gpsLocation: { lat: 10.6918, lng: 122.5621 }, // Iloilo - La Paz
  },
  {
    id: 'visit-004',
    employeeName: 'Ana Lopez',
    employeeId: 'emp-004',
    doctorVisited: 'Dr. Chen Wei',
    dateTime: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(), // 1 day ago
    region: 'Region VII - Central Visayas',
    photoProofs: ['proof1.jpg'],
    productsDiscussed: ['NeuroPlus 500mg'],
    gpsLocation: { lat: 10.3157, lng: 123.8854 }, // Cebu City
  },
  {
    id: 'visit-005',
    employeeName: 'Roberto Lim',
    employeeId: 'emp-005',
    doctorVisited: 'Dr. Park Soo-Min',
    dateTime: new Date(Date.now() - 1.5 * 24 * 60 * 60 * 1000).toISOString(), // 1.5 days ago
    region: 'NCR - Metro Manila',
    photoProofs: ['doc1.jpg', 'doc2.jpg', 'doc3.jpg', 'doc4.jpg'],
    productsDiscussed: ['GastroShield 250mg', 'CardioMax 100mg'],
    gpsLocation: { lat: 14.5547, lng: 121.0244 }, // Makati
  },
  {
    id: 'visit-006',
    employeeName: 'Elena Cruz',
    employeeId: 'emp-006',
    doctorVisited: 'Dr. Thompson',
    dateTime: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days ago
    region: 'Region VI - Western Visayas',
    photoProofs: ['img1.jpg', 'img2.jpg'],
    productsDiscussed: ['ImmunoBoost', 'VitaPlus', 'NeuroPlus 500mg'],
    gpsLocation: { lat: 10.7028, lng: 122.5464 }, // Iloilo - Jaro
  },
  {
    id: 'visit-007',
    employeeName: 'Mike Torres',
    employeeId: 'emp-007',
    doctorVisited: 'Dr. Williams',
    dateTime: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days ago
    region: 'CAR - Cordillera',
    photoProofs: ['visit_proof.jpg'],
    productsDiscussed: ['CardioMax 100mg'],
    gpsLocation: { lat: 16.4023, lng: 120.5960 }, // Baguio City
  },
  {
    id: 'visit-008',
    employeeName: 'Sarah Reyes',
    employeeId: 'emp-008',
    doctorVisited: 'Dr. Luna',
    dateTime: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(), // 4 days ago
    region: 'Region VI - Western Visayas',
    photoProofs: ['photo_a.jpg', 'photo_b.jpg'],
    productsDiscussed: ['GastroShield 250mg', 'ImmunoBoost'],
    gpsLocation: { lat: 10.6713, lng: 122.9511 }, // Bacolod City
  },
];

/* =============================================================================
   CONSTANTS
   ============================================================================= */

const REGIONS = [
  'All Regions',
  'Region VI - Western Visayas',
  'NCR - Metro Manila',
  'Region VII - Central Visayas',
  'CAR - Cordillera',
];

const DATE_FILTERS = [
  { value: 'all', label: 'All Dates' },
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This Week' },
  { value: 'month', label: 'This Month' },
];

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest First' },
  { value: 'oldest', label: 'Oldest First' },
];

/* =============================================================================
   STYLES
   ============================================================================= */

const pageStyles = `
  .approvals-layout {
    min-height: 100vh;
    background: #f3f4f6;
  }

  .approvals-content {
    display: flex;
  }

  .approvals-main {
    flex: 1;
    padding: 24px;
    max-width: 1400px;
  }

  .page-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 24px;
  }

  .page-header h1 {
    margin: 0;
    font-size: 28px;
    color: #1f2937;
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .page-header-icon {
    width: 40px;
    height: 40px;
    background: linear-gradient(135deg, #f59e0b, #d97706);
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
  }

  .pending-count {
    padding: 6px 14px;
    background: #fef3c7;
    color: #b45309;
    border-radius: 20px;
    font-size: 14px;
    font-weight: 600;
  }

  /* Filter Bar */
  .filter-bar {
    background: white;
    border-radius: 12px;
    padding: 16px 20px;
    margin-bottom: 20px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: center;
  }

  .search-input {
    flex: 1;
    min-width: 220px;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 14px;
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
  }

  .search-input input {
    flex: 1;
    border: none;
    outline: none;
    font-size: 14px;
    color: #374151;
    background: transparent;
  }

  .search-input input::placeholder {
    color: #9ca3af;
  }

  .filter-select {
    padding: 10px 14px;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    font-size: 14px;
    color: #374151;
    background: white;
    cursor: pointer;
    min-width: 160px;
  }

  .filter-select:focus {
    outline: none;
    border-color: #f59e0b;
    box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.1);
  }

  /* Table Container */
  .table-container {
    background: white;
    border-radius: 12px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    overflow: hidden;
  }

  .table-header {
    padding: 16px 20px;
    border-bottom: 1px solid #e5e7eb;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .table-header h3 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    color: #1f2937;
  }

  .table-wrapper {
    overflow-x: auto;
  }

  table {
    width: 100%;
    border-collapse: collapse;
  }

  thead {
    background: #f9fafb;
  }

  th {
    padding: 14px 16px;
    text-align: left;
    font-size: 12px;
    font-weight: 600;
    color: #6b7280;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    border-bottom: 1px solid #e5e7eb;
  }

  th.checkbox-col {
    width: 48px;
    padding-left: 20px;
  }

  td {
    padding: 16px;
    font-size: 14px;
    color: #374151;
    border-bottom: 1px solid #f3f4f6;
    vertical-align: middle;
  }

  tr:hover {
    background: #f9fafb;
  }

  tr.selected {
    background: #fef3c7;
  }

  /* Checkbox Styling */
  .checkbox-wrapper {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .checkbox-btn {
    width: 20px;
    height: 20px;
    border: none;
    background: transparent;
    cursor: pointer;
    color: #d1d5db;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .checkbox-btn.checked {
    color: #f59e0b;
  }

  .checkbox-btn:hover {
    color: #f59e0b;
  }

  /* Employee Cell */
  .employee-cell {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .employee-avatar {
    width: 36px;
    height: 36px;
    border-radius: 8px;
    background: linear-gradient(135deg, #dbeafe, #bfdbfe);
    display: flex;
    align-items: center;
    justify-content: center;
    color: #2563eb;
  }

  .employee-name {
    font-weight: 500;
    color: #1f2937;
  }

  /* Doctor Cell */
  .doctor-cell {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .doctor-icon {
    color: #16a34a;
  }

  /* Date Cell */
  .date-cell {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .date-value {
    font-weight: 500;
    color: #1f2937;
  }

  .time-value {
    font-size: 12px;
    color: #6b7280;
  }

  /* Region Badge */
  .region-badge {
    display: inline-flex;
    padding: 4px 10px;
    background: #f3f4f6;
    color: #4b5563;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 500;
  }

  /* Action Buttons */
  .action-buttons {
    display: flex;
    gap: 8px;
  }

  .action-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 14px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    border: none;
  }

  .action-btn.view {
    background: #f3f4f6;
    color: #374151;
  }

  .action-btn.view:hover {
    background: #e5e7eb;
  }

  .action-btn.approve {
    background: #dcfce7;
    color: #16a34a;
  }

  .action-btn.approve:hover {
    background: #bbf7d0;
  }

  .action-btn.reject {
    background: #fee2e2;
    color: #dc2626;
  }

  .action-btn.reject:hover {
    background: #fecaca;
  }

  /* Bulk Actions Bar */
  .bulk-actions-bar {
    position: fixed;
    bottom: 24px;
    left: 50%;
    transform: translateX(-50%);
    background: #1f2937;
    color: white;
    padding: 14px 24px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    gap: 20px;
    box-shadow: 0 10px 40px rgba(0,0,0,0.3);
    z-index: 100;
    animation: slideUp 0.3s ease-out;
  }

  @keyframes slideUp {
    from { opacity: 0; transform: translateX(-50%) translateY(20px); }
    to { opacity: 1; transform: translateX(-50%) translateY(0); }
  }

  .bulk-actions-bar .selected-count {
    font-size: 14px;
    font-weight: 500;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .bulk-actions-bar .divider {
    width: 1px;
    height: 24px;
    background: #4b5563;
  }

  .bulk-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 18px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    border: none;
  }

  .bulk-btn.approve {
    background: #22c55e;
    color: white;
  }

  .bulk-btn.approve:hover {
    background: #16a34a;
  }

  .bulk-btn.reject {
    background: transparent;
    color: #fca5a5;
    border: 1px solid #fca5a5;
  }

  .bulk-btn.reject:hover {
    background: rgba(220, 38, 38, 0.1);
  }

  .bulk-btn.clear {
    background: transparent;
    color: #9ca3af;
    padding: 10px;
  }

  .bulk-btn.clear:hover {
    color: white;
  }

  /* Empty State */
  .empty-state {
    padding: 60px 20px;
    text-align: center;
  }

  .empty-state-icon {
    width: 64px;
    height: 64px;
    margin: 0 auto 16px;
    background: #f3f4f6;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #9ca3af;
  }

  .empty-state h3 {
    margin: 0 0 8px 0;
    font-size: 18px;
    color: #1f2937;
  }

  .empty-state p {
    margin: 0;
    font-size: 14px;
    color: #6b7280;
  }

  /* Quick Rejection Dialog (inline) */
  .quick-reject-dialog {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .quick-reject-content {
    background: white;
    border-radius: 16px;
    padding: 24px;
    width: 100%;
    max-width: 440px;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
  }

  .quick-reject-content h3 {
    margin: 0 0 8px 0;
    font-size: 18px;
    color: #1f2937;
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .quick-reject-content p {
    margin: 0 0 16px 0;
    font-size: 14px;
    color: #6b7280;
  }

  .quick-reject-content textarea {
    width: 100%;
    min-height: 100px;
    padding: 12px;
    border: 1px solid #e5e7eb;
    border-radius: 10px;
    font-size: 14px;
    resize: vertical;
    margin-bottom: 16px;
    font-family: inherit;
  }

  .quick-reject-content textarea:focus {
    outline: none;
    border-color: #dc2626;
    box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.1);
  }

  .quick-reject-actions {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
  }

  .dialog-btn {
    padding: 10px 20px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    border: none;
  }

  .dialog-btn.cancel {
    background: #f3f4f6;
    color: #374151;
  }

  .dialog-btn.confirm {
    background: #dc2626;
    color: white;
  }

  .dialog-btn.confirm:disabled {
    background: #fca5a5;
    cursor: not-allowed;
  }
`;

/* =============================================================================
   COMPONENT: PendingApprovalsPage
   ============================================================================= */

const PendingApprovalsPage = () => {
  // State: Data
  const [visits, setVisits] = useState(MOCK_PENDING_VISITS);

  // State: Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [regionFilter, setRegionFilter] = useState('All Regions');
  const [dateFilter, setDateFilter] = useState('all');
  const [sortBy, setSortBy] = useState('newest');

  // State: Selection
  const [selectedIds, setSelectedIds] = useState([]);

  // State: Modals
  const [selectedVisit, setSelectedVisit] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showQuickReject, setShowQuickReject] = useState(false);
  const [rejectTarget, setRejectTarget] = useState(null); // single visit or 'bulk'
  const [rejectReason, setRejectReason] = useState('');

  /* ---------------------------------------------------------------------------
     Filtering & Sorting Logic
     --------------------------------------------------------------------------- */

  const filteredAndSortedVisits = useMemo(() => {
    let result = [...visits];

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (v) =>
          v.employeeName.toLowerCase().includes(query) ||
          v.doctorVisited.toLowerCase().includes(query)
      );
    }

    // Region filter
    if (regionFilter !== 'All Regions') {
      result = result.filter((v) => v.region === regionFilter);
    }

    // Date filter
    const now = new Date();
    if (dateFilter === 'today') {
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      result = result.filter((v) => new Date(v.dateTime) >= todayStart);
    } else if (dateFilter === 'week') {
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      result = result.filter((v) => new Date(v.dateTime) >= weekAgo);
    } else if (dateFilter === 'month') {
      const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      result = result.filter((v) => new Date(v.dateTime) >= monthAgo);
    }

    // Sorting
    result.sort((a, b) => {
      const dateA = new Date(a.dateTime);
      const dateB = new Date(b.dateTime);
      return sortBy === 'newest' ? dateB - dateA : dateA - dateB;
    });

    return result;
  }, [visits, searchQuery, regionFilter, dateFilter, sortBy]);

  /* ---------------------------------------------------------------------------
     Selection Handlers
     --------------------------------------------------------------------------- */

  const handleSelectAll = () => {
    if (selectedIds.length === filteredAndSortedVisits.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredAndSortedVisits.map((v) => v.id));
    }
  };

  const handleSelectOne = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const clearSelection = () => {
    setSelectedIds([]);
  };

  /* ---------------------------------------------------------------------------
     Action Handlers
     --------------------------------------------------------------------------- */

  // View details
  const handleViewDetails = (visit) => {
    setSelectedVisit(visit);
    setShowDetailModal(true);
  };

  // Approve single
  const handleApproveSingle = (visit) => {
    console.log('✅ Approved visit:', visit.id);
    setVisits((prev) => prev.filter((v) => v.id !== visit.id));
    setSelectedIds((prev) => prev.filter((id) => id !== visit.id));
  };

  // Reject single (opens dialog)
  const handleRejectSingle = (visit) => {
    setRejectTarget(visit);
    setShowQuickReject(true);
  };

  // Bulk approve
  const handleBulkApprove = () => {
    console.log('✅ Bulk approved visits:', selectedIds);
    setVisits((prev) => prev.filter((v) => !selectedIds.includes(v.id)));
    setSelectedIds([]);
  };

  // Bulk reject (opens dialog)
  const handleBulkReject = () => {
    setRejectTarget('bulk');
    setShowQuickReject(true);
  };

  // Confirm rejection
  const handleConfirmReject = () => {
    if (rejectTarget === 'bulk') {
      console.log('❌ Bulk rejected visits:', selectedIds, 'Reason:', rejectReason);
      setVisits((prev) => prev.filter((v) => !selectedIds.includes(v.id)));
      setSelectedIds([]);
    } else if (rejectTarget) {
      console.log('❌ Rejected visit:', rejectTarget.id, 'Reason:', rejectReason);
      setVisits((prev) => prev.filter((v) => v.id !== rejectTarget.id));
      setSelectedIds((prev) => prev.filter((id) => id !== rejectTarget.id));
    }
    setShowQuickReject(false);
    setRejectTarget(null);
    setRejectReason('');
  };

  // Cancel rejection
  const handleCancelReject = () => {
    setShowQuickReject(false);
    setRejectTarget(null);
    setRejectReason('');
  };

  // Close detail modal
  const handleCloseDetail = () => {
    setShowDetailModal(false);
    setSelectedVisit(null);
  };

  /* ---------------------------------------------------------------------------
     Format Helpers
     --------------------------------------------------------------------------- */

  const formatDate = (isoString) => {
    const date = new Date(isoString);
    return {
      date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      time: date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
    };
  };

  /* ---------------------------------------------------------------------------
     Render
     --------------------------------------------------------------------------- */

  const isAllSelected =
    filteredAndSortedVisits.length > 0 &&
    selectedIds.length === filteredAndSortedVisits.length;

  return (
    <div className="approvals-layout">
      <style>{pageStyles}</style>
      <Navbar />
      <div className="approvals-content">
        <Sidebar />
        <main className="approvals-main">
          {/* Page Header */}
          <div className="page-header">
            <h1>
              <div className="page-header-icon">
                <Clock size={20} />
              </div>
              Pending Approvals
            </h1>
            <span className="pending-count">{visits.length} Pending</span>
          </div>

          {/* Filter Bar */}
          <div className="filter-bar">
            <div className="search-input">
              <Search size={16} color="#9ca3af" />
              <input
                type="text"
                placeholder="Search by employee or doctor..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <select
              className="filter-select"
              value={regionFilter}
              onChange={(e) => setRegionFilter(e.target.value)}
            >
              {REGIONS.map((region) => (
                <option key={region} value={region}>
                  {region}
                </option>
              ))}
            </select>

            <select
              className="filter-select"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
            >
              {DATE_FILTERS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>

            <select
              className="filter-select"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Table */}
          <div className="table-container">
            <div className="table-header">
              <h3>Visit Requests ({filteredAndSortedVisits.length})</h3>
            </div>

            {filteredAndSortedVisits.length > 0 ? (
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th className="checkbox-col">
                        <div className="checkbox-wrapper">
                          <button
                            className={`checkbox-btn ${isAllSelected ? 'checked' : ''}`}
                            onClick={handleSelectAll}
                          >
                            {isAllSelected ? (
                              <CheckSquare size={20} />
                            ) : (
                              <Square size={20} />
                            )}
                          </button>
                        </div>
                      </th>
                      <th>Employee</th>
                      <th>Doctor Visited</th>
                      <th>Date & Time</th>
                      <th>Region</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAndSortedVisits.map((visit) => {
                      const isSelected = selectedIds.includes(visit.id);
                      const { date, time } = formatDate(visit.dateTime);

                      return (
                        <tr key={visit.id} className={isSelected ? 'selected' : ''}>
                          <td>
                            <div className="checkbox-wrapper">
                              <button
                                className={`checkbox-btn ${isSelected ? 'checked' : ''}`}
                                onClick={() => handleSelectOne(visit.id)}
                              >
                                {isSelected ? (
                                  <CheckSquare size={20} />
                                ) : (
                                  <Square size={20} />
                                )}
                              </button>
                            </div>
                          </td>
                          <td>
                            <div className="employee-cell">
                              <div className="employee-avatar">
                                <User size={18} />
                              </div>
                              <span className="employee-name">{visit.employeeName}</span>
                            </div>
                          </td>
                          <td>
                            <div className="doctor-cell">
                              <Stethoscope size={16} className="doctor-icon" />
                              {visit.doctorVisited}
                            </div>
                          </td>
                          <td>
                            <div className="date-cell">
                              <span className="date-value">{date}</span>
                              <span className="time-value">{time}</span>
                            </div>
                          </td>
                          <td>
                            <span className="region-badge">{visit.region}</span>
                          </td>
                          <td>
                            <div className="action-buttons">
                              <button
                                className="action-btn view"
                                onClick={() => handleViewDetails(visit)}
                              >
                                <Eye size={14} />
                                View
                              </button>
                              <button
                                className="action-btn approve"
                                onClick={() => handleApproveSingle(visit)}
                              >
                                <CheckCircle size={14} />
                                Approve
                              </button>
                              <button
                                className="action-btn reject"
                                onClick={() => handleRejectSingle(visit)}
                              >
                                <XCircle size={14} />
                                Reject
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty-state">
                <div className="empty-state-icon">
                  <CheckCircle size={32} />
                </div>
                <h3>All Caught Up!</h3>
                <p>There are no pending visits to review.</p>
              </div>
            )}
          </div>

          {/* Bulk Actions Bar */}
          {selectedIds.length > 0 && (
            <div className="bulk-actions-bar">
              <span className="selected-count">
                <CheckSquare size={18} />
                {selectedIds.length} selected
              </span>
              <div className="divider" />
              <button className="bulk-btn approve" onClick={handleBulkApprove}>
                <CheckCircle size={16} />
                Approve Selected
              </button>
              <button className="bulk-btn reject" onClick={handleBulkReject}>
                <XCircle size={16} />
                Reject Selected
              </button>
              <button className="bulk-btn clear" onClick={clearSelection}>
                <X size={18} />
              </button>
            </div>
          )}
        </main>
      </div>

      {/* Detail Modal */}
      <VisitApproval
        visit={selectedVisit}
        isOpen={showDetailModal}
        onClose={handleCloseDetail}
        onApprove={handleApproveSingle}
        onReject={(visit, reason) => {
          console.log('❌ Rejected from modal:', visit.id, 'Reason:', reason);
          setVisits((prev) => prev.filter((v) => v.id !== visit.id));
          setSelectedIds((prev) => prev.filter((id) => id !== visit.id));
        }}
      />

      {/* Quick Rejection Dialog */}
      {showQuickReject && (
        <div className="quick-reject-dialog">
          <div className="quick-reject-content">
            <h3>
              <AlertTriangle size={20} style={{ color: '#dc2626' }} />
              {rejectTarget === 'bulk'
                ? `Reject ${selectedIds.length} Visits`
                : 'Reject Visit'}
            </h3>
            <p>
              {rejectTarget === 'bulk'
                ? 'Please provide a reason for rejecting these visits. This will be sent to all affected employees.'
                : 'Please provide a reason for rejecting this visit. This will be sent to the employee.'}
            </p>
            <textarea
              placeholder="Enter rejection reason..."
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              autoFocus
            />
            <div className="quick-reject-actions">
              <button className="dialog-btn cancel" onClick={handleCancelReject}>
                Cancel
              </button>
              <button
                className="dialog-btn confirm"
                onClick={handleConfirmReject}
                disabled={!rejectReason.trim()}
              >
                Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PendingApprovalsPage;