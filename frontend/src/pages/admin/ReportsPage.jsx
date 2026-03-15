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
  CheckCircle,
  TrendingUp,
  Users,
  Clock,
  BarChart3,
  FileSpreadsheet,
  Search,
  Plus,
  Trash2,
  RefreshCw,
  CalendarClock,
  ChevronRight,
  Zap,
  ChevronDown,
  ChevronUp,
  Play,
} from 'lucide-react';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import ReportGenerator from '../../components/admin/ReportGenerator';
import CallPlanView from '../../components/employee/CallPlanView';
import EmployeeVisitReport from '../../components/admin/EmployeeVisitReport';
import userService from '../../services/userService';
import visitService from '../../services/visitService';
import scheduleService from '../../services/scheduleService';
import { exportEmployeeReportToExcel, exportEmployeeReportToCSV } from '../../utils/exportEmployeeReport';
import reportService from '../../services/reportService';
import toast from 'react-hot-toast';

/* =============================================================================
   REPORT TYPE DEFINITIONS (UI-only — icons, colors, descriptions)
   ============================================================================= */

const REPORT_TYPES = [
  {
    id: 'compliance',
    name: 'Weekly Compliance Report',
    description: 'Track visit compliance, call plan adherence, and territory coverage metrics',
    icon: CheckCircle,
    color: '#22c55e',
    bgColor: '#dcfce7',
  },
  {
    id: 'visits',
    name: 'Monthly Visit Summary',
    description: 'Comprehensive overview of all visits, outcomes, and doctor interactions',
    icon: Calendar,
    color: '#3b82f6',
    bgColor: '#dbeafe',
  },
  {
    id: 'performance',
    name: 'BDM Performance Report',
    description: 'Individual and team performance metrics, KPIs, and achievement tracking',
    icon: TrendingUp,
    color: '#8b5cf6',
    bgColor: '#f3e8ff',
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
    overflow-x: hidden;
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
  .table-wrapper {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }

  .reports-table {
    width: 100%;
    border-collapse: collapse;
    min-width: 600px;
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

  /* ===== DARK MODE ===== */
  body.dark-mode .reports-layout {
    background: #0b1220;
  }

  body.dark-mode .page-header h1,
  body.dark-mode .section-title,
  body.dark-mode .empty-state h3 {
    color: #f1f5f9;
  }

  body.dark-mode .page-header p,
  body.dark-mode .quick-stat-label,
  body.dark-mode .empty-state p {
    color: #94a3b8;
  }

  body.dark-mode .quick-stat-card,
  body.dark-mode .report-type-card,
  body.dark-mode .recent-reports,
  body.dark-mode .scheduled-reports,
  body.dark-mode .report-generator {
    background: #0f172a;
    border-color: #1e293b;
    box-shadow: none;
  }

  body.dark-mode .section-title .count {
    background: #1e293b;
    color: #cbd5e1;
  }

  body.dark-mode .tabs-header {
    background: #0f172a;
    border-color: #1e293b;
  }

  body.dark-mode .tabs-container {
    background: #0f172a;
    border-color: #1e293b;
  }

  body.dark-mode .tabs-content {
    background: #0f172a;
  }

  body.dark-mode .tab-btn {
    color: #94a3b8;
  }

  body.dark-mode .tab-btn:hover {
    background: #1e293b;
    color: #f1f5f9;
  }

  body.dark-mode .tab-btn.active {
    background: #1e3a8a;
    color: #bfdbfe;
  }

  body.dark-mode .tab-btn .badge {
    background: #1e293b;
    color: #cbd5e1;
  }

  body.dark-mode .tab-btn.active .badge {
    background: #1e40af;
    color: #bfdbfe;
  }

  body.dark-mode .search-input-wrapper svg {
    color: #94a3b8;
  }

  body.dark-mode .search-input {
    background: #0b1220;
    border-color: #1e293b;
    color: #e2e8f0;
  }

  body.dark-mode .search-input::placeholder {
    color: #94a3b8;
  }

  body.dark-mode .reports-table th {
    background: #0b1220;
    border-bottom-color: #1e293b;
    color: #cbd5e1;
  }

  body.dark-mode .reports-table td {
    border-bottom-color: #1e293b;
    color: #e2e8f0;
  }

  body.dark-mode .reports-table tr:hover {
    background: #1e293b;
  }

  body.dark-mode .report-name {
    color: #f1f5f9;
  }

  body.dark-mode .report-meta {
    color: #94a3b8;
  }

  body.dark-mode .bdm-select,
  body.dark-mode .bdm-input {
    background: #0b1220;
    border-color: #1e293b;
    color: #e2e8f0;
  }

  body.dark-mode .bdm-control-group label {
    color: #cbd5e1;
  }

  body.dark-mode .bdm-report-section {
    background: #0f172a;
    border-color: #1e293b;
    box-shadow: none;
  }

  body.dark-mode .bdm-report-controls {
    border-bottom-color: #1e293b;
  }

  body.dark-mode .bdm-btn-export.csv {
    background: #0b1220;
    color: #e2e8f0;
    border-color: #1e293b;
  }

  body.dark-mode .bdm-btn-export.csv:hover {
    background: #1e293b;
  }

  body.dark-mode .visit-table th {
    background: #0b1220;
    border-bottom-color: #1e293b;
    color: #cbd5e1;
  }

  body.dark-mode .visit-table td {
    border-bottom-color: #1e293b;
    color: #e2e8f0;
  }

  body.dark-mode .visit-table tr:hover {
    background: #1e293b;
  }

  body.dark-mode .visit-table tr.selected {
    background: #1e3a8a;
  }

  body.dark-mode .doctor-name {
    color: #f1f5f9;
  }

  body.dark-mode .clinic-name {
    color: #94a3b8;
  }

  body.dark-mode .btn-view-gps {
    background: #0b1220;
    border-color: #1e293b;
    color: #e2e8f0;
  }

  body.dark-mode .btn-view-gps:hover {
    background: #1e293b;
  }

  body.dark-mode .gps-section {
    border-top-color: #1e293b;
  }

  body.dark-mode .gps-section-title {
    color: #f1f5f9;
  }

  body.dark-mode .gps-visit-info {
    background: #1e3a8a;
    color: #bfdbfe;
  }

  body.dark-mode .action-btn {
    background: #0b1220;
    border-color: #1e293b;
    color: #cbd5e1;
  }

  body.dark-mode .action-btn:hover {
    background: #1e293b;
    color: #f1f5f9;
  }

  body.dark-mode .action-btn.download:hover,
  body.dark-mode .action-btn.delete:hover {
    background: #1e293b;
    border-color: #1e293b;
    color: #f1f5f9;
  }

  body.dark-mode .empty-state-icon {
    background: #1e293b;
    color: #94a3b8;
  }

  body.dark-mode .bdm-empty-icon {
    background: #1e293b;
    color: #94a3b8;
  }

  body.dark-mode .bdm-empty-state h3 {
    color: #f1f5f9;
  }

  body.dark-mode .bdm-empty-state p {
    color: #94a3b8;
  }

  body.dark-mode .quick-stat-value {
    color: #f1f5f9;
  }

  body.dark-mode .report-type-name {
    color: #f1f5f9;
  }

  body.dark-mode .report-type-desc {
    color: #94a3b8;
  }

  body.dark-mode .report-type-stats {
    border-top-color: #1e293b;
  }

  body.dark-mode .report-type-stat {
    color: #94a3b8;
  }

  body.dark-mode .report-type-stat strong {
    color: #e2e8f0;
  }

  body.dark-mode .report-type-arrow {
    background: #1e293b;
    color: #cbd5e1;
  }

  /* Responsive */
  @media (max-width: 1200px) {
    .quick-stats {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  @media (max-width: 1024px) {
    .bdm-report-controls {
      gap: 12px;
    }
    .bdm-select,
    .bdm-input {
      min-width: 140px;
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
    .bdm-report-controls {
      flex-direction: column;
      align-items: stretch;
    }
    .bdm-control-group {
      width: 100%;
    }
    .bdm-select,
    .bdm-input {
      width: 100%;
    }
    .bdm-btn-generate {
      width: 100%;
      justify-content: center;
    }
    .bdm-export-btns {
      width: 100%;
    }
    .bdm-btn-export {
      flex: 1;
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
    min-width: 0;
    flex: 0 1 auto;
  }

  .bdm-control-group label {
    font-size: 12px;
    font-weight: 600;
    color: #6b7280;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    white-space: nowrap;
  }

  .bdm-select,
  .bdm-input {
    padding: 12px 16px;
    border: 1px solid #e5e7eb;
    border-radius: 10px;
    font-size: 14px;
    min-width: 160px;
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
    white-space: nowrap;
  }

  .bdm-btn-generate:hover {
    box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
    transform: translateY(-1px);
  }

  .bdm-export-btns {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
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
    .bdm-report-controls {
      gap: 12px;
    }
    .bdm-control-group {
      width: 100%;
      flex: 1 1 100%;
    }
    .bdm-select,
    .bdm-input {
      width: 100%;
      min-width: 0;
    }
    .bdm-btn-generate {
      width: 100%;
      justify-content: center;
    }
    .bdm-export-btns {
      width: 100%;
      flex-direction: column;
    }
    .bdm-btn-export {
      width: 100%;
      justify-content: center;
    }
    .bdm-report-header {
      padding: 16px;
    }
    .bdm-report-header h3 {
      font-size: 16px;
    }
    .bdm-report-header p {
      font-size: 12px;
    }
    .bdm-report-content {
      padding: 16px;
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

  // Report system state (real data)
  const [reports, setReports] = useState([]);
  const [reportsLoading, setReportsLoading] = useState(true);
  const [scheduledReports, setScheduledReports] = useState([]);
  const [reportStats, setReportStats] = useState({ totalReports: 0, scheduledCount: 0, avgTime: '0s' });

  // BDM Visit Report State
  const [bdmSectionExpanded, setBdmSectionExpanded] = useState(true);
  const [selectedBdm, setSelectedBdm] = useState('');
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [clientTypeFilter, setClientTypeFilter] = useState('all');
  const [reportGenerated, setReportGenerated] = useState(false);
  const [reportData, setReportData] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);

  // Fetch reports, scheduled reports, and stats
  const fetchReports = useCallback(async () => {
    try {
      setReportsLoading(true);
      const res = await reportService.getReports({ limit: 20 });
      setReports(res.data?.reports || []);
    } catch (err) {
      console.error('Failed to fetch reports:', err);
    } finally {
      setReportsLoading(false);
    }
  }, []);

  const fetchScheduledReports = useCallback(async () => {
    try {
      const res = await reportService.getScheduledReports();
      setScheduledReports(res.data || []);
    } catch (err) {
      console.error('Failed to fetch scheduled reports:', err);
    }
  }, []);

  const fetchReportStats = useCallback(async () => {
    try {
      const res = await reportService.getReportStats();
      setReportStats(res.data || { totalReports: 0, scheduledCount: 0, avgTime: '0s' });
    } catch (err) {
      console.error('Failed to fetch report stats:', err);
    }
  }, []);

  useEffect(() => {
    fetchReports();
    fetchScheduledReports();
    fetchReportStats();
  }, [fetchReports, fetchScheduledReports, fetchReportStats]);

  // Filter recent reports by search
  const filteredReports = useMemo(() => {
    if (!searchQuery) return reports;
    const q = searchQuery.toLowerCase();
    return reports.filter(r =>
      r.name.toLowerCase().includes(q) ||
      r.type.toLowerCase().includes(q)
    );
  }, [searchQuery, reports]);

  // Get report type info
  const getReportTypeInfo = (typeId) => {
    return REPORT_TYPES.find(t => t.id === typeId) || REPORT_TYPES[0];
  };

  // Handle report type click
  const handleReportTypeClick = (typeId) => {
    setSelectedReportType(typeId);
    setGeneratorOpen(true);
  };

  // Handle report generation callback — refresh lists
  const handleReportGenerated = () => {
    fetchReports();
    fetchReportStats();
    fetchScheduledReports();
  };

  // Handle download via signed S3 URL
  const handleDownload = async (report) => {
    try {
      const res = await reportService.downloadReport(report._id);
      window.open(res.data.url, '_blank');
    } catch (err) {
      toast.error('Failed to download report');
    }
  };

  // Handle delete
  const handleDelete = async (reportId) => {
    if (!confirm('Are you sure you want to delete this report?')) return;
    try {
      await reportService.deleteReport(reportId);
      setReports(prev => prev.filter(r => r._id !== reportId));
      fetchReportStats();
      toast.success('Report deleted');
    } catch (err) {
      toast.error('Failed to delete report');
    }
  };

  // Scheduled report actions
  const handleRunScheduledNow = async (id) => {
    try {
      toast.loading('Generating report...', { id: 'run-scheduled' });
      await reportService.runScheduledNow(id);
      toast.success('Report generated successfully', { id: 'run-scheduled' });
      fetchReports();
      fetchScheduledReports();
      fetchReportStats();
    } catch (err) {
      toast.error('Failed to run report', { id: 'run-scheduled' });
    }
  };

  const handleToggleScheduledStatus = async (scheduled) => {
    try {
      const newStatus = scheduled.status === 'active' ? 'paused' : 'active';
      await reportService.updateScheduledReport(scheduled._id, { status: newStatus });
      setScheduledReports(prev => prev.map(s => s._id === scheduled._id ? { ...s, status: newStatus } : s));
      fetchReportStats();
    } catch (err) {
      toast.error('Failed to update scheduled report');
    }
  };

  const handleDeleteScheduled = async (id) => {
    if (!confirm('Delete this scheduled report?')) return;
    try {
      await reportService.deleteScheduledReport(id);
      setScheduledReports(prev => prev.filter(s => s._id !== id));
      fetchReportStats();
      toast.success('Scheduled report deleted');
    } catch (err) {
      toast.error('Failed to delete scheduled report');
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
  const handleGenerateReport = async () => {
    if (!selectedBdm) {
      toast.error('Please select a BDM first');
      return;
    }
    setReportLoading(true);
    setReportGenerated(false);
    setReportData(null);
    try {
      const response = await visitService.getEmployeeReport(selectedBdm, selectedMonth);
      setReportData(response.data);
      setReportGenerated(true);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to generate report');
    } finally {
      setReportLoading(false);
    }
  };

  const handleExport = (format) => {
    if (!reportData) return;
    if (format === 'excel') {
      exportEmployeeReportToExcel(reportData, selectedMonth);
    } else {
      exportEmployeeReportToCSV(reportData, selectedMonth);
    }
  };

  // Filter report data based on client type
  const filteredReportData = useMemo(() => {
    if (!reportData) return null;

    if (clientTypeFilter === 'all') {
      return reportData;
    } else if (clientTypeFilter === 'vip') {
      return {
        ...reportData,
        regularClients: [], // Hide regular clients
      };
    } else if (clientTypeFilter === 'regular') {
      return {
        ...reportData,
        doctors: [], // Hide VIP clients
      };
    }
    return reportData;
  }, [reportData, clientTypeFilter]);

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
            <div className="quick-stat-card">
              <div className="quick-stat-icon" style={{ background: '#3b82f615', color: '#3b82f6' }}>
                <FileText size={24} />
              </div>
              <div className="quick-stat-content">
                <div className="quick-stat-label">Reports Generated</div>
                <div className="quick-stat-value">{reportStats.totalReports}</div>
              </div>
            </div>
            <div className="quick-stat-card">
              <div className="quick-stat-icon" style={{ background: '#8b5cf615', color: '#8b5cf6' }}>
                <CalendarClock size={24} />
              </div>
              <div className="quick-stat-content">
                <div className="quick-stat-label">Scheduled Reports</div>
                <div className="quick-stat-value">{reportStats.scheduledCount}</div>
              </div>
            </div>
            <div className="quick-stat-card">
              <div className="quick-stat-icon" style={{ background: '#f59e0b15', color: '#f59e0b' }}>
                <Zap size={24} />
              </div>
              <div className="quick-stat-content">
                <div className="quick-stat-label">Avg. Generation Time</div>
                <div className="quick-stat-value">{reportStats.avgTime}</div>
              </div>
            </div>
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
                      <Plus size={12} />
                      Click to generate
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
                  <p>Generate individual BDM performance reports with GPS verification</p>
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
                    <label>BDM</label>
                    <select
                      className="bdm-select"
                      value={selectedBdm}
                      onChange={(e) => {
                        setSelectedBdm(e.target.value);
                        setReportGenerated(false);
                        setReportData(null);
                      }}
                    >
                      <option value="">Select BDM</option>
                      {realBdms.map((bdm) => (
                        <option key={bdm._id} value={bdm._id}>
                          {bdm.name}
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
                  <div className="bdm-control-group">
                    <label>Client Type</label>
                    <select
                      className="bdm-select"
                      value={clientTypeFilter}
                      onChange={(e) => setClientTypeFilter(e.target.value)}
                    >
                      <option value="all">All (VIP + Regular)</option>
                      <option value="vip">VIP Only</option>
                      <option value="regular">Regular Only</option>
                    </select>
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

                {/* Report Content */}
                {reportLoading ? (
                  <div className="bdm-empty-state">
                    <div className="bdm-empty-icon">
                      <RefreshCw size={28} style={{ animation: 'spin 1s linear infinite' }} />
                    </div>
                    <h3>Generating Report...</h3>
                    <p>Fetching visit data for the selected BDM and month</p>
                  </div>
                ) : !reportGenerated ? (
                  <div className="bdm-empty-state">
                    <div className="bdm-empty-icon">
                      <BarChart3 size={28} />
                    </div>
                    <h3>No Report Generated</h3>
                    <p>Select a BDM and month, then click &quot;Generate Report&quot;</p>
                  </div>
                ) : (
                  <EmployeeVisitReport
                    reportData={filteredReportData}
                    monthYear={selectedMonth}
                  />
                )}
              </div>
            )}
          </div>

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
                    <label>BDM</label>
                    <select
                      className="bdm-select"
                      value={cptBdmId}
                      onChange={(e) => {
                        setCptBdmId(e.target.value);
                        setCptData(null);
                        setCptCycleNumber(null);
                      }}
                    >
                      <option value="">Select BDM</option>
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
                        Cycle {(cptData?.displayCycleNumber ?? cptData?.cycleNumber ?? cptCycleNumber ?? 0) + 1}
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
                    <p>Select a BDM to view their Call Plan</p>
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
                <span className="badge">{reports.length}</span>
              </button>
              <button
                className={`tab-btn ${activeTab === 'scheduled' ? 'active' : ''}`}
                onClick={() => setActiveTab('scheduled')}
              >
                <CalendarClock size={16} />
                Scheduled Reports
                <span className="badge">{scheduledReports.length}</span>
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
                  {reportsLoading ? (
                    <div className="empty-state">
                      <div className="empty-state-icon">
                        <RefreshCw size={28} style={{ animation: 'spin 1s linear infinite' }} />
                      </div>
                      <h3>Loading reports...</h3>
                    </div>
                  ) : filteredReports.length === 0 ? (
                    <div className="empty-state">
                      <div className="empty-state-icon">
                        <FileText size={28} />
                      </div>
                      <h3>No reports found</h3>
                      <p>{searchQuery ? 'Try adjusting your search' : 'Generate a report using the Report Types above'}</p>
                    </div>
                  ) : (
                    <div className="table-wrapper">
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
                              <tr key={report._id}>
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
                                      <div className="report-meta">by {report.generatedBy?.name || 'System'}</div>
                                    </div>
                                  </div>
                                </td>
                                <td>{new Date(report.createdAt).toLocaleString()}</td>
                                <td>
                                  <span className={`format-badge ${report.format}`}>
                                    {report.format === 'csv' && <FileText size={12} />}
                                    {report.format === 'excel' && <FileSpreadsheet size={12} />}
                                    {report.format === 'csv' ? 'CSV' : 'Excel'}
                                  </span>
                                </td>
                                <td>{report.fileSize || '—'}</td>
                                <td>
                                  <span className={`status-badge ${report.status}`}>
                                    {report.status === 'ready' && <><CheckCircle size={12} /> Ready</>}
                                    {report.status === 'generating' && <><RefreshCw size={12} /> Generating</>}
                                    {report.status === 'failed' && <><Clock size={12} /> Failed</>}
                                  </span>
                                </td>
                                <td>
                                  <div className="action-btns">
                                    {report.status === 'ready' && (
                                      <button
                                        className="action-btn download"
                                        title="Download"
                                        onClick={() => handleDownload(report)}
                                      >
                                        <Download size={16} />
                                      </button>
                                    )}
                                    <button
                                      className="action-btn delete"
                                      title="Delete"
                                      onClick={() => handleDelete(report._id)}
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
                    </div>
                  )}
                </>
              )}

              {/* Scheduled Reports Tab */}
              {activeTab === 'scheduled' && (
                <>
                  {scheduledReports.length === 0 ? (
                    <div className="empty-state">
                      <div className="empty-state-icon">
                        <CalendarClock size={28} />
                      </div>
                      <h3>No scheduled reports</h3>
                      <p>Create a report with scheduling enabled to see it here</p>
                    </div>
                  ) : (
                    <div className="table-wrapper">
                      <table className="reports-table">
                        <thead>
                          <tr>
                            <th>Report Name</th>
                            <th>Frequency</th>
                            <th>Next Run</th>
                            <th>Last Run</th>
                            <th>Status</th>
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {scheduledReports.map((scheduled) => {
                            const typeInfo = getReportTypeInfo(scheduled.type);
                            const TypeIcon = typeInfo.icon;
                            return (
                              <tr key={scheduled._id}>
                                <td>
                                  <div className="report-name-cell">
                                    <div
                                      className="report-icon-small"
                                      style={{ background: typeInfo.bgColor, color: typeInfo.color }}
                                    >
                                      <TypeIcon size={16} />
                                    </div>
                                    <div>
                                      <div className="report-name">{scheduled.name}</div>
                                      <div className="report-meta">{typeInfo.name}</div>
                                    </div>
                                  </div>
                                </td>
                                <td>
                                  <span style={{ fontWeight: 500, textTransform: 'capitalize' }}>{scheduled.frequency}</span>
                                </td>
                                <td>{scheduled.nextRunAt ? new Date(scheduled.nextRunAt).toLocaleString() : '—'}</td>
                                <td>
                                  {scheduled.lastRunAt ? (
                                    <span>
                                      {new Date(scheduled.lastRunAt).toLocaleString()}
                                      {scheduled.lastRunStatus && (
                                        <span className={`status-badge ${scheduled.lastRunStatus === 'success' ? 'ready' : 'failed'}`} style={{ marginLeft: 8 }}>
                                          {scheduled.lastRunStatus === 'success' ? <CheckCircle size={10} /> : <Clock size={10} />}
                                        </span>
                                      )}
                                    </span>
                                  ) : '—'}
                                </td>
                                <td>
                                  <span
                                    className={`status-badge ${scheduled.status}`}
                                    style={{ cursor: 'pointer' }}
                                    onClick={() => handleToggleScheduledStatus(scheduled)}
                                    title={`Click to ${scheduled.status === 'active' ? 'pause' : 'resume'}`}
                                  >
                                    {scheduled.status === 'active' ? (
                                      <><CheckCircle size={12} /> Active</>
                                    ) : (
                                      <><Clock size={12} /> Paused</>
                                    )}
                                  </span>
                                </td>
                                <td>
                                  <div className="action-btns">
                                    <button
                                      className="action-btn"
                                      title="Run Now"
                                      onClick={() => handleRunScheduledNow(scheduled._id)}
                                    >
                                      <RefreshCw size={16} />
                                    </button>
                                    <button
                                      className="action-btn delete"
                                      title="Delete"
                                      onClick={() => handleDeleteScheduled(scheduled._id)}
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
                    </div>
                  )}
                </>
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