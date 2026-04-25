/* eslint-disable vip-tenant/require-entity-filter -- standalone remediation script: no req context; targets a specific historical incident */
/**
 * Restore ILO-MAIN Opening Stock — Remediation
 *
 * On 2026-04-21 02:47 UTC, two ADJUSTMENT entries zeroed out ILO-MAIN's
 * opening balance:
 *   - Viptriaxone 1g (batch ECFXM24107) — 5800 out
 *   - Viprazole 40mg (batch D260118)    — 5000 out
 *
 * This script posts two compensating ADJUSTMENT entries (qty_in) that
 * restore the balance. It looks up the ORIGINAL OPENING_BALANCE rows by
 * warehouse + product + batch, then mirrors their qty as qty_in on new
 * ADJUSTMENT rows. Idempotent: exits if a prior restore entry already
 * exists with the same override_reason tag.
 *
 * Usage (from backend/):
 *   node erp/scripts/restoreIloMainOpeningStock.js           # dry-run
 *   node erp/scripts/restoreIloMainOpeningStock.js --apply   # writes
 */
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../../config/db');
const InventoryLedger = require('../models/InventoryLedger');
const Warehouse = require('../models/Warehouse');
const ProductMaster = require('../models/ProductMaster');

const APPLY = process.argv.includes('--apply');
const REASON_TAG = 'RESTORE_ILOMAIN_2026-04-21';

async function run() {
  await connectDB();

  const wh = await Warehouse.findOne({ warehouse_code: 'ILO-MAIN' }).lean();
  if (!wh) {
    console.log('ILO-MAIN warehouse not found. Aborting.');
    return await mongoose.disconnect();
  }

  // Idempotency check — have we already restored?
  const alreadyRestored = await InventoryLedger.countDocuments({
    warehouse_id: wh._id,
    transaction_type: 'ADJUSTMENT',
    override_reason: { $regex: REASON_TAG },
  });
  if (alreadyRestored > 0) {
    console.log(`Already restored (${alreadyRestored} entries tagged "${REASON_TAG}"). Nothing to do.`);
    return await mongoose.disconnect();
  }

  // Find the original OPENING_BALANCE entries
  const openings = await InventoryLedger.find({
    warehouse_id: wh._id,
    transaction_type: 'OPENING_BALANCE',
  }).lean();

  if (!openings.length) {
    console.log('No OPENING_BALANCE entries found on ILO-MAIN. Aborting.');
    return await mongoose.disconnect();
  }

  // For each opening, verify a matching ADJUSTMENT zeroed it out
  const plan = [];
  for (const op of openings) {
    const adj = await InventoryLedger.findOne({
      warehouse_id: wh._id,
      product_id: op.product_id,
      batch_lot_no: op.batch_lot_no,
      transaction_type: 'ADJUSTMENT',
      qty_out: op.qty_in,
    }).lean();

    if (!adj) {
      console.log(`  SKIP ${op.batch_lot_no}: no matching ADJUSTMENT zeroing-out row found — leaving alone.`);
      continue;
    }

    const product = await ProductMaster.findById(op.product_id).select('brand_name dosage_strength').lean();
    plan.push({
      product_id: op.product_id,
      product_label: `${product?.brand_name || '?'}${product?.dosage_strength ? ' ' + product.dosage_strength : ''}`,
      batch_lot_no: op.batch_lot_no,
      expiry_date: op.expiry_date,
      qty_to_restore: op.qty_in,
      entity_id: op.entity_id,
      bdm_id: op.bdm_id,
      recorded_by: op.recorded_by,
    });
  }

  console.log(`\nMode: ${APPLY ? 'APPLY (writes will occur)' : 'DRY-RUN (no writes)'}\n`);
  console.log('Plan:');
  console.log('------------------------------------------------------------');
  for (const p of plan) {
    console.log(`  + ${p.product_label.padEnd(28)} batch=${p.batch_lot_no.padEnd(14)} qty_in=${p.qty_to_restore}`);
  }
  console.log('------------------------------------------------------------');
  console.log(`Total entries to write: ${plan.length}`);
  console.log(`Total qty_in to restore: ${plan.reduce((s, p) => s + p.qty_to_restore, 0)}`);

  if (!APPLY) {
    console.log('\nDRY-RUN only. Re-run with --apply to write the entries.');
    return await mongoose.disconnect();
  }

  // APPLY
  console.log('\nWriting compensating ADJUSTMENT entries...');
  for (const p of plan) {
    await InventoryLedger.create({
      entity_id: p.entity_id,
      bdm_id: p.bdm_id,
      warehouse_id: wh._id,
      product_id: p.product_id,
      batch_lot_no: p.batch_lot_no,
      expiry_date: p.expiry_date,
      transaction_type: 'ADJUSTMENT',
      qty_in: p.qty_to_restore,
      qty_out: 0,
      recorded_by: p.recorded_by,
      override_reason: `${REASON_TAG} — restore stock zeroed by accidental adjustment on 2026-04-21 02:47 UTC`,
    });
    console.log(`  wrote ${p.product_label} / ${p.batch_lot_no} / qty_in=${p.qty_to_restore}`);
  }

  console.log('\nDone. Verify with diagnoseIloMainAdjustments.js — net balance should return to 10800.');
  await mongoose.disconnect();
}

run().catch(err => { console.error(err); process.exit(1); });
