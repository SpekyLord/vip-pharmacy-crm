/**
 * Sidebar Component - Responsive
 *
 * Responsive navigation with:
 * - Desktop (1025px+): Sidebar visible on the left, expanded or collapsible
 * - Tablet (481px–1024px): Icon-only sidebar, hamburger opens overlay drawer
 * - Mobile (≤480px): Hidden sidebar, bottom tab bar + slide-in drawer for overflow
 * - Role-based menu items with Lucide icons
 * - Active route highlighting
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import messageService from '../../services/messageInboxService';
import api from '../../services/api';
import {
  LayoutDashboard,
  Users,
  UserCog,
  ClipboardCheck,
  BarChart3,
  FileText,
  FileSpreadsheet,
  Inbox,
  CalendarRange,
  Stethoscope,
  Package,
  ChevronLeft,
  ChevronRight,
  Activity,
  Shield,
  Menu,
  X,
  Camera,
  Settings,
  Briefcase,
  DollarSign,
  UserCheck,
  CreditCard,
  Receipt,
  Wallet,
  BookOpen,
  ShoppingCart,
  Truck,
  FileInput,
  Landmark,
  Scale,
  Layers,
  Archive,
  ArrowLeftRight,
  Repeat,
  Network,
  ChevronDown,
  RotateCcw,
  AlertTriangle,
  Search,
  Target,
  Trophy,
  MessageSquare,
} from 'lucide-react';

/* =============================================================================
   STYLES
   ============================================================================= */

const sidebarStyles = `
  /* ===== DESKTOP SIDEBAR ===== */
  .sidebar {
    width: 250px;
    min-height: calc(100vh - 68px);
    background: #0f172a;
    display: flex;
    flex-direction: column;
    transition: width 0.25s ease;
    position: relative;
    flex-shrink: 0;
  }

  .sidebar.collapsed {
    width: 72px;
  }

  /* Toggle Button */
  .sidebar-toggle {
    position: absolute;
    top: 24px;
    right: -12px;
    width: 24px;
    height: 24px;
    background: #3b82f6;
    border: 3px solid #0f172a;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    color: white;
    z-index: 10;
    transition: all 0.2s;
  }

  .sidebar-toggle:hover {
    background: #2563eb;
    transform: scale(1.1);
  }

  /* Navigation */
  .sidebar-nav {
    flex: 1;
    padding: 16px 12px;
    overflow-y: auto;
    overflow-x: hidden;
  }

  .sidebar.collapsed .sidebar-nav {
    padding: 16px 10px;
  }

  .sidebar-section {
    margin-bottom: 24px;
  }

  .sidebar-section-title {
    padding: 0 12px;
    margin-bottom: 8px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: rgba(255, 255, 255, 0.3);
    white-space: nowrap;
  }

  .sidebar.collapsed .sidebar-section-title {
    display: none;
  }

  /* Links */
  .sidebar-link {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 11px 12px;
    margin-bottom: 4px;
    border-radius: 10px;
    color: rgba(255, 255, 255, 0.6);
    background: transparent;
    text-decoration: none;
    font-size: 14px;
    font-weight: 500;
    transition: all 0.2s;
    position: relative;
  }

  .sidebar.collapsed .sidebar-link {
    justify-content: center;
    padding: 11px;
  }

  .sidebar-link:hover {
    background: rgba(255, 255, 255, 0.08);
    color: white;
  }

  .sidebar-link.active {
    background: #3b82f6;
    color: white;
  }

  .sidebar-link-icon {
    width: 20px;
    height: 20px;
    min-width: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .sidebar-link-label {
    white-space: nowrap;
    overflow: hidden;
  }

  .sidebar.collapsed .sidebar-link-label {
    display: none;
  }

  /* Tooltip */
  .sidebar-tooltip {
    position: fixed;
    left: 80px;
    padding: 8px 12px;
    background: #1e293b;
    color: white;
    font-size: 13px;
    font-weight: 500;
    border-radius: 8px;
    white-space: nowrap;
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
    transition: all 0.15s;
    z-index: 1000;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  }

  .sidebar-tooltip::before {
    content: '';
    position: absolute;
    right: 100%;
    top: 50%;
    transform: translateY(-50%);
    border: 6px solid transparent;
    border-right-color: #1e293b;
  }

  .sidebar.collapsed .sidebar-link:hover .sidebar-tooltip {
    opacity: 1;
    visibility: visible;
  }

  /* Badge */
  .sidebar-badge {
    margin-left: auto;
    min-width: 20px;
    height: 20px;
    padding: 0 6px;
    background: #ef4444;
    color: white;
    font-size: 11px;
    font-weight: 600;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .sidebar.collapsed .sidebar-badge {
    position: absolute;
    top: 4px;
    right: 4px;
    min-width: 18px;
    height: 18px;
    padding: 0 4px;
    font-size: 10px;
    margin-left: 0;
  }

  .sidebar-badge-text {
    margin-left: auto;
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 10px;
    font-weight: 600;
    background: rgba(251, 191, 36, 0.15);
    color: #f59e0b;
    white-space: nowrap;
  }

  .sidebar.collapsed .sidebar-badge-text {
    display: none;
  }

  /* Scrollbar */
  .sidebar-nav::-webkit-scrollbar {
    width: 4px;
  }

  .sidebar-nav::-webkit-scrollbar-track {
    background: transparent;
  }

  .sidebar-nav::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.15);
    border-radius: 2px;
  }

  /* ===== MOBILE BOTTOM TAB BAR ===== */
  .mobile-tab-bar {
    display: none;
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    background: #0f172a;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
    z-index: 1000;
    padding-bottom: env(safe-area-inset-bottom, 0px);
  }

  .mobile-tab-bar-inner {
    display: flex;
    align-items: center;
    justify-content: space-around;
    height: 64px;
  }

  .mobile-tab-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 3px;
    padding: 6px 0;
    min-width: 56px;
    min-height: 44px;
    color: rgba(255, 255, 255, 0.5);
    text-decoration: none;
    font-size: 10px;
    font-weight: 500;
    border: none;
    background: none;
    cursor: pointer;
    position: relative;
    -webkit-tap-highlight-color: transparent;
    transition: color 0.15s;
  }

  .mobile-tab-item.active {
    color: #3b82f6;
  }

  .mobile-tab-item:active {
    color: #60a5fa;
  }

  .mobile-tab-item .tab-badge {
    position: absolute;
    top: 2px;
    right: 8px;
    min-width: 16px;
    height: 16px;
    padding: 0 4px;
    background: #ef4444;
    color: white;
    font-size: 9px;
    font-weight: 700;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .mobile-tab-item .tab-badge-text {
    position: absolute;
    top: 2px;
    right: 4px;
    padding: 1px 4px;
    background: rgba(251, 191, 36, 0.2);
    color: #f59e0b;
    font-size: 8px;
    font-weight: 700;
    border-radius: 3px;
  }

  /* ===== MOBILE DRAWER ===== */
  .mobile-drawer-backdrop {
    display: none;
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: 1001;
    opacity: 0;
    transition: opacity 0.2s ease;
  }

  .mobile-drawer-backdrop.visible {
    opacity: 1;
  }

  .mobile-drawer {
    position: fixed;
    top: 0;
    left: 0;
    bottom: 0;
    width: 280px;
    max-width: 85vw;
    background: #0f172a;
    z-index: 1002;
    transform: translateX(-100%);
    transition: transform 0.25s ease;
    display: flex;
    flex-direction: column;
    overflow-y: auto;
  }

  .mobile-drawer.open {
    transform: translateX(0);
  }

  .mobile-drawer-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }

  .mobile-drawer-platform-switch {
    display: flex;
    gap: 8px;
    padding: 14px 20px 16px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }

  .mobile-drawer-platform-link {
    flex: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 40px;
    padding: 0 14px;
    border-radius: 10px;
    text-decoration: none;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: rgba(255, 255, 255, 0.72);
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.08);
    transition: all 0.2s ease;
  }

  .mobile-drawer-platform-link.active {
    color: #0f172a;
    background: #f8fafc;
    border-color: #f8fafc;
  }

  .mobile-drawer-close {
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(255, 255, 255, 0.1);
    border: none;
    border-radius: 8px;
    color: white;
    cursor: pointer;
  }

  .mobile-drawer-close:active {
    background: rgba(255, 255, 255, 0.2);
  }

  .mobile-drawer-nav {
    flex: 1;
    padding: 12px 12px calc(88px + env(safe-area-inset-bottom, 0px));
    overflow-y: auto;
  }

  .mobile-drawer .sidebar-link {
    padding: 14px 16px;
    margin-bottom: 2px;
    font-size: 15px;
  }

  .mobile-drawer .sidebar-link-icon {
    width: 22px;
    height: 22px;
    min-width: 22px;
  }

  .mobile-drawer .sidebar-section {
    margin-bottom: 20px;
  }

  .mobile-drawer .sidebar-section-title {
    padding: 0 16px;
    margin-bottom: 6px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: rgba(255, 255, 255, 0.3);
  }

  /* ===== COLLAPSIBLE SECTION HEADERS ===== */
  .sidebar-section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 8px;
    cursor: pointer;
    padding: 7px 10px;
    margin-bottom: 4px;
    transition: background 0.15s;
  }

  .sidebar-section-header:hover {
    background: rgba(255, 255, 255, 0.1);
  }

  .sidebar-section-header .sidebar-section-title {
    padding: 0;
    margin: 0;
    color: rgba(255, 255, 255, 0.55);
  }

  .sidebar-section-header:hover .sidebar-section-title {
    color: rgba(255, 255, 255, 0.8);
  }

  .sidebar-section-chevron {
    color: rgba(255, 255, 255, 0.35);
    transition: transform 0.2s;
    flex-shrink: 0;
  }

  .sidebar-section-chevron.open {
    transform: rotate(180deg);
    color: rgba(255, 255, 255, 0.6);
  }

  /* Indent child items under collapsible sections */
  .sidebar-section-collapsible-items {
    padding-left: 10px;
    border-left: 2px solid rgba(255, 255, 255, 0.07);
    margin-left: 6px;
    margin-bottom: 4px;
  }

  .sidebar.collapsed .sidebar-section-header {
    display: none;
  }

  .mobile-drawer .sidebar-section-header {
    padding: 8px 12px;
    margin-bottom: 4px;
  }

  .mobile-drawer .sidebar-section-collapsible-items {
    padding-left: 10px;
    border-left: 2px solid rgba(255, 255, 255, 0.07);
    margin-left: 6px;
  }

  .sidebar-link.sidebar-link-child {
    margin-left: 14px;
    padding-left: 18px;
    position: relative;
  }

  .sidebar-link.sidebar-link-child::before {
    content: '';
    position: absolute;
    left: 8px;
    top: 50%;
    width: 8px;
    height: 1px;
    background: rgba(255, 255, 255, 0.35);
  }

  .sidebar.collapsed .sidebar-link.sidebar-link-child {
    margin-left: 0;
    padding-left: 11px;
  }

  .sidebar.collapsed .sidebar-link.sidebar-link-child::before {
    display: none;
  }


  /* ===== TABLET RESPONSIVE ===== */
  @media (max-width: 1024px) and (min-width: 481px) {
    .sidebar {
      width: 72px;
    }
    .sidebar .sidebar-role-info,
    .sidebar .sidebar-link-label,
    .sidebar .sidebar-section-title {
      display: none;
    }
    .sidebar .sidebar-role-badge {
      padding: 10px;
      justify-content: center;
    }
    .sidebar .sidebar-link {
      justify-content: center;
      padding: 11px;
    }
    .sidebar-toggle {
      display: none;
    }
    .sidebar .sidebar-badge {
      position: absolute;
      top: 4px;
      right: 4px;
      min-width: 18px;
      height: 18px;
      padding: 0 4px;
      font-size: 10px;
      margin-left: 0;
    }
    .sidebar .sidebar-badge-text {
      display: none;
    }
    .sidebar .sidebar-link:hover .sidebar-tooltip {
      opacity: 1;
      visibility: visible;
    }
  }

  /* ===== MOBILE RESPONSIVE ===== */
  @media (max-width: 480px) {
    .sidebar {
      display: none;
    }

    .mobile-tab-bar {
      display: block;
    }

    .mobile-drawer-backdrop {
      display: block;
      pointer-events: none;
    }

    .mobile-drawer-backdrop.visible {
      pointer-events: auto;
    }

    /* Paint the html background dark on mobile so any gap between
       the fixed tab bar and viewport bottom shows dark, not white */
    html {
      background-color: #0f172a;
    }

    /* Add bottom padding to main content for tab bar */
    .admin-main,
    .main-content,
    .page-main,
    .cpt-main,
    .np-main,
    .statistics-main,
    .reports-main,
    .ie-content,
    .activity-monitor-main,
    .gps-page-main,
    .doctors-main,
    .employees-main {
      padding-bottom: calc(80px + env(safe-area-inset-bottom, 0px)) !important;
    }

    .boss-scroll,
    .ba-main,
    .hospital-main,
    .coll-main {
      padding-bottom: calc(80px + env(safe-area-inset-bottom, 0px)) !important;
    }
  }
`;

/* =============================================================================
   MENU CONFIGURATION
   ============================================================================= */

/**
 * Build ERP sidebar section based on user's erp_access.
 * Returns null if no ERP modules are accessible.
 */
import { ROLES, ROLE_SETS, isAdminLike as isAdminLikeRole, isPresidentLike } from '../../constants/roles';

const getErpSection = (role, erpAccess, { includeHomeOnly = false } = {}) => {
  const hasModule = (mod) => {
    if (isPresidentLike(role)) return true;
    if (role === ROLES.ADMIN && (!erpAccess || !erpAccess.enabled)) return true;
    if (!erpAccess || !erpAccess.enabled) return false;
    return erpAccess.modules?.[mod] && erpAccess.modules[mod] !== 'NONE';
  };

  const isAdmin = isAdminLikeRole(role);
  const sections = [];

  // ── ERP Home (always visible, no header) ─────────────────────────────────
  sections.push({
    title: null,
    collapsible: false,
    items: [
      { path: '/erp', label: 'ERP Home', icon: Briefcase },
    ],
  });

  // ── Sales ──────────────────────────────────────────────────────────────────
  if (hasModule('sales')) {
    const salesHomePath = role === ROLES.FINANCE ? '/erp/sales' : '/erp/sales/entry';
    const salesItems = [{ path: salesHomePath, label: 'Sales', icon: Receipt }];
    if (salesHomePath !== '/erp/sales') {
      salesItems.push({ path: '/erp/sales', label: 'Sales Transactions', icon: FileText, isChild: true });
    }
    salesItems.push({ path: '/erp/credit-notes', label: 'Returns / CN', icon: RotateCcw });
    salesItems.push({ path: '/erp/csi-booklets', label: 'CSI Booklets', icon: BookOpen });
    sections.push({
      title: 'Sales',
      collapsible: true,
      defaultOpen: true,
      items: salesItems,
    });
  }

  // ── Inventory ─────────────────────────────────────────────────────────────
  if (hasModule('inventory')) {
    const invItems = [
      { path: '/erp/csi-booklets', label: 'CSI Booklets', icon: BookOpen },
      { path: '/erp/grn', label: 'GRN Entry', icon: FileInput },
      { path: '/erp/my-stock', label: 'Inventory', icon: Package },
      { path: '/erp/office-supplies', label: 'Office Supplies', icon: Package },
      { path: '/erp/transfers', label: 'Transfers', icon: ArrowLeftRight },
    ];
    if (isAdmin) invItems.push({ path: '/erp/collaterals', label: 'Collaterals', icon: Layers });
    if (isAdmin) invItems.push({ path: '/erp/dr', label: 'DR / Consignment', icon: Truck });
    invItems.push({ path: '/erp/expiry-dashboard', label: 'Expiry Mgmt', icon: AlertTriangle });
    invItems.push({ path: '/erp/batch-trace', label: 'Batch Trace', icon: Search });
    if ([ROLES.ADMIN, ROLES.PRESIDENT].includes(role)) {
      invItems.push({ path: '/erp/warehouses', label: 'Warehouses', icon: Package });
    }
    // Sort alphabetically
    invItems.sort((a, b) => a.label.localeCompare(b.label));
    sections.push({ title: 'Inventory', collapsible: true, defaultOpen: true, items: invItems });
  }

  // ── Collections ───────────────────────────────────────────────────────────
  if (hasModule('collections')) {
    const collItems = [
      { path: '/erp/collections/ar', label: 'AR Aging', icon: BarChart3 },
      { path: '/erp/collections', label: 'Collections', icon: Wallet },
    ];
    if (ROLE_SETS.MANAGEMENT.includes(role)) {
      collItems.push({ path: '/erp/ic-settlements', label: 'IC Settlements', icon: Repeat });
    }
    collItems.sort((a, b) => a.label.localeCompare(b.label));
    sections.push({ title: 'Collections', collapsible: true, defaultOpen: true, items: collItems });
  }

  // ── Expenses ──────────────────────────────────────────────────────────────
  if (hasModule('expenses')) {
    const expItems = [{ path: '/erp/expenses', label: 'Expenses', icon: CreditCard }];
    if (isAdmin) expItems.push({ path: '/erp/credit-cards', label: 'Credit Cards', icon: CreditCard });
    expItems.sort((a, b) => a.label.localeCompare(b.label));
    sections.push({ title: 'Expenses', collapsible: true, defaultOpen: true, items: expItems });
  }

  // ── My Income (contractors only — BDMs view their own payslips) ─────────
  if (role === ROLES.CONTRACTOR && (hasModule('reports') || hasModule('people'))) {
    sections.push({
      title: 'My Income',
      collapsible: true,
      defaultOpen: true,
      items: [{ path: '/erp/my-income', label: 'My Income', icon: DollarSign }],
    });
  }

  // ── Reports ───────────────────────────────────────────────────────────────
  if (hasModule('reports')) {
    const repItems = [{ path: '/erp/reports', label: 'Reports', icon: BarChart3 }];
    if (isAdmin) repItems.push({ path: '/erp/budget-allocations', label: 'Budget Allocations', icon: DollarSign });
    repItems.sort((a, b) => a.label.localeCompare(b.label));
    sections.push({ title: 'Reports', collapsible: true, defaultOpen: false, items: repItems });
  }

  // ── Sales Goals & KPI (Phase 28) ────────────────────────────────────────
  if (hasModule('sales_goals')) {
    const goalItems = [
      { path: '/erp/sales-goals', label: 'Goal Dashboard', icon: Target },
      { path: '/erp/sales-goals/incentives', label: 'Incentive Tracker', icon: Trophy },
    ];
    if (isAdmin) {
      goalItems.push({ path: '/erp/sales-goals/setup', label: 'Goal Setup', icon: Settings });
    }
    goalItems.sort((a, b) => a.label.localeCompare(b.label));
    sections.push({ title: 'Sales Goals', collapsible: true, defaultOpen: false, items: goalItems });
  }

  // ── People & HR (admin-like only) ─────────────────────────────────────────
  if (hasModule('people') || hasModule('payroll')) {
    const hrItems = [];
    if (hasModule('people')) {
      hrItems.push({ path: '/erp/people', label: 'People', icon: UserCheck });
      hrItems.push({ path: '/erp/org-chart', label: 'Org Chart', icon: Network });
    }
    if (hasModule('payroll')) {
      hrItems.push({ path: '/erp/payroll', label: 'Payroll', icon: DollarSign });
    }
    hrItems.sort((a, b) => a.label.localeCompare(b.label));
    sections.push({ title: 'People & HR', collapsible: true, defaultOpen: isAdmin, items: hrItems });
  }

  // ── Accounting (admin-like only) ──────────────────────────────────────────
  if (hasModule('accounting')) {
    const accItems = [
      { path: '/erp/bank-accounts', label: 'Bank Accounts', icon: Landmark },
      { path: '/erp/bank-recon', label: 'Bank Reconciliation', icon: Scale },
      { path: '/erp/cashflow', label: 'Cashflow', icon: BookOpen },
      { path: '/erp/credit-card-ledger', label: 'CC Ledger', icon: CreditCard },
      { path: '/erp/coa', label: 'Chart of Accounts', icon: BookOpen },
      { path: '/erp/cost-centers', label: 'Cost Centers', icon: Layers },
      { path: '/erp/fixed-assets', label: 'Fixed Assets', icon: BookOpen },
      { path: '/erp/journals', label: 'Journal Entries', icon: BookOpen },
      { path: '/erp/loans', label: 'Loans', icon: BookOpen },
      { path: '/erp/owner-equity', label: 'Owner Equity', icon: BookOpen },
      { path: '/erp/petty-cash', label: 'Petty Cash', icon: Wallet },
      { path: '/erp/profit-loss', label: 'P&L Statement', icon: BookOpen },
      { path: '/erp/recurring-journals', label: 'Recurring Journals', icon: BookOpen },
      { path: '/erp/trial-balance', label: 'Trial Balance', icon: BookOpen },
      { path: '/erp/vat-compliance', label: 'VAT & CWT', icon: BookOpen },
    ];
    accItems.sort((a, b) => a.label.localeCompare(b.label));
    sections.push({
      title: 'Accounting',
      collapsible: true,
      defaultOpen: isAdmin,
      items: accItems,
    });
  }

  // ── Tools (admin-like only) ───────────────────────────────────────────────
  if (isAdmin) {
    const toolItems = [
      { path: '/erp/bir-calculator', label: 'BIR Calculator', icon: BookOpen },
      { path: '/erp/data-archive', label: 'Data Archive', icon: Archive },
      { path: '/erp/government-rates', label: 'Gov. Rates', icon: BookOpen },
      { path: '/erp/month-end-close', label: 'Month-End Close', icon: BookOpen },
      { path: '/erp/period-locks', label: 'Period Locks', icon: BookOpen },
    ];
    if (ROLE_SETS.MANAGEMENT.includes(role)) {
      toolItems.push({ path: '/erp/payment-modes', label: 'Payment Modes', icon: BookOpen });
    }
    toolItems.sort((a, b) => a.label.localeCompare(b.label));
    sections.push({ title: 'Tools', collapsible: true, defaultOpen: isAdmin, items: toolItems });
  }

  // ── Purchasing (admin-like only) ──────────────────────────────────────────
  if (hasModule('purchasing')) {
    const purItems = [
      { path: '/erp/accounts-payable', label: 'Accounts Payable', icon: Wallet },
      { path: '/erp/purchase-orders', label: 'Purchase Orders', icon: ShoppingCart },
      { path: '/erp/supplier-invoices', label: 'Supplier Invoices', icon: FileInput },
      { path: '/erp/vendors', label: 'Vendors', icon: Truck },
    ];
    purItems.sort((a, b) => a.label.localeCompare(b.label));
    sections.push({
      title: 'Purchasing',
      collapsible: true,
      defaultOpen: isAdmin,
      items: purItems,
    });
  }

  // ── Administration (admin-like only) — inserted at top, right after ERP Home ──
  if (ROLE_SETS.MANAGEMENT.includes(role)) {
    const adminItems = [];
    adminItems.push({ path: '/erp/approvals', label: 'Approvals', icon: ClipboardCheck, badge: approvalCount || null });
    adminItems.push({ path: '/erp/agent-dashboard', label: 'AI Agents', icon: Activity });
    adminItems.push({ path: '/erp/control-center', label: 'Control Center', icon: Settings });
    if (isAdmin) {
      adminItems.push({ path: '/erp/customers', label: 'Customers', icon: Users });
      adminItems.push({ path: '/erp/hospitals', label: 'Hospitals', icon: Stethoscope });
      adminItems.push({ path: '/erp/products', label: 'Product Master', icon: ShoppingCart });
    }
    adminItems.sort((a, b) => a.label.localeCompare(b.label));
    sections.splice(1, 0, { title: 'Administration', collapsible: true, defaultOpen: false, items: adminItems });
  }

  // For CRM sidebars, hide ERP section when only ERP Home+Hospitals available.
  const totalItems = sections.flatMap(s => s.items).length;
  if (!includeHomeOnly && totalItems <= 2) return null;
  return sections;
};

const getCrmMenuConfig = (role, unreadCount = 0) => {
  switch (role) {
    case ROLES.ADMIN:
    case ROLES.FINANCE:
    case ROLES.PRESIDENT:
    case ROLES.CEO:
      return {
        roleTitle: 'Administrator',
        roleSubtitle: 'Full Access',
        roleIcon: Shield,
        sections: [
          {
            title: 'Main',
            items: [
              { path: '/admin', label: 'Dashboard', icon: LayoutDashboard },
              { path: '/admin/activity', label: 'Activity', icon: Activity },
            ],
          },
          {
            title: 'Management',
            collapsible: true,
            defaultOpen: true,
            items: [
              { path: '/admin/doctors', label: 'VIP Clients', icon: Stethoscope },
              { path: '/admin/employees', label: 'BDMs', icon: Users },
              { path: '/admin/products', label: 'Products', icon: Package },
            ],
          },
          {
            title: 'Operations',
            collapsible: true,
            defaultOpen: false,
            items: [
              { path: '/admin/approvals', label: 'Import / Export', icon: FileSpreadsheet },
              { path: '/admin/statistics', label: 'Statistics', icon: BarChart3 },
              { path: '/admin/reports', label: 'Reports', icon: FileText },
              { path: '/admin/photo-audit', label: 'Photo Audit', icon: Camera },
              { path: '/admin/comm-logs', label: 'Comm Logs', icon: MessageSquare },
              { path: '/admin/message-templates', label: 'Msg Templates', icon: MessageSquare },
              { path: '/admin/settings', label: 'Programs', icon: Settings },
            ],
          },
        ],
        bottomTabs: [
          { path: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
          { path: '/admin/approvals', label: 'Import', icon: FileSpreadsheet },
          { path: '/admin/doctors', label: 'Clients', icon: Stethoscope },
          { path: '/admin/reports', label: 'Reports', icon: FileText },
        ],
      };
    default:
      return {
        roleTitle: 'Field BDM',
        roleSubtitle: 'BDM',
        roleIcon: UserCog,
        sections: [
          {
            title: 'Main',
            items: [{ path: '/bdm', label: 'Dashboard', icon: LayoutDashboard }],
          },
          {
            title: 'Work',
            collapsible: true,
            defaultOpen: true,
            items: [
              { path: '/bdm/cpt', label: 'Call Plan', icon: CalendarRange },
              { path: '/bdm/products', label: 'Products', icon: Package },
              { path: '/bdm/inbox', label: 'Mail', icon: Inbox, badge: unreadCount || null },
              { path: '/bdm/visits', label: 'My Visits', icon: ClipboardCheck },
              { path: '/bdm/comm-log', label: 'Comm Log', icon: MessageSquare },
            ],
          },
        ],
        bottomTabs: [
          { path: '/bdm', label: 'Dashboard', icon: LayoutDashboard, end: true },
          { path: '/bdm/cpt', label: 'Call Plan', icon: CalendarRange },
          { path: '/bdm/visits', label: 'Visits', icon: ClipboardCheck },
          { path: '/bdm/inbox', label: 'Inbox', icon: Inbox, badge: unreadCount || null },
        ],
      };
  }
};

const getErpMenuConfig = (role, erpAccess = null, approvalCount = 0) => {
  const erpSections = getErpSection(role, erpAccess, { includeHomeOnly: true });
  const sections = erpSections || [{ title: null, collapsible: false, items: [{ path: '/erp', label: 'ERP Home', icon: Briefcase }] }];
  const isAdminLike = isAdminLikeRole(role);

  // Bottom tabs: first 4 items across all sections
  const allErpItems = sections.flatMap(s => s.items);
  const bottomTabs = allErpItems.slice(0, 4).map((item) => ({ ...item, end: item.path === '/erp' }));

  return {
    roleTitle: isAdminLike ? 'Administrator' : 'Field BDM',
    roleSubtitle: isAdminLike ? 'Full Access' : 'BDM',
    roleIcon: isAdminLike ? Shield : UserCog,
    sections,
    bottomTabs,
  };
};

const getMenuConfig = (role, unreadCount = 0, erpAccess = null, pathname = '', approvalCount = 0) => {
  if (pathname.startsWith('/erp')) {
    return getErpMenuConfig(role, erpAccess, approvalCount);
  }

  const crmRole = isAdminLikeRole(role) ? ROLES.ADMIN : ROLES.CONTRACTOR;
  return getCrmMenuConfig(crmRole, unreadCount);
};

/* =============================================================================
   COMPONENT
   ============================================================================= */

const Sidebar = () => {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [expandedSections, setExpandedSections] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem('sidebar_expanded') || '{}'); } catch { return {}; }
  });

  const [unreadCount, setUnreadCount] = useState(0);
  const [approvalCount, setApprovalCount] = useState(0);
  const navRef = useRef(null);

  // Fetch unread message count for employee role
  const fetchUnreadCount = useCallback(async () => {
    if (user?.role !== ROLES.CONTRACTOR) return;
    try {
      const res = await messageService.getAll({ limit: 100 });
      const messages = res.data || res.messages || [];
      const count = messages.filter(
        (m) => !m.readBy?.includes(user._id) && !m.read
      ).length;
      setUnreadCount(count);
    } catch {
      // silently fail — badge just won't show
    }
  }, [user]);

  useEffect(() => {
    fetchUnreadCount();
    window.addEventListener('inbox:updated', fetchUnreadCount);
    return () => window.removeEventListener('inbox:updated', fetchUnreadCount);
  }, [fetchUnreadCount]);

  // Fetch pending approval count for management roles
  const fetchApprovalCount = useCallback(async () => {
    if (!ROLE_SETS.MANAGEMENT.includes(user?.role)) return;
    try {
      const res = await api.get('/api/erp/approvals/universal-pending');
      setApprovalCount(res.data?.count || (res.data?.data || []).length || 0);
    } catch { /* silently fail */ }
  }, [user]);

  useEffect(() => {
    fetchApprovalCount();
    const interval = setInterval(fetchApprovalCount, 60000);
    window.addEventListener('approval:updated', fetchApprovalCount);
    return () => { clearInterval(interval); window.removeEventListener('approval:updated', fetchApprovalCount); };
  }, [fetchApprovalCount]);

  const menuConfig = getMenuConfig(user?.role, unreadCount, user?.erp_access, location.pathname, approvalCount);
  const isAdminLike = isAdminLikeRole(user?.role);
  const crmHome = isAdminLike ? '/admin' : '/bdm';
  const isErpRoute = location.pathname.startsWith('/erp');

  const activePath = useMemo(() => {
    const allPaths = menuConfig.sections.flatMap(section => section.items.map(item => item.path));
    let bestPath = null;
    let bestLength = -1;

    for (const path of allPaths) {
      const isMatch = location.pathname === path || location.pathname.startsWith(`${path}/`);
      if (isMatch && path.length > bestLength) {
        bestPath = path;
        bestLength = path.length;
      }
    }

    return bestPath;
  }, [menuConfig.sections, location.pathname]);

  const isActive = (path) => {
    if (path === '/erp/sales/entry') {
      return location.pathname === '/erp/sales/entry' || location.pathname === '/erp/sales';
    }
    if (path === '/erp/sales') {
      return location.pathname === '/erp/sales';
    }
    return activePath === path;
  };

  // Listen for sidebar:toggle events from Navbar hamburger
  useEffect(() => {
    const handleToggle = () => setDrawerOpen(prev => !prev);
    window.addEventListener('sidebar:toggle', handleToggle);
    return () => window.removeEventListener('sidebar:toggle', handleToggle);
  }, []);

  // Close drawer on route change
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  // Preserve sidebar scroll position across navigation
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const saved = sessionStorage.getItem('sidebar_scroll');
    if (saved) nav.scrollTop = parseInt(saved, 10);
  }, [location.pathname]);

  const handleNavScroll = useCallback((e) => {
    sessionStorage.setItem('sidebar_scroll', e.currentTarget.scrollTop);
  }, []);

  // Prevent body scroll when drawer is open
  useEffect(() => {
    if (drawerOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [drawerOpen]);

  // Swipe gesture to open/close drawer
  useEffect(() => {
    let touchStartX = 0;
    let touchStartY = 0;
    const SWIPE_THRESHOLD = 50;

    const handleTouchStart = (e) => {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
    };

    const handleTouchEnd = (e) => {
      const touchEndX = e.changedTouches[0].clientX;
      const touchEndY = e.changedTouches[0].clientY;
      const deltaX = touchEndX - touchStartX;
      const deltaY = Math.abs(touchEndY - touchStartY);

      // Only count horizontal swipes (deltaX > threshold, deltaY small)
      if (Math.abs(deltaX) > SWIPE_THRESHOLD && deltaY < 100) {
        if (deltaX > 0 && !drawerOpen) {
          // Swipe right anywhere → open menu
          setDrawerOpen(true);
        } else if (deltaX < 0 && drawerOpen) {
          // Swipe left while open → close menu
          setDrawerOpen(false);
        }
      }
    };

    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchend', handleTouchEnd, { passive: true });
    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [drawerOpen]);

  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  const toggleSection = useCallback((title) => {
    setExpandedSections(prev => {
      const next = { ...prev, [title]: !prev[title] };
      try { sessionStorage.setItem('sidebar_expanded', JSON.stringify(next)); } catch { /* empty */ }
      return next;
    });
  }, []);

  const isSectionOpen = useCallback((section) => {
    if (!section.collapsible) return true;
    if (collapsed) return true; // icon-only: always show items
    const title = section.title;
    if (title in expandedSections) return expandedSections[title];
    // Auto-open if section contains the active route
    const hasActive = section.items.some(item => isActive(item.path));
    return section.defaultOpen || hasActive;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collapsed, expandedSections, location.pathname]);

  const handleDrawerNav = (path) => {
    navigate(path);
    setDrawerOpen(false);
  };

  return (
    <>
      <style>{sidebarStyles}</style>

      {/* ===== DESKTOP / TABLET SIDEBAR ===== */}
      <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
        {/* Toggle */}
        <button
          className="sidebar-toggle"
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>

        {/* Navigation */}
        <nav className="sidebar-nav" ref={navRef} onScroll={handleNavScroll}>
          {menuConfig.sections.map((section, sectionIndex) => {
            const isOpen = isSectionOpen(section);
            return (
              <div key={sectionIndex} className="sidebar-section">
                {section.title && (
                  section.collapsible ? (
                    <button className="sidebar-section-header" onClick={() => toggleSection(section.title)}>
                      <span className="sidebar-section-title">{section.title}</span>
                      <ChevronDown className={`sidebar-section-chevron ${isOpen ? 'open' : ''}`} size={14} />
                    </button>
                  ) : (
                    <div className="sidebar-section-title">{section.title}</div>
                  )
                )}
                {isOpen && (
                  <div className={section.collapsible ? 'sidebar-section-collapsible-items' : ''}>
                    {section.items.map((item) => {
                      const Icon = item.icon;
                      return (
                        <NavLink
                          key={item.path}
                          to={item.path}
                          className={`sidebar-link ${item.isChild ? 'sidebar-link-child' : ''} ${isActive(item.path) ? 'active' : ''}`}
                        >
                          <span className="sidebar-link-icon"><Icon size={20} /></span>
                          <span className="sidebar-link-label">{item.label}</span>
                          {item.badge && (
                            <span className={typeof item.badge === 'string' ? 'sidebar-badge-text' : 'sidebar-badge'}>{item.badge}</span>
                          )}
                          <span className="sidebar-tooltip">{item.label}</span>
                        </NavLink>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </aside>

      {/* ===== MOBILE BOTTOM TAB BAR ===== */}
      <nav className="mobile-tab-bar">
        <div className="mobile-tab-bar-inner">
          {menuConfig.bottomTabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <NavLink
                key={tab.path}
                to={tab.path}
                end={tab.end}
                className={`mobile-tab-item ${isActive(tab.path) ? 'active' : ''}`}
              >
                <Icon size={22} />
                <span>{tab.label}</span>
                {tab.badge && <span className={typeof tab.badge === 'string' ? 'tab-badge-text' : 'tab-badge'}>{tab.badge}</span>}
              </NavLink>
            );
          })}
          {/* Menu overflow tab — toggles drawer open/close */}
          <button
            className={`mobile-tab-item ${drawerOpen ? 'active' : ''}`}
            onClick={() => setDrawerOpen(prev => !prev)}
          >
            {drawerOpen ? <X size={22} /> : <Menu size={22} />}
            <span>Menu</span>
          </button>
        </div>
      </nav>

      {/* ===== MOBILE DRAWER ===== */}
      <div
        className={`mobile-drawer-backdrop ${drawerOpen ? 'visible' : ''}`}
        onClick={closeDrawer}
      />
      <div className={`mobile-drawer ${drawerOpen ? 'open' : ''}`}>
        <div className="mobile-drawer-header">
          <button className="mobile-drawer-close" onClick={closeDrawer}>
            <X size={20} />
          </button>
        </div>
        {user && (
          <div className="mobile-drawer-platform-switch" aria-label="Platform switch">
            <Link
              to={crmHome}
              className={`mobile-drawer-platform-link ${isErpRoute ? '' : 'active'}`.trim()}
              onClick={closeDrawer}
            >
              CRM
            </Link>
            <Link
              to="/erp"
              className={`mobile-drawer-platform-link ${isErpRoute ? 'active' : ''}`.trim()}
              onClick={closeDrawer}
            >
              ERP
            </Link>
          </div>
        )}
        <nav className="mobile-drawer-nav">
          {menuConfig.sections.map((section, sectionIndex) => {
            const isOpen = isSectionOpen(section);
            return (
              <div key={sectionIndex} className="sidebar-section">
                {section.title && (
                  section.collapsible ? (
                    <button className="sidebar-section-header" onClick={() => toggleSection(section.title)}>
                      <span className="sidebar-section-title">{section.title}</span>
                      <ChevronDown className={`sidebar-section-chevron ${isOpen ? 'open' : ''}`} size={14} />
                    </button>
                  ) : (
                    <div className="sidebar-section-title">{section.title}</div>
                  )
                )}
                {isOpen && (
                  <div className={section.collapsible ? 'sidebar-section-collapsible-items' : ''}>
                    {section.items.map((item) => {
                      const Icon = item.icon;
                      return (
                        <button
                          key={item.path}
                          className={`sidebar-link ${item.isChild ? 'sidebar-link-child' : ''} ${isActive(item.path) ? 'active' : ''}`}
                          onClick={() => handleDrawerNav(item.path)}
                          style={{ width: '100%', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                        >
                          <span className="sidebar-link-icon"><Icon size={22} /></span>
                          <span className="sidebar-link-label" style={{ display: 'block' }}>{item.label}</span>
                          {item.badge && (
                            <span className={typeof item.badge === 'string' ? 'sidebar-badge-text' : 'sidebar-badge'}>{item.badge}</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </div>
    </>
  );
};

export default Sidebar;
