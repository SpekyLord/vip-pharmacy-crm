/**
 * Warehouse Routes — Phase 17
 *
 * /erp/warehouse
 * Mounted with erpAccessCheck('inventory') in index.js
 */
const express = require('express');
const router = express.Router();
const { erpSubAccessCheck } = require('../middleware/erpAccessCheck');
const c = require('../controllers/warehouseController');

// Self-service: user's accessible warehouses (for picker)
router.get('/my', c.getMyWarehouses);

// List all warehouses for entity
router.get('/', c.getWarehouses);

// Warehouses for a specific entity (for IC transfer target selection)
router.get('/by-entity/:entityId', c.getWarehousesByEntity);

// Single warehouse with stock summary
router.get('/:id', c.getWarehouse);

// Phase 3c — Warehouse create/update gated as Tier 2 lookup-only danger key.
// Adding/renaming a warehouse impacts stock segregation across the entity.
router.post('/', erpSubAccessCheck('inventory', 'warehouse_manage'), c.createWarehouse);
router.put('/:id', erpSubAccessCheck('inventory', 'warehouse_manage'), c.updateWarehouse);

module.exports = router;
