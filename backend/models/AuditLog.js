/**
 * Audit Log Model
 *
 * Tracks security-relevant events for compliance and monitoring:
 * - Login attempts (success/failure)
 * - Password changes and resets
 * - Account lockouts
 * - Role changes
 * - Account deactivations
 *
 * SECURITY: Logs auto-expire after 90 days via TTL index
 */

const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  action: {
    type: String,
    enum: [
      'LOGIN_SUCCESS',
      'LOGIN_FAILURE',
      'LOGOUT',
      'PASSWORD_CHANGE',
      'PASSWORD_RESET_REQUEST',
      'PASSWORD_RESET_COMPLETE',
      'ACCOUNT_LOCKED',
      'ACCOUNT_UNLOCKED',
      'ROLE_CHANGE',
      'ACCOUNT_DEACTIVATED',
      'ACCOUNT_ACTIVATED',
      'USER_CREATED',
      'USER_DELETED',
      'PERSON_ENTITY_TRANSFER',
      'PERSON_ENTITY_GRANT',
      'PERSON_ENTITY_REVOKE',
    ],
    required: true,
    index: true,
  },
  // User who performed the action (or attempted to)
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true,
  },
  // For admin actions: the user being modified
  targetUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  // Email used in login attempt (for failed logins where user doesn't exist)
  email: {
    type: String,
    lowercase: true,
    trim: true,
  },
  // Client information
  ipAddress: {
    type: String,
  },
  userAgent: {
    type: String,
  },
  // Additional context for the event
  details: {
    type: mongoose.Schema.Types.Mixed,
  },
  // When the event occurred
  timestamp: {
    type: Date,
    default: Date.now,
  },
}, {
  timestamps: false, // We use our own timestamp field
});

// TTL index to auto-delete logs after 90 days (also serves as the timestamp index)
auditLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

// Compound indexes for common queries
auditLogSchema.index({ action: 1, timestamp: -1 });
auditLogSchema.index({ userId: 1, timestamp: -1 });
auditLogSchema.index({ ipAddress: 1, action: 1, timestamp: -1 });

const AuditLog = mongoose.model('AuditLog', auditLogSchema);

module.exports = AuditLog;
