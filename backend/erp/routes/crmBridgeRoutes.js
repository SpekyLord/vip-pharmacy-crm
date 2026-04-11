const express = require('express');
const { getArSummary, getStockCheck, getHospitals, getHospitalHeat } = require('../controllers/crmBridgeController');

const router = express.Router();

// Phase 9.2: CRM → ERP data flow endpoints
router.get('/ar-summary', getArSummary);
router.get('/stock-check', getStockCheck);

// Gap 9: Hospital data for CRM consumption
router.get('/hospitals', getHospitals);
router.get('/hospital-heat', getHospitalHeat);

module.exports = router;
