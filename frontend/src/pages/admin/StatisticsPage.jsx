/**
 * StatisticsPage Component
 *
 * Dedicated statistics page for compliance monitoring (Task 2.1)
 * Separated from main dashboard to avoid clutter.
 *
 * Features:
 * - Tabbed interface with three sections
 * - Overview: High-level metrics and monthly trends
 * - Behind-Schedule: Employee compliance tracking table
 * - Alerts: Quota dumping and irregularity detection
 * - Notify Modal: Send alerts to non-compliant employees
 *
 * @requires complianceService - API calls for compliance data
 * @requires Recharts - For charts in Overview tab
 * @requires Lucide React - For icons
 */

import { useState, useEffect, useMemo } from 'react';
import {
  BarChart3,
  Users,
  AlertTriangle,
  Bell,
  TrendingUp,
  TrendingDown,
  Clock,
  CheckCircle,
  XCircle,
  Send,
  X,
  ChevronRight,
  Activity,
  Target,
  AlertCircle,
  Filter,
  Search,
  Calendar,
  RefreshCw,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  LineChart,
  Line,
} from 'recharts';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import LoadingSpinner from '../../components/common/LoadingSpinner';
// import complianceService from '../../services/complianceService';

/* =============================================================================
   MOCK DATA
   Simulates API responses from Task 2.1 backend endpoints.
   Replace with actual API calls once backend is ready.
   ============================================================================= */

// Mock: getOverviewStats response
const MOCK_OVERVIEW_STATS = {
  totalComplianceRate: 78.5,
  totalEmployees: 45,
  onTrackEmployees: 35,
  behindScheduleEmployees: 10,
  criticalAlerts: 3,
  totalVisitsThisMonth: 1247,
  targetVisitsThisMonth: 1580,
  weeklyTrend: [
    { week: 'Week 1', compliance: 82, target: 100 },
    { week: 'Week 2', compliance: 76, target: 100 },
    { week: 'Week 3', compliance: 79, target: 100 },
    { week: 'Week 4', compliance: 78, target: 100 },
  ],
  riskFactors: {
    highRisk: 3,
    mediumRisk: 5,
    lowRisk: 2,
  },
};

// Mock: getMonthlyComplianceReport response
const MOCK_MONTHLY_REPORT = {
  months: [
    { month: 'Jul', completionRate: 85, visits: 1420, target: 1600 },
    { month: 'Aug', completionRate: 82, visits: 1312, target: 1600 },
    { month: 'Sep', completionRate: 88, visits: 1408, target: 1600 },
    { month: 'Oct', completionRate: 79, visits: 1264, target: 1600 },
    { month: 'Nov', completionRate: 81, visits: 1296, target: 1600 },
    { month: 'Dec', completionRate: 78, visits: 1247, target: 1580 },
  ],
};

// Mock: getBehindScheduleEmployees response
const MOCK_BEHIND_SCHEDULE_EMPLOYEES = [
  {
    _id: '1',
    name: 'Juan Dela Cruz',
    email: 'juan@vippharmacy.com',
    region: 'Region VI - Western Visayas',
    weeklyTarget: 12,
    completedVisits: 5,
    percentage: 41.7,
    status: 'behind',
    lastVisitDate: '2024-12-27T10:30:00Z',
    missedDays: 3,
  },
  {
    _id: '2',
    name: 'Maria Santos',
    email: 'maria@vippharmacy.com',
    region: 'Region VI - Western Visayas',
    weeklyTarget: 10,
    completedVisits: 6,
    percentage: 60.0,
    status: 'behind',
    lastVisitDate: '2024-12-26T14:15:00Z',
    missedDays: 2,
  },
  {
    _id: '3',
    name: 'Pedro Reyes',
    email: 'pedro@vippharmacy.com',
    region: 'NCR - Metro Manila',
    weeklyTarget: 15,
    completedVisits: 11,
    percentage: 73.3,
    status: 'behind',
    lastVisitDate: '2024-12-28T09:00:00Z',
    missedDays: 1,
  },
  {
    _id: '4',
    name: 'Ana Garcia',
    email: 'ana@vippharmacy.com',
    region: 'Region VII - Central Visayas',
    weeklyTarget: 8,
    completedVisits: 3,
    percentage: 37.5,
    status: 'behind',
    lastVisitDate: '2024-12-25T11:45:00Z',
    missedDays: 4,
  },
  {
    _id: '5',
    name: 'Jose Mendoza',
    email: 'jose@vippharmacy.com',
    region: 'Region VI - Western Visayas',
    weeklyTarget: 10,
    completedVisits: 7,
    percentage: 70.0,
    status: 'behind',
    lastVisitDate: '2024-12-27T16:20:00Z',
    missedDays: 2,
  },
  {
    _id: '6',
    name: 'Elena Cruz',
    email: 'elena@vippharmacy.com',
    region: 'CAR - Cordillera',
    weeklyTarget: 6,
    completedVisits: 6,
    percentage: 100.0,
    status: 'on-track',
    lastVisitDate: '2024-12-28T10:00:00Z',
    missedDays: 0,
  },
  {
    _id: '7',
    name: 'Roberto Lim',
    email: 'roberto@vippharmacy.com',
    region: 'NCR - Metro Manila',
    weeklyTarget: 14,
    completedVisits: 12,
    percentage: 85.7,
    status: 'on-track',
    lastVisitDate: '2024-12-28T08:30:00Z',
    missedDays: 0,
  },
];

// Mock: getQuotaDumpingAlerts response
const MOCK_QUOTA_DUMPING_ALERTS = [
  {
    _id: 'alert-1',
    employeeId: '1',
    employeeName: 'Juan Dela Cruz',
    email: 'juan@vippharmacy.com',
    alertType: 'quota_dumping',
    severity: 'high',
    description: '5 visits logged within 2 hours on Dec 27',
    visitCount: 5,
    timeSpan: '2 hours',
    detectedAt: '2024-12-27T12:30:00Z',
    visits: [
      { doctor: 'Dr. Smith', time: '10:30 AM' },
      { doctor: 'Dr. Johnson', time: '10:45 AM' },
      { doctor: 'Dr. Williams', time: '11:15 AM' },
      { doctor: 'Dr. Brown', time: '11:45 AM' },
      { doctor: 'Dr. Davis', time: '12:20 PM' },
    ],
    status: 'pending_review',
  },
  {
    _id: 'alert-2',
    employeeId: '3',
    employeeName: 'Pedro Reyes',
    email: 'pedro@vippharmacy.com',
    alertType: 'quota_dumping',
    severity: 'medium',
    description: '4 visits logged within 3 hours on Dec 26',
    visitCount: 4,
    timeSpan: '3 hours',
    detectedAt: '2024-12-26T15:00:00Z',
    visits: [
      { doctor: 'Dr. Garcia', time: '09:00 AM' },
      { doctor: 'Dr. Martinez', time: '10:00 AM' },
      { doctor: 'Dr. Rodriguez', time: '11:30 AM' },
      { doctor: 'Dr. Lopez', time: '12:00 PM' },
    ],
    status: 'pending_review',
  },
  {
    _id: 'alert-3',
    employeeId: '4',
    employeeName: 'Ana Garcia',
    email: 'ana@vippharmacy.com',
    alertType: 'unusual_pattern',
    severity: 'low',
    description: 'All visits logged at end of week (Friday)',
    visitCount: 3,
    timeSpan: '1 day',
    detectedAt: '2024-12-27T18:00:00Z',
    visits: [
      { doctor: 'Dr. Santos', time: '02:00 PM' },
      { doctor: 'Dr. Reyes', time: '03:30 PM' },
      { doctor: 'Dr. Cruz', time: '05:00 PM' },
    ],
    status: 'reviewed',
  },
];

/* =============================================================================
   STYLES
   Inline CSS following project conventions.
   Color scheme aligned with reference design (green primary accent).
   ============================================================================= */

const statisticsPageStyles = `
  /* Layout */
  .statistics-layout {
    min-height: 100vh;
    background: #f3f4f6;
  }

  .statistics-content {
    display: flex;
  }

  .statistics-main {
    flex: 1;
    padding: 24px;
    max-width: 1400px;
  }

  /* Page Header */
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
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .page-header-icon {
    width: 36px;
    height: 36px;
    background: linear-gradient(135deg, #22c55e, #16a34a);
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
  }

  .refresh-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 16px;
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    font-size: 14px;
    color: #374151;
    cursor: pointer;
    transition: all 0.2s;
  }

  .refresh-btn:hover {
    background: #f9fafb;
    border-color: #d1d5db;
  }

  .refresh-btn.loading {
    opacity: 0.7;
    cursor: not-allowed;
  }

  .refresh-btn.loading svg {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  /* Tabs */
  .tabs-container {
    background: white;
    border-radius: 12px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    overflow: hidden;
  }

  .tabs-header {
    display: flex;
    border-bottom: 1px solid #e5e7eb;
    background: #fafafa;
  }

  .tab-btn {
    flex: 1;
    padding: 16px 24px;
    background: transparent;
    border: none;
    font-size: 14px;
    font-weight: 500;
    color: #6b7280;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    transition: all 0.2s;
    position: relative;
  }

  .tab-btn:hover {
    color: #374151;
    background: #f3f4f6;
  }

  .tab-btn.active {
    color: #16a34a;
    background: white;
  }

  .tab-btn.active::after {
    content: '';
    position: absolute;
    bottom: -1px;
    left: 0;
    right: 0;
    height: 3px;
    background: linear-gradient(90deg, #22c55e, #16a34a);
    border-radius: 3px 3px 0 0;
  }

  .tab-badge {
    background: #fee2e2;
    color: #dc2626;
    font-size: 11px;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 10px;
    min-width: 20px;
    text-align: center;
  }

  .tab-badge.warning {
    background: #fef3c7;
    color: #d97706;
  }

  .tabs-content {
    padding: 24px;
  }

  /* Overview Tab Styles */
  .overview-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 20px;
    margin-bottom: 24px;
  }

  @media (max-width: 1200px) {
    .overview-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  @media (max-width: 768px) {
    .overview-grid {
      grid-template-columns: 1fr;
    }
  }

  .stat-card {
    background: white;
    border-radius: 12px;
    padding: 20px;
    border: 1px solid #e5e7eb;
    transition: all 0.2s;
  }

  .stat-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  }

  .stat-card-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 12px;
  }

  .stat-card-icon {
    width: 44px;
    height: 44px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .stat-card-icon.green {
    background: #dcfce7;
    color: #16a34a;
  }

  .stat-card-icon.red {
    background: #fee2e2;
    color: #dc2626;
  }

  .stat-card-icon.yellow {
    background: #fef3c7;
    color: #d97706;
  }

  .stat-card-icon.blue {
    background: #dbeafe;
    color: #2563eb;
  }

  .stat-card-trend {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    font-weight: 500;
    padding: 4px 8px;
    border-radius: 6px;
  }

  .stat-card-trend.up {
    background: #dcfce7;
    color: #16a34a;
  }

  .stat-card-trend.down {
    background: #fee2e2;
    color: #dc2626;
  }

  .stat-card-value {
    font-size: 32px;
    font-weight: 700;
    color: #1f2937;
    line-height: 1.2;
  }

  .stat-card-label {
    font-size: 14px;
    color: #6b7280;
    margin-top: 4px;
  }

  .stat-card-sublabel {
    font-size: 12px;
    color: #9ca3af;
    margin-top: 2px;
  }

  /* Charts Section */
  .charts-grid {
    display: grid;
    grid-template-columns: 2fr 1fr;
    gap: 20px;
    margin-bottom: 24px;
  }

  @media (max-width: 1024px) {
    .charts-grid {
      grid-template-columns: 1fr;
    }
  }

  .chart-card {
    background: white;
    border-radius: 12px;
    padding: 20px;
    border: 1px solid #e5e7eb;
  }

  .chart-card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
  }

  .chart-card-title {
    font-size: 16px;
    font-weight: 600;
    color: #1f2937;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .chart-legend {
    display: flex;
    gap: 16px;
    font-size: 12px;
  }

  .chart-legend-item {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .chart-legend-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
  }

  /* Risk Factors Card */
  .risk-factors-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .risk-factor-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px;
    background: #f9fafb;
    border-radius: 8px;
  }

  .risk-factor-label {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .risk-factor-dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
  }

  .risk-factor-dot.high { background: #dc2626; }
  .risk-factor-dot.medium { background: #f59e0b; }
  .risk-factor-dot.low { background: #22c55e; }

  .risk-factor-count {
    font-size: 18px;
    font-weight: 600;
    color: #1f2937;
  }

  /* Behind Schedule Tab Styles */
  .table-controls {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
    flex-wrap: wrap;
    gap: 12px;
  }

  .search-box {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 14px;
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    min-width: 280px;
  }

  .search-box input {
    border: none;
    background: transparent;
    outline: none;
    font-size: 14px;
    width: 100%;
    color: #374151;
  }

  .search-box input::placeholder {
    color: #9ca3af;
  }

  .filter-group {
    display: flex;
    gap: 10px;
    align-items: center;
  }

  .filter-select {
    padding: 10px 14px;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    font-size: 14px;
    color: #374151;
    background: white;
    cursor: pointer;
    min-width: 150px;
  }

  .filter-select:focus {
    outline: none;
    border-color: #22c55e;
    box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.1);
  }

  /* Data Table */
  .data-table-container {
    overflow-x: auto;
  }

  .data-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 14px;
  }

  .data-table th {
    text-align: left;
    padding: 14px 16px;
    background: #f9fafb;
    font-weight: 600;
    color: #374151;
    border-bottom: 1px solid #e5e7eb;
    white-space: nowrap;
  }

  .data-table td {
    padding: 14px 16px;
    border-bottom: 1px solid #f3f4f6;
    color: #374151;
  }

  .data-table tbody tr {
    transition: background 0.15s;
  }

  .data-table tbody tr:hover {
    background: #f9fafb;
  }

  .employee-cell {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .employee-name {
    font-weight: 500;
    color: #1f2937;
  }

  .employee-email {
    font-size: 12px;
    color: #9ca3af;
  }

  .progress-cell {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 120px;
  }

  .progress-bar-bg {
    height: 8px;
    background: #e5e7eb;
    border-radius: 4px;
    overflow: hidden;
  }

  .progress-bar-fill {
    height: 100%;
    border-radius: 4px;
    transition: width 0.3s ease;
  }

  .progress-bar-fill.green { background: linear-gradient(90deg, #22c55e, #16a34a); }
  .progress-bar-fill.yellow { background: linear-gradient(90deg, #f59e0b, #d97706); }
  .progress-bar-fill.red { background: linear-gradient(90deg, #ef4444, #dc2626); }

  .progress-text {
    font-size: 12px;
    color: #6b7280;
  }

  /* Status Badge */
  .status-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border-radius: 20px;
    font-size: 12px;
    font-weight: 500;
  }

  .status-badge.on-track {
    background: #dcfce7;
    color: #16a34a;
  }

  .status-badge.behind {
    background: #fee2e2;
    color: #dc2626;
  }

  .status-badge.critical {
    background: #fef3c7;
    color: #d97706;
  }

  /* Action Buttons */
  .btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 14px;
    border: none;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-primary {
    background: linear-gradient(135deg, #22c55e, #16a34a);
    color: white;
  }

  .btn-primary:hover {
    background: linear-gradient(135deg, #16a34a, #15803d);
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(34, 197, 94, 0.3);
  }

  .btn-secondary {
    background: #f3f4f6;
    color: #374151;
    border: 1px solid #e5e7eb;
  }

  .btn-secondary:hover {
    background: #e5e7eb;
  }

  .btn-danger {
    background: #fee2e2;
    color: #dc2626;
  }

  .btn-danger:hover {
    background: #fecaca;
  }

  .btn-sm {
    padding: 6px 10px;
    font-size: 12px;
  }

  /* Alerts Tab Styles */
  .alerts-list {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .alert-card {
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 12px;
    padding: 20px;
    transition: all 0.2s;
  }

  .alert-card:hover {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  }

  .alert-card.high {
    border-left: 4px solid #dc2626;
  }

  .alert-card.medium {
    border-left: 4px solid #f59e0b;
  }

  .alert-card.low {
    border-left: 4px solid #22c55e;
  }

  .alert-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 12px;
  }

  .alert-title {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .alert-title h4 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    color: #1f2937;
  }

  .severity-badge {
    padding: 4px 10px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
  }

  .severity-badge.high {
    background: #fee2e2;
    color: #dc2626;
  }

  .severity-badge.medium {
    background: #fef3c7;
    color: #d97706;
  }

  .severity-badge.low {
    background: #dcfce7;
    color: #16a34a;
  }

  .alert-timestamp {
    font-size: 12px;
    color: #9ca3af;
  }

  .alert-description {
    color: #4b5563;
    font-size: 14px;
    margin-bottom: 16px;
  }

  .alert-visits {
    background: #f9fafb;
    border-radius: 8px;
    padding: 12px;
    margin-bottom: 16px;
  }

  .alert-visits-title {
    font-size: 12px;
    font-weight: 600;
    color: #6b7280;
    margin-bottom: 8px;
  }

  .alert-visits-list {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .alert-visit-tag {
    background: white;
    border: 1px solid #e5e7eb;
    padding: 4px 10px;
    border-radius: 6px;
    font-size: 12px;
    color: #374151;
  }

  .alert-actions {
    display: flex;
    gap: 10px;
  }

  /* Modal Styles */
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
    animation: fadeIn 0.2s ease;
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .modal-content {
    background: white;
    border-radius: 16px;
    width: 90%;
    max-width: 500px;
    max-height: 90vh;
    overflow-y: auto;
    animation: slideUp 0.3s ease;
  }

  @keyframes slideUp {
    from { transform: translateY(20px); opacity: 0; }
    to { transform: translateY(0); opacity: 1; }
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 20px 24px;
    border-bottom: 1px solid #e5e7eb;
  }

  .modal-header h3 {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
    color: #1f2937;
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .modal-close {
    background: #f3f4f6;
    border: none;
    width: 32px;
    height: 32px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    color: #6b7280;
    transition: all 0.2s;
  }

  .modal-close:hover {
    background: #e5e7eb;
    color: #1f2937;
  }

  .modal-body {
    padding: 24px;
  }

  .notify-recipient {
    background: #f0fdf4;
    border: 1px solid #bbf7d0;
    border-radius: 10px;
    padding: 16px;
    margin-bottom: 20px;
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .notify-recipient-icon {
    width: 40px;
    height: 40px;
    background: #22c55e;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-size: 18px;
    font-weight: 600;
  }

  .notify-recipient-info {
    flex: 1;
  }

  .notify-recipient-name {
    font-weight: 600;
    color: #1f2937;
    font-size: 15px;
  }

  .notify-recipient-email {
    font-size: 13px;
    color: #6b7280;
  }

  .notify-channels {
    display: flex;
    gap: 10px;
    margin-bottom: 20px;
  }

  .channel-badge {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 12px;
    background: #f3f4f6;
    border-radius: 8px;
    font-size: 13px;
    color: #374151;
  }

  .channel-badge svg {
    color: #22c55e;
  }

  .form-group {
    margin-bottom: 16px;
  }

  .form-group label {
    display: block;
    font-size: 14px;
    font-weight: 500;
    color: #374151;
    margin-bottom: 8px;
  }

  .form-group textarea {
    width: 100%;
    padding: 12px;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    font-size: 14px;
    font-family: inherit;
    resize: vertical;
    min-height: 120px;
    transition: border-color 0.2s, box-shadow 0.2s;
  }

  .form-group textarea:focus {
    outline: none;
    border-color: #22c55e;
    box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.1);
  }

  .form-group textarea::placeholder {
    color: #9ca3af;
  }

  .char-count {
    text-align: right;
    font-size: 12px;
    color: #9ca3af;
    margin-top: 4px;
  }

  .modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    padding: 16px 24px;
    border-top: 1px solid #e5e7eb;
    background: #f9fafb;
    border-radius: 0 0 16px 16px;
  }

  /* Empty State */
  .empty-state {
    text-align: center;
    padding: 48px 24px;
    color: #6b7280;
  }

  .empty-state-icon {
    width: 64px;
    height: 64px;
    background: #f3f4f6;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 auto 16px;
    color: #9ca3af;
  }

  .empty-state h3 {
    margin: 0 0 8px;
    color: #374151;
    font-size: 18px;
  }

  .empty-state p {
    margin: 0;
    font-size: 14px;
  }

  /* Error Banner */
  .error-banner {
    background: #fee2e2;
    color: #dc2626;
    padding: 16px;
    border-radius: 8px;
    margin-bottom: 24px;
    display: flex;
    align-items: center;
    gap: 10px;
  }

  /* Toast Success */
  .toast-success {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 16px;
    background: #dcfce7;
    border: 1px solid #bbf7d0;
    border-radius: 8px;
    color: #16a34a;
    font-size: 14px;
    margin-bottom: 16px;
    animation: slideIn 0.3s ease;
  }

  @keyframes slideIn {
    from { transform: translateX(-20px); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }
`;

/* =============================================================================
   CHART COLORS
   Consistent color scheme for Recharts components.
   ============================================================================= */

const CHART_COLORS = {
  primary: '#22c55e',
  primaryLight: '#86efac',
  secondary: '#3b82f6',
  warning: '#f59e0b',
  danger: '#ef4444',
  gray: '#9ca3af',
};

const PIE_COLORS = ['#22c55e', '#f59e0b', '#ef4444'];

/* =============================================================================
   COMPONENT: StatisticsPage
   Main parent component with tabbed interface.
   ============================================================================= */

const StatisticsPage = () => {
  // State: Active tab
  const [activeTab, setActiveTab] = useState('overview');

  // State: Data from API (using mock for now)
  const [overviewStats, setOverviewStats] = useState(MOCK_OVERVIEW_STATS);
  const [monthlyReport, setMonthlyReport] = useState(MOCK_MONTHLY_REPORT);
  const [behindScheduleEmployees, setBehindScheduleEmployees] = useState(MOCK_BEHIND_SCHEDULE_EMPLOYEES);
  const [quotaDumpingAlerts, setQuotaDumpingAlerts] = useState(MOCK_QUOTA_DUMPING_ALERTS);

  // State: Loading and error
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // State: Filters for Behind-Schedule tab
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [regionFilter, setRegionFilter] = useState('all');

  // State: Notify Modal
  const [showNotifyModal, setShowNotifyModal] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [notifyMessage, setNotifyMessage] = useState('');
  const [notifySending, setNotifySending] = useState(false);
  const [notifySuccess, setNotifySuccess] = useState(false);

  /* ---------------------------------------------------------------------------
     Data Fetching
     Replace mock data with actual API calls once backend is ready.
     --------------------------------------------------------------------------- */

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        // TODO: Replace with actual API calls
        // const [statsRes, monthlyRes, employeesRes, alertsRes] = await Promise.all([
        //   complianceService.getOverviewStats(),
        //   complianceService.getMonthlyComplianceReport(),
        //   complianceService.getBehindScheduleEmployees(),
        //   complianceService.getQuotaDumpingAlerts(),
        // ]);
        // setOverviewStats(statsRes.data);
        // setMonthlyReport(monthlyRes.data);
        // setBehindScheduleEmployees(employeesRes.data);
        // setQuotaDumpingAlerts(alertsRes.data);

        // Simulate API delay
        await new Promise((resolve) => setTimeout(resolve, 500));

      } catch {
        setError('Failed to load compliance data. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  /* ---------------------------------------------------------------------------
     Filtered Employees
     Memoized filtering for performance.
     --------------------------------------------------------------------------- */

  const filteredEmployees = useMemo(() => {
    return behindScheduleEmployees.filter((employee) => {
      // Search filter
      const matchesSearch =
        searchQuery === '' ||
        employee.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        employee.email.toLowerCase().includes(searchQuery.toLowerCase());

      // Status filter
      const matchesStatus =
        statusFilter === 'all' ||
        employee.status === statusFilter;

      // Region filter
      const matchesRegion =
        regionFilter === 'all' ||
        employee.region.includes(regionFilter);

      return matchesSearch && matchesStatus && matchesRegion;
    });
  }, [behindScheduleEmployees, searchQuery, statusFilter, regionFilter]);

  /* ---------------------------------------------------------------------------
     Handlers
     --------------------------------------------------------------------------- */

  const handleRefresh = async () => {
    setLoading(true);
    // Simulate refresh
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setLoading(false);
  };

  const handleNotifyClick = (employee) => {
    setSelectedEmployee(employee);
    setNotifyMessage('');
    setNotifySuccess(false);
    setShowNotifyModal(true);
  };

  const handleCloseModal = () => {
    setShowNotifyModal(false);
    setSelectedEmployee(null);
    setNotifyMessage('');
    setNotifySuccess(false);
  };

  const handleSendNotification = async () => {
    if (!selectedEmployee) return;

    setNotifySending(true);

    try {
      // TODO: Replace with actual API call
      // await complianceService.sendNotification(selectedEmployee._id, {
      //   message: notifyMessage,
      //   channels: ['email', 'inbox'],
      // });

      // Simulate API call
      console.log('=== SEND NOTIFICATION ===');
      console.log('Employee:', selectedEmployee.name);
      console.log('Email:', selectedEmployee.email);
      console.log('Message:', notifyMessage || '(Default compliance alert message)');
      console.log('Channels: Email, Dashboard Inbox');
      console.log('========================');

      await new Promise((resolve) => setTimeout(resolve, 1500));

      setNotifySuccess(true);

      // Auto-close after success
      setTimeout(() => {
        handleCloseModal();
      }, 2000);

    } catch {
      console.error('Failed to send notification');
    } finally {
      setNotifySending(false);
    }
  };

  /* ---------------------------------------------------------------------------
     Tab Count Badges
     --------------------------------------------------------------------------- */

  const behindCount = behindScheduleEmployees.filter((e) => e.status === 'behind').length;
  const alertsCount = quotaDumpingAlerts.filter((a) => a.status === 'pending_review').length;

  /* ---------------------------------------------------------------------------
     Render: Loading State
     --------------------------------------------------------------------------- */

  if (loading && !overviewStats) {
    return <LoadingSpinner fullScreen />;
  }

  /* ---------------------------------------------------------------------------
     Render: Main Component
     --------------------------------------------------------------------------- */

  return (
    <div className="statistics-layout">
      <style>{statisticsPageStyles}</style>
      <Navbar />
      <div className="statistics-content">
        <Sidebar />
        <main className="statistics-main">
          {/* Page Header */}
          <div className="page-header">
            <h1>
              <div className="page-header-icon">
                <BarChart3 size={20} />
              </div>
              Compliance Statistics
            </h1>
            <button
              className={`refresh-btn ${loading ? 'loading' : ''}`}
              onClick={handleRefresh}
              disabled={loading}
            >
              <RefreshCw size={16} />
              {loading ? 'Refreshing...' : 'Refresh Data'}
            </button>
          </div>

          {/* Error Banner */}
          {error && (
            <div className="error-banner">
              <AlertCircle size={20} />
              {error}
            </div>
          )}

          {/* Tabs Container */}
          <div className="tabs-container">
            {/* Tab Headers */}
            <div className="tabs-header">
              <button
                className={`tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
                onClick={() => setActiveTab('overview')}
              >
                <TrendingUp size={18} />
                Overview
              </button>
              <button
                className={`tab-btn ${activeTab === 'behind-schedule' ? 'active' : ''}`}
                onClick={() => setActiveTab('behind-schedule')}
              >
                <Users size={18} />
                Behind-Schedule Employees
                {behindCount > 0 && <span className="tab-badge">{behindCount}</span>}
              </button>
              <button
                className={`tab-btn ${activeTab === 'alerts' ? 'active' : ''}`}
                onClick={() => setActiveTab('alerts')}
              >
                <AlertTriangle size={18} />
                Alerts & Quota Dumping
                {alertsCount > 0 && <span className="tab-badge warning">{alertsCount}</span>}
              </button>
            </div>

            {/* Tab Content */}
            <div className="tabs-content">
              {/* Overview Tab */}
              {activeTab === 'overview' && (
                <OverviewTab
                  stats={overviewStats}
                  monthlyReport={monthlyReport}
                />
              )}

              {/* Behind-Schedule Tab */}
              {activeTab === 'behind-schedule' && (
                <BehindScheduleTab
                  employees={filteredEmployees}
                  searchQuery={searchQuery}
                  setSearchQuery={setSearchQuery}
                  statusFilter={statusFilter}
                  setStatusFilter={setStatusFilter}
                  regionFilter={regionFilter}
                  setRegionFilter={setRegionFilter}
                  onNotify={handleNotifyClick}
                />
              )}

              {/* Alerts Tab */}
              {activeTab === 'alerts' && (
                <AlertsTab
                  alerts={quotaDumpingAlerts}
                  onNotify={handleNotifyClick}
                />
              )}
            </div>
          </div>
        </main>
      </div>

      {/* Notify Modal */}
      {showNotifyModal && selectedEmployee && (
        <NotifyModal
          employee={selectedEmployee}
          message={notifyMessage}
          setMessage={setNotifyMessage}
          sending={notifySending}
          success={notifySuccess}
          onClose={handleCloseModal}
          onSend={handleSendNotification}
        />
      )}
    </div>
  );
};

/* =============================================================================
   COMPONENT: OverviewTab
   High-level metrics, trends, and monthly completion chart.
   ============================================================================= */

const OverviewTab = ({ stats, monthlyReport }) => {
  // Prepare pie chart data for risk factors
  const riskPieData = [
    { name: 'Low Risk', value: stats.riskFactors.lowRisk, color: CHART_COLORS.primary },
    { name: 'Medium Risk', value: stats.riskFactors.mediumRisk, color: CHART_COLORS.warning },
    { name: 'High Risk', value: stats.riskFactors.highRisk, color: CHART_COLORS.danger },
  ];

  return (
    <div>
      {/* Stats Grid */}
      <div className="overview-grid">
        {/* Total Compliance Rate */}
        <div className="stat-card">
          <div className="stat-card-header">
            <div className="stat-card-icon green">
              <Target size={22} />
            </div>
            <div className={`stat-card-trend ${stats.totalComplianceRate >= 80 ? 'up' : 'down'}`}>
              {stats.totalComplianceRate >= 80 ? (
                <TrendingUp size={14} />
              ) : (
                <TrendingDown size={14} />
              )}
              {stats.totalComplianceRate >= 80 ? '+2.3%' : '-1.5%'}
            </div>
          </div>
          <div className="stat-card-value">{stats.totalComplianceRate}%</div>
          <div className="stat-card-label">Total Compliance Rate</div>
          <div className="stat-card-sublabel">Target: 80%</div>
        </div>

        {/* On Track Employees */}
        <div className="stat-card">
          <div className="stat-card-header">
            <div className="stat-card-icon green">
              <CheckCircle size={22} />
            </div>
          </div>
          <div className="stat-card-value">{stats.onTrackEmployees}</div>
          <div className="stat-card-label">On Track</div>
          <div className="stat-card-sublabel">of {stats.totalEmployees} employees</div>
        </div>

        {/* Behind Schedule */}
        <div className="stat-card">
          <div className="stat-card-header">
            <div className="stat-card-icon red">
              <Clock size={22} />
            </div>
          </div>
          <div className="stat-card-value">{stats.behindScheduleEmployees}</div>
          <div className="stat-card-label">Behind Schedule</div>
          <div className="stat-card-sublabel">Requires attention</div>
        </div>

        {/* Critical Alerts */}
        <div className="stat-card">
          <div className="stat-card-header">
            <div className="stat-card-icon yellow">
              <AlertTriangle size={22} />
            </div>
          </div>
          <div className="stat-card-value">{stats.criticalAlerts}</div>
          <div className="stat-card-label">Critical Alerts</div>
          <div className="stat-card-sublabel">Pending review</div>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="charts-grid">
        {/* Monthly Compliance Chart */}
        <div className="chart-card">
          <div className="chart-card-header">
            <div className="chart-card-title">
              <Activity size={18} />
              Monthly Completion Rates
            </div>
            <div className="chart-legend">
              <div className="chart-legend-item">
                <div className="chart-legend-dot" style={{ background: CHART_COLORS.primary }} />
                <span>Actual</span>
              </div>
              <div className="chart-legend-item">
                <div className="chart-legend-dot" style={{ background: CHART_COLORS.gray }} />
                <span>Target</span>
              </div>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={monthlyReport.months} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month" axisLine={false} tickLine={false} />
              <YAxis axisLine={false} tickLine={false} domain={[0, 100]} unit="%" />
              <Tooltip
                contentStyle={{
                  background: 'white',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                }}
                formatter={(value) => [`${value}%`, 'Completion Rate']}
              />
              <Bar
                dataKey="completionRate"
                fill={CHART_COLORS.primary}
                radius={[4, 4, 0, 0]}
                maxBarSize={50}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Risk Factors Card */}
        <div className="chart-card">
          <div className="chart-card-header">
            <div className="chart-card-title">
              <AlertCircle size={18} />
              Risk Factors
            </div>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie
                data={riskPieData}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={70}
                paddingAngle={4}
                dataKey="value"
              >
                {riskPieData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={PIE_COLORS[index]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
          <div className="risk-factors-list">
            <div className="risk-factor-item">
              <div className="risk-factor-label">
                <div className="risk-factor-dot high" />
                <span>High Risk</span>
              </div>
              <span className="risk-factor-count">{stats.riskFactors.highRisk}</span>
            </div>
            <div className="risk-factor-item">
              <div className="risk-factor-label">
                <div className="risk-factor-dot medium" />
                <span>Medium Risk</span>
              </div>
              <span className="risk-factor-count">{stats.riskFactors.mediumRisk}</span>
            </div>
            <div className="risk-factor-item">
              <div className="risk-factor-label">
                <div className="risk-factor-dot low" />
                <span>Low Risk</span>
              </div>
              <span className="risk-factor-count">{stats.riskFactors.lowRisk}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Weekly Trend Chart */}
      <div className="chart-card">
        <div className="chart-card-header">
          <div className="chart-card-title">
            <TrendingUp size={18} />
            Weekly Compliance Trend
          </div>
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={stats.weeklyTrend}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="week" axisLine={false} tickLine={false} />
            <YAxis axisLine={false} tickLine={false} domain={[0, 100]} unit="%" />
            <Tooltip
              contentStyle={{
                background: 'white',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
              }}
            />
            <Line
              type="monotone"
              dataKey="compliance"
              stroke={CHART_COLORS.primary}
              strokeWidth={3}
              dot={{ fill: CHART_COLORS.primary, strokeWidth: 2, r: 5 }}
              activeDot={{ r: 7 }}
            />
            <Line
              type="monotone"
              dataKey="target"
              stroke={CHART_COLORS.gray}
              strokeWidth={2}
              strokeDasharray="5 5"
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

/* =============================================================================
   COMPONENT: BehindScheduleTab
   Data table with employee compliance tracking.
   ============================================================================= */

const BehindScheduleTab = ({
  employees,
  searchQuery,
  setSearchQuery,
  statusFilter,
  setStatusFilter,
  regionFilter,
  setRegionFilter,
  onNotify,
}) => {
  // Get unique regions for filter dropdown
  const uniqueRegions = [...new Set(employees.map((e) => e.region.split(' - ')[0]))];

  // Get progress bar color based on percentage
  const getProgressColor = (percentage) => {
    if (percentage >= 80) return 'green';
    if (percentage >= 60) return 'yellow';
    return 'red';
  };

  // Format date
  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div>
      {/* Table Controls */}
      <div className="table-controls">
        <div className="search-box">
          <Search size={18} color="#9ca3af" />
          <input
            type="text"
            placeholder="Search by name or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="filter-group">
          <select
            className="filter-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All Status</option>
            <option value="behind">Behind Schedule</option>
            <option value="on-track">On Track</option>
          </select>
          <select
            className="filter-select"
            value={regionFilter}
            onChange={(e) => setRegionFilter(e.target.value)}
          >
            <option value="all">All Regions</option>
            {uniqueRegions.map((region) => (
              <option key={region} value={region}>
                {region}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Data Table */}
      {employees.length > 0 ? (
        <div className="data-table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Region</th>
                <th>Weekly Target</th>
                <th>Completed</th>
                <th>Progress</th>
                <th>Status</th>
                <th>Last Visit</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((employee) => (
                <tr key={employee._id}>
                  {/* Employee Name & Email */}
                  <td>
                    <div className="employee-cell">
                      <span className="employee-name">{employee.name}</span>
                      <span className="employee-email">{employee.email}</span>
                    </div>
                  </td>

                  {/* Region */}
                  <td>{employee.region}</td>

                  {/* Weekly Target */}
                  <td style={{ fontWeight: 500 }}>{employee.weeklyTarget}</td>

                  {/* Completed Visits */}
                  <td style={{ fontWeight: 500 }}>{employee.completedVisits}</td>

                  {/* Progress Bar */}
                  <td>
                    <div className="progress-cell">
                      <div className="progress-bar-bg">
                        <div
                          className={`progress-bar-fill ${getProgressColor(employee.percentage)}`}
                          style={{ width: `${Math.min(employee.percentage, 100)}%` }}
                        />
                      </div>
                      <span className="progress-text">
                        {employee.percentage.toFixed(1)}%
                      </span>
                    </div>
                  </td>

                  {/* Status Badge */}
                  <td>
                    <span className={`status-badge ${employee.status}`}>
                      {employee.status === 'on-track' ? (
                        <>
                          <CheckCircle size={14} />
                          On Track
                        </>
                      ) : (
                        <>
                          <XCircle size={14} />
                          Behind
                        </>
                      )}
                    </span>
                  </td>

                  {/* Last Visit */}
                  <td style={{ fontSize: '13px', color: '#6b7280' }}>
                    {formatDate(employee.lastVisitDate)}
                  </td>

                  {/* Action Button */}
                  <td>
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => onNotify(employee)}
                    >
                      <Bell size={14} />
                      Notify
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty-state">
          <div className="empty-state-icon">
            <Users size={28} />
          </div>
          <h3>No Employees Found</h3>
          <p>No employees match your current filters.</p>
        </div>
      )}
    </div>
  );
};

/* =============================================================================
   COMPONENT: AlertsTab
   Quota dumping and irregularity detection.
   ============================================================================= */

const AlertsTab = ({ alerts, onNotify }) => {
  // Get employee object from alert for notify modal
  const getEmployeeFromAlert = (alert) => ({
    _id: alert.employeeId,
    name: alert.employeeName,
    email: alert.email,
  });

  // Format timestamp
  const formatTimestamp = (dateString) => {
    return new Date(dateString).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (alerts.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">
          <CheckCircle size={28} />
        </div>
        <h3>No Alerts</h3>
        <p>Great! No suspicious patterns detected.</p>
      </div>
    );
  }

  return (
    <div className="alerts-list">
      {alerts.map((alert) => (
        <div key={alert._id} className={`alert-card ${alert.severity}`}>
          <div className="alert-header">
            <div className="alert-title">
              <AlertTriangle
                size={20}
                color={
                  alert.severity === 'high'
                    ? '#dc2626'
                    : alert.severity === 'medium'
                    ? '#f59e0b'
                    : '#22c55e'
                }
              />
              <h4>{alert.employeeName}</h4>
              <span className={`severity-badge ${alert.severity}`}>
                {alert.severity}
              </span>
              {alert.status === 'pending_review' && (
                <span className="status-badge critical">Pending Review</span>
              )}
            </div>
            <span className="alert-timestamp">
              <Calendar size={14} style={{ marginRight: '4px' }} />
              {formatTimestamp(alert.detectedAt)}
            </span>
          </div>

          <p className="alert-description">{alert.description}</p>

          {/* Visit Details */}
          <div className="alert-visits">
            <div className="alert-visits-title">
              Visits ({alert.visitCount} in {alert.timeSpan})
            </div>
            <div className="alert-visits-list">
              {alert.visits.map((visit, idx) => (
                <span key={idx} className="alert-visit-tag">
                  {visit.doctor} @ {visit.time}
                </span>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="alert-actions">
            <button
              className="btn btn-primary"
              onClick={() => onNotify(getEmployeeFromAlert(alert))}
            >
              <Bell size={14} />
              Send Alert
            </button>
            <button className="btn btn-secondary">
              <ChevronRight size={14} />
              View Details
            </button>
            {alert.status === 'pending_review' && (
              <button className="btn btn-danger">
                Mark Reviewed
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

/* =============================================================================
   COMPONENT: NotifyModal
   Modal for sending compliance alerts to employees.
   ============================================================================= */

const NotifyModal = ({
  employee,
  message,
  setMessage,
  sending,
  success,
  onClose,
  onSend,
}) => {
  // Character limit for message
  const MAX_CHARS = 500;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <h3>
            <Bell size={20} color="#22c55e" />
            Send Compliance Alert
          </h3>
          <button className="modal-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="modal-body">
          {/* Success Message */}
          {success && (
            <div className="toast-success">
              <CheckCircle size={18} />
              Alert sent successfully to {employee.name}!
            </div>
          )}

          {/* Recipient Info */}
          <div className="notify-recipient">
            <div className="notify-recipient-icon">
              {employee.name.charAt(0).toUpperCase()}
            </div>
            <div className="notify-recipient-info">
              <div className="notify-recipient-name">{employee.name}</div>
              <div className="notify-recipient-email">{employee.email}</div>
            </div>
          </div>

          {/* Notification Channels */}
          <div className="notify-channels">
            <div className="channel-badge">
              <CheckCircle size={14} />
              Email
            </div>
            <div className="channel-badge">
              <CheckCircle size={14} />
              Dashboard Inbox
            </div>
          </div>

          {/* Message Input */}
          <div className="form-group">
            <label htmlFor="notify-message">
              Custom Message (optional)
            </label>
            <textarea
              id="notify-message"
              placeholder="Add a personalized message to the compliance alert..."
              value={message}
              onChange={(e) => setMessage(e.target.value.slice(0, MAX_CHARS))}
              disabled={sending || success}
            />
            <div className="char-count">
              {message.length}/{MAX_CHARS} characters
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="modal-footer">
          <button
            className="btn btn-secondary"
            onClick={onClose}
            disabled={sending}
          >
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={onSend}
            disabled={sending || success}
          >
            {sending ? (
              <>
                <RefreshCw size={14} className="spinning" />
                Sending...
              </>
            ) : (
              <>
                <Send size={14} />
                Send Alert
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default StatisticsPage;