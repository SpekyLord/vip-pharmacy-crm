/**
 * Stock Visibility Diagnostic — read-only
 *
 * Prints:
 *   1. Warehouse summary (per entity, with manager)
 *   2. InventoryLedger row counts per warehouse + transaction_type breakdown
 *   3. Pre-Phase-17 stranded rows (no warehouse_id)
 *   4. ProductMaster count per entity
 *   5. Live stock-on-hand per warehouse (distinct products with positive balance)
 *
 * Usage: node backend/erp/scripts/diagnoseStockVisibility.js
 *
 * READ-ONLY — no writes. Safe to run on prod.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../../config/db');
const InventoryLedger = require('../models/InventoryLedger');
const ProductMaster = require('../models/ProductMaster');
const Warehouse = require('../models/Warehouse');
const Entity = require('../models/Entity');
const User = require('../../models/User');

const pad = (s, n) => String(s ?? '').padEnd(n).slice(0, n);
const padNum = (n, w = 8) => String(n ?? 0).padStart(w);

async function run() {
  await connectDB();

  const entities = await Entity.find({}).lean();
  const entityMap = new Map(entities.map(e => [e._id.toString(), e]));

  // ============ 1. Warehouses ============
  console.log('\n============================================================');
  console.log('  1. WAREHOUSES');
  console.log('============================================================');
  const warehouses = await Warehouse.find({}).lean();
  const whMap = new Map(warehouses.map(w => [w._id.toString(), w]));

  const managerIds = warehouses.filter(w => w.manager_id).map(w => w.manager_id);
  const users = await User.find({ _id: { $in: managerIds } }).select('_id name email').lean();
  const userMap = new Map(users.map(u => [u._id.toString(), u]));

  console.log(pad('CODE', 12) + pad('NAME', 30) + pad('ENTITY', 10) + pad('MANAGER', 30) + 'ACTIVE');
  console.log('-'.repeat(90));
  for (const w of warehouses) {
    const ent = entityMap.get(w.entity_id?.toString());
    const mgr = w.manager_id ? userMap.get(w.manager_id.toString()) : null;
    console.log(
      pad(w.warehouse_code, 12) +
      pad(w.warehouse_name, 30) +
      pad(ent?.short_name || ent?.name || '?', 10) +
      pad(mgr?.name || '(none)', 30) +
      (w.is_active ? 'YES' : 'no')
    );
  }

  // ============ 2. Ledger rows per warehouse ============
  console.log('\n============================================================');
  console.log('  2. INVENTORY LEDGER — ROWS PER WAREHOUSE');
  console.log('============================================================');
  const ledgerByWh = await InventoryLedger.aggregate([
    { $group: { _id: '$warehouse_id', rows: { $sum: 1 } } },
    { $sort: { rows: -1 } },
  ]);

  console.log(pad('WAREHOUSE', 20) + padNum('ROWS'));
  console.log('-'.repeat(30));
  for (const row of ledgerByWh) {
    const w = row._id ? whMap.get(row._id.toString()) : null;
    const label = w ? w.warehouse_code : (row._id ? `(unknown: ${row._id})` : '(no warehouse_id)');
    console.log(pad(label, 20) + padNum(row.rows));
  }

  // ============ 3. Pre-Phase-17 stranded rows ============
  console.log('\n============================================================');
  console.log('  3. PRE-PHASE-17 STRANDED ROWS (no warehouse_id)');
  console.log('============================================================');
  const strandedMissing = await InventoryLedger.countDocuments({ warehouse_id: { $exists: false } });
  const strandedNull = await InventoryLedger.countDocuments({ warehouse_id: null });
  const totalLedger = await InventoryLedger.countDocuments({});
  console.log(`warehouse_id missing (field not set): ${strandedMissing}`);
  console.log(`warehouse_id explicitly null:         ${strandedNull}`);
  console.log(`total ledger rows:                     ${totalLedger}`);
  if (strandedMissing + strandedNull > 0) {
    console.log('\n  ACTION: run `node backend/erp/scripts/migrateWarehouses.js` to backfill.');
  } else {
    console.log('\n  OK: no stranded rows — all entries have warehouse_id.');
  }

  // ============ 4. Ledger breakdown by transaction_type per warehouse ============
  console.log('\n============================================================');
  console.log('  4. LEDGER BY WAREHOUSE × TRANSACTION_TYPE');
  console.log('============================================================');
  const byWhType = await InventoryLedger.aggregate([
    { $group: { _id: { wh: '$warehouse_id', type: '$transaction_type' }, rows: { $sum: 1 }, qty_in: { $sum: '$qty_in' }, qty_out: { $sum: '$qty_out' } } },
    { $sort: { '_id.wh': 1, '_id.type': 1 } },
  ]);
  console.log(pad('WAREHOUSE', 16) + pad('TXN_TYPE', 22) + padNum('ROWS') + padNum('QTY_IN') + padNum('QTY_OUT'));
  console.log('-'.repeat(70));
  for (const r of byWhType) {
    const w = r._id.wh ? whMap.get(r._id.wh.toString()) : null;
    const label = w ? w.warehouse_code : (r._id.wh ? '(unknown)' : '(no warehouse_id)');
    console.log(
      pad(label, 16) +
      pad(r._id.type || '?', 22) +
      padNum(r.rows) +
      padNum(r.qty_in) +
      padNum(r.qty_out)
    );
  }

  // ============ 5. ProductMaster per entity ============
  console.log('\n============================================================');
  console.log('  5. PRODUCT MASTER — COUNT PER ENTITY');
  console.log('============================================================');
  const productsByEntity = await ProductMaster.aggregate([
    { $group: { _id: '$entity_id', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);
  console.log(pad('ENTITY', 20) + padNum('PRODUCTS'));
  console.log('-'.repeat(30));
  for (const row of productsByEntity) {
    const ent = row._id ? entityMap.get(row._id.toString()) : null;
    const label = ent ? (ent.short_name || ent.name) : '(no entity_id)';
    console.log(pad(label, 20) + padNum(row.count));
  }

  // ============ 6. Live stock-on-hand per warehouse (distinct products with qty > 0) ============
  console.log('\n============================================================');
  console.log('  6. LIVE STOCK-ON-HAND PER WAREHOUSE (products with available > 0)');
  console.log('============================================================');
  const liveStock = await InventoryLedger.aggregate([
    { $match: { warehouse_id: { $ne: null } } },
    { $group: {
      _id: { wh: '$warehouse_id', product: '$product_id', batch: '$batch_lot_no' },
      qty_in: { $sum: '$qty_in' },
      qty_out: { $sum: '$qty_out' },
    } },
    { $addFields: { available: { $subtract: ['$qty_in', '$qty_out'] } } },
    { $match: { available: { $gt: 0 } } },
    { $group: { _id: '$_id.wh', distinct_products: { $addToSet: '$_id.product' }, batch_rows: { $sum: 1 }, total_qty: { $sum: '$available' } } },
    { $project: { distinct_product_count: { $size: '$distinct_products' }, batch_rows: 1, total_qty: 1 } },
    { $sort: { batch_rows: -1 } },
  ]);
  console.log(pad('WAREHOUSE', 16) + padNum('PRODUCTS', 10) + padNum('BATCHES', 10) + padNum('TOTAL_QTY', 12));
  console.log('-'.repeat(50));
  for (const r of liveStock) {
    const w = whMap.get(r._id.toString());
    console.log(
      pad(w?.warehouse_code || '(unknown)', 16) +
      padNum(r.distinct_product_count, 10) +
      padNum(r.batch_rows, 10) +
      padNum(r.total_qty, 12)
    );
  }
  if (!liveStock.length) {
    console.log('  (no warehouse has positive stock — Sales Entry dropdown will be empty for every user)');
  }

  console.log('\n============================================================');
  console.log('  DONE');
  console.log('============================================================\n');

  await mongoose.disconnect();
}

run().catch(err => {
  console.error('Diagnostic failed:', err);
  process.exit(1);
});
