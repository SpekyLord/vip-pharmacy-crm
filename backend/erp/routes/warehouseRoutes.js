/**
 * Warehouse Routes — Phase 17
 *
 * /erp/warehouse
 * Mounted with erpAccessCheck('inventory') in index.js
 */
const express = require('express');
const router = express.Router();
const { roleCheck } = require('../../middleware/roleCheck');
const c = require('../controllers/warehouseController');

// Self-service: user's accessible warehouses (for picker)
router.get('/my', c.getMyWarehouses);

// List all warehouses for entity
router.get('/', c.getWarehouses);

// Warehouses for a specific entity (for IC transfer target selection)
router.get('/by-entity/:entityId', c.getWarehousesByEntity);

// Single warehouse with stock summary
router.get('/:id', c.getWarehouse);

// Admin/President only: create/update
router.post('/', roleCheck('admin', 'president'), c.createWarehouse);
router.put('/:id', roleCheck('admin', 'president'), c.updateWarehouse);

module.exports = router;
