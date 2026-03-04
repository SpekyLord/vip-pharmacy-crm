/**
 * Audit Logger Utility
 *
 * Provides functions to log security-relevant events.
 * All events are stored in MongoDB and auto-expire after 90 days.
 *
 * Usage:
 *   const { logAuditEvent, AuditActions } = require('../utils/auditLogger');
 *   await logAuditEvent(AuditActions.LOGIN_SUCCESS, { userId: user._id, req });
 */

const AuditLog = require('../models/AuditLog');

/**
 * Audit action types - use these constants for consistency
 */
const AuditActions = {
  LOGIN_SUCCESS: 'LOGIN_SUCCESS',
  LOGIN_FAILURE: 'LOGIN_FAILURE',
  LOGOUT: 'LOGOUT',
  PASSWORD_CHANGE: 'PASSWORD_CHANGE',
  PASSWORD_RESET_REQUEST: 'PASSWORD_RESET_REQUEST',
  PASSWORD_RESET_COMPLETE: 'PASSWORD_RESET_COMPLETE',
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
  ACCOUNT_UNLOCKED: 'ACCOUNT_UNLOCKED',
  ROLE_CHANGE: 'ROLE_CHANGE',
  ACCOUNT_DEACTIVATED: 'ACCOUNT_DEACTIVATED',
  ACCOUNT_ACTIVATED: 'ACCOUNT_ACTIVATED',
  USER_CREATED: 'USER_CREATED',
  USER_DELETED: 'USER_DELETED',
};

/**
 * Extract client IP from request
 * Handles proxied requests (X-Forwarded-For header)
 */
const getClientIp = (req) => {
  if (!req) return null;

  // Check X-Forwarded-For header first (for proxied requests)
  const forwardedFor = req.headers?.['x-forwarded-for'];
  if (forwardedFor) {
    // Take the first IP in the list (client IP)
    return forwardedFor.split(',')[0].trim();
  }

  // Fall back to direct IP
  return req.ip || req.connection?.remoteAddress || null;
};

/**
 * Log an audit event
 *
 * @param {string} action - One of AuditActions
 * @param {Object} options - Event details
 * @param {ObjectId} [options.userId] - User who performed the action
 * @param {ObjectId} [options.targetUserId] - User being affected (for admin actions)
 * @param {string} [options.email] - Email used in login attempt
 * @param {Object} [options.req] - Express request object (for IP and user agent)
 * @param {Object} [options.details] - Additional context
 */
// Security-critical actions that should trigger alerts
const ALERT_ACTIONS = new Set([
  AuditActions.ACCOUNT_LOCKED,
  AuditActions.LOGIN_FAILURE,
  AuditActions.PASSWORD_RESET_REQUEST,
  AuditActions.ACCOUNT_DEACTIVATED,
  AuditActions.ROLE_CHANGE,
  AuditActions.USER_DELETED,
]);

const logAuditEvent = async (action, options = {}) => {
  try {
    const { userId, targetUserId, email, req, details } = options;

    const ipAddress = getClientIp(req);

    await AuditLog.create({
      action,
      userId,
      targetUserId,
      email,
      ipAddress,
      userAgent: req?.headers?.['user-agent'] || null,
      details,
    });

    // Emit security alerts for critical events
    if (ALERT_ACTIONS.has(action)) {
      console.warn(
        `[SECURITY_ALERT] ${action} | IP: ${ipAddress || 'unknown'} | Email: ${email || 'N/A'} | User: ${userId || 'N/A'} | ${details ? JSON.stringify(details) : ''}`
      );
    }
  } catch (error) {
    // Don't let audit logging failures break the application
    // Log to console for monitoring
    console.error('Audit logging failed:', error.message);
  }
};

/**
 * Query recent audit events for a user
 *
 * @param {ObjectId} userId - User to query
 * @param {number} [limit=50] - Maximum events to return
 * @returns {Promise<Array>} - Recent audit events
 */
const getUserAuditHistory = async (userId, limit = 50) => {
  return AuditLog.find({ userId })
    .sort({ timestamp: -1 })
    .limit(limit)
    .lean();
};

/**
 * Query recent failed login attempts for an IP
 * Useful for detecting brute force attacks across accounts
 *
 * @param {string} ipAddress - IP address to query
 * @param {number} [minutes=60] - Look back period
 * @returns {Promise<number>} - Count of failed attempts
 */
const getFailedLoginsByIp = async (ipAddress, minutes = 60) => {
  const since = new Date(Date.now() - minutes * 60 * 1000);

  return AuditLog.countDocuments({
    action: AuditActions.LOGIN_FAILURE,
    ipAddress,
    timestamp: { $gte: since },
  });
};

module.exports = {
  AuditActions,
  logAuditEvent,
  getUserAuditHistory,
  getFailedLoginsByIp,
};
