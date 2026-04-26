/**
 * Phase VIP-1.B Phase 0 — one-time bir_flag backfill for legacy PRF/CALF JEs.
 *
 * Run with:
 *   node backend/scripts/backfillPrfCalfBirFlag.js          # dry-run (default)
 *   node backend/scripts/backfillPrfCalfBirFlag.js --apply   # persist
 *
 * Background: before VIP-1.B Phase 0 (commit forthcoming), `journalFromPrfCalf`
 * defaulted to `bir_flag: 'BOTH'`, which made partner rebate JEs visible on the
 * BIR P&L view via `pnlService.aggregatePnl(..., ['BOTH','BIR'])`. Partner
 * rebates are an INTERNAL cost allocation — they must NEVER appear on BIR
 * filings. This script reclassifies legacy PRF JEs from 'BOTH' → 'INTERNAL'.
 *
 * CALF JEs (DR AR_BDM / CR Cash) are balance-sheet only with no P&L effect, so
 * the visibility flag has zero P&L impact, but for policy clarity we flip them
 * too. The eventual liquidation expense JE goes through journalFromExpense
 * (correctly flagged BOTH) so real expenses still hit BIR P&L.
 *
 * Selection:
 *   - source_module: 'EXPENSE'
 *   - description starts with 'PRF:' OR 'CALF:'
 *   - bir_flag = 'BOTH' (don't touch already-INTERNAL or BIR rows)
 *
 * Idempotent. Safe to re-run.
 *
 * Pattern mirror: backfillDoctorPartnershipStatus.js, backfillClmEntityId.js.
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const JournalEntry = require('../erp/models/JournalEntry');

const DRY_RUN = !process.argv.includes('--apply');

async function run() {
  if (!process.env.MONGO_URI) {
    console.error('[backfillBirFlag] MONGO_URI not set. Aborting.');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);
  console.log(`[backfillBirFlag] Connected. DRY_RUN=${DRY_RUN}`);

  const coll = JournalEntry.collection;

  // Target: legacy PRF and CALF JEs that defaulted to 'BOTH'.
  // Description format from journalFromPrfCalf line 749: `${doc.doc_type}: ${docRef}`
  //   → "PRF: PRF-2026-04-001" or "CALF: CALF-..."
  const filter = {
    source_module: 'EXPENSE',
    bir_flag: 'BOTH',
    description: { $regex: /^(PRF|CALF):/ },
  };

  const total = await coll.countDocuments({ source_module: 'EXPENSE' });
  const target = await coll.countDocuments(filter);

  // Per-type breakdown for visibility
  const byPrefix = await coll
    .aggregate([
      { $match: filter },
      {
        $project: {
          prefix: { $arrayElemAt: [{ $split: ['$description', ':'] }, 0] },
          status: 1,
        },
      },
      { $group: { _id: '$prefix', n: { $sum: 1 } } },
    ])
    .toArray();
  const breakdown = byPrefix.map((r) => `${r._id}=${r.n}`).join(' ');

  console.log(
    `[backfillBirFlag] expense_jes_total=${total} target_to_flip=${target} breakdown=${breakdown}`
  );

  if (target === 0) {
    console.log('[backfillBirFlag] Nothing to flip. Exiting clean.');
    await mongoose.disconnect();
    process.exit(0);
  }

  if (DRY_RUN) {
    // Show a small sample so the user can eyeball before --apply
    const sample = await coll
      .find(filter, { projection: { _id: 1, description: 1, period: 1, total_debit: 1 } })
      .limit(5)
      .toArray();
    console.log('[backfillBirFlag] Sample (first 5):');
    sample.forEach((j) =>
      console.log(`  ${j._id}  ${j.description}  ${j.period}  ${j.total_debit}`)
    );
    console.log('[backfillBirFlag] DRY-RUN — no writes. Re-run with --apply to persist.');
    await mongoose.disconnect();
    process.exit(0);
  }

  const result = await coll.updateMany(filter, { $set: { bir_flag: 'INTERNAL' } });
  console.log(
    `[backfillBirFlag] APPLIED. matched=${result.matchedCount} modified=${result.modifiedCount}`
  );

  // Quick verify
  const stillBoth = await coll.countDocuments(filter);
  console.log(`[backfillBirFlag] Verify: residual_BOTH_PRF_CALF=${stillBoth} (should be 0)`);

  await mongoose.disconnect();
  process.exit(stillBoth === 0 ? 0 : 1);
}

run().catch((err) => {
  console.error('[backfillBirFlag] FAIL:', err);
  process.exit(1);
});
