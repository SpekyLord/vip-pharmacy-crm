const express = require('express');
const router = express.Router();
const { roleCheck } = require('../../middleware/roleCheck');
const { listRuns, getStats, runAgent, getConfig, updateConfig } = require('../controllers/agentController');

const adminOnly = roleCheck('admin', 'finance', 'president');
const presidentOnly = roleCheck('president', 'admin');

router.get('/runs', adminOnly, listRuns);
router.get('/runs/stats', adminOnly, getStats);
router.post('/run/:agentKey', presidentOnly, runAgent);
router.get('/config', adminOnly, getConfig);
router.put('/config/:agentKey', presidentOnly, updateConfig);

module.exports = router;
