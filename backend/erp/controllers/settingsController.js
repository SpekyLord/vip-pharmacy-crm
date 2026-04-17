const Settings = require('../models/Settings');
const { catchAsync } = require('../../middleware/errorHandler');
const { clearCoaCache } = require('../services/autoJournal');
const ChartOfAccounts = require('../models/ChartOfAccounts');

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
 * Validates COA_MAP codes against ChartOfAccounts before saving.
 */
const updateSettings = catchAsync(async (req, res) => {
  // Strip fields that shouldn't be set via API
  const { _id, __v, createdAt, updatedAt, ...updates } = req.body;

  updates.updated_by = req.user._id;

  // ── Validate COA_MAP codes against ChartOfAccounts ──
  if (updates.COA_MAP && req.entityId) {
    const coaCodes = Object.entries(updates.COA_MAP)
      .filter(([, v]) => v && typeof v === 'string')
      .map(([k, v]) => ({ key: k, code: v.trim() }));

    if (coaCodes.length) {
      const codeValues = coaCodes.map(c => c.code);
      const existing = await ChartOfAccounts.find({
        entity_id: req.entityId,
        account_code: { $in: codeValues },
        is_active: true
      }).select('account_code').lean();
      const existingSet = new Set(existing.map(a => a.account_code));

      const invalid = coaCodes.filter(c => !existingSet.has(c.code));
      if (invalid.length) {
        return res.status(400).json({
          success: false,
          message: `Invalid COA codes in COA_MAP: ${invalid.map(i => `${i.key}=${i.code}`).join(', ')}. Codes must exist in Chart of Accounts.`,
          errors: invalid.map(i => ({ field: `COA_MAP.${i.key}`, message: `Account code ${i.code} not found in Chart of Accounts` }))
        });
      }
    }
  }

  const settings = await Settings.findOneAndUpdate(
    {},
    { $set: updates },
    { new: true, upsert: true, runValidators: true }
  );

  // Clear all caches that depend on Settings
  Settings.clearVatCache();
  clearCoaCache();

  res.json({ success: true, message: 'Settings updated', data: settings });
});

module.exports = { getSettings, updateSettings };
