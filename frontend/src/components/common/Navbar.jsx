/**
 * Navbar Component
 *
 * Top navigation bar with:
 * - Logo/brand
 * - User menu
 * - Notifications
 * - Logout button
 */

import { useAuth } from '../../hooks/useAuth';

const Navbar = () => {
  const { user, logout } = useAuth();

  return (
    <nav className="navbar">
      <div className="navbar-brand">
        <h1>VIP Pharmacy CRM</h1>
      </div>
      <div className="navbar-menu">
        {user && (
          <>
            <span className="navbar-user">{user.name}</span>
            <button onClick={logout} className="navbar-logout">
              Logout
            </button>
          </>
        )}
      </div>
    </nav>
  );
};

export default Navbar;
