/**
 * Navbar Component - Redesigned
 *
 * Top navigation bar with:
 * - Logo/brand (left side - preserved)
 * - Search bar (center)
 * - Notifications (Bell icon with dropdown)
 * - User profile dropdown
 * - Logout button
 */

import { useAuth } from '../../hooks/useAuth';
import NotificationCenter from './NotificationCenter';
import { LogOut } from 'lucide-react';

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
    width: 42px;
    height: 42px;
    background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-weight: 800;
    font-size: 18px;
    box-shadow: 0 2px 8px rgba(59, 130, 246, 0.3);
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

  /* Divider between elements */
  .navbar-divider {
    width: 1px;
    height: 32px;
    background: #e5e7eb;
    margin: 0 8px;
  }

  /* Responsive */
  @media (max-width: 640px) {
    .navbar {
      padding: 0 16px;
    }
    .navbar-brand h1 {
      display: none;
    }
    .navbar-profile-info {
      display: none;
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

  return (
    <nav className="navbar">
      <style>{navbarStyles}</style>

      {/* Logo - Preserved on left */}
      <div className="navbar-brand">
        <div className="navbar-logo">VP</div>
        <h1>VIP <span>Pharmacy</span> CRM</h1>
      </div>

      {/* Right Menu */}
      <div className="navbar-menu">
        {user && (
          <>
            {/* Notifications */}
            <NotificationCenter />

            <div className="navbar-divider" />

            {/* User Profile Display */}
            <div className="navbar-profile">
              <div className="navbar-avatar">
                {getInitials(user.name)}
              </div>
              <div className="navbar-profile-info">
                <div className="navbar-profile-name">{user.name}</div>
                <div className="navbar-profile-role">{user.role}</div>
              </div>
            </div>

            {/* Logout Button */}
            <button className="navbar-logout" onClick={logout}>
              <LogOut size={16} />
              Logout
            </button>
          </>
        )}
      </div>
    </nav>
  );
};

export default Navbar;