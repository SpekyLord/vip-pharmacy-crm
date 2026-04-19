/**
 * Navbar Component - Responsive
 *
 * Top navigation bar with:
 * - Logo/brand (left side)
 * - Hamburger menu (mobile/tablet)
 * - CRM/ERP platform switch
 * - ERP quick tabs
 * - User profile summary
 * - Logout button
 */

import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  BarChart3,
  Briefcase,
  LayoutGrid,
  LogOut,
  Menu,
  Moon,
  Package,
  Receipt,
  Repeat,
  ShoppingCart,
  Sun,
  Wallet,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import useWorkingEntity from '../../hooks/useWorkingEntity';
// Phase G9.R6 — unified inbox bell with action-required + unread counts.
import NotificationBell from './NotificationBell';

const ERP_TABS = [
  { label: 'Dashboard', path: '/erp', icon: LayoutGrid },
  { label: 'Sales', path: '/erp/sales', icon: ShoppingCart },
  { label: 'Inventory', path: '/erp/my-stock', icon: Package },
  { label: 'Transfers', path: '/erp/transfers', icon: Repeat },
  { label: 'Collections', path: '/erp/collections', icon: Wallet },
  { label: 'Expenses', path: '/erp/expenses', icon: Receipt },
  { label: 'Reports', path: '/erp/reports', icon: BarChart3 },
];

import { ROLES, ROLE_SETS, isPresidentLike } from '../../constants/roles';
const ADMIN_LIKE_ROLES = ROLE_SETS.ADMIN_LIKE;

const CRM_ADMIN_TABS = [
  { label: 'Dashboard', path: '/admin' },
  { label: 'Activity', path: '/admin/activity' },
  { label: 'Clients', path: '/admin/doctors' },
  { label: 'Reports', path: '/admin/reports' },
];

const CRM_EMPLOYEE_TABS = [
  { label: 'Dashboard', path: '/bdm' },
  { label: 'Call Plan', path: '/bdm/cpt' },
  { label: 'Visits', path: '/bdm/visits' },
  { label: 'Inbox', path: '/bdm/inbox' },
];

const ERP_TAB_MODULE_MAP = {
  '/erp/sales': 'sales',
  '/erp/my-stock': 'inventory',
  '/erp/transfers': 'inventory',
  '/erp/collections': 'collections',
  '/erp/expenses': 'expenses',
  '/erp/reports': 'reports',
};

/* =============================================================================
   STYLES
   ============================================================================= */

const navbarStyles = `
  .navbar {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 16px;
    padding: 0 20px;
    min-height: 56px;
    background: white;
    border-bottom: 1px solid #e5e7eb;
    position: sticky;
    top: 0;
    z-index: 100;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  }

  .navbar-left {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  .navbar-center {
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    overflow: hidden;
  }

  .navbar-platform-switch {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px;
    background: #f3f4f6;
    border: 1px solid #e5e7eb;
    border-radius: 999px;
    flex-shrink: 0;
  }

  .navbar-platform-switch--mobile {
    display: none;
  }

  .navbar-platform-link {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 34px;
    padding: 0 14px;
    border-radius: 999px;
    text-decoration: none;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: #64748b;
    transition: all 0.2s ease;
    gap: 6px;
  }

  .navbar-platform-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .navbar-platform-link.active {
    background: #0f172a;
    color: white;
    box-shadow: 0 8px 18px rgba(15, 23, 42, 0.16);
  }

  .navbar-erp-tabs {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    overflow: hidden;
  }

  .navbar-erp-tabs--fluid {
    flex-wrap: wrap;
    justify-content: center;
    row-gap: 8px;
  }

  .navbar-erp-tab {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 36px;
    padding: 0 14px;
    border-radius: 12px;
    border: 1px solid #dbe3ef;
    background: #f8fafc;
    color: #475569;
    font-size: 13px;
    font-weight: 600;
    white-space: nowrap;
    text-decoration: none;
    transition: all 0.18s ease;
    flex-shrink: 0;
  }

  .navbar-erp-tab--stacked {
    flex-direction: column;
    min-height: 54px;
    padding: 6px 10px;
    gap: 4px;
    flex: 1 1 0;
    min-width: 64px;
  }

  .navbar-erp-tab-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .navbar-erp-tab-label {
    font-size: 11px;
    line-height: 1;
    letter-spacing: 0.02em;
  }

  .navbar-erp-tab:hover {
    border-color: #c7d7fe;
    color: #1d4ed8;
    background: #eef4ff;
  }

  .navbar-erp-tab.active {
    border-color: #b9d0ff;
    background: #e8efff;
    color: #1d4ed8;
  }

  .navbar-brand {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    min-width: 0;
  }

  .navbar-logo {
    height: 72px;
    width: 72px;
    object-fit: contain;
    object-position: center;
    flex-shrink: 0;
    margin: 0;
  }

  .navbar-brand h1 {
    margin: 0;
    font-size: 20px;
    font-weight: 700;
    color: #1f2937;
    letter-spacing: -0.5px;
    white-space: nowrap;
  }

  .navbar-brand h1 span {
    color: #e8af30;
  }

  .navbar-hamburger {
    display: none;
    width: 44px;
    height: 44px;
    align-items: center;
    justify-content: center;
    background: none;
    border: none;
    color: #374151;
    cursor: pointer;
    border-radius: 10px;
    -webkit-tap-highlight-color: transparent;
    transition: background 0.15s;
    flex-shrink: 0;
  }

  .navbar-hamburger:hover {
    background: #f3f4f6;
  }

  .navbar-hamburger:active {
    background: #e5e7eb;
  }

  .navbar-entity-select {
    padding: 5px 26px 5px 10px;
    border: 2px solid #e8af30;
    border-radius: 8px;
    background: #fffbeb;
    font-size: 13px;
    font-weight: 600;
    color: #92400e;
    cursor: pointer;
    appearance: auto;
    max-width: 170px;
    flex-shrink: 0;
  }
  .navbar-entity-select:focus {
    outline: none;
    box-shadow: 0 0 0 3px rgba(232,175,48,0.25);
  }
  body.dark-mode .navbar-entity-select {
    background: #422006;
    color: #fbbf24;
    border-color: #d97706;
  }

  .navbar-menu {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }

  .navbar-profile {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 4px 10px 4px 4px;
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 12px;
  }

  .navbar-avatar,
  .navbar-avatar-mobile {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-weight: 600;
  }

  .navbar-avatar {
    width: 32px;
    height: 32px;
    border-radius: 10px;
    font-size: 12px;
  }

  .navbar-avatar-mobile {
    display: none;
    width: 32px;
    height: 32px;
    border-radius: 8px;
    font-size: 12px;
  }

  .navbar-profile-info {
    text-align: left;
  }

  .navbar-profile-name {
    font-size: 14px;
    font-weight: 600;
    color: #1f2937;
    line-height: 1.2;
  }

  .navbar-profile-role {
    font-size: 11px;
    color: #6b7280;
    text-transform: capitalize;
  }

  .navbar-logout {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 10px;
    font-size: 13px;
    font-weight: 500;
    color: #6b7280;
    cursor: pointer;
    transition: all 0.2s;
  }

  .navbar-logout:hover {
    background: #fef2f2;
    border-color: #fecaca;
    color: #dc2626;
  }

  .navbar-logout-text {
    display: inline;
  }

  .navbar-divider {
    width: 1px;
    height: 32px;
    background: #e5e7eb;
    margin: 0 8px;
  }

  .navbar-theme-btn {
    width: 34px;
    height: 34px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 10px;
    cursor: pointer;
    color: #6b7280;
    transition: all 0.2s;
    flex-shrink: 0;
  }

  .navbar-theme-btn:hover {
    background: #f3f4f6;
    color: #1f2937;
    border-color: #d1d5db;
  }

  body.dark-mode .navbar {
    background: #0f172a;
    border-bottom-color: #1e293b;
  }

  body.dark-mode .navbar-platform-switch {
    background: #111827;
    border-color: #334155;
  }

  body.dark-mode .navbar-platform-link {
    color: #94a3b8;
  }

  body.dark-mode .navbar-platform-link.active {
    background: #f8fafc;
    color: #0f172a;
  }

  body.dark-mode .navbar-erp-tab {
    background: #111827;
    border-color: #334155;
    color: #cbd5e1;
  }

  body.dark-mode .navbar-erp-tab:hover {
    background: #16233b;
    border-color: #3b82f6;
    color: #93c5fd;
  }

  body.dark-mode .navbar-erp-tab.active {
    background: #1d4ed8;
    border-color: #60a5fa;
    color: white;
  }

  body.dark-mode .navbar-brand h1 {
    color: #f1f5f9;
  }

  body.dark-mode .navbar-hamburger {
    color: #94a3b8;
  }

  body.dark-mode .navbar-hamburger:hover {
    background: #1e293b;
  }

  body.dark-mode .navbar-profile {
    background: #1e293b;
    border-color: #334155;
  }

  body.dark-mode .navbar-profile-name {
    color: #f1f5f9;
  }

  body.dark-mode .navbar-profile-role {
    color: #94a3b8;
  }

  body.dark-mode .navbar-divider {
    background: #334155;
  }

  body.dark-mode .navbar-logout {
    background: #1e293b;
    border-color: #334155;
    color: #94a3b8;
  }

  body.dark-mode .navbar-logout:hover {
    background: #450a0a;
    border-color: #7f1d1d;
    color: #f87171;
  }

  body.dark-mode .navbar-theme-btn {
    background: #1e293b;
    border-color: #334155;
    color: #94a3b8;
  }

  body.dark-mode .navbar-theme-btn:hover {
    background: #334155;
    color: #f1f5f9;
  }

  @media (max-width: 1280px) {
    .navbar {
      padding: 0 14px;
      gap: 10px;
    }

    .navbar-platform-link {
      padding: 0 12px;
    }

    .navbar-erp-tab {
      padding: 0 12px;
      font-size: 12px;
    }
  }

  @media (max-width: 1024px) {
    .navbar-erp-tabs--fluid {
      flex-wrap: nowrap;
      justify-content: flex-start;
      overflow-x: auto;
      scrollbar-width: none;
      -ms-overflow-style: none;
    }

    .navbar-erp-tabs--fluid::-webkit-scrollbar {
      display: none;
    }

    .navbar-erp-tab--stacked {
      flex: 0 0 auto;
    }

    .navbar-profile-info {
      display: none;
    }

    .navbar-profile {
      padding: 6px;
    }

    .navbar-logout-text {
      display: none;
    }

    .navbar-logout {
      padding: 10px;
    }

  }

  @media (max-width: 768px) {
    .navbar {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      width: 100%;
    }

    .navbar-center {
      justify-content: flex-start;
    }

    .navbar-erp-tabs {
      gap: 6px;
    }

    .navbar-erp-tab {
      min-height: 34px;
      padding: 0 10px;
    }
  }

  @media (max-width: 480px) {
    .navbar {
      padding: 0 12px;
      min-height: 56px;
      gap: 8px;
      grid-template-columns: auto 1fr auto;
    }

    .navbar-hamburger {
      display: flex;
      order: 0;
      width: 44px;
      height: 44px;
    }

    .navbar-brand {
      display: none;
    }

    .navbar-platform-switch {
      display: none;
    }

    .navbar-center {
      flex: 1;
      justify-content: center;
      min-width: 0;
      order: 1;
    }

    .navbar-erp-tabs {
      display: none;
    }

    .navbar-center .navbar-platform-switch {
      display: none;
    }

    .navbar-entity-select {
      max-width: 160px;
      padding: 6px 26px 6px 10px;
      font-size: 13px;
    }

    .navbar-profile {
      display: none;
    }

    .navbar-divider {
      display: none;
    }

    .navbar-logout {
      padding: 8px;
      border: none;
      background: none;
    }

    .navbar-avatar-mobile {
      display: flex;
      width: 32px;
      height: 32px;
      font-size: 12px;
    }

    .navbar-theme-btn {
      width: 34px;
      height: 34px;
    }

    .navbar-menu {
      gap: 6px;
      order: 2;
    }
  }
`;

/* =============================================================================
   COMPONENT
   ============================================================================= */

const Navbar = () => {
  const { user, logout } = useAuth();
  const { entities, workingEntityId, setWorkingEntityId, isMultiEntity } = useWorkingEntity();
  const location = useLocation();
  const [isDark, setIsDark] = useState(() => {
    try {
      const stored = localStorage.getItem('darkMode');
      if (stored === 'true' || stored === 'false') {
        return stored === 'true';
      }
    } catch {
      // Ignore
    }
    return document.body.classList.contains('dark-mode');
  });

  useEffect(() => {
    document.body.classList.toggle('dark-mode', isDark);
    try {
      localStorage.setItem('darkMode', String(isDark));
    } catch {
      // Ignore
    }
  }, [isDark]);

  const toggleTheme = () => {
    setIsDark((prev) => !prev);
  };

  const getInitials = (name) => {
    if (!name) return 'U';
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const handleHamburgerClick = () => {
    window.dispatchEvent(new CustomEvent('sidebar:toggle'));
  };

  const isAdminLike = ADMIN_LIKE_ROLES.includes(user?.role);
  const crmHome = isAdminLike ? '/admin' : '/bdm';
  const isErpRoute = location.pathname.startsWith('/erp');

  const hasErpModule = (moduleName) => {
    if (!user) return false;
    if (isPresidentLike(user.role)) return true;
    if (user.role === ROLES.ADMIN && (!user.erp_access || !user.erp_access.enabled)) return true;
    if (!user.erp_access || !user.erp_access.enabled) return false;
    return (user.erp_access.modules?.[moduleName] || 'NONE') !== 'NONE';
  };

  const erpTabs = ERP_TABS.filter((tab) => {
    const moduleName = ERP_TAB_MODULE_MAP[tab.path];
    if (!moduleName) return true;
    return hasErpModule(moduleName);
  });
  const platformTabs = isErpRoute ? erpTabs : (isAdminLike ? CRM_ADMIN_TABS : CRM_EMPLOYEE_TABS);

  const isTabActive = (path) => {
    if (path === '/erp' || path === '/admin' || path === '/bdm') {
      return location.pathname === path;
    }
    return location.pathname.startsWith(path);
  };

  return (
    <nav className="navbar">
      <style>{navbarStyles}</style>

      <div className="navbar-left">
        <button
          className="navbar-hamburger"
          onClick={handleHamburgerClick}
          aria-label="Open menu"
        >
          <Menu size={24} />
        </button>

        <div className="navbar-brand">
          <img src="/image-removebg-preview (1).png" alt="VIP" className="navbar-logo" />
        </div>

        {user && (
          <div className="navbar-platform-switch" aria-label="Platform switch">
            <Link
              to={crmHome}
              className={`navbar-platform-link ${isErpRoute ? '' : 'active'}`.trim()}
            >
              <span className="navbar-platform-icon" aria-hidden="true">
                <LayoutGrid size={14} />
              </span>
              CRM
            </Link>
            <Link
              to="/erp"
              className={`navbar-platform-link ${isErpRoute ? 'active' : ''}`.trim()}
            >
              <span className="navbar-platform-icon" aria-hidden="true">
                <Briefcase size={14} />
              </span>
              ERP
            </Link>
          </div>
        )}
      </div>

      {user ? (
        <div className="navbar-center">
                <span className="navbar-platform-icon" aria-hidden="true">
                  <LayoutGrid size={14} />
                </span>

          <div
            className={`navbar-erp-tabs ${isErpRoute ? 'navbar-erp-tabs--fluid' : ''}`.trim()}
            aria-label={isErpRoute ? 'ERP tabs' : 'CRM tabs'}
          >
            {platformTabs.map((tab) => {
                <span className="navbar-platform-icon" aria-hidden="true">
                  <Briefcase size={14} />
                </span>
              const isActive = isTabActive(tab.path);
              const Icon = tab.icon;
              return (
                <Link
                  key={tab.label}
                  to={tab.path}
                  className={`navbar-erp-tab ${isErpRoute ? 'navbar-erp-tab--stacked' : ''} ${isActive ? 'active' : ''}`.trim()}
                >
                  {Icon && (
                    <span className="navbar-erp-tab-icon" aria-hidden="true">
                      <Icon size={18} />
                    </span>
                  )}
                  <span className="navbar-erp-tab-label">{tab.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      ) : (
        <div />
      )}

      <div className="navbar-menu">
        {isMultiEntity && entities.length > 0 && (
          <select
            className="navbar-entity-select"
            value={workingEntityId || ''}
            onChange={(e) => setWorkingEntityId(e.target.value)}
            aria-label="Working entity"
          >
            {entities.map(ent => (
              <option key={ent._id} value={ent._id}>
                {ent.short_name || ent.entity_name}
              </option>
            ))}
          </select>
        )}

        <button className="navbar-theme-btn" onClick={toggleTheme} aria-label="Toggle dark mode">
          {isDark ? <Sun size={17} /> : <Moon size={17} />}
        </button>

        {user && <NotificationBell />}

        {user && (
          <>
            <div className="navbar-divider" />

            <div className="navbar-avatar-mobile">{getInitials(user.name)}</div>

            <div className="navbar-profile">
              <div className="navbar-avatar">{getInitials(user.name)}</div>
              <div className="navbar-profile-info">
                <div className="navbar-profile-name">{user.name}</div>
                <div className="navbar-profile-role">
                  {user.role === ROLES.CONTRACTOR ? 'BDM' : user.role}
                </div>
              </div>
            </div>

            <button className="navbar-logout" onClick={logout}>
              <LogOut size={16} />
              <span className="navbar-logout-text">Logout</span>
            </button>
          </>
        )}
      </div>
    </nav>
  );
};

export default Navbar;
