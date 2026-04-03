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

import { useState, useEffect, useCallback } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import messageService from '../../services/messageInboxService';
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
  PlusCircle,
  Camera,
  Settings,
  Briefcase,
  DollarSign,
  UserCheck,
  CreditCard,
  Receipt,
  Wallet,
  BookOpen,
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
    z-index: 300;
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
    z-index: 301;
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
    padding: 12px;
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
  }
`;

/* =============================================================================
   MENU CONFIGURATION
   ============================================================================= */

/**
 * Build ERP sidebar section based on user's erp_access.
 * Returns null if no ERP modules are accessible.
 */
const getErpSection = (role, erpAccess) => {
  // Determine effective access per module
  const hasModule = (mod) => {
    if (role === 'president' || role === 'ceo') return true;
    if (role === 'admin' && (!erpAccess || !erpAccess.enabled)) return true;
    if (!erpAccess || !erpAccess.enabled) return false;
    return erpAccess.modules?.[mod] && erpAccess.modules[mod] !== 'NONE';
  };

  const items = [];
  items.push({ path: '/erp', label: 'ERP Home', icon: Briefcase });
  if (hasModule('sales'))       items.push({ path: '/erp/sales', label: 'Sales', icon: Receipt });
  if (hasModule('inventory'))   items.push({ path: '/erp/my-stock', label: 'Inventory', icon: Package });
  if (hasModule('collections')) items.push({ path: '/erp/collections', label: 'Collections', icon: Wallet });
  if (hasModule('expenses'))    items.push({ path: '/erp/expenses', label: 'Expenses', icon: CreditCard });
  if (hasModule('reports'))     items.push({ path: '/erp/reports', label: 'Reports', icon: BarChart3 });
  if (hasModule('people'))      items.push({ path: '/erp/people', label: 'People', icon: UserCheck });
  if (hasModule('payroll'))     items.push({ path: '/erp/payroll', label: 'Payroll', icon: DollarSign });
  if (hasModule('accounting'))  items.push({ path: '/erp/pnl', label: 'Accounting', icon: BookOpen });

  // Only show section if at least ERP Home + 1 module
  if (items.length <= 1) return null;
  return { title: 'ERP', items };
};

const getMenuConfig = (role, unreadCount = 0, erpAccess = null) => {
  switch (role) {
    case 'admin': {
      const erpSection = getErpSection(role, erpAccess);
      const sections = [
        {
          title: 'Main',
          items: [
            { path: '/admin', label: 'Dashboard', icon: LayoutDashboard },
            { path: '/admin/activity', label: 'Activity', icon: Activity },
          ],
        },
        {
          title: 'Management',
          items: [
            { path: '/admin/doctors', label: 'VIP Clients', icon: Stethoscope },
            { path: '/admin/employees', label: 'BDMs', icon: Users },
            { path: '/admin/products', label: 'Products', icon: Package },
          ],
        },
        {
          title: 'Operations',
          items: [
            { path: '/admin/approvals', label: 'Import / Export', icon: FileSpreadsheet },
            { path: '/admin/statistics', label: 'Statistics', icon: BarChart3 },
            { path: '/admin/reports', label: 'Reports', icon: FileText },
            { path: '/admin/photo-audit', label: 'Photo Audit', icon: Camera },
            { path: '/admin/settings', label: 'Programs', icon: Settings },
          ],
        },
      ];
      if (erpSection) sections.push(erpSection);
      return {
        roleTitle: 'Administrator',
        roleSubtitle: 'Full Access',
        roleIcon: Shield,
        sections,
        bottomTabs: [
          { path: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
          { path: '/admin/approvals', label: 'Import', icon: FileSpreadsheet },
          { path: '/admin/doctors', label: 'Clients', icon: Stethoscope },
          { path: '/admin/reports', label: 'Reports', icon: FileText },
        ],
      };
    }

    case 'employee':
    default: {
      const erpSection = getErpSection(role, erpAccess);
      const sections = [
        {
          title: 'Main',
          items: [
            { path: '/bdm', label: 'Dashboard', icon: LayoutDashboard },
          ],
        },
        {
          title: 'Work',
          items: [
            { path: '/bdm/cpt', label: 'Call Plan', icon: CalendarRange },
            { path: '/bdm/products', label: 'Products', icon: Package },
            { path: '/bdm/inbox', label: 'Mail', icon: Inbox, badge: unreadCount || null },
            { path: '/bdm/visits', label: 'My Visits', icon: ClipboardCheck },
          ],
        },
      ];
      if (erpSection) sections.push(erpSection);
      return {
        roleTitle: 'Field BDM',
        roleSubtitle: 'BDM',
        roleIcon: UserCog,
        sections,
        bottomTabs: [
          { path: '/bdm', label: 'Dashboard', icon: LayoutDashboard, end: true },
          { path: '/bdm/cpt', label: 'Call Plan', icon: CalendarRange },
          { path: '/bdm/visits', label: 'Visits', icon: ClipboardCheck },
          { path: '/bdm/inbox', label: 'Inbox', icon: Inbox, badge: unreadCount || null },
        ],
      };
    }
  }
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

  const [unreadCount, setUnreadCount] = useState(0);

  // Fetch unread message count for employee role
  const fetchUnreadCount = useCallback(async () => {
    if (user?.role !== 'employee') return;
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
    // Refresh when inbox marks messages as read
    window.addEventListener('inbox:updated', fetchUnreadCount);
    return () => window.removeEventListener('inbox:updated', fetchUnreadCount);
  }, [fetchUnreadCount]);

  const menuConfig = getMenuConfig(user?.role, unreadCount, user?.erp_access);
  const RoleIcon = menuConfig.roleIcon;

  const isActive = (path) => {
    if (path === '/admin' || path === '/bdm') {
      return location.pathname === path;
    }
    return location.pathname.startsWith(path);
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

  const handleDrawerNav = (path) => {
    navigate(path);
    setDrawerOpen(false);
  };

  // Get all flat items for the drawer
  const allItems = menuConfig.sections.flatMap(s => s.items);

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
        <nav className="sidebar-nav">
          {menuConfig.sections.map((section, sectionIndex) => (
            <div key={sectionIndex} className="sidebar-section">
              <div className="sidebar-section-title">{section.title}</div>
              {section.items.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    className={`sidebar-link ${isActive(item.path) ? 'active' : ''}`}
                  >
                    <span className="sidebar-link-icon">
                      <Icon size={20} />
                    </span>
                    <span className="sidebar-link-label">{item.label}</span>
                    {item.badge && (
                      <span className={typeof item.badge === 'string' ? 'sidebar-badge-text' : 'sidebar-badge'}>{item.badge}</span>
                    )}
                    <span className="sidebar-tooltip">{item.label}</span>
                  </NavLink>
                );
              })}
            </div>
          ))}
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
        <nav className="mobile-drawer-nav">
          {menuConfig.sections.map((section, sectionIndex) => (
            <div key={sectionIndex} className="sidebar-section">
              <div className="sidebar-section-title">{section.title}</div>
              {section.items.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.path}
                    className={`sidebar-link ${isActive(item.path) ? 'active' : ''}`}
                    onClick={() => handleDrawerNav(item.path)}
                    style={{ width: '100%', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                  >
                    <span className="sidebar-link-icon">
                      <Icon size={22} />
                    </span>
                    <span className="sidebar-link-label" style={{ display: 'block' }}>
                      {item.label}
                    </span>
                    {item.badge && (
                      <span className={typeof item.badge === 'string' ? 'sidebar-badge-text' : 'sidebar-badge'}>{item.badge}</span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
      </div>
    </>
  );
};

export default Sidebar;
