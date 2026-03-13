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

import { useAuth } from '../../hooks/useAuth';
import { LogOut, Menu } from 'lucide-react';

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
    color: #3b82f6;
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
