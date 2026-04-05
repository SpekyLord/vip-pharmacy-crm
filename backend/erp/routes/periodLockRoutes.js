const express = require('express');
const router = express.Router();
const { roleCheck } = require('../../middleware/roleCheck');
const { getLocks, toggleLock, exportLocks } = require('../controllers/periodLockController');

router.get('/', getLocks);
router.get('/export', exportLocks);
router.post('/toggle', roleCheck('admin', 'finance', 'president'), toggleLock);

module.exports = router;
