/**
 * Migrate SmerEntry Unique Index — Partial Filter for Soft-Reversed Rows
 *
 * Context (2026-04-21): a BDM's SMER was reversed via Reversal Console while
 * POSTED → SAP Storno stamped `deletion_event_id` but kept the row. The unique
 * index on `{entity_id, bdm_id, period, cycle}` then blocked her from creating
 * a fresh SMER for the same period+cycle to redo the work. Same problem exists
 * on every subscriber the moment anyone reverses a POSTED SMER.
 *
 * Fix: rebuild the unique index with a partialFilterExpression so it only
 * applies to non-reversed rows. Matches the pattern already used on
 * Undertaking.linked_grn_id (Phase 32) and OfficeSupply.item_code (Phase 31R-OS).
 *
 * Safe to run multiple times — idempotent. Checks the current index definition
 * first and only rebuilds if the partial filter is missing.
 *
 * Usage (from backend/):
 *   node erp/scripts/migrateSmerUniqueIndex.js           # dry-run (reports state)
 *   node erp/scripts/migrateSmerUniqueIndex.js --apply   # drops old index, builds new
 */
require('dotenv').config();
const mongoose = require('mongoose');

const APPLY = process.argv.includes('--apply');
const COLLECTION = 'erp_smer_entries';
const INDEX_KEY = { entity_id: 1, bdm_id: 1, period: 1, cycle: 1 };

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log(`Connected. Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}`);

  const db = mongoose.connection.db;
  const coll = db.collection(COLLECTION);

  const indexes = await coll.indexes();
  const match = indexes.find(idx => {
    const keys = Object.keys(idx.key);
    const want = Object.keys(INDEX_KEY);
    if (keys.length !== want.length) return false;
    return want.every(k => idx.key[k] === INDEX_KEY[k]);
  });

  if (!match) {
    console.log('No existing unique index on (entity_id, bdm_id, period, cycle) — nothing to migrate.');
    if (APPLY) {
      console.log('Creating partial unique index…');
      await coll.createIndex(INDEX_KEY, {
        unique: true,
        partialFilterExpression: { deletion_event_id: { $exists: false } },
      });
      console.log('  done.');
    }
    await mongoose.disconnect();
    return;
  }

  const hasPartial = match.partialFilterExpression
    && match.partialFilterExpression.deletion_event_id
    && match.partialFilterExpression.deletion_event_id.$exists === false;

  console.log(`Current index: ${match.name}`);
  console.log(`  unique:  ${!!match.unique}`);
  console.log(`  partial: ${hasPartial ? 'YES (already migrated)' : 'NO'}`);
  console.log(`  key:     ${JSON.stringify(match.key)}`);

  if (hasPartial) {
    console.log('Index already has the partial filter — nothing to do.');
    await mongoose.disconnect();
    return;
  }

  // Pre-check: would the new partial index succeed given current data?
  // A duplicate set of non-reversed rows would block creation.
  const dupes = await coll.aggregate([
    { $match: { deletion_event_id: { $exists: false } } },
    { $group: { _id: { entity_id: '$entity_id', bdm_id: '$bdm_id', period: '$period', cycle: '$cycle' }, n: { $sum: 1 } } },
    { $match: { n: { $gt: 1 } } },
  ]).toArray();

  if (dupes.length > 0) {
    console.warn(`WARNING: ${dupes.length} duplicate non-reversed SMER group(s) would block partial-index creation:`);
    dupes.forEach(d => console.warn(`  ${JSON.stringify(d._id)} × ${d.n}`));
    console.warn('Resolve these first (reverse or delete one of each pair) before rerunning with --apply.');
    await mongoose.disconnect();
    return;
  }

  if (!APPLY) {
    console.log('');
    console.log('Would drop old index and create partial unique index. Rerun with --apply.');
    await mongoose.disconnect();
    return;
  }

  console.log(`Dropping old index ${match.name}…`);
  await coll.dropIndex(match.name);
  console.log('  dropped.');

  console.log('Creating partial unique index…');
  await coll.createIndex(INDEX_KEY, {
    unique: true,
    partialFilterExpression: { deletion_event_id: { $exists: false } },
  });
  console.log('  done. BDMs can now create fresh SMERs for periods whose prior SMER was reversed.');

  await mongoose.disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
