/**
 * Phase E1 — Healthcheck: Doctor entity scoping (SaaS-readiness).
 *
 * Static + data assertions for the Phase E1 contract:
 *
 *   STATIC (no DB):
 *     - Doctor schema declares entity_ids as [ObjectId ref Entity]
 *     - Doctor schema has the two entity_ids indexes
 *     - Pre-save hook derives entity_ids from assignedTo (Phase E1 block)
 *     - Pre-findOneAndUpdate hook recomputes entity_ids on $set/$addToSet/$pull
 *     - Backfill migration script exists, supports --apply + --include-merged
 *     - getAllDoctors honors ?entity_id= for privileged callers (Slice 2a)
 *     - Rebate-rule create validates partner.entity_ids ∋ rule.entity_id (Slice 2b)
 *     - Rebate matrix pages re-fetch on entity switch (Slice 2c)
 *
 *   DATA (against MONGO_URI):
 *     - Every doctor (ex-merged) has an entity_ids array (not undefined / null)
 *     - For every doctor with assignees, entity_ids equals the union of their
 *       effective entity sets (catches drift after the migration)
 *     - Indexes are physically present (not just schema-declared)
 *
 * Modes:
 *   (no flag)         — STATIC only. Fast, no DB connection. Use in CI / pre-commit.
 *   --data            — STATIC + DATA. Requires MONGO_URI.
 *   --slice2          — Run only Slice 2 gates (after Slice 1 is committed).
 *
 * Run:
 *   node backend/scripts/healthcheckDoctorEntityScope.js
 *   node backend/scripts/healthcheckDoctorEntityScope.js --data
 * Exit: 0 = clean; 1 = at least one gate failed.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const BE = path.join(ROOT, 'backend');
const FE = path.join(ROOT, 'frontend', 'src');

const RUN_DATA = process.argv.includes('--data');

let pass = 0;
let fail = 0;
const failures = [];

function assert(cond, label) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${label}`);
  } else {
    fail++;
    failures.push(label);
    console.log(`  FAIL  ${label}`);
  }
}

function readFile(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch { return null; }
}

console.log('Phase E1 — Doctor entity scoping healthcheck');
console.log('=============================================');

// ── 1. Doctor schema declares entity_ids ─────────────────────────────────────
console.log('\n[1] Doctor model — entity_ids field + indexes:');
const doctorModel = readFile(path.join(BE, 'models', 'Doctor.js'));
assert(doctorModel !== null, 'Doctor.js exists');
assert(
  /entity_ids:\s*\[\{\s*type:\s*mongoose\.Schema\.Types\.ObjectId,\s*ref:\s*'Entity',?\s*\}\]/.test(doctorModel),
  'entity_ids declared as [ObjectId ref Entity]',
);
assert(/doctorSchema\.index\(\{\s*entity_ids:\s*1\s*\}\)/.test(doctorModel),
  'plain index on entity_ids');
assert(/doctorSchema\.index\(\{\s*entity_ids:\s*1,\s*partnership_status:\s*1,\s*isActive:\s*1\s*\}\)/.test(doctorModel),
  'compound index entity_ids+partnership_status+isActive');

// ── 2. Doctor pre-save derives entity_ids ────────────────────────────────────
console.log('\n[2] Doctor model — pre-save derives entity_ids:');
assert(/Phase E1 — derive entity_ids from current assignees/.test(doctorModel),
  'pre-save derivation block tagged with Phase E1 marker');
assert(/shouldDeriveEntityIds/.test(doctorModel),
  'pre-save uses shouldDeriveEntityIds gating variable');
assert(/User\.find\(\{\s*_id:\s*\{\s*\$in:\s*assigneeIds\s*\}\s*\}\)\s*[\s\S]*?\.select\('entity_id entity_ids'\)/.test(doctorModel),
  'pre-save reads User.entity_id + entity_ids');

// ── 3. Doctor pre-findOneAndUpdate handles all assignedTo operators ──────────
console.log('\n[3] Doctor model — findOneAndUpdate hook recomputes entity_ids:');
assert(/Phase E1 \(May 2026\) — also recompute entity_ids when assignedTo changes/.test(doctorModel),
  'findOneAndUpdate hook tagged with Phase E1 marker');
assert(/assignedToInSet/.test(doctorModel) && /assignedToInAddToSet/.test(doctorModel) && /assignedToInPull/.test(doctorModel),
  '$set + $addToSet + $pull operator variants all detected');
assert(/entityIdsExplicit/.test(doctorModel),
  'explicit entity_ids override path (migration use-case) skips re-derivation');

// ── 4. Backfill migration script ─────────────────────────────────────────────
console.log('\n[4] Migration script — migrateDoctorEntityIds.js:');
const migration = readFile(path.join(BE, 'scripts', 'migrateDoctorEntityIds.js'));
assert(migration !== null, 'migrateDoctorEntityIds.js exists');
assert(/--apply/.test(migration), '--apply flag supported');
assert(/--include-merged/.test(migration), '--include-merged flag supported');
assert(/--limit=/.test(migration), '--limit=<n> flag supported (staged rollout)');
assert(/sortedStringIds|setsEqual/.test(migration),
  'idempotent comparator (no-op detection) present');
assert(/doctorsColl\.updateOne\([\s\S]{0,80}\$set:\s*\{\s*entity_ids:/.test(migration),
  'writes via raw collection.updateOne($set:entity_ids) (skips schema casting)');

// ── 5. Slice 2a — getAllDoctors honors ?entity_id= ───────────────────────────
console.log('\n[5] doctorController.getAllDoctors — entity_ids filter (Slice 2a):');
const docCtrl = readFile(path.join(BE, 'controllers', 'doctorController.js'));
const sliceA = docCtrl && /Phase E1[\s\S]*?entity_ids/.test(docCtrl);
if (sliceA) {
  assert(/req\.query\.entity_id/.test(docCtrl),
    'controller reads ?entity_id= query param');
  assert(/req\.entityId/.test(docCtrl),
    'controller falls back to req.entityId (tenantFilter)');
  assert(/entity_ids:\s*\{\s*\$in:|entity_ids:\s*entityScopeId/.test(docCtrl) ||
    /filter\.entity_ids/.test(docCtrl),
    'filter applies entity_ids to the Doctor.find query');
} else {
  console.log('  SKIP  Slice 2a not yet wired — skipping its gates');
}

// ── 6. Slice 2b — rebate-rule create validates partner.entity_ids ─────────────
console.log('\n[6] Rebate controllers — referential consistency check (Slice 2b):');
const nonMd = readFile(path.join(BE, 'erp', 'controllers', 'nonMdPartnerRebateRuleController.js'));
const md = readFile(path.join(BE, 'erp', 'controllers', 'mdProductRebateController.js'));
const sliceB = nonMd && /Phase E1/.test(nonMd);
if (sliceB) {
  assert(/partner.*entity_ids/.test(nonMd) || /assertPartnerInEntity/.test(nonMd),
    'NonMd create validates partner.entity_ids ∋ rule.entity_id');
  if (md) {
    assert(/partner.*entity_ids/.test(md) || /assertPartnerInEntity/.test(md),
      'MD create validates partner.entity_ids ∋ rule.entity_id');
  }
} else {
  console.log('  SKIP  Slice 2b not yet wired — skipping its gates');
}

// ── 7. Slice 2c — rebate pages re-fetch on entity switch ─────────────────────
console.log('\n[7] Rebate matrix pages — entity-aware refetch (Slice 2c):');
const nonMdPage = readFile(path.join(FE, 'erp', 'pages', 'NonMdRebateMatrixPage.jsx'));
const mdPage = readFile(path.join(FE, 'erp', 'pages', 'RebateMatrixPage.jsx'));
const sliceC = nonMdPage && /Phase E1/.test(nonMdPage);
if (sliceC) {
  assert(/workingEntityId|useEntityContext|EntityContext/.test(nonMdPage),
    'NonMd page reads working entity from EntityContext');
  if (mdPage) {
    assert(/workingEntityId|useEntityContext|EntityContext/.test(mdPage),
      'MD page reads working entity from EntityContext');
  }
} else {
  console.log('  SKIP  Slice 2c not yet wired — skipping its gates');
}

// ── 8. PageGuide banners updated for the entity-scoped pickers ───────────────
console.log('\n[8] PageGuide entries — banner copy reflects entity scope:');
const pageGuide = readFile(path.join(FE, 'components', 'common', 'PageGuide.jsx'));
const sliceBan = pageGuide && /Phase E1/.test(pageGuide);
if (sliceBan) {
  assert(/non-md-rebate-matrix[\s\S]{0,2000}entity scope|entity_id|entity scope/i.test(pageGuide),
    'non-md-rebate-matrix banner mentions entity scope (admin-facing copy)');
} else {
  console.log('  SKIP  Banner update not yet wired — skipping');
}

// ── 9. Optional DATA gates ───────────────────────────────────────────────────
async function runDataGates() {
  if (!RUN_DATA) {
    console.log('\n(DATA gates skipped — pass --data to run)');
    return;
  }
  require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
  if (!process.env.MONGO_URI) {
    console.log('\n  FAIL  MONGO_URI not set — cannot run DATA gates');
    fail++;
    failures.push('MONGO_URI not set');
    return;
  }
  const mongoose = require('mongoose');
  await mongoose.connect(process.env.MONGO_URI);
  console.log('\n[9] DATA gates — live cluster:');

  const doctorsColl = mongoose.connection.collection('doctors');
  const usersColl = mongoose.connection.collection('users');

  // Index physically present?
  const indexes = await doctorsColl.indexes();
  const hasPlain = indexes.some((ix) => ix.key && Object.keys(ix.key).length === 1 && ix.key.entity_ids === 1);
  const hasCompound = indexes.some((ix) =>
    ix.key && ix.key.entity_ids === 1 && ix.key.partnership_status === 1 && ix.key.isActive === 1,
  );
  assert(hasPlain, 'plain {entity_ids:1} index physically present');
  assert(hasCompound, 'compound {entity_ids:1, partnership_status:1, isActive:1} index physically present');

  // Doctors without entity_ids field at all? (post-migration should be zero, ex-merged)
  const missing = await doctorsColl.countDocuments({ entity_ids: { $exists: false }, mergedInto: null });
  assert(missing === 0, `every non-merged doctor has an entity_ids field (found ${missing} missing)`);

  // Sample: pick 25 random doctors with assignees, recompute, compare.
  const sample = await doctorsColl
    .find({ assignedTo: { $exists: true, $ne: [] }, mergedInto: null })
    .limit(25)
    .toArray();
  let drifted = 0;
  if (sample.length > 0) {
    const userIds = new Set();
    for (const d of sample) {
      for (const a of (d.assignedTo || [])) {
        if (a && a.toString) userIds.add(a.toString());
      }
    }
    const users = await usersColl
      .find({ _id: { $in: Array.from(userIds).map((s) => new mongoose.Types.ObjectId(s)) } },
        { projection: { _id: 1, entity_id: 1, entity_ids: 1 } })
      .toArray();
    const userEntities = new Map();
    for (const u of users) {
      let e = [];
      if (Array.isArray(u.entity_ids) && u.entity_ids.length > 0) e = u.entity_ids.map((x) => x.toString());
      else if (u.entity_id) e = [u.entity_id.toString()];
      userEntities.set(u._id.toString(), e);
    }
    for (const d of sample) {
      const expected = new Set();
      for (const a of (d.assignedTo || [])) {
        const eList = userEntities.get(a.toString()) || [];
        for (const e of eList) expected.add(e);
      }
      const expectedArr = Array.from(expected).sort();
      const actualArr = (d.entity_ids || []).map((x) => x.toString()).sort();
      const equal = expectedArr.length === actualArr.length && expectedArr.every((e, i) => e === actualArr[i]);
      if (!equal) {
        drifted++;
        if (drifted <= 3) {
          console.log(`        drift sample ${d._id}: expected ${JSON.stringify(expectedArr)} got ${JSON.stringify(actualArr)}`);
        }
      }
    }
  }
  assert(drifted === 0, `${sample.length}-doctor sample matches derived entity_ids (${drifted} drifted)`);

  await mongoose.disconnect();
}

(async () => {
  await runDataGates();
  console.log('\n=============================================');
  console.log(`PASS: ${pass}`);
  console.log(`FAIL: ${fail}`);
  if (fail > 0) {
    console.log('\nFailures:');
    for (const f of failures) console.log(`  ✗ ${f}`);
    process.exit(1);
  }
  console.log('\nAll gates passed.');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
