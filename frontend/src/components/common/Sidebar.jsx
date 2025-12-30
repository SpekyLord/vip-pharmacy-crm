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
import { useEffect, useMemo, useState } from 'react';
import messageService from '../../services/messageInboxService';

const Sidebar = () => {
  const { user } = useAuth();

  //Unread Notification Inbox
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (user?.role !== 'employee') return;

    const fetchUnread = async () => {
      try {
        const res = await messageService.getAll();
        const data = res?.data ?? [];
        setUnreadCount(data.filter(m => !m.read).length);
      } catch {
        setUnreadCount(0);
      }
    };

    fetchUnread(); // initial load

    // ✅ listen for inbox updates
    window.addEventListener('inbox:updated', fetchUnread);

    return () => {
      window.removeEventListener('inbox:updated', fetchUnread);
    };
  }, [user?.role]);


  const getMenuItems = () => {
    switch (user?.role) {
      case 'admin':
        return [
          { path: '/admin', label: 'Dashboard', icon: '📊' },
          { path: '/admin/sent', label: 'Mail', icon: '📨' }, // ✅ NEW (contains Inbox + Sent tabs)
          { path: '/admin/doctors', label: 'VIP Clients', icon: '👨‍⚕️' },
          { path: '/admin/employees', label: 'BDMs', icon: '👥' },
          { path: '/admin/regions', label: 'Regions', icon: '🗺️' },
          { path: '/admin/approvals', label: 'Approvals', icon: '✅' },
          { path: '/admin/statistics', label: 'Statistics', icon: '📉' },
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
          { path: '/employee/inbox', label: 'Inbox', icon: '📨' }, // 🆕
          { path: '/employee/visits', label: 'My Visits', icon: '📍' },
        ];

    }
  };

  return (
    <aside className="sidebar">
      <nav className="sidebar-nav">
        {getMenuItems().map((item) => {
          const isInbox = item.path === '/employee/inbox';

          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `sidebar-link ${isActive ? 'active' : ''}`
              }
            >
              <span className="sidebar-icon badge-wrap">
                {item.icon}

                {isInbox && unreadCount > 0 && (
                  <span className="sidebar-badge">{unreadCount}</span>
                )}
              </span>

              <span className="sidebar-label">{item.label}</span>
            </NavLink>
          );
        })}

      </nav>

       {/* ✅ ADD THE BADGE CSS HERE */}
    <style>{`
      .badge-wrap {
        position: relative;
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }

      .sidebar-badge {
        position: absolute;
        top: -6px;
        right: -10px;
        background: #ef4444;
        color: white;
        font-size: 0.7rem;
        font-weight: 800;
        padding: 2px 6px;
        border-radius: 999px;
        line-height: 1;
        min-width: 18px;
        text-align: center;
      }
    `}</style>
    </aside>
  );
};

export default Sidebar;