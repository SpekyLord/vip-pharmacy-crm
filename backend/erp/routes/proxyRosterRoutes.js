/**
 * Proxy Roster routes — Phase G4.5ff (May 5, 2026).
 *
 * Mounted at /api/erp/proxy-roster (mounted in routes/index.js BEFORE the
 * /people router so it stays outside `erpAccessCheck('people')`).
 *
 * The endpoint itself enforces authorization via canProxyEntry() inside the
 * controller — no module-level access check is needed because the gate is
 * per-(module × subKey) and lookup-driven (Rule #3).
 */

const express = require('express');
const { getProxyRoster } = require('../controllers/proxyRosterController');

// protect + tenantFilter run at the parent ERP router (routes/index.js).
// Authorization is per-(module × subKey) inside the controller.
const router = express.Router();

router.get('/:moduleLookup', getProxyRoster);

module.exports = router;
