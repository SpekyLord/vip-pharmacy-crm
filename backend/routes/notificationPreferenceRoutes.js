/**
 * Notification Preference Routes
 *
 * GET  /api/notification-preferences     - Get user's preferences
 * PUT  /api/notification-preferences     - Update user's preferences
 */

const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { anyRole } = require('../middleware/roleCheck');
const { getPreferences, updatePreferences } = require('../controllers/notificationPreferenceController');

router.use(protect, anyRole);

router.route('/')
  .get(getPreferences)
  .put(updatePreferences);

module.exports = router;
