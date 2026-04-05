/**
 * Collateral Controller — Phase 19
 *
 * Manage marketing collateral inventory with distribution tracking.
 * All endpoints entity-scoped via tenantFilter.
 */
const mongoose = require('mongoose');
const Collateral = require('../models/Collateral');
const { catchAsync } = require('../../middleware/errorHandler');

// ═══════════════════════════════════════════════════════════
// CRUD
// ═══════════════════════════════════════════════════════════

/**
 * GET / — list collateral, filterable by collateral_type, assigned_to, is_active
 */
const getAll = catchAsync(async (req, res) => {
  const { collateral_type, assigned_to, is_active } = req.query;
  const page = Number(req.query.page) || 1;
  const rawLimit = req.query.limit;
  const limit = rawLimit === '0' || rawLimit === 0 ? 0 : (Number(rawLimit) || 50);

  const filter = { ...req.tenantFilter };
  if (collateral_type) filter.collateral_type = collateral_type;
  if (assigned_to) filter.assigned_to = assigned_to;
  if (is_active !== undefined) filter.is_active = is_active === 'true';

  const query = Collateral.find(filter).sort({ created_at: -1 });
  if (limit > 0) query.skip((page - 1) * limit).limit(limit);

  const [items, total] = await Promise.all([
    query.lean(),
    Collateral.countDocuments(filter)
  ]);

  res.json({
    success: true,
    data: items,
    pagination: {
      page,
      limit,
      total,
      pages: limit > 0 ? Math.ceil(total / limit) : 1
    }
  });
});

/**
 * GET /:id — detail with distribution_log
 */
const getById = catchAsync(async (req, res) => {
  const item = await Collateral.findOne({
    _id: req.params.id,
    ...req.tenantFilter
  }).lean();

  if (!item) {
    return res.status(404).json({ success: false, message: 'Collateral not found' });
  }

  res.json({ success: true, data: item });
});

/**
 * POST / — create collateral item
 */
const create = catchAsync(async (req, res) => {
  const data = {
    ...req.body,
    entity_id: req.entityId,
    created_by: req.user._id
  };

  const item = await Collateral.create(data);
  res.status(201).json({ success: true, data: item });
});

/**
 * PUT /:id — update collateral item
 */
const update = catchAsync(async (req, res) => {
  const item = await Collateral.findOne({
    _id: req.params.id,
    ...req.tenantFilter
  });

  if (!item) {
    return res.status(404).json({ success: false, message: 'Collateral not found' });
  }

  const blocked = ['_id', 'entity_id', 'created_at', 'created_by', 'distribution_log'];
  for (const [key, val] of Object.entries(req.body)) {
    if (!blocked.includes(key)) item[key] = val;
  }

  await item.save();
  res.json({ success: true, data: item });
});

// ═══════════════════════════════════════════════════════════
// DISTRIBUTION & RETURNS
// ═══════════════════════════════════════════════════════════

/**
 * POST /:id/distribute — record distribution, decrement qty_on_hand
 */
const recordDistribution = catchAsync(async (req, res) => {
  const { qty, distributed_to, notes } = req.body;

  if (!qty || qty <= 0) {
    return res.status(400).json({ success: false, message: 'Positive qty is required' });
  }

  const item = await Collateral.findOne({
    _id: req.params.id,
    ...req.tenantFilter
  });

  if (!item) {
    return res.status(404).json({ success: false, message: 'Collateral not found' });
  }

  if (qty > item.qty_on_hand) {
    return res.status(400).json({
      success: false,
      message: `Insufficient stock. On hand: ${item.qty_on_hand}, Requested: ${qty}`
    });
  }

  item.qty_on_hand -= qty;
  item.distribution_log.push({
    date: new Date(),
    qty,
    recipient: distributed_to,
    hospital_id: req.body.hospital_id || undefined,
    customer_id: req.body.customer_id || undefined,
    notes,
    recorded_by: req.user._id
  });

  await item.save();
  res.json({ success: true, data: item });
});

/**
 * POST /:id/return — record return, increment qty_on_hand
 */
const recordReturn = catchAsync(async (req, res) => {
  const { qty, notes } = req.body;

  if (!qty || qty <= 0) {
    return res.status(400).json({ success: false, message: 'Positive qty is required' });
  }

  const item = await Collateral.findOne({
    _id: req.params.id,
    ...req.tenantFilter
  });

  if (!item) {
    return res.status(404).json({ success: false, message: 'Collateral not found' });
  }

  item.qty_on_hand += qty;
  item.distribution_log.push({
    date: new Date(),
    qty: -qty,  // Negative qty indicates return
    recipient: 'RETURN',
    notes,
    recorded_by: req.user._id
  });

  await item.save();
  res.json({ success: true, data: item });
});

module.exports = {
  getAll,
  getById,
  create,
  update,
  recordDistribution,
  recordReturn
};
