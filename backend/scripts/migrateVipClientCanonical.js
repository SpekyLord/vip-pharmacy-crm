/**
 * VIP Client Canonicalization — Phase A.5.1 Migration
 *
 * Context:
 *   Phase A.5 introduces a canonical name key (`vip_client_name_clean`) on the Doctor
 *   model, mirroring ERP `Customer.customer_name_clean` (Phase G5) and
 *   `Hospital.hospital_name_clean`. Two BDMs covering the same territory currently
 *   create separate Doctor records for the same real-world MD (e.g. Jake Montero +
 *   Romela Shen both visiting "Dr. Sharon" in Iloilo). The canonical key lets us
 *   dedupe them and (via A.5.4) share one record across multiple BDM assignees.
 *
 *   This script handles the A.5.1 backfill step: it populates `vip_client_name_clean`
 *   and `primaryAssignee` for every existing active Doctor. It does NOT create the
 *   unique index yet — that waits until A.5.5's admin merge tool has resolved any
 *   duplicates (the `--add-unique-index` flag is the final step once the duplicate
 *   report is empty).
 *
 * Modes:
 *   (no flag)            — report duplicate groups + backfill-needed counts. No writes.
 *   --apply              — populate vip_client_name_clean + primaryAssignee for all
 *                          active Doctors where they are missing or stale.
 *                          Safe to run repeatedly (idempotent).
 *   --add-unique-index   — after duplicates are fully merged via A.5.5 UI, flip the
 *                          `vip_client_name_clean_1` index to `{ unique: true }`.
 *                          Refuses when duplicates still exist.
 *
 * Usage (from project root):
 *   node backend/scripts/migrateVipClientCanonical.js
 *   node backend/scripts/migrateVipClientCanonical.js --apply
 *   node backend/scripts/migrateVipClientCanonical.js --add-unique-index
 *
 * Required env:
 *   MONGO_URI
 *
 * Safety:
 *   - Operates only on `isActive: true` Doctors (ignores already-deleted records).
 *   - Skips documents where `vip_client_name_clean` already matches the expected value,
 *     so repeated runs are cheap.
 *   - Prints dry-run totals before --apply performs any writes.
 *   - --add-unique-index uses `createIndex(..., { unique: true })` and refuses on
 *     DuplicateKey errors, matching the G5 Customer migration behavior.
 */

require('dotenv').config();
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error('ERROR: MONGO_URI not set in environment variables');
  process.exit(1);
}

const MODE = process.argv.includes('--add-unique-index')
  ? 'UNIQUE_INDEX'
  : process.argv.includes('--apply')
  ? 'APPLY'
  : 'DRY_RUN';

/**
 * Compute the canonical `vip_client_name_clean` for a Doctor.
 * Shape: `lastname|firstname` (lowercased, inner whitespace collapsed).
 * Mirrors the Doctor pre-save hook so in-app writes and backfill agree.
 */
function computeClean(firstName, lastName) {
  const last = (lastName || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const first = (firstName || '').toLowerCase().replace(/\s+/g, ' ').trim();
  return `${last}|${first}`;
}

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log(`Connected. Mode: ${MODE}`);

  const Doctor = require('../models/Doctor');
  const Visit = require('../models/Visit');
  const coll = Doctor.collection;

  // ---------- 1. Duplicate report (always runs, read-only) ----------
  const docs = await Doctor.find({ isActive: true })
    .select('_id firstName lastName assignedTo vip_client_name_clean primaryAssignee')
    .populate('assignedTo', 'name email')
    .lean();

  console.log('');
  console.log(`Active Doctors scanned: ${docs.length}`);

  const keyGroups = new Map();
  let needsKeyBackfill = 0;
  let needsPrimaryBackfill = 0;
  for (const d of docs) {
    const expectedKey = computeClean(d.firstName, d.lastName);
    if (d.vip_client_name_clean !== expectedKey) needsKeyBackfill++;
    if (!d.primaryAssignee && d.assignedTo) needsPrimaryBackfill++;
    if (!keyGroups.has(expectedKey)) keyGroups.set(expectedKey, []);
    keyGroups.get(expectedKey).push(d);
  }

  const dupeGroups = Array.from(keyGroups.entries()).filter(([, arr]) => arr.length > 1);
  console.log(`  • need vip_client_name_clean backfill: ${needsKeyBackfill}`);
  console.log(`  • need primaryAssignee backfill:       ${needsPrimaryBackfill}`);
  console.log(`  • duplicate canonical-key groups:      ${dupeGroups.length}`);

  if (dupeGroups.length) {
    console.log('');
    console.log('Duplicate groups (canonical-key → {firstName lastName} [assignee]):');
    // Include visit counts to help admin choose merge winners in A.5.5
    const idList = dupeGroups.flatMap(([, arr]) => arr.map(d => d._id));
    const visitCounts = await Visit.aggregate([
      { $match: { doctor: { $in: idList } } },
      { $group: { _id: '$doctor', count: { $sum: 1 } } },
    ]);
    const visitMap = new Map(visitCounts.map(v => [String(v._id), v.count]));

    for (const [key, arr] of dupeGroups.slice(0, 25)) {
      console.log(`  • "${key}" x${arr.length}`);
      for (const d of arr) {
        const assigneeName = d.assignedTo?.name || '—';
        const vc = visitMap.get(String(d._id)) || 0;
        console.log(`      - ${d._id} "${d.firstName} ${d.lastName}" [${assigneeName}] visits=${vc}`);
      }
    }
    if (dupeGroups.length > 25) console.log(`    …and ${dupeGroups.length - 25} more groups.`);
    console.log('');
    console.log('  → Resolve these via the Admin "Duplicates" tab (A.5.5 merge tool, ships next).');
  }

  // ---------- 2. UNIQUE_INDEX mode (final step after A.5.5 dedup) ----------
  if (MODE === 'UNIQUE_INDEX') {
    if (dupeGroups.length) {
      console.log('');
      console.log('REFUSING to create unique index — duplicates still present.');
      console.log('  Merge all duplicate groups via the A.5.5 admin UI, then rerun.');
      await mongoose.disconnect();
      process.exit(1);
    }

    const existing = await coll.indexes();
    const hasUnique = existing.some(i =>
      i.name === 'vip_client_name_clean_1' && i.unique === true
    );
    if (hasUnique) {
      console.log('');
      console.log('✓ Unique index already present — nothing to do.');
      await mongoose.disconnect();
      return;
    }

    // Drop the non-unique A.5.1 index first, then recreate as unique.
    const hasPlain = existing.some(i => i.name === 'vip_client_name_clean_1');
    if (hasPlain) {
      console.log('');
      console.log('Dropping non-unique index vip_client_name_clean_1 ...');
      await coll.dropIndex('vip_client_name_clean_1');
    }

    try {
      await coll.createIndex({ vip_client_name_clean: 1 }, { unique: true });
      console.log('✓ Unique index vip_client_name_clean_1 created.');
    } catch (err) {
      console.error(`✗ createIndex failed: ${err.message}`);
      // Rebuild the non-unique index so the collection isn't left without one.
      await coll.createIndex({ vip_client_name_clean: 1 });
      console.log('  Rebuilt non-unique index for safety — no data change.');
      await mongoose.disconnect();
      process.exit(1);
    }
    await mongoose.disconnect();
    return;
  }

  // ---------- 3. APPLY mode (backfill canonical key + primaryAssignee) ----------
  if (MODE !== 'APPLY') {
    console.log('');
    console.log('DRY-RUN — rerun with --apply to write the backfill.');
    await mongoose.disconnect();
    return;
  }

  console.log('');
  console.log(`Applying backfill to ${needsKeyBackfill + needsPrimaryBackfill} field updates across ${docs.length} Doctors ...`);

  let updated = 0;
  for (const d of docs) {
    const expectedKey = computeClean(d.firstName, d.lastName);
    const set = {};
    if (d.vip_client_name_clean !== expectedKey) set.vip_client_name_clean = expectedKey;
    if (!d.primaryAssignee && d.assignedTo) {
      // assignedTo is currently the scalar User ref (or populated User); store its _id.
      set.primaryAssignee = d.assignedTo?._id || d.assignedTo;
    }
    if (Object.keys(set).length === 0) continue;

    // Use updateOne to avoid triggering pre-save (pre-save would recompute the key from
    // firstName/lastName — which is exactly what we want — but it also runs cleanName,
    // which may hit the Lookup DB. Direct updateOne is faster + deterministic for bulk.)
    await coll.updateOne({ _id: d._id }, { $set: set });
    updated++;
  }

  console.log(`✓ Backfill complete — ${updated} Doctor documents updated.`);
  console.log('');
  if (dupeGroups.length) {
    console.log('NEXT: resolve the ' + dupeGroups.length + ' duplicate group(s) via the');
    console.log('      A.5.5 admin "Duplicates" tab, then run:');
    console.log('      node backend/scripts/migrateVipClientCanonical.js --add-unique-index');
  } else {
    console.log('NEXT: no duplicates — you can safely run:');
    console.log('      node backend/scripts/migrateVipClientCanonical.js --add-unique-index');
  }

  await mongoose.disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
