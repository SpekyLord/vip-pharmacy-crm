const express = require('express');
const router = express.Router();
const { protect } = require('../../middleware/auth');
const { roleCheck } = require('../../middleware/roleCheck');
const { getSettings, updateSettings } = require('../controllers/settingsController');

router.get('/', protect, getSettings);
router.put('/', protect, roleCheck('admin', 'finance'), updateSettings);

module.exports = router;
