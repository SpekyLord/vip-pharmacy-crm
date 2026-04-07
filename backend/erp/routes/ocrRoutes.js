const express = require('express');

const { processDocument, getSupportedTypes } = require('../controllers/ocrController');
const { protect } = require('../../middleware/auth');
const { uploadSingle } = require('../../middleware/upload');

const router = express.Router();

router.use(protect);

router.get('/types', getSupportedTypes);
router.post('/process', uploadSingle('photo'), processDocument);

module.exports = router;
