/**
 * ILO-MAIN ADJUSTMENT Trace — read-only
 *
 * Prints every ADJUSTMENT ledger entry for ILO-MAIN with:
 *   - recorded_at timestamp
 *   - who recorded it (user name + email)
 *   - qty_in / qty_out
 *   - product brand + batch
 *   - override_reason (if any)
 *   - linked TransactionEvent summary (if any)
 *
 * Usage (from backend/ directory):
 *   node erp/scripts/diagnoseIloMainAdjustments.js
 *
 * READ-ONLY — safe on prod.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../../config/db');
const InventoryLedger = require('../models/InventoryLedger');
const ProductMaster = require('../models/ProductMaster');
const Warehouse = require('../models/Warehouse');
const User = require('../../models/User');
const TransactionEvent = require('../models/TransactionEvent');

const pad = (s, n) => String(s ?? '').padEnd(n).slice(0, n);
const padNum = (n, w = 8) => String(n ?? 0).padStart(w);

async function run() {
  await connectDB();

  const wh = await Warehouse.findOne({ warehouse_code: 'ILO-MAIN' }).lean();
  if (!wh) {
    console.log('ILO-MAIN warehouse not found.');
    await mongoose.disconnect();
    return;
  }

  console.log(`\nWarehouse: ${wh.warehouse_code} — ${wh.warehouse_name}`);
  console.log(`Entity:    ${wh.entity_id}`);
  console.log(`Manager:   ${wh.manager_id}\n`);

  const rows = await InventoryLedger.find({
    warehouse_id: wh._id,
  }).sort({ recorded_at: 1 }).lean();

  const userIds = [...new Set(rows.map(r => r.recorded_by?.toString()).filter(Boolean))];
  const productIds = [...new Set(rows.map(r => r.product_id?.toString()).filter(Boolean))];
  const eventIds = [...new Set(rows.map(r => r.event_id?.toString()).filter(Boolean))];

  const [users, products, events] = await Promise.all([
    User.find({ _id: { $in: userIds } }).select('_id name email').lean(),
    ProductMaster.find({ _id: { $in: productIds } }).select('_id brand_name dosage_strength').lean(),
    TransactionEvent.find({ _id: { $in: eventIds } }).select('_id doc_type doc_ref').lean(),
  ]);
  const uMap = new Map(users.map(u => [u._id.toString(), u]));
  const pMap = new Map(products.map(p => [p._id.toString(), p]));
  const eMap = new Map(events.map(e => [e._id.toString(), e]));

  console.log('==============================================================================================');
  console.log('  ALL ILO-MAIN LEDGER ENTRIES (chronological)');
  console.log('==============================================================================================');
  console.log(
    pad('DATE (UTC)', 22) +
    pad('TYPE', 18) +
    pad('USER', 22) +
    padNum('QTY_IN', 8) +
    padNum('QTY_OUT', 8) +
    '  ' + pad('PRODUCT', 30) + pad('BATCH', 14) + pad('EVENT', 30) + 'REASON'
  );
  console.log('-'.repeat(180));

  for (const r of rows) {
    const u = uMap.get(r.recorded_by?.toString());
    const p = pMap.get(r.product_id?.toString());
    const e = eMap.get(r.event_id?.toString());
    const productLabel = p ? `${p.brand_name || '?'}${p.dosage_strength ? ' ' + p.dosage_strength : ''}` : '(unknown)';
    const eventLabel = e ? `${e.doc_type || '?'} ${e.doc_ref || ''}`.trim() : '(no event)';
    console.log(
      pad(r.recorded_at?.toISOString() || '?', 22) +
      pad(r.transaction_type || '?', 18) +
      pad(u?.name || u?.email || '(unknown user)', 22) +
      padNum(r.qty_in, 8) +
      padNum(r.qty_out, 8) +
      '  ' + pad(productLabel, 30) + pad(r.batch_lot_no || '?', 14) + pad(eventLabel, 30) + (r.override_reason || '')
    );
  }

  console.log('\n==============================================================================================');
  console.log('  SUMMARY');
  console.log('==============================================================================================');
  const totalIn = rows.reduce((s, r) => s + (r.qty_in || 0), 0);
  const totalOut = rows.reduce((s, r) => s + (r.qty_out || 0), 0);
  console.log(`Total qty_in:  ${totalIn}`);
  console.log(`Total qty_out: ${totalOut}`);
  console.log(`Net balance:   ${totalIn - totalOut}`);

  await mongoose.disconnect();
}

run().catch(err => { console.error(err); process.exit(1); });
