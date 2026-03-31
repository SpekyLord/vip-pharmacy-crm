const express = require('express');

const router = express.Router();

router.use('/ocr', require('./ocrRoutes'));

module.exports = router;
