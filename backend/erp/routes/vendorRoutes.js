/**
 * Vendor Routes — Phase 12, updated Phase 16 (sub-module access)
 *
 * Vendor CRUD. Write operations gated by erpSubAccessCheck('purchasing', 'vendor_manage').
 */
const express = require('express');
const router = express.Router();
const { erpSubAccessCheck } = require('../middleware/erpAccessCheck');
const c = require('../controllers/vendorController');

// Note: protect + tenantFilter already applied at ERP router index level
router.get('/', c.getAll);
router.get('/search', c.search);
router.get('/:id', c.getById);
router.post('/', erpSubAccessCheck('purchasing', 'vendor_manage'), c.create);
router.put('/:id', erpSubAccessCheck('purchasing', 'vendor_manage'), c.update);
router.post('/:id/add-alias', erpSubAccessCheck('purchasing', 'vendor_manage'), c.addAlias);
router.patch('/:id/deactivate', erpSubAccessCheck('purchasing', 'vendor_manage'), c.deactivate);

module.exports = router;
