/**
 * Archive-Rename Reversed SMERs to Free Unique Keys
 *
 * Context (2026-04-21): the SmerEntry unique index `{entity_id, bdm_id, period,
 * cycle}` blocks a BDM from creating a fresh SMER for a period+cycle whose
 * prior SMER was reversed via Reversal Console (SAP Storno leaves the row with
 * `deletion_event_id` stamped). A partial-filter-on-`$exists: false` approach
 * was attempted first and abandoned — MongoDB rejects it with
 * "Expression not supported in partial index: $not".
 *
 * Instead we keep the plain unique index and archive-rename reversed rows:
 *   period: `${period}::REV::${_id}`
 * so the key frees for a new SMER while the reversed row keeps its _id, daily
 * entries, and deletion_event_id. `getSmerList` already hides reversed rows,
 * so the renamed period is invisible in normal UI flows.
 *
 * Going forward, `createSmer` performs this rename in-line when a new SMER
 * collides with a reversed dupe. This script handles the backlog — any
 * pre-existing reversed SMERs that still sit on the original period+cycle.
 *
 * Idempotent: a row whose period already contains "::REV::" is skipped.
 *
 * Usage (from backend/):
 *   node erp/scripts/migrateSmerUniqueIndex.js           # dry-run
 *   node erp/scripts/migrateSmerUniqueIndex.js --apply   # writes
 */
require('dotenv').config();
const mongoose = require('mongoose');

const APPLY = process.argv.includes('--apply');

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log(`Connected. Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}`);

  const SmerEntry = require('../models/SmerEntry');
  const reversed = await SmerEntry.find({
    deletion_event_id: { $exists: true },
    period: { $not: /::REV::/ },
  }).select('_id entity_id bdm_id period cycle').lean();

  console.log(`Scanning ${reversed.length} reversed SMER(s) still holding their original period+cycle…`);

  let renamed = 0;
  for (const s of reversed) {
    const newPeriod = `${s.period}::REV::${s._id}`;
    console.log(`  ${s._id}: ${s.period} ${s.cycle}  →  ${newPeriod}`);
    if (APPLY) {
      await SmerEntry.updateOne({ _id: s._id }, { $set: { period: newPeriod } });
    }
    renamed++;
  }

  console.log('');
  console.log(`Summary: ${renamed} reversed SMER(s) archived.`);
  if (!APPLY) console.log('DRY-RUN — rerun with --apply to persist.');

  await mongoose.disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
