/**
 * Message Inbox Routes — Phase G9.R4 → G9.R8 (Apr 2026)
 *
 * GET    /api/messages                      List w/ filters (folder, requires_action, thread_id, counts=1)
 * GET    /api/messages/counts               Lightweight unread + action_required counts
 * GET    /api/messages/folders              Lookup-driven folder + action config
 * GET    /api/messages/sent                 Admin sent items
 * GET    /api/messages/thread/:thread_id    Full thread (oldest first)
 * POST   /api/messages                      Admin generic compose (legacy)
 * POST   /api/messages/notify               Admin → specific user (legacy compliance alert)
 * POST   /api/messages/compose              Two-way compose (any role w/ messaging.* perm)
 * POST   /api/messages/:id/reply            Reply to a message (threaded)
 * POST   /api/messages/:id/action           Execute the row's action (approve/reject/resolve/acknowledge)
 * PATCH  /api/messages/:id/read             Per-user read
 * PATCH  /api/messages/:id/unread           Per-user unread
 *
 * ── Phase G9.R8 (Apr 2026): archive + ack + retention ─────────────
 * PATCH  /api/messages/:id/archive          Self-archive (per-recipient)
 * PATCH  /api/messages/:id/unarchive        Self-unarchive
 * PATCH  /api/messages/bulk-archive         Bulk self-archive {ids: [...]}
 * PATCH  /api/messages/read-all             Bulk mark-read for a folder
 * PATCH  /api/messages/:id/acknowledge      Explicit I-acknowledge-this (audit trail)
 * GET    /api/messages/:id/ack-status       Sender/admin read-receipts dashboard
 * POST   /api/messages/retention/run-now    Manual retention run (gated)
 * GET    /api/messages/retention/preview    Dry-run retention count (gated)
 */

const express = require('express');
const router = express.Router();

const {
  getInboxMessages,
  getSentMessages,
  getCounts,
  getThread,
  getFolders,
  createInboxMessage,
  createMessageNotify,
  composeMessage,
  replyToMessage,
  executeAction,
  markMessageRead,
  markMessageUnread,
  // Phase G9.R8
  archiveMessage,
  unarchiveMessage,
  bulkArchiveMessages,
  markAllRead,
  acknowledgeMessage,
  getAckStatus,
  runRetentionNow,
  previewRetention,
  // Phase N offline-first sprint
  recordSystemEvent,
} = require('../controllers/messageInboxController');

const { protect } = require('../middleware/auth');
const { adminOnly } = require('../middleware/roleCheck');
const { erpSubAccessCheck } = require('../erp/middleware/erpAccessCheck');

// 🔒 All routes require authentication
router.use(protect);

// ── List + folder navigation ────────────────────────────────────
router.get('/', getInboxMessages);
router.get('/counts', getCounts);
router.get('/folders', getFolders);
router.get('/sent', adminOnly, getSentMessages);
router.get('/thread/:thread_id', getThread);

// ── Phase G9.R8 — Retention (privileged) ────────────────────────
// These two MUST be defined BEFORE the `/:id/*` patterns below, otherwise
// 'retention' would be captured as an :id param and 404. Gated by the
// messaging.retention_manage sub-permission (seeded in
// backend/erp/controllers/lookupGenericController.js ERP_SUB_PERMISSION).
router.post('/retention/run-now', erpSubAccessCheck('messaging', 'retention_manage'), runRetentionNow);
router.get('/retention/preview', erpSubAccessCheck('messaging', 'retention_manage'), previewRetention);

// ── Write paths ──────────────────────────────────────────────────
router.post('/', adminOnly, createInboxMessage);
router.post('/notify', adminOnly, createMessageNotify);
// compose is open to all authenticated roles — controller enforces sub-perms
// + MESSAGE_ACCESS_ROLES matrix per Phase G9.R3 (Rule #3 lookup-driven gating)
router.post('/compose', composeMessage);

// ── Phase G9.R8 — Bulk archive / read-all (before /:id/* routes) ─
// Placed before the single-item PATCH routes so the literal paths match first.
router.patch('/bulk-archive', bulkArchiveMessages);
router.patch('/read-all', markAllRead);

// ── Phase N offline-first sprint — Self-DM system event recorder ──
// Authenticated-only; recipient is forced to req.user._id server-side.
// event_type is allowlisted: sync_complete | sync_error | visit_draft_lost.
router.post('/system-event', recordSystemEvent);

// ── Single-item write paths (keep after bulk paths to avoid id-capture) ──
router.post('/:id/reply', replyToMessage);
router.post('/:id/action', executeAction);

// ── Per-user state ──────────────────────────────────────────────
router.patch('/:id/read', markMessageRead);
router.patch('/:id/unread', markMessageUnread);

// ── Phase G9.R8 — Per-recipient archive + ack + read-receipts ──
router.patch('/:id/archive', archiveMessage);
router.patch('/:id/unarchive', unarchiveMessage);
router.patch('/:id/acknowledge', acknowledgeMessage);
router.get('/:id/ack-status', getAckStatus);

module.exports = router;
