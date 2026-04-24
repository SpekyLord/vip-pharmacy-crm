/**
 * Customer Globalization — Index Migration (Phase G5, Apr 2026)
 *
 * Context:
 *   Phase 18 created `erp_customers` as an entity-scoped master with a
 *   per-entity compound unique index `{ entity_id: 1, customer_name_clean: 1 }`.
 *   Phase G5 repoints Customer to the Hospital-style global-master pattern so
 *   that a tagged BDM can sell to their customer regardless of working entity.
 *   The uniqueness invariant flips: customer_name_clean is now GLOBALLY unique
 *   (drop the compound, add a single-field unique).
 *
 * What this script does:
 *   1. Reports duplicate customer_name_clean values across entities (these
 *      would block the new global unique index — surface them before applying).
 *   2. When --apply, drops the legacy compound indexes, then lets Mongoose
 *      rebuild the Phase-G5 indexes on next app boot (syncIndexes-compatible).
 *      Also drops the ancillary per-entity compound indexes that Phase G5
 *      replaces with plain single-field indexes.
 *
 * Duplicate handling:
 *   The script does NOT merge duplicates automatically — it just refuses to
 *   rebuild the unique index when duplicates exist, because merging customers
 *   would cascade into Sales / Collections / CreditNotes / AR aging. Resolve
 *   duplicates manually in the Customer Management UI first (rename or
 *   consolidate via an ops script), then rerun this migration.
 *
 * Idempotent: safe to run multiple times. Running after index rebuild is a
 * no-op (indexes already in target shape).
 *
 * Usage (from backend/):
 *   node erp/scripts/migrateCustomerGlobalUnique.js           # dry-run / report
 *   node erp/scripts/migrateCustomerGlobalUnique.js --apply   # drop legacy, rebuild
 */
require('dotenv').config();
const mongoose = require('mongoose');

const APPLY = process.argv.includes('--apply');

const LEGACY_INDEXES_TO_DROP = [
  // Phase-18 entity-scoped indexes replaced by Phase-G5 global equivalents.
  'entity_id_1_customer_name_clean_1',
  'entity_id_1_status_1',
  'entity_id_1_customer_type_1',
];

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log(`Connected. Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}`);

  const Customer = require('../models/Customer');
  const coll = Customer.collection;

  // 1) Surface duplicates that would block the new global unique index.
  const dupeGroups = await coll.aggregate([
    { $match: { customer_name_clean: { $exists: true, $ne: null } } },
    { $group: {
      _id: '$customer_name_clean',
      count: { $sum: 1 },
      ids: { $push: '$_id' },
      entities: { $addToSet: '$entity_id' },
      names: { $addToSet: '$customer_name' },
    }},
    { $match: { count: { $gt: 1 } } },
    { $sort: { count: -1 } },
  ]).toArray();

  if (dupeGroups.length) {
    console.log('');
    console.log(`⚠ Found ${dupeGroups.length} duplicate customer_name_clean group(s) across entities:`);
    for (const g of dupeGroups.slice(0, 25)) {
      console.log(`  • "${g._id}"  x${g.count}  (entities: ${g.entities.length}, ids: ${g.ids.map(String).join(', ')})`);
    }
    if (dupeGroups.length > 25) console.log(`  …and ${dupeGroups.length - 25} more.`);
    console.log('');
    console.log('Resolve these duplicates before --apply:');
    console.log('  - Rename so customer_name_clean is unique, OR');
    console.log('  - Consolidate into one record and repoint SalesLine / Collection / CreditNote.customer_id manually.');
    await mongoose.disconnect();
    process.exit(APPLY ? 1 : 0);
  }
  console.log('✓ No duplicate customer_name_clean values — safe to rebuild as global unique.');

  // 2) Inventory existing indexes so we know what to drop.
  const existing = await coll.indexes();
  const byName = new Map(existing.map(i => [i.name, i]));
  console.log('');
  console.log(`Current indexes on erp_customers (${existing.length}):`);
  for (const ix of existing) console.log(`  • ${ix.name}  keys=${JSON.stringify(ix.key)}  unique=${!!ix.unique}`);

  const toDrop = LEGACY_INDEXES_TO_DROP.filter(n => byName.has(n));
  if (!toDrop.length) {
    console.log('');
    console.log('✓ No legacy entity-scoped indexes present — nothing to drop.');
    await mongoose.disconnect();
    return;
  }

  console.log('');
  console.log(`${APPLY ? 'Dropping' : '[dry-run] Would drop'} ${toDrop.length} legacy index(es):`);
  for (const name of toDrop) console.log(`  - ${name}`);

  if (APPLY) {
    for (const name of toDrop) {
      try {
        await coll.dropIndex(name);
        console.log(`  ✓ dropped ${name}`);
      } catch (err) {
        console.warn(`  ! drop ${name} failed: ${err.message}`);
      }
    }
    // Rebuild Phase-G5 index set from the Mongoose schema definition.
    await Customer.syncIndexes();
    console.log('✓ Customer.syncIndexes() done — Phase-G5 indexes in place.');
  } else {
    console.log('');
    console.log('DRY-RUN — rerun with --apply to persist.');
  }

  await mongoose.disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
