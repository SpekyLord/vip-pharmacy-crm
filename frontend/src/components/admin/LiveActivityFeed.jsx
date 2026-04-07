/**
 * LiveActivityFeed Component
 *
 * Reusable real-time activity feed component (Task 2.6)
 * Can be used in:
 * - Admin Dashboard (compact mode)
 * - Dedicated Activity Monitor page (full mode)
 *
 * Features:
 * - Live activity timeline with icons and badges
 * - Filtering by search, region, and activity type
 * - Auto-refresh simulation (30s interval)
 * - Clickable items that open detail modal
 *
 * @prop {boolean} compact - If true, shows limited items without filters
 * @prop {number} limit - Max items to display (default: 10)
 * @prop {boolean} showFilters - Show filter controls (default: true)
 * @prop {function} onViewAll - Callback when "View All" is clicked
 * @prop {function} onActivityClick - Callback when activity item is clicked (receives activity)
 */

import { useState, useEffect, useMemo } from 'react';
import {
  MapPin,
  LogIn,
  LogOut,
  UserCog,
  Package,
  Search,
  RefreshCw,
  ChevronRight,
  Clock,
  Activity,
  AlertCircle,
  User,
  Stethoscope,
  Box,
} from 'lucide-react';

/* Mock data removed — now fetched from real APIs */
import visitService from '../../services/visitService';
import auditLogService from '../../services/auditLogService';

import SelectField from '../common/Select';

/* =============================================================================
   CONSTANTS
   Activity type configurations for icons, colors, and labels.
   ============================================================================= */

const ACTIVITY_CONFIG = {
  VISIT_LOG: {
    icon: MapPin,
    bgColor: 'bg-blue-100',
    textColor: 'text-blue-600',
    badgeColor: 'bg-blue-500',
    borderColor: 'border-blue-400',
    label: 'Visit',
  },
  AUTH: {
    icon: User,
    bgColor: 'bg-green-100',
    textColor: 'text-green-600',
    badgeColor: 'bg-green-500',
    borderColor: 'border-green-400',
    label: 'Auth',
  },
  DOCTOR_UPDATE: {
    icon: Stethoscope,
    bgColor: 'bg-purple-100',
    textColor: 'text-purple-600',
    badgeColor: 'bg-purple-500',
    borderColor: 'border-purple-400',
    label: 'VIP Client',
  },
  PRODUCT_ASSIGN: {
    icon: Box,
    bgColor: 'bg-amber-100',
    textColor: 'text-amber-600',
    badgeColor: 'bg-amber-500',
    borderColor: 'border-amber-400',
    label: 'Product',
  },
};

// Auth subtypes have specific icons
const AUTH_ICONS = {
  LOGIN: LogIn,
  LOGOUT: LogOut,
};

// Regions will be derived dynamically from fetched data

// Activity type filter options
const ACTIVITY_TYPES = [
  { value: 'all', label: 'All Activities' },
  { value: 'VISIT_LOG', label: 'Visits' },
  { value: 'AUTH', label: 'Authentication' },
  { value: 'DOCTOR_UPDATE', label: 'VIP Client Updates' },
  { value: 'PRODUCT_ASSIGN', label: 'Product Assignments' },
];

/* =============================================================================
   UTILITY FUNCTIONS
   ============================================================================= */

/**
 * Format timestamp to relative time (e.g., "2 mins ago")
 */
const getRelativeTime = (timestamp) => {
  const now = new Date();
  const then = new Date(timestamp);
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? 's' : ''} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
};

/**
 * Get icon component based on activity type
 */
const getActivityIcon = (activity) => {
  if (activity.type === 'AUTH' && activity.subType) {
    return AUTH_ICONS[activity.subType] || User;
  }
  return ACTIVITY_CONFIG[activity.type]?.icon || Activity;
};

/* =============================================================================
   STYLES
   ============================================================================= */

const feedStyles = `
  .activity-feed-container {
    background: white;
    border-radius: 12px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    overflow: hidden;
  }

  .activity-feed-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid #e5e7eb;
  }

  .activity-feed-header h3 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    color: #1f2937;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .activity-feed-header .header-icon {
    color: #f59e0b;
  }

  .view-all-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 6px 12px;
    background: transparent;
    border: none;
    color: #f59e0b;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    border-radius: 6px;
  }

  .view-all-btn:hover {
    background: #fef3c7;
  }

  .activity-list {
    max-height: 500px;
    overflow-y: auto;
  }

  .activity-list.compact {
    max-height: 320px;
  }

  .activity-item {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 14px 20px;
    border-bottom: 1px solid #f3f4f6;
    cursor: pointer;
    transition: all 0.15s ease;
    border-left: 3px solid transparent;
  }

  .activity-item:last-child {
    border-bottom: none;
  }

  .activity-item:hover {
    background: #f9fafb;
    border-left-color: #f59e0b;
  }

  .activity-item.visit:hover { border-left-color: #3b82f6; }
  .activity-item.auth:hover { border-left-color: #f59e0b; }
  .activity-item.doctor:hover { border-left-color: #a855f7; }
  .activity-item.product:hover { border-left-color: #f59e0b; }

  .activity-icon {
    flex-shrink: 0;
    width: 36px;
    height: 36px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .activity-content {
    flex: 1;
    min-width: 0;
  }

  .activity-message {
    font-size: 14px;
    color: #374151;
    line-height: 1.4;
    margin-bottom: 6px;
  }

  .activity-meta {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .activity-badge {
    display: inline-flex;
    align-items: center;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 600;
    color: white;
  }

  .activity-region {
    font-size: 12px;
    color: #9ca3af;
  }

  .activity-time {
    flex-shrink: 0;
    font-size: 12px;
    color: #9ca3af;
    white-space: nowrap;
  }

  .click-hint {
    font-size: 11px;
    color: #d1d5db;
    opacity: 0;
    transition: opacity 0.15s;
  }

  .activity-item:hover .click-hint {
    opacity: 1;
  }

  .empty-state {
    padding: 40px 20px;
    text-align: center;
    color: #6b7280;
  }

  .empty-state-icon {
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

  .empty-state p {
    margin: 0;
    font-size: 14px;
  }

  /* Filter Controls */
  .filter-controls {
    padding: 16px 20px;
    background: #f9fafb;
    border-bottom: 1px solid #e5e7eb;
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: center;
  }

  .search-input {
    flex: 1;
    min-width: 200px;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
  }

  .search-input input {
    flex: 1;
    border: none;
    outline: none;
    font-size: 14px;
    color: #374151;
  }

  .search-input input::placeholder {
    color: #9ca3af;
  }

  .search-input svg {
    color: #9ca3af;
  }

  .filter-select {
    padding: 8px 12px;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    font-size: 14px;
    color: #374151;
    background: white;
    cursor: pointer;
    min-width: 140px;
  }

  .filter-select:focus {
    outline: none;
    border-color: #f59e0b;
    box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.15);
  }

  .refresh-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 14px;
    background: #f59e0b;
    color: white;
    border: none;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.2s;
  }

  .refresh-btn:hover {
    background: #d97706;
  }

  .refresh-btn:disabled {
    background: #fcd34d;
    cursor: not-allowed;
  }

  .refresh-btn.loading svg {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  .refresh-info {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: #9ca3af;
    margin-top: 4px;
  }

  .item-count {
    margin-left: 8px;
    padding: 2px 8px;
    background: #f3f4f6;
    border-radius: 10px;
    font-size: 12px;
    font-weight: 500;
    color: #6b7280;
  }

  /* ===== DARK MODE ===== */
  body.dark-mode .activity-feed-container {
    background: #0f172a;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
  }

  body.dark-mode .activity-feed-header {
    border-bottom-color: #1e293b;
  }

  body.dark-mode .activity-feed-header h3 {
    color: #f1f5f9;
  }

  body.dark-mode .activity-feed-header .header-icon {
    color: #fbbf24;
  }

  body.dark-mode .view-all-btn:hover {
    background: #451a03;
  }

  body.dark-mode .activity-list {
    background: #0f172a;
  }

  body.dark-mode .activity-item {
    border-bottom-color: #1e293b;
  }

  body.dark-mode .activity-item:hover {
    background: #1e293b;
  }

  body.dark-mode .activity-message {
    color: #e2e8f0;
  }

  body.dark-mode .activity-region,
  body.dark-mode .activity-time {
    color: #64748b;
  }

  body.dark-mode .click-hint {
    color: #475569;
  }

  body.dark-mode .empty-state {
    color: #94a3b8;
  }

  body.dark-mode .empty-state-icon {
    background: #1e293b;
    color: #64748b;
  }

  body.dark-mode .filter-controls {
    background: #0a0f1e;
    border-bottom-color: #1e293b;
  }

  body.dark-mode .search-input {
    background: #1e293b;
    border-color: #334155;
  }

  body.dark-mode .search-input input {
    background: transparent;
    color: #e2e8f0;
  }

  body.dark-mode .search-input input::placeholder {
    color: #64748b;
  }

  body.dark-mode .search-input svg {
    color: #64748b;
  }

  body.dark-mode .filter-select {
    background: #1e293b;
    border-color: #334155;
    color: #e2e8f0;
  }

  body.dark-mode .filter-select:focus {
    border-color: #f59e0b;
    box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.2);
  }

  body.dark-mode .refresh-info {
    color: #64748b;
  }

  body.dark-mode .item-count {
    background: #1e293b;
    color: #94a3b8;
  }

  /* Dark mode activity icon backgrounds */
  body.dark-mode .activity-icon.bg-blue-100 { background: #1e3a5f; }
  body.dark-mode .activity-icon.bg-green-100 { background: #451a03; }
  body.dark-mode .activity-icon.bg-purple-100 { background: #2e1065; }
  body.dark-mode .activity-icon.bg-amber-100 { background: #451a03; }

  /* Dark mode activity icon colors - make icons white */
  body.dark-mode .activity-icon svg,
  body.dark-mode .activity-icon .text-blue-600,
  body.dark-mode .activity-icon .text-green-600,
  body.dark-mode .activity-icon .text-purple-600,
  body.dark-mode .activity-icon .text-amber-600 {
    color: white !important;
  }
`;

/* =============================================================================
   COMPONENT: LiveActivityFeed
   ============================================================================= */

const LiveActivityFeed = ({
  compact = false,
  limit = 10,
  showFilters = true,
  onViewAll = null,
  onActivityClick = null,
}) => {
  // State: Activities data
  const [activities, setActivities] = useState([]);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);

  // State: Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');

  /* ---------------------------------------------------------------------------
     Helper: Parse user agent into device/browser
     --------------------------------------------------------------------------- */
  const parseDevice = (ua) => {
    if (!ua) return 'Unknown';
    if (/android/i.test(ua)) return 'Android Phone';
    if (/iphone/i.test(ua)) return 'iPhone';
    if (/ipad/i.test(ua)) return 'iPad';
    if (/macintosh/i.test(ua)) return 'Mac Desktop';
    if (/windows/i.test(ua)) return 'Windows Desktop';
    if (/linux/i.test(ua)) return 'Linux Desktop';
    return 'Unknown Device';
  };

  const parseBrowser = (ua) => {
    if (!ua) return 'Unknown';
    const match = ua.match(/(Chrome|Firefox|Safari|Edge|Opera)[\s/](\d+)/i);
    return match ? `${match[1]} ${match[2]}` : 'Unknown Browser';
  };

  /* ---------------------------------------------------------------------------
     Data Fetching
     --------------------------------------------------------------------------- */

  const fetchActivities = async () => {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayISO = today.toISOString().split('T')[0];

      const [visitsRes, auditRes] = await Promise.all([
        visitService.getAll({ limit: 20, dateFrom: todayISO }).catch(() => ({ data: [] })),
        auditLogService.getAll({ limit: 20, dateFrom: todayISO }).catch(() => ({ data: [] })),
      ]);

      // Map visits to activity shape
      const visitActivities = (visitsRes.data || []).map((v) => {
        const docName = v.doctor
          ? `${v.doctor.firstName || ''} ${v.doctor.lastName || ''}`.trim()
          : 'Unknown';
        const empName = v.user?.name || 'Unknown';
        return {
          _id: `visit-${v._id}`,
          type: 'VISIT_LOG',
          message: `${empName} logged a visit to ${docName}`,
          employeeName: empName,
          employeeId: v.user?._id,
          region: '',
          timestamp: v.visitDate,
          details: {
            doctorName: docName,
            address: v.doctor?.clinicOfficeAddress || '',
            coordinates: v.location ? { lat: v.location.latitude, lng: v.location.longitude } : null,
            visitType: v.visitType || 'Regular Visit',
            notes: v.notes || '',
            photos: (v.photos || []).map((p) => p.url),
          },
        };
      });

      // Map audit logs to activity shape
      const authActivities = (auditRes.data || []).map((log) => {
        const empName = log.userId?.name || log.email || 'Unknown';
        const actionLabel = (log.action || '').replace(/_/g, ' ').toLowerCase();
        return {
          _id: `audit-${log._id}`,
          type: 'AUTH',
          subType: log.action?.includes('LOGIN') ? 'LOGIN' : log.action?.includes('LOGOUT') ? 'LOGOUT' : log.action,
          message: `${empName} — ${actionLabel}`,
          employeeName: empName,
          employeeId: log.userId?._id,
          region: '',
          timestamp: log.timestamp,
          details: {
            ipAddress: log.ipAddress || '',
            device: parseDevice(log.userAgent),
            deviceType: /mobile|android|iphone|ipad/i.test(log.userAgent || '') ? 'Mobile' : 'Desktop',
            browser: parseBrowser(log.userAgent),
          },
        };
      });

      // Merge and sort by timestamp desc
      const merged = [...visitActivities, ...authActivities]
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

      setActivities(merged);
      setLastRefresh(new Date());
    } catch (err) {
      console.error('Failed to fetch activities:', err);
    }
  };

  useEffect(() => {
    fetchActivities();
    const interval = setInterval(fetchActivities, 30000);
    return () => clearInterval(interval);
  }, []);

  /* ---------------------------------------------------------------------------
     Manual Refresh Handler
     --------------------------------------------------------------------------- */

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    await fetchActivities();
    setIsRefreshing(false);
  };

  /* ---------------------------------------------------------------------------
     Filtered Activities
     Memoized for performance.
     --------------------------------------------------------------------------- */

  const filteredActivities = useMemo(() => {
    return activities.filter((activity) => {
      // Search filter (by employee name or message)
      const matchesSearch =
        searchQuery === '' ||
        activity.employeeName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        activity.message.toLowerCase().includes(searchQuery.toLowerCase());

      // Type filter
      const matchesType =
        typeFilter === 'all' || activity.type === typeFilter;

      return matchesSearch && matchesType;
    });
  }, [activities, searchQuery, typeFilter]);

  // Limit activities for display
  const displayedActivities = filteredActivities.slice(0, limit);

  /* ---------------------------------------------------------------------------
     Click Handler
     --------------------------------------------------------------------------- */

  const handleActivityClick = (activity) => {
    console.log('📋 View details for activity ID:', activity._id);
    if (onActivityClick) {
      onActivityClick(activity);
    }
  };

  /* ---------------------------------------------------------------------------
     Render
     --------------------------------------------------------------------------- */

  return (
    <div className="activity-feed-container">
      <style>{feedStyles}</style>
      {/* Filter Controls (Full mode only) */}
      {showFilters && !compact && (
        <div className="filter-controls">
          <div className="search-input">
            <Search size={16} />
            <input
              type="text"
              placeholder="Search by BDM name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <SelectField
            className="filter-select"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            {ACTIVITY_TYPES.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </SelectField>

          <button
            className={`refresh-btn ${isRefreshing ? 'loading' : ''}`}
            onClick={handleManualRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw size={14} />
            {isRefreshing ? 'Refreshing...' : 'Refresh'}
          </button>

          <div className="refresh-info">
            <Clock size={12} />
            Last updated: {lastRefresh.toLocaleTimeString()} • Auto-refresh every 30s
          </div>
        </div>
      )}
      {/* Header */}
      <div className="activity-feed-header">
        <h3>
          <Activity size={18} className="header-icon" />
          {compact ? 'Recent Activity' : 'Activity Feed'}
          {!compact && (
            <span className="item-count">{filteredActivities.length} items</span>
          )}
        </h3>
        {compact && onViewAll && (
          <button className="view-all-btn" onClick={onViewAll}>
            View All
            <ChevronRight size={16} />
          </button>
        )}
      </div>
      {/* Activity List */}
      <div className={`activity-list ${compact ? 'compact' : ''}`}>
        {displayedActivities.length > 0 ? (
          displayedActivities.map((activity) => (
            <ActivityItem
              key={activity._id}
              activity={activity}
              onClick={() => handleActivityClick(activity)}
              compact={compact}
            />
          ))
        ) : (
          <div className="empty-state">
            <div className="empty-state-icon">
              <AlertCircle size={24} />
            </div>
            <p>No activities found</p>
          </div>
        )}
      </div>
    </div>
  );
};

/* =============================================================================
   COMPONENT: ActivityItem
   Individual activity row in the feed.
   ============================================================================= */

const ActivityItem = ({ activity, onClick, compact = false }) => {
  const config = ACTIVITY_CONFIG[activity.type] || ACTIVITY_CONFIG.AUTH;
  const IconComponent = getActivityIcon(activity);
  const relativeTime = getRelativeTime(activity.timestamp);

  // Get hover class based on type
  const typeClass = {
    VISIT_LOG: 'visit',
    AUTH: 'auth',
    DOCTOR_UPDATE: 'doctor',
    PRODUCT_ASSIGN: 'product',
  }[activity.type] || 'auth';

  return (
    <div className={`activity-item ${typeClass}`} onClick={onClick}>
      {/* Icon */}
      <div className={`activity-icon ${config.bgColor}`}>
        <IconComponent size={16} className={config.textColor} />
      </div>

      {/* Content */}
      <div className="activity-content">
        <div className="activity-message">{activity.message}</div>
        <div className="activity-meta">
          <span className={`activity-badge ${config.badgeColor}`}>
            {config.label}
          </span>
          {!compact && activity.region !== 'System' && (
            <span className="activity-region">{activity.region}</span>
          )}
        </div>
      </div>

      {/* Timestamp & Click Hint */}
      <div style={{ textAlign: 'right' }}>
        <div className="activity-time">{relativeTime}</div>
        {!compact && <div className="click-hint">Click for details</div>}
      </div>
    </div>
  );
};

export default LiveActivityFeed;