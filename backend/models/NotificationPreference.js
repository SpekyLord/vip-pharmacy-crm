/**
 * Notification Preference Model
 *
 * One document per user. Stores channel, category, sound, and scheduling preferences.
 * Field names match the frontend state keys for direct mapping.
 */

const mongoose = require('mongoose');

const notificationPreferenceSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
    index: true,
  },

  // Channels
  emailNotifications: { type: Boolean, default: true },
  smsNotifications: { type: Boolean, default: false },
  inAppAlerts: { type: Boolean, default: true },

  // Categories
  visitApprovals: { type: Boolean, default: true },
  securityAlerts: { type: Boolean, default: true },
  systemUpdates: { type: Boolean, default: true },
  reminders: { type: Boolean, default: true },
  messages: { type: Boolean, default: true },

  // Phase SG-Q2 W3 — Sales Goal compensation + variance alerts (opt-in by default).
  // Set false to suppress tier-reached notifications and plan activate/close/reopen
  // emails. KPI variance alerts use the kpiVarianceAlerts switch.
  compensationAlerts: { type: Boolean, default: true },
  kpiVarianceAlerts: { type: Boolean, default: true },

  // Sound
  soundEnabled: { type: Boolean, default: true },

  // Quiet Hours
  quietHoursEnabled: { type: Boolean, default: false },
  quietHoursStart: { type: String, default: '22:00' },
  quietHoursEnd: { type: String, default: '07:00' },

  // Email scheduling preferences
  weeklyComplianceSummary: { type: Boolean, default: true },
}, {
  timestamps: true,
});

const NotificationPreference = mongoose.model('NotificationPreference', notificationPreferenceSchema);

module.exports = NotificationPreference;
