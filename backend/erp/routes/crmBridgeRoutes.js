const express = require('express');
const { getArSummary, getStockCheck } = require('../controllers/crmBridgeController');

const router = express.Router();

// Phase 9.2: CRM → ERP data flow endpoints
router.get('/ar-summary', getArSummary);
router.get('/stock-check', getStockCheck);

module.exports = router;
