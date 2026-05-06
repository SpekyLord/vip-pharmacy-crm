/**
 * DriveAllocation Routes — Phase P1.2 Slice 4 (May 06 2026).
 *
 * Mounted at /api/erp/drive-allocations. No module-level erpAccessCheck —
 * every BDM with a valid entity can record their own allocations; cross-BDM
 * writes are gated inside the controller (privileged role check + lookup
 * gate). Mirrors the captureSubmissionRoutes mount posture.
 */

const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/driveAllocationController');

router.get('/unallocated-workdays', ctrl.getUnallocatedWorkdays);
router.get('/my',                   ctrl.getMyAllocations);
router.post('/allocate',            ctrl.allocate);
router.post('/no-drive',            ctrl.markNoDrive);

module.exports = router;
