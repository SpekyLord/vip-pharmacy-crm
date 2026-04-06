/**
 * Inventory Controller — BDM Stock Visibility
 *
 * Stock on hand, batch details, transaction ledger, variance, physical count.
 * All endpoints are BDM-scoped via tenantFilter middleware.
 */
const mongoose = require('mongoose');
const InventoryLedger = require('../models/InventoryLedger');
const ProductMaster = require('../models/ProductMaster');
const GrnEntry = require('../models/GrnEntry');
const TransactionEvent = require('../models/TransactionEvent');
const Settings = require('../models/Settings');
const ErpAuditLog = require('../models/ErpAuditLog');
const { catchAsync } = require('../../middleware/errorHandler');
const { getMyStock: getMyStockAgg, getAvailableBatches } = require('../services/fifoEngine');
const { cleanBatchNo } = require('../utils/normalize');
const { journalFromInventoryAdjustment } = require('../services/autoJournal');
const { createAndPostJournal } = require('../services/journalEngine');

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

  // Allow privileged users to query a different entity's stock (for IC transfers)
  const entityId = (req.isAdmin || req.isFinance || req.isPresident) && req.query.entity_id
    ? req.query.entity_id
    : req.entityId;

  // Phase 17: warehouse_id takes priority over bdm_id when provided
  const warehouseId = req.query.warehouse_id;
  const opts = warehouseId ? { warehouseId } : undefined;

  if (!bdmId && !warehouseId) {
    return res.status(400).json({ success: false, message: 'BDM ID or Warehouse ID required' });
  }

  const settings = await Settings.getSettings();
  const nearExpiryDays = settings.NEAR_EXPIRY_DAYS || 120;
  const nearExpiryDate = new Date();
  nearExpiryDate.setDate(nearExpiryDate.getDate() + nearExpiryDays);

  // Get raw stock data from FIFO engine
  const rawStock = await getMyStockAgg(entityId, bdmId, opts);

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
    .select('brand_name generic_name item_key dosage_strength selling_price unit_code vat_status')
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

  // Allow privileged users to query a different entity's stock (for IC transfers)
  const entityId = (req.isAdmin || req.isFinance || req.isPresident) && req.query.entity_id
    ? req.query.entity_id
    : req.entityId;

  // Phase 17: warehouse_id takes priority
  const warehouseId = req.query.warehouse_id;
  const opts = warehouseId ? { warehouseId } : undefined;

  const settings = await Settings.getSettings();
  const nearExpiryDays = settings.NEAR_EXPIRY_DAYS || 120;
  const nearExpiryDate = new Date();
  nearExpiryDate.setDate(nearExpiryDate.getDate() + nearExpiryDays);

  const batches = await getAvailableBatches(entityId, bdmId, req.params.productId, opts);

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
  // Phase 17: warehouse_id filter takes priority
  if (req.query.warehouse_id) {
    filter.warehouse_id = new mongoose.Types.ObjectId(req.query.warehouse_id);
  } else if (bdmId) {
    filter.bdm_id = new mongoose.Types.ObjectId(bdmId);
  }

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
  // Phase 17: warehouse_id filter takes priority
  if (req.query.warehouse_id) {
    match.warehouse_id = new mongoose.Types.ObjectId(req.query.warehouse_id);
  } else if (bdmId) {
    match.bdm_id = new mongoose.Types.ObjectId(bdmId);
  }

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
  const { counts, warehouse_id } = req.body;
  // counts: [{ product_id, batch_lot_no, expiry_date, actual_qty }]

  if (!counts || !counts.length) {
    return res.status(400).json({ success: false, message: 'Counts array required' });
  }

  const bdmId = req.bdmId;
  const adjustments = [];

  for (const count of counts) {
    const normalizedBatch = cleanBatchNo(count.batch_lot_no);

    // Get current system balance for this product/batch
    const matchFilter = {
      entity_id: new mongoose.Types.ObjectId(req.entityId),
      product_id: new mongoose.Types.ObjectId(count.product_id),
      batch_lot_no: normalizedBatch
    };
    // Use warehouse_id when provided, otherwise fall back to bdm_id
    if (warehouse_id) {
      matchFilter.warehouse_id = new mongoose.Types.ObjectId(warehouse_id);
    } else {
      matchFilter.bdm_id = new mongoose.Types.ObjectId(bdmId);
    }
    const [agg] = await InventoryLedger.aggregate([
      {
        $match: matchFilter
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
      warehouse_id: warehouse_id || undefined,
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

  // Auto-journal for inventory adjustments (non-blocking)
  for (const adj of adjustments) {
    try {
      const product = await ProductMaster.findById(adj.product_id).select('purchase_price brand_name').lean();
      const unitCost = product?.purchase_price || 0;
      const amount = Math.round(Math.abs(adj.variance) * unitCost * 100) / 100;
      const jeData = journalFromInventoryAdjustment({
        variance: adj.variance,
        product_name: product?.brand_name || '',
        batch_lot_no: adj.batch_lot_no,
        bdm_id: req.bdmId
      }, amount, req.user._id);
      if (jeData) await createAndPostJournal(req.entityId, jeData);
    } catch (jeErr) {
      console.error('Inv adjustment JE failed:', adj.product_id, jeErr.message);
    }
  }

  res.json({
    success: true,
    message: `${adjustments.length} adjustments recorded`,
    data: adjustments
  });
});

// ═══ Phase 4 — GRN Workflow ═══

/**
 * POST /grn — BDM creates a Goods Received Note (PENDING)
 */
const createGrn = catchAsync(async (req, res) => {
  const { grn_date, line_items, waybill_photo_url, undertaking_photo_url, ocr_data, notes, warehouse_id } = req.body;

  if (!line_items?.length) {
    return res.status(400).json({ success: false, message: 'At least one line item is required' });
  }

  // Validate products exist
  const productIds = line_items.map(li => li.product_id);
  const products = await ProductMaster.find({ _id: { $in: productIds } }).select('_id item_key').lean();
  const productMap = new Map(products.map(p => [p._id.toString(), p]));

  for (const li of line_items) {
    if (!productMap.has(li.product_id?.toString())) {
      return res.status(400).json({ success: false, message: `Product ${li.product_id} not found` });
    }
    if (!li.item_key) li.item_key = productMap.get(li.product_id.toString()).item_key;
  }

  const grn = await GrnEntry.create({
    entity_id: req.entityId,
    bdm_id: req.bdmId,
    warehouse_id: warehouse_id || undefined,
    grn_date,
    line_items,
    waybill_photo_url,
    undertaking_photo_url,
    ocr_data,
    notes,
    created_by: req.user._id
  });

  await ErpAuditLog.logChange({
    entity_id: req.entityId,
    bdm_id: req.bdmId,
    log_type: 'STATUS_CHANGE',
    target_ref: grn._id.toString(),
    target_model: 'GrnEntry',
    field_changed: 'status',
    new_value: 'PENDING',
    changed_by: req.user._id,
    note: `GRN created with ${line_items.length} item(s)`
  });

  res.status(201).json({ success: true, data: grn });
});

/**
 * POST /grn/:id/approve — Finance/Admin approves or rejects a GRN
 * On APPROVED: creates TransactionEvent + InventoryLedger entries atomically.
 */
const approveGrn = catchAsync(async (req, res) => {
  const { action, rejection_reason } = req.body;

  if (!['APPROVED', 'REJECTED'].includes(action)) {
    return res.status(400).json({ success: false, message: 'Action must be APPROVED or REJECTED' });
  }

  const entityScope = req.isPresident ? {} : { entity_id: req.entityId };
  const grn = await GrnEntry.findOne({ _id: req.params.id, status: 'PENDING', ...entityScope });
  if (!grn) {
    return res.status(404).json({ success: false, message: 'GRN not found or not in PENDING status' });
  }

  if (action === 'REJECTED') {
    grn.status = 'REJECTED';
    grn.rejection_reason = rejection_reason || '';
    grn.reviewed_by = req.user._id;
    grn.reviewed_at = new Date();
    await grn.save();

    await ErpAuditLog.logChange({
      entity_id: grn.entity_id,
      bdm_id: grn.bdm_id,
      log_type: 'STATUS_CHANGE',
      target_ref: grn._id.toString(),
      target_model: 'GrnEntry',
      field_changed: 'status',
      old_value: 'PENDING',
      new_value: 'REJECTED',
      changed_by: req.user._id,
      note: rejection_reason || 'GRN rejected'
    });

    return res.json({ success: true, message: 'GRN rejected', data: grn });
  }

  // Period lock check
  const { checkPeriodOpen, dateToPeriod } = require('../utils/periodLock');
  const grnPeriod = dateToPeriod(grn.grn_date || new Date());
  await checkPeriodOpen(grn.entity_id, grnPeriod);

  // APPROVED — atomic transaction
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      // Create TransactionEvent
      const event = await TransactionEvent.create([{
        entity_id: grn.entity_id,
        bdm_id: grn.bdm_id,
        event_type: 'GRN',
        event_date: grn.grn_date,
        document_ref: grn._id.toString(),
        payload: { line_items: grn.line_items },
        created_by: req.user._id
      }], { session });

      // Create InventoryLedger entries for each line item
      for (const item of grn.line_items) {
        await InventoryLedger.create([{
          entity_id: grn.entity_id,
          bdm_id: grn.bdm_id,
          warehouse_id: grn.warehouse_id || undefined,
          product_id: item.product_id,
          batch_lot_no: item.batch_lot_no,
          expiry_date: item.expiry_date,
          transaction_type: 'GRN',
          qty_in: item.qty,
          qty_out: 0,
          event_id: event[0]._id,
          recorded_by: req.user._id
        }], { session });
      }

      // Update GRN status
      grn.status = 'APPROVED';
      grn.reviewed_by = req.user._id;
      grn.reviewed_at = new Date();
      grn.event_id = event[0]._id;
      await grn.save({ session });
    });

    await ErpAuditLog.logChange({
      entity_id: grn.entity_id,
      bdm_id: grn.bdm_id,
      log_type: 'STATUS_CHANGE',
      target_ref: grn._id.toString(),
      target_model: 'GrnEntry',
      field_changed: 'status',
      old_value: 'PENDING',
      new_value: 'APPROVED',
      changed_by: req.user._id,
      note: `GRN approved: ${grn.line_items.length} item(s) added to inventory`
    });

    res.json({ success: true, message: 'GRN approved — stock updated', data: grn });
  } finally {
    await session.endSession();
  }
});

/**
 * GET /grn — List GRNs with status filter
 */
const getGrnList = catchAsync(async (req, res) => {
  const filter = { ...req.tenantFilter };
  if (req.query.status) filter.status = req.query.status;

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;
  const skip = (page - 1) * limit;

  const [grns, total] = await Promise.all([
    GrnEntry.find(filter)
      .populate('bdm_id', 'name email')
      .populate('reviewed_by', 'name')
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    GrnEntry.countDocuments(filter)
  ]);

  res.json({
    success: true,
    data: grns,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) }
  });
});

// ═══ Phase 4 — Reorder & Expiry Alerts ═══

/**
 * GET /alerts — Expiry alerts + reorder alerts
 * Enriched with SAP-level reorder data (min qty, suggested order, lead time, order-by date).
 */
const getAlerts = catchAsync(async (req, res) => {
  const bdmId = (req.isAdmin || req.isFinance || req.isPresident) && req.query.bdm_id
    ? req.query.bdm_id
    : req.bdmId;

  // Phase 17: warehouse_id takes priority
  const warehouseId = req.query.warehouse_id;
  const opts = warehouseId ? { warehouseId } : undefined;

  const settings = await Settings.getSettings();
  const nearExpiryDays = settings.NEAR_EXPIRY_DAYS || 120;
  const nearExpiryDate = new Date();
  nearExpiryDate.setDate(nearExpiryDate.getDate() + nearExpiryDays);

  // Get raw stock from FIFO engine
  const rawStock = await getMyStockAgg(req.entityId, bdmId, opts);

  // 1. Expiry alerts: batches expiring within NEAR_EXPIRY_DAYS
  const expiryAlerts = [];
  for (const item of rawStock) {
    if (item.available_qty > 0 && new Date(item.expiry_date) <= nearExpiryDate) {
      expiryAlerts.push({
        product_id: item.product_id,
        batch_lot_no: item.batch_lot_no,
        expiry_date: item.expiry_date,
        days_remaining: Math.ceil((new Date(item.expiry_date) - new Date()) / (1000 * 60 * 60 * 24)),
        available_qty: item.available_qty
      });
    }
  }

  // 2. Reorder alerts: aggregate stock by product, compare to reorder_min_qty
  const productTotals = new Map();
  for (const item of rawStock) {
    const pid = item.product_id.toString();
    productTotals.set(pid, (productTotals.get(pid) || 0) + item.available_qty);
  }

  // Fetch products with reorder rules configured
  const productsWithReorder = await ProductMaster.find({
    entity_id: req.entityId,
    reorder_min_qty: { $ne: null },
    is_active: true
  }).select('brand_name generic_name item_key reorder_min_qty reorder_qty safety_stock_qty lead_time_days').lean();

  const reorderAlerts = [];
  const today = new Date();
  for (const product of productsWithReorder) {
    const currentQty = productTotals.get(product._id.toString()) || 0;
    if (currentQty < product.reorder_min_qty) {
      const orderByDate = product.lead_time_days
        ? new Date(today.getTime() + product.lead_time_days * 24 * 60 * 60 * 1000)
        : null;

      reorderAlerts.push({
        product_id: product._id,
        product: { brand_name: product.brand_name, generic_name: product.generic_name, item_key: product.item_key },
        current_qty: currentQty,
        reorder_min_qty: product.reorder_min_qty,
        reorder_qty: product.reorder_qty,
        safety_stock_qty: product.safety_stock_qty,
        lead_time_days: product.lead_time_days,
        shortfall: product.reorder_min_qty - currentQty,
        below_safety: product.safety_stock_qty != null && currentQty < product.safety_stock_qty,
        order_by_date: orderByDate
      });
    }
  }

  // Enrich expiry alerts with product details
  const expiryProductIds = [...new Set(expiryAlerts.map(a => a.product_id))];
  const expiryProducts = await ProductMaster.find({ _id: { $in: expiryProductIds } })
    .select('brand_name generic_name item_key').lean();
  const expiryProductMap = new Map(expiryProducts.map(p => [p._id.toString(), p]));

  for (const alert of expiryAlerts) {
    alert.product = expiryProductMap.get(alert.product_id.toString()) || {};
  }

  // Sort: expiry by days remaining ASC, reorder by shortfall DESC
  expiryAlerts.sort((a, b) => a.days_remaining - b.days_remaining);
  reorderAlerts.sort((a, b) => b.shortfall - a.shortfall);

  res.json({
    success: true,
    data: { expiry_alerts: expiryAlerts, reorder_alerts: reorderAlerts },
    summary: { expiry_count: expiryAlerts.length, reorder_count: reorderAlerts.length }
  });
});

module.exports = {
  getMyStock,
  getBatches,
  getLedger,
  getVariance,
  recordPhysicalCount,
  createGrn,
  approveGrn,
  getGrnList,
  getAlerts
};
