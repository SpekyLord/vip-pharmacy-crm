/**
 * ReportsPage - Task 2.12
 *
 * Comprehensive reports dashboard with multiple report types.
 *
 * Report Types:
 * - Weekly Compliance Report
 * - Monthly Visit Summary
 * - Employee Performance Report
 * - Regional Comparison Report
 * - Product Presentation Report
 *
 * Features:
 * - Report type cards with descriptions
 * - Quick generate with filters
 * - Recent reports list
 * - Scheduled reports management
 * - Export to PDF/CSV/Excel
 *
 * Route: /admin/reports
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  FileText,
  Calendar,
  Download,
  MapPin,
  Eye,
  CheckCircle,
  AlertTriangle,
  TrendingUp,
  Users,
  Package,
  Clock,
  BarChart3,
  PieChart,
  FileSpreadsheet,
  File,
  Search,
  Filter,
  Plus,
  Trash2,
  RefreshCw,
  CalendarClock,
  ChevronRight,
  Building,
  Target,
  Award,
  Zap,
  ChevronDown,
  ChevronUp,
  Play,
} from 'lucide-react';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import ReportGenerator from '../../components/admin/ReportGenerator';
import VisitLocationMap from '../../components/admin/VisitLocationMap';
import EmployeeAnalytics from '../../components/admin/EmployeeAnalytics';
import CallPlanView from '../../components/employee/CallPlanView';
import userService from '../../services/userService';
import scheduleService from '../../services/scheduleService';
import toast from 'react-hot-toast';

/* =============================================================================
   MOCK DATA
   ============================================================================= */

const REPORT_TYPES = [
  {
    id: 'compliance',
    name: 'Weekly Compliance Report',
    description: 'Track visit compliance, call plan adherence, and territory coverage metrics',
    icon: CheckCircle,
    color: '#22c55e',
    bgColor: '#dcfce7',
    stats: { generated: 24, lastRun: '2 hours ago' },
  },
  {
    id: 'visits',
    name: 'Monthly Visit Summary',
    description: 'Comprehensive overview of all visits, outcomes, and doctor interactions',
    icon: Calendar,
    color: '#3b82f6',
    bgColor: '#dbeafe',
    stats: { generated: 12, lastRun: '1 day ago' },
  },
  {
    id: 'performance',
    name: 'Employee Performance Report',
    description: 'Individual and team performance metrics, KPIs, and achievement tracking',
    icon: TrendingUp,
    color: '#8b5cf6',
    bgColor: '#f3e8ff',
    stats: { generated: 18, lastRun: '3 hours ago' },
  },
  {
    id: 'regional',
    name: 'Regional Comparison Report',
    description: 'Compare performance across regions, identify trends and opportunities',
    icon: MapPin,
    color: '#f59e0b',
    bgColor: '#fef3c7',
    stats: { generated: 8, lastRun: '5 days ago' },
  },
  {
    id: 'products',
    name: 'Product Presentation Report',
    description: 'Product detailing metrics, presentation frequency, and doctor feedback',
    icon: Package,
    color: '#ec4899',
    bgColor: '#fce7f3',
    stats: { generated: 15, lastRun: '12 hours ago' },
  },
];

const RECENT_REPORTS = [
  {
    id: 'rep-001',
    name: 'Weekly Compliance - Region VI',
    type: 'compliance',
    generatedAt: '2025-12-30 14:30',
    generatedBy: 'System Administrator',
    format: 'PDF',
    size: '2.4 MB',
    status: 'ready',
  },
  {
    id: 'rep-002',
    name: 'December Visit Summary',
    type: 'visits',
    generatedAt: '2025-12-29 09:15',
    generatedBy: 'System Administrator',
    format: 'Excel',
    size: '5.1 MB',
    status: 'ready',
  },
  {
    id: 'rep-003',
    name: 'Q4 Performance Report - Juan Dela Cruz',
    type: 'performance',
    generatedAt: '2025-12-28 16:45',
    generatedBy: 'System Administrator',
    format: 'PDF',
    size: '3.2 MB',
    status: 'ready',
  },
  {
    id: 'rep-004',
    name: 'Regional Comparison - All Regions',
    type: 'regional',
    generatedAt: '2025-12-25 11:00',
    generatedBy: 'System Administrator',
    format: 'CSV',
    size: '1.8 MB',
    status: 'ready',
  },
  {
    id: 'rep-005',
    name: 'Product Performance - CardioMax',
    type: 'products',
    generatedAt: '2025-12-24 08:30',
    generatedBy: 'System Administrator',
    format: 'PDF',
    size: '2.1 MB',
    status: 'ready',
  },
];

const SCHEDULED_REPORTS = [
  {
    id: 'sch-001',
    name: 'Weekly Compliance Summary',
    type: 'compliance',
    frequency: 'Weekly',
    nextRun: '2025-01-06 08:00',
    recipients: 'admin@company.com',
    status: 'active',
  },
  {
    id: 'sch-002',
    name: 'Monthly Visit Report',
    type: 'visits',
    frequency: 'Monthly',
    nextRun: '2025-01-01 09:00',
    recipients: 'management@company.com',
    status: 'active',
  },
  {
    id: 'sch-003',
    name: 'Daily Performance Snapshot',
    type: 'performance',
    frequency: 'Daily',
    nextRun: '2025-12-31 07:00',
    recipients: 'supervisors@company.com',
    status: 'paused',
  },
];

const QUICK_STATS = [
  { label: 'Reports Generated', value: '156', icon: FileText, color: '#3b82f6', trend: '+12%' },
  { label: 'Scheduled Reports', value: '8', icon: CalendarClock, color: '#8b5cf6', trend: 'Active' },
  { label: 'Data Coverage', value: '98%', icon: Target, color: '#22c55e', trend: '+3%' },
  { label: 'Avg. Generation Time', value: '4.2s', icon: Zap, color: '#f59e0b', trend: '-0.8s' },
];

// BDM Visit Report Data (Task 2.10)
const MOCK_BDMS = [
  { id: 'bdm-001', name: 'Juan Dela Cruz', region: 'Region VI' },
  { id: 'bdm-002', name: 'Maria Garcia', region: 'NCR' },
  { id: 'bdm-003', name: 'Pedro Martinez', region: 'Region VII' },
  { id: 'bdm-004', name: 'Ana Lopez', region: 'Region III' },
];

const MOCK_VISITS = [
  {
    id: 'visit-001',
    bdmId: 'bdm-001',
    bdmName: 'Juan Dela Cruz',
    doctorName: 'Dr. Maria Santos',
    clinicName: 'Santos Medical Clinic',
    date: '2025-12-02',
    time: '09:30 AM',
    clinicLat: 10.6969,
    clinicLng: 122.5648,
    employeeLat: 10.6975,
    employeeLng: 122.5652,
    accuracy: 10,
    gpsStatus: 'verified',
  },
  {
    id: 'visit-002',
    bdmId: 'bdm-001',
    bdmName: 'Juan Dela Cruz',
    doctorName: 'Dr. Jose Rizal',
    clinicName: 'Rizal Health Center',
    date: '2025-12-05',
    time: '02:00 PM',
    clinicLat: 10.7006,
    clinicLng: 122.5656,
    employeeLat: 10.7050,
    employeeLng: 122.5700,
    accuracy: 15,
    gpsStatus: 'warning',
  },
  {
    id: 'visit-003',
    bdmId: 'bdm-002',
    bdmName: 'Maria Garcia',
    doctorName: 'Dr. Chen Wei',
    clinicName: 'Wei Medical Arts',
    date: '2025-12-03',
    time: '11:00 AM',
    clinicLat: 14.5995,
    clinicLng: 120.9842,
    employeeLat: 14.6050,
    employeeLng: 120.9900,
    accuracy: 20,
    gpsStatus: 'warning',
  },
  {
    id: 'visit-004',
    bdmId: 'bdm-001',
    bdmName: 'Juan Dela Cruz',
    doctorName: 'Dr. Ana Reyes',
    clinicName: 'Reyes Family Clinic',
    date: '2025-12-10',
    time: '10:00 AM',
    clinicLat: 10.6980,
    clinicLng: 122.5660,
    employeeLat: 10.6982,
    employeeLng: 122.5658,
    accuracy: 8,
    gpsStatus: 'verified',
  },
];

/* =============================================================================
   STYLES
   ============================================================================= */

const styles = `
  .reports-layout {
    min-height: 100vh;
    background: #f3f4f6;
  }

  .reports-content {
    display: flex;
  }

  .reports-main {
    flex: 1;
    padding: 24px;
    max-width: 1600px;
  }

  /* Page Header */
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

  .page-header-icon {
    width: 56px;
    height: 56px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    border-radius: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
  }

  .page-header h1 {
    margin: 0;
    font-size: 28px;
    font-weight: 700;
    color: #1f2937;
  }

  .page-header p {
    margin: 4px 0 0 0;
    font-size: 14px;
    color: #6b7280;
  }

  /* Quick Stats */
  .quick-stats {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 16px;
    margin-bottom: 24px;
  }

  .quick-stat-card {
    background: white;
    border-radius: 16px;
    padding: 20px;
    border: 1px solid #e5e7eb;
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .quick-stat-icon {
    width: 52px;
    height: 52px;
    border-radius: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .quick-stat-content {
    flex: 1;
  }

  .quick-stat-label {
    font-size: 13px;
    color: #6b7280;
    margin-bottom: 4px;
  }

  .quick-stat-value {
    font-size: 26px;
    font-weight: 700;
    color: #1f2937;
    line-height: 1;
  }

  .quick-stat-trend {
    margin-top: 6px;
    font-size: 12px;
    font-weight: 600;
    color: #22c55e;
  }

  /* Section Title */
  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 16px;
  }

  .section-title {
    font-size: 18px;
    font-weight: 700;
    color: #1f2937;
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .section-title .count {
    padding: 4px 10px;
    background: #f3f4f6;
    border-radius: 8px;
    font-size: 13px;
    color: #6b7280;
  }

  /* Report Type Cards */
  .report-types-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 16px;
    margin-bottom: 32px;
  }

  .report-type-card {
    background: white;
    border-radius: 16px;
    padding: 24px;
    border: 1px solid #e5e7eb;
    cursor: pointer;
    transition: all 0.2s;
    position: relative;
    overflow: hidden;
  }

  .report-type-card::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 4px;
    background: var(--accent-color);
    opacity: 0;
    transition: opacity 0.2s;
  }

  .report-type-card:hover {
    border-color: #d1d5db;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
    transform: translateY(-2px);
  }

  .report-type-card:hover::before {
    opacity: 1;
  }

  .report-type-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    margin-bottom: 14px;
  }

  .report-type-icon {
    width: 48px;
    height: 48px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .report-type-arrow {
    width: 32px;
    height: 32px;
    border-radius: 8px;
    background: #f3f4f6;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #9ca3af;
    transition: all 0.2s;
  }

  .report-type-card:hover .report-type-arrow {
    background: var(--accent-color);
    color: white;
  }

  .report-type-name {
    font-size: 16px;
    font-weight: 700;
    color: #1f2937;
    margin-bottom: 8px;
  }

  .report-type-desc {
    font-size: 13px;
    color: #6b7280;
    line-height: 1.5;
    margin-bottom: 16px;
  }

  .report-type-stats {
    display: flex;
    align-items: center;
    gap: 16px;
    padding-top: 14px;
    border-top: 1px solid #f3f4f6;
  }

  .report-type-stat {
    font-size: 12px;
    color: #9ca3af;
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .report-type-stat strong {
    color: #374151;
  }

  /* Tabs */
  .tabs-container {
    background: white;
    border-radius: 16px;
    border: 1px solid #e5e7eb;
    overflow: hidden;
  }

  .tabs-header {
    display: flex;
    border-bottom: 1px solid #e5e7eb;
    padding: 0 20px;
  }

  .tab-btn {
    padding: 16px 20px;
    background: none;
    border: none;
    font-size: 14px;
    font-weight: 500;
    color: #6b7280;
    cursor: pointer;
    position: relative;
    display: flex;
    align-items: center;
    gap: 8px;
    transition: color 0.2s;
  }

  .tab-btn:hover {
    color: #374151;
  }

  .tab-btn.active {
    color: #8b5cf6;
    font-weight: 600;
  }

  .tab-btn.active::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 2px;
    background: #8b5cf6;
  }

  .tab-btn .badge {
    padding: 2px 8px;
    background: #f3f4f6;
    border-radius: 10px;
    font-size: 12px;
  }

  .tab-btn.active .badge {
    background: #f3e8ff;
    color: #8b5cf6;
  }

  .tabs-content {
    padding: 20px;
  }

  /* Search Bar */
  .search-bar {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 16px;
  }

  .search-input-wrapper {
    flex: 1;
    position: relative;
  }

  .search-input-wrapper svg {
    position: absolute;
    left: 14px;
    top: 50%;
    transform: translateY(-50%);
    color: #9ca3af;
  }

  .search-input {
    width: 100%;
    padding: 12px 14px 12px 44px;
    border: 1px solid #e5e7eb;
    border-radius: 10px;
    font-size: 14px;
    transition: all 0.2s;
  }

  .search-input:focus {
    outline: none;
    border-color: #8b5cf6;
    box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.1);
  }

  /* Table */
  .reports-table {
    width: 100%;
    border-collapse: collapse;
  }

  .reports-table th {
    padding: 14px 16px;
    text-align: left;
    font-size: 12px;
    font-weight: 600;
    color: #6b7280;
    background: #f9fafb;
    border-bottom: 1px solid #e5e7eb;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .reports-table td {
    padding: 16px;
    font-size: 14px;
    border-bottom: 1px solid #f3f4f6;
    vertical-align: middle;
  }

  .reports-table tr:hover {
    background: #f9fafb;
  }

  .report-name-cell {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .report-icon-small {
    width: 36px;
    height: 36px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .report-name {
    font-weight: 600;
    color: #1f2937;
  }

  .report-meta {
    font-size: 12px;
    color: #9ca3af;
    margin-top: 2px;
  }

  .format-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 10px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 500;
  }

  .format-badge.pdf { background: #fee2e2; color: #dc2626; }
  .format-badge.csv { background: #dcfce7; color: #16a34a; }
  .format-badge.excel { background: #dbeafe; color: #2563eb; }

  .status-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 10px;
    border-radius: 20px;
    font-size: 12px;
    font-weight: 500;
  }

  .status-badge.ready { background: #dcfce7; color: #16a34a; }
  .status-badge.active { background: #dbeafe; color: #2563eb; }
  .status-badge.paused { background: #fef3c7; color: #d97706; }

  .action-btns {
    display: flex;
    gap: 8px;
  }

  .action-btn {
    width: 36px;
    height: 36px;
    border-radius: 8px;
    border: 1px solid #e5e7eb;
    background: white;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #6b7280;
    transition: all 0.2s;
  }

  .action-btn:hover {
    background: #f3f4f6;
    color: #374151;
  }

  .action-btn.download:hover {
    background: #dcfce7;
    border-color: #86efac;
    color: #16a34a;
  }

  .action-btn.delete:hover {
    background: #fee2e2;
    border-color: #fca5a5;
    color: #dc2626;
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
    border-radius: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #9ca3af;
  }

  .empty-state h3 {
    margin: 0 0 8px 0;
    font-size: 16px;
    color: #374151;
  }

  .empty-state p {
    margin: 0;
    font-size: 14px;
    color: #6b7280;
  }

  /* Responsive */
  @media (max-width: 1200px) {
    .quick-stats {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  @media (max-width: 768px) {
    .quick-stats {
      grid-template-columns: 1fr;
    }
    .report-types-grid {
      grid-template-columns: 1fr;
    }
    .page-header {
      flex-direction: column;
      align-items: flex-start;
      gap: 16px;
    }
    .tabs-header {
      overflow-x: auto;
    }
  }

  /* ========================================
     BDM VISIT REPORT SECTION (Task 2.10)
     ======================================== */

  .bdm-report-section {
    background: white;
    border-radius: 16px;
    border: 1px solid #e5e7eb;
    margin-bottom: 24px;
    overflow: hidden;
  }

  .bdm-report-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 20px 24px;
    background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
    color: white;
    cursor: pointer;
    transition: all 0.2s;
  }

  .bdm-report-header:hover {
    background: linear-gradient(135deg, #2563eb 0%, #1e40af 100%);
  }

  .bdm-report-header-left {
    display: flex;
    align-items: center;
    gap: 14px;
  }

  .bdm-report-header-icon {
    width: 44px;
    height: 44px;
    background: rgba(255, 255, 255, 0.2);
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .bdm-report-header h3 {
    margin: 0;
    font-size: 18px;
    font-weight: 700;
  }

  .bdm-report-header p {
    margin: 4px 0 0 0;
    font-size: 13px;
    opacity: 0.9;
  }

  .bdm-report-toggle {
    width: 36px;
    height: 36px;
    background: rgba(255, 255, 255, 0.2);
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
  }

  .bdm-report-content {
    padding: 24px;
  }

  .bdm-report-controls {
    display: flex;
    align-items: flex-end;
    gap: 16px;
    flex-wrap: wrap;
    padding-bottom: 20px;
    border-bottom: 1px solid #e5e7eb;
    margin-bottom: 20px;
  }

  .bdm-control-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .bdm-control-group label {
    font-size: 12px;
    font-weight: 600;
    color: #6b7280;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .bdm-select,
  .bdm-input {
    padding: 12px 16px;
    border: 1px solid #e5e7eb;
    border-radius: 10px;
    font-size: 14px;
    min-width: 180px;
    transition: all 0.2s;
  }

  .bdm-select:focus,
  .bdm-input:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }

  .bdm-btn-generate {
    padding: 12px 24px;
    background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
    color: white;
    border: none;
    border-radius: 10px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 8px;
    transition: all 0.2s;
  }

  .bdm-btn-generate:hover {
    box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
    transform: translateY(-1px);
  }

  .bdm-export-btns {
    display: flex;
    gap: 8px;
    margin-left: auto;
  }

  .bdm-btn-export {
    padding: 12px 16px;
    border-radius: 10px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 6px;
    transition: all 0.2s;
    border: none;
  }

  .bdm-btn-export.excel {
    background: #22c55e;
    color: white;
  }

  .bdm-btn-export.excel:hover {
    background: #16a34a;
  }

  .bdm-btn-export.csv {
    background: white;
    color: #374151;
    border: 1px solid #e5e7eb;
  }

  .bdm-btn-export.csv:hover {
    background: #f3f4f6;
  }

  /* Visit Table */
  .visit-table {
    width: 100%;
    border-collapse: collapse;
  }

  .visit-table th {
    padding: 14px 16px;
    text-align: left;
    font-size: 12px;
    font-weight: 600;
    color: #6b7280;
    background: #f9fafb;
    border-bottom: 1px solid #e5e7eb;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .visit-table td {
    padding: 16px;
    font-size: 14px;
    border-bottom: 1px solid #f3f4f6;
  }

  .visit-table tr:hover {
    background: #f9fafb;
  }

  .visit-table tr.selected {
    background: #eff6ff;
  }

  .doctor-cell {
    display: flex;
    flex-direction: column;
  }

  .doctor-name {
    font-weight: 600;
    color: #1f2937;
  }

  .clinic-name {
    font-size: 12px;
    color: #6b7280;
    margin-top: 2px;
  }

  .gps-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border-radius: 20px;
    font-size: 12px;
    font-weight: 600;
  }

  .gps-badge.verified {
    background: #dcfce7;
    color: #16a34a;
  }

  .gps-badge.warning {
    background: #fef3c7;
    color: #d97706;
  }

  .btn-view-gps {
    padding: 8px 14px;
    background: #f3f4f6;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 6px;
    color: #374151;
    transition: all 0.2s;
  }

  .btn-view-gps:hover {
    background: #e5e7eb;
  }

  .bdm-empty-state {
    padding: 60px 20px;
    text-align: center;
  }

  .bdm-empty-icon {
    width: 64px;
    height: 64px;
    margin: 0 auto 16px;
    background: #f3f4f6;
    border-radius: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #9ca3af;
  }

  .bdm-empty-state h3 {
    margin: 0 0 8px 0;
    font-size: 16px;
    font-weight: 600;
    color: #374151;
  }

  .bdm-empty-state p {
    margin: 0;
    font-size: 14px;
    color: #6b7280;
  }

  /* GPS Section */
  .gps-section {
    margin-top: 24px;
    padding-top: 24px;
    border-top: 1px solid #e5e7eb;
  }

  .gps-section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 16px;
  }

  .gps-section-title {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 16px;
    font-weight: 600;
    color: #1f2937;
  }

  .gps-section-title .icon {
    width: 36px;
    height: 36px;
    background: #fef3c7;
    color: #d97706;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .gps-visit-info {
    padding: 10px 16px;
    background: #eff6ff;
    border-radius: 8px;
    font-size: 14px;
    color: #1e40af;
    font-weight: 500;
  }

  @media (max-width: 480px) {
    .reports-main {
      padding: 16px;
      padding-bottom: 80px;
    }
    .page-header {
      flex-direction: column;
      align-items: flex-start;
      gap: 12px;
    }
    .page-header h1 {
      font-size: 22px;
    }
    .quick-stats {
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }
    .quick-stat-value {
      font-size: 20px;
    }
    .report-types-grid {
      grid-template-columns: 1fr;
    }
    .tabs-header {
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
    }
    .tab-btn {
      padding: 12px 14px;
      font-size: 13px;
      white-space: nowrap;
    }
    .section-header {
      flex-direction: column;
      align-items: flex-start;
      gap: 8px;
    }
  }
`;

/* =============================================================================
   COMPONENT
   ============================================================================= */

const ReportsPage = () => {
  const [activeTab, setActiveTab] = useState('recent');
  const [searchQuery, setSearchQuery] = useState('');
  const [generatorOpen, setGeneratorOpen] = useState(false);
  const [selectedReportType, setSelectedReportType] = useState(null);

  // BDM Visit Report State (Task 2.10)
  const [bdmSectionExpanded, setBdmSectionExpanded] = useState(true);
  const [selectedBdm, setSelectedBdm] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('2025-12');
  const [reportGenerated, setReportGenerated] = useState(false);
  const [selectedVisit, setSelectedVisit] = useState(null);

  // Filter visits by selected BDM
  const filteredVisits = useMemo(() => {
    if (!selectedBdm) return [];
    return MOCK_VISITS.filter((v) => v.bdmId === selectedBdm);
  }, [selectedBdm]);

  // Filter recent reports
  const filteredReports = useMemo(() => {
    if (!searchQuery) return RECENT_REPORTS;
    const q = searchQuery.toLowerCase();
    return RECENT_REPORTS.filter(r =>
      r.name.toLowerCase().includes(q) ||
      r.type.toLowerCase().includes(q)
    );
  }, [searchQuery]);

  // Get report type info
  const getReportTypeInfo = (typeId) => {
    return REPORT_TYPES.find(t => t.id === typeId) || REPORT_TYPES[0];
  };

  // Handle report type click
  const handleReportTypeClick = (typeId) => {
    setSelectedReportType(typeId);
    setGeneratorOpen(true);
  };

  // Handle report generation
  const handleReportGenerated = (reportData) => {
    console.log('Report generated:', reportData);
    // In real app, would add to recent reports list
  };

  // Handle download
  const handleDownload = (report) => {
    console.log('Downloading:', report.name);
    alert(`Downloading ${report.name} (${report.format})`);
  };

  // Handle delete
  const handleDelete = (reportId) => {
    if (confirm('Are you sure you want to delete this report?')) {
      console.log('Deleting:', reportId);
    }
  };

  // CPT View State
  const [cptSectionExpanded, setCptSectionExpanded] = useState(true);
  const [cptBdmId, setCptBdmId] = useState('');
  const [cptCycleNumber, setCptCycleNumber] = useState(null);
  const [cptData, setCptData] = useState(null);
  const [cptLoading, setCptLoading] = useState(false);
  const [realBdms, setRealBdms] = useState([]);

  // Fetch real BDMs for CPT View
  useEffect(() => {
    const fetchBdms = async () => {
      try {
        const response = await userService.getEmployees({ limit: 0 });
        setRealBdms(response.data || []);
      } catch (err) {
        console.error('Failed to fetch employees:', err);
      }
    };
    fetchBdms();
  }, []);

  // Fetch CPT grid data when BDM selected
  const fetchCPTData = useCallback(async (bdmId, cycle) => {
    if (!bdmId) return;
    try {
      setCptLoading(true);
      const response = await scheduleService.getCPTGrid(cycle, bdmId);
      setCptData(response.data);
      if (cycle == null && response.data?.cycleNumber != null) {
        setCptCycleNumber(response.data.cycleNumber);
      }
    } catch (err) {
      console.error('Failed to fetch CPT grid:', err);
      toast.error(err.response?.data?.message || 'Failed to load CPT data');
      setCptData(null);
    } finally {
      setCptLoading(false);
    }
  }, []);

  useEffect(() => {
    if (cptBdmId) {
      fetchCPTData(cptBdmId, cptCycleNumber);
    }
  }, [cptBdmId, cptCycleNumber, fetchCPTData]);

  const handleCptCycleChange = (delta) => {
    setCptCycleNumber((prev) => (prev != null ? prev + delta : delta));
  };

  // BDM Visit Report handlers
  const handleGenerateReport = () => {
    if (!selectedBdm) {
      alert('Please select a BDM first');
      return;
    }
    setReportGenerated(true);
    setSelectedVisit(null);
  };

  const handleExport = (format) => {
    console.log(`Exporting ${format.toUpperCase()} report for ${MOCK_BDMS.find(b => b.id === selectedBdm)?.name}`);
    alert(`Exporting ${format.toUpperCase()} report`);
  };

  return (
    <div className="reports-layout">
      <style>{styles}</style>
      <Navbar />
      <div className="reports-content">
        <Sidebar />
        <main className="reports-main">
          {/* Page Header */}
          <div className="page-header">
            <div className="page-header-left">
              <div className="page-header-icon">
                <BarChart3 size={28} />
              </div>
              <div>
                <h1>Reports Center</h1>
                <p>Generate, schedule, and manage your reports</p>
              </div>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="quick-stats">
            {QUICK_STATS.map((stat, i) => {
              const Icon = stat.icon;
              return (
                <div key={i} className="quick-stat-card">
                  <div
                    className="quick-stat-icon"
                    style={{ background: `${stat.color}15`, color: stat.color }}
                  >
                    <Icon size={24} />
                  </div>
                  <div className="quick-stat-content">
                    <div className="quick-stat-label">{stat.label}</div>
                    <div className="quick-stat-value">{stat.value}</div>
                    <div className="quick-stat-trend">{stat.trend}</div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Report Types Section */}
          <div className="section-header">
            <h2 className="section-title">
              <FileText size={20} />
              Report Types
              <span className="count">{REPORT_TYPES.length} Available</span>
            </h2>
          </div>

          <div className="report-types-grid">
            {REPORT_TYPES.map((type) => {
              const Icon = type.icon;
              return (
                <div
                  key={type.id}
                  className="report-type-card"
                  style={{ '--accent-color': type.color }}
                  onClick={() => handleReportTypeClick(type.id)}
                >
                  <div className="report-type-header">
                    <div
                      className="report-type-icon"
                      style={{ background: type.bgColor, color: type.color }}
                    >
                      <Icon size={24} />
                    </div>
                    <div className="report-type-arrow">
                      <ChevronRight size={18} />
                    </div>
                  </div>
                  <div className="report-type-name">{type.name}</div>
                  <div className="report-type-desc">{type.description}</div>
                  <div className="report-type-stats">
                    <span className="report-type-stat">
                      <FileText size={12} />
                      <strong>{type.stats.generated}</strong> generated
                    </span>
                    <span className="report-type-stat">
                      <Clock size={12} />
                      Last: {type.stats.lastRun}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* BDM Visit Report Section (Task 2.10) */}
          <div className="bdm-report-section">
            <div 
              className="bdm-report-header"
              onClick={() => setBdmSectionExpanded(!bdmSectionExpanded)}
            >
              <div className="bdm-report-header-left">
                <div className="bdm-report-header-icon">
                  <Users size={22} />
                </div>
                <div>
                  <h3>BDM Visit Report & Analytics</h3>
                  <p>Generate individual employee performance reports with GPS verification</p>
                </div>
              </div>
              <div className="bdm-report-toggle">
                {bdmSectionExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
              </div>
            </div>

            {bdmSectionExpanded && (
              <div className="bdm-report-content">
                {/* Controls */}
                <div className="bdm-report-controls">
                  <div className="bdm-control-group">
                    <label>BDM / Employee</label>
                    <select
                      className="bdm-select"
                      value={selectedBdm}
                      onChange={(e) => {
                        setSelectedBdm(e.target.value);
                        setReportGenerated(false);
                        setSelectedVisit(null);
                      }}
                    >
                      <option value="">Select Employee</option>
                      {MOCK_BDMS.map((bdm) => (
                        <option key={bdm.id} value={bdm.id}>
                          {bdm.name} ({bdm.region})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="bdm-control-group">
                    <label>Month</label>
                    <input
                      type="month"
                      className="bdm-input"
                      value={selectedMonth}
                      onChange={(e) => setSelectedMonth(e.target.value)}
                    />
                  </div>
                  <button className="bdm-btn-generate" onClick={handleGenerateReport}>
                    <Play size={16} />
                    Generate Report
                  </button>
                  
                  {reportGenerated && (
                    <div className="bdm-export-btns">
                      <button className="bdm-btn-export excel" onClick={() => handleExport('excel')}>
                        <FileSpreadsheet size={16} />
                        Export Excel
                      </button>
                      <button className="bdm-btn-export csv" onClick={() => handleExport('csv')}>
                        <FileText size={16} />
                        Export CSV
                      </button>
                    </div>
                  )}
                </div>

                {/* Visit Table or Empty State */}
                {!reportGenerated ? (
                  <div className="bdm-empty-state">
                    <div className="bdm-empty-icon">
                      <BarChart3 size={28} />
                    </div>
                    <h3>No Report Generated</h3>
                    <p>Select a BDM and month, then click "Generate Report" to view visits and analytics</p>
                  </div>
                ) : (
                  <>
                    <table className="visit-table">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Time</th>
                          <th>Doctor / Clinic</th>
                          <th>GPS Status</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredVisits.map((visit) => (
                          <tr 
                            key={visit.id} 
                            className={selectedVisit?.id === visit.id ? 'selected' : ''}
                          >
                            <td>{visit.date}</td>
                            <td>{visit.time}</td>
                            <td>
                              <div className="doctor-cell">
                                <span className="doctor-name">{visit.doctorName}</span>
                                <span className="clinic-name">{visit.clinicName}</span>
                              </div>
                            </td>
                            <td>
                              <span className={`gps-badge ${visit.gpsStatus}`}>
                                {visit.gpsStatus === 'verified' ? (
                                  <><CheckCircle size={14} /> Verified</>
                                ) : (
                                  <><AlertTriangle size={14} /> Warning</>
                                )}
                              </span>
                            </td>
                            <td>
                              <button 
                                className="btn-view-gps"
                                onClick={() => setSelectedVisit(visit)}
                              >
                                <Eye size={14} />
                                View GPS
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    {/* GPS Verification Section */}
                    {selectedVisit && (
                      <div className="gps-section">
                        <div className="gps-section-header">
                          <div className="gps-section-title">
                            <div className="icon">
                              <MapPin size={18} />
                            </div>
                            GPS Location Verification
                          </div>
                          <span className="gps-visit-info">
                            {selectedVisit.clinicName} • {selectedVisit.doctorName}
                          </span>
                        </div>
                        <VisitLocationMap
                          clinicCoords={{ lat: selectedVisit.clinicLat, lng: selectedVisit.clinicLng }}
                          employeeCoords={{ lat: selectedVisit.employeeLat, lng: selectedVisit.employeeLng }}
                          allowedRadius={400}
                          accuracy={selectedVisit.accuracy}
                        />
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {/* Employee Performance Analytics (Task 2.10) */}
          {reportGenerated && selectedBdm && (
            <EmployeeAnalytics
              employeeId={selectedBdm}
              employeeName={MOCK_BDMS.find(b => b.id === selectedBdm)?.name || 'Unknown'}
              month={selectedMonth}
              visits={filteredVisits}
              allEmployees={MOCK_BDMS}
            />
          )}

          {/* CPT View Section */}
          <div className="bdm-report-section" style={{ marginTop: '24px' }}>
            <div
              className="bdm-report-header"
              onClick={() => setCptSectionExpanded(!cptSectionExpanded)}
            >
              <div className="bdm-report-header-left">
                <div className="bdm-report-header-icon" style={{ background: 'linear-gradient(135deg, #8b5cf6, #6d28d9)' }}>
                  <Calendar size={22} />
                </div>
                <div>
                  <h3>Call Plan (CPT) View</h3>
                  <p>View BDM call plans with DCR summary and engagement tracking</p>
                </div>
              </div>
              <div className="bdm-report-toggle">
                {cptSectionExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
              </div>
            </div>

            {cptSectionExpanded && (
              <div className="bdm-report-content">
                {/* Controls */}
                <div className="bdm-report-controls">
                  <div className="bdm-control-group">
                    <label>BDM / Employee</label>
                    <select
                      className="bdm-select"
                      value={cptBdmId}
                      onChange={(e) => {
                        setCptBdmId(e.target.value);
                        setCptData(null);
                        setCptCycleNumber(null);
                      }}
                    >
                      <option value="">Select Employee</option>
                      {realBdms.map((bdm) => (
                        <option key={bdm._id} value={bdm._id}>
                          {bdm.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {cptBdmId && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'white', padding: '6px 12px', borderRadius: '10px', border: '1px solid #e5e7eb' }}>
                      <button
                        className="bdm-btn-generate"
                        style={{ padding: '6px 10px', minWidth: 'auto' }}
                        onClick={() => handleCptCycleChange(-1)}
                      >
                        &#8249;
                      </button>
                      <span style={{ fontSize: '14px', fontWeight: 600, minWidth: '80px', textAlign: 'center' }}>
                        Cycle {cptData?.cycleNumber ?? cptCycleNumber ?? '...'}
                      </span>
                      <button
                        className="bdm-btn-generate"
                        style={{ padding: '6px 10px', minWidth: 'auto' }}
                        onClick={() => handleCptCycleChange(1)}
                      >
                        &#8250;
                      </button>
                    </div>
                  )}
                </div>

                {/* CPT Grid */}
                {!cptBdmId ? (
                  <div className="bdm-empty-state">
                    <div className="bdm-empty-icon">
                      <Calendar size={28} />
                    </div>
                    <h3>No BDM Selected</h3>
                    <p>Select an employee to view their Call Plan</p>
                  </div>
                ) : (
                  <CallPlanView
                    cptData={cptData}
                    loading={cptLoading}
                  />
                )}
              </div>
            )}
          </div>

          {/* Tabs Container */}
          <div className="tabs-container">
            <div className="tabs-header">
              <button
                className={`tab-btn ${activeTab === 'recent' ? 'active' : ''}`}
                onClick={() => setActiveTab('recent')}
              >
                <Clock size={16} />
                Recent Reports
                <span className="badge">{RECENT_REPORTS.length}</span>
              </button>
              <button
                className={`tab-btn ${activeTab === 'scheduled' ? 'active' : ''}`}
                onClick={() => setActiveTab('scheduled')}
              >
                <CalendarClock size={16} />
                Scheduled Reports
                <span className="badge">{SCHEDULED_REPORTS.length}</span>
              </button>
            </div>

            <div className="tabs-content">
              {/* Search */}
              <div className="search-bar">
                <div className="search-input-wrapper">
                  <Search size={18} />
                  <input
                    type="text"
                    className="search-input"
                    placeholder="Search reports..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>

              {/* Recent Reports Tab */}
              {activeTab === 'recent' && (
                <>
                  {filteredReports.length === 0 ? (
                    <div className="empty-state">
                      <div className="empty-state-icon">
                        <FileText size={28} />
                      </div>
                      <h3>No reports found</h3>
                      <p>Try adjusting your search or generate a new report</p>
                    </div>
                  ) : (
                    <table className="reports-table">
                      <thead>
                        <tr>
                          <th>Report Name</th>
                          <th>Generated</th>
                          <th>Format</th>
                          <th>Size</th>
                          <th>Status</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredReports.map((report) => {
                          const typeInfo = getReportTypeInfo(report.type);
                          const TypeIcon = typeInfo.icon;
                          return (
                            <tr key={report.id}>
                              <td>
                                <div className="report-name-cell">
                                  <div
                                    className="report-icon-small"
                                    style={{ background: typeInfo.bgColor, color: typeInfo.color }}
                                  >
                                    <TypeIcon size={16} />
                                  </div>
                                  <div>
                                    <div className="report-name">{report.name}</div>
                                    <div className="report-meta">by {report.generatedBy}</div>
                                  </div>
                                </div>
                              </td>
                              <td>{report.generatedAt}</td>
                              <td>
                                <span className={`format-badge ${report.format.toLowerCase()}`}>
                                  {report.format === 'PDF' && <File size={12} />}
                                  {report.format === 'CSV' && <FileText size={12} />}
                                  {report.format === 'Excel' && <FileSpreadsheet size={12} />}
                                  {report.format}
                                </span>
                              </td>
                              <td>{report.size}</td>
                              <td>
                                <span className={`status-badge ${report.status}`}>
                                  <CheckCircle size={12} />
                                  Ready
                                </span>
                              </td>
                              <td>
                                <div className="action-btns">
                                  <button
                                    className="action-btn download"
                                    title="Download"
                                    onClick={() => handleDownload(report)}
                                  >
                                    <Download size={16} />
                                  </button>
                                  <button
                                    className="action-btn"
                                    title="View"
                                  >
                                    <Eye size={16} />
                                  </button>
                                  <button
                                    className="action-btn delete"
                                    title="Delete"
                                    onClick={() => handleDelete(report.id)}
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </>
              )}

              {/* Scheduled Reports Tab */}
              {activeTab === 'scheduled' && (
                <table className="reports-table">
                  <thead>
                    <tr>
                      <th>Report Name</th>
                      <th>Frequency</th>
                      <th>Next Run</th>
                      <th>Recipients</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {SCHEDULED_REPORTS.map((report) => {
                      const typeInfo = getReportTypeInfo(report.type);
                      const TypeIcon = typeInfo.icon;
                      return (
                        <tr key={report.id}>
                          <td>
                            <div className="report-name-cell">
                              <div
                                className="report-icon-small"
                                style={{ background: typeInfo.bgColor, color: typeInfo.color }}
                              >
                                <TypeIcon size={16} />
                              </div>
                              <div>
                                <div className="report-name">{report.name}</div>
                                <div className="report-meta">{typeInfo.name}</div>
                              </div>
                            </div>
                          </td>
                          <td>
                            <span style={{ fontWeight: 500 }}>{report.frequency}</span>
                          </td>
                          <td>{report.nextRun}</td>
                          <td>{report.recipients}</td>
                          <td>
                            <span className={`status-badge ${report.status}`}>
                              {report.status === 'active' ? (
                                <><CheckCircle size={12} /> Active</>
                              ) : (
                                <><Clock size={12} /> Paused</>
                              )}
                            </span>
                          </td>
                          <td>
                            <div className="action-btns">
                              <button className="action-btn" title="Run Now">
                                <RefreshCw size={16} />
                              </button>
                              <button className="action-btn" title="Edit">
                                <Eye size={16} />
                              </button>
                              <button className="action-btn delete" title="Delete">
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </main>
      </div>

      {/* Report Generator Modal */}
      <ReportGenerator
        isOpen={generatorOpen}
        onClose={() => {
          setGeneratorOpen(false);
          setSelectedReportType(null);
        }}
        reportType={selectedReportType}
        onGenerate={handleReportGenerated}
      />
    </div>
  );
};

export default ReportsPage;