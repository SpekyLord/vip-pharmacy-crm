const express = require('express');
const router = express.Router();
const { protect } = require('../../middleware/auth');
const { erpSubAccessCheck } = require('../middleware/erpAccessCheck');
const c = require('../controllers/consignmentController');

router.post('/dr', protect, c.createDR);
router.get('/dr', protect, c.getDRsByBdm);
router.get('/pool', protect, c.getConsignmentPool);
router.post('/convert', protect, c.convertConsignment);

// Phase 31 — President remove of a DR/Consignment row (only when zero conversions).
// Blocks if qty_consumed > 0 — caller must reverse converting CSIs first.
router.post('/dr/:id/president-reverse', protect, erpSubAccessCheck('accounting', 'reverse_posted'), c.presidentReverseDr);

module.exports = router;
