/**
 * Sidebar Component - Redesigned
 *
 * Side navigation with:
 * - Role-based menu items with Lucide icons
 * - Grouped sections
 * - Active route highlighting
 * - Clean collapsible functionality
 * - Modern styling
 */

import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import {
  LayoutDashboard,
  Users,
  UserCog,
  MapPin,
  ClipboardCheck,
  BarChart3,
  FileText,
  Inbox,
  Calendar,
  Stethoscope,
  ChevronLeft,
  ChevronRight,
  Activity,
  Shield,
} from 'lucide-react';

/* =============================================================================
   STYLES
   ============================================================================= */

const sidebarStyles = `
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

  /* Role Badge */
  .sidebar-role {
    padding: 20px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  }

  .sidebar-role-badge {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px;
    background: rgba(59, 130, 246, 0.15);
    border: 1px solid rgba(59, 130, 246, 0.2);
    border-radius: 12px;
    transition: all 0.25s;
  }

  .sidebar.collapsed .sidebar-role-badge {
    padding: 10px;
    justify-content: center;
    background: rgba(59, 130, 246, 0.1);
  }

  .sidebar-role-icon {
    width: 36px;
    height: 36px;
    min-width: 36px;
    background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
  }

  .sidebar-role-info {
    overflow: hidden;
    white-space: nowrap;
  }

  .sidebar.collapsed .sidebar-role-info {
    display: none;
  }

  .sidebar-role-title {
    font-size: 14px;
    font-weight: 600;
    color: white;
  }

  .sidebar-role-subtitle {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.5);
    margin-top: 2px;
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

  /* Responsive */
  @media (max-width: 1024px) {
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
  }
`;

/* =============================================================================
   MENU CONFIGURATION
   ============================================================================= */

const getMenuConfig = (role) => {
  switch (role) {
    case 'admin':
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
            items: [
              { path: '/admin/doctors', label: 'VIP Clients', icon: Stethoscope },
              { path: '/admin/employees', label: 'BDMs', icon: Users },
              { path: '/admin/regions', label: 'Regions', icon: MapPin },
            ],
          },
          {
            title: 'Operations',
            items: [
              { path: '/admin/approvals', label: 'Approvals', icon: ClipboardCheck, badge: 3 },
              { path: '/admin/statistics', label: 'Statistics', icon: BarChart3 },
              { path: '/admin/reports', label: 'Reports', icon: FileText },
            ],
          },
        ],
      };

    case 'employee':
    default:
      return {
        roleTitle: 'Field Employee',
        roleSubtitle: 'BDM / Sales Rep',
        roleIcon: UserCog,
        sections: [
          {
            title: 'Main',
            items: [
              { path: '/employee', label: 'Dashboard', icon: LayoutDashboard },
            ],
          },
          {
            title: 'Work',
            items: [
              { path: '/employee/inbox', label: 'Mail', icon: Inbox, badge: 2 },
              { path: '/employee/visits', label: 'My Visits', icon: Calendar },
            ],
          },
        ],
      };
  }
};

/* =============================================================================
   COMPONENT
   ============================================================================= */

const Sidebar = () => {
  const { user } = useAuth();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  const menuConfig = getMenuConfig(user?.role);
  const RoleIcon = menuConfig.roleIcon;

  const isActive = (path) => {
    if (path === '/admin' || path === '/employee') {
      return location.pathname === path;
    }
    return location.pathname.startsWith(path);
  };

  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      <style>{sidebarStyles}</style>

      {/* Toggle */}
      <button
        className="sidebar-toggle"
        onClick={() => setCollapsed(!collapsed)}
      >
        {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
      </button>

      {/* Role Badge */}
      <div className="sidebar-role">
        <div className="sidebar-role-badge">
          <div className="sidebar-role-icon">
            <RoleIcon size={18} />
          </div>
          <div className="sidebar-role-info">
            <div className="sidebar-role-title">{menuConfig.roleTitle}</div>
            <div className="sidebar-role-subtitle">{menuConfig.roleSubtitle}</div>
          </div>
        </div>
      </div>

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
                    <span className="sidebar-badge">{item.badge}</span>
                  )}
                  <span className="sidebar-tooltip">{item.label}</span>
                </NavLink>
              );
            })}
          </div>
        ))}
      </nav>
    </aside>
  );
};

export default Sidebar;