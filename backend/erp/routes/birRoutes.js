/**
 * BIR Compliance Routes — Phase VIP-1.J (Apr 2026).
 *
 * Mounted at /api/erp/bir from routes/index.js. Auth + tenantFilter run
 * upstream; per-route role gates use birAccess (lookup-driven, BIR_ROLES).
 *
 * The inbound-email webhook is intentionally outside the auth chain — it is
 * mounted ABOVE the protect/tenantFilter wall in routes/index.js as
 * /api/erp/bir/inbound-email and uses an X-Webhook-Secret header.
 */

const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/birController');

// Dashboard
router.get('/dashboard', ctrl.getDashboard);

// Entity tax-config
router.get('/entity-config', ctrl.getEntityConfig);
router.patch('/entity-config', ctrl.updateEntityConfig);

// Data quality
router.post('/data-quality/run', ctrl.runDataQuality);
router.get('/data-quality/latest', ctrl.getLatestDataQuality);
router.get('/data-quality/findings', ctrl.getDataQualityFindings);

// Filings
router.get('/forms', ctrl.listFilings);
router.get('/forms/:id', ctrl.getFiling);
router.post('/forms/draft', ctrl.createOrUpdateDraft);
router.post('/forms/:id/mark-reviewed', ctrl.markReviewed);
router.post('/forms/:id/mark-filed', ctrl.markFiled);
router.post('/forms/:id/mark-confirmed', ctrl.markConfirmed);

module.exports = router;
