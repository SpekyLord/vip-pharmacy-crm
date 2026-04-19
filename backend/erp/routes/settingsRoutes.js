const express = require('express');
const router = express.Router();
const { protect } = require('../../middleware/auth');
const { erpSubAccessCheck } = require('../middleware/erpAccessCheck');
const { getSettings, updateSettings } = require('../controllers/settingsController');

router.get('/', protect, getSettings);
// Phase 3c — settings writes touch COA_MAP, VAT rates, module config, and bust the
// in-process cache for all subsequent journal posts. Danger-baseline.
router.put('/', protect, erpSubAccessCheck('accounting', 'settings_write'), updateSettings);

module.exports = router;
