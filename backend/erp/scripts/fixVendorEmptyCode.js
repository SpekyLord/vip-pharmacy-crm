/**
 * Vendor Master — Empty vendor_code Cleanup (Apr 2026)
 *
 * Context:
 *   VendorMaster has a partial unique index `{entity_id, vendor_code}` with
 *   `partialFilterExpression: { vendor_code: { $type: 'string' } }`. An empty
 *   string '' counts as a string, so two vendors in the same entity that both
 *   have `vendor_code: ''` collide on E11000. Symptom in the field: editing
 *   any such vendor returns 400 "vendor_code already exists" because the
 *   update controller re-$set the empty string.
 *
 *   The create controller already strips empty vendor_code before insert.
 *   The update controller now does the same (and uses $unset). This script
 *   cleans up the legacy rows that were saved with vendor_code='' before
 *   either fix landed.
 *
 * What this script does:
 *   - Reports how many vendors per entity have vendor_code === '' or only
 *     whitespace.
 *   - When --apply, runs `$unset: { vendor_code: '' }` on those rows.
 *
 * Idempotent: safe to run multiple times.
 *
 * Usage (from backend/):
 *   node erp/scripts/fixVendorEmptyCode.js           # dry-run / report
 *   node erp/scripts/fixVendorEmptyCode.js --apply   # unset empty codes
 */
require('dotenv').config();
const mongoose = require('mongoose');

const APPLY = process.argv.includes('--apply');

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log(`Connected. Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}`);

  const VendorMaster = require('../models/VendorMaster');
  const coll = VendorMaster.collection;

  const filter = {
    $or: [
      { vendor_code: '' },
      { vendor_code: { $regex: /^\s+$/ } }
    ]
  };

  const total = await coll.countDocuments(filter);
  console.log(`\nFound ${total} vendor(s) with empty/whitespace vendor_code.`);

  if (total === 0) {
    console.log('Nothing to fix.');
    await mongoose.disconnect();
    return;
  }

  const perEntity = await coll.aggregate([
    { $match: filter },
    { $group: { _id: '$entity_id', count: { $sum: 1 }, names: { $push: '$vendor_name' } } },
    { $sort: { count: -1 } }
  ]).toArray();

  console.log('\nBreakdown by entity:');
  for (const row of perEntity) {
    const sample = row.names.slice(0, 3).join(', ') + (row.names.length > 3 ? `, …(+${row.names.length - 3} more)` : '');
    console.log(`  entity_id=${row._id}  count=${row.count}  e.g. ${sample}`);
  }

  if (!APPLY) {
    console.log('\nDRY-RUN — re-run with --apply to $unset vendor_code on these rows.');
    await mongoose.disconnect();
    return;
  }

  const result = await coll.updateMany(filter, { $unset: { vendor_code: '' } });
  console.log(`\nApplied. matched=${result.matchedCount}  modified=${result.modifiedCount}`);

  await mongoose.disconnect();
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
