/**
 * Message Sent Routes
 *
 * Endpoints:
 * GET    /api/messages-sent        - Get sent messages for logged-in user
 */

const express = require('express');
const router = express.Router();

const {
  getSentMessages,
} = require('../controllers/messageInboxController');

const { protect } = require('../middleware/auth');

// 🔒 All routes require authentication
router.use(protect);

// 📤 Sent messages (messages created/sent by logged-in user)
router.get('/', getSentMessages);

module.exports = router;
