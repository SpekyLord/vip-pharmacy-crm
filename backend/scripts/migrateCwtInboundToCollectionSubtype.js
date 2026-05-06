/**
 * migrateCwtInboundToCollectionSubtype.js — Phase P1.2 Phase 1 (May 06 2026)
 *
 * Refactors the CWT capture workflow from a top-level
 * `workflow_type='CWT_INBOUND'` into a sub-classification of COLLECTION:
 *
 *   workflow_type='CWT_INBOUND'   →   workflow_type='COLLECTION', sub_type='CWT'
 *
 * Rationale: a CWT (BIR 2307) is part of the collection package the hospital
 * sends to VIP — the cheque/bank-transfer evidence (CR/DEPOSIT) and the tax
 * certificate (CWT) arrive together. Treating CWT as a sibling sub_type of
 * COLLECTION (alongside CR / DEPOSIT / PAID_CSI) lets the existing
 * collection lifecycle gates apply uniformly — and lets the BDM Capture Hub
 * compose the tile labels deterministically per (workflow_type, sub_type).
 *
 * Also: drops PETTY_CASH captures (workflow_type unused; tile was never
 * shipped — backend enum was speculative). Reports the count but does NOT
 * auto-delete; admin reviews and clears manually if any rows exist.
 *
 *   node backend/scripts/migrateCwtInboundToCollectionSubtype.js          # dry-run (default)
 *   node backend/scripts/migrateCwtInboundToCollectionSubtype.js --apply  # persist
 *
 * Idempotent. Re-running after --apply finds no CWT_INBOUND rows so it is
 * safe to schedule defensively. Uses raw collection access (not the Mongoose
 * model) so it works AFTER the model enum has been narrowed — same posture
 * as migrateGrnCaptureSubType.js.
 *
 * Why migration MUST run before narrowing the enum: in a developer's local
 * environment where the model is updated first, ANY save() on a legacy
 * CWT_INBOUND row would fail Mongoose validation. Running this script first
 * (or running it with the model still permissive) flips all live rows to
 * the target shape so the subsequent enum narrowing is safe.
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const mongoose = require('mongoose');

const DRY_RUN = !process.argv.includes('--apply');

async function run() {
  if (!process.env.MONGO_URI) {
    console.error('[migrateCwtInbound] MONGO_URI not set. Aborting.');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);
  console.log(`[migrateCwtInbound] Connected. DRY_RUN=${DRY_RUN}`);

  // Reach the collection directly to dodge any (already-narrowed) schema
  // enum. CaptureSubmission's collection is 'capture_submissions'.
  const coll = mongoose.connection.collection('capture_submissions');

  // ── 1. CWT_INBOUND → COLLECTION + sub_type=CWT ────────────────
  const totalCwtInbound = await coll.countDocuments({ workflow_type: 'CWT_INBOUND' });
  const alreadyMigrated = await coll.countDocuments({
    workflow_type: 'COLLECTION',
    sub_type: 'CWT',
  });

  console.log(
    `[migrateCwtInbound] BEFORE workflow_type=CWT_INBOUND count=${totalCwtInbound} ` +
    `already_migrated(COLLECTION+CWT)=${alreadyMigrated}`,
  );

  if (totalCwtInbound > 0) {
    // Sample for audit visibility
    const sample = await coll
      .find({ workflow_type: 'CWT_INBOUND' })
      .project({ _id: 1, bdm_id: 1, entity_id: 1, status: 1, physical_status: 1, created_at: 1 })
      .sort({ created_at: -1 })
      .limit(10)
      .toArray();
    console.log(
      '[migrateCwtInbound] CWT_INBOUND sample (newest first):',
      JSON.stringify(sample, null, 2),
    );
  }

  // ── 2. PETTY_CASH — count only, don't auto-delete ─────────────
  const totalPettyCash = await coll.countDocuments({ workflow_type: 'PETTY_CASH' });
  console.log(`[migrateCwtInbound] PETTY_CASH captures (review-only) count=${totalPettyCash}`);

  if (totalPettyCash > 0) {
    const pettySample = await coll
      .find({ workflow_type: 'PETTY_CASH' })
      .project({ _id: 1, bdm_id: 1, entity_id: 1, status: 1, created_at: 1 })
      .sort({ created_at: -1 })
      .limit(5)
      .toArray();
    console.log(
      '[migrateCwtInbound] PETTY_CASH sample (review manually):',
      JSON.stringify(pettySample, null, 2),
    );
    console.warn(
      `[migrateCwtInbound] WARN — ${totalPettyCash} PETTY_CASH capture(s) exist. ` +
      `These are NOT auto-mutated. The workflow_type enum will be narrowed in this ` +
      `phase, which means future saves of these rows would fail Mongoose ` +
      `validation. Admin: triage these rows (cancel/delete/reclassify) before ` +
      `the next deployment. The existing rows remain readable; only saves are blocked.`,
    );
  }

  if (totalCwtInbound === 0 && totalPettyCash === 0) {
    console.log('[migrateCwtInbound] Nothing to do — clean state.');
    await mongoose.disconnect();
    return;
  }

  if (DRY_RUN) {
    console.log(
      `[migrateCwtInbound] DRY-RUN: would set workflow_type='COLLECTION', sub_type='CWT' ` +
      `on ${totalCwtInbound} rows. PETTY_CASH rows (${totalPettyCash}) require manual triage. ` +
      `Re-run with --apply to persist CWT_INBOUND migration.`,
    );
    await mongoose.disconnect();
    return;
  }

  // ── APPLY ────────────────────────────────────────────────────
  const result = await coll.updateMany(
    { workflow_type: 'CWT_INBOUND' },
    { $set: { workflow_type: 'COLLECTION', sub_type: 'CWT' } },
  );
  console.log(
    `[migrateCwtInbound] AFTER updated=${result.modifiedCount} matched=${result.matchedCount}`,
  );

  // Post-condition: zero CWT_INBOUND rows must remain
  const remaining = await coll.countDocuments({ workflow_type: 'CWT_INBOUND' });
  if (remaining > 0) {
    console.error(
      `[migrateCwtInbound] WARN — ${remaining} CWT_INBOUND rows still exist after apply. ` +
      `Investigate.`,
    );
    await mongoose.disconnect();
    process.exit(2);
  }

  const finalCwt = await coll.countDocuments({
    workflow_type: 'COLLECTION', sub_type: 'CWT',
  });
  const finalPettyCash = await coll.countDocuments({ workflow_type: 'PETTY_CASH' });
  console.log(
    `[migrateCwtInbound] FINAL COLLECTION+CWT=${finalCwt} ` +
    `PETTY_CASH(untouched)=${finalPettyCash}`,
  );

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('[migrateCwtInbound] FAILED:', err);
  process.exit(1);
});
