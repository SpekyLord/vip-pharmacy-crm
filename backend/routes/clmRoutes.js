/**
 * CLM Routes
 *
 * Public (anonymous):
 * GET    /api/clm/deck/:id                       - Phase N: public deck viewer (rate-limited, read-only)
 *
 * Authenticated:
 * POST   /api/clm/sessions                      - Start a new CLM session (with optional productIds + mode)
 * GET    /api/clm/sessions/my                    - Get current BDM's sessions
 * GET    /api/clm/sessions/all                   - Get all sessions (admin)
 * GET    /api/clm/sessions/analytics             - Get analytics summary (admin)
 * GET    /api/clm/sessions/performance           - Phase D.4c: per-BDM × slide × product coaching matrix (admin)
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
const rateLimit = require('express-rate-limit');
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
  // Phase D.4c — admin coaching surface
  getPerformanceMatrix,
  // Phase N — public anonymous deck viewer
  getPublicDeck,
} = require('../controllers/clmController');

// ── Phase N — Public deck viewer (mounted BEFORE protect) ───────────
// Rate-limited per IP at 10 req/min — generous for the BDM's office WiFi
// (multiple BDMs sharing the same outbound IP) but tight enough to deter
// enumeration. Only remote-mode sessions are exposed; in-person sessions
// 404 even with a correct ID.
const publicDeckRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests. Please slow down.' },
});
router.get('/deck/:id', publicDeckRateLimit, getPublicDeck);

// Every route below this line requires a decoded JWT for req.user; role gates layer on top.
router.use(protect);

// ── Admin routes (specific paths FIRST — before the /:id generic) ───
router.get('/sessions/all', adminOnly, getAllSessions);
router.get('/sessions/analytics', adminOnly, getAnalytics);
// Phase D.4c — MUST stay above the /:id generic so 'performance' isn't
// captured as an ObjectId param.
router.get('/sessions/performance', adminOnly, getPerformanceMatrix);

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
