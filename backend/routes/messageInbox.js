/**
 * Message Inbox Routes — Phase G9.R4 Unified Operational Inbox
 *
 * GET    /api/messages                      List w/ filters (folder, requires_action, thread_id, counts=1)
 * GET    /api/messages/counts               Lightweight counts for navbar bell
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
} = require('../controllers/messageInboxController');

const { protect } = require('../middleware/auth');
const { adminOnly } = require('../middleware/roleCheck');

// 🔒 All routes require authentication
router.use(protect);

// ── List + folder navigation ────────────────────────────────────
router.get('/', getInboxMessages);
router.get('/counts', getCounts);
router.get('/folders', getFolders);
router.get('/sent', adminOnly, getSentMessages);
router.get('/thread/:thread_id', getThread);

// ── Write paths ──────────────────────────────────────────────────
router.post('/', adminOnly, createInboxMessage);
router.post('/notify', adminOnly, createMessageNotify);
// compose is open to all authenticated roles — controller enforces sub-perms
// + MESSAGE_ACCESS_ROLES matrix per Phase G9.R3 (Rule #3 lookup-driven gating)
router.post('/compose', composeMessage);
router.post('/:id/reply', replyToMessage);
router.post('/:id/action', executeAction);

// ── Per-user state ──────────────────────────────────────────────
router.patch('/:id/read', markMessageRead);
router.patch('/:id/unread', markMessageUnread);

module.exports = router;
