const ProductMaster = require('../models/ProductMaster');
const Warehouse = require('../models/Warehouse');
const InventoryLedger = require('../models/InventoryLedger');
const ErpAuditLog = require('../models/ErpAuditLog');
const { catchAsync } = require('../../middleware/errorHandler');

const getAll = catchAsync(async (req, res) => {
  const filter = {};
  if (req.tenantFilter?.entity_id) filter.entity_id = req.tenantFilter.entity_id;
  if (req.query.entity_id) filter.entity_id = req.query.entity_id;
  if (req.query.is_active !== undefined) filter.is_active = req.query.is_active === 'true';
  if (req.query.q) {
    filter.$or = [
      { brand_name: { $regex: req.query.q, $options: 'i' } },
      { generic_name: { $regex: req.query.q, $options: 'i' } }
    ];
  }

  // BDMs only see products that have inventory in their assigned warehouse
  const bdmRoles = ['employee'];
  if (bdmRoles.includes(req.user?.role)) {
    const myWarehouses = await Warehouse.find({
      $or: [{ manager_id: req.user._id }, { assigned_users: req.user._id }]
    }).select('_id').lean();
    const whIds = myWarehouses.map(w => w._id);

    if (whIds.length) {
      const productIds = await InventoryLedger.distinct('product_id', { warehouse_id: { $in: whIds } });
      filter._id = { $in: productIds };
    } else {
      return res.json({ success: true, data: [], pagination: { page: 1, limit: 50, total: 0, pages: 0 } });
    }
  }

  // Optional warehouse filter (admin can filter by warehouse too)
  if (req.query.warehouse_id) {
    const productIds = await InventoryLedger.distinct('product_id', { warehouse_id: req.query.warehouse_id });
    filter._id = filter._id ? { $in: productIds.filter(id => filter._id.$in.some(fid => fid.toString() === id.toString())) } : { $in: productIds };
  }

  const page = parseInt(req.query.page) || 1;
  const rawLimit = parseInt(req.query.limit);
  const limit = rawLimit > 0 ? rawLimit : (rawLimit === 0 ? 0 : 50);
  const skip = limit > 0 ? (page - 1) * limit : 0;

  const query = ProductMaster.find(filter).sort({ brand_name: 1 });
  if (limit > 0) query.skip(skip).limit(limit);

  const [products, total] = await Promise.all([
    query.lean(),
    ProductMaster.countDocuments(filter)
  ]);

  res.json({
    success: true,
    data: products,
    pagination: { page, limit, total, pages: limit > 0 ? Math.ceil(total / limit) : 1 }
  });
});

const getById = catchAsync(async (req, res) => {
  const product = await ProductMaster.findOne({ _id: req.params.id, entity_id: req.entityId }).lean();
  if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
  res.json({ success: true, data: product });
});

const create = catchAsync(async (req, res) => {
  req.body.entity_id = req.entityId;
  req.body.added_by = req.user._id;
  const product = await ProductMaster.create(req.body);
  res.status(201).json({ success: true, data: product });
});

const update = catchAsync(async (req, res) => {
  const product = await ProductMaster.findOneAndUpdate(
    { _id: req.params.id, entity_id: req.entityId },
    { $set: req.body },
    { new: true, runValidators: true }
  );
  if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
  res.json({ success: true, data: product });
});

const deactivate = catchAsync(async (req, res) => {
  const product = await ProductMaster.findOneAndUpdate(
    { _id: req.params.id, entity_id: req.entityId },
    { $set: { is_active: false } },
    { new: true }
  );
  if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
  res.json({ success: true, message: 'Product deactivated', data: product });
});

/**
 * PATCH /:id/reorder-qty — Update SAP-level reorder fields (Finance/Admin only)
 */
const updateReorderQty = catchAsync(async (req, res) => {
  const { reorder_min_qty, reorder_qty, safety_stock_qty, lead_time_days } = req.body;

  const product = await ProductMaster.findOne({ _id: req.params.id, entity_id: req.entityId });
  if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

  const changes = {};
  if (reorder_min_qty !== undefined && reorder_min_qty !== product.reorder_min_qty) {
    changes.reorder_min_qty = { old: product.reorder_min_qty, new: reorder_min_qty };
    product.reorder_min_qty = reorder_min_qty;
  }
  if (reorder_qty !== undefined && reorder_qty !== product.reorder_qty) {
    changes.reorder_qty = { old: product.reorder_qty, new: reorder_qty };
    product.reorder_qty = reorder_qty;
  }
  if (safety_stock_qty !== undefined && safety_stock_qty !== product.safety_stock_qty) {
    changes.safety_stock_qty = { old: product.safety_stock_qty, new: safety_stock_qty };
    product.safety_stock_qty = safety_stock_qty;
  }
  if (lead_time_days !== undefined && lead_time_days !== product.lead_time_days) {
    changes.lead_time_days = { old: product.lead_time_days, new: lead_time_days };
    product.lead_time_days = lead_time_days;
  }

  if (Object.keys(changes).length === 0) {
    return res.json({ success: true, message: 'No changes', data: product });
  }

  await product.save();

  // Audit log each changed field
  for (const [field, vals] of Object.entries(changes)) {
    await ErpAuditLog.logChange({
      entity_id: product.entity_id,
      log_type: 'ITEM_CHANGE',
      target_ref: product._id.toString(),
      target_model: 'ProductMaster',
      field_changed: field,
      old_value: vals.old,
      new_value: vals.new,
      changed_by: req.user._id,
      note: `Reorder rule updated: ${field}`
    });
  }

  res.json({ success: true, message: 'Reorder rules updated', data: product });
});

// ═══ Tag products to warehouse (creates inventory link) ═══
const tagToWarehouse = catchAsync(async (req, res) => {
  const { product_ids, warehouse_id, batch_lot_no, expiry_date, qty } = req.body;
  if (!warehouse_id) return res.status(400).json({ success: false, message: 'warehouse_id is required' });
  if (!Array.isArray(product_ids) || !product_ids.length) return res.status(400).json({ success: false, message: 'product_ids array is required' });

  const warehouse = await Warehouse.findById(warehouse_id).select('_id entity_id').lean();
  if (!warehouse) return res.status(404).json({ success: false, message: 'Warehouse not found' });

  let tagged = 0, skipped = 0;
  for (const pid of product_ids) {
    // Check if product already has inventory in this warehouse
    const exists = await InventoryLedger.findOne({ warehouse_id, product_id: pid }).lean();
    if (exists) { skipped++; continue; }

    await InventoryLedger.create({
      entity_id: warehouse.entity_id || req.entityId,
      bdm_id: req.user._id,
      warehouse_id,
      product_id: pid,
      batch_lot_no: batch_lot_no || 'INITIAL',
      expiry_date: expiry_date || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      transaction_type: 'OPENING_BALANCE',
      qty_in: qty || 0,
      running_balance: qty || 0,
      recorded_by: req.user._id
    });
    tagged++;
  }

  res.json({
    success: true,
    message: `Tagged ${tagged} product(s) to warehouse, ${skipped} already existed`,
    data: { tagged, skipped }
  });
});

// ═══ Get warehouses that a product is tagged to ═══
const getProductWarehouses = catchAsync(async (req, res) => {
  const entries = await InventoryLedger.aggregate([
    { $match: { product_id: require('mongoose').Types.ObjectId.createFromHexString(req.params.id) } },
    { $group: { _id: '$warehouse_id' } }
  ]);
  const whIds = entries.map(e => e._id).filter(Boolean);
  const warehouses = await Warehouse.find({ _id: { $in: whIds } }).select('warehouse_code warehouse_name').lean();
  res.json({ success: true, data: warehouses });
});

module.exports = { getAll, getById, create, update, deactivate, updateReorderQty, tagToWarehouse, getProductWarehouses };
