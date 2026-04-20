/**
 * copilotRoutes.js — Phase G7.2
 *
 * Mounted at /api/erp/copilot in erp/routes/index.js. Parent router runs
 * `protect` + `tenantFilter` so req.user is guaranteed. req.entityId may still
 * be null for authenticated users without ERP entity context.
 *
 * Role gating:
 *   - /chat + /execute: filtered by lookup row PRESIDENT_COPILOT.allowed_roles
 *     inside copilotService (one source of truth, lookup-driven). No middleware
 *     gate here so president/CEO can always call.
 *   - /usage: privileged-only check inside the controller.
 *   - /status: open to any authenticated user — returns widget_enabled=false
 *     for users without access (so the widget hides itself cleanly).
 */
const express = require('express');
const router = express.Router();
const ctl = require('../controllers/copilotController');

router.get('/status', ctl.status);
router.get('/usage', ctl.usage);
router.post('/chat', ctl.chat);
router.post('/execute', ctl.execute);

module.exports = router;
