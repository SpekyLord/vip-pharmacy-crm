/**
 * Office Supply Controller — Phase 19
 *
 * Inventory tracking for office supplies with reorder alerts.
 * All endpoints entity-scoped via tenantFilter.
 */
const mongoose = require('mongoose');
const OfficeSupply = require('../models/OfficeSupply');
const OfficeSupplyTransaction = require('../models/OfficeSupplyTransaction');
const { catchAsync } = require('../../middleware/errorHandler');

// ═══════════════════════════════════════════════════════════
// SUPPLIES CRUD
// ═══════════════════════════════════════════════════════════

/**
 * GET / — list supplies, filterable by category, is_active
 * Adds reorder_alert flag when qty_on_hand <= reorder_level
 */
const getSupplies = catchAsync(async (req, res) => {
  const { category, is_active } = req.query;
  const page = Number(req.query.page) || 1;
  const rawLimit = req.query.limit;
  const limit = rawLimit === '0' || rawLimit === 0 ? 0 : (Number(rawLimit) || 50);

  const filter = { ...req.tenantFilter };
  if (category) filter.category = category;
  if (is_active !== undefined) filter.is_active = is_active === 'true';

  const query = OfficeSupply.find(filter).sort({ item_name: 1 });
  if (limit > 0) query.skip((page - 1) * limit).limit(limit);

  const [supplies, total] = await Promise.all([
    query.lean(),
    OfficeSupply.countDocuments(filter)
  ]);

  // Add reorder alert flag
  const data = supplies.map(s => ({
    ...s,
    reorder_alert: s.qty_on_hand <= (s.reorder_level || 0)
  }));

  res.json({
    success: true,
    data,
    pagination: {
      page,
      limit,
      total,
      pages: limit > 0 ? Math.ceil(total / limit) : 1
    }
  });
});

/**
 * GET /:id — supply detail with last 20 transactions
 */
const getSupplyById = catchAsync(async (req, res) => {
  const supply = await OfficeSupply.findOne({
    _id: req.params.id,
    ...req.tenantFilter
  }).lean();

  if (!supply) {
    return res.status(404).json({ success: false, message: 'Supply item not found' });
  }

  const recentTransactions = await OfficeSupplyTransaction.find({
    supply_id: supply._id,
    ...req.tenantFilter
  })
    .sort({ txn_date: -1, created_at: -1 })
    .limit(20)
    .lean();

  supply.reorder_alert = supply.qty_on_hand <= (supply.reorder_level || 0);
  supply.recent_transactions = recentTransactions;

  res.json({ success: true, data: supply });
});

/**
 * POST / — create a new office supply item
 */
const createSupply = catchAsync(async (req, res) => {
  const supplyData = {
    ...req.body,
    entity_id: req.entityId,
    created_by: req.user._id
  };

  const supply = await OfficeSupply.create(supplyData);
  res.status(201).json({ success: true, data: supply });
});

/**
 * PUT /:id — update supply item
 */
const updateSupply = catchAsync(async (req, res) => {
  const supply = await OfficeSupply.findOne({
    _id: req.params.id,
    ...req.tenantFilter
  });

  if (!supply) {
    return res.status(404).json({ success: false, message: 'Supply item not found' });
  }

  const blocked = ['_id', 'entity_id', 'created_at', 'created_by'];
  for (const [key, val] of Object.entries(req.body)) {
    if (!blocked.includes(key)) supply[key] = val;
  }

  await supply.save();
  res.json({ success: true, data: supply });
});

// ═══════════════════════════════════════════════════════════
// TRANSACTIONS
// ═══════════════════════════════════════════════════════════

/**
 * POST /:id/transactions — record a supply transaction
 * PURCHASE/RETURN add to qty_on_hand, ISSUE/ADJUSTMENT subtract.
 */
const recordTransaction = catchAsync(async (req, res) => {
  const { txn_type, qty } = req.body;

  const validTypes = ['PURCHASE', 'ISSUE', 'RETURN', 'ADJUSTMENT'];
  if (!validTypes.includes(txn_type)) {
    return res.status(400).json({ success: false, message: `txn_type must be one of: ${validTypes.join(', ')}` });
  }
  if (!qty || qty <= 0) {
    return res.status(400).json({ success: false, message: 'Positive qty is required' });
  }

  const session = await mongoose.startSession();
  try {
    let txn;
    await session.withTransaction(async () => {
      const supply = await OfficeSupply.findOne({
        _id: req.params.id,
        ...req.tenantFilter
      }).session(session);

      if (!supply) {
        throw Object.assign(new Error('Supply item not found'), { statusCode: 404 });
      }

      // Compute delta
      const adds = ['PURCHASE', 'RETURN'];
      const delta = adds.includes(txn_type) ? qty : -qty;

      if (delta < 0 && supply.qty_on_hand + delta < 0) {
        throw Object.assign(
          new Error(`Insufficient stock. On hand: ${supply.qty_on_hand}, Requested: ${qty}`),
          { statusCode: 400 }
        );
      }

      supply.qty_on_hand += delta;
      await supply.save({ session });

      [txn] = await OfficeSupplyTransaction.create([{
        ...req.body,
        supply_id: supply._id,
        entity_id: req.entityId,
        created_by: req.user._id
      }], { session });
    });

    res.status(201).json({ success: true, data: txn });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ success: false, message: err.message });
    }
    throw err;
  } finally {
    session.endSession();
  }
});

/**
 * GET /:id/transactions — paginated transaction history for a supply
 */
const getTransactions = catchAsync(async (req, res) => {
  const { page = 1, limit = 50 } = req.query;

  const filter = {
    supply_id: req.params.id,
    ...req.tenantFilter
  };

  const skip = (Number(page) - 1) * Number(limit);
  const [transactions, total] = await Promise.all([
    OfficeSupplyTransaction.find(filter)
      .sort({ txn_date: -1, created_at: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean(),
    OfficeSupplyTransaction.countDocuments(filter)
  ]);

  res.json({
    success: true,
    data: transactions,
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total,
      pages: Math.ceil(total / Number(limit))
    }
  });
});

/**
 * GET /transactions — all transactions (global, not per-supply)
 */
const getAllTransactions = catchAsync(async (req, res) => {
  const { page = 1, limit = 50 } = req.query;
  const skip = (Number(page) - 1) * Number(limit);

  const [transactions, total] = await Promise.all([
    OfficeSupplyTransaction.find({ ...req.tenantFilter })
      .sort({ txn_date: -1, created_at: -1 })
      .skip(skip)
      .limit(Number(limit))
      .populate('supply_id', 'item_name item_code')
      .lean(),
    OfficeSupplyTransaction.countDocuments({ ...req.tenantFilter })
  ]);

  // Map supply_id → supply for frontend compatibility
  const data = transactions.map(t => ({
    ...t,
    supply: t.supply_id || null
  }));

  res.json({
    success: true,
    data,
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total,
      pages: Math.ceil(total / Number(limit))
    }
  });
});

/**
 * GET /reorder-alerts — items where qty_on_hand <= reorder_level
 */
const getReorderAlerts = catchAsync(async (req, res) => {
  const supplies = await OfficeSupply.find({
    ...req.tenantFilter,
    is_active: true,
    $expr: { $lte: ['$qty_on_hand', '$reorder_level'] }
  })
    .sort({ item_name: 1 })
    .lean();

  const data = supplies.map(s => ({
    ...s,
    reorder_alert: true,
    deficit: (s.reorder_level || 0) - s.qty_on_hand
  }));

  res.json({ success: true, data });
});

module.exports = {
  getSupplies,
  getSupplyById,
  createSupply,
  updateSupply,
  recordTransaction,
  getTransactions,
  getAllTransactions,
  getReorderAlerts
};
