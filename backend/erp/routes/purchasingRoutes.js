/**
 * Purchasing & AP Routes — Phase 12.6, updated Phase 16 (sub-module access)
 *
 * Static routes first (AP endpoints), then invoice routes, then PO routes.
 * Write operations gated by erpSubAccessCheck (replaces roleCheck).
 */
const express = require('express');
const router = express.Router();
const { erpSubAccessCheck } = require('../middleware/erpAccessCheck');
const c = require('../controllers/purchasingController');

// ═══ AP Ledger & Reports (read-only, module-level VIEW sufficient) ═══
router.get('/ap/ledger', c.apLedger);
router.get('/ap/aging', c.apAging);
router.get('/ap/consolidated', c.apConsolidated);
router.get('/ap/grni', c.grni);
router.get('/ap/payments', c.paymentHistory);

// ═══ Supplier Invoices ═══
router.get('/invoices', c.getInvoices);
router.post('/invoices', erpSubAccessCheck('purchasing', 'supplier_invoice'), c.createInvoice);
router.get('/invoices/:id', c.getInvoiceById);
router.put('/invoices/:id', erpSubAccessCheck('purchasing', 'supplier_invoice'), c.updateInvoice);
router.post('/invoices/:id/validate', erpSubAccessCheck('purchasing', 'supplier_invoice'), c.validateInvoice);
router.post('/invoices/:id/post', erpSubAccessCheck('purchasing', 'supplier_invoice'), c.postInvoice);
router.post('/invoices/:id/pay', erpSubAccessCheck('purchasing', 'ap_payment'), c.recordPayment);

// ═══ Purchase Orders ═══
router.get('/orders/export', c.exportPOs);
router.get('/orders', c.getPOs);
router.post('/orders', erpSubAccessCheck('purchasing', 'po_create'), c.createPO);
router.get('/orders/:id', c.getPOById);
router.put('/orders/:id', erpSubAccessCheck('purchasing', 'po_create'), c.updatePO);
router.post('/orders/:id/approve', erpSubAccessCheck('purchasing', 'po_approve'), c.approvePO);
router.post('/orders/:id/cancel', erpSubAccessCheck('purchasing', 'po_approve'), c.cancelPO);
router.post('/orders/:id/receive', erpSubAccessCheck('purchasing', 'po_create'), c.receivePO);

module.exports = router;
