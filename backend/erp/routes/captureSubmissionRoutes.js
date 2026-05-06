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
const {
  uploadMultiple,
  handleUploadError,
  processCaptureArtifacts,
} = require('../../middleware/upload');

// ── BDM-side ──
router.post('/',              ctrl.createCapture);

// Phase P1.2 Slice 1 (May 2026) — multipart photo upload that returns S3
// URLs. Wired BEFORE /:id PUT routes (Express path-precedence is method-
// scoped so technically irrelevant, but grouping by surface keeps the file
// readable). uploadMultiple cap matches MAX_FILES (10) — Quick Capture
// snaps one photo at a time but the classic modal can batch up to 10.
router.post(
  '/upload-artifact',
  uploadMultiple('photos', 10),
  handleUploadError,
  processCaptureArtifacts,
  ctrl.uploadArtifact,
);

router.get('/my',             ctrl.getMyCaptures);
router.get('/my/review',      ctrl.getMyReviewQueue);
router.put('/:id/acknowledge', ctrl.acknowledgeCapture);
router.put('/:id/dispute',    ctrl.disputeCapture);
router.put('/:id/cancel',     ctrl.cancelCapture);

// ── Proxy-side ──
router.get('/queue',          ctrl.getProxyQueue);
router.get('/stats',          ctrl.getQueueStats);

// ── Phase P1.2 Slice 8 — Capture Archive ──────────────────────────
// Mounted BEFORE /:id so Express path-precedence resolves these literals
// rather than treating "archive" as an :id capture. Same posture as the
// Slice 7-ext Round 2B mount of /upload-artifact above.
router.get('/archive/summary',     ctrl.getCaptureArchiveSummary);
router.get('/archive/leaves',      ctrl.getCaptureArchiveLeaves);
router.get('/archive/cycle-report', ctrl.getCycleAuditReport);
router.post('/bulk-mark-received', ctrl.bulkMarkReceived);

router.get('/:id',            ctrl.getCaptureById);
router.put('/:id/pickup',     ctrl.pickupCapture);
router.put('/:id/release',    ctrl.releaseCapture);
router.put('/:id/complete',   ctrl.completeCapture);
// Phase P1.2 Slice 9 — president-only physical status override.
router.put('/:id/physical-status', ctrl.overridePhysicalStatus);

module.exports = router;
