const express = require('express');
const { roleCheck } = require('../../middleware/roleCheck');
const ic = require('../controllers/interCompanyController');

const router = express.Router();

// ═══ Static routes MUST come before /:id parameterized routes ═══

// Entity list (all authenticated users)
router.get('/entities', ic.getEntities);

// BDMs per entity (for source/target BDM dropdowns)
router.get('/bdms', ic.getBdmsByEntity);

// Transfer pricing — president/admin only
router.get('/prices/list', roleCheck('president', 'admin', 'finance'), ic.getTransferPrices);
router.get('/prices/products', roleCheck('president', 'admin', 'finance'), ic.getTransferPriceProducts);
router.put('/prices', roleCheck('president', 'admin'), ic.setTransferPrice);
router.put('/prices/bulk', roleCheck('president', 'admin'), ic.bulkSetTransferPrices);

// Internal Stock Reassignment (same entity, GRN-like approval)
router.post('/reassign', roleCheck('president', 'admin'), ic.createReassignment);
router.get('/reassign', ic.getReassignments);
router.post('/reassign/:id/approve', roleCheck('admin', 'finance'), ic.approveReassignment);

// ═══ Transfer CRUD — parameterized routes last ═══
router.post('/', roleCheck('president', 'admin'), ic.createTransfer);
router.get('/', ic.getTransfers);
router.get('/:id', ic.getTransferById);
router.patch('/:id/approve', roleCheck('president', 'admin'), ic.approveTransfer);
router.patch('/:id/ship', roleCheck('president', 'admin'), ic.shipTransfer);
router.patch('/:id/receive', ic.receiveTransfer); // Target BDM or admin
router.patch('/:id/post', roleCheck('president', 'admin'), ic.postTransfer);
router.patch('/:id/cancel', roleCheck('president', 'admin'), ic.cancelTransfer);

module.exports = router;
