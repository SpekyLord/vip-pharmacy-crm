/**
 * Rx Correlation Routes — Gap 9
 *
 * Mounted at /api/erp/rx-correlation (with erpAccessCheck('reports'))
 */
const express = require('express');
const ctrl = require('../controllers/rxCorrelationController');

const router = express.Router();

// ═══ Analytics ═══
router.get('/summary/:period', ctrl.getCorrelationSummary);
router.get('/partner-detail/:period', ctrl.getPartnerDetail);
router.get('/hospital-stakeholders/:period', ctrl.getHospitalStakeholderView);
router.get('/territory/:territoryId/:period', ctrl.getTerritoryDetail);
router.get('/time-series', ctrl.getTimeSeries);
router.get('/program-effectiveness/:period', ctrl.getProgramEffectiveness);
router.get('/support-effectiveness/:period', ctrl.getSupportTypeEffectiveness);

// ═══ Product Mapping CRUD ═══
router.get('/product-mappings', ctrl.getProductMappings);
router.post('/product-mappings', ctrl.createProductMapping);
router.delete('/product-mappings/:id', ctrl.deleteProductMapping);
router.post('/product-mappings/auto-map', ctrl.autoMapProducts);
router.get('/unmapped-products', ctrl.getUnmappedProducts);

module.exports = router;
