const express = require('express');

const { processDocument } = require('../controllers/ocrController');
const { protect } = require('../../middleware/auth');
const { uploadSingle } = require('../../middleware/upload');

const router = express.Router();

router.use(protect);

router.post('/process', uploadSingle('photo'), processDocument);

module.exports = router;
