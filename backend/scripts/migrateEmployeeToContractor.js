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
const LEGACY_ROLES = ['employee', 'contractor'];
const TARGET_ROLE = 'staff';

async function migrate() {
  await connectDB();
  const db = mongoose.connection.db;
  const usersCol = db.collection('users');

  console.log(`\nMode: ${APPLY ? 'APPLY (writes will be made)' : 'DRY-RUN (read-only)'}`);
  console.log(`Target: ${LEGACY_ROLES.map(r => `'${r}'`).join(' + ')} → '${TARGET_ROLE}'\n`);

  // ── Audit phase — always runs ────────────────────────────────────────
  const employeeCount = await usersCol.countDocuments({ role: 'employee' });
  const contractorCount = await usersCol.countDocuments({ role: 'contractor' });
  const staffCount = await usersCol.countDocuments({ role: TARGET_ROLE });
  const totalToMigrate = employeeCount + contractorCount;

  console.log('─── Current state ───');
  console.log(`  role='employee':   ${employeeCount}  (legacy)`);
  console.log(`  role='contractor': ${contractorCount}  (legacy)`);
  console.log(`  role='${TARGET_ROLE}':      ${staffCount}  (target)`);

  if (totalToMigrate === 0) {
    console.log('\nNothing to migrate. All non-management users already on target.');
    process.exit(0);
  }

  // Active vs inactive split for the migration cohort
  const activeMigrating = await usersCol.countDocuments({
    role: { $in: LEGACY_ROLES }, isActive: true,
  });
  const inactiveMigrating = totalToMigrate - activeMigrating;
  console.log(`\n  Total to migrate: ${totalToMigrate}`);
  console.log(`    active:   ${activeMigrating}`);
  console.log(`    inactive: ${inactiveMigrating}`);

  // Entity breakdown
  const byEntity = await usersCol.aggregate([
    { $match: { role: { $in: LEGACY_ROLES } } },
    { $group: { _id: { entity: '$entity_id', role: '$role' }, count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]).toArray();

  console.log('\n─── By (entity_id, current role) ───');
  for (const row of byEntity) {
    const label = row._id.entity ? row._id.entity.toString() : '(no entity_id)';
    console.log(`  ${label}  role=${row._id.role}: ${row.count}`);
  }

  // Sample names (up to 12, mixed roles)
  const sample = await usersCol
    .find(
      { role: { $in: LEGACY_ROLES } },
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

  if (!APPLY) {
    console.log('\nDry-run complete. Re-run with --apply to write changes.');
    console.log(`This will rename role: ${LEGACY_ROLES.join(' / ')} → '${TARGET_ROLE}' on the users above.`);
    process.exit(0);
  }

  // ── Apply phase — only runs under --apply ────────────────────────────
  console.log('\n─── APPLY: writing backup + running updateMany ───');

  // 1) Backup with current role per user, so revert is exact (not just a single bucket).
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = path.join(BACKUP_DIR, `staff-rename-${ts}.json`);
  const toMigrate = await usersCol
    .find(
      { role: { $in: LEGACY_ROLES } },
      { projection: { name: 1, email: 1, role: 1, entity_id: 1, isActive: 1 } }
    )
    .toArray();

  const employee_ids = toMigrate.filter(u => u.role === 'employee').map(u => u._id);
  const contractor_ids = toMigrate.filter(u => u.role === 'contractor').map(u => u._id);

  fs.writeFileSync(backupFile, JSON.stringify({
    timestamp: new Date().toISOString(),
    target_role: TARGET_ROLE,
    count: toMigrate.length,
    employee_ids,
    contractor_ids,
    users: toMigrate,
    revert_hint: {
      employees: `db.users.updateMany({_id:{$in: <employee_ids>}}, {$set:{role:'employee'}})`,
      contractors: `db.users.updateMany({_id:{$in: <contractor_ids>}}, {$set:{role:'contractor'}})`,
    },
  }, null, 2));
  console.log(`  Backup written: ${backupFile}`);
  console.log(`    employee_ids: ${employee_ids.length}`);
  console.log(`    contractor_ids: ${contractor_ids.length}`);

  // 2) Execute the rename — single updateMany covers both legacy strings.
  const result = await usersCol.updateMany(
    { role: { $in: LEGACY_ROLES } },
    { $set: { role: TARGET_ROLE } }
  );
  console.log(`  Modified: ${result.modifiedCount} user(s)`);

  // 3) Verify.
  const remainingEmployee = await usersCol.countDocuments({ role: 'employee' });
  const remainingContractor = await usersCol.countDocuments({ role: 'contractor' });
  const newStaffTotal = await usersCol.countDocuments({ role: TARGET_ROLE });
  console.log(`  Remaining role='employee':   ${remainingEmployee}  (expect 0)`);
  console.log(`  Remaining role='contractor': ${remainingContractor}  (expect 0)`);
  console.log(`  Total role='${TARGET_ROLE}':       ${newStaffTotal}`);

  if (remainingEmployee !== 0 || remainingContractor !== 0) {
    console.warn('  WARNING: some users were not migrated. Investigate before code-sweep step.');
    process.exit(2);
  }

  console.log('\nMigration complete. Backup retained at:');
  console.log(`  ${backupFile}`);
  console.log('\nNext: code sweep (Phase S Step 5) — replace role string refs across ~21 files.');
  process.exit(0);
}

migrate().catch((err) => {
  console.error('\nMigration failed:', err);
  process.exit(1);
});
