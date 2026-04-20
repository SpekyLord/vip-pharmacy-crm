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
const { SEED_DEFAULTS } = require('./lookupGenericController');
const { buildPresidentReverseHandler } = require('../services/documentReversalService');
const XLSX = require('xlsx');
const { safeXlsxRead } = require('../../utils/safeXlsxRead');

// Phase 31R-OS helper: translate Mongo duplicate-key errors into a user-friendly
// 409 response. Saves 6-BALL-PEN incidents from recurring — frontend surfaces
// the server `message` field directly via showError().
function sendDuplicateIfAny(err, res, itemCode) {
  if (err && err.code === 11000) {
    const code = itemCode || 'this code';
    res.status(409).json({
      success: false,
      message: `An item with code "${code}" already exists in this entity.`,
    });
    return true;
  }
  return false;
}

// ═══════════════════════════════════════════════════════════
// SUPPLIES CRUD
// ═══════════════════════════════════════════════════════════

/**
 * GET / — list supplies, filterable by category, is_active
 * Adds reorder_alert flag when qty_on_hand <= reorder_level
 */
const getSupplies = catchAsync(async (req, res) => {
  const { category, is_active, include_reversed } = req.query;
  const page = Number(req.query.page) || 1;
  const rawLimit = req.query.limit;
  const limit = rawLimit === '0' || rawLimit === 0 ? 0 : (Number(rawLimit) || 50);

  const filter = { ...req.tenantFilter };
  if (category) filter.category = category;
  if (is_active !== undefined) filter.is_active = is_active === 'true';
  // Phase 31R-OS — hide president-reversed rows by default (matches sales/collections/expenses).
  if (include_reversed !== 'true') filter.deletion_event_id = { $exists: false };

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
  if (!req.entityId) {
    return res.status(400).json({
      success: false,
      message: 'Working entity is required. Select an entity before creating supply items.',
    });
  }
  const supplyData = {
    ...req.body,
    entity_id: req.entityId,
    created_by: req.user._id
  };

  try {
    const supply = await OfficeSupply.create(supplyData);
    res.status(201).json({ success: true, data: supply });
  } catch (err) {
    if (sendDuplicateIfAny(err, res, supplyData.item_code)) return;
    throw err;
  }
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

  if (supply.deletion_event_id) {
    return res.status(409).json({
      success: false,
      message: 'This item has been reversed by the president and cannot be edited.',
    });
  }

  const blocked = ['_id', 'entity_id', 'created_at', 'created_by', 'deletion_event_id'];
  for (const [key, val] of Object.entries(req.body)) {
    if (!blocked.includes(key)) supply[key] = val;
  }

  try {
    await supply.save();
    res.json({ success: true, data: supply });
  } catch (err) {
    if (sendDuplicateIfAny(err, res, supply.item_code)) return;
    throw err;
  }
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

  const validTypes = SEED_DEFAULTS.OFFICE_SUPPLY_TXN_TYPE;
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

// ═══ Export Office Supplies (Excel) ═══
const exportSupplies = catchAsync(async (req, res) => {
  const supplies = await OfficeSupply.find({ entity_id: req.entityId }).sort({ item_code: 1 }).lean();
  const rows = supplies.map(s => ({
    'Item Code': s.item_code || '',
    'Item Name': s.item_name || '',
    'Category': s.category || '',
    'Unit': s.unit || '',
    'Qty On Hand': s.qty_on_hand || 0,
    'Reorder Level': s.reorder_level || 0,
    'Last Purchase Price': s.last_purchase_price || 0,
    'Notes': s.notes || '',
    'Active': s.is_active !== false ? 'YES' : 'NO'
  }));
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [{ wch: 12 }, { wch: 25 }, { wch: 14 }, { wch: 8 }, { wch: 10 }, { wch: 10 }, { wch: 14 }, { wch: 25 }, { wch: 8 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Office Supplies');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Disposition', 'attachment; filename="office-supplies-export.xlsx"');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
});

// ═══ Import Office Supplies (Excel) — upsert by item_code ═══
const importSupplies = catchAsync(async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'Upload an Excel file' });
  const wb = safeXlsxRead(req.file.buffer, { type: 'buffer' });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
  let created = 0, updated = 0, errors = [];
  for (const r of rows) {
    const item_name = String(r['Item Name'] || r.item_name || '').trim();
    const item_code = String(r['Item Code'] || r.item_code || '').trim();
    if (!item_name) { errors.push({ item_code, error: 'Item name required' }); continue; }
    try {
      const filter = item_code
        ? { entity_id: req.entityId, item_code }
        : { entity_id: req.entityId, item_name };
      const result = await OfficeSupply.findOneAndUpdate(filter, {
        entity_id: req.entityId, item_name,
        item_code: item_code || undefined,
        category: String(r['Category'] || r.category || '').trim().toUpperCase() || undefined,
        unit: String(r['Unit'] || r.unit || '').trim() || undefined,
        qty_on_hand: r['Qty On Hand'] != null ? Number(r['Qty On Hand']) : 0,
        reorder_level: r['Reorder Level'] != null ? Number(r['Reorder Level']) : 0,
        last_purchase_price: r['Last Purchase Price'] != null ? Number(r['Last Purchase Price']) : 0,
        notes: String(r['Notes'] || '').trim() || undefined,
        is_active: String(r['Active'] || 'YES').toUpperCase() !== 'NO'
      }, { upsert: true, new: true });
      if (result.createdAt && result.updatedAt && result.createdAt.getTime() === result.updatedAt.getTime()) created++;
      else updated++;
    } catch (err) { errors.push({ item_code, error: err.message }); }
  }
  res.json({ success: true, message: `Import complete: ${created} created, ${updated} updated, ${errors.length} errors`, data: { created, updated, errors } });
});

// ═══════════════════════════════════════════════════════════
// PRESIDENT REVERSAL — Phase 31R-OS
// ═══════════════════════════════════════════════════════════
// Delegates to the shared `buildPresidentReverseHandler` factory. Handler does
// all of: reason + DELETE-confirmation validation, tenant scope load, cascade
// reversal (transactions for items, qty restore for txns), audit-log write.
// Danger-gated at the route layer via `erpSubAccessCheck('accounting', 'reverse_posted')`.
const presidentReverseSupply = buildPresidentReverseHandler('OFFICE_SUPPLY_ITEM');
const presidentReverseSupplyTxn = buildPresidentReverseHandler('OFFICE_SUPPLY_TXN');

module.exports = {
  getSupplies,
  getSupplyById,
  createSupply,
  updateSupply,
  recordTransaction,
  getTransactions,
  getAllTransactions,
  getReorderAlerts,
  exportSupplies,
  importSupplies,
  presidentReverseSupply,
  presidentReverseSupplyTxn,
};
