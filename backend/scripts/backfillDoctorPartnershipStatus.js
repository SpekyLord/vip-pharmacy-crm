/**
 * Phase VIP-1.A.1 — one-time backfill (Apr 2026).
 *
 * Run with:
 *   node backend/scripts/backfillDoctorPartnershipStatus.js          # dry-run (default)
 *   node backend/scripts/backfillDoctorPartnershipStatus.js --apply   # persist
 *
 * Sets partnership_status='PARTNER' on every Doctor record that is missing the
 * field. Mirrors the pre-save hook's legacy branch (Doctor.js:419-421) — any
 * Doctor that existed before Phase VIP-1.A is assumed to be at least at the
 * VISITED stage of the partnership pipeline; treating them as PARTNER is the
 * defensible default. New docs created post-VIP-1.A go through the schema
 * default ('LEAD') instead.
 *
 * Why a script and not "just touch every doc to fire the pre-save hook":
 *   - 700+ docs × N queries with the canonical-name + populate cascade is slow
 *   - updateMany is atomic at the collection level, with one round-trip
 *   - The pre-save hook's other side effects (vip_client_name_clean) are
 *     handled by their own backfill script (migrateVipClientCanonical.js)
 *
 * Idempotent. Safe to re-run. Reports 0 updates on second run.
 *
 * Mirror pattern: backfillClmEntityId.js (Phase 4 CLM entity backfill).
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const Doctor = require('../models/Doctor');

const DRY_RUN = !process.argv.includes('--apply');

async function run() {
  if (!process.env.MONGO_URI) {
    console.error('[backfillPartnership] MONGO_URI not set. Aborting.');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);
  console.log(`[backfillPartnership] Connected. DRY_RUN=${DRY_RUN}`);

  const coll = Doctor.collection;
  const total = await coll.countDocuments({});
  const filter = {
    $or: [{ partnership_status: { $exists: false } }, { partnership_status: null }],
  };
  const missing = await coll.countDocuments(filter);

  // Bonus visibility: how many docs already have each status (sanity check)
  const byStatus = await coll
    .aggregate([{ $group: { _id: '$partnership_status', n: { $sum: 1 } } }])
    .toArray();
  const statusBreakdown = byStatus
    .map((r) => `${r._id ?? '(unset)'}=${r.n}`)
    .join(' ');

  console.log(`[backfillPartnership] total=${total} missing=${missing} breakdown=${statusBreakdown}`);

  if (missing === 0) {
    console.log('[backfillPartnership] Nothing to do — every doc already has partnership_status.');
    await mongoose.disconnect();
    return;
  }

  if (DRY_RUN) {
    console.log(`[backfillPartnership] DRY-RUN: would set partnership_status='PARTNER' on ${missing} docs.`);
    console.log('[backfillPartnership] Re-run with --apply to persist.');
    await mongoose.disconnect();
    return;
  }

  const res = await coll.updateMany(filter, { $set: { partnership_status: 'PARTNER' } });
  console.log(
    `[backfillPartnership] applied. matched=${res.matchedCount} modified=${res.modifiedCount}`,
  );

  // Verify post-condition
  const remaining = await coll.countDocuments(filter);
  if (remaining !== 0) {
    console.error(`[backfillPartnership] WARNING: ${remaining} docs still missing partnership_status after apply.`);
    process.exitCode = 2;
  } else {
    console.log('[backfillPartnership] verified — 0 docs missing partnership_status.');
  }

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('[backfillPartnership] fatal:', err);
  process.exit(1);
});
