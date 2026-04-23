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
 * PUT    /api/clm/sessions/:id/qr-scan           - Mark QR as scanned (manual)
 * POST   /api/clm/webhook/messenger              - Messenger webhook (QR scan callback)
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

// All routes require authentication (except webhook)
router.use(protect);

// ── BDM routes ──────────────────────────────────────────────────────
router.post('/sessions', startSession);
router.get('/sessions/my', getMySessions);
router.get('/sessions/:id', getSessionById);
router.put('/sessions/:id/end', endSession);
router.put('/sessions/:id/slides', recordSlideEvents);
router.put('/sessions/:id/products', addProducts);
router.put('/sessions/:id/product-interest', updateProductInterest);
router.put('/sessions/:id/qr-shown', markQrDisplayed);
router.put('/sessions/:id/qr-scan', markQrScanned);

// ── Admin routes ────────────────────────────────────────────────────
router.get('/sessions/all', adminOnly, getAllSessions);
router.get('/sessions/analytics', adminOnly, getAnalytics);

// ── Messenger webhook (public — called by Facebook) ─────────────────
// Note: In production, this should verify the Facebook webhook signature.
// For now, it accepts a messengerRef and marks the session as converted.
router.post('/webhook/messenger', markQrScanned);

module.exports = router;
