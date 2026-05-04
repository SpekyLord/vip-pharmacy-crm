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

// ── Phase J3 — 1601-C Monthly Compensation Withholding routes (May 2026) ──
// Same priority concern as J2 — must beat the J1 catch-all below.
router.get('/forms/1601-C/:year/:month/compute', ctrl.compute1601C);
router.get('/forms/1601-C/:year/:month/export.csv', ctrl.exportEwtCsv);
router.get('/withholding/comp-posture', ctrl.getCompensationPosture);

// ── Phase J3 Part B — 1604-CF Annual Alphalist + Form 2316 (May 2026) ──
// Annual encoding (year only — no :period segment) so the route doesn't
// collide with the catch-all below. The 2316 PDF is per-employee per-year:
// route shape mirrors export2307Pdf but trimmed (no quarter, no payeeKind —
// 2316 is always PeopleMaster-scoped).
router.get('/forms/1604-CF/:year/compute', ctrl.compute1604CF);
router.get('/forms/1604-CF/:year/export.dat', ctrl.export1604CFDat);
router.get('/forms/2316/:year/:payeeId/export.pdf', ctrl.export2316Pdf);

// ── Phase J4 — 1604-E Annual EWT Alphalist + QAP Quarterly Alphalist (May 2026) ──
// Annual (1604-E) uses year-only URL — same pattern as 1604-CF. Quarterly
// (QAP) uses :year/:quarter — same pattern as 1601-EQ. Both must be declared
// BEFORE the J1 catch-all so Express doesn't dispatch them to the VAT CSV
// exporter.
router.get('/forms/1604-E/:year/compute', ctrl.compute1604E);
router.get('/forms/1604-E/:year/export.dat', ctrl.export1604EDat);
router.get('/forms/QAP/:year/:quarter/compute', ctrl.computeQAP);
router.get('/forms/QAP/:year/:quarter/export.dat', ctrl.exportQAPDat);

// ── Phase J5 — Books of Accounts (Loose-Leaf PDFs) (May 2026) ──────────
// MUST come BEFORE the catch-all `/forms/:formCode/:year/:period/export.csv`
// and the per-id `/forms/:id` GET below. The book code lives in :bookCode
// (one of SALES_JOURNAL / PURCHASE_JOURNAL / CASH_RECEIPTS /
// CASH_DISBURSEMENTS / GENERAL_JOURNAL / GENERAL_LEDGER). Annual binding
// = no ?month query; monthly = ?month=1..12.
router.get('/forms/BOOKS/:year/catalog', ctrl.getBooksCatalog);
router.get('/forms/BOOKS/:year/:bookCode/compute', ctrl.computeBook);
router.get('/forms/BOOKS/:year/:bookCode/export.pdf', ctrl.exportBookPdf);
router.get('/forms/BOOKS/:year/:bookCode/sworn-declaration.pdf', ctrl.exportBookSwornDeclarationPdf);

// ── Phase J6 — Inbound 2307 Reconciliation (May 2026) ──────────────────
// Annual variant uses /forms/2307-IN/:year (year-only — must beat the J1
// catch-all). Quarterly variant uses /forms/2307-IN/:year/:quarter (the
// :quarter segment is `Q1`..`Q4` OR `1`..`4`). Mark / exclude actions are
// POSTs against per-row IDs and gated by RECONCILE_INBOUND_2307.
//
// 1702 credit roll-up endpoint sits under /forms/1702/:year/cwt-rollup —
// Phase J7 will build the full 1702 page on top of this read.
router.get('/forms/2307-IN/:year/compute', ctrl.compute2307Inbound);
router.get('/forms/2307-IN/:year/:quarter/compute', ctrl.compute2307Inbound);
router.get('/forms/2307-IN/:year/list', ctrl.list2307InboundRows);
router.post('/forms/2307-IN/:year/rows/:rowId/mark-received', ctrl.markReceived2307Inbound);
router.post('/forms/2307-IN/:year/rows/:rowId/mark-pending', ctrl.markPending2307Inbound);
router.post('/forms/2307-IN/:year/rows/:rowId/exclude', ctrl.exclude2307InboundRow);
router.get('/withholding/inbound-posture', ctrl.getInboundCwtPosture);
router.get('/forms/1702/:year/cwt-rollup', ctrl.compute1702CwtRollup);

// ── Phase J7 — Annual Income Tax Return (1702 / 1701) (May 2026) ───────
// 1702 (CORP/OPC/PARTNERSHIP) and 1701 (SOLE_PROP) compute + manual-update
// + mark-filed. Year-only encoding (no period segment) — both must be
// declared BEFORE the J1 `/forms/:formCode/:year/:period/export.csv` catch-
// all and BEFORE the per-id `/forms/:id` GET. The mark-filed route lazy-
// creates the 2307-IN annual-closure BirFilingStatus row stamping the CWT
// credit claimed against the year's income tax (audit twin).
router.get('/forms/1702/:year/compute', ctrl.compute1702);
router.get('/forms/1701/:year/compute', ctrl.compute1701);
router.patch('/forms/1702/:year/manual', ctrl.update1702Manual);
router.patch('/forms/1701/:year/manual', (req, res, next) => {
  // Inject formCode for the shared handler — same shape as 1702.
  req.params.formCode = '1701';
  return ctrl.update1702Manual(req, res, next);
});
router.post('/forms/1702/:year/mark-filed', ctrl.mark1702Filed);
router.post('/forms/1701/:year/mark-filed', (req, res, next) => {
  req.params.formCode = '1701';
  return ctrl.mark1702Filed(req, res, next);
});

// J1 catch-all CSV export (lower priority — must come AFTER J2/J3/J4/J5/J6/J7 specific routes).
router.get('/forms/:formCode/:year/:period/export.csv', ctrl.exportVatReturnCsv);

router.get('/forms/:id', ctrl.getFiling);
router.post('/forms/draft', ctrl.createOrUpdateDraft);
router.post('/forms/:id/mark-reviewed', ctrl.markReviewed);
router.post('/forms/:id/mark-filed', ctrl.markFiled);
router.post('/forms/:id/mark-confirmed', ctrl.markConfirmed);

module.exports = router;
