/**
 * Executive Cockpit routes — Phase EC-1 (Apr 2026).
 *
 * Mounted at /api/erp/cockpit by routes/index.js (after protect + tenantFilter).
 * Page gate: VIEW_COCKPIT (lookup-driven, default admin/finance/president).
 * Tile-scope gates (VIEW_FINANCIAL / VIEW_OPERATIONAL) applied inside the
 * controller — see executiveCockpitAccess.js for the model.
 */
const express = require('express');
const router = express.Router();
const { requireCockpitRole } = require('../../utils/executiveCockpitAccess');
const { getCockpitData } = require('../controllers/cockpitController');

router.get('/', requireCockpitRole('VIEW_COCKPIT'), getCockpitData);

module.exports = router;
