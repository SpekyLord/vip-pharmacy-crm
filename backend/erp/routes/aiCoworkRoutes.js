/**
 * aiCoworkRoutes.js — Phase G6.10
 *
 * Mounted at /api/erp/ai-cowork in erp/routes/index.js.
 * Parent router already runs `protect` + `tenantFilter` so req.user + req.entityId
 * are guaranteed populated.
 */
const express = require('express');
const router = express.Router();
const ctl = require('../controllers/aiCoworkController');

router.get('/features', ctl.listFeatures);
router.get('/usage', ctl.getUsage);
router.post('/:code/invoke', ctl.invoke);

module.exports = router;
