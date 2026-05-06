const express = require('express');

const { processDocument, getSupportedTypes } = require('../controllers/ocrController');
const { protect } = require('../../middleware/auth');
const tenantFilter = require('../middleware/tenantFilter');
const { uploadSingle } = require('../../middleware/upload');

const router = express.Router();

// Phase P1.2 Slice 7-extension Round 2B (May 2026) — `tenantFilter` is now
// required because the new capture-pull mode (`POST /process` with body
// `{ capture_id }`) looks up `CaptureSubmission` by `entity_id`. The legacy
// file-upload path doesn't strictly need it but adding the middleware keeps
// the posture consistent with every other ERP-data route — and it sets
// `req.bdmId` / `req.isPresident` / `req.isAdmin` / `req.isFinance` which the
// capture-mode auth gate consumes.
router.use(protect, tenantFilter);

router.get('/types', getSupportedTypes);
router.post('/process', uploadSingle('photo'), processDocument);

module.exports = router;
