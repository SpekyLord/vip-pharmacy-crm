/**
 * Sidebar Component
 *
 * Side navigation with:
 * - Role-based menu items
 * - Active route highlighting
 * - Collapsible on mobile/tablet
 */

import { NavLink } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

const Sidebar = () => {
  const { user } = useAuth();

  const getMenuItems = () => {
    switch (user?.role) {
      case 'admin':
        return [
          { path: '/admin', label: 'Dashboard', icon: '📊' },
          { path: '/admin/doctors', label: 'Doctors', icon: '👨‍⚕️' },
          { path: '/admin/employees', label: 'Employees', icon: '👥' },
          { path: '/admin/reports', label: 'Reports', icon: '📈' },
        ];
      case 'medrep':
        return [
          { path: '/medrep', label: 'Dashboard', icon: '📊' },
          { path: '/medrep/assignments', label: 'Assignments', icon: '📋' },
        ];
      case 'employee':
      default:
        return [
          { path: '/employee', label: 'Dashboard', icon: '📊' },
          { path: '/employee/visits', label: 'My Visits', icon: '📍' },
        ];
    }
  };

  return (
    <aside className="sidebar">
      <nav className="sidebar-nav">
        {getMenuItems().map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `sidebar-link ${isActive ? 'active' : ''}`
            }
          >
            <span className="sidebar-icon">{item.icon}</span>
            <span className="sidebar-label">{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </aside>
  );
};

export default Sidebar;
