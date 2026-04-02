const express = require('express');
const router = express.Router();
const { protect } = require('../../middleware/auth');
const c = require('../controllers/consignmentController');

router.post('/dr', protect, c.createDR);
router.get('/dr', protect, c.getDRsByBdm);
router.get('/pool', protect, c.getConsignmentPool);
router.post('/convert', protect, c.convertConsignment);

module.exports = router;
