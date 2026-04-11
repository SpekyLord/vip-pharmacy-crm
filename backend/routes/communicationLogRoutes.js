/**
 * Communication Log Routes
 *
 * POST   /api/communication-logs          — Create log (screenshot upload)
 * POST   /api/communication-logs/send     — Send message via API (Phase 2)
 * GET    /api/communication-logs/my       — BDM's own logs
 * GET    /api/communication-logs/doctor/:doctorId — Logs for a VIP Client
 * GET    /api/communication-logs/client/:clientId — Logs for a Regular Client
 * GET    /api/communication-logs          — All logs (admin)
 * GET    /api/communication-logs/:id      — Single log
 * PATCH  /api/communication-logs/:id/archive — Archive a log
 */

const express = require('express');
const router = express.Router();

const {
  createLog,
  getMyLogs,
  getLogsByDoctor,
  getLogsByClient,
  getAllLogs,
  getLogById,
  archiveLog,
  sendMessage,
} = require('../controllers/communicationLogController');

const { protect } = require('../middleware/auth');
const { adminOnly, adminOrEmployee } = require('../middleware/roleCheck');
const { uploadMultiple, processCommScreenshots, parseFormDataJson } = require('../middleware/upload');

// All routes require authentication
router.use(protect);

// Screenshot upload route (Phase 1)
router.post(
  '/',
  adminOrEmployee,
  uploadMultiple('photos', 10),
  processCommScreenshots,
  parseFormDataJson([]),
  createLog
);

// API send route (Phase 2)
router.post('/send', adminOrEmployee, sendMessage);

// BDM's own logs
router.get('/my', adminOrEmployee, getMyLogs);

// Logs by doctor/client
router.get('/doctor/:doctorId', adminOrEmployee, getLogsByDoctor);
router.get('/client/:clientId', adminOrEmployee, getLogsByClient);

// Admin: all logs
router.get('/', adminOnly, getAllLogs);

// Single log (must be after /my, /doctor, /client to avoid param conflicts)
router.get('/:id', adminOrEmployee, getLogById);

// Archive
router.patch('/:id/archive', adminOrEmployee, archiveLog);

module.exports = router;
