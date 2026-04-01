/**
 * FIFO Engine — First Expiry, First Out
 *
 * All functions are read-only (no DB writes). They return consumption PLANS.
 * The caller (salesController.submitSales) creates InventoryLedger entries.
 */
const mongoose = require('mongoose');
const InventoryLedger = require('../models/InventoryLedger');
const { cleanBatchNo } = require('../utils/normalize');

/**
 * Get all batches with available stock for a specific product,
 * sorted by expiry date ascending (oldest/nearest expiry first = FEFO).
 *
 * @param {ObjectId|string} entityId
 * @param {ObjectId|string} bdmId
 * @param {ObjectId|string} productId
 * @returns {Array<{ batch_lot_no, expiry_date, available_qty }>}
 */
const getAvailableBatches = async (entityId, bdmId, productId) => {
  const result = await InventoryLedger.aggregate([
    {
      $match: {
        entity_id: new mongoose.Types.ObjectId(entityId),
        bdm_id: new mongoose.Types.ObjectId(bdmId),
        product_id: new mongoose.Types.ObjectId(productId)
      }
    },
    {
      $group: {
        _id: { batch_lot_no: '$batch_lot_no', expiry_date: '$expiry_date' },
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
    { $sort: { '_id.expiry_date': 1 } },
    {
      $project: {
        _id: 0,
        batch_lot_no: '$_id.batch_lot_no',
        expiry_date: '$_id.expiry_date',
        available_qty: 1
      }
    }
  ]);

  return result;
};

/**
 * Create a FIFO consumption plan for the requested quantity.
 * Consumes from oldest expiry first. Does NOT write to DB.
 *
 * @param {ObjectId|string} entityId
 * @param {ObjectId|string} bdmId
 * @param {ObjectId|string} productId
 * @param {number} qty - Total quantity to consume
 * @returns {Array<{ batch_lot_no, expiry_date, qty_consumed }>}
 * @throws {Error} INSUFFICIENT_STOCK if total available < qty
 */
const consumeFIFO = async (entityId, bdmId, productId, qty) => {
  const batches = await getAvailableBatches(entityId, bdmId, productId);

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
      qty_consumed: take
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
const consumeSpecificBatch = async (entityId, bdmId, productId, batchLotNo, qty) => {
  const normalized = cleanBatchNo(batchLotNo);

  const result = await InventoryLedger.aggregate([
    {
      $match: {
        entity_id: new mongoose.Types.ObjectId(entityId),
        bdm_id: new mongoose.Types.ObjectId(bdmId),
        product_id: new mongoose.Types.ObjectId(productId),
        batch_lot_no: normalized
      }
    },
    {
      $group: {
        _id: { batch_lot_no: '$batch_lot_no', expiry_date: '$expiry_date' },
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
    qty_consumed: qty
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
const getMyStock = async (entityId, bdmId) => {
  const match = { entity_id: new mongoose.Types.ObjectId(entityId) };
  if (bdmId) match.bdm_id = new mongoose.Types.ObjectId(bdmId);

  const result = await InventoryLedger.aggregate([
    { $match: match },
    {
      $group: {
        _id: {
          product_id: '$product_id',
          batch_lot_no: '$batch_lot_no',
          expiry_date: '$expiry_date'
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
const buildStockSnapshot = async (entityId, bdmId) => {
  const stock = await getMyStock(entityId, bdmId);
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
