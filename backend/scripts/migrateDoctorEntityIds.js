/**
 * Phase E1 — Doctor.entity_ids[] backfill migration
 *
 * Context:
 *   Phase E1 (May 2026) introduces `Doctor.entity_ids: [ObjectId]` so the CRM
 *   can scope VIP-Client queries by entity. The field is auto-derived by the
 *   pre-save / pre-findOneAndUpdate hooks on every write going forward. This
 *   script seeds the field for the existing population (every Doctor in the
 *   cluster as of the deploy date).
 *
 *   The derivation rule mirrors the model hook exactly:
 *     entity_ids = union over a in assignedTo:
 *       (a.entity_ids if non-empty else [a.entity_id] if set else ∅)
 *
 *   Doctors with no assignees (CPT pool not yet covered) get `entity_ids: []`,
 *   which means "no BDM coverage". They remain visible to admin via the
 *   privileged cross-entity opt-in but are invisible to any BDM picker until
 *   coverage is assigned.
 *
 * Modes (all idempotent):
 *   (no flag)            — report distribution and the would-write payload size.
 *                          No writes. Safe to run any time.
 *   --apply              — write entity_ids on every doctor whose current value
 *                          differs from the freshly-derived set. Skips no-ops.
 *
 *   Optional flags:
 *     --limit=<n>        — process only first N doctors (for staged rollout
 *                          on very large clusters; default = unlimited).
 *     --include-merged   — also backfill mergedInto-soft-deleted rows (default
 *                          skips them since they're slated for hard-delete).
 *
 * Usage (from project root):
 *   node backend/scripts/migrateDoctorEntityIds.js
 *   node backend/scripts/migrateDoctorEntityIds.js --apply
 *   node backend/scripts/migrateDoctorEntityIds.js --apply --include-merged
 *
 * Required env:
 *   MONGO_URI
 *
 * Safety:
 *   - Reads via raw collection (.find().toArray()) so we observe true on-disk
 *     shapes regardless of schema casting.
 *   - Writes via raw .updateOne($set:) so the pre-save hook is skipped (we're
 *     computing the exact same union it would).
 *   - Idempotent: a second --apply run after the first is a no-op.
 *   - Reports per-entity distribution so the operator can sanity-check the
 *     derivation against operator expectations BEFORE flipping --apply.
 *
 * Sequencing:
 *   Slice 1 — model + this script ship together. --apply runs immediately
 *   after deploy. Phase E1 Slice 2 (rebate matrix entity-scope filter) reads
 *   the field, so the picker fix only takes effect once this script has run.
 */
'use strict';

require('dotenv').config();
const path = require('path');
const mongoose = require('mongoose');

// Load .env from backend/ if present (matches sibling migration scripts).
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error('ERROR: MONGO_URI not set in environment variables');
  process.exit(1);
}

const APPLY = process.argv.includes('--apply');
const INCLUDE_MERGED = process.argv.includes('--include-merged');
const LIMIT_FLAG = process.argv.find((a) => a.startsWith('--limit='));
const LIMIT = LIMIT_FLAG ? Number(LIMIT_FLAG.split('=')[1]) : null;

function sortedStringIds(arr) {
  if (!Array.isArray(arr)) return [];
  return arr
    .map((x) => (x && x.toString ? x.toString() : null))
    .filter(Boolean)
    .sort();
}

function setsEqual(aArr, bArr) {
  const a = sortedStringIds(aArr);
  const b = sortedStringIds(bArr);
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

async function main() {
  console.log('');
  console.log('═══ Phase E1 — Doctor.entity_ids backfill ═══');
  console.log(`Mode:           ${APPLY ? 'APPLY' : 'DRY_RUN'}`);
  console.log(`Include merged: ${INCLUDE_MERGED ? 'yes' : 'no'}`);
  if (LIMIT) console.log(`Limit:          ${LIMIT}`);
  console.log('');

  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB');

  const doctorsColl = mongoose.connection.collection('doctors');
  const usersColl = mongoose.connection.collection('users');

  // Build the doctor cursor. Exclude soft-deleted rows by default.
  const filter = INCLUDE_MERGED ? {} : { mergedInto: null };
  const cursor = doctorsColl.find(filter, {
    projection: { _id: 1, assignedTo: 1, entity_ids: 1, isActive: 1, mergedInto: 1 },
  });
  if (LIMIT) cursor.limit(LIMIT);
  const docs = await cursor.toArray();
  console.log(`Doctors scanned: ${docs.length}`);

  // Collect all unique assignee user ids in one pass — single User read per run.
  const userIdSet = new Set();
  for (const d of docs) {
    if (Array.isArray(d.assignedTo)) {
      for (const a of d.assignedTo) {
        if (a && a.toString) userIdSet.add(a.toString());
      }
    } else if (d.assignedTo && d.assignedTo.toString) {
      userIdSet.add(d.assignedTo.toString());
    }
  }
  const userIds = Array.from(userIdSet).map((s) => new mongoose.Types.ObjectId(s));

  console.log(`Unique BDMs across assignedTo: ${userIds.length}`);

  // Pull each BDM's effective entity set.
  const users = await usersColl
    .find({ _id: { $in: userIds } }, { projection: { _id: 1, entity_id: 1, entity_ids: 1 } })
    .toArray();
  const userEntityMap = new Map();
  for (const u of users) {
    let entities = [];
    if (Array.isArray(u.entity_ids) && u.entity_ids.length > 0) {
      entities = u.entity_ids.map((e) => e.toString());
    } else if (u.entity_id) {
      entities = [u.entity_id.toString()];
    }
    userEntityMap.set(u._id.toString(), entities);
  }

  // Build derivation per doctor and bucket the work.
  let alreadyCorrect = 0;
  let needsBackfill = 0;
  let unassigned = 0;
  let unassignedAlreadyEmpty = 0;
  let assigneesWithoutEntities = 0;
  const entityDistribution = new Map();
  const writeBatch = [];

  for (const d of docs) {
    const assigneeIds = Array.isArray(d.assignedTo)
      ? d.assignedTo.map((x) => (x && x.toString ? x.toString() : null)).filter(Boolean)
      : (d.assignedTo && d.assignedTo.toString ? [d.assignedTo.toString()] : []);

    if (assigneeIds.length === 0) {
      unassigned++;
      const wantEmpty = [];
      const haveEmpty = !Array.isArray(d.entity_ids) || d.entity_ids.length === 0;
      if (haveEmpty) {
        unassignedAlreadyEmpty++;
        alreadyCorrect++;
      } else {
        needsBackfill++;
        writeBatch.push({ _id: d._id, entity_ids: wantEmpty });
      }
      continue;
    }

    const entitySet = new Set();
    let assigneeCoverageMissing = false;
    for (const aid of assigneeIds) {
      const entities = userEntityMap.get(aid);
      if (!entities || entities.length === 0) {
        assigneeCoverageMissing = true;
      } else {
        for (const e of entities) entitySet.add(e);
      }
    }
    if (assigneeCoverageMissing && entitySet.size === 0) {
      // All assignees lack entity coverage. Still backfill — entity_ids = []
      // is the honest answer until admin completes BDM entity_ids assignment.
      assigneesWithoutEntities++;
    }

    const derived = Array.from(entitySet).sort();
    const current = sortedStringIds(d.entity_ids);

    // Track distribution for operator review.
    for (const e of derived) {
      entityDistribution.set(e, (entityDistribution.get(e) || 0) + 1);
    }

    if (setsEqual(current, derived)) {
      alreadyCorrect++;
    } else {
      needsBackfill++;
      writeBatch.push({
        _id: d._id,
        entity_ids: derived.map((s) => new mongoose.Types.ObjectId(s)),
      });
    }
  }

  console.log('');
  console.log('Backfill plan:');
  console.log(`  • already correct:                   ${alreadyCorrect}`);
  console.log(`  • needs backfill:                    ${needsBackfill}`);
  console.log(`  • unassigned (entity_ids := []):     ${unassigned} (${unassignedAlreadyEmpty} already empty)`);
  console.log(`  • assignees missing entity coverage: ${assigneesWithoutEntities}`);
  console.log('');
  console.log('Per-entity distribution (assigned doctors):');
  const sortedEntities = Array.from(entityDistribution.entries()).sort((a, b) => b[1] - a[1]);
  for (const [eid, count] of sortedEntities) {
    console.log(`  • ${eid}: ${count}`);
  }

  if (!APPLY) {
    console.log('');
    console.log('DRY-RUN — rerun with --apply to write the backfill.');
    await mongoose.disconnect();
    return;
  }

  if (writeBatch.length === 0) {
    console.log('');
    console.log('Nothing to write — every doctor already in canonical shape.');
    await mongoose.disconnect();
    return;
  }

  console.log('');
  console.log(`Applying — writing ${writeBatch.length} updates...`);

  let written = 0;
  for (const w of writeBatch) {
    await doctorsColl.updateOne(
      { _id: w._id },
      { $set: { entity_ids: w.entity_ids } },
    );
    written++;
    if (written % 100 === 0) console.log(`  ${written}/${writeBatch.length}`);
  }

  console.log(`✓ Wrote entity_ids on ${written} doctors`);
  console.log('');
  console.log('Backfill complete.');
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
