/**
 * Purchasing & AP Routes — Phase 12.6
 *
 * Static routes first (AP endpoints), then invoice routes, then PO routes.
 * Write operations gated by roleCheck('admin', 'finance', 'president').
 */
const express = require('express');
const router = express.Router();
const { roleCheck } = require('../../middleware/roleCheck');
const c = require('../controllers/purchasingController');

// ═══ AP Ledger & Reports (static routes first) ═══
router.get('/ap/ledger', c.apLedger);
router.get('/ap/aging', c.apAging);
router.get('/ap/consolidated', c.apConsolidated);
router.get('/ap/grni', c.grni);
router.get('/ap/payments', c.paymentHistory);

// ═══ Supplier Invoices (static before :id) ═══
router.get('/invoices', c.getInvoices);
router.post('/invoices', roleCheck('admin', 'finance', 'president'), c.createInvoice);
router.get('/invoices/:id', c.getInvoiceById);
router.put('/invoices/:id', roleCheck('admin', 'finance', 'president'), c.updateInvoice);
router.post('/invoices/:id/validate', roleCheck('admin', 'finance', 'president'), c.validateInvoice);
router.post('/invoices/:id/post', roleCheck('admin', 'finance', 'president'), c.postInvoice);
router.post('/invoices/:id/pay', roleCheck('admin', 'finance', 'president'), c.recordPayment);

// ═══ Purchase Orders ═══
router.get('/orders', c.getPOs);
router.post('/orders', roleCheck('admin', 'finance', 'president'), c.createPO);
router.get('/orders/:id', c.getPOById);
router.put('/orders/:id', roleCheck('admin', 'finance', 'president'), c.updatePO);
router.post('/orders/:id/approve', roleCheck('admin', 'finance', 'president'), c.approvePO);
router.post('/orders/:id/cancel', roleCheck('admin', 'finance', 'president'), c.cancelPO);
router.post('/orders/:id/receive', roleCheck('admin', 'finance', 'president'), c.receivePO);

module.exports = router;
