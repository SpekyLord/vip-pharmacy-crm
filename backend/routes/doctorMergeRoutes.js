/**
 * Doctor (VIP-Client) Merge Routes — Phase A.5.5 (Apr 2026).
 *
 * Mounted at /api/admin/md-merge from server.js. All endpoints require
 * authentication; per-action role checks happen INSIDE the controller via
 * VIP_CLIENT_LIFECYCLE_ROLES lookup (lookup-driven, lazy-seeded with
 * inline defaults — see backend/utils/resolveVipClientLifecycleRole.js).
 *
 * Why role checks live in the controller, not the route layer: the lookup is
 * per-entity and per-code, so the gate cannot be a static middleware — it
 * varies by which action (view / execute / rollback) the route handler runs.
 * The controller's gateRole() helper is the single point of enforcement.
 */

const express = require('express');
const router = express.Router();

const {
  candidates,
  preview,
  execute,
  history,
  rollback,
} = require('../controllers/doctorMergeController');
const { protect } = require('../middleware/auth');

router.use(protect);

router.get('/candidates', candidates);
router.post('/preview', preview);
router.post('/execute', execute);
router.get('/history', history);
router.post('/rollback/:auditId', rollback);

module.exports = router;
