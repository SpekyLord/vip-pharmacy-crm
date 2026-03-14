/**
 * StatisticsPage Component
 *
 * Dedicated statistics page for compliance monitoring (Task 2.1)
 * Separated from main dashboard to avoid clutter.
 *
 * Features:
 * - Tabbed interface with three sections
 * - Overview: High-level metrics and monthly trends
 * - Behind-Schedule: BDM compliance tracking table
 * - Alerts: Quota dumping and irregularity detection
 * - Notify Modal: Send alerts to non-compliant BDMs
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
  UserCheck,
  ChevronLeft,
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
} from 'recharts';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import DCRSummaryTable from '../../components/employee/DCRSummaryTable';
import scheduleService from '../../services/scheduleService';
import userService from '../../services/userService';
import visitService from '../../services/visitService';

/* Mock data removed — now fetched from real APIs */

/* =============================================================================
   STYLES
   Inline CSS following project conventions.
   Color scheme aligned with reference design (green primary accent).
   ============================================================================= */

const statisticsPageStyles = `
  :root {
    --page-bg: #eef2f6;
    --card-bg: #ffffff;
    --ink-900: #111827;
    --ink-700: #374151;
    --ink-500: #6b7280;
    --line-200: #e5e7eb;
    --accent: #22c55e;
    --accent-strong: #16a34a;
    --secondary: #facc15;
    --secondary-strong: #eab308;
    --shadow-soft: 0 8px 24px rgba(15, 23, 42, 0.08);
    --shadow-hover: 0 14px 36px rgba(15, 23, 42, 0.12);
  }

  /* ===== DARK MODE ===== */
  body.dark-mode .statistics-layout {
    --page-bg: #0b1220;
    --card-bg: #0f172a;
    --ink-900: #f1f5f9;
    --ink-700: #e2e8f0;
    --ink-500: #94a3b8;
    --line-200: #1e293b;
    --shadow-soft: none;
    --shadow-hover: none;
    background: #0b1220;
  }

  /* Dark-mode fixes for elements that used fixed light colors */
  body.dark-mode .statistics-layout .refresh-btn:hover {
    background: rgba(255, 255, 255, 0.06);
    border-color: #334155;
  }

  body.dark-mode .statistics-layout .tabs-container {
    border-color: var(--line-200);
  }

  body.dark-mode .statistics-layout .tabs-header {
    background: rgba(255, 255, 255, 0.03);
      background: transparent;
  }

  body.dark-mode .statistics-layout .tab-btn:hover {
    background: rgba(255, 255, 255, 0.06);
    color: var(--ink-700);
  }

  body.dark-mode .statistics-layout .tab-btn.active {
    background: rgba(255, 255, 255, 0.08);
    border-color: var(--line-200);
    box-shadow: none;
  }

  body.dark-mode .statistics-layout .stat-card,
  body.dark-mode .statistics-layout .chart-card,
  body.dark-mode .statistics-layout .alert-card {
    border-color: var(--line-200);
    box-shadow: none;
  }

  body.dark-mode .statistics-layout .risk-factor-item {
    background: rgba(255, 255, 255, 0.03);
    border-color: var(--line-200);
  }

  body.dark-mode .statistics-layout .search-box {
    background: rgba(255, 255, 255, 0.03);
  }

  body.dark-mode .statistics-layout .search-box input {
    color: var(--ink-700);
  }

  body.dark-mode .statistics-layout .search-box input::placeholder {
    color: var(--ink-500);
  }

  body.dark-mode .statistics-layout .filter-select {
    background: rgba(255, 255, 255, 0.03);
    color: var(--ink-700);
    border-color: var(--line-200);
  }

  body.dark-mode .statistics-layout .data-table th {
    background: rgba(255, 255, 255, 0.08);
    color: var(--ink-700);
    border-bottom-color: var(--line-200);
  }

  body.dark-mode .statistics-layout .data-table-container {
    background: var(--card-bg);
    border: 1px solid var(--line-200);
    border-radius: 14px;
    overflow: hidden;
  }

  body.dark-mode .statistics-layout .data-table {
    background: transparent;
    box-shadow: none;
    border-radius: 0;
    overflow: visible;
  }

  body.dark-mode .statistics-layout .data-table tbody tr:nth-child(even) {
    background: rgba(255, 255, 255, 0.02);
  }

  body.dark-mode .statistics-layout .data-table td {
    color: var(--ink-700);
    border-bottom-color: var(--line-200);
  }

  body.dark-mode .statistics-layout .data-table tbody tr:hover {
    background: transparent;
  }

  body.dark-mode .statistics-layout .last-visit {
    color: var(--ink-500);
  }

  body.dark-mode .statistics-layout .employee-email,
  body.dark-mode .statistics-layout .progress-text,
  body.dark-mode .statistics-layout .alert-timestamp,
  body.dark-mode .statistics-layout .char-count {
    color: var(--ink-500);
  }

  body.dark-mode .statistics-layout .alert-description {
    color: var(--ink-700);
  }

  body.dark-mode .statistics-layout .alert-visits {
    background: rgba(255, 255, 255, 0.03);
      background: transparent;
  }

  body.dark-mode .statistics-layout .alert-visits-title {
    color: var(--ink-500);
  }

  body.dark-mode .statistics-layout .alert-visit-tag {
    background: rgba(255, 255, 255, 0.03);
    border-color: var(--line-200);
    color: var(--ink-700);
  }

  body.dark-mode .statistics-layout .btn-secondary {
    background: rgba(255, 255, 255, 0.06);
    border-color: var(--line-200);
    color: var(--ink-700);
  }

  body.dark-mode .statistics-layout .btn-secondary:hover {
    background: rgba(255, 255, 255, 0.1);
  }

  body.dark-mode .statistics-layout .modal-header {
    border-bottom-color: var(--line-200);
  }

  body.dark-mode .statistics-layout .modal-header h3 {
    color: var(--ink-900);
  }

  body.dark-mode .statistics-layout .modal-close {
    background: rgba(255, 255, 255, 0.06);
    color: var(--ink-500);
  }

  body.dark-mode .statistics-layout .modal-close:hover {
    background: rgba(255, 255, 255, 0.1);
    color: var(--ink-700);
  }

  body.dark-mode .statistics-layout .channel-badge {
    background: rgba(255, 255, 255, 0.06);
    color: var(--ink-700);
  }

  body.dark-mode .statistics-layout .form-group label {
    color: var(--ink-700);
  }

  body.dark-mode .statistics-layout .form-group textarea {
    background: rgba(255, 255, 255, 0.03);
    border-color: var(--line-200);
    color: var(--ink-900);
  }

  body.dark-mode .statistics-layout .form-group textarea::placeholder {
    color: var(--ink-500);
  }

  body.dark-mode .statistics-layout .modal-footer {
    background: rgba(255, 255, 255, 0.03);
    border-top-color: var(--line-200);
  }

  body.dark-mode .statistics-layout .cycle-nav-btn {
    background: rgba(255, 255, 255, 0.03);
    border-color: var(--line-200);
    color: var(--ink-700);
  }

  body.dark-mode .statistics-layout .cycle-nav-btn:hover {
    background: rgba(255, 255, 255, 0.08);
    border-color: #334155;
  }

  body.dark-mode .statistics-layout .cycle-nav-label,
  body.dark-mode .statistics-layout .status-bar-item {
    color: var(--ink-700);
  }

  body.dark-mode .statistics-layout .coverage-row,
  body.dark-mode .statistics-layout .eng-type-row {
    border-bottom-color: var(--line-200);
  }

  body.dark-mode .statistics-layout .progress-bar-bg,
  body.dark-mode .statistics-layout .coverage-bar-bg,
  body.dark-mode .statistics-layout .eng-type-bar-bg {
    background: rgba(255, 255, 255, 0.08);
  }

  body.dark-mode .statistics-layout .empty-state-icon {
    background: rgba(255, 255, 255, 0.06);
    color: var(--ink-500);
  }

  /* Layout */
  .statistics-layout {
    min-height: 100vh;
    background: radial-gradient(1200px 600px at 20% -10%, #dff7ea 0%, rgba(223, 247, 234, 0) 60%),
      radial-gradient(800px 500px at 110% 10%, #fff7d1 0%, rgba(255, 247, 209, 0) 65%),
      var(--page-bg);
    font-family: 'Manrope', 'Sora', 'Segoe UI', system-ui, -apple-system, sans-serif;
    color: var(--ink-700);
    overflow-x: hidden;
  }

  .statistics-content {
    display: flex;
    min-width: 0;
  }

  .statistics-main {
    flex: 1;
    padding: 28px 32px 40px;
    max-width: 1400px;
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
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
    color: var(--ink-900);
    display: flex;
    align-items: center;
    gap: 12px;
    letter-spacing: -0.01em;
  }

  .page-header-icon {
    width: 38px;
    height: 38px;
    background: linear-gradient(135deg, var(--accent), var(--accent-strong));
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    box-shadow: 0 8px 16px rgba(34, 197, 94, 0.25);
  }

  .refresh-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 16px;
    background: var(--card-bg);
    border: 1px solid var(--line-200);
    border-radius: 12px;
    font-size: 14px;
    color: var(--ink-700);
    cursor: pointer;
    transition: all 0.2s;
    box-shadow: 0 6px 14px rgba(15, 23, 42, 0.06);
  }

  .refresh-btn:hover {
    background: #f8fafc;
    border-color: #d1d5db;
    transform: translateY(-1px);
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
    background: var(--card-bg);
    border-radius: 18px;
    box-shadow: var(--shadow-soft);
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.7);
    max-width: 100%;
  }

  .tabs-header {
    display: flex;
    border-bottom: 1px solid var(--line-200);
    background: #f6f8fb;
    padding: 10px;
    gap: 8px;
    flex-wrap: wrap;
  }

  .tab-btn {
    flex: 0 0 auto;
    padding: 10px 16px;
    background: transparent;
    border: 1px solid transparent;
    font-size: 14px;
    font-weight: 500;
    color: var(--ink-500);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    transition: all 0.2s;
    position: relative;
    border-radius: 10px;
    min-width: 180px;
  }

  .tab-btn:hover {
    color: var(--ink-700);
    background: #eef2f7;
  }

  .tab-btn.active {
    color: var(--accent-strong);
    background: #ffffff;
    font-weight: 600;
    border-color: #e5e7eb;
    box-shadow: 0 8px 18px rgba(15, 23, 42, 0.08);
  }

  .tab-btn.active::after {
    content: none;
  }

  .tab-badge {
    background: #fff1f2;
    color: #dc2626;
    font-size: 11px;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 10px;
    min-width: 20px;
    text-align: center;
  }

  .tab-badge.warning {
    background: #fef9c3;
    color: #b45309;
  }

  .tabs-content {
    padding: 26px;
    max-width: 100%;
    overflow-x: hidden;
  }

  /* Overview Tab Styles */

  .overview-layout {
    display: grid;
    gap: 20px;
  }

  .overview-shell {
    display: grid;
    grid-template-columns: 2.2fr 1fr;
    gap: 20px;
    align-items: start;
    min-width: 0;
  }

  .overview-left,
  .overview-right {
    display: grid;
    gap: 18px;
    min-width: 0;
  }

  .overview-main-chart {
    min-height: 320px;
  }

  .overview-top-row {
    display: grid;
    grid-template-columns: 2fr 1fr;
    gap: 18px;
  }

  .overview-bottom-row {
    display: grid;
    grid-template-columns: 2fr 1fr;
    gap: 18px;
  }

  .overview-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 18px;
  }

  @media (max-width: 1200px) {
    .overview-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  @media (max-width: 768px) {
    .overview-shell {
      grid-template-columns: 1fr;
    }
    .overview-grid {
      grid-template-columns: 1fr;
    }
  }

  .stat-card {
    background: var(--card-bg);
    border-radius: 16px;
    padding: 20px;
    border: 1px solid #edf2f7;
    transition: all 0.2s;
    box-shadow: 0 10px 18px rgba(15, 23, 42, 0.06);
    position: relative;
    overflow: hidden;
  }

  .stat-card:hover {
    transform: translateY(-3px);
    box-shadow: var(--shadow-hover);
  }


  .stat-card-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 12px;
  }

  .stat-card-icon {
    width: 46px;
    height: 46px;
    border-radius: 12px;
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
    background: #fef9c3;
    color: #b45309;
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
    color: var(--ink-900);
    line-height: 1.2;
  }

  .stat-card-label {
    font-size: 14px;
    color: var(--ink-500);
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
    gap: 18px;
    margin-bottom: 24px;
  }

  @media (max-width: 1024px) {
    .charts-grid {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 1100px) {
    .overview-shell {
      grid-template-columns: 1fr;
    }
  }

  .chart-card {
    background: var(--card-bg);
    border-radius: 16px;
    padding: 20px;
    border: 1px solid #edf2f7;
    box-shadow: 0 10px 18px rgba(15, 23, 42, 0.06);
    max-width: 100%;
    position: relative;
    min-width: 0;
  }

  .chart-card.compact {
    padding: 18px;
  }

  .chart-card.scroll-safe {
    overflow-x: auto;
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
    color: var(--ink-900);
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
    border-radius: 10px;
    border: 1px solid #f3f4f6;
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
    color: var(--ink-900);
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
    border: 1px solid var(--line-200);
    border-radius: 12px;
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
    border: 1px solid var(--line-200);
    border-radius: 12px;
    font-size: 14px;
    color: var(--ink-700);
    background: white;
    cursor: pointer;
    min-width: 150px;
  }

  .filter-select:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 0 3px rgba(250, 204, 21, 0.2);
  }

  /* Data Table */
  .data-table-container {
    overflow-x: auto;
    max-width: 100%;
  }

  .data-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 14px;
    min-width: 720px;
  }

  .data-table th {
    text-align: left;
    padding: 14px 16px;
    background: #f7f9fc;
    font-weight: 600;
    color: var(--ink-700);
    border-bottom: 1px solid var(--line-200);
    white-space: nowrap;
  }

  .data-table thead tr:hover {
    background: transparent;
  }

  .data-table td {
    padding: 14px 16px;
    border-bottom: 1px solid #f3f4f6;
    color: var(--ink-700);
  }

  .data-table tbody tr {
    transition: background 0.15s;
  }

  .data-table tbody tr:hover {
    background: transparent;
  }

  .employee-cell {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .employee-name {
    font-weight: 600;
    color: var(--ink-900);
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
    background: linear-gradient(135deg, var(--accent), var(--accent-strong));
    color: white;
  }

  .btn-primary:hover {
    background: linear-gradient(135deg, var(--accent-strong), #15803d);
    transform: translateY(-1px);
    box-shadow: 0 6px 16px rgba(34, 197, 94, 0.3);
  }

  .btn-secondary {
    background: #f1f5f9;
    color: var(--ink-700);
    border: 1px solid var(--line-200);
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
    background: var(--card-bg);
    border: 1px solid #edf2f7;
    border-radius: 16px;
    padding: 20px;
    transition: all 0.2s;
    box-shadow: 0 10px 18px rgba(15, 23, 42, 0.06);
    position: relative;
    overflow: hidden;
  }

  .alert-card:hover {
    box-shadow: var(--shadow-hover);
  }

  .alert-card::after {
    content: '';
    position: absolute;
    top: -20px;
    right: -20px;
    width: 120px;
    height: 120px;
    background: radial-gradient(circle at 30% 30%, rgba(59, 130, 246, 0.18), rgba(59, 130, 246, 0));
    pointer-events: none;
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
    color: var(--ink-900);
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
    background: var(--card-bg);
    border-radius: 18px;
    width: 90%;
    max-width: 520px;
    max-height: 90vh;
    overflow-y: auto;
    animation: slideUp 0.3s ease;
    box-shadow: 0 18px 40px rgba(15, 23, 42, 0.2);
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
    background: linear-gradient(135deg, #f0fdf4, #fff7d1);
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    padding: 16px;
    margin-bottom: 20px;
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .notify-recipient-icon {
    width: 40px;
    height: 40px;
    background: linear-gradient(135deg, var(--accent), var(--secondary));
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
    color: var(--ink-700);
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
    border-color: var(--accent);
    box-shadow: 0 0 0 3px rgba(250, 204, 21, 0.2);
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
    border-radius: 0 0 18px 18px;
  }

  /* Empty State */
  .empty-state {
    text-align: center;
    padding: 48px 24px;
    color: var(--ink-500);
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
    color: var(--ink-700);
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
    border-radius: 12px;
    margin-bottom: 24px;
    display: flex;
    align-items: center;
    gap: 10px;
    border: 1px solid #fecaca;
  }

  /* Toast Success */
  .toast-success {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 16px;
    background: #dcfce7;
    border: 1px solid #bbf7d0;
    border-radius: 10px;
    color: #16a34a;
    font-size: 14px;
    margin-bottom: 16px;
    animation: slideIn 0.3s ease;
  }

  @keyframes slideIn {
    from { transform: translateX(-20px); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }

  /* BDM Performance Tab */
  .bdm-controls {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 24px;
    flex-wrap: wrap;
    gap: 12px;
  }

  .cycle-nav {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .cycle-nav-btn {
    width: 36px;
    height: 36px;
    border-radius: 8px;
    border: 1px solid #e5e7eb;
    background: white;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    color: #374151;
    transition: all 0.2s;
  }

  .cycle-nav-btn:hover {
    background: #f3f4f6;
    border-color: #d1d5db;
  }

  .cycle-nav-label {
    font-size: 15px;
    font-weight: 600;
    color: #1f2937;
    min-width: 90px;
    text-align: center;
  }

  .status-bar {
    display: flex;
    gap: 16px;
    flex-wrap: wrap;
    margin-bottom: 24px;
  }

  .status-bar-item {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
    color: #374151;
    font-weight: 500;
  }

  .status-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
  }

  .status-dot.completed { background: #22c55e; }
  .status-dot.planned { background: #3b82f6; }
  .status-dot.carried { background: #f59e0b; }
  .status-dot.missed { background: #ef4444; }

  .bdm-two-col {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
    margin-top: 24px;
  }

  @media (max-width: 900px) {
    .bdm-two-col {
      grid-template-columns: 1fr;
    }
  }

  .coverage-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 0;
    border-bottom: 1px solid #f3f4f6;
    font-size: 14px;
  }

  .coverage-row:last-child {
    border-bottom: none;
    font-weight: 600;
  }

  .coverage-bar-bg {
    width: 100px;
    height: 8px;
    background: #e5e7eb;
    border-radius: 4px;
    overflow: hidden;
    margin: 0 12px;
    flex-shrink: 0;
  }

  .coverage-bar-fill {
    height: 100%;
    border-radius: 4px;
    background: linear-gradient(90deg, #22c55e, #16a34a);
    transition: width 0.3s ease;
  }

  .eng-type-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 0;
    border-bottom: 1px solid #f3f4f6;
    font-size: 14px;
  }

  .eng-type-row:last-child {
    border-bottom: none;
  }

  .eng-type-bar-bg {
    flex: 1;
    height: 8px;
    background: #e5e7eb;
    border-radius: 4px;
    overflow: hidden;
    margin: 0 12px;
  }

  .eng-type-bar-fill {
    height: 100%;
    border-radius: 4px;
    transition: width 0.3s ease;
  }

  @media (max-width: 768px) {
    .bdm-controls {
      flex-direction: column;
      align-items: stretch;
    }
    .bdm-controls .filter-select {
      width: 100%;
    }
    .data-table {
      min-width: 640px;
    }
  }

  @media (max-width: 480px) {
    .statistics-main {
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
    .tabs-header {
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
    }
    .tab-btn {
      padding: 12px 14px;
      font-size: 13px;
      white-space: nowrap;
    }
    .tabs-content {
      padding: 16px;
    }
    .overview-grid,
    .charts-grid {
      grid-template-columns: 1fr;
      gap: 12px;
    }
    .chart-card {
      padding: 14px;
      overflow-x: auto;
    }
    .stat-card-value {
      font-size: 24px;
    }
    .table-controls {
      flex-direction: column;
      align-items: stretch;
    }
    .search-box {
      min-width: unset;
      width: 100%;
    }
    .filter-select {
      min-width: unset;
      width: 100%;
      min-height: 44px;
    }
    .search-box input {
      min-height: 44px;
    }
    .data-table {
      min-width: 560px;
    }
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

  // State: Data from API
  const [overviewStats, setOverviewStats] = useState(null);
  const [behindScheduleEmployees, setBehindScheduleEmployees] = useState([]);
  const [quotaDumpingAlerts, setQuotaDumpingAlerts] = useState([]);

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

  // State: BDM Performance tab
  const [bdmEmployees, setBdmEmployees] = useState([]);
  const [selectedBdmId, setSelectedBdmId] = useState('');
  const [bdmCycleNumber, setBdmCycleNumber] = useState(null);
  const [bdmDcrSummary, setBdmDcrSummary] = useState([]);
  const [bdmDcrTotal, setBdmDcrTotal] = useState({});
  const [bdmSummary, setBdmSummary] = useState({});
  const [bdmDoctors, setBdmDoctors] = useState([]);
  const [bdmLoading, setBdmLoading] = useState(false);

  /* ---------------------------------------------------------------------------
     Data Fetching — real API calls
     --------------------------------------------------------------------------- */

  const fetchAllData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch employees, compliance alerts, and quota dumping in parallel
      const [empRes, complianceRes, alertsRes] = await Promise.all([
        userService.getEmployees({ limit: 0 }),
        visitService.getComplianceAlerts(),
        visitService.getQuotaDumpingAlerts(),
      ]);

      const employees = empRes.data || [];
      setBdmEmployees(employees);

      // Map compliance alerts to behind-schedule table shape
      const complianceData = (complianceRes.data || []).map((item, idx) => ({
        _id: item.employee?._id || `comp-${idx}`,
        userId: item.employee?._id,
        name: item.employee?.name || 'Unknown',
        email: item.employee?.email || '',
        region: '',
        weeklyTarget: item.expectedByNow || 0,
        completedVisits: item.actualVisits || 0,
        percentage: item.percentageComplete || 0,
        status: (item.percentageComplete || 0) >= 80 ? 'on-track' : 'behind',
      }));
      setBehindScheduleEmployees(complianceData);

      // Set quota dumping alerts
      setQuotaDumpingAlerts(alertsRes.data || []);

      // Derive overview stats from bulk CPT grid summary (single API call)
      let totalTarget = 0;
      let totalActual = 0;
      let onTrack = 0;
      let behind = 0;
      const perBdmCallRates = [];

      const cptSummaryRes = await scheduleService.getCPTGridSummary().catch(() => ({ data: [] }));
      const cptResults = cptSummaryRes.data || [];

      cptResults.forEach((bdm) => {
        const target = bdm.dcrTotal?.targetEngagements || 0;
        const actual = bdm.dcrTotal?.totalEngagements || 0;
        const rate = bdm.dcrTotal?.callRate || 0;
        totalTarget += target;
        totalActual += actual;
        if (rate >= 80) onTrack++;
        else behind++;
        perBdmCallRates.push({
          name: bdm.firstName || bdm.name?.split(' ')[0] || 'BDM',
          callRate: rate,
        });
      });

      const totalComplianceRate = totalTarget > 0
        ? Math.round((totalActual / totalTarget) * 100 * 10) / 10
        : 0;

      setOverviewStats({
        totalComplianceRate,
        totalEmployees: employees.length,
        onTrackEmployees: onTrack,
        behindScheduleEmployees: behind,
        criticalAlerts: (alertsRes.data || []).length,
        totalVisitsThisMonth: totalActual,
        targetVisitsThisMonth: totalTarget,
        perBdmCallRates,
      });

    } catch {
      setError('Failed to load compliance data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllData();
  }, []);

  // Employee list is fetched in fetchAllData above

  // Fetch DCR data when BDM or cycle changes
  useEffect(() => {
    if (!selectedBdmId) return;
    const fetchBdmDcr = async () => {
      setBdmLoading(true);
      try {
        const response = await scheduleService.getCPTGrid(bdmCycleNumber, selectedBdmId);
        const data = response.data;
        setBdmDcrSummary(data.dcrSummary || []);
        setBdmDcrTotal(data.dcrTotal || {});
        setBdmSummary(data.summary || {});
        setBdmDoctors(data.doctors || []);
        if (bdmCycleNumber == null && data.cycleNumber != null) {
          setBdmCycleNumber(data.cycleNumber);
        }
      } catch (err) {
        console.error('Failed to fetch BDM DCR:', err);
        setBdmDcrSummary([]);
        setBdmDcrTotal({});
        setBdmSummary({});
        setBdmDoctors([]);
      } finally {
        setBdmLoading(false);
      }
    };
    fetchBdmDcr();
  }, [selectedBdmId, bdmCycleNumber]);

  /* ---------------------------------------------------------------------------
     Filtered BDMs
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

  const handleRefresh = () => {
    fetchAllData();
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
      const res = await fetch(`/api/messages/notify`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipientUserId: selectedEmployee.userId, // ✅ real Mongo user id
          recipientRole: "employee",
          category: "system",
          priority: "important",
          title: "Compliance Alert",
          body: notifyMessage?.trim() || `Hi ${selectedEmployee.name}, please review your compliance status and submit pending visits.`,
        }),
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || "Failed to send alert");
      }

      setNotifySuccess(true);

      setTimeout(() => {
        handleCloseModal();
      }, 2000);

    } catch (err) {
      console.error("Failed to send notification:", err);
      setNotifySuccess(false);
      // optional: setError(String(err?.message || "Failed to send alert"));
    } finally {
      setNotifySending(false);
    }
  };

  const handleBdmChange = (e) => {
    setSelectedBdmId(e.target.value);
    setBdmCycleNumber(null);
    setBdmDcrSummary([]);
    setBdmDcrTotal({});
    setBdmSummary({});
    setBdmDoctors([]);
  };

  const handleBdmCycleChange = (delta) => {
    setBdmCycleNumber((prev) => (prev != null ? prev + delta : delta));
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
                Behind-Schedule BDMs
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
              <button
                className={`tab-btn ${activeTab === 'bdm-performance' ? 'active' : ''}`}
                onClick={() => setActiveTab('bdm-performance')}
              >
                <UserCheck size={18} />
                BDM Performance
              </button>
            </div>

            {/* Tab Content */}
            <div className="tabs-content">
              {/* Overview Tab */}
              {activeTab === 'overview' && overviewStats && (
                <OverviewTab
                  stats={overviewStats}
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

              {/* BDM Performance Tab */}
              {activeTab === 'bdm-performance' && (
                <BDMPerformanceTab
                  employees={bdmEmployees}
                  selectedBdmId={selectedBdmId}
                  onBdmChange={handleBdmChange}
                  cycleNumber={bdmCycleNumber}
                  onCycleChange={handleBdmCycleChange}
                  dcrSummary={bdmDcrSummary}
                  dcrTotal={bdmDcrTotal}
                  summary={bdmSummary}
                  doctors={bdmDoctors}
                  loading={bdmLoading}
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
   High-level metrics and per-BDM call rate chart.
   ============================================================================= */

const OverviewTab = ({ stats }) => {
  // Prepare pie chart data: on-track vs behind BDMs
  const statusPieData = [
    { name: 'On Track', value: stats.onTrackEmployees },
    { name: 'Behind', value: stats.behindScheduleEmployees },
  ];
  const STATUS_PIE_COLORS = [CHART_COLORS.primary, CHART_COLORS.danger];

  return (
    <div className="overview-layout">
      <div className="overview-shell">
        <div className="overview-left">
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
                  {stats.totalComplianceRate}%
                </div>
              </div>
              <div className="stat-card-value">{stats.totalComplianceRate}%</div>
              <div className="stat-card-label">Overall Call Rate</div>
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
              <div className="stat-card-sublabel">of {stats.totalEmployees} BDMs</div>
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

            {/* Quota Dumping Alerts */}
            <div className="stat-card">
              <div className="stat-card-header">
                <div className="stat-card-icon yellow">
                  <AlertTriangle size={22} />
                </div>
              </div>
              <div className="stat-card-value">{stats.criticalAlerts}</div>
              <div className="stat-card-label">Quota Dumping Alerts</div>
              <div className="stat-card-sublabel">Pending review</div>
            </div>
          </div>

          <div className="chart-card overview-main-chart">
            <div className="chart-card-header">
              <div className="chart-card-title">
                <Activity size={18} />
                Per-BDM Call Rates (Current Cycle)
              </div>
            </div>
            {stats.perBdmCallRates?.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={stats.perBdmCallRates} barGap={4}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} />
                  <YAxis axisLine={false} tickLine={false} domain={[0, 100]} unit="%" />
                  <Tooltip
                    contentStyle={{
                      background: 'white',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                    }}
                    formatter={(value) => [`${value}%`, 'Call Rate']}
                  />
                  <Bar
                    dataKey="callRate"
                    fill={CHART_COLORS.primary}
                    radius={[4, 4, 0, 0]}
                    maxBarSize={50}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="empty-state">
                <p>No BDM schedule data available</p>
              </div>
            )}
          </div>
        </div>

        <div className="overview-right">
          <div className="chart-card compact">
            <div className="chart-card-header">
              <div className="chart-card-title">
                <AlertCircle size={18} />
                BDM Status
              </div>
            </div>
            {stats.totalEmployees > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie
                      data={statusPieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={70}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      {statusPieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={STATUS_PIE_COLORS[index]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                <div className="risk-factors-list">
                  <div className="risk-factor-item">
                    <div className="risk-factor-label">
                      <div className="risk-factor-dot low" />
                      <span>On Track (≥80%)</span>
                    </div>
                    <span className="risk-factor-count">{stats.onTrackEmployees}</span>
                  </div>
                  <div className="risk-factor-item">
                    <div className="risk-factor-label">
                      <div className="risk-factor-dot high" />
                      <span>Behind (&lt;80%)</span>
                    </div>
                    <span className="risk-factor-count">{stats.behindScheduleEmployees}</span>
                  </div>
                </div>
              </>
            ) : (
              <div className="empty-state">
                <p>No BDM data available</p>
              </div>
            )}
          </div>

          <div className="chart-card compact">
            <div className="chart-card-header">
              <div className="chart-card-title">
                <TrendingUp size={18} />
                Visit Progress (Current Cycle)
              </div>
            </div>
            <div style={{ padding: '8px 0 4px', display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: '28px', fontWeight: 700, color: '#1f2937' }}>{stats.totalVisitsThisMonth}</div>
                <div style={{ fontSize: '14px', color: '#6b7280' }}>Completed Engagements</div>
              </div>
              <div>
                <div style={{ fontSize: '28px', fontWeight: 700, color: '#9ca3af' }}>{stats.targetVisitsThisMonth}</div>
                <div style={{ fontSize: '14px', color: '#6b7280' }}>Target Engagements</div>
              </div>
              <div>
                <div style={{ fontSize: '28px', fontWeight: 700, color: stats.totalComplianceRate >= 80 ? '#16a34a' : '#dc2626' }}>
                  {stats.totalComplianceRate}%
                </div>
                <div style={{ fontSize: '14px', color: '#6b7280' }}>Completion Rate</div>
              </div>
            </div>
          </div>
        </div>
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
                <th>BDM</th>
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
                  {/* BDM Name & Email */}
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
                  <td className="last-visit" style={{ fontSize: '13px' }}>
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
          <h3>No BDMs Found</h3>
          <p>No BDMs match your current filters.</p>
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
    userId: alert.employeeId,
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
   COMPONENT: BDMPerformanceTab
   Admin view of any BDM's DCR Summary with metrics and engagement breakdown.
   ============================================================================= */

const ENG_TYPE_LABELS = {
  TXT_PROMATS: { label: 'TXT / Promats', color: '#3b82f6' },
  MES_VIBER_GIF: { label: 'MES / GIF', color: '#8b5cf6' },
  PICTURE: { label: 'Picture', color: '#f59e0b' },
  SIGNED_CALL: { label: 'Signed Call', color: '#22c55e' },
  VOICE_CALL: { label: 'Voice Call', color: '#ef4444' },
};

const BDMPerformanceTab = ({
  employees,
  selectedBdmId,
  onBdmChange,
  cycleNumber,
  onCycleChange,
  dcrSummary,
  dcrTotal,
  summary,
  doctors,
  loading,
}) => {
  const metrics = useMemo(() => {
    const totalTarget = dcrTotal.targetEngagements || 0;
    const totalEngagements = dcrTotal.totalEngagements || 0;
    const callRate = dcrTotal.callRate || 0;
    const rateColor = callRate >= 80 ? '#16a34a' : callRate >= 50 ? '#d97706' : '#dc2626';

    const vipCount = doctors.length;
    const freq2 = doctors.filter((d) => d.visitFrequency === 2).length;
    const freq4 = doctors.filter((d) => d.visitFrequency === 4).length;

    // Aggregate engagement types from all days
    const engTypeTotals = {};
    for (const day of dcrSummary) {
      const eb = day.engagementBreakdown || {};
      for (const [key, val] of Object.entries(eb)) {
        engTypeTotals[key] = (engTypeTotals[key] || 0) + val;
      }
    }
    const maxEngType = Math.max(1, ...Object.values(engTypeTotals));

    return { totalTarget, totalEngagements, callRate, rateColor, vipCount, freq2, freq4, engTypeTotals, maxEngType };
  }, [dcrTotal, doctors, dcrSummary]);

  // Compute schedule status counts from summary
  const completed = summary.completed || 0;
  const planned = summary.planned || 0;
  const carried = summary.carried || 0;
  const missed = summary.missed || 0;

  return (
    <div>
      {/* Controls: BDM selector + Cycle navigator */}
      <div className="bdm-controls">
        <select
          className="filter-select"
          value={selectedBdmId}
          onChange={onBdmChange}
          style={{ minWidth: 240 }}
        >
          <option value="">-- Select a BDM --</option>
          {employees.map((emp) => (
            <option key={emp._id} value={emp._id}>
              {emp.name}
            </option>
          ))}
        </select>

        {selectedBdmId && (
          <div className="cycle-nav">
            <button className="cycle-nav-btn" onClick={() => onCycleChange(-1)}>
              <ChevronLeft size={18} />
            </button>
            <span className="cycle-nav-label">
              Cycle {cycleNumber != null ? cycleNumber : '...'}
            </span>
            <button className="cycle-nav-btn" onClick={() => onCycleChange(1)}>
              <ChevronRight size={18} />
            </button>
          </div>
        )}
      </div>

      {/* Empty state: no BDM selected */}
      {!selectedBdmId && (
        <div className="empty-state">
          <div className="empty-state-icon">
            <UserCheck size={28} />
          </div>
          <h3>Select a BDM</h3>
          <p>Choose a Business Development Manager from the dropdown to view their DCR Summary and performance metrics.</p>
        </div>
      )}

      {/* Loading */}
      {selectedBdmId && loading && (
        <div style={{ textAlign: 'center', padding: '48px 0' }}>
          <LoadingSpinner />
        </div>
      )}

      {/* No schedule data */}
      {selectedBdmId && !loading && dcrSummary.length === 0 && (
        <div className="empty-state">
          <div className="empty-state-icon">
            <Calendar size={28} />
          </div>
          <h3>No Schedule Data</h3>
          <p>This BDM has no schedule data for the selected cycle.</p>
        </div>
      )}

      {/* Main content */}
      {selectedBdmId && !loading && dcrSummary.length > 0 && (
        <>
          {/* Metric Cards */}
          <div className="overview-grid">
            <div className="stat-card">
              <div className="stat-card-header">
                <div className="stat-card-icon blue">
                  <Target size={22} />
                </div>
              </div>
              <div className="stat-card-value">{metrics.totalTarget}</div>
              <div className="stat-card-label">Total Target</div>
              <div className="stat-card-sublabel">Scheduled engagements</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-header">
                <div className="stat-card-icon green">
                  <CheckCircle size={22} />
                </div>
              </div>
              <div className="stat-card-value">{metrics.totalEngagements}</div>
              <div className="stat-card-label">Total Engagements</div>
              <div className="stat-card-sublabel">Completed engagements</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-header">
                <div className="stat-card-icon" style={{ background: metrics.rateColor + '20', color: metrics.rateColor }}>
                  <Activity size={22} />
                </div>
              </div>
              <div className="stat-card-value" style={{ color: metrics.rateColor }}>{metrics.callRate}%</div>
              <div className="stat-card-label">Overall Call Rate</div>
              <div className="stat-card-sublabel">{metrics.callRate >= 80 ? 'On track' : metrics.callRate >= 50 ? 'Needs improvement' : 'Below target'}</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-header">
                <div className="stat-card-icon yellow">
                  <Users size={22} />
                </div>
              </div>
              <div className="stat-card-value">{metrics.vipCount}</div>
              <div className="stat-card-label">VIP Clients</div>
              <div className="stat-card-sublabel">{metrics.freq2} bi-weekly, {metrics.freq4} weekly</div>
            </div>
          </div>

          {/* Schedule Status Bar */}
          <div className="status-bar">
            <div className="status-bar-item">
              <span className="status-dot completed" />
              Completed: {completed}
            </div>
            <div className="status-bar-item">
              <span className="status-dot planned" />
              Planned: {planned}
            </div>
            <div className="status-bar-item">
              <span className="status-dot carried" />
              Carried: {carried}
            </div>
            <div className="status-bar-item">
              <span className="status-dot missed" />
              Missed: {missed}
            </div>
          </div>

          {/* DCR Summary Table (reused component) */}
          <DCRSummaryTable dcrSummary={dcrSummary} dcrTotal={dcrTotal} />

          {/* Two-column: VIP Coverage + Engagement Types */}
          <div className="bdm-two-col">
            {/* VIP Coverage */}
            <div className="chart-card">
              <div className="chart-card-header">
                <div className="chart-card-title">
                  <Users size={18} />
                  VIP Coverage
                </div>
              </div>
              <div className="coverage-row">
                <span>2x/month</span>
                <div className="coverage-bar-bg">
                  <div
                    className="coverage-bar-fill"
                    style={{ width: metrics.freq2 > 0 ? '100%' : '0%' }}
                  />
                </div>
                <span>{metrics.freq2} clients</span>
              </div>
              <div className="coverage-row">
                <span>4x/month</span>
                <div className="coverage-bar-bg">
                  <div
                    className="coverage-bar-fill"
                    style={{ width: metrics.freq4 > 0 ? '100%' : '0%' }}
                  />
                </div>
                <span>{metrics.freq4} clients</span>
              </div>
              <div className="coverage-row">
                <span>Total</span>
                <div className="coverage-bar-bg">
                  <div className="coverage-bar-fill" style={{ width: '100%' }} />
                </div>
                <span>{metrics.vipCount} clients</span>
              </div>
            </div>

            {/* Engagement Type Distribution */}
            <div className="chart-card">
              <div className="chart-card-header">
                <div className="chart-card-title">
                  <BarChart3 size={18} />
                  Engagement Types
                </div>
              </div>
              {Object.entries(ENG_TYPE_LABELS).map(([key, { label, color }]) => {
                const count = metrics.engTypeTotals[key] || 0;
                const pct = metrics.maxEngType > 0 ? (count / metrics.maxEngType) * 100 : 0;
                return (
                  <div key={key} className="eng-type-row">
                    <span style={{ minWidth: 90 }}>{label}</span>
                    <div className="eng-type-bar-bg">
                      <div
                        className="eng-type-bar-fill"
                        style={{ width: `${pct}%`, background: color }}
                      />
                    </div>
                    <span style={{ minWidth: 30, textAlign: 'right', fontWeight: 600 }}>{count}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
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