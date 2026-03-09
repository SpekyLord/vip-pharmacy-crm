const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { adminOnly } = require('../middleware/roleCheck');
const {
  generateReport,
  getReports,
  getReportStats,
  downloadReport,
  deleteReport,
  createScheduledReport,
  getScheduledReports,
  updateScheduledReport,
  deleteScheduledReport,
  runScheduledNow,
} = require('../controllers/reportController');

// All routes require admin access
router.use(protect, adminOnly);

// Report stats (must be before /:id routes)
router.get('/stats', getReportStats);

// Scheduled reports (must be before /:id routes)
router.route('/scheduled')
  .get(getScheduledReports)
  .post(createScheduledReport);

router.route('/scheduled/:id')
  .put(updateScheduledReport)
  .delete(deleteScheduledReport);

router.post('/scheduled/:id/run', runScheduledNow);

// Generated reports
router.post('/generate', generateReport);

router.route('/')
  .get(getReports);

router.get('/:id/download', downloadReport);
router.delete('/:id', deleteReport);

module.exports = router;
