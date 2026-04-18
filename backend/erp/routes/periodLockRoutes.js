const express = require('express');
const router = express.Router();
const { erpSubAccessCheck } = require('../middleware/erpAccessCheck');
const { getLocks, toggleLock, exportLocks } = require('../controllers/periodLockController');

router.get('/', getLocks);
router.get('/export', exportLocks);
// Phase 3c — replaces roleCheck('admin','finance','president'). Force-unlocking a closed
// period exposes posted journals to mutation; gate is danger-baseline (Access Template tick required).
router.post('/toggle', erpSubAccessCheck('accounting', 'period_force_unlock'), toggleLock);

module.exports = router;
