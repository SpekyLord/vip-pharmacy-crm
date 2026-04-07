const express = require('express');
const router = express.Router();
const c = require('../controllers/icSettlementController');
const { roleCheck } = require('../../middleware/roleCheck');

// Static routes first
router.get('/open-transfers', c.getOpenIcTransfersEndpoint);
router.get('/summary', c.getIcArSummaryEndpoint);

// CRUD
router.get('/', c.getSettlements);
router.post('/', roleCheck('president', 'admin', 'finance'), c.createSettlement);
router.get('/:id', c.getSettlementById);
router.post('/:id/post', roleCheck('president', 'admin', 'finance'), c.postSettlement);

module.exports = router;
