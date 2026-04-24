/**
 * Migration: User.role 'employee' + 'contractor' → 'staff'  (Phase S — Step 2, Apr 2026)
 *
 * Context:
 *   The ERP/CRM has historically used `role: 'contractor'` for "any non-management
 *   worker" — BDMs, consultants, pharmacists, etc. The name was misleading because
 *   employment type (W-2 employee vs. independent contractor) is a SEPARATE concern
 *   that lives on PeopleMaster.employment_type.
 *
 *   With the business expanding to hire actual employees who do BDM-style work,
 *   the auth-tier role is being renamed to a neutral term: `staff`. Employment
 *   nature continues to live on PeopleMaster.employment_type (REGULAR /
 *   PROBATIONARY / CONTRACTUAL / CONSULTANT / PARTNERSHIP).
 *
 *   This migration unifies BOTH legacy strings (`'employee'` and `'contractor'`)
 *   onto the new canonical `'staff'`.
 *
 * NOTE: this script's filename is unchanged from the earlier 'employee→contractor'
 * version for git-history continuity. Its behavior is the Path B rename.
 *
 * What this script does:
 *   1. DRY-RUN (default): reports counts + entity breakdown + sample names for
 *      both legacy populations. No writes. Safe to run anytime, on prod.
 *   2. APPLY (--apply): writes a backup file listing every user _id to be
 *      modified (with their CURRENT role so a revert is exact), THEN runs
 *      updateMany.
 *
 * Idempotent: safe to run multiple times. Once no employee/contractor users
 * remain, both modes become no-ops.
 *
 * Revert (one-liner from backup file):
 *   db.users.updateMany({_id:{$in:<contractor_ids>}}, {$set:{role:'contractor'}})
 *   db.users.updateMany({_id:{$in:<employee_ids>}},   {$set:{role:'employee'}})
 *
 * Usage (from repo root):
 *   node backend/scripts/migrateEmployeeToContractor.js           # dry-run / audit
 *   node backend/scripts/migrateEmployeeToContractor.js --apply   # apply + backup
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const fs = require('fs');
const mongoose = require('mongoose');
const connectDB = require('../config/db');

const APPLY = process.argv.includes('--apply');
const BACKUP_DIR = path.join(__dirname, 'backups');
// User.role migration: only 'employee' + 'contractor' exist as real User.role values.
const LEGACY_USER_ROLES = ['employee', 'contractor'];
// Lookup.metadata.roles migration: seed rows historically used 'contractor',
// 'employee', AND 'bdm' (dead string — no User ever had it, but it appears in
// MODULE_DEFAULT_ROLES.UNDERTAKING and AGENT_CONFIG allowed_roles with stale
// "means BDM" intent). Normalize all three so role-gated lookups actually match
// the new User.role after migration.
const LEGACY_LOOKUP_ROLES = ['employee', 'contractor', 'bdm'];
const TARGET_ROLE = 'staff';

async function migrate() {
  await connectDB();
  const db = mongoose.connection.db;
  const usersCol = db.collection('users');

  console.log(`\nMode: ${APPLY ? 'APPLY (writes will be made)' : 'DRY-RUN (read-only)'}`);
  console.log(`Phase 1 — users.role: ${LEGACY_USER_ROLES.map(r => `'${r}'`).join(' + ')} → '${TARGET_ROLE}'`);
  console.log(`Phase 2 — lookups.metadata.roles[]: ${LEGACY_LOOKUP_ROLES.map(r => `'${r}'`).join(' + ')} → '${TARGET_ROLE}'\n`);

  // ══════════════════════════════════════════════════════════════════════
  // PHASE 1 AUDIT — users collection
  // ══════════════════════════════════════════════════════════════════════
  console.log('═══ Phase 1: users collection ═══');
  const employeeCount = await usersCol.countDocuments({ role: 'employee' });
  const contractorCount = await usersCol.countDocuments({ role: 'contractor' });
  const staffCount = await usersCol.countDocuments({ role: TARGET_ROLE });
  const totalToMigrate = employeeCount + contractorCount;

  console.log('─── Current state ───');
  console.log(`  role='employee':   ${employeeCount}  (legacy)`);
  console.log(`  role='contractor': ${contractorCount}  (legacy)`);
  console.log(`  role='${TARGET_ROLE}':      ${staffCount}  (target)`);

  if (totalToMigrate > 0) {
    // Active vs inactive split for the migration cohort
    const activeMigrating = await usersCol.countDocuments({
      role: { $in: LEGACY_USER_ROLES }, isActive: true,
    });
    const inactiveMigrating = totalToMigrate - activeMigrating;
    console.log(`\n  Total users to migrate: ${totalToMigrate}`);
    console.log(`    active:   ${activeMigrating}`);
    console.log(`    inactive: ${inactiveMigrating}`);

    // Entity breakdown
    const byEntity = await usersCol.aggregate([
      { $match: { role: { $in: LEGACY_USER_ROLES } } },
      { $group: { _id: { entity: '$entity_id', role: '$role' }, count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]).toArray();
    console.log('\n─── By (entity_id, current role) ───');
    for (const row of byEntity) {
      const label = row._id.entity ? row._id.entity.toString() : '(no entity_id)';
      console.log(`  ${label}  role=${row._id.role}: ${row.count}`);
    }

    // Sample names (up to 12)
    const sample = await usersCol
      .find(
        { role: { $in: LEGACY_USER_ROLES } },
        { projection: { name: 1, email: 1, role: 1, isActive: 1 } }
      )
      .sort({ name: 1 })
      .limit(12)
      .toArray();
    console.log('\n─── Sample (first 12 alpha) ───');
    for (const u of sample) {
      const inactive = u.isActive === false ? ' [inactive]' : '';
      console.log(
        `  [${u.role.padEnd(10)}] ${u.name || '(no name)'}  <${u.email || '(no email)'}>${inactive}`
      );
    }
  } else {
    console.log('  (no legacy User.role values — Phase 1 is a no-op)');
  }

  // ══════════════════════════════════════════════════════════════════════
  // PHASE 2 AUDIT — lookup collection (role-bearing metadata arrays)
  // ══════════════════════════════════════════════════════════════════════
  console.log('\n═══ Phase 2: lookups collection ═══');
  const lookupsCol = db.collection('lookups');

  // Scan for ANY lookup row whose metadata contains a legacy role string in
  // an array-valued field (metadata.roles, metadata.allowed_roles, etc.).
  // Works for the known categories (PROXY_ENTRY_ROLES, VALID_OWNER_ROLES,
  // MODULE_DEFAULT_ROLES, AGENT_CONFIG) and any future role-bearing lookup
  // category added later — no hardcoded category list needed.
  const lookupMatches = await lookupsCol.aggregate([
    {
      $match: {
        $or: [
          { 'metadata.roles': { $elemMatch: { $in: LEGACY_LOOKUP_ROLES } } },
          { 'metadata.allowed_roles': { $elemMatch: { $in: LEGACY_LOOKUP_ROLES } } },
        ],
      },
    },
    {
      $project: {
        category: 1,
        code: 1,
        entity_id: 1,
        roles: '$metadata.roles',
        allowed_roles: '$metadata.allowed_roles',
      },
    },
    { $sort: { category: 1, code: 1 } },
  ]).toArray();

  console.log(`─── Lookup rows with legacy role strings in metadata ───`);
  console.log(`  Total matching rows: ${lookupMatches.length}`);
  if (lookupMatches.length > 0) {
    // Group by category for a tight summary
    const byCategory = {};
    for (const row of lookupMatches) {
      byCategory[row.category] = (byCategory[row.category] || 0) + 1;
    }
    console.log('\n─── By category ───');
    for (const [cat, count] of Object.entries(byCategory)) {
      console.log(`  ${cat}: ${count}`);
    }
    // Sample up to 8 rows, show the actual role arrays so admin can spot anomalies
    console.log('\n─── Sample (first 8) ───');
    for (const row of lookupMatches.slice(0, 8)) {
      const ent = row.entity_id ? row.entity_id.toString().slice(-6) : '(no entity)';
      const rolesStr = row.roles ? `roles=${JSON.stringify(row.roles)}` : '';
      const allowedStr = row.allowed_roles ? `allowed_roles=${JSON.stringify(row.allowed_roles)}` : '';
      console.log(`  [${row.category}] ${row.code}  ent=${ent}  ${rolesStr}${allowedStr}`);
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // Dry-run exit
  // ══════════════════════════════════════════════════════════════════════
  if (!APPLY) {
    console.log('\n═══ Dry-run complete ═══');
    console.log(`  Phase 1 would rename: ${totalToMigrate} user(s)`);
    console.log(`  Phase 2 would update: ${lookupMatches.length} lookup row(s)`);
    if (totalToMigrate === 0 && lookupMatches.length === 0) {
      console.log('\n  Nothing to migrate. All populations already on target.');
      process.exit(0);
    }
    console.log('\nRe-run with --apply to write changes.');
    process.exit(0);
  }

  if (totalToMigrate === 0 && lookupMatches.length === 0) {
    console.log('\nNothing to migrate. Exiting.');
    process.exit(0);
  }

  // ══════════════════════════════════════════════════════════════════════
  // APPLY — backup + mutate
  // ══════════════════════════════════════════════════════════════════════
  console.log('\n═══ APPLY: writing backup + running updates ═══');

  // 1) Unified backup file. Contains both Phase 1 users and Phase 2 lookups
  //    so a single revert call restores both sides atomically.
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = path.join(BACKUP_DIR, `staff-rename-${ts}.json`);

  // Phase 1 backup data
  const toMigrateUsers = await usersCol
    .find(
      { role: { $in: LEGACY_USER_ROLES } },
      { projection: { name: 1, email: 1, role: 1, entity_id: 1, isActive: 1 } }
    )
    .toArray();
  const employee_ids = toMigrateUsers.filter(u => u.role === 'employee').map(u => u._id);
  const contractor_ids = toMigrateUsers.filter(u => u.role === 'contractor').map(u => u._id);

  // Phase 2 backup data — snapshot each matching lookup row's current metadata
  // so we can restore the exact original arrays on revert.
  const toMigrateLookups = await lookupsCol
    .find(
      {
        $or: [
          { 'metadata.roles': { $elemMatch: { $in: LEGACY_LOOKUP_ROLES } } },
          { 'metadata.allowed_roles': { $elemMatch: { $in: LEGACY_LOOKUP_ROLES } } },
        ],
      },
      { projection: { category: 1, code: 1, entity_id: 1, metadata: 1 } }
    )
    .toArray();

  fs.writeFileSync(backupFile, JSON.stringify({
    timestamp: new Date().toISOString(),
    target_role: TARGET_ROLE,
    phase1_users: {
      count: toMigrateUsers.length,
      employee_ids,
      contractor_ids,
      users: toMigrateUsers,
      revert_hint: {
        employees: `db.users.updateMany({_id:{$in: <employee_ids>}}, {$set:{role:'employee'}})`,
        contractors: `db.users.updateMany({_id:{$in: <contractor_ids>}}, {$set:{role:'contractor'}})`,
      },
    },
    phase2_lookups: {
      count: toMigrateLookups.length,
      rows: toMigrateLookups,
      revert_hint: 'Per-row restore: for each entry above, set metadata.roles (or metadata.allowed_roles) back to the snapshot value shown.',
    },
  }, null, 2));
  console.log(`  Backup written: ${backupFile}`);
  console.log(`    Phase 1 (users): ${toMigrateUsers.length} rows`);
  console.log(`    Phase 2 (lookups): ${toMigrateLookups.length} rows`);

  // 2) Phase 1 — rename User.role
  let usersModified = 0;
  if (toMigrateUsers.length > 0) {
    const res1 = await usersCol.updateMany(
      { role: { $in: LEGACY_USER_ROLES } },
      { $set: { role: TARGET_ROLE } }
    );
    usersModified = res1.modifiedCount;
    console.log(`  Phase 1: ${usersModified} user(s) renamed`);
  } else {
    console.log(`  Phase 1: no-op (no legacy User.role values)`);
  }

  // 3) Phase 2 — normalize Lookup.metadata.roles arrays.
  //    Per-row update required because $set on an array element needs the
  //    new full array, not a conditional $ operator (which doesn't exist
  //    for "replace matching elements"). Fastest: recompute the array in
  //    node, then $set the whole array back.
  let lookupsModified = 0;
  for (const row of toMigrateLookups) {
    const updates = {};
    if (Array.isArray(row.metadata?.roles)) {
      const next = normalizeRoleArray(row.metadata.roles);
      if (!arraysEqual(next, row.metadata.roles)) {
        updates['metadata.roles'] = next;
      }
    }
    if (Array.isArray(row.metadata?.allowed_roles)) {
      const next = normalizeRoleArray(row.metadata.allowed_roles);
      if (!arraysEqual(next, row.metadata.allowed_roles)) {
        updates['metadata.allowed_roles'] = next;
      }
    }
    if (Object.keys(updates).length > 0) {
      await lookupsCol.updateOne({ _id: row._id }, { $set: updates });
      lookupsModified += 1;
    }
  }
  console.log(`  Phase 2: ${lookupsModified} lookup row(s) normalized`);

  // 4) Verify both phases
  const remainingEmployee = await usersCol.countDocuments({ role: 'employee' });
  const remainingContractor = await usersCol.countDocuments({ role: 'contractor' });
  const newStaffTotal = await usersCol.countDocuments({ role: TARGET_ROLE });
  console.log('\n─── Phase 1 verification ───');
  console.log(`  Remaining role='employee':   ${remainingEmployee}  (expect 0)`);
  console.log(`  Remaining role='contractor': ${remainingContractor}  (expect 0)`);
  console.log(`  Total role='${TARGET_ROLE}':       ${newStaffTotal}`);

  const remainingLookupLegacy = await lookupsCol.countDocuments({
    $or: [
      { 'metadata.roles': { $elemMatch: { $in: LEGACY_LOOKUP_ROLES } } },
      { 'metadata.allowed_roles': { $elemMatch: { $in: LEGACY_LOOKUP_ROLES } } },
    ],
  });
  console.log('\n─── Phase 2 verification ───');
  console.log(`  Remaining lookups with legacy role strings: ${remainingLookupLegacy}  (expect 0)`);

  if (remainingEmployee !== 0 || remainingContractor !== 0 || remainingLookupLegacy !== 0) {
    console.warn('\n  WARNING: some rows were not migrated. Investigate before code-sweep step.');
    process.exit(2);
  }

  console.log('\nMigration complete. Backup retained at:');
  console.log(`  ${backupFile}`);
  console.log('\nNext: code sweep — replace role string refs across ~21 files.');
  process.exit(0);
}

// Helpers ────────────────────────────────────────────────────────────────

// Replace each legacy role in the array with TARGET_ROLE. Preserves order
// and de-duplicates. Non-legacy roles (e.g. 'admin', 'finance', 'president',
// 'ceo') pass through unchanged.
function normalizeRoleArray(arr) {
  const out = [];
  const seen = new Set();
  for (const r of arr) {
    const next = LEGACY_LOOKUP_ROLES.includes(r) ? TARGET_ROLE : r;
    if (!seen.has(next)) {
      seen.add(next);
      out.push(next);
    }
  }
  return out;
}

function arraysEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

migrate().catch((err) => {
  console.error('\nMigration failed:', err);
  process.exit(1);
});
