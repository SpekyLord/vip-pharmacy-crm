const express = require('express');
const router = express.Router();
const { roleCheck } = require('../../middleware/roleCheck');
const {
  runAutoCloseEndpoint,
  runStagingEndpoint,
  postStagedEndpoint,
  finalizeEndpoint,
  getProgressEndpoint
} = require('../controllers/monthEndCloseController');

// All month-end close actions require Finance/Admin/President
router.post('/auto-close', roleCheck('admin', 'finance', 'president'), runAutoCloseEndpoint);
router.post('/staging', roleCheck('admin', 'finance', 'president'), runStagingEndpoint);
router.post('/post-staged', roleCheck('admin', 'finance', 'president'), postStagedEndpoint);
router.post('/finalize', roleCheck('admin', 'finance', 'president'), finalizeEndpoint);
router.get('/progress/:period', getProgressEndpoint);

module.exports = router;
