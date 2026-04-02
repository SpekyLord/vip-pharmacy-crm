const ProductMaster = require('../models/ProductMaster');
const ErpAuditLog = require('../models/ErpAuditLog');
const { catchAsync } = require('../../middleware/errorHandler');

const getAll = catchAsync(async (req, res) => {
  const filter = {};
  if (req.query.entity_id) filter.entity_id = req.query.entity_id;
  if (req.query.is_active !== undefined) filter.is_active = req.query.is_active === 'true';
  if (req.query.q) {
    filter.$or = [
      { brand_name: { $regex: req.query.q, $options: 'i' } },
      { generic_name: { $regex: req.query.q, $options: 'i' } }
    ];
  }

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;
  const skip = (page - 1) * limit;

  const [products, total] = await Promise.all([
    ProductMaster.find(filter).sort({ brand_name: 1 }).skip(skip).limit(limit).lean(),
    ProductMaster.countDocuments(filter)
  ]);

  res.json({
    success: true,
    data: products,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) }
  });
});

const getById = catchAsync(async (req, res) => {
  const product = await ProductMaster.findById(req.params.id).lean();
  if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
  res.json({ success: true, data: product });
});

const create = catchAsync(async (req, res) => {
  req.body.added_by = req.user._id;
  const product = await ProductMaster.create(req.body);
  res.status(201).json({ success: true, data: product });
});

const update = catchAsync(async (req, res) => {
  const product = await ProductMaster.findByIdAndUpdate(
    req.params.id,
    { $set: req.body },
    { new: true, runValidators: true }
  );
  if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
  res.json({ success: true, data: product });
});

const deactivate = catchAsync(async (req, res) => {
  const product = await ProductMaster.findByIdAndUpdate(
    req.params.id,
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

  const product = await ProductMaster.findById(req.params.id);
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

module.exports = { getAll, getById, create, update, deactivate, updateReorderQty };
