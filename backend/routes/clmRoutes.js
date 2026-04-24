/**
 * CLM Routes
 *
 * Endpoints:
 * POST   /api/clm/sessions                      - Start a new CLM session (with optional productIds)
 * GET    /api/clm/sessions/my                    - Get current BDM's sessions
 * GET    /api/clm/sessions/all                   - Get all sessions (admin)
 * GET    /api/clm/sessions/analytics             - Get analytics summary (admin)
 * GET    /api/clm/sessions/:id                   - Get session by ID
 * PUT    /api/clm/sessions/:id/end               - End / complete a session
 * PUT    /api/clm/sessions/:id/slides            - Record slide events (batch)
 * PUT    /api/clm/sessions/:id/products          - Add products to an in-progress session
 * PUT    /api/clm/sessions/:id/product-interest  - Update product interest for a session
 * PUT    /api/clm/sessions/:id/qr-shown          - Mark QR as displayed
 * PUT    /api/clm/sessions/:id/qr-scan           - Mark QR as scanned (manual fallback)
 *
 * Meta/Messenger webhook conversion runs through /api/webhooks/messenger
 * (signature-verified at webhookRoutes.js). This file no longer hosts a
 * CLM-specific webhook endpoint.
 */
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { adminOnly, adminOrEmployee } = require('../middleware/roleCheck');
const {
  startSession,
  endSession,
  addProducts,
  updateProductInterest,
  recordSlideEvents,
  markQrDisplayed,
  markQrScanned,
  getMySessions,
  getAllSessions,
  getSessionById,
  getAnalytics,
} = require('../controllers/clmController');

// Every route requires a decoded JWT for req.user; role gates layer on top.
router.use(protect);

// ── Admin routes (specific paths FIRST — before the /:id generic) ───
router.get('/sessions/all', adminOnly, getAllSessions);
router.get('/sessions/analytics', adminOnly, getAnalytics);

// ── BDM + Admin routes ──────────────────────────────────────────────
router.get('/sessions/my', adminOrEmployee, getMySessions);
router.post('/sessions', adminOrEmployee, startSession);
router.get('/sessions/:id', adminOrEmployee, getSessionById);
router.put('/sessions/:id/end', adminOrEmployee, endSession);
router.put('/sessions/:id/slides', adminOrEmployee, recordSlideEvents);
router.put('/sessions/:id/products', adminOrEmployee, addProducts);
router.put('/sessions/:id/product-interest', adminOrEmployee, updateProductInterest);
router.put('/sessions/:id/qr-shown', adminOrEmployee, markQrDisplayed);
router.put('/sessions/:id/qr-scan', adminOrEmployee, markQrScanned);

module.exports = router;
