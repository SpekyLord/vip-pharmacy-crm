const express = require('express');
const tenantFilter = require('../middleware/tenantFilter');

const router = express.Router();

// ═══ Phase 1 — OCR (no tenant filter needed for OCR test) ═══
router.use('/ocr', require('./ocrRoutes'));

// ═══ Phase 2 — ERP Data Routes (tenant-filtered) ═══
router.use(tenantFilter);
router.use('/settings', require('./settingsRoutes'));
router.use('/government-rates', require('./governmentRatesRoutes'));
router.use('/hospitals', require('./hospitalRoutes'));
router.use('/products', require('./productMasterRoutes'));
router.use('/vendors', require('./vendorRoutes'));
router.use('/lookups', require('./lookupRoutes'));
router.use('/budget-allocations', require('./budgetAllocationRoutes'));
router.use('/classify', require('./classificationRoutes'));

module.exports = router;
