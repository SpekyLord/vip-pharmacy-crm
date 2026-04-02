const express = require('express');
const router = express.Router();
const { protect } = require('../../middleware/auth');
const { classify, override, categories } = require('../controllers/classificationController');

router.post('/', protect, classify);
router.post('/override', protect, override);
router.get('/categories', protect, categories);

module.exports = router;
