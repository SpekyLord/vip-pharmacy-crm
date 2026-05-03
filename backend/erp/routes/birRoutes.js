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

// ── Phase J1 — 2550M/Q VAT return aggregator + export ──
// MUST be declared BEFORE the catch-all `/forms/:id` GET so Express
// routes "2550M/2026/4/compute" to compute2550M instead of trying to
// look up a Mongo _id named "2550M".
router.get('/forms/2550M/:year/:month/compute', ctrl.compute2550M);
router.get('/forms/2550Q/:year/:quarter/compute', ctrl.compute2550Q);

// ── Phase J2 — 1601-EQ + 1606 + 2307-OUT + SAWT EWT routes ──
// EWT-specific compute / list / export.{csv,pdf,dat} endpoints. The
// per-form catch-all `/forms/:formCode/:year/:period/export.csv` from J1
// would otherwise catch `1601-EQ` exports and dispatch to the VAT
// controller (which rejects with HTTP 400). So J2 export.csv must be
// declared BEFORE the J1 catch-all to claim 1601-EQ + 1606 routes.
router.get('/forms/1601-EQ/:year/:quarter/compute', ctrl.compute1601EQ);
router.get('/forms/1606/:year/:month/compute', ctrl.compute1606);
router.get('/forms/1601-EQ/:year/:quarter/payees', ctrl.listEwtPayees);
router.get('/forms/1601-EQ/:year/:quarter/export.csv', ctrl.exportEwtCsv);
router.get('/forms/1606/:year/:month/export.csv', ctrl.exportEwtCsv);
router.get('/forms/SAWT/:year/:quarter/export.dat', ctrl.exportSawtDat);
router.get('/forms/2307-OUT/:year/:quarter/:payeeKind/:payeeId/export.pdf', ctrl.export2307Pdf);
router.get('/withholding/posture', ctrl.getWithholdingPosture);

// J1 catch-all CSV export (lower priority — must come AFTER J2 specific routes).
router.get('/forms/:formCode/:year/:period/export.csv', ctrl.exportVatReturnCsv);

router.get('/forms/:id', ctrl.getFiling);
router.post('/forms/draft', ctrl.createOrUpdateDraft);
router.post('/forms/:id/mark-reviewed', ctrl.markReviewed);
router.post('/forms/:id/mark-filed', ctrl.markFiled);
router.post('/forms/:id/mark-confirmed', ctrl.markConfirmed);

module.exports = router;
