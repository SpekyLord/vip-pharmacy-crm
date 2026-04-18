const express = require('express');
const ctrl = require('../controllers/ocrSettingsController');
const { roleCheck } = require('../../middleware/roleCheck');

const router = express.Router();
const adminFinance = roleCheck('admin', 'finance', 'president');

// Read settings — visible to anyone with ERP access (UI shows current effective config)
router.get('/', ctrl.getSettings);
router.get('/usage', ctrl.getUsage);
router.get('/usage/recent', ctrl.getRecentUsage);

// Mutations — admin/finance/president only
router.put('/', adminFinance, ctrl.updateSettings);

module.exports = router;
