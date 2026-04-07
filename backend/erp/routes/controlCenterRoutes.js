const express = require('express');
const router = express.Router();
const { roleCheck } = require('../../middleware/roleCheck');
const { getHealth } = require('../controllers/controlCenterController');

router.get('/health', roleCheck('admin', 'finance', 'president'), getHealth);

module.exports = router;
