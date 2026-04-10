/**
 * Print Routes — Phase 18 + Phase 19
 * Shared infrastructure (no module gate — anyone who can access ERP can print)
 */
const express = require('express');
const router = express.Router();
const printCtrl = require('../controllers/printController');

// Phase 18: Sales receipt/invoice
router.get('/receipt/:id', printCtrl.getReceiptHtml);

// Phase 19: Petty cash remittance/replenishment forms
router.get('/petty-cash/:id', printCtrl.getPettyCashFormHtml);

// Phase 25: GRN + Credit Note printable documents
router.get('/grn/:id', printCtrl.getGrnHtml);
router.get('/credit-note/:id', printCtrl.getCreditNoteHtml);

// Purchase Order printable document
router.get('/purchase-order/:id', printCtrl.getPurchaseOrderHtml);

module.exports = router;
