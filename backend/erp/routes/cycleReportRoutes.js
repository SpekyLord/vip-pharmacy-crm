/**
 * Cycle Report Routes — Phase 15.3
 */
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/cycleReportController');

router.get('/', ctrl.list);
router.post('/generate', ctrl.generate);
router.patch('/:id/review', ctrl.review);
router.patch('/:id/confirm', ctrl.confirm);
router.patch('/:id/credit', ctrl.credit);

module.exports = router;
