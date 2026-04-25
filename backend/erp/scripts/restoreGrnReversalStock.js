/* eslint-disable vip-tenant/require-entity-filter -- standalone admin/migration/diagnostic script: no req context; intentional cross-entity reads/writes for ops work */
/**
 * Restore Stock from GRN Reversal — Inventory-Only
 *
 * Context: On 2026-04-21 02:47 UTC, Gregg (as president) reversed GRN
 * 69e1eec226e39698b6857ec6 via President Reversals Console → DELETE.
 * That generated 242 compensating ADJUSTMENT(qty_out) rows across 10
 * warehouses linked to TransactionEvent 69e6e53a8f323da1a8eba808.
 *
 * He wants the inventory back (clean slate for live day) but does NOT
 * want the journal entries restored (he deleted them manually — books
 * are intentionally starting from zero).
 *
 * This script posts 242 compensating ADJUSTMENT(qty_in) entries that
 * mirror the reversal's qty_out back as qty_in. Inventory returns to
 * the pre-reversal state. Nothing else is touched:
 *   - journal_entries: NOT touched (stay wiped)
 *   - GrnEntry.deletion_event_id: NOT cleared (audit preserves fact
 *     that the GRN was formally reversed; this restore is a separate
 *     inventory-state correction)
 *   - PurchaseOrder.qty_received: NOT touched
 *   - SupplierInvoice / AP: NOT touched
 *
 * Idempotent via override_reason tag UNDO_GRN_REVERSAL_2026-04-21.
 *
 * Usage (from backend/):
 *   node erp/scripts/restoreGrnReversalStock.js           # dry-run
 *   node erp/scripts/restoreGrnReversalStock.js --apply   # writes
 */
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../../config/db');
const InventoryLedger = require('../models/InventoryLedger');
const Warehouse = require('../models/Warehouse');

const APPLY = process.argv.includes('--apply');
const REVERSAL_EVENT_ID = '69e6e53a8f323da1a8eba808';
const UNDO_TAG = 'UNDO_GRN_REVERSAL_2026-04-21';

async function run() {
  await connectDB();

  // Idempotency check
  const alreadyDone = await InventoryLedger.countDocuments({
    override_reason: { $regex: UNDO_TAG },
  });
  if (alreadyDone > 0) {
    console.log(`Already restored (${alreadyDone} entries tagged "${UNDO_TAG}"). Nothing to do.`);
    return await mongoose.disconnect();
  }

  // Find all ADJUSTMENT(qty_out) rows from the reversal
  const reversalRows = await InventoryLedger.find({
    event_id: new mongoose.Types.ObjectId(REVERSAL_EVENT_ID),
    transaction_type: 'ADJUSTMENT',
  }).lean();

  if (!reversalRows.length) {
    console.log(`No rows found for reversal event ${REVERSAL_EVENT_ID}. Aborting.`);
    return await mongoose.disconnect();
  }

  // Summary
  const warehouses = await Warehouse.find({}).lean();
  const whMap = new Map(warehouses.map(w => [w._id.toString(), w]));

  const perWh = new Map();
  let totalQtyOut = 0;
  for (const r of reversalRows) {
    const whCode = whMap.get(r.warehouse_id?.toString())?.warehouse_code || '?';
    perWh.set(whCode, (perWh.get(whCode) || 0) + (r.qty_out || 0));
    totalQtyOut += r.qty_out || 0;
  }

  console.log(`\nMode: ${APPLY ? 'APPLY (writes will occur)' : 'DRY-RUN (no writes)'}\n`);
  console.log(`Reversal event: ${REVERSAL_EVENT_ID}`);
  console.log(`Rows to compensate: ${reversalRows.length}`);
  console.log(`\nQty to restore per warehouse:`);
  for (const [wh, qty] of [...perWh.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${wh.padEnd(12)} ${String(qty).padStart(8)}`);
  }
  console.log(`  ${'TOTAL'.padEnd(12)} ${String(totalQtyOut).padStart(8)}`);

  if (!APPLY) {
    console.log('\nDRY-RUN only. Re-run with --apply to write the compensating entries.');
    console.log('Note: journal entries will NOT be restored. Books stay clean.');
    return await mongoose.disconnect();
  }

  console.log('\nWriting compensating ADJUSTMENT(qty_in) entries...');
  let written = 0;
  for (const r of reversalRows) {
    await InventoryLedger.create({
      entity_id: r.entity_id,
      bdm_id: r.bdm_id,
      warehouse_id: r.warehouse_id,
      product_id: r.product_id,
      batch_lot_no: r.batch_lot_no,
      expiry_date: r.expiry_date,
      transaction_type: 'ADJUSTMENT',
      qty_in: r.qty_out,     // mirror qty_out back as qty_in
      qty_out: 0,
      recorded_by: r.recorded_by,
      override_reason: `${UNDO_TAG} — restore inventory from GRN reversal event ${REVERSAL_EVENT_ID}; journal entries intentionally NOT restored (user wiped books for clean slate)`,
    });
    written++;
    if (written % 50 === 0) console.log(`  ...${written}/${reversalRows.length}`);
  }
  console.log(`  wrote ${written}/${reversalRows.length} entries.`);

  console.log('\nDone. Verify with diagnoseStockVisibility.js — section 6 should show all 10 warehouses populated.');
  await mongoose.disconnect();
}

run().catch(err => { console.error(err); process.exit(1); });
