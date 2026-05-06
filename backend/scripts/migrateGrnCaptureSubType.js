/**
 * migrateGrnCaptureSubType.js — Phase P1.2 Slice 6.2 (May 06 2026)
 *
 * Backfill `sub_type` on existing GRN CaptureSubmission rows so the
 * BATCH_PHOTO (D) vs WAYBILL (M) split applies retroactively to legacy
 * captures.
 *
 * Default: WAYBILL — conservative (assume physical paper was expected
 * until proven otherwise). Existing rows already have
 * physical_required=true / physical_status='PENDING' (or RECEIVED if
 * proxy already attested), so flipping to WAYBILL leaves the paper-trail
 * gate intact.
 *
 *   node backend/scripts/migrateGrnCaptureSubType.js          # dry-run (default)
 *   node backend/scripts/migrateGrnCaptureSubType.js --apply  # persist
 *
 * Idempotent. Re-running reports 0 updates after the first apply because
 * the filter (`sub_type: null` OR `{$exists: false}`) returns nothing.
 *
 * Why this is conservative: marking BATCH_PHOTO (D) by default would
 * silently flip legacy captures from physical_required=true to
 * physical_required=false. That would close paper-trail gates that admin
 * may have been relying on for compliance. WAYBILL preserves the legacy
 * posture exactly. If the BDM-by-BDM audit later shows a row was actually
 * a batch photo, admin can override one row at a time via the Capture
 * Archive (OVERRIDE_PHYSICAL_STATUS) — that path stays intact.
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const mongoose = require('mongoose');

const DRY_RUN = !process.argv.includes('--apply');

async function run() {
  if (!process.env.MONGO_URI) {
    console.error('[migrateGrnCaptureSubType] MONGO_URI not set. Aborting.');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);
  console.log(`[migrateGrnCaptureSubType] Connected. DRY_RUN=${DRY_RUN}`);

  // Reach the collection directly to dodge the (already-extended) schema.
  // CaptureSubmission's collection is 'capture_submissions'.
  const coll = mongoose.connection.collection('capture_submissions');

  const totalGrn = await coll.countDocuments({ workflow_type: 'GRN' });
  const filter = {
    workflow_type: 'GRN',
    $or: [{ sub_type: null }, { sub_type: { $exists: false } }],
  };
  const candidates = await coll.countDocuments(filter);

  // Pre-flight: count any rows already on the new sub_types so the audit log
  // shows the new captures are accounted for and not double-flipped.
  const alreadyBatch = await coll.countDocuments({
    workflow_type: 'GRN',
    sub_type: 'BATCH_PHOTO',
  });
  const alreadyWaybill = await coll.countDocuments({
    workflow_type: 'GRN',
    sub_type: 'WAYBILL',
  });

  console.log(
    `[migrateGrnCaptureSubType] BEFORE total_grn=${totalGrn} ` +
    `null_sub_type=${candidates} already_BATCH_PHOTO=${alreadyBatch} ` +
    `already_WAYBILL=${alreadyWaybill}`,
  );

  if (candidates === 0) {
    console.log('[migrateGrnCaptureSubType] Nothing to do — every GRN row has a sub_type.');
    await mongoose.disconnect();
    return;
  }

  // Sample IDs for audit visibility
  const sample = await coll
    .find(filter)
    .project({ _id: 1, bdm_id: 1, entity_id: 1, status: 1, physical_status: 1, created_at: 1 })
    .sort({ created_at: -1 })
    .limit(10)
    .toArray();
  console.log(
    '[migrateGrnCaptureSubType] Sample (newest first):',
    JSON.stringify(sample, null, 2),
  );

  if (DRY_RUN) {
    console.log(
      `[migrateGrnCaptureSubType] DRY-RUN: would set sub_type='WAYBILL' on ${candidates} rows. ` +
      `Re-run with --apply to persist.`,
    );
    await mongoose.disconnect();
    return;
  }

  const result = await coll.updateMany(filter, { $set: { sub_type: 'WAYBILL' } });
  console.log(
    `[migrateGrnCaptureSubType] AFTER updated=${result.modifiedCount} ` +
    `matched=${result.matchedCount}`,
  );

  // Post-condition: confirm we left zero null-sub_type GRN rows.
  const remaining = await coll.countDocuments(filter);
  if (remaining > 0) {
    console.error(
      `[migrateGrnCaptureSubType] WARN — ${remaining} GRN rows still have null sub_type ` +
      `after apply. Investigate.`,
    );
    await mongoose.disconnect();
    process.exit(2);
  }

  const finalBatch = await coll.countDocuments({
    workflow_type: 'GRN', sub_type: 'BATCH_PHOTO',
  });
  const finalWaybill = await coll.countDocuments({
    workflow_type: 'GRN', sub_type: 'WAYBILL',
  });
  console.log(
    `[migrateGrnCaptureSubType] FINAL BATCH_PHOTO=${finalBatch} WAYBILL=${finalWaybill}`,
  );

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('[migrateGrnCaptureSubType] FAILED:', err);
  process.exit(1);
});
