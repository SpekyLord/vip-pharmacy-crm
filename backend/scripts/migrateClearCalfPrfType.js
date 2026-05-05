/**
 * Corrective migration (May 2026).
 *
 * Run with:
 *   node backend/scripts/migrateClearCalfPrfType.js          # dry-run (default)
 *   node backend/scripts/migrateClearCalfPrfType.js --apply  # persist
 *
 * Why: PrfCalf.prf_type previously had `default: 'PARTNER_REBATE'`. The default
 * fired on EVERY PrfCalf doc — both PRFs and CALFs. autoCalfForSource
 * (expenseController) creates CALFs without setting prf_type, so every
 * auto-CALF inherited the wrong tag. The Approval Hub then rendered
 *   "Type: CALF (PARTNER_REBATE)"
 * for utilities/fuel/ACCESS expenses, making them look like rebate payouts.
 *
 * This script unsets prf_type on every CALF doc — the field is PRF-only and
 * should not exist on CALFs at all.
 *
 * The schema-default was removed in PrfCalf.js so new CALFs no longer leak.
 * Existing CALFs need this one-shot cleanup.
 *
 * Idempotent. Safe to re-run. Reports 0 updates on second run.
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const mongoose = require('mongoose');

const DRY_RUN = !process.argv.includes('--apply');

async function run() {
  if (!process.env.MONGO_URI) {
    console.error('[migrateClearCalfPrfType] MONGO_URI not set. Aborting.');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);
  console.log(`[migrateClearCalfPrfType] Connected. DRY_RUN=${DRY_RUN}`);

  // Reach the collection directly so we don't fight the (already-fixed) schema.
  // The PrfCalf model overrides the default collection name to 'erp_prf_calf'.
  const coll = mongoose.connection.collection('erp_prf_calf');

  const totalCalfs = await coll.countDocuments({ doc_type: 'CALF' });
  const calfsWithPrfType = await coll.countDocuments({
    doc_type: 'CALF',
    prf_type: { $exists: true },
  });

  console.log(
    `[migrateClearCalfPrfType] BEFORE total_calfs=${totalCalfs} calfs_with_prf_type=${calfsWithPrfType}`,
  );

  if (calfsWithPrfType === 0) {
    console.log('[migrateClearCalfPrfType] Nothing to do — no CALFs carry prf_type.');
    await mongoose.disconnect();
    return;
  }

  // Sample 10 candidate IDs for audit visibility
  const sample = await coll
    .find(
      { doc_type: 'CALF', prf_type: { $exists: true } },
      { projection: { _id: 1, calf_number: 1, prf_type: 1, purpose: 1, status: 1 } },
    )
    .limit(10)
    .toArray();
  console.log('[migrateClearCalfPrfType] Sample of up to 10 affected CALFs:');
  for (const d of sample) {
    console.log(
      `  ${d._id}  ${d.calf_number || '(no#)'}  prf_type=${d.prf_type}  status=${d.status}  purpose=${d.purpose || ''}`,
    );
  }

  if (DRY_RUN) {
    console.log(
      `[migrateClearCalfPrfType] DRY-RUN: would $unset prf_type on ${calfsWithPrfType} CALF docs.`,
    );
    console.log('[migrateClearCalfPrfType] Re-run with --apply to persist.');
    await mongoose.disconnect();
    return;
  }

  const res = await coll.updateMany(
    { doc_type: 'CALF', prf_type: { $exists: true } },
    { $unset: { prf_type: '' } },
  );
  console.log(
    `[migrateClearCalfPrfType] applied. matched=${res.matchedCount} modified=${res.modifiedCount}`,
  );

  const remaining = await coll.countDocuments({
    doc_type: 'CALF',
    prf_type: { $exists: true },
  });
  if (remaining !== 0) {
    console.error(
      `[migrateClearCalfPrfType] WARNING: ${remaining} CALFs still carry prf_type after apply.`,
    );
    process.exitCode = 2;
  } else {
    console.log('[migrateClearCalfPrfType] verified — 0 CALFs carry prf_type.');
  }

  // Defensive: PRFs MUST still have a prf_type. Surface any naked PRFs so admin
  // can hand-set a value before the validator on submit catches them.
  const nakedPrfs = await coll.countDocuments({
    doc_type: 'PRF',
    $or: [{ prf_type: { $exists: false } }, { prf_type: null }, { prf_type: '' }],
  });
  if (nakedPrfs > 0) {
    console.warn(
      `[migrateClearCalfPrfType] WARN: ${nakedPrfs} PRFs have no prf_type set. ` +
        `These existed before the schema-default removal and will need manual repair.`,
    );
  } else {
    console.log('[migrateClearCalfPrfType] verified — every PRF carries a prf_type.');
  }

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('[migrateClearCalfPrfType] fatal:', err);
  process.exit(1);
});
