/**
 * Email Log Model
 *
 * Tracks all email send attempts for audit and debugging:
 * - Password reset emails
 * - Weekly compliance summaries
 * - Behind-schedule alerts
 *
 * Logs auto-expire after 90 days via TTL index (same pattern as AuditLog)
 */

const mongoose = require('mongoose');

const emailLogSchema = new mongoose.Schema({
  recipient: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
  },
  recipientUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true,
  },
  emailType: {
    type: String,
    enum: [
      'PASSWORD_RESET',
      'ADMIN_WEEKLY_SUMMARY',
      'BDM_WEEKLY_REPORT',
      'BEHIND_SCHEDULE_ALERT',
    ],
    required: true,
    index: true,
  },
  subject: {
    type: String,
    required: true,
  },
  status: {
    type: String,
    enum: ['sent', 'failed'],
    required: true,
  },
  sesMessageId: {
    type: String,
  },
  errorMessage: {
    type: String,
  },
  sentAt: {
    type: Date,
    default: Date.now,
    index: true,
  },
}, {
  timestamps: false,
});

// TTL index to auto-delete logs after 90 days
emailLogSchema.index({ sentAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

// Compound indexes for common queries
emailLogSchema.index({ emailType: 1, sentAt: -1 });
emailLogSchema.index({ recipientUserId: 1, sentAt: -1 });

const EmailLog = mongoose.model('EmailLog', emailLogSchema);

module.exports = EmailLog;
