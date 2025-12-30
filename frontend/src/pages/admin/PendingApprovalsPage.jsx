/**
 * PendingApprovalsPage
 *
 * Admin page for reviewing and approving pending visits (Task 2.8 + 2.9)
 *
 * Features:
 * - Table of pending visits with filtering and sorting
 * - Search by employee or doctor name
 * - Region filter dropdown
 * - Date filter (Today/This Week/This Month/All)
 * - Sort by (Newest First/Oldest First)
 * - Bulk selection and operations (approve/reject multiple)
 * - Individual row actions
 * - Detail modal view with GPS verification map
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
  SlidersHorizontal,
} from 'lucide-react';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import VisitApproval from '../../components/admin/VisitApproval';

/* =============================================================================
   MOCK DATA - With GPS verification fields
   ============================================================================= */

const MOCK_PENDING_VISITS = [
  {
    id: 'visit-001',
    // Header Info
    date: '2025-12-30',
    time: '09:30 AM',
    weekLabel: 'W1D2',
    status: 'pending',
    // Employee Info
    employeeName: 'Juan Dela Cruz',
    employeeId: 'emp-001',
    region: 'Region VI - Western Visayas',
    // VIP Client Info
    doctorName: 'Dr. Maria Santos',
    specialization: 'Cardiologist',
    hospital: 'Iloilo Doctors Hospital',
    clinicAddress: '123 General Luna St, Iloilo City',
    visitFrequency: 'Weekly',
    // Notes
    purpose: 'Product presentation for CardioMax 100mg and follow-up on previous samples.',
    clientFeedback: 'Doctor expressed interest in the new formulation. Requested additional clinical studies.',
    privateNotes: 'Schedule follow-up visit next week. Bring updated brochures.',
    // GPS Data
    clinicCoordinates: { lat: 10.6969, lng: 122.5648 },
    employeeCoordinates: { lat: 10.6975, lng: 122.5652 }, // ~70m away (verified)
    gpsAccuracy: 12,
    // Products & Photos
    productsDiscussed: ['CardioMax 100mg', 'NeuroPlus 500mg'],
    photoProofs: ['photo1.jpg', 'photo2.jpg'],
    // Timestamps for filtering
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
  },
  {
    id: 'visit-002',
    date: '2025-12-29',
    time: '02:00 PM',
    weekLabel: 'W1D1',
    status: 'pending',
    employeeName: 'Maria Garcia',
    employeeId: 'emp-002',
    region: 'NCR - Metro Manila',
    doctorName: 'Dr. Jose Rizal',
    specialization: 'General Practitioner',
    hospital: 'Manila Medical Center',
    clinicAddress: '456 Taft Avenue, Manila',
    visitFrequency: 'Monthly',
    purpose: 'Introduce new GastroShield product line.',
    clientFeedback: 'Needs more information about dosage recommendations.',
    privateNotes: 'Send product literature via email.',
    clinicCoordinates: { lat: 14.5995, lng: 120.9842 },
    employeeCoordinates: { lat: 14.6030, lng: 120.9880 }, // ~500m away (suspicious)
    gpsAccuracy: 18,
    productsDiscussed: ['GastroShield 250mg'],
    photoProofs: ['clinic_photo.jpg'],
    createdAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(), // 5 hours ago
  },
  {
    id: 'visit-003',
    date: '2025-12-28',
    time: '10:00 AM',
    weekLabel: 'W4D5',
    status: 'pending',
    employeeName: 'Pedro Martinez',
    employeeId: 'emp-003',
    region: 'Region VI - Western Visayas',
    doctorName: 'Dr. Angela Yu',
    specialization: 'Neurologist',
    hospital: 'Western Visayas Medical Center',
    clinicAddress: '789 Iznart St, Iloilo City',
    visitFrequency: 'Bi-weekly',
    purpose: 'Follow-up on NeuroPlus trial results.',
    clientFeedback: 'Positive results observed. Will continue prescribing.',
    privateNotes: 'Potential for increased order volume.',
    clinicCoordinates: { lat: 10.6920, lng: 122.5700 },
    employeeCoordinates: { lat: 10.6925, lng: 122.5705 }, // ~60m away (verified)
    gpsAccuracy: 8,
    productsDiscussed: ['NeuroPlus 500mg', 'ImmunoBoost'],
    photoProofs: ['visit1.jpg', 'visit2.jpg'],
    createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(), // 1 day ago
  },
  {
    id: 'visit-004',
    date: '2025-12-27',
    time: '11:00 AM',
    weekLabel: 'W4D4',
    status: 'pending',
    employeeName: 'Ana Lopez',
    employeeId: 'emp-004',
    region: 'Region VII - Central Visayas',
    doctorName: 'Dr. Chen Wei',
    specialization: 'Internist',
    hospital: 'Cebu Doctors University Hospital',
    clinicAddress: '321 Osmena Blvd, Cebu City',
    visitFrequency: 'Weekly',
    purpose: 'Regular check-in and inventory review.',
    clientFeedback: 'Running low on CardioMax samples.',
    privateNotes: 'Arrange sample delivery by Friday.',
    clinicCoordinates: { lat: 10.3157, lng: 123.8854 },
    employeeCoordinates: { lat: 10.3190, lng: 123.8890 }, // ~450m away (suspicious)
    gpsAccuracy: 25,
    productsDiscussed: ['CardioMax 100mg'],
    photoProofs: ['proof1.jpg'],
    createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days ago
  },
  {
    id: 'visit-005',
    date: '2025-12-26',
    time: '03:30 PM',
    weekLabel: 'W4D3',
    status: 'pending',
    employeeName: 'Roberto Lim',
    employeeId: 'emp-005',
    region: 'NCR - Metro Manila',
    doctorName: 'Dr. Park Soo-Min',
    specialization: 'Pediatrician',
    hospital: 'Makati Medical Center',
    clinicAddress: '555 Ayala Ave, Makati City',
    visitFrequency: 'Monthly',
    purpose: 'New pediatric formulation presentation.',
    clientFeedback: 'Very interested in child-friendly options.',
    privateNotes: 'Prepare pediatric dosing guide for next visit.',
    clinicCoordinates: { lat: 14.5547, lng: 121.0244 },
    employeeCoordinates: { lat: 14.5550, lng: 121.0248 }, // ~50m away (verified)
    gpsAccuracy: 5,
    productsDiscussed: ['GastroShield 250mg', 'ImmunoBoost'],
    photoProofs: ['doc1.jpg', 'doc2.jpg'],
    createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(), // 5 days ago
  },
];

const REGIONS = [
  'All Regions',
  'Region VI - Western Visayas',
  'NCR - Metro Manila',
  'Region VII - Central Visayas',
  'CAR - Cordillera',
];

const DATE_FILTERS = [
  { value: 'all', label: 'All Time' },
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
  /* ==========================================================================
     LAYOUT
     ========================================================================== */

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
    max-width: 1600px;
  }

  /* ==========================================================================
     PAGE HEADER
     ========================================================================== */

  .page-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 24px;
  }

  .page-header-left {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .page-header h1 {
    margin: 0;
    font-size: 28px;
    font-weight: 700;
    color: #1f2937;
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .page-header-icon {
    width: 48px;
    height: 48px;
    background: linear-gradient(135deg, #f59e0b, #d97706);
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    box-shadow: 0 4px 12px rgba(245, 158, 11, 0.3);
  }

  .pending-count {
    padding: 8px 16px;
    background: linear-gradient(135deg, #fef3c7, #fde68a);
    color: #92400e;
    border-radius: 24px;
    font-size: 14px;
    font-weight: 600;
    border: 1px solid #fcd34d;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .pending-count .dot {
    width: 8px;
    height: 8px;
    background: #f59e0b;
    border-radius: 50%;
    animation: pulse 2s infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.6; transform: scale(0.9); }
  }

  /* ==========================================================================
     FILTER BAR
     ========================================================================== */

  .filter-bar {
    background: white;
    border-radius: 16px;
    padding: 20px 24px;
    margin-bottom: 24px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.08);
    border: 1px solid #e5e7eb;
  }

  .filter-bar-row {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    align-items: center;
  }

  .search-input-wrapper {
    flex: 1;
    min-width: 280px;
    position: relative;
  }

  .search-input {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 16px;
    background: #f9fafb;
    border: 2px solid #e5e7eb;
    border-radius: 10px;
    transition: all 0.2s;
  }

  .search-input:focus-within {
    border-color: #f59e0b;
    background: white;
    box-shadow: 0 0 0 4px rgba(245, 158, 11, 0.1);
  }

  .search-input input {
    flex: 1;
    border: none;
    outline: none;
    font-size: 14px;
    background: transparent;
    color: #1f2937;
  }

  .search-input input::placeholder {
    color: #9ca3af;
  }

  .filter-group {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .filter-label {
    font-size: 13px;
    font-weight: 500;
    color: #6b7280;
    white-space: nowrap;
  }

  .filter-select {
    padding: 10px 36px 10px 14px;
    border: 2px solid #e5e7eb;
    border-radius: 10px;
    font-size: 14px;
    color: #374151;
    background: white;
    cursor: pointer;
    appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 10px center;
    transition: all 0.2s;
    min-width: 160px;
  }

  .filter-select:hover {
    border-color: #d1d5db;
  }

  .filter-select:focus {
    outline: none;
    border-color: #f59e0b;
    box-shadow: 0 0 0 4px rgba(245, 158, 11, 0.1);
  }

  .filter-divider {
    width: 1px;
    height: 32px;
    background: #e5e7eb;
    margin: 0 8px;
  }

  /* ==========================================================================
     TABLE CONTAINER
     ========================================================================== */

  .table-container {
    background: white;
    border-radius: 16px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.08);
    border: 1px solid #e5e7eb;
    overflow: hidden;
  }

  .table-header {
    padding: 18px 24px;
    border-bottom: 1px solid #e5e7eb;
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: #fafafa;
  }

  .table-header h3 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    color: #374151;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .table-header-badge {
    padding: 4px 10px;
    background: #f3f4f6;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 500;
    color: #6b7280;
  }

  /* ==========================================================================
     TABLE STYLES
     ========================================================================== */

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
    padding: 14px 20px;
    text-align: left;
    font-size: 11px;
    font-weight: 600;
    color: #6b7280;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    border-bottom: 1px solid #e5e7eb;
    white-space: nowrap;
  }

  th:first-child {
    padding-left: 24px;
  }

  th:last-child {
    padding-right: 24px;
  }

  td {
    padding: 18px 20px;
    font-size: 14px;
    color: #374151;
    border-bottom: 1px solid #f3f4f6;
    vertical-align: middle;
  }

  td:first-child {
    padding-left: 24px;
  }

  td:last-child {
    padding-right: 24px;
  }

  tbody tr {
    transition: all 0.15s;
  }

  tbody tr:hover {
    background: #fefce8;
  }

  tbody tr.selected {
    background: #fef3c7;
  }

  tbody tr:last-child td {
    border-bottom: none;
  }

  /* ==========================================================================
     CHECKBOX
     ========================================================================== */

  .checkbox-btn {
    width: 22px;
    height: 22px;
    border: none;
    background: transparent;
    cursor: pointer;
    color: #d1d5db;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s;
  }

  .checkbox-btn:hover {
    color: #9ca3af;
  }

  .checkbox-btn.checked {
    color: #f59e0b;
  }

  /* ==========================================================================
     EMPLOYEE CELL
     ========================================================================== */

  .employee-cell {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .employee-avatar {
    width: 40px;
    height: 40px;
    border-radius: 10px;
    background: linear-gradient(135deg, #dbeafe, #bfdbfe);
    display: flex;
    align-items: center;
    justify-content: center;
    color: #2563eb;
    font-weight: 600;
    font-size: 14px;
  }

  .employee-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .employee-name {
    font-weight: 600;
    color: #1f2937;
  }

  .employee-id {
    font-size: 12px;
    color: #9ca3af;
  }

  /* ==========================================================================
     DOCTOR CELL
     ========================================================================== */

  .doctor-cell {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .doctor-icon {
    width: 32px;
    height: 32px;
    border-radius: 8px;
    background: linear-gradient(135deg, #dcfce7, #bbf7d0);
    display: flex;
    align-items: center;
    justify-content: center;
    color: #16a34a;
  }

  .doctor-name {
    font-weight: 500;
    color: #1f2937;
  }

  /* ==========================================================================
     DATE CELL
     ========================================================================== */

  .date-cell {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .date-value {
    font-weight: 500;
    color: #1f2937;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .time-value {
    font-size: 12px;
    color: #6b7280;
    display: flex;
    align-items: center;
    gap: 4px;
  }

  /* ==========================================================================
     REGION BADGE
     ========================================================================== */

  .region-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    background: #f3f4f6;
    border-radius: 8px;
    font-size: 13px;
    color: #4b5563;
    white-space: nowrap;
  }

  .region-badge .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #9ca3af;
  }

  /* ==========================================================================
     ACTION BUTTONS
     ========================================================================== */

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
    border: none;
    transition: all 0.2s;
    white-space: nowrap;
  }

  .action-btn.view {
    background: #f3f4f6;
    color: #374151;
  }

  .action-btn.view:hover {
    background: #e5e7eb;
    transform: translateY(-1px);
  }

  .action-btn.approve {
    background: linear-gradient(135deg, #dcfce7, #bbf7d0);
    color: #15803d;
    border: 1px solid #86efac;
  }

  .action-btn.approve:hover {
    background: linear-gradient(135deg, #bbf7d0, #86efac);
    transform: translateY(-1px);
    box-shadow: 0 2px 8px rgba(34, 197, 94, 0.3);
  }

  .action-btn.reject {
    background: linear-gradient(135deg, #fee2e2, #fecaca);
    color: #dc2626;
    border: 1px solid #fca5a5;
  }

  .action-btn.reject:hover {
    background: linear-gradient(135deg, #fecaca, #fca5a5);
    transform: translateY(-1px);
    box-shadow: 0 2px 8px rgba(220, 38, 38, 0.3);
  }

  /* ==========================================================================
     BULK ACTIONS BAR
     ========================================================================== */

  .bulk-actions-bar {
    position: fixed;
    bottom: 24px;
    left: 50%;
    transform: translateX(-50%);
    background: linear-gradient(135deg, #1f2937, #111827);
    color: white;
    padding: 16px 28px;
    border-radius: 16px;
    display: flex;
    align-items: center;
    gap: 20px;
    box-shadow: 0 10px 40px rgba(0,0,0,0.4);
    z-index: 100;
    animation: slideUp 0.3s ease-out;
  }

  @keyframes slideUp {
    from { opacity: 0; transform: translateX(-50%) translateY(20px); }
    to { opacity: 1; transform: translateX(-50%) translateY(0); }
  }

  .bulk-actions-bar .selected-count {
    font-size: 14px;
    display: flex;
    align-items: center;
    gap: 10px;
    font-weight: 500;
  }

  .bulk-actions-bar .selected-count .count-badge {
    padding: 4px 10px;
    background: rgba(255,255,255,0.15);
    border-radius: 6px;
    font-weight: 600;
  }

  .bulk-actions-bar .divider {
    width: 1px;
    height: 28px;
    background: rgba(255,255,255,0.2);
  }

  .bulk-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 20px;
    border-radius: 10px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    border: none;
    transition: all 0.2s;
  }

  .bulk-btn.approve {
    background: linear-gradient(135deg, #22c55e, #16a34a);
    color: white;
  }

  .bulk-btn.approve:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(34, 197, 94, 0.4);
  }

  .bulk-btn.reject {
    background: transparent;
    color: #fca5a5;
    border: 2px solid rgba(252, 165, 165, 0.5);
  }

  .bulk-btn.reject:hover {
    background: rgba(220, 38, 38, 0.2);
    border-color: #fca5a5;
  }

  .bulk-btn.clear {
    background: transparent;
    color: #9ca3af;
    padding: 10px;
    border-radius: 8px;
  }

  .bulk-btn.clear:hover {
    background: rgba(255,255,255,0.1);
    color: white;
  }

  /* ==========================================================================
     EMPTY STATE
     ========================================================================== */

  .empty-state {
    padding: 80px 20px;
    text-align: center;
  }

  .empty-state-icon {
    width: 80px;
    height: 80px;
    margin: 0 auto 20px;
    background: linear-gradient(135deg, #dcfce7, #bbf7d0);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #16a34a;
  }

  .empty-state h3 {
    margin: 0 0 8px 0;
    font-size: 20px;
    font-weight: 600;
    color: #1f2937;
  }

  .empty-state p {
    margin: 0;
    font-size: 15px;
    color: #6b7280;
  }

  /* ==========================================================================
     QUICK REJECT DIALOG
     ========================================================================== */

  .quick-reject-dialog {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: 20px;
    animation: fadeIn 0.2s ease-out;
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .quick-reject-content {
    background: white;
    border-radius: 20px;
    padding: 28px;
    width: 100%;
    max-width: 460px;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
    animation: modalSlide 0.3s ease-out;
  }

  @keyframes modalSlide {
    from { opacity: 0; transform: scale(0.95) translateY(10px); }
    to { opacity: 1; transform: scale(1) translateY(0); }
  }

  .quick-reject-content h3 {
    margin: 0 0 8px 0;
    font-size: 20px;
    font-weight: 600;
    color: #1f2937;
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .quick-reject-content h3 .icon {
    width: 40px;
    height: 40px;
    background: linear-gradient(135deg, #fee2e2, #fecaca);
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #dc2626;
  }

  .quick-reject-content p {
    margin: 0 0 20px 0;
    font-size: 14px;
    color: #6b7280;
  }

  .quick-reject-content textarea {
    width: 100%;
    min-height: 120px;
    padding: 14px;
    border: 2px solid #e5e7eb;
    border-radius: 12px;
    font-size: 14px;
    font-family: inherit;
    margin-bottom: 20px;
    resize: vertical;
    transition: all 0.2s;
  }

  .quick-reject-content textarea:focus {
    outline: none;
    border-color: #dc2626;
    box-shadow: 0 0 0 4px rgba(220, 38, 38, 0.1);
  }

  .quick-reject-content textarea::placeholder {
    color: #9ca3af;
  }

  .quick-reject-actions {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
  }

  .dialog-btn {
    padding: 12px 24px;
    border-radius: 10px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    border: none;
    transition: all 0.2s;
  }

  .dialog-btn.cancel {
    background: #f3f4f6;
    color: #374151;
  }

  .dialog-btn.cancel:hover {
    background: #e5e7eb;
  }

  .dialog-btn.confirm {
    background: linear-gradient(135deg, #dc2626, #b91c1c);
    color: white;
  }

  .dialog-btn.confirm:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(220, 38, 38, 0.4);
  }

  .dialog-btn.confirm:disabled {
    background: #fca5a5;
    cursor: not-allowed;
    transform: none;
    box-shadow: none;
  }

  /* ==========================================================================
     RESPONSIVE
     ========================================================================== */

  @media (max-width: 1024px) {
    .filter-bar-row {
      flex-direction: column;
      align-items: stretch;
    }

    .search-input-wrapper {
      min-width: 100%;
    }

    .filter-group {
      flex-wrap: wrap;
    }

    .filter-divider {
      display: none;
    }

    .action-buttons {
      flex-direction: column;
    }
  }

  @media (max-width: 768px) {
    .approvals-main {
      padding: 16px;
    }

    .page-header {
      flex-direction: column;
      align-items: flex-start;
      gap: 12px;
    }

    .bulk-actions-bar {
      width: calc(100% - 32px);
      flex-wrap: wrap;
      justify-content: center;
    }
  }
`;

/* =============================================================================
   HELPER FUNCTIONS
   ============================================================================= */

const isToday = (dateStr) => {
  const date = new Date(dateStr);
  const today = new Date();
  return date.toDateString() === today.toDateString();
};

const isThisWeek = (dateStr) => {
  const date = new Date(dateStr);
  const today = new Date();
  const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
  return date >= weekAgo && date <= today;
};

const isThisMonth = (dateStr) => {
  const date = new Date(dateStr);
  const today = new Date();
  return date.getMonth() === today.getMonth() && date.getFullYear() === today.getFullYear();
};

const getInitials = (name) => {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
};

/* =============================================================================
   COMPONENT
   ============================================================================= */

const PendingApprovalsPage = () => {
  // State
  const [visits, setVisits] = useState(MOCK_PENDING_VISITS);
  const [searchQuery, setSearchQuery] = useState('');
  const [regionFilter, setRegionFilter] = useState('All Regions');
  const [dateFilter, setDateFilter] = useState('all');
  const [sortBy, setSortBy] = useState('newest');
  const [selectedIds, setSelectedIds] = useState([]);
  const [selectedVisit, setSelectedVisit] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [showQuickReject, setShowQuickReject] = useState(false);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectReason, setRejectReason] = useState('');

  // Filter and sort visits
  const filteredAndSortedVisits = useMemo(() => {
    let result = [...visits];

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (v) =>
          v.employeeName.toLowerCase().includes(query) ||
          v.doctorName.toLowerCase().includes(query)
      );
    }

    // Region filter
    if (regionFilter !== 'All Regions') {
      result = result.filter((v) => v.region === regionFilter);
    }

    // Date filter
    if (dateFilter === 'today') {
      result = result.filter((v) => isToday(v.createdAt));
    } else if (dateFilter === 'week') {
      result = result.filter((v) => isThisWeek(v.createdAt));
    } else if (dateFilter === 'month') {
      result = result.filter((v) => isThisMonth(v.createdAt));
    }

    // Sort
    result.sort((a, b) => {
      const dateA = new Date(a.createdAt);
      const dateB = new Date(b.createdAt);
      return sortBy === 'newest' ? dateB - dateA : dateA - dateB;
    });

    return result;
  }, [visits, searchQuery, regionFilter, dateFilter, sortBy]);

  // Selection handlers
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

  // View details
  const handleViewDetails = (visit) => {
    setSelectedVisit(visit);
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setSelectedVisit(null);
  };

  // Approve single
  const handleApprove = (visit) => {
    console.log('✅ Approved:', visit.id);
    setVisits((prev) => prev.filter((v) => v.id !== visit.id));
    setSelectedIds((prev) => prev.filter((id) => id !== visit.id));
  };

  // Reject click
  const handleRejectClick = (visit) => {
    setRejectTarget(visit);
    setShowQuickReject(true);
  };

  // Confirm reject
  const handleConfirmReject = () => {
    if (rejectTarget === 'bulk') {
      console.log('❌ Bulk rejected:', selectedIds, 'Reason:', rejectReason);
      setVisits((prev) => prev.filter((v) => !selectedIds.includes(v.id)));
      setSelectedIds([]);
    } else if (rejectTarget) {
      console.log('❌ Rejected:', rejectTarget.id, 'Reason:', rejectReason);
      setVisits((prev) => prev.filter((v) => v.id !== rejectTarget.id));
      setSelectedIds((prev) => prev.filter((id) => id !== rejectTarget.id));
    }
    setShowQuickReject(false);
    setRejectTarget(null);
    setRejectReason('');
  };

  // Bulk actions
  const handleBulkApprove = () => {
    console.log('✅ Bulk approved:', selectedIds);
    setVisits((prev) => prev.filter((v) => !selectedIds.includes(v.id)));
    setSelectedIds([]);
  };

  const handleBulkReject = () => {
    setRejectTarget('bulk');
    setShowQuickReject(true);
  };

  const isAllSelected =
    filteredAndSortedVisits.length > 0 && selectedIds.length === filteredAndSortedVisits.length;

  return (
    <div className="approvals-layout">
      <style>{pageStyles}</style>
      <Navbar />
      <div className="approvals-content">
        <Sidebar />
        <main className="approvals-main">
          {/* Page Header */}
          <div className="page-header">
            <div className="page-header-left">
              <h1>
                <div className="page-header-icon">
                  <Clock size={24} />
                </div>
                Pending Approvals
              </h1>
            </div>
            <span className="pending-count">
              <span className="dot" />
              {visits.length} Pending
            </span>
          </div>

          {/* Filter Bar */}
          <div className="filter-bar">
            <div className="filter-bar-row">
              {/* Search */}
              <div className="search-input-wrapper">
                <div className="search-input">
                  <Search size={18} color="#9ca3af" />
                  <input
                    type="text"
                    placeholder="Search by employee or doctor name..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>

              {/* Region Filter */}
              <div className="filter-group">
                <span className="filter-label">Region:</span>
                <select
                  className="filter-select"
                  value={regionFilter}
                  onChange={(e) => setRegionFilter(e.target.value)}
                >
                  {REGIONS.map((region) => (
                    <option key={region} value={region}>{region}</option>
                  ))}
                </select>
              </div>

              <div className="filter-divider" />

              {/* Date Filter */}
              <div className="filter-group">
                <span className="filter-label">Date:</span>
                <select
                  className="filter-select"
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value)}
                >
                  {DATE_FILTERS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              {/* Sort */}
              <div className="filter-group">
                <span className="filter-label">Sort:</span>
                <select
                  className="filter-select"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                >
                  {SORT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="table-container">
            <div className="table-header">
              <h3>
                <Stethoscope size={18} />
                Visit Requests
                <span className="table-header-badge">{filteredAndSortedVisits.length} results</span>
              </h3>
            </div>

            {filteredAndSortedVisits.length > 0 ? (
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: 50 }}>
                        <button
                          className={`checkbox-btn ${isAllSelected ? 'checked' : ''}`}
                          onClick={handleSelectAll}
                          title={isAllSelected ? 'Deselect all' : 'Select all'}
                        >
                          {isAllSelected ? <CheckSquare size={20} /> : <Square size={20} />}
                        </button>
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
                      return (
                        <tr key={visit.id} className={isSelected ? 'selected' : ''}>
                          <td>
                            <button
                              className={`checkbox-btn ${isSelected ? 'checked' : ''}`}
                              onClick={() => handleSelectOne(visit.id)}
                            >
                              {isSelected ? <CheckSquare size={20} /> : <Square size={20} />}
                            </button>
                          </td>
                          <td>
                            <div className="employee-cell">
                              <div className="employee-avatar">
                                {getInitials(visit.employeeName)}
                              </div>
                              <div className="employee-info">
                                <span className="employee-name">{visit.employeeName}</span>
                                <span className="employee-id">{visit.employeeId}</span>
                              </div>
                            </div>
                          </td>
                          <td>
                            <div className="doctor-cell">
                              <div className="doctor-icon">
                                <Stethoscope size={16} />
                              </div>
                              <span className="doctor-name">{visit.doctorName}</span>
                            </div>
                          </td>
                          <td>
                            <div className="date-cell">
                              <span className="date-value">
                                <Calendar size={14} color="#6b7280" />
                                {visit.date}
                              </span>
                              <span className="time-value">
                                <Clock size={12} />
                                {visit.time}
                              </span>
                            </div>
                          </td>
                          <td>
                            <span className="region-badge">
                              <span className="dot" />
                              {visit.region}
                            </span>
                          </td>
                          <td>
                            <div className="action-buttons">
                              <button
                                className="action-btn view"
                                onClick={() => handleViewDetails(visit)}
                              >
                                <Eye size={15} />
                                View
                              </button>
                              <button
                                className="action-btn approve"
                                onClick={() => handleApprove(visit)}
                              >
                                <CheckCircle size={15} />
                                Approve
                              </button>
                              <button
                                className="action-btn reject"
                                onClick={() => handleRejectClick(visit)}
                              >
                                <XCircle size={15} />
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
                  <CheckCircle size={40} />
                </div>
                <h3>All Caught Up!</h3>
                <p>There are no pending visits matching your filters.</p>
              </div>
            )}
          </div>

          {/* Bulk Actions Bar */}
          {selectedIds.length > 0 && (
            <div className="bulk-actions-bar">
              <span className="selected-count">
                <CheckSquare size={18} />
                <span className="count-badge">{selectedIds.length}</span>
                selected
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
              <button className="bulk-btn clear" onClick={() => setSelectedIds([])}>
                <X size={18} />
              </button>
            </div>
          )}
        </main>
      </div>

      {/* Visit Detail Modal */}
      <VisitApproval
        visit={selectedVisit}
        isOpen={showModal}
        onClose={handleCloseModal}
        onApprove={handleApprove}
        onReject={(visit, reason) => {
          console.log('❌ Rejected from modal:', visit.id, 'Reason:', reason);
          setVisits((prev) => prev.filter((v) => v.id !== visit.id));
          setSelectedIds((prev) => prev.filter((id) => id !== visit.id));
        }}
      />

      {/* Quick Reject Dialog */}
      {showQuickReject && (
        <div className="quick-reject-dialog">
          <div className="quick-reject-content">
            <h3>
              <div className="icon">
                <AlertTriangle size={20} />
              </div>
              {rejectTarget === 'bulk' ? `Reject ${selectedIds.length} Visits` : 'Reject Visit'}
            </h3>
            <p>Please provide a reason for rejecting this request. This will be sent to the employee.</p>
            <textarea
              placeholder="Enter rejection reason..."
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              autoFocus
            />
            <div className="quick-reject-actions">
              <button
                className="dialog-btn cancel"
                onClick={() => {
                  setShowQuickReject(false);
                  setRejectTarget(null);
                  setRejectReason('');
                }}
              >
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