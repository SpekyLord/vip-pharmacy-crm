/**
 * President Reversal Console — routes
 *
 * Mounted at /api/erp/president/reversals.
 * - Read endpoints (registry/list/history/preview) gated by accounting.reversal_console
 * - Reverse endpoint gated by accounting.reverse_posted (mirrors per-module routes)
 * - protect + tenantFilter applied globally in erp/routes/index.js
 */
const express = require('express');
const router = express.Router();
const { erpSubAccessCheck } = require('../middleware/erpAccessCheck');
const c = require('../controllers/presidentReversalController');

router.get('/registry',                         erpSubAccessCheck('accounting', 'reversal_console'), c.getRegistry);
router.get('/reversible',                       erpSubAccessCheck('accounting', 'reversal_console'), c.getReversible);
router.get('/history',                          erpSubAccessCheck('accounting', 'reversal_console'), c.getHistory);
router.get('/preview/:doc_type/:doc_id',        erpSubAccessCheck('accounting', 'reversal_console'), c.getPreview);
// Phase 31 — rich per-module detail (shared with Approval Hub). Lazy-fetched by the
// expandable row on the Reversal Console page. Read-only; does not mutate state.
router.get('/detail/:doc_type/:doc_id',         erpSubAccessCheck('accounting', 'reversal_console'), c.getDetail);
router.post('/reverse',                         erpSubAccessCheck('accounting', 'reverse_posted'),    c.postReverse);

module.exports = router;
