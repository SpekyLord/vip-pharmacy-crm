/**
 * Hospital PO routes — Phase CSI-X1 (April 2026)
 *
 * Captures hospital purchase orders + tracks unserved backlog per warehouse/
 * hospital. Mounted at /api/erp/hospital-pos.
 *
 * Auth: protected + tenant-filtered upstream. Module access checked at the
 * mount point in routes/index.js (erpAccessCheck('sales')).
 *
 * Per-line ownership enforcement happens inside controllers via
 * widenFilterForProxy + resolveOwnerForWrite (Phase G4.5a).
 */

const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/hospitalPoController');

// SUMMARY — backlog tiles (must come before /:id to avoid route shadowing)
router.get('/summary/backlog', ctrl.getBacklogSummary);

// PARSE — Phase X2 paste-text parser (regex + LLM fallback). Must come
// before /:id so the literal "parse" doesn't get treated as an ObjectId.
router.post('/parse', ctrl.parsePoText);

// LIST + CRUD
router.get('/', ctrl.listHospitalPos);
router.get('/:id', ctrl.getHospitalPoById);
router.post('/', ctrl.createHospitalPo);
router.post('/:id/cancel', ctrl.cancelHospitalPo);
router.post('/lines/:lineId/cancel', ctrl.cancelHospitalPoLine);

// MAINTENANCE — expire stale POs (admin button; future cron)
router.post('/maintenance/expire-stale', ctrl.expireStalePos);

module.exports = router;
