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
const PurchaseOrder = require('../models/PurchaseOrder');
const TransactionEvent = require('../models/TransactionEvent');
const Settings = require('../models/Settings');
const ErpAuditLog = require('../models/ErpAuditLog');
const { resolveOwnerForWrite, widenFilterForProxy } = require('../utils/resolveOwnerScope');
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
  // President/admin/finance: use query.bdm_id if provided, else null (entity-wide)
  const bdmId = (req.isAdmin || req.isFinance || req.isPresident)
    ? (req.query.bdm_id || null)
    : req.bdmId;

  // Allow privileged users to query a different entity's stock (for IC transfers)
  const entityId = (req.isAdmin || req.isFinance || req.isPresident) && req.query.entity_id
    ? req.query.entity_id
    : req.entityId;

  // Phase 17: warehouse_id takes priority over bdm_id when provided
  const warehouseId = req.query.warehouse_id;
  const opts = warehouseId ? { warehouseId } : undefined;

  if (!bdmId && !warehouseId && !(req.isAdmin || req.isFinance || req.isPresident)) {
    return res.status(400).json({ success: false, message: 'BDM ID or Warehouse ID required' });
  }

  const settings = await Settings.getSettings();
  const nearExpiryDays = settings.NEAR_EXPIRY_DAYS || 120;
  const nearExpiryDate = new Date();
  nearExpiryDate.setDate(nearExpiryDate.getDate() + nearExpiryDays);

  // Get raw stock data from FIFO engine
  const rawStock = await getMyStockAgg(entityId, bdmId, opts);

  // Group by product
  const now = new Date();
  const productMap = new Map();
  for (const item of rawStock) {
    const pid = item.product_id.toString();
    if (!productMap.has(pid)) {
      productMap.set(pid, {
        product_id: item.product_id,
        batches: [],
        total_qty: 0,
        nearest_expiry: null,
        near_expiry: false,
        expired: false
      });
    }
    const entry = productMap.get(pid);
    const expiryDate = new Date(item.expiry_date);
    const daysToExpiry = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24));
    const isExpired = daysToExpiry <= 0;
    const isNearExpiry = !isExpired && expiryDate <= nearExpiryDate;

    entry.batches.push({
      batch_lot_no: item.batch_lot_no,
      expiry_date: item.expiry_date,
      available_qty: item.available_qty,
      days_to_expiry: daysToExpiry,
      expired: isExpired,
      near_expiry: isNearExpiry
    });
    entry.total_qty += item.available_qty;

    if (!entry.nearest_expiry || expiryDate < new Date(entry.nearest_expiry)) {
      entry.nearest_expiry = item.expiry_date;
    }
    if (isExpired) {
      entry.expired = true;
    } else if (isNearExpiry) {
      entry.near_expiry = true;
    }
  }

  // Enrich with product details
  const productIds = [...productMap.keys()].map(id => new mongoose.Types.ObjectId(id));
  // eslint-disable-next-line vip-tenant/require-entity-filter -- productIds harvested from same-entity-scoped stock aggregation upstream; _id is globally unique
  const products = await ProductMaster.find({ _id: { $in: productIds } })
    .select('brand_name generic_name item_key dosage_strength selling_price unit_code vat_status')
    .lean();

  const productLookup = new Map(products.map(p => [p._id.toString(), p]));

  const stockItems = [];
  let totalProducts = 0;
  let totalUnits = 0;
  let totalValue = 0;
  let nearExpiryCount = 0;
  let expiredCount = 0;

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
      expired: entry.expired,
      value: Math.round(value * 100) / 100,
      batches: entry.batches
    });

    totalProducts++;
    totalUnits += entry.total_qty;
    totalValue += value;
    if (entry.expired) expiredCount++;
    else if (entry.near_expiry) nearExpiryCount++;
  }

  res.json({
    success: true,
    data: stockItems,
    summary: {
      total_products: totalProducts,
      total_units: totalUnits,
      total_value: Math.round(totalValue * 100) / 100,
      near_expiry_count: nearExpiryCount,
      expired_count: expiredCount
    }
  });
});

/**
 * GET /batches/:productId — Available batches for a product
 * Sorted by expiry ASC (FIFO order). BDM-scoped.
 */
const getBatches = catchAsync(async (req, res) => {
  const bdmId = (req.isAdmin || req.isFinance || req.isPresident)
    ? (req.query.bdm_id || null)
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

  const now = new Date();
  const enriched = batches.map(b => {
    const daysToExpiry = Math.ceil((new Date(b.expiry_date) - now) / (1000 * 60 * 60 * 24));
    const isExpired = daysToExpiry <= 0;
    return {
      ...b,
      days_to_expiry: daysToExpiry,
      expired: isExpired,
      near_expiry: !isExpired && new Date(b.expiry_date) <= nearExpiryDate
    };
  });

  res.json({ success: true, data: enriched });
});

/**
 * GET /ledger/:productId — Full transaction history (audit trail)
 * Paginated, date-range filterable. BDM-scoped.
 */
const getLedger = catchAsync(async (req, res) => {
  const bdmId = (req.isAdmin || req.isFinance || req.isPresident)
    ? (req.query.bdm_id || null)
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
  const bdmId = (req.isAdmin || req.isFinance || req.isPresident)
    ? (req.query.bdm_id || null)
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

  // eslint-disable-next-line vip-tenant/require-entity-filter -- $match: match where match is built above with entity_id from req.entityId; rule can't see through Identifier
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
  // eslint-disable-next-line vip-tenant/require-entity-filter -- productIds harvested from same-entity-scoped variance aggregate; _id is globally unique
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
    // eslint-disable-next-line vip-tenant/require-entity-filter -- $match: matchFilter where matchFilter is built above with entity_id from req.entityId; rule can't see through Identifier
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
      // eslint-disable-next-line vip-tenant/require-entity-filter -- adj.product_id from same-entity-scoped physical-count match (entity_id filtered above)
      const product = await ProductMaster.findById(adj.product_id).select('purchase_price brand_name').lean();
      const unitCost = product?.purchase_price || 0;
      const amount = Math.round(Math.abs(adj.variance) * unitCost * 100) / 100;
      const jeData = await journalFromInventoryAdjustment({
        variance: adj.variance,
        product_name: product?.brand_name || '',
        batch_lot_no: adj.batch_lot_no,
        bdm_id: req.bdmId
      }, amount, req.user._id);
      if (jeData) await createAndPostJournal(req.entityId, jeData);
    } catch (jeErr) {
      console.error('[AUTO_JOURNAL_FAILURE] InventoryAdjustment', String(adj.product_id), jeErr.message);
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
  const { grn_date, line_items, waybill_photo_url, undertaking_photo_url, ocr_data, notes, warehouse_id, po_id, reassignment_id } = req.body;

  if (!line_items?.length) {
    return res.status(400).json({ success: false, message: 'At least one line item is required' });
  }

  // Phase G4.5b — Proxy Entry. Admin/finance/back-office contractor (with
  // inventory.grn_proxy_entry sub-perm + PROXY_ENTRY_ROLES.GRN role) can record
  // a GRN on behalf of another BDM via `assigned_to`. Falls back to self-entry
  // when absent. Rule #21: denial on ineligible proxy is explicit (never silent
  // self-fallback). Defense in depth: the target BDM must also have access to
  // the receiving warehouse (Warehouse.assigned_users) — widening tenantFilter
  // does not override warehouse-level assignment.
  let owner;
  try {
    owner = await resolveOwnerForWrite(req, 'inventory', { subKey: 'grn_proxy_entry' });
  } catch (err) {
    if (err.statusCode === 403 || err.statusCode === 400) {
      return res.status(err.statusCode).json({ success: false, message: err.message });
    }
    throw err;
  }

  if (owner.isOnBehalf && warehouse_id) {
    const Warehouse = require('../models/Warehouse');
    const wh = await Warehouse.findOne({ _id: warehouse_id, entity_id: req.entityId })
      .select('warehouse_code warehouse_name assigned_users manager_id')
      .lean();
    if (!wh) {
      return res.status(404).json({ success: false, message: 'Warehouse not found for this entity' });
    }
    const assignedIds = (wh.assigned_users || []).map(id => String(id));
    if (wh.manager_id) assignedIds.push(String(wh.manager_id));
    if (!assignedIds.includes(String(owner.ownerId))) {
      return res.status(400).json({
        success: false,
        message: `Target BDM is not assigned to warehouse ${wh.warehouse_code || wh.warehouse_name}. Add them to the warehouse assignment list before recording GRN on their behalf.`
      });
    }
  }

  // Phase 32R: waybill is evidence of physical delivery. Required at capture
  // time — subscribers CAN relax this via GRN_SETTINGS.WAYBILL_REQUIRED if their
  // workflow permits (e.g. internal transfer with no waybill), see below.
  const { getGrnSetting } = require('../services/undertakingService');
  const waybillRequired = await getGrnSetting(req.entityId, 'WAYBILL_REQUIRED', 1);
  if (waybillRequired && !waybill_photo_url) {
    return res.status(400).json({
      success: false,
      message: 'Waybill photo is required. Upload the courier delivery waybill to proceed.'
    });
  }

  // Phase 32R: validate batch/expiry/qty on every line BEFORE any DB write.
  // GRN is the capture surface — data must be complete before the Undertaking
  // approval wrapper is auto-created.
  //
  // Phase 32R-S1 (subscription scalability): batch + expiry are only required
  // when the corresponding GRN_SETTINGS flag is truthy (default 1 = pharmacy
  // behavior). When a subscriber sets REQUIRE_BATCH / REQUIRE_EXPIRY = 0 for
  // their entity, blanks are normalized IN PLACE on `li` to safe sentinels
  // ('N/A' for batch, 9999-12-31 for expiry) so the pre-save hook, FIFO
  // aggregation ({$gt: new Date()} + sort-asc), and Undertaking auto-mirror
  // all keep working without special-casing null.
  const minExpiryDays = await getGrnSetting(req.entityId, 'MIN_EXPIRY_DAYS', 30);
  const requireBatch = await getGrnSetting(req.entityId, 'REQUIRE_BATCH', 1);
  const requireExpiry = await getGrnSetting(req.entityId, 'REQUIRE_EXPIRY', 1);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiryFloor = new Date(today.getTime() + minExpiryDays * 24 * 60 * 60 * 1000);
  const EXPIRY_SENTINEL = new Date('9999-12-31T00:00:00.000Z');

  const captureErrors = [];
  for (let i = 0; i < line_items.length; i++) {
    const li = line_items[i] || {};
    const n = i + 1;
    if (!li.product_id) captureErrors.push(`Line ${n}: product is required`);
    if (!(Number(li.qty) > 0)) captureErrors.push(`Line ${n}: qty must be > 0`);

    const batchProvided = !!(li.batch_lot_no && String(li.batch_lot_no).trim());
    if (requireBatch) {
      if (!batchProvided) {
        captureErrors.push(`Line ${n}: batch/lot # is required (scan or type from packaging)`);
      }
    } else if (!batchProvided) {
      // Sentinel: FIFO groups by batch_lot_no — blank would lump with real batches.
      // 'N/A' is uppercase already (cleanBatchNo pre-save is idempotent on it).
      li.batch_lot_no = 'N/A';
    }

    if (requireExpiry) {
      if (!li.expiry_date) {
        captureErrors.push(`Line ${n}: expiry date is required`);
      } else {
        const exp = new Date(li.expiry_date);
        if (isNaN(exp.getTime())) captureErrors.push(`Line ${n}: expiry date is invalid`);
        else if (exp < expiryFloor) {
          captureErrors.push(`Line ${n}: expiry must be at least ${minExpiryDays} days in the future`);
        }
      }
    } else if (!li.expiry_date) {
      // Sentinel: 9999-12-31 passes FIFO's {$gt: new Date()} match and sorts
      // last, so real-expiry batches are picked first. Non-perishable mode.
      li.expiry_date = EXPIRY_SENTINEL;
    } else {
      // User opted in per-line — keep the MIN_EXPIRY_DAYS floor validation.
      const exp = new Date(li.expiry_date);
      if (isNaN(exp.getTime())) captureErrors.push(`Line ${n}: expiry date is invalid`);
      else if (exp < expiryFloor) {
        captureErrors.push(`Line ${n}: expiry must be at least ${minExpiryDays} days in the future`);
      }
    }
  }
  if (captureErrors.length) {
    return res.status(400).json({
      success: false,
      message: 'GRN has capture errors',
      errors: captureErrors
    });
  }

  // Validate products exist within the caller's entity. Without entity_id, a
  // user could pass product_ids from another entity and the GRN would silently
  // accept them — creating ledger entries that reference a stranger entity's
  // catalog. Belt-and-braces: line_items come from req.body.
  const productIds = line_items.map(li => li.product_id);
  const products = await ProductMaster.find({ entity_id: req.entityId, _id: { $in: productIds } }).select('_id item_key').lean();
  const productMap = new Map(products.map(p => [p._id.toString(), p]));

  for (const li of line_items) {
    if (!productMap.has(li.product_id?.toString())) {
      return res.status(400).json({ success: false, message: `Product ${li.product_id} not found in this entity` });
    }
    if (!li.item_key) li.item_key = productMap.get(li.product_id.toString()).item_key;
  }

  // Determine source type
  let source_type = 'STANDALONE';
  let po_number;
  let vendor_id;

  // Internal transfer cross-reference (reassignment_id provided)
  if (reassignment_id) {
    const StockReassignment = require('../models/StockReassignment');
    const reassignment = await StockReassignment.findOne({
      _id: reassignment_id,
      entity_id: req.entityId,
      status: 'AWAITING_GRN'
    }).lean();
    if (!reassignment) {
      return res.status(404).json({ success: false, message: 'Internal transfer not found or not awaiting GRN' });
    }
    // Receiving contractor must be the target BDM. Phase G4.5b — for proxied
    // entry, we compare against the RESOLVED owner (target BDM), not the proxy
    // caller's req.bdmId — otherwise a back-office proxy would be rejected for
    // receiving on behalf of the true receiver.
    if (reassignment.target_bdm_id.toString() !== String(owner.ownerId)
        && !req.isAdmin && !req.isPresident) {
      return res.status(403).json({ success: false, message: 'Only the receiving contractor can create GRN for this transfer' });
    }
    source_type = 'INTERNAL_TRANSFER';
  }

  // PO cross-reference validation (optional — skip for standalone GRNs)
  if (po_id) {
    source_type = 'PO';
    const po = await PurchaseOrder.findOne({ _id: po_id, entity_id: req.entityId }).lean();
    if (!po) {
      return res.status(404).json({ success: false, message: 'Purchase order not found' });
    }
    if (!['APPROVED', 'PARTIALLY_RECEIVED'].includes(po.status)) {
      return res.status(400).json({ success: false, message: `PO status is ${po.status} — only APPROVED or PARTIALLY_RECEIVED POs can receive goods` });
    }
    po_number = po.po_number;
    vendor_id = po.vendor_id;

    // Validate each GRN line against corresponding PO line
    for (let i = 0; i < line_items.length; i++) {
      const li = line_items[i];
      if (li.po_line_index == null) continue; // standalone line, no PO match
      if (li.po_line_index < 0 || li.po_line_index >= po.line_items.length) {
        return res.status(400).json({ success: false, message: `Line ${i + 1}: po_line_index ${li.po_line_index} is out of bounds (PO has ${po.line_items.length} lines)` });
      }
      const poLine = po.line_items[li.po_line_index];
      // Validate product matches
      if (poLine.product_id && li.product_id && poLine.product_id.toString() !== li.product_id.toString()) {
        return res.status(400).json({ success: false, message: `Line ${i + 1}: product does not match PO line ${li.po_line_index + 1}` });
      }
      // Validate qty does not exceed remaining receivable
      const remaining = (poLine.qty_ordered || 0) - (poLine.qty_received || 0);
      if (li.qty > remaining) {
        return res.status(400).json({ success: false, message: `Line ${i + 1}: qty (${li.qty}) exceeds PO remaining receivable qty (${remaining})` });
      }
    }
  }

  // Phase 32R-GRN#: human-readable doc number — `GRN-{TERR|ENTITY}{MMDDYY}-{NNN}`.
  // BDM-first: resolves the receiving contractor's territory code (same as CALF/PO);
  // falls back to Entity.short_name when the user has no territory binding (admin-
  // created GRNs). Generated BEFORE the session so DocSequence.getNext stays atomic
  // on its own and never participates in the withTransaction rollback (gaps on
  // aborted sessions are acceptable — same semantics as every other doc number).
  const { generateDocNumber } = require('../services/docNumbering');
  const grn_number = await generateDocNumber({
    prefix: 'GRN',
    bdmId: req.bdmId,
    entityId: req.entityId,
    date: grn_date
  });

  // Phase 32 — wrap GRN create + auto-Undertaking in a session so both roll back
  // together (global rule #20). The Undertaking becomes the scan/input source of
  // truth for batch + expiry; GRN line_items get synced on Undertaking submit.
  const { autoUndertakingForGrn } = require('../services/undertakingService');
  const session = await mongoose.startSession();
  let grn, undertaking;
  try {
    await session.withTransaction(async () => {
      const [created] = await GrnEntry.create([{
        entity_id: req.entityId,
        bdm_id: owner.ownerId,
        recorded_on_behalf_of: owner.proxiedBy,
        warehouse_id: warehouse_id || undefined,
        source_type,
        grn_number,
        po_id: po_id || undefined,
        po_number: po_number || undefined,
        vendor_id: vendor_id || undefined,
        reassignment_id: reassignment_id || undefined,
        grn_date,
        line_items,
        waybill_photo_url,
        undertaking_photo_url,
        ocr_data,
        notes,
        created_by: req.user._id
      }], { session });
      grn = created;

      // Phase G4.5b — autoUndertakingForGrn inherits bdm_id + recorded_on_behalf_of
      // from the GRN so the target BDM sees the UT in their queue (otherwise the
      // acknowledgment cascade would dead-end on a UT owned by the proxy).
      undertaking = await autoUndertakingForGrn(grn, { session });
    });
  } finally {
    await session.endSession();
  }

  // Re-read GRN so the API response reflects the undertaking_id back-link
  // eslint-disable-next-line vip-tenant/require-entity-filter -- grn._id from same-entity-scoped GrnEntry.create just above (entity_id: req.entityId)
  grn = await GrnEntry.findById(grn._id).lean();

  await ErpAuditLog.logChange({
    entity_id: req.entityId,
    bdm_id: owner.ownerId,
    log_type: 'STATUS_CHANGE',
    target_ref: grn._id.toString(),
    target_model: 'GrnEntry',
    field_changed: 'status',
    new_value: 'PENDING',
    changed_by: req.user._id,
    note: source_type === 'INTERNAL_TRANSFER'
      ? `Internal transfer GRN ${grn_number} created with ${line_items.length} item(s); auto-Undertaking ${undertaking.undertaking_number} in DRAFT (BDM review)`
      : `GRN ${grn_number} created with ${line_items.length} item(s); auto-Undertaking ${undertaking.undertaking_number} in DRAFT (BDM review)`
  });

  // Phase G4.5b — audit proxy creation so Activity Monitor + Approval Hub can
  // surface it. Separate from the STATUS_CHANGE log above so filter queries for
  // log_type: 'PROXY_CREATE' return clean proxy-only rows.
  if (owner.isOnBehalf) {
    await ErpAuditLog.logChange({
      entity_id: req.entityId,
      bdm_id: owner.ownerId,
      log_type: 'PROXY_CREATE',
      target_ref: grn._id.toString(),
      target_model: 'GrnEntry',
      changed_by: req.user._id,
      note: `Proxy create: GRN ${grn_number} keyed by ${req.user.name || req.user._id} (${req.user.role}) on behalf of BDM ${owner.ownerId}. Auto-Undertaking ${undertaking.undertaking_number} inherits ownership.`
    }).catch(err => console.error('[createGrn] PROXY_CREATE audit failed (non-critical):', err.message));
  }

  res.status(201).json({
    success: true,
    data: grn,
    undertaking: {
      _id: undertaking._id,
      undertaking_number: undertaking.undertaking_number,
      status: undertaking.status
    },
    message: `GRN captured. Review and submit Undertaking ${undertaking.undertaking_number} to route for approval.`
  });
});

/**
 * POST /grn/:id/approve — Finance/Admin approves or rejects a GRN
 * On APPROVED: creates TransactionEvent + InventoryLedger entries atomically.
 */
/**
 * Pure core logic for GRN approval. Callable from:
 *   - approveGrn HTTP handler (wraps with its own session)
 *   - undertakingController.postSingleUndertaking (auto-approves GRN after
 *     Undertaking ACKNOWLEDGED in the same session)
 *
 * Does NOT call gateApproval or res.json — those belong to the HTTP layer.
 * Does NOT check Undertaking status — caller is responsible for that gate.
 *
 * @param {Object} opts
 * @param {ObjectId|string} opts.grnId
 * @param {ObjectId} opts.userId - approver/acknowledger
 * @param {mongoose.ClientSession} opts.session
 * @returns {Promise<Object>} the updated GRN document
 */
async function approveGrnCore({ grnId, userId, session }) {
  if (!grnId) throw new Error('approveGrnCore: grnId is required');
  if (!session) throw new Error('approveGrnCore: session is required');

  // eslint-disable-next-line vip-tenant/require-entity-filter -- callers (approveGrn HTTP handler + undertakingController.postSingleUndertaking) apply tenantFilter before passing grnId; grnId is unique
  const grn = await GrnEntry.findById(grnId).session(session);
  if (!grn) throw Object.assign(new Error('GRN not found'), { statusCode: 404 });
  if (grn.status !== 'PENDING') {
    throw Object.assign(new Error(`GRN is ${grn.status}, expected PENDING`), { statusCode: 400 });
  }

  // Phase G4.5g — defense-in-depth waybill gate. createGrn already requires
  // waybill_photo_url when GRN_SETTINGS.WAYBILL_REQUIRED=1, but this guard
  // re-checks at approval time so neither the direct approveGrn endpoint nor
  // the Undertaking-acknowledge cascade can post a GRN whose waybill went
  // missing (manual seed data, broken S3 URL, lookup flipped mid-cycle).
  const waybillRequired = await getGrnSetting(grn.entity_id, 'WAYBILL_REQUIRED', 1);
  if (waybillRequired && !grn.waybill_photo_url) {
    throw Object.assign(
      new Error('Cannot approve GRN without waybill photo. Ask the BDM to re-upload the waybill before acknowledging.'),
      { statusCode: 400 }
    );
  }

  const isInternalTransfer = grn.source_type === 'INTERNAL_TRANSFER' && grn.reassignment_id;
  const ledgerTxnType = isInternalTransfer ? 'TRANSFER_IN' : 'GRN';
  const eventType = isInternalTransfer ? 'STOCK_REASSIGNMENT_GRN' : 'GRN';

  const [event] = await TransactionEvent.create([{
    entity_id: grn.entity_id,
    bdm_id: grn.bdm_id,
    event_type: eventType,
    event_date: grn.grn_date,
    document_ref: grn._id.toString(),
    payload: { line_items: grn.line_items, reassignment_id: grn.reassignment_id || undefined },
    created_by: userId
  }], { session });

  for (const item of grn.line_items) {
    const qtyInSellingUnits = item.qty_selling_units || (item.qty * (item.conversion_factor || 1));
    await InventoryLedger.create([{
      entity_id: grn.entity_id,
      bdm_id: grn.bdm_id,
      warehouse_id: grn.warehouse_id || undefined,
      product_id: item.product_id,
      batch_lot_no: item.batch_lot_no,
      expiry_date: item.expiry_date,
      transaction_type: ledgerTxnType,
      qty_in: qtyInSellingUnits,
      qty_out: 0,
      event_id: event._id,
      recorded_by: userId
    }], { session });
  }

  if (grn.po_id) {
    // eslint-disable-next-line vip-tenant/require-entity-filter -- grn.po_id from same-entity-scoped grn above
    const po = await PurchaseOrder.findById(grn.po_id).session(session);
    if (po) {
      for (const item of grn.line_items) {
        if (item.po_line_index != null && po.line_items[item.po_line_index]) {
          po.line_items[item.po_line_index].qty_received =
            (po.line_items[item.po_line_index].qty_received || 0) + item.qty;
        } else {
          const poLine = po.line_items.find(l =>
            l.product_id && item.product_id &&
            l.product_id.toString() === item.product_id.toString()
          );
          if (poLine) poLine.qty_received = (poLine.qty_received || 0) + item.qty;
        }
      }
      const allReceived = po.line_items.every(l => (l.qty_received || 0) >= l.qty_ordered);
      const anyReceived = po.line_items.some(l => (l.qty_received || 0) > 0);
      if (allReceived) po.status = 'RECEIVED';
      else if (anyReceived) po.status = 'PARTIALLY_RECEIVED';
      await po.save({ session });
    }
  }

  if (isInternalTransfer) {
    const StockReassignment = require('../models/StockReassignment');
    // eslint-disable-next-line vip-tenant/require-entity-filter -- grn.reassignment_id from same-entity-scoped grn above
    const reassignment = await StockReassignment.findById(grn.reassignment_id).session(session);
    if (reassignment && reassignment.status === 'AWAITING_GRN') {
      reassignment.status = 'COMPLETED';
      reassignment.grn_id = grn._id;
      await reassignment.save({ session });
    }
  }

  grn.status = 'APPROVED';
  grn.reviewed_by = userId;
  grn.reviewed_at = new Date();
  grn.event_id = event._id;
  await grn.save({ session });

  return grn;
}

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

  // Phase 32R — require Undertaking ACKNOWLEDGED before direct GRN approval.
  // President can bypass (emergency override). Normal path: GRN captures on
  // submit → UT DRAFT auto-created → BDM reviews & submits UT → approver
  // acknowledges UT from the Approval Hub (cascade-approves the GRN).
  if (!req.isPresident) {
    const Undertaking = require('../models/Undertaking');
    // eslint-disable-next-line vip-tenant/require-entity-filter -- linked_grn_id is unique; grn fetched with entity-scoped tenantFilter upstream
    const ut = await Undertaking.findOne({ linked_grn_id: grn._id })
      .select('status undertaking_number')
      .lean();
    if (ut && ut.status !== 'ACKNOWLEDGED') {
      return res.status(400).json({
        success: false,
        message: `Undertaking ${ut.undertaking_number} is ${ut.status} — GRN posts only after its Undertaking is ACKNOWLEDGED. BDM must submit UT → approver acknowledges.`,
        data: { undertaking_id: ut._id, undertaking_number: ut.undertaking_number, undertaking_status: ut.status }
      });
    }
  }

  // Authority matrix gate
  const { gateApproval } = require('../services/approvalService');
  const grnTotal = (grn.line_items || []).reduce((sum, li) => sum + ((li.qty || 0) * (li.unit_cost || 0)), 0);
  const gated = await gateApproval({
    entityId: grn.entity_id,
    module: 'INVENTORY',
    docType: 'GRN',
    docId: grn._id,
    docRef: grn.grn_ref || grn._id.toString(),
    amount: grnTotal,
    description: `GRN ${grn.grn_ref || ''} — ${grn.supplier_name || ''}`.trim(),
    requesterId: req.user._id,
    requesterName: req.user.name || req.user.email,
  }, res);
  if (gated) return;

  // Period lock check
  const { checkPeriodOpen, dateToPeriod } = require('../utils/periodLock');
  const grnPeriod = dateToPeriod(grn.grn_date || new Date());
  await checkPeriodOpen(grn.entity_id, grnPeriod);

  const isInternalTransfer = grn.source_type === 'INTERNAL_TRANSFER' && grn.reassignment_id;

  const session = await mongoose.startSession();
  let updatedGrn;
  try {
    await session.withTransaction(async () => {
      updatedGrn = await approveGrnCore({ grnId: grn._id, userId: req.user._id, session });
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
      note: isInternalTransfer
        ? `Internal transfer GRN approved: ${grn.line_items.length} item(s) received via TRANSFER_IN`
        : `GRN approved: ${grn.line_items.length} item(s) added to inventory`
    });

    res.json({
      success: true,
      message: isInternalTransfer
        ? 'GRN approved — internal transfer completed'
        : 'GRN approved — stock updated',
      data: updatedGrn
    });
  } finally {
    await session.endSession();
  }
});

/**
 * GET /grn — List GRNs with status filter
 */
const getGrnList = catchAsync(async (req, res) => {
  // Phase G4.5b — proxy widens to all BDMs in the entity.
  const scope = await widenFilterForProxy(req, 'inventory', { subKey: 'grn_proxy_entry' });
  const filter = { ...scope };
  if (req.query.status) filter.status = req.query.status;
  if (req.query.po_id) filter.po_id = req.query.po_id;

  // Phase 6 — hide reversed rows by default; opt-in via ?include_reversed=true.
  if (req.query.include_reversed !== 'true') {
    filter.deletion_event_id = { $exists: false };
  }

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;
  const skip = (page - 1) * limit;

  const [grns, total] = await Promise.all([
    GrnEntry.find(filter)
      .populate('bdm_id', 'name email')
      .populate('recorded_on_behalf_of', 'name')
      .populate('reviewed_by', 'name')
      .populate('vendor_id', 'vendor_name vendor_code')
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

/**
 * GET /grn/for-po/:poId — Returns PO data pre-formatted for GRN creation
 * Used by frontend to auto-populate GRN form when receiving against a PO.
 */
const getGrnForPO = catchAsync(async (req, res) => {
  const po = await PurchaseOrder.findOne({ _id: req.params.poId, entity_id: req.entityId })
    .populate('vendor_id', 'vendor_name vendor_code')
    .populate('warehouse_id', 'warehouse_code warehouse_name')
    .lean();
  if (!po) return res.status(404).json({ success: false, message: 'Purchase order not found' });
  if (!['APPROVED', 'PARTIALLY_RECEIVED'].includes(po.status)) {
    return res.status(400).json({ success: false, message: `PO status is ${po.status} — only APPROVED or PARTIALLY_RECEIVED POs can receive goods` });
  }

  // Build prefill lines: one per PO line with remaining receivable qty
  const prefillLines = po.line_items.map((line, idx) => ({
    po_line_index: idx,
    product_id: line.product_id,
    item_key: line.item_key,
    qty_ordered: line.qty_ordered,
    qty_received: line.qty_received || 0,
    qty_remaining: (line.qty_ordered || 0) - (line.qty_received || 0),
    unit_price: line.unit_price,
    uom: line.uom,
    selling_uom: line.selling_uom,
    conversion_factor: line.conversion_factor || 1
  })).filter(l => l.qty_remaining > 0);

  res.json({
    success: true,
    data: {
      po_id: po._id,
      po_number: po.po_number,
      vendor_id: po.vendor_id,
      warehouse_id: po.warehouse_id,
      po_date: po.po_date,
      expected_delivery_date: po.expected_delivery_date,
      prefill_lines: prefillLines
    }
  });
});

// ═══ Phase 4 — Reorder & Expiry Alerts ═══

/**
 * GET /alerts — Expiry alerts + reorder alerts
 * Enriched with SAP-level reorder data (min qty, suggested order, lead time, order-by date).
 */
const getAlerts = catchAsync(async (req, res) => {
  // President/admin/finance: use query.bdm_id if provided, else null (entity-wide)
  const bdmId = (req.isAdmin || req.isFinance || req.isPresident)
    ? (req.query.bdm_id || null)
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

  // 1. Expiry alerts: batches expired or expiring within NEAR_EXPIRY_DAYS
  const now = new Date();
  const expiryAlerts = [];
  for (const item of rawStock) {
    if (item.available_qty > 0 && new Date(item.expiry_date) <= nearExpiryDate) {
      const daysRemaining = Math.ceil((new Date(item.expiry_date) - now) / (1000 * 60 * 60 * 24));
      expiryAlerts.push({
        product_id: item.product_id,
        batch_lot_no: item.batch_lot_no,
        expiry_date: item.expiry_date,
        days_remaining: daysRemaining,
        expired: daysRemaining <= 0,
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
  // eslint-disable-next-line vip-tenant/require-entity-filter -- expiryProductIds harvested from same-entity-scoped expiryAlerts; _id is globally unique
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

// ═══════════════════════════════════════════════════════════
// EXPIRY MANAGEMENT DASHBOARD — Phase 25
// ═══════════════════════════════════════════════════════════

const getExpiryDashboard = catchAsync(async (req, res) => {
  const bdmId = (req.isAdmin || req.isFinance || req.isPresident)
    ? (req.query.bdm_id || null)
    : req.bdmId;

  const warehouseId = req.query.warehouse_id;
  const opts = warehouseId ? { warehouseId } : undefined;

  const settings = await Settings.getSettings();
  const nearExpiryDays = settings.NEAR_EXPIRY_DAYS || 120;
  const now = new Date();

  const rawStock = await getMyStockAgg(req.entityId, bdmId, opts);

  // Bucket by expiry urgency
  const expired = [];
  const critical = [];   // < 30 days
  const warning = [];    // 30-90 days
  const caution = [];    // 90-nearExpiryDays

  for (const item of rawStock) {
    if (item.available_qty <= 0) continue;
    const expDate = new Date(item.expiry_date);
    const daysLeft = Math.ceil((expDate - now) / (1000 * 60 * 60 * 24));

    const entry = {
      product_id: item.product_id,
      batch_lot_no: item.batch_lot_no,
      expiry_date: item.expiry_date,
      days_remaining: daysLeft,
      available_qty: item.available_qty,
      warehouse_id: item.warehouse_id
    };

    if (daysLeft <= 0) expired.push(entry);
    else if (daysLeft <= 30) critical.push(entry);
    else if (daysLeft <= 90) warning.push(entry);
    else if (daysLeft <= nearExpiryDays) caution.push(entry);
  }

  // Enrich with product details
  const allEntries = [...expired, ...critical, ...warning, ...caution];
  const productIds = [...new Set(allEntries.map(e => e.product_id))];
  // eslint-disable-next-line vip-tenant/require-entity-filter -- productIds harvested from getMyStockAgg(req.entityId, ...); _id is globally unique
  const products = await ProductMaster.find({ _id: { $in: productIds } })
    .select('brand_name generic_name dosage_strength item_key').lean();
  const productMap = new Map(products.map(p => [p._id.toString(), p]));

  for (const entry of allEntries) {
    entry.product = productMap.get(entry.product_id.toString()) || {};
  }

  // Sort each bucket by days_remaining ASC
  expired.sort((a, b) => a.days_remaining - b.days_remaining);
  critical.sort((a, b) => a.days_remaining - b.days_remaining);
  warning.sort((a, b) => a.days_remaining - b.days_remaining);
  caution.sort((a, b) => a.days_remaining - b.days_remaining);

  // Compute total value at risk
  const totalValueAtRisk = [...expired, ...critical].reduce((sum, e) => sum + (e.available_qty * (e.unit_price || 0)), 0);

  res.json({
    success: true,
    data: { expired, critical, warning, caution },
    summary: {
      expired_count: expired.length,
      critical_count: critical.length,
      warning_count: warning.length,
      caution_count: caution.length,
      total_at_risk: expired.length + critical.length,
      near_expiry_days: nearExpiryDays
    }
  });
});

// ═══════════════════════════════════════════════════════════
// BATCH TRACEABILITY — Phase 25
// ═══════════════════════════════════════════════════════════

const getBatchTrace = catchAsync(async (req, res) => {
  const { productId, batchLotNo } = req.params;

  if (!productId || !batchLotNo) {
    return res.status(400).json({ success: false, message: 'productId and batchLotNo are required' });
  }

  const filter = {
    entity_id: req.entityId,
    product_id: new mongoose.Types.ObjectId(productId),
    batch_lot_no: cleanBatchNo(batchLotNo)
  };

  // Get all ledger entries for this batch
  const ledgerEntries = await InventoryLedger.find(filter)
    .populate('recorded_by', 'name')
    .populate('warehouse_id', 'warehouse_name')
    .sort({ recorded_at: 1 })
    .lean();

  if (!ledgerEntries.length) {
    return res.status(404).json({ success: false, message: 'No records found for this batch' });
  }

  // Get product details
  // eslint-disable-next-line vip-tenant/require-entity-filter -- productId reached this point only after entity-scoped ledger query at L1231 returned rows (404 short-circuits otherwise); product must belong to req.entityId by data invariant
  const product = await ProductMaster.findById(productId)
    .select('brand_name generic_name dosage_strength item_key')
    .lean();

  // Build trace timeline
  const timeline = ledgerEntries.map(entry => ({
    _id: entry._id,
    date: entry.recorded_at,
    type: entry.transaction_type,
    qty_in: entry.qty_in,
    qty_out: entry.qty_out,
    running_balance: entry.running_balance,
    warehouse: entry.warehouse_id?.warehouse_name || 'N/A',
    recorded_by: entry.recorded_by?.name || 'System',
    event_id: entry.event_id
  }));

  // Compute summary
  const totalIn = ledgerEntries.reduce((sum, e) => sum + (e.qty_in || 0), 0);
  const totalOut = ledgerEntries.reduce((sum, e) => sum + (e.qty_out || 0), 0);
  const currentBalance = ledgerEntries.length > 0 ? ledgerEntries[ledgerEntries.length - 1].running_balance : 0;
  const expiryDate = ledgerEntries[0]?.expiry_date;

  // Group by transaction type for breakdown
  const breakdown = {};
  for (const entry of ledgerEntries) {
    const t = entry.transaction_type;
    if (!breakdown[t]) breakdown[t] = { count: 0, qty_in: 0, qty_out: 0 };
    breakdown[t].count++;
    breakdown[t].qty_in += entry.qty_in || 0;
    breakdown[t].qty_out += entry.qty_out || 0;
  }

  res.json({
    success: true,
    data: {
      product,
      batch_lot_no: filter.batch_lot_no,
      expiry_date: expiryDate,
      timeline,
      summary: {
        total_received: totalIn,
        total_dispensed: totalOut,
        current_balance: currentBalance,
        first_receipt: ledgerEntries[0]?.recorded_at,
        last_movement: ledgerEntries[ledgerEntries.length - 1]?.recorded_at,
        transaction_count: ledgerEntries.length
      },
      breakdown
    }
  });
});

/**
 * POST /seed-stock-on-hand — Seed opening stock from CSV upload
 * Accepts multipart/form-data with a file field named 'file' (CSV or XLSX).
 * Matches products against existing ProductMaster — does NOT auto-create.
 */
const seedStockOnHand = catchAsync(async (req, res) => {
  const XLSX = require('xlsx');
  const { safeXlsxRead } = require('../../utils/safeXlsxRead');
  const { seedStockFromRows } = require('../services/stockSeedService');

  if (!req.file) {
    return res.status(400).json({ success: false, message: 'No file uploaded. Send as multipart/form-data with field name "file".' });
  }

  // Parse file (supports CSV and XLSX) — raw:false keeps values as strings
  const wb = safeXlsxRead(req.file.buffer, { type: 'buffer', raw: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false });

  if (!rows.length) {
    return res.status(400).json({ success: false, message: 'File is empty' });
  }

  // Detect warehouse code column
  const headers = Object.keys(rows[0]);
  const hasWarehouseCode = headers.includes('WarehouseCode') || headers.includes('Warehouse Code');

  const result = await seedStockFromRows(rows, { hasWarehouseCode });

  res.json({
    success: true,
    message: `Imported ${result.imported} entries, ${result.skipped} skipped, ${result.errors} unmatched`,
    data: result
  });
});

/**
 * PATCH /batches/correct-metadata — Fix typo in batch_lot_no / expiry_date
 * across every InventoryLedger row (IN/OUT/ADJUSTMENT) and the originating
 * GRN line for a batch the user already sees on stocks-on-hand.
 *
 * Gated by erpSubAccessCheck('inventory', 'edit_batch_metadata'). President
 * bypasses at middleware level. Non-privileged callers are hard-scoped to
 * their own bdm_id so they cannot rewrite another BDM's batches.
 *
 * Deliberately narrow: only batch_lot_no and expiry_date are editable.
 * Quantities, costs, and journal entries are untouched (no GL impact) —
 * physical count / President-Reverse GRN remain the paths for qty fixes.
 */
const correctBatchMetadata = catchAsync(async (req, res) => {
  const {
    product_id,
    old_batch_lot_no,
    new_batch_lot_no,
    new_expiry_date,
    warehouse_id,
    bdm_id: bodyBdmId,
    reason
  } = req.body;

  // Validation
  if (!product_id || !mongoose.isValidObjectId(product_id)) {
    return res.status(400).json({ success: false, message: 'product_id is required and must be a valid id' });
  }
  if (!old_batch_lot_no || !String(old_batch_lot_no).trim()) {
    return res.status(400).json({ success: false, message: 'old_batch_lot_no is required' });
  }
  if (!reason || !String(reason).trim()) {
    return res.status(400).json({ success: false, message: 'reason is required for audit' });
  }
  const hasNewBatch = new_batch_lot_no != null && String(new_batch_lot_no).trim() !== '';
  const hasNewExpiry = new_expiry_date != null && String(new_expiry_date).trim() !== '';
  if (!hasNewBatch && !hasNewExpiry) {
    return res.status(400).json({ success: false, message: 'Provide new_batch_lot_no and/or new_expiry_date' });
  }

  const normalizedOld = cleanBatchNo(old_batch_lot_no);
  const normalizedNew = hasNewBatch ? cleanBatchNo(new_batch_lot_no) : null;
  const parsedExpiry = hasNewExpiry ? new Date(new_expiry_date) : null;
  if (hasNewExpiry && isNaN(parsedExpiry?.getTime())) {
    return res.status(400).json({ success: false, message: 'new_expiry_date is not a valid date' });
  }

  // Scope — privileged users may target any bdm (entity-wide if omitted);
  // non-privileged users are pinned to their own bdm_id.
  const privileged = req.isAdmin || req.isFinance || req.isPresident;
  const effectiveBdmId = privileged ? (bodyBdmId || null) : req.bdmId;

  const scopeFilter = {
    entity_id: new mongoose.Types.ObjectId(req.entityId),
    product_id: new mongoose.Types.ObjectId(product_id),
    batch_lot_no: normalizedOld,
  };
  if (warehouse_id) {
    if (!mongoose.isValidObjectId(warehouse_id)) {
      return res.status(400).json({ success: false, message: 'warehouse_id is not a valid id' });
    }
    scopeFilter.warehouse_id = new mongoose.Types.ObjectId(warehouse_id);
  } else if (effectiveBdmId) {
    if (!mongoose.isValidObjectId(effectiveBdmId)) {
      return res.status(400).json({ success: false, message: 'bdm_id is not a valid id' });
    }
    scopeFilter.bdm_id = new mongoose.Types.ObjectId(effectiveBdmId);
  }

  // Confirm at least one matching ledger row exists and capture old expiry for audit
  const existing = await InventoryLedger.findOne(scopeFilter).select('batch_lot_no expiry_date').lean();
  if (!existing) {
    return res.status(404).json({ success: false, message: 'Batch not found in the current scope' });
  }

  // No-op detection — reject so the caller understands nothing changed
  const renaming = hasNewBatch && normalizedNew && normalizedNew !== normalizedOld;
  const expiryMs = parsedExpiry ? parsedExpiry.getTime() : null;
  const existingExpiryMs = existing.expiry_date ? new Date(existing.expiry_date).getTime() : null;
  const reExpiring = hasNewExpiry && expiryMs !== existingExpiryMs;
  if (!renaming && !reExpiring) {
    return res.status(400).json({ success: false, message: 'No changes requested (values match existing batch)' });
  }

  // Collision check: renaming into an already-used batch label in the same scope
  // would cause FEFO to merge two physically distinct lots — block it.
  if (renaming) {
    const collisionFilter = { ...scopeFilter, batch_lot_no: normalizedNew };
    const collision = await InventoryLedger.findOne(collisionFilter).select('_id').lean();
    if (collision) {
      return res.status(409).json({
        success: false,
        message: `Cannot rename: batch "${normalizedNew}" already exists for this product in the same scope. Two distinct batches cannot share a label.`
      });
    }
  }

  // Build the $set patch — only the fields actually changing
  const patch = {};
  if (renaming) patch.batch_lot_no = normalizedNew;
  if (reExpiring) patch.expiry_date = parsedExpiry;

  // Rewrite all ledger rows matching the scope. updateMany bypasses the
  // pre('save') immutability hook by design — this endpoint is the sanctioned
  // path for metadata corrections.
  const ledgerResult = await InventoryLedger.updateMany(scopeFilter, { $set: patch });

  // Patch the originating GRN line items for historical display consistency.
  // arrayFilters match the specific line by product_id + old batch_lot_no.
  // Entity-scoped. No status restriction — applies to PENDING and APPROVED alike.
  const grnArrayFilter = {
    'elem.product_id': new mongoose.Types.ObjectId(product_id),
    'elem.batch_lot_no': normalizedOld,
  };
  const grnSet = {};
  if (renaming) grnSet['line_items.$[elem].batch_lot_no'] = normalizedNew;
  if (reExpiring) grnSet['line_items.$[elem].expiry_date'] = parsedExpiry;

  const grnFilter = {
    entity_id: new mongoose.Types.ObjectId(req.entityId),
    'line_items.product_id': new mongoose.Types.ObjectId(product_id),
    'line_items.batch_lot_no': normalizedOld,
  };
  if (warehouse_id) grnFilter.warehouse_id = new mongoose.Types.ObjectId(warehouse_id);
  if (!privileged && req.bdmId) grnFilter.bdm_id = new mongoose.Types.ObjectId(req.bdmId);

  const grnResult = await GrnEntry.updateMany(grnFilter, { $set: grnSet }, { arrayFilters: [grnArrayFilter] });

  // Audit log — one entry per field changed. target_ref = "{product_id}:{old_batch}"
  // so the trail is queryable by batch identity even after the rename.
  const targetRef = `${product_id}:${normalizedOld}`;
  if (renaming) {
    await ErpAuditLog.logChange({
      entity_id: req.entityId,
      bdm_id: effectiveBdmId || req.bdmId,
      log_type: 'ITEM_CHANGE',
      target_ref: targetRef,
      target_model: 'InventoryLedger',
      field_changed: 'batch_lot_no',
      old_value: normalizedOld,
      new_value: normalizedNew,
      changed_by: req.user._id,
      note: `Batch metadata correction: ${reason}`,
    });
  }
  if (reExpiring) {
    await ErpAuditLog.logChange({
      entity_id: req.entityId,
      bdm_id: effectiveBdmId || req.bdmId,
      log_type: 'ITEM_CHANGE',
      target_ref: targetRef,
      target_model: 'InventoryLedger',
      field_changed: 'expiry_date',
      old_value: existing.expiry_date,
      new_value: parsedExpiry,
      changed_by: req.user._id,
      note: `Batch metadata correction: ${reason}`,
    });
  }

  res.json({
    success: true,
    message: 'Batch metadata corrected',
    data: {
      ledger_rows_updated: ledgerResult.modifiedCount || 0,
      grn_docs_updated: grnResult.modifiedCount || 0,
      old: { batch_lot_no: normalizedOld, expiry_date: existing.expiry_date },
      new: {
        batch_lot_no: renaming ? normalizedNew : normalizedOld,
        expiry_date: reExpiring ? parsedExpiry : existing.expiry_date,
      },
    },
  });
});

// President-only: SAP Storno reversal of an APPROVED GRN. PENDING/REJECTED rows
// are hard-deleted. Blocks if downstream POSTED docs (Sales, IC Transfers) have
// already consumed batches received via this GRN. See documentReversalService.js.
const { buildPresidentReverseHandler } = require('../services/documentReversalService');
const presidentReverseGrn = buildPresidentReverseHandler('GRN');

module.exports = {
  getMyStock,
  getBatches,
  getLedger,
  getVariance,
  recordPhysicalCount,
  correctBatchMetadata,
  createGrn,
  approveGrn,
  approveGrnCore, // Phase 32 — reusable core for auto-approve chain from Undertaking
  getGrnList,
  getGrnForPO,
  getAlerts,
  getExpiryDashboard,
  getBatchTrace,
  seedStockOnHand,
  presidentReverseGrn
};
