/**
 * Phase A.5.4 follow-on — Union loser's assignedTo into winner's assignedTo
 * for every DoctorMergeAudit row in status=APPLIED.
 *
 * Why this exists:
 *   The May 04 2026 bulk dupe-merge sweep (Iloilo territory overlap) merged
 *   263 Doctor pairs across dev+prod. The merge service (A.5.5) deactivates
 *   the loser (mergedInto + isActive=false) but does NOT touch the winner's
 *   assignedTo. Pre-A.5.4 that was unavoidable — assignedTo was a scalar so
 *   "two BDMs on one doctor" had no representation. Post-A.5.4 the field is
 *   an array, and shared coverage [WinnerBDM, LoserBDM] is the canonical
 *   shape.
 *
 *   So BDMs whose VIP Clients were absorbed as merge losers lost coverage
 *   that they should still have. Concrete symptom (Jake Montero, May 06):
 *     - Dashboard shows 51 active VIPs (winners assigned only to OTHER BDMs)
 *     - 403 "no access to this VIP Client" when clicking re-engagement alerts
 *       for doctors he visited pre-merge but no longer "owns"
 *   After this backfill: winner.assignedTo = unique union of winner's current
 *   assignedTo + every APPLIED-loser's assignedTo. Jake's coverage restored
 *   via shared multi-BDM ownership.
 *
 * Modes (both idempotent):
 *   (no flag)   — report what would change. No writes. Per-winner diff log.
 *   --apply     — write the union back to each winner.
 *
 * Usage (from project root):
 *   node backend/scripts/backfillAssigneeUnionAfterMerge.js
 *   node backend/scripts/backfillAssigneeUnionAfterMerge.js --apply
 *
 * Required env:
 *   MONGO_URI
 *
 * Safety:
 *   - Reads via raw collection so it tolerates docs in either scalar or
 *     array shape (i.e. it does NOT depend on migrateAssignedToArray.js
 *     having run first).
 *   - Only touches winners — losers are left soft-deleted as-is. Loser's
 *     assignedTo is read but never overwritten.
 *   - Skips ROLLED_BACK and HARD_DELETED audit rows (only APPLIED merges
 *     contribute coverage). Hard-deleted losers cannot contribute
 *     because the loser doc is gone — script logs and skips.
 *   - Does NOT change winner.primaryAssignee. The merge winner's primary
 *     was set by admin at merge time; restoring loser's BDMs as
 *     additional assignees does not promote them to primary.
 *   - Idempotent: running twice produces the same union (set semantics).
 *
 * Sequencing:
 *   Run AFTER migrateAssignedToArray.js --apply (so winner shapes are
 *   already normalized to array). If you run this first, it still works
 *   (raw read tolerates both shapes), but the winner doc will end up
 *   array-shaped via this script's $set, leaving the assignedTo array
 *   migration partially complete for losers. Cleanest order is shape
 *   migration → union backfill.
 */

require('dotenv').config();
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error('ERROR: MONGO_URI not set in environment variables');
  process.exit(1);
}

const APPLY = process.argv.includes('--apply');

function toIdString(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  if (value._id) return value._id.toString();
  if (typeof value.toString === 'function') return value.toString();
  return null;
}

function readAssignedToAsIdStrings(doc) {
  if (!doc) return [];
  const raw = doc.assignedTo;
  if (raw === null || raw === undefined) return [];
  if (Array.isArray(raw)) return raw.map(toIdString).filter(Boolean);
  const id = toIdString(raw);
  return id ? [id] : [];
}

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log(`Connected. Mode: ${APPLY ? 'APPLY' : 'DRY_RUN'}`);

  const audits = mongoose.connection.collection('doctor_merge_audits');
  const doctors = mongoose.connection.collection('doctors');

  const appliedAudits = await audits.find(
    { status: 'APPLIED' },
    { projection: { _id: 1, winner_id: 1, loser_id: 1, status: 1 } },
  ).toArray();

  console.log('');
  console.log(`APPLIED merge audits: ${appliedAudits.length}`);

  if (!appliedAudits.length) {
    console.log('No APPLIED merges. Nothing to backfill.');
    await mongoose.disconnect();
    return;
  }

  // Group by winner so we can union ALL absorbed losers per winner in one write.
  const lostersByWinner = new Map();
  for (const a of appliedAudits) {
    const winnerKey = toIdString(a.winner_id);
    if (!winnerKey) continue;
    if (!lostersByWinner.has(winnerKey)) lostersByWinner.set(winnerKey, []);
    lostersByWinner.get(winnerKey).push(toIdString(a.loser_id));
  }

  const winnerIdSet = Array.from(lostersByWinner.keys()).map(
    (k) => new mongoose.Types.ObjectId(k),
  );
  const allLoserIds = appliedAudits
    .map((a) => toIdString(a.loser_id))
    .filter(Boolean);

  const winnerDocs = await doctors.find(
    { _id: { $in: winnerIdSet } },
    { projection: { _id: 1, assignedTo: 1, primaryAssignee: 1, isActive: 1, lastName: 1, firstName: 1 } },
  ).toArray();
  const winnerById = new Map(winnerDocs.map((d) => [d._id.toString(), d]));

  const loserDocs = await doctors.find(
    { _id: { $in: allLoserIds.map((s) => new mongoose.Types.ObjectId(s)) } },
    { projection: { _id: 1, assignedTo: 1, lastName: 1, firstName: 1, mergedInto: 1, isActive: 1 } },
  ).toArray();
  const loserById = new Map(loserDocs.map((d) => [d._id.toString(), d]));

  let winnersToTouch = 0;
  let totalAssigneesAdded = 0;
  let losersMissing = 0;
  let losersWithNoAssignee = 0;
  const perBdmAddedCount = new Map();

  const updates = []; // {winnerId, newAssignedToObjectIds, addedBdms, prevIds}

  for (const [winnerKey, loserKeys] of lostersByWinner.entries()) {
    const winner = winnerById.get(winnerKey);
    if (!winner) {
      // Winner doc missing entirely — extreme edge case (cascade-corrupted).
      console.log(`  ⚠ winner ${winnerKey} doc not found, skipping`);
      continue;
    }
    const winnerCurrent = readAssignedToAsIdStrings(winner);

    const accumulated = new Set(winnerCurrent);
    const addedThisRound = new Set();

    for (const loserKey of loserKeys) {
      const loser = loserById.get(loserKey);
      if (!loser) {
        losersMissing++;
        continue;
      }
      const loserAssignees = readAssignedToAsIdStrings(loser);
      if (!loserAssignees.length) {
        losersWithNoAssignee++;
        continue;
      }
      for (const id of loserAssignees) {
        if (!accumulated.has(id)) {
          accumulated.add(id);
          addedThisRound.add(id);
        }
      }
    }

    if (addedThisRound.size === 0) continue; // no-op for this winner — already covers all loser BDMs

    winnersToTouch++;
    totalAssigneesAdded += addedThisRound.size;
    for (const id of addedThisRound) {
      perBdmAddedCount.set(id, (perBdmAddedCount.get(id) || 0) + 1);
    }

    updates.push({
      winnerId: winner._id,
      winnerLabel: `Dr. ${winner.lastName || '?'}, ${winner.firstName || '?'}`,
      prevIds: winnerCurrent,
      newAssignedToObjectIds: Array.from(accumulated).map(
        (s) => new mongoose.Types.ObjectId(s),
      ),
      addedBdms: Array.from(addedThisRound),
    });
  }

  console.log('');
  console.log('Backfill plan:');
  console.log(`  • winners that need an update:        ${winnersToTouch}`);
  console.log(`  • total (winner × added-BDM) pairs:   ${totalAssigneesAdded}`);
  console.log(`  • losers missing from doctors coll:   ${losersMissing} (cascade hard-deleted)`);
  console.log(`  • losers with empty assignedTo:       ${losersWithNoAssignee} (nothing to contribute)`);

  if (perBdmAddedCount.size > 0) {
    console.log('');
    console.log('Coverage to be restored, by BDM (top 20):');
    const userColl = mongoose.connection.collection('users');
    const bdmIds = Array.from(perBdmAddedCount.keys()).map(
      (s) => new mongoose.Types.ObjectId(s),
    );
    const bdmUsers = await userColl
      .find(
        { _id: { $in: bdmIds } },
        { projection: { _id: 1, name: 1, email: 1 } },
      )
      .toArray();
    const bdmName = new Map(
      bdmUsers.map((u) => [u._id.toString(), u.name || u.email || '?']),
    );
    const sorted = Array.from(perBdmAddedCount.entries()).sort(
      (a, b) => b[1] - a[1],
    );
    for (const [bdmId, count] of sorted.slice(0, 20)) {
      console.log(
        `    + ${count.toString().padStart(4)}  ${bdmName.get(bdmId) || bdmId}`,
      );
    }
    if (sorted.length > 20) {
      console.log(`    ... (${sorted.length - 20} more BDMs)`);
    }
  }

  if (!APPLY) {
    console.log('');
    console.log('DRY-RUN — rerun with --apply to write the union.');
    if (updates.length > 0 && updates.length <= 5) {
      console.log('');
      console.log('Sample updates:');
      for (const u of updates.slice(0, 5)) {
        console.log(
          `    ${u.winnerLabel}: ${u.prevIds.length} → ${u.newAssignedToObjectIds.length} (added ${u.addedBdms.length})`,
        );
      }
    }
    await mongoose.disconnect();
    return;
  }

  console.log('');
  console.log('Applying union backfill ...');

  let written = 0;
  for (const u of updates) {
    await doctors.updateOne(
      { _id: u.winnerId },
      { $set: { assignedTo: u.newAssignedToObjectIds } },
    );
    written++;
  }

  console.log(`✓ Winners updated: ${written}`);
  console.log(`✓ Total new (winner × BDM) coverage edges: ${totalAssigneesAdded}`);
  console.log('');
  console.log('Backfill complete. Note: winner.primaryAssignee was NOT changed.');

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
