/**
 * NotificationCenter Component
 *
 * Bell icon with dropdown notification list for the Navbar.
 *
 * Features:
 * - Bell icon with unread count badge
 * - Dropdown with scrollable notification list
 * - Visual distinction for read/unread items
 * - Mark all as read functionality
 * - Link to notification preferences
 *
 * Usage:
 * <NotificationCenter />
 */

import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  BellOff,
  Check,
  CheckCheck,
  X,
  Settings,
  AlertTriangle,
  CheckCircle,
  Info,
  Calendar,
  MapPin,
  Shield,
  MessageSquare,
} from 'lucide-react';
import usePushNotifications from '../../hooks/usePushNotifications';

/* =============================================================================
   MOCK DATA
   ============================================================================= */

const MOCK_NOTIFICATIONS = [
  {
    id: 1,
    type: 'approval',
    title: 'Visit Approved',
    message: 'Your visit to Dr. Maria Santos has been approved by the admin.',
    time: new Date(Date.now() - 2 * 60 * 1000), // 2 mins ago
    read: false,
    icon: CheckCircle,
    iconColor: 'green',
  },
  {
    id: 2,
    type: 'alert',
    title: 'GPS Verification Warning',
    message: 'Visit #V-2024-0892 flagged as suspicious. Photo taken 520m from clinic.',
    time: new Date(Date.now() - 15 * 60 * 1000), // 15 mins ago
    read: false,
    icon: AlertTriangle,
    iconColor: 'amber',
  },
  {
    id: 3,
    type: 'system',
    title: 'System Maintenance',
    message: 'Scheduled maintenance on Dec 31, 2025 from 2:00 AM to 4:00 AM.',
    time: new Date(Date.now() - 45 * 60 * 1000), // 45 mins ago
    read: false,
    icon: Info,
    iconColor: 'blue',
  },
  {
    id: 4,
    type: 'approval',
    title: 'Visit Rejected',
    message: 'Your visit to Dr. Jose Rizal was rejected. Reason: Incomplete documentation.',
    time: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
    read: true,
    icon: X,
    iconColor: 'red',
  },
  {
    id: 5,
    type: 'reminder',
    title: 'Upcoming Visit',
    message: 'Reminder: Visit to Dr. Angela Yu scheduled for tomorrow at 10:00 AM.',
    time: new Date(Date.now() - 3 * 60 * 60 * 1000), // 3 hours ago
    read: true,
    icon: Calendar,
    iconColor: 'purple',
  },
  {
    id: 6,
    type: 'security',
    title: 'New Login Detected',
    message: 'Your account was accessed from a new device in Manila, Philippines.',
    time: new Date(Date.now() - 5 * 60 * 60 * 1000), // 5 hours ago
    read: true,
    icon: Shield,
    iconColor: 'cyan',
  },
  {
    id: 7,
    type: 'message',
    title: 'New Message',
    message: 'Admin sent you a message regarding your weekly report submission.',
    time: new Date(Date.now() - 24 * 60 * 60 * 1000), // 1 day ago
    read: true,
    icon: MessageSquare,
    iconColor: 'indigo',
  },
];

/* =============================================================================
   STYLES
   ============================================================================= */

const styles = `
  .nc-container {
    position: relative;
  }

  /* Bell Button */
  .nc-bell-btn {
    position: relative;
    width: 40px;
    height: 40px;
    border-radius: 10px;
    border: none;
    background: transparent;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #6b7280;
    transition: all 0.2s;
  }

  .nc-bell-btn:hover {
    background: #f3f4f6;
    color: #374151;
  }

  .nc-bell-btn.active {
    background: #eff6ff;
    color: #2563eb;
  }

  .nc-bell-btn.has-unread {
    color: #374151;
  }

  /* Badge */
  .nc-badge {
    position: absolute;
    top: 4px;
    right: 4px;
    min-width: 18px;
    height: 18px;
    padding: 0 5px;
    background: #ef4444;
    color: white;
    font-size: 11px;
    font-weight: 700;
    border-radius: 9px;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 2px 4px rgba(239, 68, 68, 0.4);
    animation: badgePulse 2s infinite;
  }

  @keyframes badgePulse {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.1); }
  }

  /* Dropdown */
  .nc-dropdown {
    position: absolute;
    top: calc(100% + 8px);
    right: 0;
    width: 380px;
    max-height: 500px;
    background: white;
    border-radius: 16px;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(0, 0, 0, 0.05);
    z-index: 1000;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    animation: dropdownSlide 0.2s ease-out;
  }

  @keyframes dropdownSlide {
    from {
      opacity: 0;
      transform: translateY(-10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  /* Header */
  .nc-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 18px;
    border-bottom: 1px solid #e5e7eb;
    background: #fafafa;
  }

  .nc-header-title {
    font-size: 16px;
    font-weight: 700;
    color: #1f2937;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .nc-header-title .count {
    padding: 2px 8px;
    background: #fee2e2;
    color: #dc2626;
    font-size: 12px;
    font-weight: 600;
    border-radius: 10px;
  }

  .nc-mark-all {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 6px 12px;
    background: transparent;
    border: none;
    color: #2563eb;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    border-radius: 6px;
    transition: all 0.15s;
  }

  .nc-mark-all:hover {
    background: #eff6ff;
  }

  .nc-mark-all:disabled {
    color: #9ca3af;
    cursor: not-allowed;
  }

  /* List */
  .nc-list {
    flex: 1;
    overflow-y: auto;
    max-height: 350px;
  }

  .nc-empty {
    padding: 40px 20px;
    text-align: center;
    color: #6b7280;
  }

  .nc-empty-icon {
    width: 48px;
    height: 48px;
    margin: 0 auto 12px;
    background: #f3f4f6;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #9ca3af;
  }

  .nc-empty p {
    margin: 0;
    font-size: 14px;
  }

  /* Notification Item */
  .nc-item {
    display: flex;
    gap: 12px;
    padding: 14px 18px;
    cursor: pointer;
    transition: all 0.15s;
    border-bottom: 1px solid #f3f4f6;
  }

  .nc-item:last-child {
    border-bottom: none;
  }

  .nc-item:hover {
    background: #f9fafb;
  }

  .nc-item.unread {
    background: #eff6ff;
  }

  .nc-item.unread:hover {
    background: #dbeafe;
  }

  .nc-item-icon {
    width: 36px;
    height: 36px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .nc-item-icon.green { background: #dcfce7; color: #16a34a; }
  .nc-item-icon.amber { background: #fef3c7; color: #d97706; }
  .nc-item-icon.blue { background: #dbeafe; color: #2563eb; }
  .nc-item-icon.red { background: #fee2e2; color: #dc2626; }
  .nc-item-icon.purple { background: #f3e8ff; color: #7c3aed; }
  .nc-item-icon.cyan { background: #cffafe; color: #0891b2; }
  .nc-item-icon.indigo { background: #e0e7ff; color: #4f46e5; }

  .nc-item-content {
    flex: 1;
    min-width: 0;
  }

  .nc-item-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 4px;
  }

  .nc-item-title {
    font-size: 14px;
    font-weight: 600;
    color: #1f2937;
    line-height: 1.3;
  }

  .nc-item.unread .nc-item-title {
    color: #1d4ed8;
  }

  .nc-item-time {
    font-size: 11px;
    color: #9ca3af;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .nc-item-message {
    font-size: 13px;
    color: #6b7280;
    line-height: 1.4;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .nc-unread-dot {
    width: 8px;
    height: 8px;
    background: #2563eb;
    border-radius: 50%;
    flex-shrink: 0;
    margin-top: 4px;
  }

  /* Footer */
  .nc-footer {
    padding: 12px 18px;
    border-top: 1px solid #e5e7eb;
    background: #fafafa;
  }

  .nc-footer-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    padding: 10px;
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    color: #374151;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
  }

  .nc-footer-btn:hover {
    background: #f3f4f6;
    border-color: #d1d5db;
  }

  /* Responsive */
  @media (max-width: 480px) {
    .nc-dropdown {
      position: fixed;
      top: 60px;
      left: 10px;
      right: 10px;
      width: auto;
      max-height: calc(100vh - 80px);
    }
  }
`;

/* =============================================================================
   HELPERS
   ============================================================================= */

/**
 * Format relative time (e.g., "2 mins ago")
 */
const formatRelativeTime = (date) => {
  const now = new Date();
  const diff = now - date;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return 'Just now';
  if (minutes < 60) return `${minutes} min${minutes > 1 ? 's' : ''} ago`;
  if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  if (days < 7) return `${days} day${days > 1 ? 's' : ''} ago`;
  
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

/* =============================================================================
   COMPONENT
   ============================================================================= */

const NotificationCenter = () => {
  const navigate = useNavigate();
  const { playNotificationSound } = usePushNotifications();
  
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState(MOCK_NOTIFICATIONS);
  const dropdownRef = useRef(null);
  const buttonRef = useRef(null);

  // Count unread notifications
  const unreadCount = notifications.filter(n => !n.read).length;

  /**
   * Close dropdown when clicking outside
   */
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  /**
   * Close on Escape key
   */
  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  /**
   * Toggle dropdown
   */
  const handleToggle = () => {
    setIsOpen(!isOpen);
  };

  /**
   * Mark single notification as read
   */
  const handleMarkAsRead = (id) => {
    setNotifications(prev =>
      prev.map(n => (n.id === id ? { ...n, read: true } : n))
    );
  };

  /**
   * Mark all notifications as read
   */
  const handleMarkAllAsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  /**
   * Handle notification click
   */
  const handleNotificationClick = (notification) => {
    handleMarkAsRead(notification.id);
    
    // Navigate based on notification type
    switch (notification.type) {
      case 'approval':
        navigate('/admin/approvals');
        break;
      case 'alert':
        navigate('/admin/gps-verification');
        break;
      case 'message':
        navigate('/employee/inbox');
        break;
      default:
        // Just mark as read
        break;
    }
    
    setIsOpen(false);
  };

  /**
   * Navigate to preferences
   */
  const handleManagePreferences = () => {
    setIsOpen(false);
    navigate('/notifications/preferences');
  };

  return (
    <div className="nc-container">
      <style>{styles}</style>

      {/* Bell Button */}
      <button
        ref={buttonRef}
        className={`nc-bell-btn ${isOpen ? 'active' : ''} ${unreadCount > 0 ? 'has-unread' : ''}`}
        onClick={handleToggle}
        aria-label={`Notifications ${unreadCount > 0 ? `(${unreadCount} unread)` : ''}`}
      >
        <Bell size={22} />
        {unreadCount > 0 && (
          <span className="nc-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
        )}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div ref={dropdownRef} className="nc-dropdown">
          {/* Header */}
          <div className="nc-header">
            <div className="nc-header-title">
              Notifications
              {unreadCount > 0 && <span className="count">{unreadCount} new</span>}
            </div>
            <button
              className="nc-mark-all"
              onClick={handleMarkAllAsRead}
              disabled={unreadCount === 0}
            >
              <CheckCheck size={14} />
              Mark all read
            </button>
          </div>

          {/* List */}
          <div className="nc-list">
            {notifications.length === 0 ? (
              <div className="nc-empty">
                <div className="nc-empty-icon">
                  <BellOff size={24} />
                </div>
                <p>No notifications yet</p>
              </div>
            ) : (
              notifications.map((notification) => {
                const Icon = notification.icon;
                return (
                  <div
                    key={notification.id}
                    className={`nc-item ${!notification.read ? 'unread' : ''}`}
                    onClick={() => handleNotificationClick(notification)}
                  >
                    <div className={`nc-item-icon ${notification.iconColor}`}>
                      <Icon size={18} />
                    </div>
                    <div className="nc-item-content">
                      <div className="nc-item-header">
                        <span className="nc-item-title">{notification.title}</span>
                        <span className="nc-item-time">
                          {formatRelativeTime(notification.time)}
                        </span>
                      </div>
                      <p className="nc-item-message">{notification.message}</p>
                    </div>
                    {!notification.read && <div className="nc-unread-dot" />}
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div className="nc-footer">
            <button className="nc-footer-btn" onClick={handleManagePreferences}>
              <Settings size={16} />
              Manage Preferences
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationCenter;