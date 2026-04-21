/**
 * UNDO IloMain Opening Stock Restore
 *
 * Context: On 2026-04-21 ~05:57 UTC, restoreIloMainOpeningStock.js wrote
 * 2 compensating ADJUSTMENT(qty_in) entries to ILO-MAIN totalling 10800
 * qty. That restore was posted in error — the original 02:47 UTC
 * ADJUSTMENT(qty_out) entries that zeroed the stock were NOT accidental.
 * They were part of a legitimate GRN_REVERSAL / PRESIDENT_REVERSAL with
 * reason=DELETE, event_id=69e6e53a8f323da1a8eba808.
 *
 * This script posts 2 compensating ADJUSTMENT(qty_out) entries to undo
 * the restore. Preserves audit trail (both entries remain in ledger).
 *
 * Targets rows tagged: override_reason contains "RESTORE_ILOMAIN_2026-04-21"
 *
 * Usage (from backend/):
 *   node erp/scripts/undoIloMainRestore.js           # dry-run
 *   node erp/scripts/undoIloMainRestore.js --apply   # writes
 */
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../../config/db');
const InventoryLedger = require('../models/InventoryLedger');
const ProductMaster = require('../models/ProductMaster');
const Warehouse = require('../models/Warehouse');

const APPLY = process.argv.includes('--apply');
const RESTORE_TAG = 'RESTORE_ILOMAIN_2026-04-21';
const UNDO_TAG = 'UNDO_RESTORE_ILOMAIN_2026-04-21';

async function run() {
  await connectDB();

  // Idempotency check
  const alreadyUndone = await InventoryLedger.countDocuments({
    override_reason: { $regex: UNDO_TAG },
  });
  if (alreadyUndone > 0) {
    console.log(`Already undone (${alreadyUndone} entries tagged "${UNDO_TAG}"). Nothing to do.`);
    return await mongoose.disconnect();
  }

  // Find the restore rows
  const restoreRows = await InventoryLedger.find({
    override_reason: { $regex: RESTORE_TAG },
  }).lean();

  if (!restoreRows.length) {
    console.log('No rows found tagged with RESTORE_ILOMAIN_2026-04-21. Nothing to undo.');
    return await mongoose.disconnect();
  }

  const pids = await ProductMaster.find({ _id: { $in: restoreRows.map(r => r.product_id) } }).select('brand_name dosage_strength').lean();
  const pMap = new Map(pids.map(p => [p._id.toString(), p]));

  console.log(`\nMode: ${APPLY ? 'APPLY (writes will occur)' : 'DRY-RUN (no writes)'}\n`);
  console.log('Found restore rows to undo:');
  console.log('--------------------------------------------------------------------------------');
  for (const r of restoreRows) {
    const p = pMap.get(r.product_id?.toString());
    const label = p ? `${p.brand_name}${p.dosage_strength ? ' ' + p.dosage_strength : ''}` : '(unknown)';
    console.log(`  ${label.padEnd(28)} batch=${(r.batch_lot_no || '?').padEnd(14)} qty_in=${r.qty_in} recorded_at=${r.recorded_at?.toISOString()}`);
  }
  console.log('--------------------------------------------------------------------------------');
  console.log(`Will post ${restoreRows.length} compensating ADJUSTMENT(qty_out) entries.`);
  console.log(`Total qty to remove: ${restoreRows.reduce((s, r) => s + (r.qty_in || 0), 0)}`);

  if (!APPLY) {
    console.log('\nDRY-RUN only. Re-run with --apply to write the undo entries.');
    return await mongoose.disconnect();
  }

  console.log('\nWriting compensating ADJUSTMENT(qty_out) entries...');
  for (const r of restoreRows) {
    await InventoryLedger.create({
      entity_id: r.entity_id,
      bdm_id: r.bdm_id,
      warehouse_id: r.warehouse_id,
      product_id: r.product_id,
      batch_lot_no: r.batch_lot_no,
      expiry_date: r.expiry_date,
      transaction_type: 'ADJUSTMENT',
      qty_in: 0,
      qty_out: r.qty_in,
      recorded_by: r.recorded_by,
      override_reason: `${UNDO_TAG} — undo restore posted in error; original 02:47 UTC adjustment was part of legitimate GRN_REVERSAL event 69e6e53a8f323da1a8eba808`,
    });
    const p = pMap.get(r.product_id?.toString());
    const label = p ? `${p.brand_name}${p.dosage_strength ? ' ' + p.dosage_strength : ''}` : '(unknown)';
    console.log(`  wrote undo: ${label} / ${r.batch_lot_no} / qty_out=${r.qty_in}`);
  }

  console.log('\nDone. Verify with diagnoseIloMainAdjustments.js — net balance should return to 0.');
  await mongoose.disconnect();
}

run().catch(err => { console.error(err); process.exit(1); });
