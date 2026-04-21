/**
 * Invite Routes — Phase M1 (Apr 2026)
 *
 * POST /api/invites/generate          — generate deep-link invite (BDM/Admin)
 * GET  /api/invites                   — list invites with filters (BDM: own; Admin: all)
 * POST /api/invites/consent           — manual consent capture (Admin only)
 * POST /api/invites/partner/enroll    — MD Partner enrollment scaffold (Admin only)
 */

const express = require('express');
const router = express.Router();

const {
  generateInvite,
  listInvites,
  updateConsent,
  enrollPartner,
} = require('../controllers/inviteController');

const { protect } = require('../middleware/auth');
const { adminOrEmployee, adminOnly } = require('../middleware/roleCheck');

router.use(protect);

router.post('/generate', adminOrEmployee, generateInvite);
router.get('/', adminOrEmployee, listInvites);
router.post('/consent', adminOnly, updateConsent);
router.post('/partner/enroll', adminOnly, enrollPartner);

module.exports = router;
