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
import { LogOut, Menu, Moon, Sun } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';

const ERP_TABS = [
  { label: 'Dashboard', path: '/erp' },
  { label: 'Sales', disabled: true },
  { label: 'Inventory', disabled: true },
  { label: 'Collections', disabled: true },
  { label: 'Expenses', disabled: true },
  { label: 'Reports', disabled: true },
];

/* =============================================================================
   STYLES
   ============================================================================= */

const navbarStyles = `
  .navbar {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 16px;
    padding: 0 24px;
    min-height: 68px;
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
    overflow-x: auto;
    scrollbar-width: none;
    -ms-overflow-style: none;
  }

  .navbar-erp-tabs::-webkit-scrollbar {
    display: none;
  }

  .navbar-erp-tab,
  .navbar-erp-tab-disabled {
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

  .navbar-erp-tab-disabled {
    opacity: 0.75;
    cursor: not-allowed;
  }

  .navbar-brand {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
  }

  .navbar-logo {
    height: 80px;
    width: auto;
    object-fit: contain;
    flex-shrink: 0;
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
    padding: 6px 12px 6px 6px;
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
    width: 36px;
    height: 36px;
    border-radius: 10px;
    font-size: 14px;
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
    padding: 10px 16px;
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 10px;
    font-size: 14px;
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
    width: 38px;
    height: 38px;
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

  body.dark-mode .navbar-erp-tab,
  body.dark-mode .navbar-erp-tab-disabled {
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
      padding: 0 16px;
      gap: 10px;
    }

    .navbar-platform-link {
      padding: 0 12px;
    }

    .navbar-erp-tab,
    .navbar-erp-tab-disabled {
      padding: 0 12px;
      font-size: 12px;
    }
  }

  @media (max-width: 1024px) {
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

    .navbar-erp-tab-disabled {
      display: none;
    }
  }

  @media (max-width: 768px) {
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
      min-height: 60px;
      gap: 8px;
    }

    .navbar-hamburger {
      display: flex;
    }

    .navbar-brand h1 {
      display: none;
    }

    .navbar-logo {
      height: 75px;
    }

    .navbar-center {
      justify-content: center;
    }

    .navbar-erp-tabs {
      display: none;
    }

    .navbar-platform-switch {
      width: 100%;
      max-width: 138px;
    }

    .navbar-platform-link {
      flex: 1;
      padding: 0 8px;
      font-size: 11px;
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
    }

    .navbar-menu {
      gap: 4px;
    }
  }
`;

/* =============================================================================
   COMPONENT
   ============================================================================= */

const Navbar = () => {
  const { user, logout } = useAuth();
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

  const crmHome = user?.role === 'admin' ? '/admin' : '/bdm';
  const isErpRoute = location.pathname.startsWith('/erp');

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
          <img src="/VIP_LOGO-removebg.svg" alt="VIP" className="navbar-logo" />
          <h1>
            VIP <span>Pharmacy</span> CRM
          </h1>
        </div>
      </div>

      {user ? (
        <div className="navbar-center">
          <div className="navbar-platform-switch" aria-label="Platform switch">
            <Link
              to={crmHome}
              className={`navbar-platform-link ${isErpRoute ? '' : 'active'}`.trim()}
            >
              CRM
            </Link>
            <Link
              to="/erp"
              className={`navbar-platform-link ${isErpRoute ? 'active' : ''}`.trim()}
            >
              ERP
            </Link>
          </div>

          <div className="navbar-erp-tabs" aria-label="ERP tabs">
            {ERP_TABS.map((tab) =>
              tab.disabled ? (
                <button
                  key={tab.label}
                  type="button"
                  className="navbar-erp-tab-disabled"
                  disabled
                  aria-disabled="true"
                  title={`${tab.label} coming soon`}
                >
                  {tab.label}
                </button>
              ) : (
                <Link
                  key={tab.label}
                  to={tab.path}
                  className={`navbar-erp-tab ${isErpRoute ? 'active' : ''}`.trim()}
                >
                  {tab.label}
                </Link>
              )
            )}
          </div>
        </div>
      ) : (
        <div />
      )}

      <div className="navbar-menu">
        <button className="navbar-theme-btn" onClick={toggleTheme} aria-label="Toggle dark mode">
          {isDark ? <Sun size={17} /> : <Moon size={17} />}
        </button>

        {user && (
          <>
            <div className="navbar-divider" />

            <div className="navbar-avatar-mobile">{getInitials(user.name)}</div>

            <div className="navbar-profile">
              <div className="navbar-avatar">{getInitials(user.name)}</div>
              <div className="navbar-profile-info">
                <div className="navbar-profile-name">{user.name}</div>
                <div className="navbar-profile-role">
                  {user.role === 'employee' ? 'BDM' : user.role}
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
