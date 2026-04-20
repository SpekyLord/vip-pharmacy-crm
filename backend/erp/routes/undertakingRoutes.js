/**
 * Undertaking Routes — Phase 32R (Apr 20, 2026)
 *
 * Mounted under /api/erp/undertaking. Umbrella access via erpAccessCheck('inventory')
 * is applied at the parent mount in routes/index.js.
 *
 * Read-only approval wrapper — capture lives on GRN. BDM validates+submits,
 * approver acknowledges. No edit/scan routes (data owned by GRN).
 *
 * President-reverse uses the `inventory.reverse_undertaking` danger sub-permission.
 * Subsidiaries can delegate by ticking it on an Access Template (no code change).
 */
const express = require('express');
const router = express.Router();
const { protect } = require('../../middleware/auth');
const { erpSubAccessCheck } = require('../middleware/erpAccessCheck');
const c = require('../controllers/undertakingController');

// List + detail
router.get('/', protect, c.getUndertakingList);
router.get('/:id', protect, c.getUndertakingById);

// Lifecycle transitions — period-lock check runs inside the controller
// using the doc's receipt_date (more reliable than body inference).
router.post('/:id/submit', protect, c.submitUndertaking);
router.post('/:id/acknowledge', protect, c.acknowledgeUndertaking);
router.post('/:id/reject', protect, c.rejectUndertaking);

// Danger — cascade reverses linked GRN if APPROVED.
// Sub-perm key: `inventory.reverse_undertaking` (seeded in ERP_DANGER_SUB_PERMISSIONS).
router.post('/:id/president-reverse', protect, erpSubAccessCheck('inventory', 'reverse_undertaking'), c.presidentReverseUndertaking);

module.exports = router;
