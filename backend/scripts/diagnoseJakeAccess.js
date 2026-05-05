/**
 * One-shot diagnostic for Jake Montero's "60 vs 69" + access-denied symptom.
 *
 * Reports:
 *   1. Jake's user record (s19.vippharmacy@gmail.com)
 *   2. Count of doctors with Jake in assignedTo (active + inactive)
 *   3. Count of doctors with Jake as primaryAssignee
 *   4. APPLIED merges where the LOSER had Jake in assignedTo:
 *        - count
 *        - and for each, whether the WINNER currently has Jake too
 *   5. Direct lookup of "Luz Catedral" — show assignedTo, primaryAssignee,
 *      isActive, mergedInto for ALL matching docs
 *
 * Read-only. No writes.
 */

require('dotenv').config();
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error('ERROR: MONGO_URI not set');
  process.exit(1);
}

const JAKE_EMAIL = 's19.vippharmacy@gmail.com';

function toIdString(v) {
  if (!v) return null;
  if (typeof v === 'string') return v;
  return v.toString();
}

function readAssignees(doc) {
  if (!doc) return [];
  const raw = doc.assignedTo;
  if (raw === null || raw === undefined) return [];
  if (Array.isArray(raw)) return raw.map(toIdString).filter(Boolean);
  const id = toIdString(raw);
  return id ? [id] : [];
}

async function main() {
  await mongoose.connect(MONGO_URI);

  const users = mongoose.connection.collection('users');
  const doctors = mongoose.connection.collection('doctors');
  const audits = mongoose.connection.collection('doctor_merge_audits');

  console.log(`Cluster: ${mongoose.connection.db.databaseName}`);
  console.log('');

  // 1. Find Jake
  const jake = await users.findOne({ email: JAKE_EMAIL });
  if (!jake) {
    console.log(`✗ No user found with email ${JAKE_EMAIL}`);
    await mongoose.disconnect();
    return;
  }
  const jakeId = jake._id.toString();
  console.log(`Jake: ${jake.name || '?'} <${jake.email}> _id=${jakeId} role=${jake.role || '?'}`);
  console.log('');

  // 2 + 3. Count doctors with Jake in assignedTo or primaryAssignee
  const jakeOid = jake._id;

  const totalAssignedActive = await doctors.countDocuments({
    assignedTo: jakeOid,
    isActive: true,
  });
  const totalAssignedAll = await doctors.countDocuments({
    assignedTo: jakeOid,
  });
  const totalAssignedInactive = totalAssignedAll - totalAssignedActive;
  const totalPrimaryActive = await doctors.countDocuments({
    primaryAssignee: jakeOid,
    isActive: true,
  });

  console.log(`Doctors with Jake in assignedTo (active):   ${totalAssignedActive}`);
  console.log(`Doctors with Jake in assignedTo (inactive): ${totalAssignedInactive}`);
  console.log(`Doctors with Jake as primaryAssignee active: ${totalPrimaryActive}`);
  console.log('');

  // 4. APPLIED merges where loser had Jake
  const appliedAudits = await audits.find(
    { status: 'APPLIED' },
    { projection: { winner_id: 1, loser_id: 1, loser_snapshot: 1, winner_snapshot: 1 } },
  ).toArray();

  const loserIds = appliedAudits.map((a) => a.loser_id).filter(Boolean);
  const losersDocs = await doctors
    .find(
      { _id: { $in: loserIds } },
      { projection: { _id: 1, assignedTo: 1, lastName: 1, firstName: 1 } },
    )
    .toArray();
  const loserById = new Map(losersDocs.map((d) => [d._id.toString(), d]));

  const winnerIds = appliedAudits.map((a) => a.winner_id).filter(Boolean);
  const winnersDocs = await doctors
    .find(
      { _id: { $in: winnerIds } },
      { projection: { _id: 1, assignedTo: 1, primaryAssignee: 1, lastName: 1, firstName: 1, isActive: 1 } },
    )
    .toArray();
  const winnerById = new Map(winnersDocs.map((d) => [d._id.toString(), d]));

  let losersWithJake = 0;
  let winnersAlreadyHaveJake = 0;
  let winnersMissingJake = 0;
  const examplesMissing = [];

  for (const a of appliedAudits) {
    const loserKey = toIdString(a.loser_id);
    const winnerKey = toIdString(a.winner_id);
    const loser = loserById.get(loserKey);
    if (!loser) continue;
    const loserAssignees = readAssignees(loser);
    if (!loserAssignees.includes(jakeId)) continue;
    losersWithJake++;
    const winner = winnerById.get(winnerKey);
    if (!winner) continue;
    const winnerAssignees = readAssignees(winner);
    if (winnerAssignees.includes(jakeId)) {
      winnersAlreadyHaveJake++;
    } else {
      winnersMissingJake++;
      if (examplesMissing.length < 8) {
        examplesMissing.push({
          winnerLabel: `Dr. ${winner.lastName || '?'}, ${winner.firstName || '?'}`,
          winnerId: winnerKey,
          winnerAssignees,
          winnerActive: winner.isActive,
        });
      }
    }
  }

  console.log(`Merge audits where LOSER had Jake:                  ${losersWithJake}`);
  console.log(`  └ winner ALREADY has Jake (no fix needed):        ${winnersAlreadyHaveJake}`);
  console.log(`  └ winner MISSING Jake (would gain via union):     ${winnersMissingJake}`);
  console.log('');

  if (examplesMissing.length > 0) {
    console.log('Example winners that would gain Jake:');
    for (const e of examplesMissing) {
      console.log(`  • ${e.winnerLabel} _id=${e.winnerId} active=${e.winnerActive} current=${e.winnerAssignees.length} BDM(s)`);
    }
    console.log('');
  }

  // 5. Look up "Luz Catedral"
  console.log('Doctors matching "Luz" + "Catedral":');
  const luzMatches = await doctors
    .find(
      {
        $or: [
          { lastName: { $regex: /catedral/i }, firstName: { $regex: /luz/i } },
          { firstName: { $regex: /catedral/i }, lastName: { $regex: /luz/i } },
          { lastName: { $regex: /luz/i }, firstName: { $regex: /catedral/i } },
        ],
      },
      {
        projection: {
          _id: 1, lastName: 1, firstName: 1, assignedTo: 1, primaryAssignee: 1,
          isActive: 1, mergedInto: 1, vip_client_name_clean: 1,
        },
      },
    )
    .toArray();
  if (!luzMatches.length) {
    console.log('  (none found by regex; try a different spelling)');
  } else {
    for (const d of luzMatches) {
      const assignees = readAssignees(d);
      const hasJake = assignees.includes(jakeId);
      console.log(
        `  • _id=${d._id} ${d.lastName || '?'}, ${d.firstName || '?'} | active=${d.isActive} | mergedInto=${d.mergedInto || '-'} | assignees=[${assignees.length}]${hasJake ? ' (Jake✓)' : ''} | primary=${toIdString(d.primaryAssignee) || '-'}`,
      );
      console.log(`      raw assignedTo: ${JSON.stringify(d.assignedTo)}`);
    }
  }

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
