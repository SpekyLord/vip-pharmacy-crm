/**
 * CaptureSubmission Routes — Phase P1 (April 23, 2026).
 *
 * Mounted at /erp/capture-submissions (no module-level erpAccessCheck —
 * every ERP user with a valid entity can create captures; proxy endpoints
 * are gated inside the controller via canProxyEntry).
 */

const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/captureSubmissionController');

// ── BDM-side ──
router.post('/',              ctrl.createCapture);
router.get('/my',             ctrl.getMyCaptures);
router.get('/my/review',      ctrl.getMyReviewQueue);
router.put('/:id/acknowledge', ctrl.acknowledgeCapture);
router.put('/:id/dispute',    ctrl.disputeCapture);
router.put('/:id/cancel',     ctrl.cancelCapture);

// ── Proxy-side ──
router.get('/queue',          ctrl.getProxyQueue);
router.get('/stats',          ctrl.getQueueStats);
router.get('/:id',            ctrl.getCaptureById);
router.put('/:id/pickup',     ctrl.pickupCapture);
router.put('/:id/release',    ctrl.releaseCapture);
router.put('/:id/complete',   ctrl.completeCapture);

module.exports = router;
