/**
 * Audit Log Routes
 *
 * Endpoints:
 * GET /api/audit-logs - List audit logs (admin only)
 * GET /api/audit-logs/stats - Get daily stats (admin only)
 */

const express = require('express');
const router = express.Router();

const { getAuditLogs, getAuditLogStats } = require('../controllers/auditLogController');
const { protect } = require('../middleware/auth');
const { adminOnly } = require('../middleware/roleCheck');

// All routes require authentication + admin role
router.use(protect);

router.get('/stats', adminOnly, getAuditLogStats);
router.get('/', adminOnly, getAuditLogs);

module.exports = router;
