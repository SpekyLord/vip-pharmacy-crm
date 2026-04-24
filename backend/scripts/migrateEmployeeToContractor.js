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
 *      every legacy population. No writes. Safe to run anytime, on prod.
 *   2. APPLY (--apply): writes a backup file, THEN runs all four phases.
 *
 * Four phases (all run in both modes; each no-ops if nothing to migrate):
 *   Phase 1 — users.role: 'employee' | 'contractor' → 'staff'
 *   Phase 2 — erp_lookups.metadata role fields (arrays + scalars):
 *             'employee' | 'contractor' | 'bdm' → 'staff'
 *   Phase 3 — erp_lookups row where category='SYSTEM_ROLE' AND code='CONTRACTOR':
 *             rename code → 'STAFF' (or deactivate if a STAFF row already
 *             exists for that entity; unique index is [entity,category,code]).
 *             Fixes Phase S2 Incident Gap 2 — stale dropdown code.
 *   Phase 4 — erp_lookups row where category='ROLE_MAPPING' AND label contains
 *             '→ Contractor': cosmetic label swap to '→ Staff' so the Role
 *             Mapping page reads consistently with the normalized metadata.
 *
 * Idempotent: safe to run multiple times. Once all legacy values are gone,
 * every phase becomes a no-op.
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
// Lookup documents live in different collections depending on which Mongoose
// model wrote them. ERP's Lookup model declares `collection: 'erp_lookups'`
// (see backend/erp/models/Lookup.js). CRM-side lookups, if/when added, would
// default to 'lookups'. Scan BOTH so a single --apply catches every
// role-bearing row regardless of origin. Skipping one here silently no-ops
// Phase 2 against that environment — the exact bug this comment prevents.
const LOOKUP_COLLECTION_NAMES = ['lookups', 'erp_lookups'];
// Phase S2 incident gap (Apr 24 2026): array-only scan missed ROLE_MAPPING rows
// that carry the role on a SCALAR field (`metadata.system_role: 'contractor'`).
// PersonDetail's role-mismatch warning (`⚠ Expected "contractor" for ECOMMERCE_BDM`)
// reads `metadata.system_role` directly. Add every scalar role-bearing field that
// appears in current SEED_DEFAULTS or any historical seed. Adding a new variant
// later? Append it here — the audit/backup/apply/verify loops all iterate this list.
const SCALAR_ROLE_FIELDS = [
  'metadata.role',
  'metadata.system_role',
  'metadata.target_role',
  'metadata.default_role',
  'metadata.expected_role',
];

async function migrate() {
  await connectDB();
  const db = mongoose.connection.db;
  const usersCol = db.collection('users');

  console.log(`\nMode: ${APPLY ? 'APPLY (writes will be made)' : 'DRY-RUN (read-only)'}`);
  console.log(`Phase 1 — users.role: ${LEGACY_USER_ROLES.map(r => `'${r}'`).join(' + ')} → '${TARGET_ROLE}'`);
  console.log(`Phase 2 — lookups.metadata role fields (arrays + scalars): ${LEGACY_LOOKUP_ROLES.map(r => `'${r}'`).join(' + ')} → '${TARGET_ROLE}'`);
  console.log(`  Scanned scalar fields: ${SCALAR_ROLE_FIELDS.join(', ')}`);
  console.log(`Phase 3 — erp_lookups SYSTEM_ROLE row: code='CONTRACTOR' → 'STAFF'  (or deactivate if STAFF row exists in same entity)`);
  console.log(`Phase 4 — erp_lookups ROLE_MAPPING rows: label '→ Contractor' → '→ Staff'  (cosmetic)\n`);

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
  // PHASE 2 AUDIT — lookup collections (role-bearing metadata arrays)
  // Scans BOTH 'lookups' and 'erp_lookups'. Missing collections yield 0
  // matches with no error, so this is safe in every environment.
  // ══════════════════════════════════════════════════════════════════════
  console.log('\n═══ Phase 2: lookup collections ═══');

  // Scan for ANY lookup row whose metadata contains a legacy role string in
  // either an array-valued field (metadata.roles, metadata.allowed_roles)
  // OR a scalar role field (metadata.system_role, metadata.role, etc.).
  // Works for the known categories (PROXY_ENTRY_ROLES, VALID_OWNER_ROLES,
  // MODULE_DEFAULT_ROLES, AGENT_CONFIG, COPILOT_TOOLS, AI_COWORK_FEATURES,
  // ROLE_MAPPING) and any future role-bearing lookup category added later —
  // no hardcoded category list needed. Scalar field list lives in
  // SCALAR_ROLE_FIELDS at top of file; add new variants there.
  const lookupMatchClauses = [
    { 'metadata.roles': { $elemMatch: { $in: LEGACY_LOOKUP_ROLES } } },
    { 'metadata.allowed_roles': { $elemMatch: { $in: LEGACY_LOOKUP_ROLES } } },
    ...SCALAR_ROLE_FIELDS.map((field) => ({ [field]: { $in: LEGACY_LOOKUP_ROLES } })),
  ];
  const lookupMatches = [];
  const matchesByCollection = {};
  for (const colName of LOOKUP_COLLECTION_NAMES) {
    const col = db.collection(colName);
    const rows = await col.aggregate([
      { $match: { $or: lookupMatchClauses } },
      {
        $project: {
          category: 1,
          code: 1,
          entity_id: 1,
          metadata: 1,
        },
      },
      { $sort: { category: 1, code: 1 } },
    ]).toArray();
    matchesByCollection[colName] = rows.length;
    for (const r of rows) { r._collection = colName; lookupMatches.push(r); }
  }

  console.log(`─── Lookup rows with legacy role strings in metadata ───`);
  console.log(`  Total matching rows: ${lookupMatches.length}`);
  console.log('\n─── By collection ───');
  for (const colName of LOOKUP_COLLECTION_NAMES) {
    console.log(`  ${colName}: ${matchesByCollection[colName]}`);
  }
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
    // Sample up to 8 rows. Show whichever role-bearing fields are populated
    // (arrays or scalars) so admin can spot anomalies before --apply.
    console.log('\n─── Sample (first 8) ───');
    for (const row of lookupMatches.slice(0, 8)) {
      const ent = row.entity_id ? row.entity_id.toString().slice(-6) : '(no entity)';
      const md = row.metadata || {};
      const bits = [];
      if (Array.isArray(md.roles)) bits.push(`roles=${JSON.stringify(md.roles)}`);
      if (Array.isArray(md.allowed_roles)) bits.push(`allowed_roles=${JSON.stringify(md.allowed_roles)}`);
      for (const fieldPath of SCALAR_ROLE_FIELDS) {
        const v = readDottedPath(row, fieldPath);
        if (typeof v === 'string' && LEGACY_LOOKUP_ROLES.includes(v)) {
          bits.push(`${fieldPath}='${v}'`);
        }
      }
      console.log(`  [${row._collection}] [${row.category}] ${row.code}  ent=${ent}  ${bits.join(' ')}`);
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // PHASE 3 AUDIT — erp_lookups SYSTEM_ROLE rows with stale code='CONTRACTOR'
  // Fixes Phase S2 Incident Gap 2. Unique index is (entity_id, category, code),
  // so a rename CONTRACTOR → STAFF collides if a STAFF row already exists for
  // the same entity. Detect both cases here; apply phase resolves them safely.
  // ══════════════════════════════════════════════════════════════════════
  console.log('\n═══ Phase 3: SYSTEM_ROLE.code=\'CONTRACTOR\' stale dropdown row ═══');
  const erpLookupsCol = db.collection('erp_lookups');
  const staleSystemRoleRows = await erpLookupsCol
    .find({ category: 'SYSTEM_ROLE', code: 'CONTRACTOR' })
    .project({ _id: 1, entity_id: 1, code: 1, label: 1, is_active: 1 })
    .toArray();
  const phase3Renames = [];
  const phase3Deactivates = [];
  for (const row of staleSystemRoleRows) {
    const collidingStaff = await erpLookupsCol.findOne({
      entity_id: row.entity_id,
      category: 'SYSTEM_ROLE',
      code: 'STAFF',
    });
    if (collidingStaff) {
      phase3Deactivates.push({ row, collidingStaff });
    } else {
      phase3Renames.push(row);
    }
  }
  console.log(`  Total stale SYSTEM_ROLE.code='CONTRACTOR' rows: ${staleSystemRoleRows.length}`);
  console.log(`    would rename (no STAFF row in entity): ${phase3Renames.length}`);
  console.log(`    would deactivate (STAFF already exists): ${phase3Deactivates.length}`);
  if (staleSystemRoleRows.length > 0) {
    console.log('\n  ─── Sample (first 8) ───');
    for (const row of staleSystemRoleRows.slice(0, 8)) {
      const ent = row.entity_id ? row.entity_id.toString().slice(-6) : '(no entity)';
      const action = phase3Renames.includes(row) ? 'RENAME→STAFF' : 'DEACTIVATE';
      console.log(`    ent=${ent}  label='${row.label}'  active=${row.is_active}  action=${action}`);
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // PHASE 4 AUDIT — erp_lookups ROLE_MAPPING rows with stale '→ Contractor'
  // label. Pure cosmetic: functionally the metadata.system_role normalization
  // in Phase 2 is what drives behavior. Without this phase, the Role Mapping
  // admin page reads "BDM → Contractor" while the metadata says system_role:
  // staff — confusing, not wrong. Bounded string replace on the specific
  // '→ Contractor' substring avoids touching labels that mention 'Contractor'
  // in other legitimate contexts.
  // ══════════════════════════════════════════════════════════════════════
  console.log('\n═══ Phase 4: ROLE_MAPPING label cosmetic cleanup ═══');
  const staleRoleMappingRows = await erpLookupsCol
    .find({ category: 'ROLE_MAPPING', label: /→\s*Contractor\b/ })
    .project({ _id: 1, entity_id: 1, code: 1, label: 1 })
    .toArray();
  console.log(`  Rows with label containing '→ Contractor': ${staleRoleMappingRows.length}`);
  if (staleRoleMappingRows.length > 0) {
    console.log('\n  ─── Sample (first 8) ───');
    for (const row of staleRoleMappingRows.slice(0, 8)) {
      const ent = row.entity_id ? row.entity_id.toString().slice(-6) : '(no entity)';
      const nextLabel = row.label.replace(/→\s*Contractor\b/, '→ Staff');
      console.log(`    ent=${ent}  code=${row.code}  '${row.label}' → '${nextLabel}'`);
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // Dry-run exit
  // ══════════════════════════════════════════════════════════════════════
  const totalPhase3 = staleSystemRoleRows.length;
  const totalPhase4 = staleRoleMappingRows.length;
  const totalAnything = totalToMigrate + lookupMatches.length + totalPhase3 + totalPhase4;
  if (!APPLY) {
    console.log('\n═══ Dry-run complete ═══');
    console.log(`  Phase 1 would rename:     ${totalToMigrate} user(s)`);
    console.log(`  Phase 2 would update:     ${lookupMatches.length} lookup row(s)`);
    console.log(`  Phase 3 would rename:     ${phase3Renames.length} SYSTEM_ROLE row(s), deactivate: ${phase3Deactivates.length}`);
    console.log(`  Phase 4 would rewrite:    ${totalPhase4} ROLE_MAPPING label(s)`);
    if (totalAnything === 0) {
      console.log('\n  Nothing to migrate. All populations already on target.');
      process.exit(0);
    }
    console.log('\nRe-run with --apply to write changes.');
    process.exit(0);
  }

  if (totalAnything === 0) {
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
  // so we can restore the exact original arrays/scalars on revert. Pulls from
  // every collection in LOOKUP_COLLECTION_NAMES and stamps `_collection` on
  // each row so the apply loop (and any manual revert) knows which collection
  // the row belongs to. Same union-of-clauses as the audit query so backup
  // coverage matches scan coverage exactly.
  const toMigrateLookups = [];
  for (const colName of LOOKUP_COLLECTION_NAMES) {
    const col = db.collection(colName);
    const rows = await col
      .find(
        { $or: lookupMatchClauses },
        { projection: { category: 1, code: 1, entity_id: 1, metadata: 1 } }
      )
      .toArray();
    for (const r of rows) { r._collection = colName; toMigrateLookups.push(r); }
  }

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
      collections_scanned: LOOKUP_COLLECTION_NAMES,
      rows: toMigrateLookups,
      revert_hint: 'Per-row restore: for each entry above, write metadata.roles (or metadata.allowed_roles) back to the snapshot value shown, against the collection named in row._collection.',
    },
    phase3_system_role_rows: {
      count: staleSystemRoleRows.length,
      renames: phase3Renames.map(r => ({ _id: r._id, entity_id: r.entity_id, label: r.label, was_active: r.is_active })),
      deactivations: phase3Deactivates.map(d => ({ _id: d.row._id, entity_id: d.row.entity_id, label: d.row.label, collidesWith: d.collidingStaff._id })),
      revert_hint: 'Per-row restore: for each entry in renames, set code back to "CONTRACTOR". For deactivations, set is_active back to the was_active value (usually true).',
    },
    phase4_role_mapping_labels: {
      count: staleRoleMappingRows.length,
      rows: staleRoleMappingRows.map(r => ({ _id: r._id, entity_id: r.entity_id, code: r.code, old_label: r.label })),
      revert_hint: 'Per-row restore: set label back to old_label for each entry.',
    },
  }, null, 2));
  console.log(`  Backup written: ${backupFile}`);
  console.log(`    Phase 1 (users):                  ${toMigrateUsers.length} rows`);
  console.log(`    Phase 2 (lookup metadata):        ${toMigrateLookups.length} rows`);
  console.log(`    Phase 3 (SYSTEM_ROLE rows):       ${staleSystemRoleRows.length} rows  (${phase3Renames.length} rename, ${phase3Deactivates.length} deactivate)`);
  console.log(`    Phase 4 (ROLE_MAPPING labels):    ${staleRoleMappingRows.length} rows`);

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

  // 3) Phase 2 — normalize Lookup.metadata.{roles[],allowed_roles[]} arrays
  //    AND scalar role fields (metadata.system_role, metadata.role, etc.).
  //    Per-row update required because $set on an array element needs the
  //    new full array, not a conditional $ operator (which doesn't exist
  //    for "replace matching elements"). Fastest: recompute the array in
  //    node, then $set the whole array back. Scalars are a simple swap.
  //    Writes land in the same collection the row was read from (tracked
  //    on row._collection).
  let lookupsModified = 0;
  const lookupsModifiedByCollection = {};
  for (const colName of LOOKUP_COLLECTION_NAMES) lookupsModifiedByCollection[colName] = 0;
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
    // Scalar role-bearing fields — rewrite legacy → target. Read via dotted
    // path (metadata.system_role etc.) using the same SCALAR_ROLE_FIELDS
    // list the audit/scan uses, so coverage is identical.
    for (const fieldPath of SCALAR_ROLE_FIELDS) {
      const current = readDottedPath(row, fieldPath);
      if (typeof current === 'string' && LEGACY_LOOKUP_ROLES.includes(current)) {
        updates[fieldPath] = TARGET_ROLE;
      }
    }
    if (Object.keys(updates).length > 0) {
      await db.collection(row._collection).updateOne({ _id: row._id }, { $set: updates });
      lookupsModified += 1;
      lookupsModifiedByCollection[row._collection] += 1;
    }
  }
  console.log(`  Phase 2: ${lookupsModified} lookup row(s) normalized`);
  for (const colName of LOOKUP_COLLECTION_NAMES) {
    console.log(`    ${colName}: ${lookupsModifiedByCollection[colName]}`);
  }

  // 4) Phase 3 — SYSTEM_ROLE row rename (or deactivate on unique-index collision)
  let phase3Renamed = 0;
  let phase3Deactivated = 0;
  for (const row of phase3Renames) {
    await erpLookupsCol.updateOne(
      { _id: row._id },
      { $set: { code: 'STAFF', label: 'Staff' } }
    );
    phase3Renamed += 1;
  }
  for (const { row } of phase3Deactivates) {
    await erpLookupsCol.updateOne(
      { _id: row._id },
      { $set: { is_active: false } }
    );
    phase3Deactivated += 1;
  }
  console.log(`  Phase 3: ${phase3Renamed} SYSTEM_ROLE row(s) renamed to STAFF, ${phase3Deactivated} deactivated (duplicate)`);

  // 5) Phase 4 — ROLE_MAPPING cosmetic label fix
  let phase4Modified = 0;
  for (const row of staleRoleMappingRows) {
    const nextLabel = row.label.replace(/→\s*Contractor\b/, '→ Staff');
    if (nextLabel !== row.label) {
      await erpLookupsCol.updateOne(
        { _id: row._id },
        { $set: { label: nextLabel } }
      );
      phase4Modified += 1;
    }
  }
  console.log(`  Phase 4: ${phase4Modified} ROLE_MAPPING label(s) rewritten`);

  // 6) Verify every phase
  const remainingEmployee = await usersCol.countDocuments({ role: 'employee' });
  const remainingContractor = await usersCol.countDocuments({ role: 'contractor' });
  const newStaffTotal = await usersCol.countDocuments({ role: TARGET_ROLE });
  console.log('\n─── Phase 1 verification ───');
  console.log(`  Remaining role='employee':   ${remainingEmployee}  (expect 0)`);
  console.log(`  Remaining role='contractor': ${remainingContractor}  (expect 0)`);
  console.log(`  Total role='${TARGET_ROLE}':       ${newStaffTotal}`);

  let remainingLookupLegacy = 0;
  console.log('\n─── Phase 2 verification ───');
  for (const colName of LOOKUP_COLLECTION_NAMES) {
    const n = await db.collection(colName).countDocuments({ $or: lookupMatchClauses });
    remainingLookupLegacy += n;
    console.log(`  ${colName}: ${n}  (expect 0)`);
  }
  console.log(`  Total remaining lookups with legacy role strings: ${remainingLookupLegacy}  (expect 0)`);

  // Phase 3 verification — no active SYSTEM_ROLE.code='CONTRACTOR' rows
  const remainingStaleSystemRole = await erpLookupsCol.countDocuments({
    category: 'SYSTEM_ROLE', code: 'CONTRACTOR', is_active: true,
  });
  console.log('\n─── Phase 3 verification ───');
  console.log(`  Remaining active SYSTEM_ROLE.code='CONTRACTOR' rows: ${remainingStaleSystemRole}  (expect 0)`);

  // Phase 4 verification — no ROLE_MAPPING labels with '→ Contractor'
  const remainingStaleLabels = await erpLookupsCol.countDocuments({
    category: 'ROLE_MAPPING', label: /→\s*Contractor\b/,
  });
  console.log('\n─── Phase 4 verification ───');
  console.log(`  Remaining ROLE_MAPPING labels with '→ Contractor': ${remainingStaleLabels}  (expect 0)`);

  if (
    remainingEmployee !== 0 || remainingContractor !== 0 ||
    remainingLookupLegacy !== 0 || remainingStaleSystemRole !== 0 ||
    remainingStaleLabels !== 0
  ) {
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

// Read a dotted path (e.g. "metadata.system_role") from a plain object.
// Returns undefined for any missing intermediate. Used to resolve scalar role
// fields without hardcoding SCALAR_ROLE_FIELDS branch by branch.
function readDottedPath(obj, dottedPath) {
  const parts = dottedPath.split('.');
  let cur = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
}

migrate().catch((err) => {
  console.error('\nMigration failed:', err);
  process.exit(1);
});
