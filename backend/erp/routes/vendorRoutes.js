/**
 * Vendor Routes — Phase 12, updated Phase 16 (sub-module access)
 *
 * Vendor CRUD. Write operations gated by erpSubAccessCheck('purchasing', 'vendor_manage').
 */
const express = require('express');
const router = express.Router();
const { protect } = require('../../middleware/auth');
const { erpSubAccessCheck } = require('../middleware/erpAccessCheck');
const c = require('../controllers/vendorController');

router.get('/', protect, c.getAll);
router.get('/search', protect, c.search);
router.get('/:id', protect, c.getById);
router.post('/', protect, erpSubAccessCheck('purchasing', 'vendor_manage'), c.create);
router.put('/:id', protect, erpSubAccessCheck('purchasing', 'vendor_manage'), c.update);
router.post('/:id/add-alias', protect, erpSubAccessCheck('purchasing', 'vendor_manage'), c.addAlias);
router.patch('/:id/deactivate', protect, erpSubAccessCheck('purchasing', 'vendor_manage'), c.deactivate);

module.exports = router;
