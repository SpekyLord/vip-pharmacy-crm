/**
 * Phase VIP-1.A — corrective migration (Apr 2026).
 *
 * Run with:
 *   node backend/scripts/migrateLegacyPartnersToVisited.js          # dry-run (default)
 *   node backend/scripts/migrateLegacyPartnersToVisited.js --apply   # persist
 *
 * Why: the Apr 26 backfill (backfillDoctorPartnershipStatus.js) flipped every
 * legacy Doctor without partnership_status to 'PARTNER', under the assumption
 * that pre-VIP-1.A docs were "at least at VISITED stage." That decision now
 * looks wrong-flavored: online-pharmacy patient-attribution capture has not
 * started, so no doctor has actually earned PARTNER status under the
 * Phase VIP-1.A rules (PARTNER promotion requires partner_agreement_date,
 * which is the gate the rebate engine reads).
 *
 * This script flips legacy-backfill PARTNERs back to VISITED, leaving real
 * admin-promoted PARTNERs untouched.
 *
 * Heuristic — a "real" PARTNER has partner_agreement_date set:
 *   - partnership_status === 'PARTNER'
 *   - partner_agreement_date === null OR missing
 *   → demote to VISITED (legacy backfill, not a true promotion)
 *
 * Rows we DO NOT touch:
 *   - PARTNERs with a partner_agreement_date set (admin actually promoted them)
 *   - LEAD / CONTACTED / VISITED / INACTIVE rows (already correct)
 *   - merged-loser docs (mergedInto != null)
 *
 * Idempotent. Safe to re-run. Reports 0 updates on second run.
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const Doctor = require('../models/Doctor');

const DRY_RUN = !process.argv.includes('--apply');

async function run() {
  if (!process.env.MONGO_URI) {
    console.error('[migrateLegacyPartners] MONGO_URI not set. Aborting.');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);
  console.log(`[migrateLegacyPartners] Connected. DRY_RUN=${DRY_RUN}`);

  const coll = Doctor.collection;

  // Pre-state breakdown
  const total = await coll.countDocuments({});
  const byStatus = await coll
    .aggregate([
      { $group: { _id: '$partnership_status', n: { $sum: 1 } } },
      { $sort: { n: -1 } },
    ])
    .toArray();
  const breakdown = byStatus.map((r) => `${r._id ?? '(unset)'}=${r.n}`).join(' ');
  console.log(`[migrateLegacyPartners] BEFORE total=${total} ${breakdown}`);

  // Filter: PARTNER without an agreement date, not a merged loser
  const filter = {
    partnership_status: 'PARTNER',
    $and: [
      {
        $or: [
          { partner_agreement_date: null },
          { partner_agreement_date: { $exists: false } },
        ],
      },
      {
        $or: [{ mergedInto: null }, { mergedInto: { $exists: false } }],
      },
    ],
  };

  const candidates = await coll.countDocuments(filter);

  // How many real PARTNERs (with agreement date) we're leaving alone
  const realPartners = await coll.countDocuments({
    partnership_status: 'PARTNER',
    partner_agreement_date: { $ne: null, $exists: true },
  });

  console.log(
    `[migrateLegacyPartners] candidates_to_demote=${candidates} real_partners_kept=${realPartners}`,
  );

  if (candidates === 0) {
    console.log('[migrateLegacyPartners] Nothing to do — no legacy-backfill PARTNERs.');
    await mongoose.disconnect();
    return;
  }

  // Sample 10 IDs for audit visibility (helps with rollback if needed)
  const sample = await coll
    .find(filter, { projection: { _id: 1, lastName: 1, firstName: 1 } })
    .limit(10)
    .toArray();
  console.log('[migrateLegacyPartners] Sample of 10 candidates:');
  for (const d of sample) {
    console.log(`  ${d._id}  ${d.lastName ?? '?'}, ${d.firstName ?? '?'}`);
  }

  if (DRY_RUN) {
    console.log(
      `[migrateLegacyPartners] DRY-RUN: would set partnership_status='VISITED' on ${candidates} docs.`,
    );
    console.log('[migrateLegacyPartners] Re-run with --apply to persist.');
    await mongoose.disconnect();
    return;
  }

  const res = await coll.updateMany(filter, { $set: { partnership_status: 'VISITED' } });
  console.log(
    `[migrateLegacyPartners] applied. matched=${res.matchedCount} modified=${res.modifiedCount}`,
  );

  // Post-state breakdown
  const byStatusAfter = await coll
    .aggregate([
      { $group: { _id: '$partnership_status', n: { $sum: 1 } } },
      { $sort: { n: -1 } },
    ])
    .toArray();
  const breakdownAfter = byStatusAfter
    .map((r) => `${r._id ?? '(unset)'}=${r.n}`)
    .join(' ');
  console.log(`[migrateLegacyPartners] AFTER ${breakdownAfter}`);

  // Verify post-condition
  const remaining = await coll.countDocuments(filter);
  if (remaining !== 0) {
    console.error(
      `[migrateLegacyPartners] WARNING: ${remaining} docs still match the demote filter after apply.`,
    );
    process.exitCode = 2;
  } else {
    console.log('[migrateLegacyPartners] verified — 0 legacy-backfill PARTNERs remain.');
  }

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('[migrateLegacyPartners] fatal:', err);
  process.exit(1);
});
