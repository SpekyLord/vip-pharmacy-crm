/**
 * Inventory Controller — BDM Stock Visibility
 *
 * Stock on hand, batch details, transaction ledger, variance, physical count.
 * All endpoints are BDM-scoped via tenantFilter middleware.
 */
const mongoose = require('mongoose');
const InventoryLedger = require('../models/InventoryLedger');
const ProductMaster = require('../models/ProductMaster');
const Settings = require('../models/Settings');
const ErpAuditLog = require('../models/ErpAuditLog');
const { catchAsync } = require('../../middleware/errorHandler');
const { getMyStock: getMyStockAgg, getAvailableBatches } = require('../services/fifoEngine');
const { cleanBatchNo } = require('../utils/normalize');

/**
 * GET /my-stock — BDM's stock dashboard data
 * Aggregates inventory → product summary with available_qty, batch count,
 * nearest expiry, near-expiry flag, total value.
 * Admin/Finance: pass ?bdm_id=X to view any BDM's stock.
 */
const getMyStock = catchAsync(async (req, res) => {
  const bdmId = (req.isAdmin || req.isFinance || req.isPresident) && req.query.bdm_id
    ? req.query.bdm_id
    : req.bdmId;

  if (!bdmId) {
    return res.status(400).json({ success: false, message: 'BDM ID required' });
  }

  const settings = await Settings.getSettings();
  const nearExpiryDays = settings.NEAR_EXPIRY_DAYS || 120;
  const nearExpiryDate = new Date();
  nearExpiryDate.setDate(nearExpiryDate.getDate() + nearExpiryDays);

  // Get raw stock data from FIFO engine
  const rawStock = await getMyStockAgg(req.entityId, bdmId);

  // Group by product
  const productMap = new Map();
  for (const item of rawStock) {
    const pid = item.product_id.toString();
    if (!productMap.has(pid)) {
      productMap.set(pid, {
        product_id: item.product_id,
        batches: [],
        total_qty: 0,
        nearest_expiry: null,
        near_expiry: false
      });
    }
    const entry = productMap.get(pid);
    entry.batches.push({
      batch_lot_no: item.batch_lot_no,
      expiry_date: item.expiry_date,
      available_qty: item.available_qty,
      days_to_expiry: Math.ceil((new Date(item.expiry_date) - new Date()) / (1000 * 60 * 60 * 24)),
      near_expiry: new Date(item.expiry_date) <= nearExpiryDate
    });
    entry.total_qty += item.available_qty;

    if (!entry.nearest_expiry || new Date(item.expiry_date) < new Date(entry.nearest_expiry)) {
      entry.nearest_expiry = item.expiry_date;
    }
    if (new Date(item.expiry_date) <= nearExpiryDate) {
      entry.near_expiry = true;
    }
  }

  // Enrich with product details
  const productIds = [...productMap.keys()].map(id => new mongoose.Types.ObjectId(id));
  const products = await ProductMaster.find({ _id: { $in: productIds } })
    .select('brand_name generic_name item_key selling_price unit_code vat_status')
    .lean();

  const productLookup = new Map(products.map(p => [p._id.toString(), p]));

  const stockItems = [];
  let totalProducts = 0;
  let totalUnits = 0;
  let totalValue = 0;
  let nearExpiryCount = 0;

  for (const [pid, entry] of productMap) {
    const product = productLookup.get(pid);
    const value = entry.total_qty * (product?.selling_price || 0);

    stockItems.push({
      product_id: entry.product_id,
      product: product || { _id: pid },
      batch_count: entry.batches.length,
      total_qty: entry.total_qty,
      nearest_expiry: entry.nearest_expiry,
      near_expiry: entry.near_expiry,
      value: Math.round(value * 100) / 100,
      batches: entry.batches
    });

    totalProducts++;
    totalUnits += entry.total_qty;
    totalValue += value;
    if (entry.near_expiry) nearExpiryCount++;
  }

  res.json({
    success: true,
    data: stockItems,
    summary: {
      total_products: totalProducts,
      total_units: totalUnits,
      total_value: Math.round(totalValue * 100) / 100,
      near_expiry_count: nearExpiryCount
    }
  });
});

/**
 * GET /batches/:productId — Available batches for a product
 * Sorted by expiry ASC (FIFO order). BDM-scoped.
 */
const getBatches = catchAsync(async (req, res) => {
  const bdmId = (req.isAdmin || req.isFinance || req.isPresident) && req.query.bdm_id
    ? req.query.bdm_id
    : req.bdmId;

  const settings = await Settings.getSettings();
  const nearExpiryDays = settings.NEAR_EXPIRY_DAYS || 120;
  const nearExpiryDate = new Date();
  nearExpiryDate.setDate(nearExpiryDate.getDate() + nearExpiryDays);

  const batches = await getAvailableBatches(req.entityId, bdmId, req.params.productId);

  const enriched = batches.map(b => ({
    ...b,
    days_to_expiry: Math.ceil((new Date(b.expiry_date) - new Date()) / (1000 * 60 * 60 * 24)),
    near_expiry: new Date(b.expiry_date) <= nearExpiryDate
  }));

  res.json({ success: true, data: enriched });
});

/**
 * GET /ledger/:productId — Full transaction history (audit trail)
 * Paginated, date-range filterable. BDM-scoped.
 */
const getLedger = catchAsync(async (req, res) => {
  const bdmId = (req.isAdmin || req.isFinance || req.isPresident) && req.query.bdm_id
    ? req.query.bdm_id
    : req.bdmId;

  const filter = {
    entity_id: new mongoose.Types.ObjectId(req.entityId),
    product_id: new mongoose.Types.ObjectId(req.params.productId)
  };
  if (bdmId) filter.bdm_id = new mongoose.Types.ObjectId(bdmId);

  if (req.query.date_from || req.query.date_to) {
    filter.recorded_at = {};
    if (req.query.date_from) filter.recorded_at.$gte = new Date(req.query.date_from);
    if (req.query.date_to) filter.recorded_at.$lte = new Date(req.query.date_to);
  }

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;
  const skip = (page - 1) * limit;

  const [entries, total] = await Promise.all([
    InventoryLedger.find(filter)
      .sort({ recorded_at: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    InventoryLedger.countDocuments(filter)
  ]);

  res.json({
    success: true,
    data: entries,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) }
  });
});

/**
 * GET /variance — Variance report
 * Per product: opening_balance + total_in - total_out = expected_balance
 */
const getVariance = catchAsync(async (req, res) => {
  const bdmId = (req.isAdmin || req.isFinance || req.isPresident) && req.query.bdm_id
    ? req.query.bdm_id
    : req.bdmId;

  const match = { entity_id: new mongoose.Types.ObjectId(req.entityId) };
  if (bdmId) match.bdm_id = new mongoose.Types.ObjectId(bdmId);

  const IN_TYPES = ['OPENING_BALANCE', 'GRN', 'RETURN_IN', 'TRANSFER_IN'];
  const OUT_TYPES = ['CSI', 'DR_SAMPLING', 'DR_CONSIGNMENT', 'TRANSFER_OUT'];

  const result = await InventoryLedger.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$product_id',
        opening_balance: {
          $sum: {
            $cond: [{ $eq: ['$transaction_type', 'OPENING_BALANCE'] }, '$qty_in', 0]
          }
        },
        total_in: {
          $sum: {
            $cond: [{ $in: ['$transaction_type', IN_TYPES] }, '$qty_in', 0]
          }
        },
        total_out: {
          $sum: {
            $cond: [{ $in: ['$transaction_type', OUT_TYPES] }, '$qty_out', 0]
          }
        },
        adjustments_in: {
          $sum: {
            $cond: [{ $eq: ['$transaction_type', 'ADJUSTMENT'] }, '$qty_in', 0]
          }
        },
        adjustments_out: {
          $sum: {
            $cond: [{ $eq: ['$transaction_type', 'ADJUSTMENT'] }, '$qty_out', 0]
          }
        },
        actual_in: { $sum: '$qty_in' },
        actual_out: { $sum: '$qty_out' }
      }
    },
    {
      $addFields: {
        expected_balance: { $subtract: [{ $add: ['$opening_balance', '$total_in'] }, '$total_out'] },
        actual_balance: { $subtract: ['$actual_in', '$actual_out'] },
        net_adjustments: { $subtract: ['$adjustments_in', '$adjustments_out'] }
      }
    },
    {
      $addFields: {
        variance: { $subtract: ['$actual_balance', '$expected_balance'] }
      }
    },
    { $sort: { _id: 1 } }
  ]);

  // Enrich with product details
  const productIds = result.map(r => r._id);
  const products = await ProductMaster.find({ _id: { $in: productIds } })
    .select('brand_name generic_name item_key')
    .lean();
  const productLookup = new Map(products.map(p => [p._id.toString(), p]));

  const enriched = result.map(r => ({
    product_id: r._id,
    product: productLookup.get(r._id.toString()) || { _id: r._id },
    opening_balance: r.opening_balance,
    total_in: r.total_in,
    total_out: r.total_out,
    expected_balance: r.expected_balance,
    actual_balance: r.actual_balance,
    net_adjustments: r.net_adjustments,
    variance: r.variance,
    status: Math.abs(r.variance) < 0.01 ? 'OK' : 'DISCREPANCY'
  }));

  res.json({ success: true, data: enriched });
});

/**
 * POST /physical-count — Record physical stock count
 * Creates ADJUSTMENT InventoryLedger entries for any variance.
 */
const recordPhysicalCount = catchAsync(async (req, res) => {
  const { counts } = req.body;
  // counts: [{ product_id, batch_lot_no, expiry_date, actual_qty }]

  if (!counts || !counts.length) {
    return res.status(400).json({ success: false, message: 'Counts array required' });
  }

  const bdmId = req.bdmId;
  const adjustments = [];

  for (const count of counts) {
    const normalizedBatch = cleanBatchNo(count.batch_lot_no);

    // Get current system balance for this product/batch
    const [agg] = await InventoryLedger.aggregate([
      {
        $match: {
          entity_id: new mongoose.Types.ObjectId(req.entityId),
          bdm_id: new mongoose.Types.ObjectId(bdmId),
          product_id: new mongoose.Types.ObjectId(count.product_id),
          batch_lot_no: normalizedBatch
        }
      },
      {
        $group: {
          _id: null,
          total_in: { $sum: '$qty_in' },
          total_out: { $sum: '$qty_out' }
        }
      }
    ]);

    const systemBalance = agg ? agg.total_in - agg.total_out : 0;
    const variance = count.actual_qty - systemBalance;

    if (Math.abs(variance) < 0.01) continue; // No adjustment needed

    const entry = await InventoryLedger.create({
      entity_id: req.entityId,
      bdm_id: bdmId,
      product_id: count.product_id,
      batch_lot_no: normalizedBatch,
      expiry_date: count.expiry_date,
      transaction_type: 'ADJUSTMENT',
      qty_in: variance > 0 ? variance : 0,
      qty_out: variance < 0 ? Math.abs(variance) : 0,
      recorded_by: req.user._id
    });

    await ErpAuditLog.logChange({
      entity_id: req.entityId,
      bdm_id: bdmId,
      log_type: 'ITEM_CHANGE',
      target_ref: entry._id.toString(),
      target_model: 'InventoryLedger',
      field_changed: 'physical_count',
      old_value: systemBalance,
      new_value: count.actual_qty,
      changed_by: req.user._id,
      note: `Physical count adjustment: ${variance > 0 ? '+' : ''}${variance}`
    });

    adjustments.push({
      product_id: count.product_id,
      batch_lot_no: normalizedBatch,
      system_balance: systemBalance,
      actual_qty: count.actual_qty,
      variance
    });
  }

  res.json({
    success: true,
    message: `${adjustments.length} adjustments recorded`,
    data: adjustments
  });
});

module.exports = {
  getMyStock,
  getBatches,
  getLedger,
  getVariance,
  recordPhysicalCount
};
