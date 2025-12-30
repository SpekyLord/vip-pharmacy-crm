/**
 * Navbar Component
 *
 * Top navigation bar with:
 * - Logo/brand
 * - Notifications (Bell icon with dropdown)
 * - User menu
 * - Logout button
 */

import { useAuth } from '../../hooks/useAuth';
import NotificationCenter from './NotificationCenter';
import { LogOut, User } from 'lucide-react';

const navbarStyles = `
  .navbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 24px;
    height: 64px;
    background: white;
    border-bottom: 1px solid #e5e7eb;
    position: sticky;
    top: 0;
    z-index: 100;
  }

  .navbar-brand h1 {
    margin: 0;
    font-size: 20px;
    font-weight: 700;
    color: #1f2937;
  }

  .navbar-brand span {
    color: #2563eb;
  }

  .navbar-menu {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .navbar-user {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 14px;
    background: #f3f4f6;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    color: #374151;
  }

  .navbar-user-icon {
    width: 28px;
    height: 28px;
    background: #dbeafe;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #2563eb;
  }

  .navbar-logout {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 14px;
    background: transparent;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    color: #6b7280;
    cursor: pointer;
    transition: all 0.15s;
  }

  .navbar-logout:hover {
    background: #fef2f2;
    border-color: #fecaca;
    color: #dc2626;
  }

  .navbar-divider {
    width: 1px;
    height: 32px;
    background: #e5e7eb;
    margin: 0 4px;
  }
`;

const Navbar = () => {
  const { user, logout } = useAuth();

  return (
    <nav className="navbar">
      <style>{navbarStyles}</style>
      <div className="navbar-brand">
        <h1>VIP <span>Pharmacy</span> CRM</h1>
      </div>
      <div className="navbar-menu">
        {user && (
          <>
            <NotificationCenter />
            <div className="navbar-divider" />
            <span className="navbar-user">
              <div className="navbar-user-icon">
                <User size={16} />
              </div>
              {user.name}
            </span>
            <button onClick={logout} className="navbar-logout">
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