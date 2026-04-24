/**
 * Inter-Company Transfer Routes
 * Sub-permission gated: requires inventory.transfers
 * (access-template driven — not visible to contractors by default)
 */
const express = require('express');
const { roleCheck } = require('../../middleware/roleCheck');
const { erpSubAccessCheck } = require('../middleware/erpAccessCheck');
const ic = require('../controllers/interCompanyController');

const router = express.Router();
const gate = erpSubAccessCheck('inventory', 'transfers');

// ═══ Static routes MUST come before /:id parameterized routes ═══

// Entity list (all authenticated users with transfers sub-permission)
router.get('/entities', gate, ic.getEntities);

// BDMs per entity (for source/target BDM dropdowns)
router.get('/bdms', gate, ic.getBdmsByEntity);

// Transfer pricing — list/products are read-only (admin/finance/president keep role gate).
// Write paths swapped to danger sub-perm (Phase 3c) — transfer-price changes shift cross-entity
// P&L allocation and inventory cost basis; require explicit Access Template grant.
router.get('/prices/list', gate, roleCheck('president', 'admin', 'finance'), ic.getTransferPrices);
router.get('/prices/products', gate, roleCheck('president', 'admin', 'finance'), ic.getTransferPriceProducts);
router.put('/prices', gate, erpSubAccessCheck('inventory', 'transfer_price_set'), ic.setTransferPrice);
router.put('/prices/bulk', gate, erpSubAccessCheck('inventory', 'transfer_price_set'), ic.bulkSetTransferPrices);

// Internal Stock Reassignment — sub-permission gated only (no roleCheck).
// Any user with inventory.transfers sub-permission can create + approve.
// Approve = TRANSFER_OUT from source; receiving user enters GRN to complete.
router.post('/reassign', gate, ic.createReassignment);
router.get('/reassign', gate, ic.getReassignments);
router.post('/reassign/:id/approve', gate, ic.approveReassignment);

// ═══ Transfer CRUD — parameterized routes last ═══
router.post('/', gate, roleCheck('president', 'admin', 'staff'), ic.createTransfer);
router.get('/', gate, ic.getTransfers);
router.get('/:id', gate, ic.getTransferById);
router.patch('/:id/approve', gate, roleCheck('president', 'admin'), ic.approveTransfer);
router.patch('/:id/ship', gate, roleCheck('president', 'admin', 'staff'), ic.shipTransfer);
router.patch('/:id/receive', gate, ic.receiveTransfer); // Target BDM or admin
router.patch('/:id/post', gate, roleCheck('president', 'admin'), ic.postTransfer);
router.patch('/:id/cancel', gate, roleCheck('president', 'admin', 'staff'), ic.cancelTransfer);

// Phase 31 — President SAP Storno reversal of an SHIPPED/RECEIVED/POSTED IC Transfer.
// Dual-side reversal (source + target). DRAFT/APPROVED/CANCELLED hard-deleted.
// Blocks if any target-entity SalesLine consumed transferred stock.
router.post('/:id/president-reverse', erpSubAccessCheck('accounting', 'reverse_posted'), ic.presidentReverseIcTransfer);

module.exports = router;
