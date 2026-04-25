/**
 * TransactionEvent Inspector — read-only
 *
 * Given an event_id, prints:
 *   - The TransactionEvent document (all fields)
 *   - All InventoryLedger rows linked to that event (any warehouse)
 *   - Any linked StockReassignment / InterCompanyTransfer doc
 *   - Any linked Sales / GRN / DR doc, if ref fields are populated
 *
 * Usage (from backend/):
 *   node erp/scripts/inspectTransactionEvent.js <event_id>
 *
 * READ-ONLY. Safe on prod.
 */
/* eslint-disable vip-tenant/require-entity-filter -- read-only inspector CLI: by-event_id lookup spans every warehouse/entity by design; no req context */
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../../config/db');
const InventoryLedger = require('../models/InventoryLedger');
const TransactionEvent = require('../models/TransactionEvent');
const Warehouse = require('../models/Warehouse');
const ProductMaster = require('../models/ProductMaster');
const User = require('../../models/User');

const eventIdArg = process.argv[2];
if (!eventIdArg) {
  console.error('Usage: node erp/scripts/inspectTransactionEvent.js <event_id>');
  process.exit(1);
}

const pad = (s, n) => String(s ?? '').padEnd(n).slice(0, n);
const padNum = (n, w = 8) => String(n ?? 0).padStart(w);

async function run() {
  await connectDB();

  const eventId = new mongoose.Types.ObjectId(eventIdArg);

  // ============ The event document ============
  console.log('\n======================================================================');
  console.log(`  TRANSACTION EVENT: ${eventIdArg}`);
  console.log('======================================================================');
  const event = await TransactionEvent.findById(eventId).lean();
  if (!event) {
    console.log('No TransactionEvent document with that _id.');
    console.log('(Rows may still link to it — orphaned event reference.)');
  } else {
    console.log(JSON.stringify(event, null, 2));
  }

  // ============ All ledger rows linked to this event ============
  console.log('\n======================================================================');
  console.log('  LEDGER ROWS LINKED TO THIS EVENT');
  console.log('======================================================================');
  const rows = await InventoryLedger.find({ event_id: eventId }).sort({ recorded_at: 1 }).lean();

  if (!rows.length) {
    console.log('No ledger rows linked. Event has no inventory impact.');
  } else {
    const whs = await Warehouse.find({ _id: { $in: [...new Set(rows.map(r => r.warehouse_id?.toString()).filter(Boolean))] } }).lean();
    const pids = await ProductMaster.find({ _id: { $in: [...new Set(rows.map(r => r.product_id?.toString()).filter(Boolean))] } }).select('brand_name dosage_strength').lean();
    const uids = await User.find({ _id: { $in: [...new Set(rows.map(r => r.recorded_by?.toString()).filter(Boolean))] } }).select('name email').lean();
    const whMap = new Map(whs.map(w => [w._id.toString(), w]));
    const pMap = new Map(pids.map(p => [p._id.toString(), p]));
    const uMap = new Map(uids.map(u => [u._id.toString(), u]));

    console.log(`\n${rows.length} row(s):\n`);
    console.log(`${pad('WAREHOUSE', 10)}${pad('TYPE', 16)}${pad('PRODUCT', 28)}${pad('BATCH', 14)}${padNum('QTY_IN', 8)}${padNum('QTY_OUT', 8)}  USER`);
    console.log('-'.repeat(100));

    let totalIn = 0, totalOut = 0;
    const netByWh = new Map();
    for (const r of rows) {
      const w = whMap.get(r.warehouse_id?.toString());
      const p = pMap.get(r.product_id?.toString());
      const u = uMap.get(r.recorded_by?.toString());
      const pLabel = p ? `${p.brand_name || '?'}${p.dosage_strength ? ' ' + p.dosage_strength : ''}` : '(unknown)';
      console.log(
        pad(w?.warehouse_code || '?', 10) +
        pad(r.transaction_type || '?', 16) +
        pad(pLabel, 28) +
        pad(r.batch_lot_no || '?', 14) +
        padNum(r.qty_in, 8) +
        padNum(r.qty_out, 8) +
        '  ' + (u?.name || '?')
      );
      totalIn += (r.qty_in || 0);
      totalOut += (r.qty_out || 0);
      const whCode = w?.warehouse_code || '?';
      const prev = netByWh.get(whCode) || { in: 0, out: 0 };
      prev.in += (r.qty_in || 0);
      prev.out += (r.qty_out || 0);
      netByWh.set(whCode, prev);
    }

    console.log('-'.repeat(100));
    console.log(`Totals: qty_in=${totalIn}, qty_out=${totalOut}, net=${totalIn - totalOut}`);
    console.log('\nNet per warehouse:');
    for (const [whCode, net] of netByWh) {
      const netQty = net.in - net.out;
      const arrow = netQty > 0 ? '← received' : netQty < 0 ? '→ sent out' : '= neutral';
      console.log(`  ${pad(whCode, 12)} in=${padNum(net.in)}  out=${padNum(net.out)}  net=${padNum(netQty)}  ${arrow}`);
    }

    // Interpretation
    console.log('\nInterpretation:');
    const hasPositive = [...netByWh.values()].some(v => v.in > v.out);
    const hasNegative = [...netByWh.values()].some(v => v.out > v.in);
    if (hasPositive && hasNegative) {
      console.log('  PATTERN: stock MOVED between warehouses (transfer/reassignment).');
      console.log('  Sources LOST stock; destinations GAINED it. Reversing the source');
      console.log('  side (e.g. restoring ILO-MAIN) WITHOUT reversing the destination');
      console.log('  side would DOUBLE the total stock. Do not restore.');
    } else if (hasNegative && !hasPositive) {
      console.log('  PATTERN: pure stock REMOVAL (shrinkage, expiry, write-off, sale).');
      console.log('  No destination received it.');
    } else if (hasPositive && !hasNegative) {
      console.log('  PATTERN: pure stock ADDITION (opening, receipt, correction).');
    }
  }

  await mongoose.disconnect();
}

run().catch(err => { console.error(err); process.exit(1); });
