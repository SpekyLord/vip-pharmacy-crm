/**
 * Hospital Contract Price routes — Phase CSI-X1 (April 2026)
 *
 * Master-data CRUD for per-hospital BDM-negotiated contract pricing.
 * Mounted at /api/erp/hospital-contract-prices.
 *
 * Auth: protected + tenant-filtered upstream (mounted in routes/index.js).
 * Resolve endpoints accessible to any authenticated ERP user (used by
 * SalesEntry frontend autocomplete). Admin/finance-only mutations.
 */

const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/hospitalContractPriceController');

// READ — open to any tenant-scoped ERP user (BDMs need to see pricing they negotiated)
router.get('/', ctrl.listContractPrices);
router.get('/resolve', ctrl.resolvePrice);
router.post('/resolve-bulk', ctrl.resolvePricesBulk);
router.get('/:id', ctrl.getContractPriceById);

// WRITE — gateApproval('PRICE_LIST') inside controller blocks unauthorized
// posters by routing them through Approval Hub. No additional middleware
// gate; lookup-driven authorization is the right layer per Rule #3.
router.post('/', ctrl.createContractPrice);
router.put('/:id', ctrl.updateContractPrice);
router.post('/:id/cancel', ctrl.cancelContractPrice);

module.exports = router;
