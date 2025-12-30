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

/* =============================================================================
   MOCK DATA
   Comprehensive activity data with type-specific details objects.
   ============================================================================= */

const MOCK_ACTIVITIES = [
  // VISIT_LOG activities
  {
    _id: 'act-001',
    type: 'VISIT_LOG',
    message: 'Juan Dela Cruz logged a visit to Dr. Maria Santos',
    employeeName: 'Juan Dela Cruz',
    employeeId: 'emp-001',
    region: 'Region VI - Western Visayas',
    timestamp: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
    details: {
      doctorName: 'Dr. Maria Santos',
      clinicName: 'Santos Medical Clinic',
      address: '123 Rizal Street, Iloilo City, Iloilo 5000',
      coordinates: { lat: 10.7202, lng: 122.5621 },
      visitType: 'Regular Visit',
      notes: 'Discussed new CardioMax product line. Doctor showed interest in samples. Follow-up scheduled for next week.',
      photos: ['photo1.jpg', 'photo2.jpg'],
    },
  },
  {
    _id: 'act-002',
    type: 'AUTH',
    subType: 'LOGIN',
    message: 'Maria Garcia logged in',
    employeeName: 'Maria Garcia',
    employeeId: 'emp-002',
    region: 'NCR - Metro Manila',
    timestamp: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    details: {
      ipAddress: '192.168.1.105',
      device: 'Windows Desktop',
      deviceType: 'Desktop',
      browser: 'Chrome 120.0.6099.130',
      location: 'Makati City, Metro Manila',
    },
  },
  {
    _id: 'act-003',
    type: 'DOCTOR_UPDATE',
    message: 'Admin updated Dr. Jose Rizal\'s profile',
    employeeName: 'Admin User',
    employeeId: 'admin-001',
    region: 'System',
    timestamp: new Date(Date.now() - 8 * 60 * 1000).toISOString(),
    details: {
      doctorName: 'Dr. Jose Rizal',
      action: 'update',
      fieldsChanged: [
        { field: 'Phone', from: '+63 912 345 6789', to: '+63 917 123 4567' },
        { field: 'Address', from: '456 Old Street, Manila', to: '789 New Avenue, Quezon City' },
      ],
    },
  },
  {
    _id: 'act-004',
    type: 'PRODUCT_ASSIGN',
    message: 'Sarah Reyes assigned CardioMax 100mg to Dr. Luna',
    employeeName: 'Sarah Reyes',
    employeeId: 'emp-003',
    region: 'Region VII - Central Visayas',
    timestamp: new Date(Date.now() - 12 * 60 * 1000).toISOString(),
    details: {
      productName: 'CardioMax 100mg',
      sku: 'CM-100-2024',
      quantity: 50,
      doctorName: 'Dr. Luna',
      approvalStatus: 'approved',
    },
  },
  {
    _id: 'act-005',
    type: 'VISIT_LOG',
    message: 'Pedro Martinez logged a visit to Dr. Chen',
    employeeName: 'Pedro Martinez',
    employeeId: 'emp-004',
    region: 'Region VI - Western Visayas',
    timestamp: new Date(Date.now() - 18 * 60 * 1000).toISOString(),
    details: {
      doctorName: 'Dr. Chen',
      clinicName: 'Chen Family Clinic',
      address: '45 Mabini Street, Bacolod City, Negros Occidental 6100',
      coordinates: { lat: 10.6713, lng: 122.9511 },
      visitType: 'Follow-up',
      notes: 'Delivered product samples as requested. Doctor confirmed prescription increase for NeuroPlus.',
      photos: ['visit_photo.jpg'],
    },
  },
  {
    _id: 'act-006',
    type: 'AUTH',
    subType: 'LOGOUT',
    message: 'Mike Torres logged out',
    employeeName: 'Mike Torres',
    employeeId: 'emp-005',
    region: 'CAR - Cordillera',
    timestamp: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
    details: {
      ipAddress: '172.16.0.45',
      device: 'Android Phone',
      deviceType: 'Mobile',
      browser: 'Chrome Mobile 120.0',
      sessionDuration: '2h 34m',
    },
  },
  {
    _id: 'act-007',
    type: 'DOCTOR_UPDATE',
    message: 'MedRep created new doctor profile: Dr. Angela Yu',
    employeeName: 'MedRep User',
    employeeId: 'medrep-001',
    region: 'NCR - Metro Manila',
    timestamp: new Date(Date.now() - 35 * 60 * 1000).toISOString(),
    details: {
      doctorName: 'Dr. Angela Yu',
      action: 'create',
      fieldsChanged: [],
    },
  },
  {
    _id: 'act-008',
    type: 'VISIT_LOG',
    message: 'Ana Lopez logged a visit to Dr. Williams',
    employeeName: 'Ana Lopez',
    employeeId: 'emp-006',
    region: 'Region VI - Western Visayas',
    timestamp: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
    details: {
      doctorName: 'Dr. Williams',
      clinicName: 'Williams General Hospital',
      address: '78 Fuentes Drive, Iloilo City, Iloilo 5000',
      coordinates: { lat: 10.6923, lng: 122.5644 },
      visitType: 'Emergency',
      notes: 'Urgent request for GastroShield samples. Hospital running low on stock.',
      photos: ['receipt.jpg', 'stock_photo.jpg', 'clinic.jpg'],
    },
  },
  {
    _id: 'act-009',
    type: 'PRODUCT_ASSIGN',
    message: 'Admin bulk assigned NeuroPlus to 5 doctors',
    employeeName: 'Admin User',
    employeeId: 'admin-001',
    region: 'System',
    timestamp: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
    details: {
      productName: 'NeuroPlus 500mg',
      sku: 'NP-500-2024',
      quantity: 200,
      doctorName: '5 Doctors (Bulk Assignment)',
      approvalStatus: 'pending',
    },
  },
  {
    _id: 'act-010',
    type: 'AUTH',
    subType: 'LOGIN',
    message: 'Elena Cruz logged in',
    employeeName: 'Elena Cruz',
    employeeId: 'emp-007',
    region: 'Region VII - Central Visayas',
    timestamp: new Date(Date.now() - 1.5 * 60 * 60 * 1000).toISOString(),
    details: {
      ipAddress: '10.0.0.88',
      device: 'iPad Pro',
      deviceType: 'Mobile',
      browser: 'Safari 17.2',
      location: 'Cebu City, Cebu',
    },
  },
  {
    _id: 'act-011',
    type: 'VISIT_LOG',
    message: 'Roberto Lim logged a visit to Dr. Park',
    employeeName: 'Roberto Lim',
    employeeId: 'emp-008',
    region: 'NCR - Metro Manila',
    timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    details: {
      doctorName: 'Dr. Park',
      clinicName: 'Park Wellness Center',
      address: '321 EDSA, Mandaluyong City, Metro Manila',
      coordinates: { lat: 14.5794, lng: 121.0359 },
      visitType: 'Regular Visit',
      notes: 'Routine check-in. No new orders.',
      photos: [],
    },
  },
  {
    _id: 'act-012',
    type: 'DOCTOR_UPDATE',
    message: 'Admin deactivated Dr. Old Profile',
    employeeName: 'Admin User',
    employeeId: 'admin-001',
    region: 'System',
    timestamp: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    details: {
      doctorName: 'Dr. Old Profile',
      action: 'deactivate',
      fieldsChanged: [
        { field: 'Status', from: 'Active', to: 'Inactive' },
      ],
    },
  },
  {
    _id: 'act-013',
    type: 'AUTH',
    subType: 'LOGIN',
    message: 'Juan Dela Cruz logged in',
    employeeName: 'Juan Dela Cruz',
    employeeId: 'emp-001',
    region: 'Region VI - Western Visayas',
    timestamp: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
    details: {
      ipAddress: '192.168.50.12',
      device: 'Samsung Galaxy S23',
      deviceType: 'Mobile',
      browser: 'Chrome Mobile 120.0',
      location: 'Iloilo City, Iloilo',
    },
  },
  {
    _id: 'act-014',
    type: 'PRODUCT_ASSIGN',
    message: 'MedRep assigned GastroShield to Dr. Mendoza',
    employeeName: 'MedRep User',
    employeeId: 'medrep-001',
    region: 'Region VI - Western Visayas',
    timestamp: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
    details: {
      productName: 'GastroShield 250mg',
      sku: 'GS-250-2024',
      quantity: 30,
      doctorName: 'Dr. Mendoza',
      approvalStatus: 'approved',
    },
  },
  {
    _id: 'act-015',
    type: 'VISIT_LOG',
    message: 'Maria Garcia logged a visit to Dr. Thompson',
    employeeName: 'Maria Garcia',
    employeeId: 'emp-002',
    region: 'NCR - Metro Manila',
    timestamp: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
    details: {
      doctorName: 'Dr. Thompson',
      clinicName: 'Thompson Medical Arts',
      address: '55 Ayala Avenue, Makati City, Metro Manila',
      coordinates: { lat: 14.5547, lng: 121.0244 },
      visitType: 'Regular Visit',
      notes: 'Presented Q4 product catalog. Doctor requested additional info on CardioMax clinical trials.',
      photos: ['catalog.jpg'],
    },
  },
];

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
    label: 'Doctor',
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

// Available regions for filtering
const REGIONS = [
  'All Regions',
  'Region VI - Western Visayas',
  'NCR - Metro Manila',
  'Region VII - Central Visayas',
  'CAR - Cordillera',
  'System',
];

// Activity type filter options
const ACTIVITY_TYPES = [
  { value: 'all', label: 'All Activities' },
  { value: 'VISIT_LOG', label: 'Visits' },
  { value: 'AUTH', label: 'Authentication' },
  { value: 'DOCTOR_UPDATE', label: 'Doctor Updates' },
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
    color: #22c55e;
  }

  .view-all-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 6px 12px;
    background: transparent;
    border: none;
    color: #22c55e;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    border-radius: 6px;
  }

  .view-all-btn:hover {
    background: #f0fdf4;
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
    border-left-color: #22c55e;
  }

  .activity-item.visit:hover { border-left-color: #3b82f6; }
  .activity-item.auth:hover { border-left-color: #22c55e; }
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
    border-color: #22c55e;
    box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.1);
  }

  .refresh-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 14px;
    background: #22c55e;
    color: white;
    border: none;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.2s;
  }

  .refresh-btn:hover {
    background: #16a34a;
  }

  .refresh-btn:disabled {
    background: #86efac;
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
  const [activities, setActivities] = useState(MOCK_ACTIVITIES);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);

  // State: Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [regionFilter, setRegionFilter] = useState('All Regions');
  const [typeFilter, setTypeFilter] = useState('all');

  /* ---------------------------------------------------------------------------
     Auto-Refresh Simulation
     Refreshes data every 30 seconds.
     --------------------------------------------------------------------------- */

  useEffect(() => {
    const interval = setInterval(() => {
      console.log('🔄 Refreshing activity data...');
      setLastRefresh(new Date());
      
      // Simulate new activity by shuffling mock data
      setActivities((prev) => {
        const shuffled = [...prev].sort(() => Math.random() - 0.5);
        return shuffled;
      });
    }, 30000); // 30 seconds

    return () => clearInterval(interval);
  }, []);

  /* ---------------------------------------------------------------------------
     Manual Refresh Handler
     --------------------------------------------------------------------------- */

  const handleManualRefresh = () => {
    setIsRefreshing(true);
    console.log('🔄 Manual refresh triggered...');
    
    setTimeout(() => {
      setLastRefresh(new Date());
      setActivities((prev) => [...prev].sort(() => Math.random() - 0.5));
      setIsRefreshing(false);
    }, 1000);
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

      // Region filter
      const matchesRegion =
        regionFilter === 'All Regions' || activity.region === regionFilter;

      // Type filter
      const matchesType =
        typeFilter === 'all' || activity.type === typeFilter;

      return matchesSearch && matchesRegion && matchesType;
    });
  }, [activities, searchQuery, regionFilter, typeFilter]);

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
              placeholder="Search by employee name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <select
            className="filter-select"
            value={regionFilter}
            onChange={(e) => setRegionFilter(e.target.value)}
          >
            {REGIONS.map((region) => (
              <option key={region} value={region}>
                {region}
              </option>
            ))}
          </select>

          <select
            className="filter-select"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            {ACTIVITY_TYPES.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>

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