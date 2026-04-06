const express = require('express');
const router = express.Router();
const { roleCheck } = require('../../middleware/roleCheck');
const { listRuns, getStats } = require('../controllers/agentController');

const adminOnly = roleCheck('admin', 'finance', 'president');

router.get('/runs', adminOnly, listRuns);
router.get('/runs/stats', adminOnly, getStats);

module.exports = router;
