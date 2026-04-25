/* eslint-disable vip-tenant/require-entity-filter -- standalone admin/migration/diagnostic script: no req context; intentional cross-entity reads/writes for ops work */
/**
 * Backfill User.entity_ids_static + rebuild User.entity_ids — Phase FRA-A (April 22, 2026).
 *
 * Context: before Phase FRA-A, `FunctionalRoleAssignment` rows were cosmetic
 * because `User.entity_ids` (what `tenantFilter` reads to set `req.entityId`)
 * was never updated from the FRA flow. Admin would assign Juan to MG and CO.
 * via Control Center → People & Access → Role Assignments, the UI would show
 * ACTIVE, but Juan's entity picker never offered MG and CO., and proxy-target
 * checks threw "target not assigned to the current entity."
 *
 * This script:
 *   1. For each User with a linked PeopleMaster (PeopleMaster.user_id set):
 *      - If `entity_ids_static` is empty/unset → seed = current `entity_ids`
 *        (captures every admin-direct assignment made pre-FRA-A).
 *      - Compute `union = uniq(entity_ids_static ∪ activeFraEntityIds)`.
 *      - If `entity_ids` differs from union → log drift, apply on --apply.
 *   2. Idempotent: re-running after an apply produces zero drift.
 *
 * Usage (from backend/):
 *   node erp/scripts/backfillEntityIdsFromFra.js             # dry-run, report only
 *   node erp/scripts/backfillEntityIdsFromFra.js --apply     # writes changes
 *   node erp/scripts/backfillEntityIdsFromFra.js --user <id> # scope to one user
 *
 * Also used by CI / health check as a drift detector (dry-run + exit 1 if
 * drift > 0 — wire into check-system-health.js if desired).
 */
require('dotenv').config();
const mongoose = require('mongoose');

const APPLY = process.argv.includes('--apply');
const userArgIdx = process.argv.indexOf('--user');
const USER_FILTER = userArgIdx >= 0 ? process.argv[userArgIdx + 1] : null;

const PAD = (s, n) => String(s || '').padEnd(n);

function formatIdList(ids) {
  if (!ids || !ids.length) return '[]';
  return `[${ids.map((id) => String(id).slice(-6)).join(', ')}]`;
}

async function main() {
  const MONGO_URI = process.env.MONGO_URI;
  if (!MONGO_URI) {
    console.error('❌ MONGO_URI not set in .env');
    process.exit(1);
  }

  console.log('═'.repeat(72));
  console.log(`FRA-A Backfill — ${APPLY ? 'APPLY MODE (writes)' : 'DRY RUN (reports only)'}`);
  if (USER_FILTER) console.log(`Scoped to user: ${USER_FILTER}`);
  console.log('═'.repeat(72));

  await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 10_000 });
  console.log('✓ Mongo connected\n');

  const User = require('../../models/User');
  const PeopleMaster = require('../models/PeopleMaster');
  const FunctionalRoleAssignment = require('../models/FunctionalRoleAssignment');

  // Find every User that is linkable via at least one PeopleMaster. Users
  // without any PeopleMaster (CRM-only users, orphaned admin accounts) are
  // untouched — entity_ids_static stays empty.
  const userFilter = USER_FILTER ? { _id: USER_FILTER } : {};
  const allUsers = await User.find(userFilter)
    .select('_id name email role entity_id entity_ids entity_ids_static')
    .lean();

  console.log(`Scanning ${allUsers.length} users...\n`);

  const stats = {
    scanned: 0,
    seededStatic: 0,
    rebuiltEntityIds: 0,
    added: 0,
    removed: 0,
    noop: 0,
    skippedNoPeople: 0,
  };

  const drifts = [];

  for (const u of allUsers) {
    stats.scanned += 1;

    const people = await PeopleMaster.find({ user_id: u._id }).select('_id').lean();
    if (!people.length) {
      stats.skippedNoPeople += 1;
      continue;
    }
    const personIds = people.map((p) => p._id);

    const activeFras = await FunctionalRoleAssignment.find({
      person_id: { $in: personIds },
      is_active: true,
      status: 'ACTIVE',
    })
      .select('entity_id')
      .lean();
    const fraIds = activeFras.map((f) => f.entity_id).filter(Boolean);

    // Static seed: on first backfill, entity_ids_static is empty/unset →
    // snapshot the current entity_ids as the admin-direct baseline. On
    // subsequent runs, we respect whatever static already holds.
    const existingStatic = u.entity_ids_static || [];
    let staticIds = existingStatic;
    let didSeedStatic = false;
    if (!existingStatic.length) {
      staticIds = u.entity_ids || [];
      didSeedStatic = true;
    }

    // Union
    const seen = new Set();
    const merged = [];
    for (const id of [...staticIds, ...fraIds]) {
      const k = String(id);
      if (!seen.has(k)) {
        seen.add(k);
        merged.push(id);
      }
    }

    const prevKeys = new Set((u.entity_ids || []).map((id) => String(id)));
    const nextKeys = new Set(merged.map((id) => String(id)));
    const addedKeys = [...nextKeys].filter((k) => !prevKeys.has(k));
    const removedKeys = [...prevKeys].filter((k) => !nextKeys.has(k));

    const needsWrite = didSeedStatic || addedKeys.length || removedKeys.length;

    if (!needsWrite) {
      stats.noop += 1;
      continue;
    }

    if (didSeedStatic) stats.seededStatic += 1;
    if (addedKeys.length || removedKeys.length) {
      stats.rebuiltEntityIds += 1;
      stats.added += addedKeys.length;
      stats.removed += removedKeys.length;
    }

    drifts.push({
      userId: String(u._id),
      name: u.name,
      role: u.role,
      prevEntityIds: (u.entity_ids || []).map(String),
      newEntityIds: merged.map(String),
      staticSeeded: didSeedStatic,
      staticIds: staticIds.map(String),
      fraIds: fraIds.map(String),
      added: addedKeys,
      removed: removedKeys,
    });

    if (APPLY) {
      const update = {};
      if (didSeedStatic) update.entity_ids_static = staticIds;
      if (addedKeys.length || removedKeys.length) update.entity_ids = merged;
      await User.updateOne({ _id: u._id }, { $set: update });
    }
  }

  console.log(`${PAD('Role', 12)}${PAD('Name', 28)}${PAD('Static', 10)}${PAD('FRA', 10)}${PAD('Added', 8)}${PAD('Removed', 8)}`);
  console.log('─'.repeat(76));
  for (const d of drifts) {
    console.log(
      `${PAD(d.role, 12)}${PAD(d.name.slice(0, 26), 28)}${PAD(d.staticIds.length, 10)}${PAD(d.fraIds.length, 10)}${PAD(d.added.length, 8)}${PAD(d.removed.length, 8)}`
    );
    if (d.staticSeeded) {
      console.log(`    static seed (first backfill) = ${formatIdList(d.staticIds)}`);
    }
    if (d.added.length) console.log(`    + added   ${formatIdList(d.added)}`);
    if (d.removed.length) console.log(`    - removed ${formatIdList(d.removed)}`);
  }

  console.log('\n' + '═'.repeat(72));
  console.log('Summary');
  console.log('─'.repeat(72));
  console.log(`  Users scanned:         ${stats.scanned}`);
  console.log(`  Skipped (no people):   ${stats.skippedNoPeople}`);
  console.log(`  No drift:              ${stats.noop}`);
  console.log(`  Static seeded:         ${stats.seededStatic}`);
  console.log(`  entity_ids rebuilt:    ${stats.rebuiltEntityIds}`);
  console.log(`    entities added:      ${stats.added}`);
  console.log(`    entities removed:    ${stats.removed}`);
  console.log('═'.repeat(72));

  if (!APPLY && drifts.length > 0) {
    console.log('\n⚠ Dry run — no writes. Re-run with --apply to persist.');
  } else if (APPLY) {
    console.log('\n✓ Apply mode complete — writes persisted.');
  } else {
    console.log('\n✓ No drift detected — entity_ids already in sync with FRA rows.');
  }

  await mongoose.disconnect();
  // Exit 1 on unresolved drift in dry-run mode → usable as a CI drift gate.
  process.exit(!APPLY && drifts.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('❌ Backfill failed:', err);
  process.exit(2);
});
