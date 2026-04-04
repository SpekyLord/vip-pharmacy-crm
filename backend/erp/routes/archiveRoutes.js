/**
 * Archive Routes — Phase 15.8
 */
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/archiveController');

router.get('/batches', ctrl.listBatches);
router.get('/batches/:batchId', ctrl.getBatchDetail);
router.post('/trigger', ctrl.triggerArchive);
router.post('/batches/:batchId/restore', ctrl.restoreBatch);

module.exports = router;
