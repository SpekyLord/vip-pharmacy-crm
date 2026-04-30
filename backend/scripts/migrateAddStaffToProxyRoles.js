/**
 * Phase G4.5cc onboarding migration — add 'staff' to proxy role allowlists (Apr 30 2026).
 *
 * Run with:
 *   node backend/scripts/migrateAddStaffToProxyRoles.js                          # dry-run (default)
 *   node backend/scripts/migrateAddStaffToProxyRoles.js --apply                  # persist
 *   node backend/scripts/migrateAddStaffToProxyRoles.js --apply --rollback       # remove 'staff'
 *
 * Why: G4.5aa + G4.5bb + G4.5cc shipped the proxy infrastructure (sub-perms,
 * gates, controllers, lookup categories), but the lookup ROWS themselves still
 * default to ['admin','finance','president'] — i.e. the eBDM/staff persona is
 * blocked at the role gate even after admin ticks the relevant sub-perm on
 * their Access Template. To onboard staff-as-proxy, admin must add 'staff' to
 * five lookup rows per entity. Doing it by hand in Control Center is fine for
 * one entity but error-prone across multi-entity tenants and across dev/prod.
 *
 * This script idempotently adds 'staff' (or removes it under --rollback) to:
 *   - MODULE_DEFAULT_ROLES.PAYROLL          (gates Compute + Submit Run)
 *   - MODULE_DEFAULT_ROLES.INCOME           (gates Income Report submit)
 *   - MODULE_DEFAULT_ROLES.DEDUCTION_SCHEDULE (gates Deduction Schedule submit)
 *   - PROXY_ENTRY_ROLES.INCOME              (allows staff to be a proxy on behalf of a target BDM)
 *   - PROXY_ENTRY_ROLES.DEDUCTION_SCHEDULE  (same)
 *
 * Each row already has admin/finance/president pre-seeded by SEED_DEFAULTS
 * (lazy-seed on first GET). This script only touches metadata.roles via
 * $addToSet/$pull — so it does NOT clobber:
 *   - admin custom edits to other metadata fields
 *   - description/sort_order/insert_only_metadata
 *   - other roles that may have been added (e.g. a custom 'finance_clerk' role)
 *
 * Idempotent: re-run is a no-op (skips rows where 'staff' is already present
 * under --apply, or already absent under --rollback).
 *
 * Multi-entity: scans all Entity rows with status='ACTIVE'. A fresh subscriber
 * pharmacy onboarded post-deploy will pick up the lookup rows via lazy-seed
 * (on first Lookup Tables open in their entity); this script only handles
 * the 'staff' role addition once those rows exist. Run AFTER the new Lookup
 * Tables panel has been opened at least once per entity, OR pass --upsert to
 * insert missing rows from baseline.
 *
 * Pairs with: Phase G4.5cc handoff (memory) + dev-cluster Playwright/API edits
 * applied Apr 30 2026 to VIP entity (mirror these on prod).
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const mongoose = require('mongoose');

const DRY_RUN = !process.argv.includes('--apply');
const ROLLBACK = process.argv.includes('--rollback');
const UPSERT = process.argv.includes('--upsert');

// Lookup rows we touch. metadata block is the FALLBACK shape used when --upsert
// inserts a missing row (prod entity that has never opened Lookup Tables for
// the category yet). Existing rows are NEVER overwritten — only metadata.roles
// gets the $addToSet / $pull mutation.
const ROWS = [
  {
    category: 'MODULE_DEFAULT_ROLES',
    code: 'PAYROLL',
    label: 'Payslips',
    insert_metadata: { roles: ['admin', 'finance', 'president'], description: 'Review and approve employee payslips' },
    sort_order: 0,
  },
  {
    category: 'MODULE_DEFAULT_ROLES',
    code: 'INCOME',
    label: 'Income Reports',
    insert_metadata: { roles: ['admin', 'finance', 'president'], description: 'Review and credit BDM income/payslips' },
    sort_order: 0,
  },
  {
    category: 'MODULE_DEFAULT_ROLES',
    code: 'DEDUCTION_SCHEDULE',
    label: 'Deduction Schedules',
    insert_metadata: { roles: ['admin', 'finance', 'president'], description: 'Approve recurring/one-time BDM deductions' },
    sort_order: 0,
  },
  {
    category: 'PROXY_ENTRY_ROLES',
    code: 'INCOME',
    label: 'Income Report (per-BDM payslip + manual deduction lines)',
    insert_metadata: { roles: ['admin', 'finance', 'president'], sort_order: 12, insert_only_metadata: true },
    sort_order: 12,
  },
  {
    category: 'PROXY_ENTRY_ROLES',
    code: 'DEDUCTION_SCHEDULE',
    label: 'Deduction Schedule (BDM cash advance / loan amortization)',
    insert_metadata: { roles: ['admin', 'finance', 'president'], sort_order: 13, insert_only_metadata: true },
    sort_order: 13,
  },
];

const lookupSchema = new mongoose.Schema({
  entity_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Entity', required: true },
  category: { type: String, required: true, uppercase: true, trim: true },
  code: { type: String, required: true, uppercase: true, trim: true },
  label: { type: String, required: true, trim: true },
  sort_order: { type: Number, default: 0 },
  is_active: { type: Boolean, default: true },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true, collection: 'erp_lookups' });

async function run() {
  if (!process.env.MONGO_URI) {
    console.error('[migrateAddStaffToProxyRoles] MONGO_URI not set. Aborting.');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);
  const cluster = process.env.MONGO_URI.split('@')[1]?.split('/')[0] || '(unknown)';
  console.log(`[migrateAddStaffToProxyRoles] Connected to ${cluster}`);
  console.log(`[migrateAddStaffToProxyRoles] Mode: ${ROLLBACK ? 'ROLLBACK' : 'ADD'}  Apply: ${!DRY_RUN}  Upsert missing rows: ${UPSERT}`);

  const Entity = mongoose.model('EntityForMigration', new mongoose.Schema({
    entity_name: String,
    short_name: String,
    status: String,
  }, { collection: 'entities' }));
  const Lookup = mongoose.model('LookupForMigration', lookupSchema);

  const entities = await Entity.find({ status: 'ACTIVE' }).lean();
  console.log(`\n[migrateAddStaffToProxyRoles] Active entities: ${entities.length}`);
  if (entities.length === 0) {
    console.warn('  (no active entities found — check the cluster pointer + entities collection)');
  }

  let inserts = 0, additions = 0, removals = 0, skipped = 0, missing = 0;

  for (const ent of entities) {
    const label = ent.short_name || ent.entity_name || ent._id;
    console.log(`\n=== ${label} (${ent._id}) ===`);

    for (const r of ROWS) {
      const filter = { entity_id: ent._id, category: r.category, code: r.code };
      const existing = await Lookup.findOne(filter).lean();

      if (!existing) {
        if (UPSERT) {
          if (!DRY_RUN) {
            const finalRoles = ROLLBACK
              ? r.insert_metadata.roles.filter((x) => x !== 'staff')
              : Array.from(new Set([...r.insert_metadata.roles, 'staff']));
            await Lookup.create({
              entity_id: ent._id,
              category: r.category,
              code: r.code,
              label: r.label,
              sort_order: r.sort_order,
              is_active: true,
              metadata: { ...r.insert_metadata, roles: finalRoles },
            });
          }
          console.log(`  ${DRY_RUN ? '[dry] would insert' : 'INSERTED'}: ${r.category}.${r.code} (entity had no row; --upsert)`);
          inserts++;
        } else {
          console.log(`  · MISSING: ${r.category}.${r.code} (run with --upsert to insert; or open Lookup Tables in this entity to lazy-seed)`);
          missing++;
        }
        continue;
      }

      const currentRoles = Array.isArray(existing.metadata?.roles) ? existing.metadata.roles : [];
      const hasStaff = currentRoles.includes('staff');

      if (ROLLBACK) {
        if (!hasStaff) {
          console.log(`  · skip ${r.category}.${r.code} — 'staff' not present (roles=${JSON.stringify(currentRoles)})`);
          skipped++;
        } else {
          if (!DRY_RUN) {
            await Lookup.updateOne(filter, { $pull: { 'metadata.roles': 'staff' } });
          }
          console.log(`  ${DRY_RUN ? '[dry] would remove' : 'REMOVED'}: 'staff' from ${r.category}.${r.code} (was ${JSON.stringify(currentRoles)})`);
          removals++;
        }
      } else {
        if (hasStaff) {
          console.log(`  · skip ${r.category}.${r.code} — 'staff' already in roles=${JSON.stringify(currentRoles)}`);
          skipped++;
        } else {
          if (!DRY_RUN) {
            await Lookup.updateOne(filter, { $addToSet: { 'metadata.roles': 'staff' } });
          }
          console.log(`  ${DRY_RUN ? '[dry] would add' : 'ADDED'}: 'staff' to ${r.category}.${r.code} (was ${JSON.stringify(currentRoles)})`);
          additions++;
        }
      }
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`Entities scanned: ${entities.length}`);
  console.log(`Rows ${UPSERT ? 'inserted' : 'missing (would be inserted with --upsert)'}: ${UPSERT ? inserts : missing}`);
  console.log(`'staff' additions: ${additions}`);
  console.log(`'staff' removals: ${removals}`);
  console.log(`Skipped (already in desired state): ${skipped}`);

  if (DRY_RUN) {
    console.log(`\nDRY-RUN complete. Re-run with --apply to commit.`);
    if (missing > 0 && !UPSERT) {
      console.log(`Tip: ${missing} rows missing — pass --upsert to insert from baseline.`);
    }
  } else {
    console.log(`\n[migrateAddStaffToProxyRoles] ✓ Migration ${ROLLBACK ? 'rollback' : 'apply'} complete.`);
  }

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('[migrateAddStaffToProxyRoles] FATAL:', err);
  process.exit(1);
});
