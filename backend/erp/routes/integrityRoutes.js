/**
 * Integrity Routes — Phase A.4 (May 2026)
 *
 * Mounted at /api/erp/integrity. Per-endpoint role gating via
 * JE_RETRY_ROLES lookup (default admin/finance/president).
 */
const express = require('express');
const router = express.Router();
const { retryJe, recomputeAr } = require('../controllers/integrityController');

router.post('/retry-je', retryJe);
router.post('/recompute-ar', recomputeAr);

module.exports = router;
