/**
 * Notification Preference Controller
 *
 * Handles GET and PUT for user notification preferences.
 * Returns schema defaults if no saved preferences exist.
 */

const NotificationPreference = require('../models/NotificationPreference');
const { catchAsync } = require('../middleware/errorHandler');

// Whitelist of fields that can be updated (prevent injection)
const ALLOWED_FIELDS = [
  'emailNotifications',
  'smsNotifications',
  'inAppAlerts',
  'visitApprovals',
  'securityAlerts',
  'systemUpdates',
  'reminders',
  'messages',
  'soundEnabled',
  'quietHoursEnabled',
  'quietHoursStart',
  'quietHoursEnd',
  'behindScheduleAlertFrequency',
  'weeklyComplianceSummary',
];

/**
 * @desc    Get current user's notification preferences
 * @route   GET /api/notification-preferences
 * @access  Private (any role)
 */
const getPreferences = catchAsync(async (req, res) => {
  let prefs = await NotificationPreference.findOne({ user: req.user._id }).lean();

  if (!prefs) {
    // Return schema defaults
    prefs = {
      emailNotifications: true,
      smsNotifications: false,
      inAppAlerts: true,
      visitApprovals: true,
      securityAlerts: true,
      systemUpdates: true,
      reminders: true,
      messages: true,
      soundEnabled: true,
      quietHoursEnabled: false,
      quietHoursStart: '22:00',
      quietHoursEnd: '07:00',
      behindScheduleAlertFrequency: 'twice_weekly',
      weeklyComplianceSummary: true,
    };
  }

  res.json({
    success: true,
    data: prefs,
  });
});

/**
 * @desc    Update current user's notification preferences
 * @route   PUT /api/notification-preferences
 * @access  Private (any role)
 */
const updatePreferences = catchAsync(async (req, res) => {
  // Filter to allowed fields only
  const updates = {};
  for (const field of ALLOWED_FIELDS) {
    if (req.body[field] !== undefined) {
      updates[field] = req.body[field];
    }
  }

  const prefs = await NotificationPreference.findOneAndUpdate(
    { user: req.user._id },
    { $set: updates, $setOnInsert: { user: req.user._id } },
    { new: true, upsert: true, runValidators: true }
  ).lean();

  res.json({
    success: true,
    message: 'Notification preferences updated',
    data: prefs,
  });
});

module.exports = {
  getPreferences,
  updatePreferences,
};
