/**
 * Month-End Close Routes — Phase 11, updated Phase 16 (sub-module access)
 */
const express = require('express');
const router = express.Router();
const { erpSubAccessCheck } = require('../middleware/erpAccessCheck');
const {
  runAutoCloseEndpoint,
  runStagingEndpoint,
  postStagedEndpoint,
  finalizeEndpoint,
  getProgressEndpoint
} = require('../controllers/monthEndCloseController');

// All month-end close actions require accounting.month_end sub-permission
router.post('/auto-close', erpSubAccessCheck('accounting', 'month_end'), runAutoCloseEndpoint);
router.post('/staging', erpSubAccessCheck('accounting', 'month_end'), runStagingEndpoint);
router.post('/post-staged', erpSubAccessCheck('accounting', 'month_end'), postStagedEndpoint);
router.post('/finalize', erpSubAccessCheck('accounting', 'month_end'), finalizeEndpoint);
router.get('/progress/:period', getProgressEndpoint);

module.exports = router;
