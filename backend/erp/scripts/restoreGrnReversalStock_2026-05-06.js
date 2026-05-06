/* eslint-disable vip-tenant/require-entity-filter -- standalone admin/migration/diagnostic script: no req context; intentional cross-entity reads/writes for ops work */
/**
 * Restore Stock from GRN Reversal — May 6, 2026 incident
 *
 * Context: On 2026-05-06, Gregg (as president) reversed
 * GRN-69faa6bfd2f8917690f76137 via President Reversals Console
 * (reason: "wrong approval"). The reverseInventoryFor() helper
 * matched 532 InventoryLedger rows because the underlying query
 *   InventoryLedger.find({ event_id })
 * has no guard against null/missing event_id. OPENING_BALANCE
 * rows seeded by importStockOnHand.js never carry an event_id,
 * so the query cross-cut every legacy seed row in the DB and
 * posted compensating qty_out ADJUSTMENTs against all of them,
 * draining warehouses that have nothing to do with this GRN.
 *
 * This script posts compensating ADJUSTMENT(qty_in) entries that
 * mirror the reversal's qty_out back as qty_in. Inventory returns
 * to the pre-reversal state. Nothing else is touched:
 *   - journal_entries: NOT touched
 *   - GrnEntry.deletion_event_id: NOT cleared (audit preserves
 *     fact that the GRN was formally reversed; this restore is
 *     a separate inventory-state correction)
 *   - PurchaseOrder.qty_received: NOT touched
 *   - SupplierInvoice / AP: NOT touched
 *
 * Idempotent via override_reason tag UNDO_GRN_REVERSAL_2026-05-06.
 *
 * Companion patch: backend/erp/services/documentReversalService.js
 * gains a hard guard rejecting null/missing event_id at the top of
 * reverseInventoryFor() so the same blast radius cannot recur.
 *
 * Usage (from backend/):
 *   node erp/scripts/restoreGrnReversalStock_2026-05-06.js           # dry-run
 *   node erp/scripts/restoreGrnReversalStock_2026-05-06.js --apply   # writes
 */
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../../config/db');
const InventoryLedger = require('../models/InventoryLedger');
const GrnEntry = require('../models/GrnEntry');
const Warehouse = require('../models/Warehouse');

const APPLY = process.argv.includes('--apply');
const GRN_ID = '69faa6bfd2f8917690f76137';
const UNDO_TAG = 'UNDO_GRN_REVERSAL_2026-05-06';

async function run() {
  await connectDB();

  // 1. Look up the GRN's reversal event so we know which rows to compensate
  const grn = await GrnEntry.findById(GRN_ID).lean();
  if (!grn) {
    console.log(`GRN ${GRN_ID} not found. Aborting.`);
    return await mongoose.disconnect();
  }
  if (!grn.deletion_event_id) {
    console.log(`GRN ${GRN_ID} has no deletion_event_id — was it actually reversed? Aborting.`);
    return await mongoose.disconnect();
  }
  const REVERSAL_EVENT_ID = grn.deletion_event_id.toString();

  // 2. Idempotency check
  const alreadyDone = await InventoryLedger.countDocuments({
    override_reason: { $regex: UNDO_TAG },
  });
  if (alreadyDone > 0) {
    console.log(`Already restored (${alreadyDone} entries tagged "${UNDO_TAG}"). Nothing to do.`);
    return await mongoose.disconnect();
  }

  // 3. Find all reversal-side ADJUSTMENT(qty_out) rows
  const reversalRows = await InventoryLedger.find({
    event_id: new mongoose.Types.ObjectId(REVERSAL_EVENT_ID),
    transaction_type: 'ADJUSTMENT',
  }).lean();

  if (!reversalRows.length) {
    console.log(`No reversal rows found for event ${REVERSAL_EVENT_ID}. Aborting.`);
    return await mongoose.disconnect();
  }

  // 4. Per-warehouse summary
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
  console.log(`GRN reversed:  ${GRN_ID}`);
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

  // 5. Write compensating entries
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
      override_reason: `${UNDO_TAG} — restore inventory from GRN-${GRN_ID} reversal event ${REVERSAL_EVENT_ID}; journal entries intentionally NOT restored`,
    });
    written++;
    if (written % 50 === 0) console.log(`  ...${written}/${reversalRows.length}`);
  }
  console.log(`  wrote ${written}/${reversalRows.length} entries.`);

  console.log('\nDone. Verify per-warehouse balances before posting any new transactions.');
  await mongoose.disconnect();
}

run().catch(err => { console.error(err); process.exit(1); });
