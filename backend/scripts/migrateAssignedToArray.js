/**
 * Phase A.5.4 — assignedTo scalar → array migration
 *
 * Context:
 *   Phase A.5.4 flips Doctor.assignedTo from a single-ObjectId scalar to an
 *   array of ObjectId references so multiple BDMs can share one VIP Client
 *   (Iloilo territory overlap is the canonical example: Jake Montero and
 *   Romela Shen both visiting Dr. Sharon → one shared Doctor record).
 *
 *   Mongoose's array schema declaration changes the runtime CAST behavior on
 *   new writes, but on-disk documents that still hold a scalar value will
 *   continue to deserialize unevenly across read paths. This script sweeps
 *   the live data so every document is in the canonical [ObjectId, ...]
 *   shape, eliminating that ambiguity.
 *
 * Modes (all idempotent):
 *   (no flag)            — report current shape distribution. No writes.
 *   --apply              — for every Doctor whose assignedTo is a non-array
 *                          ObjectId or is missing entirely, normalize:
 *                            - scalar ObjectId → [ObjectId]
 *                            - missing/null    → [] (empty array)
 *                          Always re-syncs primaryAssignee so it equals
 *                          assignedTo[0] when missing or stale.
 *
 * Usage (from project root):
 *   node backend/scripts/migrateAssignedToArray.js
 *   node backend/scripts/migrateAssignedToArray.js --apply
 *
 * Required env:
 *   MONGO_URI
 *
 * Safety:
 *   - Reads via the raw collection (.find().toArray()) to bypass Mongoose
 *     schema casting, so we see the true on-disk shape.
 *   - Writes via raw collection.updateOne() so we don't trigger pre-save
 *     hooks that would re-derive vip_client_name_clean unnecessarily.
 *   - Idempotent: documents already in array shape are skipped.
 *
 * Sequencing:
 *   This script must run BEFORE the schema flip is deployed if the codebase
 *   has any reader that depends on the legacy scalar shape — otherwise that
 *   reader will receive an array and miscompare. Phase A.5.4 ships the
 *   schema flip + reader sweep + this migration as one logical unit; run
 *   --apply on the cluster immediately after deploy.
 */

require('dotenv').config();
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error('ERROR: MONGO_URI not set in environment variables');
  process.exit(1);
}

const APPLY = process.argv.includes('--apply');

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log(`Connected. Mode: ${APPLY ? 'APPLY' : 'DRY_RUN'}`);

  const coll = mongoose.connection.collection('doctors');

  const docs = await coll.find({}, {
    projection: { _id: 1, assignedTo: 1, primaryAssignee: 1, isActive: 1, mergedInto: 1 },
  }).toArray();

  console.log('');
  console.log(`Doctors scanned: ${docs.length}`);

  let alreadyArray = 0;
  let scalarToConvert = 0;
  let missing = 0;
  let primaryStale = 0;
  let primaryUnset = 0;

  for (const d of docs) {
    if (Array.isArray(d.assignedTo)) {
      alreadyArray++;
    } else if (d.assignedTo) {
      scalarToConvert++;
    } else {
      missing++;
    }

    // Inspect primaryAssignee state
    const ids = Array.isArray(d.assignedTo)
      ? d.assignedTo.map((x) => (x && x.toString ? x.toString() : null)).filter(Boolean)
      : (d.assignedTo ? [d.assignedTo.toString()] : []);
    const primary = d.primaryAssignee ? d.primaryAssignee.toString() : null;
    if (ids.length > 0) {
      if (!primary) primaryUnset++;
      else if (!ids.includes(primary)) primaryStale++;
    }
  }

  console.log(`  • already array:                    ${alreadyArray}`);
  console.log(`  • scalar → needs convert to array:  ${scalarToConvert}`);
  console.log(`  • missing/null assignedTo:          ${missing}`);
  console.log(`  • primaryAssignee unset (assigned): ${primaryUnset}`);
  console.log(`  • primaryAssignee stale (assigned): ${primaryStale}`);

  if (!APPLY) {
    console.log('');
    console.log('DRY-RUN — rerun with --apply to write the migration.');
    await mongoose.disconnect();
    return;
  }

  console.log('');
  console.log('Applying migration ...');

  let convertedShape = 0;
  let setMissingArray = 0;
  let resetPrimary = 0;

  for (const d of docs) {
    const update = {};

    // 1. Normalize assignedTo to array shape
    if (!Array.isArray(d.assignedTo)) {
      if (d.assignedTo) {
        update.assignedTo = [d.assignedTo];
        convertedShape++;
      } else {
        update.assignedTo = [];
        setMissingArray++;
      }
    }

    // 2. Re-sync primaryAssignee
    const newAssignedTo = update.assignedTo !== undefined ? update.assignedTo : d.assignedTo;
    const ids = Array.isArray(newAssignedTo)
      ? newAssignedTo.map((x) => (x && x.toString ? x.toString() : null)).filter(Boolean)
      : [];
    const primary = d.primaryAssignee ? d.primaryAssignee.toString() : null;
    if (ids.length > 0 && (!primary || !ids.includes(primary))) {
      update.primaryAssignee = newAssignedTo[0];
      resetPrimary++;
    } else if (ids.length === 0 && primary) {
      update.primaryAssignee = null;
      resetPrimary++;
    }

    if (Object.keys(update).length === 0) continue;
    await coll.updateOne({ _id: d._id }, { $set: update });
  }

  console.log(`✓ Converted scalar → array:        ${convertedShape}`);
  console.log(`✓ Set missing assignedTo to []:    ${setMissingArray}`);
  console.log(`✓ Re-synced primaryAssignee:       ${resetPrimary}`);
  console.log('');
  console.log('Migration complete.');

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
