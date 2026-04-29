/**
 * StatisticsPage Component
 *
 * Admin statistics page with tabbed interface.
 *
 * Tabs:
 * - Overview: High-level metrics and per-BDM call rate chart
 * - BDM Performance: Individual BDM DCR Summary with engagement breakdown
 * - Programs: Program and support type implementation coverage stats
 */

import { useState, useEffect, useMemo, useRef } from 'react';
import {
  BarChart3,
  Users,
  TrendingUp,
  TrendingDown,
  Clock,
  CheckCircle,
  ChevronRight,
  Activity,
  Target,
  AlertCircle,
  Calendar,
  RefreshCw,
  UserCheck,
  ChevronLeft,
  Package,
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
  ReferenceLine,
} from 'recharts';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import PageGuide from '../../components/common/PageGuide';
import DCRSummaryTable from '../../components/employee/DCRSummaryTable';
import { useLookupOptions } from '../../erp/hooks/useLookups';
import scheduleService from '../../services/scheduleService';
import userService from '../../services/userService';
import programService from '../../services/programService';
import supportTypeService from '../../services/supportTypeService';
import visitService from '../../services/visitService';

import SelectField from '../../components/common/Select';

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

  /* Team Activity Cockpit (Apr 2026) — clickable rows need a hover affordance */
  .team-activity-table tbody tr:hover {
    background: rgba(59, 130, 246, 0.06);
  }
  body.dark-mode .statistics-layout .team-activity-table tbody tr:hover {
    background: rgba(96, 165, 250, 0.10);
  }
  .team-activity-table th {
    user-select: none;
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

/* =============================================================================
   COMPONENT: StatisticsPage
   Main parent component with tabbed interface.
   ============================================================================= */

const StatisticsPage = () => {
  const [activeTab, setActiveTab] = useState('overview');
  const [overviewStats, setOverviewStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Program Monitoring tab
  const [programStats, setProgramStats] = useState([]);
  const [supportTypeStats, setSupportTypeStats] = useState([]);

  // Products tab
  const [productStats, setProductStats] = useState([]);

  // Heatmap tab
  const [heatmapData, setHeatmapData] = useState(null);

  // Team Activity tab — Apr 2026 (COO daily-scan surface, lookup-driven thresholds)
  const [teamActivity, setTeamActivity] = useState(null);
  const [teamActivityLoading, setTeamActivityLoading] = useState(false);

  // BDM Performance tab
  const [bdmEmployees, setBdmEmployees] = useState([]);
  const [selectedBdmId, setSelectedBdmId] = useState('');
  const [bdmCycleNumber, setBdmCycleNumber] = useState(null);
  const [bdmDisplayCycleNumber, setBdmDisplayCycleNumber] = useState(null);
  const [bdmDcrSummary, setBdmDcrSummary] = useState([]);
  const [bdmDcrTotal, setBdmDcrTotal] = useState({});
  const [bdmSummary, setBdmSummary] = useState({});
  const [bdmDoctors, setBdmDoctors] = useState([]);
  const [bdmLoading, setBdmLoading] = useState(false);

  /* ---------------------------------------------------------------------------
     Data Fetching — tab-gated: only load data when a tab is first visited
     --------------------------------------------------------------------------- */

  const loadedTabsRef = useRef(new Set());

  const fetchOverviewData = async () => {
    try {
      setLoading(true);
      setError(null);

      const empRes = await userService.getEmployees({ limit: 0 });
      const employees = empRes.data || [];
      setBdmEmployees(employees);

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
          // userId carries the BDM through to the bar chart so a bar click
          // can drill into the BDM Performance tab pre-selected (Apr 29 2026).
          userId: bdm.userId,
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
        totalVisitsThisMonth: totalActual,
        targetVisitsThisMonth: totalTarget,
        perBdmCallRates,
      });
    } catch {
      setError('Failed to load statistics data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const fetchProgramsData = async () => {
    try {
      const [progStatsRes, supportStatsRes] = await Promise.all([
        programService.getStats().catch(() => ({ data: [] })),
        supportTypeService.getStats().catch(() => ({ data: [] })),
      ]);
      setProgramStats(progStatsRes.data || []);
      setSupportTypeStats(supportStatsRes.data || []);
    } catch { /* silent */ }
  };

  const fetchProductsData = async () => {
    try {
      const productStatsRes = await visitService.getProductPresentationStats().catch(() => ({ data: [] }));
      setProductStats(productStatsRes.data || []);
    } catch { /* silent */ }
  };

  const fetchHeatmapData = async () => {
    try {
      const heatmapRes = await scheduleService.getCrossBdmHeatmap().catch(() => ({ data: null }));
      setHeatmapData(heatmapRes.data || null);
    } catch { /* silent */ }
  };

  // Team Activity tab — Apr 2026. Pulls one row per active BDM with today /
  // this week / this month / cycle counts + last-visit recency + red-flag.
  // Thresholds resolved server-side from TEAM_ACTIVITY_THRESHOLDS lookup.
  const fetchTeamActivity = async () => {
    try {
      setTeamActivityLoading(true);
      const res = await scheduleService.getTeamActivity().catch(() => ({ data: null }));
      setTeamActivity(res.data || null);
    } finally {
      setTeamActivityLoading(false);
    }
  };

  // Load overview on mount
  useEffect(() => {
    loadedTabsRef.current.add('overview');
    loadedTabsRef.current.add('bdm-performance'); // employees loaded with overview
    fetchOverviewData();
  }, []);

  // Lazy-load tab data on first visit
  useEffect(() => {
    if (loadedTabsRef.current.has(activeTab)) return;
    loadedTabsRef.current.add(activeTab);

    if (activeTab === 'programs') fetchProgramsData();
    else if (activeTab === 'products') fetchProductsData();
    else if (activeTab === 'heatmap') fetchHeatmapData();
    else if (activeTab === 'team-activity') fetchTeamActivity();
  }, [activeTab]);

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
        if (data.displayCycleNumber != null) {
          setBdmDisplayCycleNumber(data.displayCycleNumber);
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
     Handlers
     --------------------------------------------------------------------------- */

  const handleRefresh = () => {
    // Reset loaded state for current tab so it re-fetches
    loadedTabsRef.current.delete(activeTab);
    if (activeTab === 'overview' || activeTab === 'bdm-performance') {
      loadedTabsRef.current.delete('overview');
      loadedTabsRef.current.delete('bdm-performance');
      fetchOverviewData();
    } else if (activeTab === 'programs') {
      fetchProgramsData();
    } else if (activeTab === 'products') {
      fetchProductsData();
    } else if (activeTab === 'heatmap') {
      fetchHeatmapData();
    } else if (activeTab === 'team-activity') {
      fetchTeamActivity();
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

  // Drill-down: clicking a BDM in the Overview bar chart (or a Team Activity
  // row) opens the BDM Performance tab pre-selected on the current cycle.
  // Resets cycle so the BDM-DCR fetch picks the freshly-computed cycle from
  // the API response (matches handleBdmChange behavior).
  const handleBdmDrillDown = (userId) => {
    if (!userId) return;
    setSelectedBdmId(userId);
    setBdmCycleNumber(null);
    setBdmDcrSummary([]);
    setBdmDcrTotal({});
    setBdmSummary({});
    setBdmDoctors([]);
    setActiveTab('bdm-performance');
  };

  /* ---------------------------------------------------------------------------
     Render
     --------------------------------------------------------------------------- */

  if (loading && !overviewStats) {
    return <LoadingSpinner fullScreen />;
  }

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
              Statistics
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

          {/* Helper Banner */}
          <PageGuide pageKey="statistics-page" />

          {/* Error Banner */}
          {error && (
            <div className="error-banner">
              <AlertCircle size={20} />
              {error}
            </div>
          )}

          {/* Tabs Container */}
          <div className="tabs-container">
            <div className="tabs-header">
              <button
                className={`tab-btn ${activeTab === 'team-activity' ? 'active' : ''}`}
                onClick={() => setActiveTab('team-activity')}
                title="COO daily-scan: today / week / month / cycle per BDM with red-flag rule"
              >
                <Users size={18} />
                Team Activity
                {teamActivity?.rows && (
                  (() => {
                    const rf = teamActivity.rows.filter((r) => r.flag === 'redflag' || r.flag === 'never').length;
                    return rf > 0 ? <span className="tab-badge" style={{ background: '#dc2626' }}>{rf}</span> : null;
                  })()
                )}
              </button>
              <button
                className={`tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
                onClick={() => setActiveTab('overview')}
              >
                <TrendingUp size={18} />
                Overview
              </button>
              <button
                className={`tab-btn ${activeTab === 'bdm-performance' ? 'active' : ''}`}
                onClick={() => setActiveTab('bdm-performance')}
              >
                <UserCheck size={18} />
                BDM Performance
              </button>
              <button
                className={`tab-btn ${activeTab === 'programs' ? 'active' : ''}`}
                onClick={() => setActiveTab('programs')}
              >
                <Activity size={18} />
                Programs
                {programStats.length > 0 && <span className="tab-badge" style={{ background: '#8b5cf6' }}>{programStats.length}</span>}
              </button>
              <button
                className={`tab-btn ${activeTab === 'products' ? 'active' : ''}`}
                onClick={() => setActiveTab('products')}
              >
                <Package size={18} />
                Products
                {productStats.length > 0 && <span className="tab-badge" style={{ background: '#3b82f6' }}>{productStats.length}</span>}
              </button>
              <button
                className={`tab-btn ${activeTab === 'heatmap' ? 'active' : ''}`}
                onClick={() => setActiveTab('heatmap')}
              >
                <Calendar size={18} />
                Daily Heatmap
              </button>
            </div>

            <div className="tabs-content">
              {activeTab === 'team-activity' && (
                <TeamActivityTab
                  data={teamActivity}
                  loading={teamActivityLoading}
                  onBdmDrillDown={handleBdmDrillDown}
                />
              )}

              {activeTab === 'overview' && overviewStats && (
                <OverviewTab stats={overviewStats} onBdmDrillDown={handleBdmDrillDown} />
              )}

              {activeTab === 'bdm-performance' && (
                <BDMPerformanceTab
                  employees={bdmEmployees}
                  selectedBdmId={selectedBdmId}
                  onBdmChange={handleBdmChange}
                  cycleNumber={bdmDisplayCycleNumber ?? bdmCycleNumber}
                  onCycleChange={handleBdmCycleChange}
                  dcrSummary={bdmDcrSummary}
                  dcrTotal={bdmDcrTotal}
                  summary={bdmSummary}
                  doctors={bdmDoctors}
                  loading={bdmLoading}
                />
              )}

              {activeTab === 'programs' && (
                <ProgramMonitoringTab
                  programStats={programStats}
                  supportTypeStats={supportTypeStats}
                />
              )}

              {activeTab === 'products' && (
                <ProductPresentationTab productStats={productStats} />
              )}

              {activeTab === 'heatmap' && (
                <DailyHeatmapTab data={heatmapData} />
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

/* =============================================================================
   COMPONENT: OverviewTab
   High-level metrics and per-BDM call rate chart.
   ============================================================================= */

const OverviewTab = ({ stats, onBdmDrillDown }) => {
  // Team average call rate for reference line
  const avgCallRate = useMemo(() => {
    const rates = stats.perBdmCallRates || [];
    if (rates.length === 0) return 0;
    const sum = rates.reduce((acc, b) => acc + (b.callRate || 0), 0);
    return Math.round((sum / rates.length) * 10) / 10;
  }, [stats.perBdmCallRates]);

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
              <div className="stat-card-sublabel">Below 80% call rate</div>
            </div>

            {/* Total Visits */}
            <div className="stat-card">
              <div className="stat-card-header">
                <div className="stat-card-icon yellow">
                  <Activity size={22} />
                </div>
              </div>
              <div className="stat-card-value">{stats.totalVisitsThisMonth}</div>
              <div className="stat-card-label">Total Engagements</div>
              <div className="stat-card-sublabel">of {stats.targetVisitsThisMonth} target</div>
            </div>
          </div>

          <div className="chart-card overview-main-chart">
            <div className="chart-card-header">
              <div className="chart-card-title">
                <Activity size={18} />
                Per-BDM Call Rates (Current Cycle)
              </div>
              {stats.perBdmCallRates?.length > 0 && onBdmDrillDown && (
                <span style={{ fontSize: 11, color: 'var(--ink-500)', fontStyle: 'italic' }}>
                  Click a bar to drill into that BDM's DCR
                </span>
              )}
            </div>
            {stats.perBdmCallRates?.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={stats.perBdmCallRates} barGap={4}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--line-200)" />
                  <XAxis
                    dataKey="name"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: 'var(--ink-500)' }}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    domain={[0, 100]}
                    unit="%"
                    tick={{ fill: 'var(--ink-500)' }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--card-bg)',
                      border: '1px solid var(--line-200)',
                      borderRadius: '8px',
                      color: 'var(--ink-900)',
                      boxShadow: 'var(--shadow-soft)',
                    }}
                    labelStyle={{ color: 'var(--ink-500)', fontWeight: 600 }}
                    itemStyle={{ color: 'var(--ink-900)' }}
                    cursor={{ fill: 'rgba(148, 163, 184, 0.16)' }}
                    formatter={(value) => [`${value}%`, 'Call Rate']}
                  />
                  <ReferenceLine
                    y={avgCallRate}
                    stroke={CHART_COLORS.danger}
                    strokeDasharray="5 5"
                    label={{ value: `Avg ${avgCallRate}%`, position: 'right', fill: CHART_COLORS.danger, fontSize: 12 }}
                  />
                  <Bar
                    dataKey="callRate"
                    fill={CHART_COLORS.primary}
                    radius={[4, 4, 0, 0]}
                    maxBarSize={50}
                    cursor={onBdmDrillDown ? 'pointer' : 'default'}
                    onClick={(data) => {
                      // Recharts <Bar> onClick fires with the row payload as
                      // the first arg. userId was added in fetchOverviewData.
                      // Guard against entries with no resolved userId.
                      if (onBdmDrillDown && data?.userId) onBdmDrillDown(data.userId);
                    }}
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
                <div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--ink-900)' }}>{stats.totalVisitsThisMonth}</div>
                <div style={{ fontSize: '14px', color: 'var(--ink-500)' }}>Completed Engagements</div>
              </div>
              <div>
                <div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--ink-500)' }}>{stats.targetVisitsThisMonth}</div>
                <div style={{ fontSize: '14px', color: 'var(--ink-500)' }}>Target Engagements</div>
              </div>
              <div>
                <div style={{ fontSize: '28px', fontWeight: 700, color: stats.totalComplianceRate >= 80 ? '#16a34a' : '#dc2626' }}>
                  {stats.totalComplianceRate}%
                </div>
                <div style={{ fontSize: '14px', color: 'var(--ink-500)' }}>Completion Rate</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};


/* =============================================================================
   COMPONENT: TeamActivityTab — COO daily-scan surface (Apr 2026)
   One row per active BDM with today / week / month / cycle visit counts plus
   last-visit recency and a 🚩 red-flag column. Sortable; click a row to drill
   into BDM Performance pre-selected. Red-flag thresholds come from
   TEAM_ACTIVITY_THRESHOLDS lookup so subscribers tune without a code deploy.
   ============================================================================= */

const FLAG_PILL = {
  redflag:  { bg: '#fee2e2', fg: '#991b1b', icon: '🚩', label: 'Idle ≥2 workdays' },
  never:    { bg: '#fef3c7', fg: '#92400e', icon: '◯',  label: 'No visits this cycle' },
  warning:  { bg: '#fef9c3', fg: '#854d0e', icon: '⚠',  label: '1 workday gap' },
  ok:       { bg: '#dcfce7', fg: '#14532d', icon: '✓',  label: 'On cadence' },
};

const formatRelativeDate = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  if (diffDays <= 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
};

const TeamActivityTab = ({ data, loading, onBdmDrillDown }) => {
  const [sortKey, setSortKey] = useState('flag'); // default: worst-first (flag asc)
  const [sortDir, setSortDir] = useState('asc');

  const rows = useMemo(() => {
    if (!data?.rows) return [];
    const FLAG_ORDER = { redflag: 0, never: 1, warning: 2, ok: 3 };
    const arr = [...data.rows];
    const dir = sortDir === 'asc' ? 1 : -1;
    arr.sort((a, b) => {
      const av = sortKey === 'flag' ? FLAG_ORDER[a.flag] ?? 99 : (a[sortKey] ?? 0);
      const bv = sortKey === 'flag' ? FLAG_ORDER[b.flag] ?? 99 : (b[sortKey] ?? 0);
      if (sortKey === 'name') {
        return dir * String(a.name || '').localeCompare(String(b.name || ''));
      }
      if (sortKey === 'lastVisitDate') {
        const at = a.lastVisitDate ? new Date(a.lastVisitDate).getTime() : 0;
        const bt = b.lastVisitDate ? new Date(b.lastVisitDate).getTime() : 0;
        return dir * (at - bt);
      }
      if (av === bv) return 0;
      return dir * (av < bv ? -1 : 1);
    });
    return arr;
  }, [data, sortKey, sortDir]);

  const summary = useMemo(() => {
    if (!data?.rows) return null;
    const counts = { redflag: 0, never: 0, warning: 0, ok: 0 };
    let totalToday = 0;
    let totalThisWeek = 0;
    data.rows.forEach((r) => {
      counts[r.flag] = (counts[r.flag] || 0) + 1;
      totalToday += r.today || 0;
      totalThisWeek += r.thisWeek || 0;
    });
    return { counts, totalToday, totalThisWeek, total: data.rows.length };
  }, [data]);

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'name' ? 'asc' : 'desc');
    }
  };

  const sortIndicator = (key) => sortKey !== key ? '' : (sortDir === 'asc' ? ' ▲' : ' ▼');

  if (loading && !data) {
    return (
      <div style={{ textAlign: 'center', padding: '48px 0' }}>
        <LoadingSpinner />
      </div>
    );
  }

  if (!data || rows.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">
          <Users size={28} />
        </div>
        <h3>No active BDMs</h3>
        <p>Add staff with role &ldquo;staff&rdquo; in BDM Management to see their daily activity here.</p>
      </div>
    );
  }

  const thr = data.thresholds || {};

  return (
    <div>
      {/* Top summary strip */}
      <div className="overview-grid" style={{ marginBottom: 16 }}>
        <div className="stat-card">
          <div className="stat-card-header">
            <div className="stat-card-icon red"><AlertCircle size={22} /></div>
          </div>
          <div className="stat-card-value">{summary?.counts.redflag || 0}</div>
          <div className="stat-card-label">🚩 Red-flagged</div>
          <div className="stat-card-sublabel">Idle ≥{thr.red_flag_consecutive_workdays ?? 2} workdays</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-header">
            <div className="stat-card-icon yellow"><Clock size={22} /></div>
          </div>
          <div className="stat-card-value">{summary?.counts.warning || 0}</div>
          <div className="stat-card-label">⚠ Warning</div>
          <div className="stat-card-sublabel">≥{thr.gap_warning_workdays ?? 1} workday gap</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-header">
            <div className="stat-card-icon green"><CheckCircle size={22} /></div>
          </div>
          <div className="stat-card-value">{summary?.counts.ok || 0}</div>
          <div className="stat-card-label">✓ On cadence</div>
          <div className="stat-card-sublabel">of {summary?.total || 0} BDMs</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-header">
            <div className="stat-card-icon blue"><Activity size={22} /></div>
          </div>
          <div className="stat-card-value">{summary?.totalToday || 0}</div>
          <div className="stat-card-label">Visits today</div>
          <div className="stat-card-sublabel">{summary?.totalThisWeek || 0} this week</div>
        </div>
      </div>

      <div className="chart-card" style={{ overflowX: 'auto' }}>
        <div className="chart-card-header">
          <div className="chart-card-title">
            <Users size={18} />
            Per-BDM Activity (Cycle {data.cycleNumber != null ? data.cycleNumber + 1 : '—'})
          </div>
          {onBdmDrillDown && (
            <span style={{ fontSize: 11, color: 'var(--ink-500)', fontStyle: 'italic' }}>
              Click a row to drill into that BDM's DCR
            </span>
          )}
        </div>

        <table className="data-table team-activity-table">
          <thead>
            <tr>
              <th onClick={() => handleSort('flag')} style={{ cursor: 'pointer' }}>Flag{sortIndicator('flag')}</th>
              <th onClick={() => handleSort('name')} style={{ cursor: 'pointer' }}>BDM{sortIndicator('name')}</th>
              <th onClick={() => handleSort('today')} style={{ cursor: 'pointer', textAlign: 'right' }}>Today{sortIndicator('today')}</th>
              <th onClick={() => handleSort('thisWeek')} style={{ cursor: 'pointer', textAlign: 'right' }}>This Week{sortIndicator('thisWeek')}</th>
              <th onClick={() => handleSort('thisMonth')} style={{ cursor: 'pointer', textAlign: 'right' }}>This Month{sortIndicator('thisMonth')}</th>
              <th onClick={() => handleSort('cycle')} style={{ cursor: 'pointer', textAlign: 'right' }}>Cycle{sortIndicator('cycle')}</th>
              <th onClick={() => handleSort('callRate')} style={{ cursor: 'pointer', textAlign: 'right' }}>Call Rate{sortIndicator('callRate')}</th>
              <th onClick={() => handleSort('lastVisitDate')} style={{ cursor: 'pointer' }}>Last Visit{sortIndicator('lastVisitDate')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const pill = FLAG_PILL[row.flag] || FLAG_PILL.ok;
              const callRateColor = row.callRate >= (thr.target_call_rate ?? 80) ? '#16a34a' : row.callRate >= 50 ? '#d97706' : '#dc2626';
              return (
                <tr
                  key={row.userId}
                  onClick={() => onBdmDrillDown && onBdmDrillDown(row.userId)}
                  style={{ cursor: onBdmDrillDown ? 'pointer' : 'default' }}
                  title={`${pill.label} — ${row.gapWorkdays} workday gap`}
                >
                  <td>
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: '3px 8px',
                      borderRadius: 12,
                      background: pill.bg,
                      color: pill.fg,
                      fontSize: 11,
                      fontWeight: 600,
                      whiteSpace: 'nowrap',
                    }}>
                      {pill.icon} {pill.label}
                    </span>
                  </td>
                  <td style={{ fontWeight: 600 }}>{row.name}</td>
                  <td style={{ textAlign: 'right' }}>{row.today}</td>
                  <td style={{ textAlign: 'right' }}>{row.thisWeek}</td>
                  <td style={{ textAlign: 'right' }}>{row.thisMonth}</td>
                  <td style={{ textAlign: 'right' }}>{row.cycle}{row.cycleTarget > 0 ? <span style={{ color: 'var(--ink-500)', fontSize: 11 }}> / {row.cycleTarget}</span> : null}</td>
                  <td style={{ textAlign: 'right', color: callRateColor, fontWeight: 600 }}>{row.callRate}%</td>
                  <td>{formatRelativeDate(row.lastVisitDate)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div style={{ marginTop: 12, fontSize: 11, color: 'var(--ink-500)', fontStyle: 'italic' }}>
          Thresholds: 🚩 ≥{thr.red_flag_consecutive_workdays ?? 2} consecutive idle workdays · ⚠ ≥{thr.gap_warning_workdays ?? 1} workday gap · target call rate {thr.target_call_rate ?? 80}%.
          Tune via Control Center → Lookup Tables → TEAM_ACTIVITY_THRESHOLDS.
        </div>
      </div>
    </div>
  );
};


/* =============================================================================
   COMPONENT: BDMPerformanceTab
   Admin view of any BDM's DCR Summary with metrics and engagement breakdown.
   ============================================================================= */

// Fallback colors per engagement code (metadata may override via lookup)
const ENG_TYPE_COLORS = {
  TXT_PROMATS: '#3b82f6',
  MES_VIBER_GIF: '#8b5cf6',
  PICTURE: '#f59e0b',
  SIGNED_CALL: '#22c55e',
  VOICE_CALL: '#ef4444',
};

const ENG_TYPE_FALLBACK = {
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
  // Fetch engagement type labels from lookup (database-driven)
  const { options: engagementLookups } = useLookupOptions('ENGAGEMENT_TYPE');
  const engTypeLabels = useMemo(() => {
    if (engagementLookups.length === 0) return ENG_TYPE_FALLBACK;
    const map = {};
    engagementLookups.forEach((opt) => {
      map[opt.code] = {
        label: opt.label,
        color: opt.metadata?.color || ENG_TYPE_COLORS[opt.code] || '#6b7280',
      };
    });
    return map;
  }, [engagementLookups]);

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
        <SelectField
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
        </SelectField>

        {selectedBdmId && (
          <div className="cycle-nav">
            <button className="cycle-nav-btn" onClick={() => onCycleChange(-1)}>
              <ChevronLeft size={18} />
            </button>
            <span className="cycle-nav-label">
              Cycle {cycleNumber != null ? cycleNumber + 1 : '...'}
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
              {Object.entries(engTypeLabels).map(([key, { label, color }]) => {
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
   COMPONENT: ProgramMonitoringTab
   Shows program and support type implementation stats.
   ============================================================================= */

const programTabStyles = `
  .prog-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 16px;
    margin-top: 16px;
  }

  .prog-card {
    background: var(--card-bg, #fff);
    border: 1px solid var(--line-200, #e5e7eb);
    border-radius: 12px;
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  body.dark-mode .prog-card {
    background: #1e293b;
    border-color: #334155;
  }

  .prog-card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .prog-card-name {
    font-size: 15px;
    font-weight: 700;
    color: var(--ink-900, #111827);
  }

  body.dark-mode .prog-card-name {
    color: #f1f5f9;
  }

  .prog-card-rate {
    font-size: 20px;
    font-weight: 800;
    padding: 2px 10px;
    border-radius: 8px;
  }

  .prog-card-rate.high { background: #dcfce7; color: #16a34a; }
  .prog-card-rate.mid  { background: #fef3c7; color: #d97706; }
  .prog-card-rate.low  { background: #fee2e2; color: #dc2626; }

  body.dark-mode .prog-card-rate.high { background: #14532d; }
  body.dark-mode .prog-card-rate.mid  { background: #78350f; }
  body.dark-mode .prog-card-rate.low  { background: #7f1d1d; }

  .prog-card-bar {
    height: 8px;
    background: var(--line-200, #e5e7eb);
    border-radius: 4px;
    overflow: hidden;
  }

  body.dark-mode .prog-card-bar {
    background: #334155;
  }

  .prog-card-bar-fill {
    height: 100%;
    border-radius: 4px;
    transition: width 0.5s ease;
  }

  .prog-card-detail {
    display: flex;
    justify-content: space-between;
    font-size: 13px;
    color: var(--ink-500, #6b7280);
  }

  body.dark-mode .prog-card-detail {
    color: #94a3b8;
  }

  .prog-section-title {
    font-size: 17px;
    font-weight: 700;
    color: var(--ink-900, #111827);
    margin: 24px 0 0 0;
    padding-bottom: 8px;
    border-bottom: 2px solid var(--line-200, #e5e7eb);
  }

  body.dark-mode .prog-section-title {
    color: #f1f5f9;
    border-bottom-color: #334155;
  }

  .prog-section-title:first-child {
    margin-top: 0;
  }

  .prog-empty {
    text-align: center;
    padding: 32px;
    color: var(--ink-500, #6b7280);
    font-size: 14px;
  }
`;

const ProgramMonitoringTab = ({ programStats, supportTypeStats }) => {
  const rateClass = (rate) => rate >= 70 ? 'high' : rate >= 40 ? 'mid' : 'low';
  const barColor = (rate) => rate >= 70 ? '#22c55e' : rate >= 40 ? '#eab308' : '#ef4444';

  return (
    <div>
      <style>{programTabStyles}</style>

      <h3 className="prog-section-title">Programs</h3>
      {programStats.length === 0 ? (
        <p className="prog-empty">No programs configured. Go to Settings to add programs.</p>
      ) : (
        <div className="prog-grid">
          {programStats.map((p) => (
            <div key={p.programId} className="prog-card">
              <div className="prog-card-header">
                <span className="prog-card-name">{p.program}</span>
                <span className={`prog-card-rate ${rateClass(p.coverageRate)}`}>
                  {p.coverageRate}%
                </span>
              </div>
              <div className="prog-card-bar">
                <div
                  className="prog-card-bar-fill"
                  style={{ width: `${Math.min(p.coverageRate, 100)}%`, background: barColor(p.coverageRate) }}
                />
              </div>
              <div className="prog-card-detail">
                <span>Enrolled: {p.enrolledVipClients} VIP Clients</span>
                <span>Visited: {p.visitedVipClients}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <h3 className="prog-section-title">Support Types</h3>
      {supportTypeStats.length === 0 ? (
        <p className="prog-empty">No support types configured. Go to Settings to add support types.</p>
      ) : (
        <div className="prog-grid">
          {supportTypeStats.map((s) => (
            <div key={s.supportTypeId} className="prog-card">
              <div className="prog-card-header">
                <span className="prog-card-name">{s.supportType}</span>
                <span className={`prog-card-rate ${rateClass(s.coverageRate)}`}>
                  {s.coverageRate}%
                </span>
              </div>
              <div className="prog-card-bar">
                <div
                  className="prog-card-bar-fill"
                  style={{ width: `${Math.min(s.coverageRate, 100)}%`, background: barColor(s.coverageRate) }}
                />
              </div>
              <div className="prog-card-detail">
                <span>Enrolled: {s.enrolledVipClients} VIP Clients</span>
                <span>Visited: {s.visitedVipClients}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

/* =============================================================================
   COMPONENT: ProductPresentationTab
   Shows product presentation stats aggregated from Visit.productsDiscussed.
   ============================================================================= */

const productTabStyles = `
  .product-chart-wrapper {
    margin-bottom: 24px;
  }
  .product-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: 16px;
  }
  .product-card {
    background: var(--card-bg, #fff);
    border: 1px solid var(--line-200, #e5e7eb);
    border-radius: 12px;
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  body.dark-mode .product-card {
    background: #1e293b;
    border-color: #334155;
  }
  .product-card-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
  }
  .product-card-name {
    font-size: 15px;
    font-weight: 700;
    color: var(--ink-900, #111827);
  }
  body.dark-mode .product-card-name {
    color: #f1f5f9;
  }
  .product-card-generic {
    font-size: 12px;
    color: var(--ink-500, #6b7280);
    margin-top: 2px;
  }
  .product-card-count {
    font-size: 22px;
    font-weight: 800;
    color: #3b82f6;
    padding: 2px 10px;
    background: #dbeafe;
    border-radius: 8px;
    white-space: nowrap;
  }
  body.dark-mode .product-card-count {
    background: #1e3a5f;
  }
  .product-card-meta {
    display: flex;
    justify-content: space-between;
    font-size: 13px;
    color: var(--ink-500, #6b7280);
  }
  body.dark-mode .product-card-meta {
    color: #94a3b8;
  }
  .product-bdm-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-top: 4px;
  }
  .product-bdm-row {
    display: flex;
    justify-content: space-between;
    font-size: 13px;
    padding: 4px 8px;
    border-radius: 6px;
    background: var(--page-bg, #f9fafb);
  }
  body.dark-mode .product-bdm-row {
    background: #0f172a;
  }
  .product-bdm-name {
    color: var(--ink-700, #374151);
  }
  body.dark-mode .product-bdm-name {
    color: #cbd5e1;
  }
  .product-bdm-count {
    font-weight: 600;
    color: #3b82f6;
  }
  .product-empty {
    text-align: center;
    padding: 32px;
    color: var(--ink-500, #6b7280);
    font-size: 14px;
  }
  @media (max-width: 480px) {
    .product-grid {
      grid-template-columns: 1fr;
    }
  }
`;

const ProductPresentationTab = ({ productStats }) => {
  if (!productStats || productStats.length === 0) {
    return (
      <div>
        <style>{productTabStyles}</style>
        <p className="product-empty">No product presentations recorded this cycle.</p>
      </div>
    );
  }

  // Data for chart (top 10 products by presentation count)
  const chartData = productStats.slice(0, 10).map((p) => ({
    name: p.productName.length > 18 ? p.productName.slice(0, 18) + '...' : p.productName,
    presentations: p.totalPresentations,
  }));

  return (
    <div>
      <style>{productTabStyles}</style>

      {/* Bar chart of top products */}
      <div className="chart-card product-chart-wrapper">
        <div className="chart-card-header">
          <div className="chart-card-title">
            <Package size={18} />
            Top Products by Presentations (Current Cycle)
          </div>
        </div>
        <ResponsiveContainer width="100%" height={Math.max(200, chartData.length * 36)}>
          <BarChart data={chartData} layout="vertical" barGap={4}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--line-200)" horizontal={false} />
            <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: 'var(--ink-500)' }} />
            <YAxis
              type="category"
              dataKey="name"
              axisLine={false}
              tickLine={false}
              width={140}
              tick={{ fill: 'var(--ink-500)', fontSize: 13 }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'var(--card-bg)',
                border: '1px solid var(--line-200)',
                borderRadius: '8px',
                color: 'var(--ink-900)',
                boxShadow: 'var(--shadow-soft)',
              }}
              formatter={(value) => [value, 'Presentations']}
            />
            <Bar dataKey="presentations" fill={CHART_COLORS.secondary} radius={[0, 4, 4, 0]} maxBarSize={28} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Product cards grid */}
      <div className="product-grid">
        {productStats.map((p) => (
          <div key={p.productId} className="product-card">
            <div className="product-card-header">
              <div>
                <div className="product-card-name">{p.productName}{p.dosage ? ` ${p.dosage}` : ''}</div>
                {p.genericName && <div className="product-card-generic">{p.genericName}</div>}
              </div>
              <div className="product-card-count">{p.totalPresentations}</div>
            </div>
            <div className="product-card-meta">
              <span>Category: {p.category || '—'}</span>
              <span>VIP Clients: {p.uniqueVipClients}</span>
            </div>
            {p.byBdm && p.byBdm.length > 0 && (
              <div className="product-bdm-list">
                {p.byBdm.map((b) => (
                  <div key={b.userId} className="product-bdm-row">
                    <span className="product-bdm-name">{b.name}</span>
                    <span className="product-bdm-count">{b.count}x</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};


/* =============================================================================
   COMPONENT: DailyHeatmapTab
   Cross-BDM daily visit heatmap showing visit intensity for W1D1-W4D5.
   ============================================================================= */

const heatmapTabStyles = `
  .heatmap-wrapper {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }
  .heatmap-table {
    width: 100%;
    border-collapse: separate;
    border-spacing: 0;
    min-width: 700px;
  }
  .heatmap-table th,
  .heatmap-table td {
    text-align: center;
    padding: 6px 4px;
    font-size: 13px;
    border-bottom: 1px solid var(--line-200, #e5e7eb);
  }
  body.dark-mode .heatmap-table th,
  body.dark-mode .heatmap-table td {
    border-bottom-color: #334155;
  }
  .heatmap-table thead th {
    position: sticky;
    top: 0;
    background: var(--card-bg, #fff);
    font-weight: 700;
    font-size: 11px;
    color: var(--ink-500, #6b7280);
    z-index: 2;
    padding: 8px 4px;
  }
  body.dark-mode .heatmap-table thead th {
    background: #1e293b;
    color: #94a3b8;
  }
  .heatmap-bdm-name {
    position: sticky;
    left: 0;
    background: var(--card-bg, #fff);
    text-align: left !important;
    font-weight: 600;
    color: var(--ink-900, #111827);
    white-space: nowrap;
    padding-left: 12px !important;
    padding-right: 12px !important;
    z-index: 1;
    min-width: 120px;
  }
  body.dark-mode .heatmap-bdm-name {
    background: #1e293b;
    color: #f1f5f9;
  }
  .heatmap-cell {
    min-width: 36px;
    border-radius: 4px;
    font-weight: 600;
    transition: background 0.2s;
  }
  .heatmap-week-sep {
    border-left: 2px solid var(--ink-300, #d1d5db) !important;
  }
  body.dark-mode .heatmap-week-sep {
    border-left-color: #475569 !important;
  }
  .heat-0 { background: #f3f4f6; color: #9ca3af; }
  .heat-1 { background: #dcfce7; color: #166534; }
  .heat-2 { background: #bbf7d0; color: #166534; }
  .heat-3 { background: #86efac; color: #14532d; }
  .heat-4 { background: #4ade80; color: #fff; }
  .heat-5 { background: #22c55e; color: #fff; }
  body.dark-mode .heat-0 { background: #1e293b; color: #64748b; }
  body.dark-mode .heat-1 { background: #14532d; color: #86efac; }
  body.dark-mode .heat-2 { background: #166534; color: #bbf7d0; }
  body.dark-mode .heat-3 { background: #15803d; color: #dcfce7; }
  body.dark-mode .heat-4 { background: #16a34a; color: #fff; }
  body.dark-mode .heat-5 { background: #22c55e; color: #fff; }
  .heatmap-total {
    font-weight: 700;
    color: var(--ink-900, #111827);
  }
  body.dark-mode .heatmap-total {
    color: #f1f5f9;
  }
  .heatmap-avg-row td {
    font-weight: 700;
    color: #3b82f6;
    border-top: 2px solid var(--line-200, #e5e7eb);
  }
  body.dark-mode .heatmap-avg-row td {
    color: #60a5fa;
    border-top-color: #475569;
  }
  .heatmap-below-target {
    box-shadow: inset 0 0 0 2px #ef4444;
    border-radius: 4px;
  }
  .heatmap-empty {
    text-align: center;
    padding: 32px;
    color: var(--ink-500, #6b7280);
    font-size: 14px;
  }
  .heatmap-legend {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 16px;
    flex-wrap: wrap;
    font-size: 12px;
    color: var(--ink-500, #6b7280);
  }
  .heatmap-legend-swatch {
    display: inline-block;
    width: 16px;
    height: 16px;
    border-radius: 3px;
  }
  @media (max-width: 600px) {
    .heatmap-bdm-name {
      min-width: 90px;
      font-size: 12px;
    }
    .heatmap-cell {
      min-width: 28px;
      font-size: 11px;
    }
  }
`;

const DailyHeatmapTab = ({ data }) => {
  if (!data || !data.bdms || data.bdms.length === 0) {
    return (
      <div>
        <style>{heatmapTabStyles}</style>
        <p className="heatmap-empty">No heatmap data available for this cycle.</p>
      </div>
    );
  }

  const { days, bdms, teamAvg } = data;

  const heatClass = (count) => {
    if (count <= 0) return 'heat-0';
    if (count <= 1) return 'heat-1';
    if (count <= 2) return 'heat-2';
    if (count <= 3) return 'heat-3';
    if (count <= 4) return 'heat-4';
    return 'heat-5';
  };

  const isWeekStart = (dayLabel) => {
    return dayLabel.endsWith('D1') && dayLabel !== 'W1D1';
  };

  return (
    <div>
      <style>{heatmapTabStyles}</style>

      {/* Color legend */}
      <div className="heatmap-legend">
        <span>Less</span>
        <span className="heatmap-legend-swatch heat-0" />
        <span className="heatmap-legend-swatch heat-1" />
        <span className="heatmap-legend-swatch heat-2" />
        <span className="heatmap-legend-swatch heat-3" />
        <span className="heatmap-legend-swatch heat-4" />
        <span className="heatmap-legend-swatch heat-5" />
        <span>More</span>
        <span style={{ marginLeft: 16 }}>
          <span className="heatmap-below-target" style={{ display: 'inline-block', width: 16, height: 16, borderRadius: 3 }} />
          {' '}Below target
        </span>
      </div>

      <div className="heatmap-wrapper">
        <table className="heatmap-table">
          <thead>
            <tr>
              <th style={{ textAlign: 'left', paddingLeft: 12 }}>BDM</th>
              {days.map((day) => (
                <th key={day} className={isWeekStart(day) ? 'heatmap-week-sep' : ''}>
                  {day}
                </th>
              ))}
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {bdms.map((bdm) => (
              <tr key={bdm.userId}>
                <td className="heatmap-bdm-name">{bdm.name}</td>
                {days.map((day) => {
                  const count = bdm.daily[day] || 0;
                  const target = bdm.dailyTarget[day] || 0;
                  const belowTarget = target > 0 && count < target;
                  return (
                    <td
                      key={day}
                      className={`heatmap-cell ${heatClass(count)} ${isWeekStart(day) ? 'heatmap-week-sep' : ''} ${belowTarget ? 'heatmap-below-target' : ''}`}
                      title={`${day}: ${count} visit${count !== 1 ? 's' : ''}${target > 0 ? ` (target: ${target})` : ''}`}
                    >
                      {count > 0 ? count : ''}
                    </td>
                  );
                })}
                <td className="heatmap-total">{bdm.total}</td>
              </tr>
            ))}
            {/* Team average row */}
            <tr className="heatmap-avg-row">
              <td className="heatmap-bdm-name" style={{ color: '#3b82f6' }}>Team Avg</td>
              {days.map((day) => (
                <td key={day} className={isWeekStart(day) ? 'heatmap-week-sep' : ''}>
                  {teamAvg[day] || 0}
                </td>
              ))}
              <td>
                {Math.round(bdms.reduce((sum, b) => sum + b.total, 0) / (bdms.length || 1) * 10) / 10}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default StatisticsPage;