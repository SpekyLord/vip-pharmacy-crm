/**
 * Navbar Component - Responsive
 *
 * Top navigation bar with:
 * - Logo/brand (left side)
 * - Hamburger menu (mobile/tablet)
 * - Notifications (Bell icon with dropdown)
 * - User profile dropdown
 * - Logout button
 *
 * Mobile: hamburger + logo + notification bell + avatar
 * Desktop: full layout
 */

import { useEffect, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { LogOut, Menu, Moon, Sun } from 'lucide-react';

/* =============================================================================
   STYLES
   ============================================================================= */

const navbarStyles = `
  .navbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 24px;
    height: 68px;
    background: white;
    border-bottom: 1px solid #e5e7eb;
    position: sticky;
    top: 0;
    z-index: 100;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  }

  /* Logo Section */
  .navbar-brand {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .navbar-logo {
    height: 80px;
    width: auto;
    object-fit: contain;
  }

  .navbar-brand h1 {
    margin: 0;
    font-size: 20px;
    font-weight: 700;
    color: #1f2937;
    letter-spacing: -0.5px;
  }

  .navbar-brand h1 span {
    color: #E8AF30;
  }

  /* Hamburger */
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
  }

  .navbar-hamburger:hover {
    background: #f3f4f6;
  }

  .navbar-hamburger:active {
    background: #e5e7eb;
  }

  /* Left section with hamburger + brand */
  .navbar-left {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  /* Right Menu */
  .navbar-menu {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  /* User Profile */
  .navbar-profile {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 12px 6px 6px;
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 12px;
  }

  .navbar-avatar {
    width: 36px;
    height: 36px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-weight: 600;
    font-size: 14px;
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

  /* Logout Button */
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

  /* Divider between elements */
  .navbar-divider {
    width: 1px;
    height: 32px;
    background: #e5e7eb;
    margin: 0 8px;
  }

  /* Dark Mode Toggle */
  .navbar-theme-btn {    width: 38px;
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

  body.dark-mode .navbar-theme-btn {
    background: #1e293b;
    border-color: #334155;
    color: #94a3b8;
  }

  body.dark-mode .navbar-theme-btn:hover {
    background: #334155;
    color: #f1f5f9;
  }

  /* Dark mode — navbar shell */
  body.dark-mode .navbar {
    background: #0f172a;
    border-bottom-color: #1e293b;
  }
  body.dark-mode .navbar-brand h1 { color: #f1f5f9; }
  body.dark-mode .navbar-hamburger { color: #94a3b8; }
  body.dark-mode .navbar-hamburger:hover { background: #1e293b; }
  body.dark-mode .navbar-profile {
    background: #1e293b;
    border-color: #334155;
  }
  body.dark-mode .navbar-profile-name { color: #f1f5f9; }
  body.dark-mode .navbar-profile-role { color: #94a3b8; }
  body.dark-mode .navbar-divider { background: #334155; }
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

  /* ===== TABLET ===== */
  @media (max-width: 1024px) {
    .navbar {
      padding: 0 16px;
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

  /* ===== MOBILE ===== */
  @media (max-width: 480px) {
    .navbar {
      padding: 0 12px;
      height: 60px;
    }

    .navbar-hamburger {
      display: flex;
    }

    .navbar-brand h1 {
      display: none;
    }

    .navbar-logo {
      height: 75px;
      width: auto;
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

    .navbar-logout-text {
      display: none;
    }

    .navbar-avatar-mobile {
      width: 32px;
      height: 32px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-weight: 600;
      font-size: 12px;
    }

    .navbar-menu {
      gap: 4px;
    }
  }

  /* Hide mobile avatar on desktop */
  .navbar-avatar-mobile {
    display: none;
  }

  @media (max-width: 480px) {
    .navbar-avatar-mobile {
      display: flex;
    }
  }
`;

/* =============================================================================
   COMPONENT
   ============================================================================= */

const Navbar = () => {
  const { user, logout } = useAuth();
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

  // Get user initials
  const getInitials = (name) => {
    if (!name) return 'U';
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  // Dispatch event to open sidebar drawer
  const handleHamburgerClick = () => {
    window.dispatchEvent(new CustomEvent('sidebar:toggle'));
  };

  return (
    <nav className="navbar">
      <style>{navbarStyles}</style>

      {/* Left: Hamburger + Logo */}
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
          <h1>VIP <span>Pharmacy</span> CRM</h1>
        </div>
      </div>

      {/* Right Menu */}
      <div className="navbar-menu">
        {/* Dark mode toggle */}
        <button className="navbar-theme-btn" onClick={toggleTheme} aria-label="Toggle dark mode">
          {isDark ? <Sun size={17} /> : <Moon size={17} />}
        </button>

        {user && (
          <>
            <div className="navbar-divider" />

            {/* Mobile Avatar */}
            <div className="navbar-avatar-mobile">
              {getInitials(user.name)}
            </div>

            {/* Desktop User Profile Display */}
            <div className="navbar-profile">
              <div className="navbar-avatar">
                {getInitials(user.name)}
              </div>
              <div className="navbar-profile-info">
                <div className="navbar-profile-name">{user.name}</div>
                <div className="navbar-profile-role">{user.role === 'employee' ? 'BDM' : user.role}</div>
              </div>
            </div>

            {/* Logout Button */}
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
