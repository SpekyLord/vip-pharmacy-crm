const Settings = require('../models/Settings');
const { catchAsync } = require('../../middleware/errorHandler');

/**
 * GET /api/erp/settings
 * Returns the single settings document (creates with defaults if none exists)
 */
const getSettings = catchAsync(async (req, res) => {
  const settings = await Settings.getSettings();
  res.json({ success: true, data: settings });
});

/**
 * PUT /api/erp/settings
 * Updates settings (admin/finance only)
 */
const updateSettings = catchAsync(async (req, res) => {
  // Strip fields that shouldn't be set via API
  const { _id, __v, createdAt, updatedAt, ...updates } = req.body;

  updates.updated_by = req.user._id;

  const settings = await Settings.findOneAndUpdate(
    {},
    { $set: updates },
    { new: true, upsert: true, runValidators: true }
  );

  Settings.clearVatCache();
  res.json({ success: true, message: 'Settings updated', data: settings });
});

module.exports = { getSettings, updateSettings };
