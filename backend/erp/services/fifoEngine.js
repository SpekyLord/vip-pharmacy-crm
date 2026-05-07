/**
 * FIFO Engine — First Expiry, First Out
 *
 * All functions are read-only (no DB writes). They return consumption PLANS.
 * The caller (salesController.submitSales) creates InventoryLedger entries.
 *
 * Phase 17: All functions accept optional opts.warehouseId.
 * When provided, queries filter by warehouse_id instead of (or alongside) bdm_id.
 * Backward-compatible: existing callers without opts keep working.
 */
const mongoose = require('mongoose');
const InventoryLedger = require('../models/InventoryLedger');
const { cleanBatchNo } = require('../utils/normalize');

/**
 * Build the $match filter for inventory queries.
 *
 * Phase 32R-Transfer-Stock-Scope (May 07 2026): switched from XOR (warehouse_id
 * wins, bdm_id ignored) to AND (both filters intersect) when BOTH are provided.
 * Rationale: shared warehouses (e.g. "ACC — Shared Services") can hold stock
 * from multiple BDMs. Under the old XOR, a query "BDM X's stock at warehouse Y"
 * would return ANY BDM's stock at Y, leaking cross-BDM visibility AND letting
 * consume-side flows touch the wrong owner's rows. AND is semantically correct
 * for IST product-dropdown filtering and a strict superset of safety on the
 * consume side: each InventoryLedger row carries a single (bdm_id, warehouse_id)
 * pair, so when the caller already knows both, intersecting them only filters
 * out rows that did not match anyway.
 *
 * Backwards-compatible: callers passing only bdmId, only warehouseId, or
 * neither, get the same match they got before.
 *
 * @param {string} entityId
 * @param {string} bdmId
 * @param {Object} [opts] - { warehouseId }
 * @param {string} [productId]
 */
const buildStockMatch = (entityId, bdmId, opts, productId) => {
  const match = { entity_id: new mongoose.Types.ObjectId(entityId) };
  if (bdmId) {
    match.bdm_id = new mongoose.Types.ObjectId(bdmId);
  }
  if (opts?.warehouseId) {
    match.warehouse_id = new mongoose.Types.ObjectId(opts.warehouseId);
  }
  if (productId) {
    match.product_id = new mongoose.Types.ObjectId(productId);
  }
  return match;
};

/**
 * Get all batches with available stock for a specific product,
 * sorted by expiry date ascending (oldest/nearest expiry first = FEFO).
 *
 * @param {ObjectId|string} entityId
 * @param {ObjectId|string} bdmId
 * @param {ObjectId|string} productId
 * @returns {Array<{ batch_lot_no, expiry_date, available_qty }>}
 */
const getAvailableBatches = async (entityId, bdmId, productId, opts) => {
  const pipeline = [
    { $match: buildStockMatch(entityId, bdmId, opts, productId) },
    {
      $group: {
        _id: { batch_lot_no: '$batch_lot_no', expiry_date: '$expiry_date', bdm_id: '$bdm_id' },
        total_in: { $sum: '$qty_in' },
        total_out: { $sum: '$qty_out' }
      }
    },
    {
      $addFields: {
        available_qty: { $subtract: ['$total_in', '$total_out'] }
      }
    },
    { $match: { available_qty: { $gt: 0 } } },
    // Filter out expired batches — pharmaceutical compliance (FEFO)
    { $match: { '_id.expiry_date': { $gt: new Date() } } },
    { $sort: { '_id.expiry_date': 1 } },
    {
      $project: {
        _id: 0,
        batch_lot_no: '$_id.batch_lot_no',
        expiry_date: '$_id.expiry_date',
        bdm_id: '$_id.bdm_id',
        available_qty: 1
      }
    }
  ];

  // Use session for transactional consistency if provided
  const agg = InventoryLedger.aggregate(pipeline);
  if (opts?.session) agg.session(opts.session);
  return agg;
};

/**
 * Create a FIFO consumption plan for the requested quantity.
 * Consumes from oldest expiry first. Does NOT write to DB.
 *
 * @param {ObjectId|string} entityId
 * @param {ObjectId|string} bdmId
 * @param {ObjectId|string} productId
 * @param {number} qty - Total quantity to consume
 * @returns {Array<{ batch_lot_no, expiry_date, qty_consumed, bdm_id }>}
 * @throws {Error} INSUFFICIENT_STOCK if total available < qty
 */
const consumeFIFO = async (entityId, bdmId, productId, qty, opts) => {
  const batches = await getAvailableBatches(entityId, bdmId, productId, opts);

  const totalAvailable = batches.reduce((sum, b) => sum + b.available_qty, 0);
  if (totalAvailable < qty) {
    const err = new Error('Insufficient stock');
    err.code = 'INSUFFICIENT_STOCK';
    err.available = totalAvailable;
    err.requested = qty;
    throw err;
  }

  const consumed = [];
  let remaining = qty;

  for (const batch of batches) {
    if (remaining <= 0) break;

    const take = Math.min(batch.available_qty, remaining);
    consumed.push({
      batch_lot_no: batch.batch_lot_no,
      expiry_date: batch.expiry_date,
      qty_consumed: take,
      bdm_id: batch.bdm_id
    });
    remaining -= take;
  }

  return consumed;
};

/**
 * Create a consumption plan for a specific batch (FIFO override).
 *
 * @param {ObjectId|string} entityId
 * @param {ObjectId|string} bdmId
 * @param {ObjectId|string} productId
 * @param {string} batchLotNo - Specific batch to consume from
 * @param {number} qty
 * @returns {{ batch_lot_no, expiry_date, qty_consumed }}
 * @throws {Error} INSUFFICIENT_STOCK if batch doesn't have enough
 */
const consumeSpecificBatch = async (entityId, bdmId, productId, batchLotNo, qty, opts) => {
  const normalized = cleanBatchNo(batchLotNo);

  const match = buildStockMatch(entityId, bdmId, opts, productId);
  match.batch_lot_no = normalized;

  // eslint-disable-next-line vip-tenant/require-entity-filter -- entity_id is always set in match by buildStockMatch() at L24 (linter can't trace through helper builder)
  const agg = InventoryLedger.aggregate([
    { $match: match },
    {
      $group: {
        _id: { batch_lot_no: '$batch_lot_no', expiry_date: '$expiry_date', bdm_id: '$bdm_id' },
        total_in: { $sum: '$qty_in' },
        total_out: { $sum: '$qty_out' }
      }
    },
    {
      $addFields: {
        available_qty: { $subtract: ['$total_in', '$total_out'] }
      }
    }
  ]);
  // Apply session for transactional consistency if provided
  if (opts?.session) agg.session(opts.session);
  const result = await agg;

  if (!result.length || result[0].available_qty < qty) {
    const err = new Error('Insufficient stock in specified batch');
    err.code = 'INSUFFICIENT_STOCK';
    err.available = result.length ? result[0].available_qty : 0;
    err.requested = qty;
    err.batch_lot_no = normalized;
    throw err;
  }

  return {
    batch_lot_no: result[0]._id.batch_lot_no,
    expiry_date: result[0]._id.expiry_date,
    qty_consumed: qty,
    bdm_id: result[0]._id.bdm_id
  };
};

/**
 * Get full stock-on-hand for a BDM across all products.
 * Used by My Stock page and product dropdown (only show in-stock products).
 *
 * @param {ObjectId|string} entityId
 * @param {ObjectId|string} bdmId
 * @returns {Array<{ product_id, batch_lot_no, expiry_date, available_qty }>}
 */
const getMyStock = async (entityId, bdmId, opts) => {
  const match = buildStockMatch(entityId, bdmId, opts);

  // eslint-disable-next-line vip-tenant/require-entity-filter -- entity_id is always set in match by buildStockMatch() at L24 (linter can't trace through helper builder)
  const result = await InventoryLedger.aggregate([
    { $match: match },
    {
      $group: {
        _id: {
          product_id: '$product_id',
          batch_lot_no: '$batch_lot_no',
          expiry_date: '$expiry_date',
          bdm_id: '$bdm_id'
        },
        total_in: { $sum: '$qty_in' },
        total_out: { $sum: '$qty_out' }
      }
    },
    {
      $addFields: {
        available_qty: { $subtract: ['$total_in', '$total_out'] }
      }
    },
    { $match: { available_qty: { $gt: 0 } } },
    { $sort: { '_id.product_id': 1, '_id.expiry_date': 1 } },
    {
      $project: {
        _id: 0,
        product_id: '$_id.product_id',
        batch_lot_no: '$_id.batch_lot_no',
        expiry_date: '$_id.expiry_date',
        bdm_id: '$_id.bdm_id',
        available_qty: 1
      }
    }
  ]);

  return result;
};

/**
 * Build an in-memory stock snapshot for validation.
 * Returns a Map: "productId|batchLotNo" → available_qty
 * Used by validateSales to deduct from snapshot per row.
 */
const buildStockSnapshot = async (entityId, bdmId, opts) => {
  const stock = await getMyStock(entityId, bdmId, opts);
  const snapshot = new Map();

  for (const item of stock) {
    const key = `${item.product_id}|${item.batch_lot_no}`;
    snapshot.set(key, (snapshot.get(key) || 0) + item.available_qty);
  }

  // Also build a product-level total for FIFO consumption checks
  const productTotals = new Map();
  for (const item of stock) {
    const pid = item.product_id.toString();
    productTotals.set(pid, (productTotals.get(pid) || 0) + item.available_qty);
  }

  return { snapshot, productTotals };
};

module.exports = {
  getAvailableBatches,
  consumeFIFO,
  consumeSpecificBatch,
  getMyStock,
  buildStockSnapshot
};
