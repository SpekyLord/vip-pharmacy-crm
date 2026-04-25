/* eslint-disable vip-tenant/require-entity-filter -- standalone admin/migration/diagnostic script: no req context; intentional cross-entity reads/writes for ops work */
/**
 * Suspect ADJUSTMENT Forensics — read-only
 *
 * Finds ALL ADJUSTMENT entries across ALL warehouses that match the
 * "accidental zero-out" fingerprint:
 *   - no event_id (not linked to a GRN / CSI / Transfer / etc.)
 *   - blank/null override_reason
 *
 * Groups them by (user, minute-bucket of recorded_at) so you can see
 * batch operations as clusters. Legitimate adjustments typically have
 * EITHER an event_id OR a reason — suspect ones have neither.
 *
 * Usage (from backend/):
 *   node erp/scripts/findSuspectAdjustments.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../../config/db');
const InventoryLedger = require('../models/InventoryLedger');
const ProductMaster = require('../models/ProductMaster');
const Warehouse = require('../models/Warehouse');
const User = require('../../models/User');

const pad = (s, n) => String(s ?? '').padEnd(n).slice(0, n);
const padNum = (n, w = 8) => String(n ?? 0).padStart(w);

async function run() {
  await connectDB();

  // Suspect fingerprint: ADJUSTMENT with no event_id AND blank/null override_reason
  const suspects = await InventoryLedger.find({
    transaction_type: 'ADJUSTMENT',
    $and: [
      { $or: [{ event_id: { $exists: false } }, { event_id: null }] },
      { $or: [{ override_reason: { $exists: false } }, { override_reason: null }, { override_reason: '' }] },
    ],
  }).sort({ recorded_at: 1 }).lean();

  // Also find legitimate adjustments for comparison (has event_id OR has reason)
  const legit = await InventoryLedger.find({
    transaction_type: 'ADJUSTMENT',
    $or: [
      { event_id: { $ne: null, $exists: true } },
      { override_reason: { $regex: /\S/ } },
    ],
  }).lean();

  const warehouses = await Warehouse.find({}).lean();
  const whMap = new Map(warehouses.map(w => [w._id.toString(), w]));

  const userIds = [...new Set([...suspects, ...legit].map(r => r.recorded_by?.toString()).filter(Boolean))];
  const users = await User.find({ _id: { $in: userIds } }).select('_id name email').lean();
  const uMap = new Map(users.map(u => [u._id.toString(), u]));

  const productIds = [...new Set([...suspects, ...legit].map(r => r.product_id?.toString()).filter(Boolean))];
  const products = await ProductMaster.find({ _id: { $in: productIds } }).select('_id brand_name dosage_strength').lean();
  const pMap = new Map(products.map(p => [p._id.toString(), p]));

  // ============ SUSPECT CLUSTERS ============
  console.log('\n======================================================================');
  console.log(`  SUSPECT ADJUSTMENTS (no event_id, no reason): ${suspects.length}`);
  console.log('======================================================================');
  if (!suspects.length) {
    console.log('None found. All ADJUSTMENTs have either an event_id or an override_reason.\n');
  } else {
    // Group by user + minute bucket
    const clusters = new Map();
    for (const r of suspects) {
      const minute = r.recorded_at?.toISOString().slice(0, 16); // "YYYY-MM-DDTHH:MM"
      const key = `${r.recorded_by}|${minute}`;
      if (!clusters.has(key)) clusters.set(key, []);
      clusters.get(key).push(r);
    }

    console.log(`\nGrouped into ${clusters.size} cluster(s):\n`);

    let clusterIdx = 0;
    for (const [key, rows] of clusters) {
      clusterIdx++;
      const first = rows[0];
      const u = uMap.get(first.recorded_by?.toString());
      const totalQtyOut = rows.reduce((s, r) => s + (r.qty_out || 0), 0);
      const totalQtyIn = rows.reduce((s, r) => s + (r.qty_in || 0), 0);
      const whSet = new Set(rows.map(r => whMap.get(r.warehouse_id?.toString())?.warehouse_code || '?'));

      console.log(`--- Cluster ${clusterIdx} ---`);
      console.log(`  When:       ${first.recorded_at?.toISOString()}`);
      console.log(`  Who:        ${u?.name || '?'} <${u?.email || '?'}>`);
      console.log(`  Warehouses: ${[...whSet].join(', ')}`);
      console.log(`  Rows:       ${rows.length}`);
      console.log(`  Total qty_in:  ${totalQtyIn}`);
      console.log(`  Total qty_out: ${totalQtyOut}`);
      console.log(`  Net impact:    ${totalQtyIn - totalQtyOut} (negative = stock depleted)`);
      console.log('');
      console.log(`  ${pad('WAREHOUSE', 10)}${pad('PRODUCT', 28)}${pad('BATCH', 14)}${padNum('QTY_IN', 8)}${padNum('QTY_OUT', 8)}`);
      for (const r of rows) {
        const w = whMap.get(r.warehouse_id?.toString());
        const p = pMap.get(r.product_id?.toString());
        const pLabel = p ? `${p.brand_name || '?'}${p.dosage_strength ? ' ' + p.dosage_strength : ''}` : '(unknown)';
        console.log(`  ${pad(w?.warehouse_code || '?', 10)}${pad(pLabel, 28)}${pad(r.batch_lot_no || '?', 14)}${padNum(r.qty_in, 8)}${padNum(r.qty_out, 8)}`);
      }
      console.log('');
    }
  }

  // ============ LEGIT ADJUSTMENTS (for contrast) ============
  console.log('======================================================================');
  console.log(`  LEGITIMATE ADJUSTMENTS (has event_id or reason): ${legit.length}`);
  console.log('======================================================================');
  if (!legit.length) {
    console.log('None. Every ADJUSTMENT in the ledger is suspect.\n');
  } else {
    console.log(`\n  ${pad('WAREHOUSE', 10)}${pad('DATE', 22)}${pad('USER', 22)}${padNum('QTY_IN', 8)}${padNum('QTY_OUT', 8)}  REASON/EVENT`);
    for (const r of legit.slice(0, 20)) {
      const w = whMap.get(r.warehouse_id?.toString());
      const u = uMap.get(r.recorded_by?.toString());
      const tag = r.event_id ? `event=${r.event_id}` : (r.override_reason || '');
      console.log(`  ${pad(w?.warehouse_code || '?', 10)}${pad(r.recorded_at?.toISOString() || '?', 22)}${pad(u?.name || '?', 22)}${padNum(r.qty_in, 8)}${padNum(r.qty_out, 8)}  ${tag}`);
    }
    if (legit.length > 20) console.log(`  ... and ${legit.length - 20} more`);
  }

  console.log('\n======================================================================');
  console.log('  INTERPRETATION');
  console.log('======================================================================');
  console.log('A "suspect cluster" is a batch of ADJUSTMENTs by one user in one minute');
  console.log('with no linked event and no reason. That\'s the fingerprint of a UI');
  console.log('button that bulk-wiped stock without asking for confirmation.');
  console.log('');
  console.log('Legitimate adjustments normally have EITHER an event_id (linked to a');
  console.log('GRN / CSI / transfer) or an override_reason (user typed why). Suspect');
  console.log('ones have neither — and are candidates for reversal.');

  await mongoose.disconnect();
}

run().catch(err => { console.error(err); process.exit(1); });
