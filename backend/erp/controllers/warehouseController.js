/**
 * Warehouse Controller — Phase 17
 *
 * CRUD for warehouses + access-filtered listing for picker.
 */
const Warehouse = require('../models/Warehouse');
const InventoryLedger = require('../models/InventoryLedger');
const { catchAsync } = require('../../middleware/errorHandler');

/**
 * GET /warehouse — list warehouses for entity
 * President/admin see all. BDMs see only warehouses they manage or are assigned to.
 */
const getWarehouses = catchAsync(async (req, res) => {
  const filter = { is_active: true, entity_id: req.entityId };

  // Only president can view another entity's warehouses
  if (req.query.entity_id && req.isPresident) {
    filter.entity_id = req.query.entity_id;
  }

  const warehouses = await Warehouse.find(filter)
    .populate('manager_id', 'name email')
    .populate('assigned_users', 'name email')
    .populate('draws_from', 'warehouse_code warehouse_name')
    .sort({ warehouse_type: 1, warehouse_code: 1 })
    .lean();

  res.json({ success: true, data: warehouses });
});

/**
 * GET /warehouse/my — warehouses accessible by current user
 * Used by WarehousePicker component.
 * President/admin get all. Others get warehouses where manager or assigned.
 */
const getMyWarehouses = catchAsync(async (req, res) => {
  const { role, _id: userId } = req.user;
  // Use req.entityId (set by tenantFilter, respects X-Entity-Id header for multi-entity users)
  const workingEntityId = req.entityId;

  let filter = { is_active: true };

  if (role === 'president') {
    // President sees all warehouses (optionally filter by entity via query or working entity)
    if (req.query.entity_id) filter.entity_id = req.query.entity_id;
    else if (workingEntityId) filter.entity_id = workingEntityId;
  } else if (role === 'admin' || role === 'finance') {
    // Admin/Finance see warehouses within their working entity
    if (workingEntityId) filter.entity_id = workingEntityId;
  } else {
    // BDM/employee: warehouses in their working entity if ERP-enabled, else only managed/assigned
    if (req.user.erp_access?.enabled && workingEntityId) {
      filter.entity_id = workingEntityId;
    } else {
      filter.$or = [
        { manager_id: userId },
        { assigned_users: userId },
      ];
      if (workingEntityId) filter.entity_id = workingEntityId;
    }
  }

  const warehouses = await Warehouse.find(filter)
    .select('warehouse_code warehouse_name warehouse_type entity_id is_default_receiving can_receive_grn can_transfer_out stock_type manager_id')
    .sort({ warehouse_type: 1, warehouse_code: 1 })
    .lean();

  // Mark which one is the user's "primary" (they are manager)
  const result = warehouses.map(w => ({
    ...w,
    is_primary: w.manager_id?.toString() === userId.toString(),
  }));

  res.json({ success: true, data: result });
});

/**
 * GET /warehouse/:id — single warehouse with stock summary
 */
const getWarehouse = catchAsync(async (req, res) => {
  const warehouse = await Warehouse.findById(req.params.id)
    .populate('manager_id', 'name email')
    .populate('assigned_users', 'name email')
    .populate('entity_id', 'entity_name short_name')
    .populate('draws_from', 'warehouse_code warehouse_name')
    .lean();

  if (!warehouse) {
    return res.status(404).json({ success: false, message: 'Warehouse not found' });
  }

  // Stock summary: total products, total units, total value
  const stockSummary = await InventoryLedger.aggregate([
    { $match: { warehouse_id: warehouse._id } },
    { $group: { _id: '$product_id', total_in: { $sum: '$qty_in' }, total_out: { $sum: '$qty_out' } } },
    { $project: { balance: { $subtract: ['$total_in', '$total_out'] } } },
    { $match: { balance: { $gt: 0 } } },
    { $group: { _id: null, product_count: { $sum: 1 }, total_units: { $sum: '$balance' } } },
  ]);

  warehouse.stock_summary = stockSummary[0] || { product_count: 0, total_units: 0 };

  res.json({ success: true, data: warehouse });
});

/**
 * POST /warehouse — create warehouse
 */
const createWarehouse = catchAsync(async (req, res) => {
  const {
    warehouse_code, warehouse_name, warehouse_type, location,
    manager_id, assigned_users, territory_id, draws_from,
    is_default_receiving, can_receive_grn, can_transfer_out, stock_type,
  } = req.body;

  const entityId = req.body.entity_id || req.entityId;

  // Check duplicate code in entity
  const existing = await Warehouse.findOne({ entity_id: entityId, warehouse_code: warehouse_code?.toUpperCase() });
  if (existing) {
    return res.status(400).json({ success: false, message: `Warehouse code ${warehouse_code} already exists for this entity` });
  }

  const warehouse = await Warehouse.create({
    entity_id: entityId,
    warehouse_code,
    warehouse_name,
    warehouse_type: warehouse_type || 'TERRITORY',
    location,
    manager_id,
    assigned_users: assigned_users || [],
    territory_id,
    draws_from,
    is_default_receiving: is_default_receiving || false,
    can_receive_grn: can_receive_grn || false,
    can_transfer_out: can_transfer_out !== false,
    stock_type: stock_type || 'PHARMA',
    created_by: req.user._id,
  });

  res.status(201).json({ success: true, data: warehouse });
});

/**
 * PUT /warehouse/:id — update warehouse
 */
const updateWarehouse = catchAsync(async (req, res) => {
  const warehouse = await Warehouse.findById(req.params.id);
  if (!warehouse) {
    return res.status(404).json({ success: false, message: 'Warehouse not found' });
  }

  const allowed = [
    'warehouse_name', 'warehouse_type', 'location',
    'manager_id', 'assigned_users', 'territory_id', 'draws_from',
    'is_default_receiving', 'can_receive_grn', 'can_transfer_out',
    'stock_type', 'is_active',
  ];

  for (const key of allowed) {
    if (req.body[key] !== undefined) warehouse[key] = req.body[key];
  }

  await warehouse.save();

  const populated = await Warehouse.findById(warehouse._id)
    .populate('manager_id', 'name email')
    .populate('assigned_users', 'name email')
    .lean();

  res.json({ success: true, data: populated });
});

/**
 * GET /warehouse/by-entity/:entityId — warehouses for a specific entity (for IC transfers)
 * President/admin only.
 */
const getWarehousesByEntity = catchAsync(async (req, res) => {
  const warehouses = await Warehouse.find({
    entity_id: req.params.entityId,
    is_active: true,
  })
    .select('warehouse_code warehouse_name warehouse_type manager_id is_default_receiving can_receive_grn stock_type')
    .populate('manager_id', 'name')
    .sort({ warehouse_type: 1, warehouse_code: 1 })
    .lean();

  res.json({ success: true, data: warehouses });
});

module.exports = {
  getWarehouses,
  getMyWarehouses,
  getWarehouse,
  createWarehouse,
  updateWarehouse,
  getWarehousesByEntity,
};
