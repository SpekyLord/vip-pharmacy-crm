/**
 * Message Inbox Routes
 *
 * Endpoints:
 * GET    /api/messages            - Get inbox messages for logged-in user (role-based)
 * GET    /api/messages/:id        - Get single message by ID
 * POST   /api/messages            - Create new message (admin only)
 * PATCH  /api/messages/:id/read   - Mark message as read
 * DELETE /api/messages/:id        - Soft delete message (admin only)
 */

const express = require('express');
const router = express.Router();

const {
  getInboxMessages,
  getSentMessages, // ✅ add
  createInboxMessage,
  createMessageNotify,
  markMessageRead,
  markMessageUnread,
} = require('../controllers/messageInboxController');




const { protect } = require('../middleware/auth');
const { adminOnly } = require('../middleware/roleCheck');

// 🔒 All routes require authentication
router.use(protect);



// 📄 Single message
router.get('/', getInboxMessages);

// 📤 Sent (admin only)
router.get('/sent', adminOnly, getSentMessages); // ✅ add

// 📝 Admin creates message (generic)
router.post('/', adminOnly, createInboxMessage);

// 🔔 MessageNotify (admin -> specific user)
router.post('/notify', adminOnly, createMessageNotify);


// ✅ Mark as read (per-user)
router.patch('/:id/read', markMessageRead);

router.patch('/:id/unread', markMessageUnread);



module.exports = router;
