/**
 * Find Orphaned Owner Records — Phase G4.5d / extended G4.5e (April 23, 2026).
 *
 * Context: before G4.5d, `resolveOwnerForWrite` silently fell back to
 * `req.user._id` when `assigned_to` was missing in the request body. For
 * admin / finance / president this meant a non-BDM user id could land on
 * `bdm_id`, corrupting per-BDM KPIs, commissions, and Approval Hub hydration.
 *
 * This script sweeps every transactional collection that carries a
 * `bdm_id` owner field and flags rows where `bdm_id` points to a user whose
 * role is NOT in VALID_OWNER_ROLES for that module. It is READ-ONLY —
 * reassigning ownership is a human decision (which BDM should own it?) and
 * must be done via the app (re-open → edit → re-submit with OwnerPicker).
 *
 * Phase G4.5e (Apr 23, 2026) extended coverage from 4 → 7 collections:
 *   + prf_calf        (PrfCalf)          VALID_OWNER_ROLES.PRF_CALF
 *   + car_logbook_day (CarLogbookEntry)  VALID_OWNER_ROLES.CAR_LOGBOOK
 *   + undertaking     (Undertaking)      VALID_OWNER_ROLES.UNDERTAKING
 *
 * Phase G4.5f (Apr 23, 2026) extended coverage from 7 → 8 collections:
 *   + smer_entry      (SmerEntry)        VALID_OWNER_ROLES.SMER
 *
 * Usage (from backend/):
 *   node erp/scripts/findOrphanedOwnerRecords.js
 *
 * Optional flags:
 *   --entity <id>    Scope to a single entity (default: all entities)
 *   --module <name>  Scope to one of: sales, collections, expenses, car_logbook,
 *                     car_logbook_day, prf_calf, undertaking, smer_entry
 *   --csv            Emit a CSV block to stdout (doc_ref, date, amount, etc.)
 */
require('dotenv').config();
const mongoose = require('mongoose');

const args = process.argv.slice(2);
function flag(name) {
  const i = args.indexOf(`--${name}`);
  if (i < 0) return null;
  const val = args[i + 1];
  return val && !val.startsWith('--') ? val : true;
}

const ENTITY_FILTER = flag('entity');
const MODULE_FILTER = flag('module');
const EMIT_CSV = !!flag('csv');

const MODULES = [
  {
    key: 'sales',
    lookupCode: 'SALES',
    modelPath: '../models/SalesLine',
    displayFields: { ref: 'doc_ref', date: 'csi_date', amount: 'line_total' },
  },
  {
    key: 'collections',
    lookupCode: 'COLLECTIONS',
    modelPath: '../models/Collection',
    displayFields: { ref: 'collection_ref', date: 'collection_date', amount: 'amount' },
  },
  {
    key: 'expenses',
    lookupCode: 'EXPENSES',
    modelPath: '../models/ExpenseEntry',
    displayFields: { ref: 'doc_ref', date: 'expense_date', amount: 'total_amount' },
  },
  {
    key: 'car_logbook',
    lookupCode: 'CAR_LOGBOOK',
    modelPath: '../models/CarLogbookCycle',
    displayFields: { ref: 'cycle_ref', date: 'period', amount: 'total_amount' },
  },
  // Phase G4.5e — per-day logbook docs. The cycle wrapper and the per-day docs
  // both carry bdm_id and are upserted independently, so both need sweeping.
  {
    key: 'car_logbook_day',
    lookupCode: 'CAR_LOGBOOK',
    modelPath: '../models/CarLogbookEntry',
    displayFields: { ref: '_id', date: 'entry_date', amount: 'total_fuel_amount' },
  },
  // Phase G4.5e — PrfCalf docs.
  {
    key: 'prf_calf',
    lookupCode: 'PRF_CALF',
    modelPath: '../models/PrfCalf',
    displayFields: { ref: 'calf_number', date: 'created_at', amount: 'amount' },
  },
  // Phase G4.5e — Undertaking docs. bdm_id is inherited from the GRN, so
  // orphans here usually indicate an upstream GRN bdm_id issue — fix the GRN
  // first (which will cascade if the UT is still DRAFT/SUBMITTED).
  {
    key: 'undertaking',
    lookupCode: 'UNDERTAKING',
    modelPath: '../models/Undertaking',
    displayFields: { ref: 'undertaking_number', date: 'receipt_date', amount: null },
  },
  // Phase G4.5f — SMER entries. bdm_id is stamped at create (and locked on
  // update). An orphaned SMER here typically means a pre-G4.5d admin created
  // a SMER on their own _id before the Rule #21 guard landed — repair by
  // re-opening the SMER, picking the correct BDM via the G4.5f BDM picker,
  // and re-submitting. Amount shown: total_reimbursable (per-diem + transport).
  {
    key: 'smer_entry',
    lookupCode: 'SMER',
    modelPath: '../models/SmerEntry',
    displayFields: { ref: '_id', date: 'period', amount: 'total_reimbursable' },
  },
];

const DEFAULT_VALID_OWNER_ROLES = ['contractor', 'employee'];

async function getValidOwnerRoles(Lookup, entityId, moduleCode) {
  try {
    const doc = await Lookup.findOne({
      entity_id: entityId,
      category: 'VALID_OWNER_ROLES',
      code: moduleCode,
      is_active: true,
    }).lean();
    if (doc && Array.isArray(doc.metadata?.roles) && doc.metadata.roles.length) {
      return doc.metadata.roles;
    }
  } catch (_) { /* fall through to default */ }
  return DEFAULT_VALID_OWNER_ROLES;
}

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected. Scanning for orphaned owner records…\n');

  const User = require('../../models/User');
  const Entity = require('../models/Entity');
  const Lookup = require('../models/Lookup');

  const entityQuery = ENTITY_FILTER && ENTITY_FILTER !== true ? { _id: ENTITY_FILTER } : {};
  const entities = await Entity.find(entityQuery).select('_id name short_name').lean();
  if (!entities.length) {
    console.error('No entities matched filter.');
    process.exit(1);
  }

  const csvRows = [];
  let grandTotal = 0;

  for (const entity of entities) {
    console.log(`\n═══ Entity: ${entity.short_name || entity.name} (${entity._id}) ═══`);

    for (const mod of MODULES) {
      if (MODULE_FILTER && MODULE_FILTER !== mod.key) continue;

      const Model = require(mod.modelPath);
      const validRoles = await getValidOwnerRoles(Lookup, entity._id, mod.lookupCode);

      // Find all users in this entity whose role is NOT a valid owner.
      const nonOwnerUsers = await User.find({
        $or: [
          { entity_id: entity._id },
          { entity_ids: entity._id },
        ],
        role: { $nin: validRoles },
        isActive: { $ne: false },
      }).select('_id name email role').lean();

      if (!nonOwnerUsers.length) continue;

      const nonOwnerIds = nonOwnerUsers.map(u => u._id);
      const userMap = new Map(nonOwnerUsers.map(u => [String(u._id), u]));

      const orphans = await Model.find({
        entity_id: entity._id,
        bdm_id: { $in: nonOwnerIds },
      }).lean();

      if (!orphans.length) {
        console.log(`  [${mod.key}] clean (${nonOwnerUsers.length} non-owner users scanned, 0 orphans)`);
        continue;
      }

      grandTotal += orphans.length;

      // Group by owner for a compact summary
      const byOwner = new Map();
      for (const row of orphans) {
        const key = String(row.bdm_id);
        if (!byOwner.has(key)) byOwner.set(key, []);
        byOwner.get(key).push(row);
      }

      console.log(`  [${mod.key}] ⚠ ${orphans.length} orphaned rows (valid owner roles: ${validRoles.join(', ')}):`);
      for (const [ownerId, rows] of byOwner) {
        const u = userMap.get(ownerId);
        console.log(`    • ${u?.name || ownerId} (${u?.role || '?'}, ${u?.email || ''}) — ${rows.length} row(s)`);

        if (EMIT_CSV) {
          for (const row of rows) {
            csvRows.push([
              entity.short_name || entity.name,
              mod.key,
              u?.name || ownerId,
              u?.role || '',
              row[mod.displayFields.ref] || row._id,
              row[mod.displayFields.date] || '',
              // Phase G4.5e — some models (Undertaking) have no amount field.
              mod.displayFields.amount ? (row[mod.displayFields.amount] ?? '') : '',
              row.status || '',
              !!row.recorded_on_behalf_of,
              String(row._id),
            ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
          }
        } else {
          // Show up to 5 example refs per owner
          const preview = rows.slice(0, 5).map(r => r[mod.displayFields.ref] || r._id).join(', ');
          const more = rows.length > 5 ? ` (+${rows.length - 5} more)` : '';
          console.log(`      refs: ${preview}${more}`);
        }
      }
    }
  }

  console.log(`\n═══ Total orphaned rows: ${grandTotal} ═══`);

  if (EMIT_CSV && csvRows.length) {
    console.log('\n--- CSV BEGIN ---');
    console.log('entity,module,owner_name,owner_role,doc_ref,date,amount,status,was_proxied,_id');
    for (const line of csvRows) console.log(line);
    console.log('--- CSV END ---');
  }

  if (grandTotal > 0) {
    console.log('\nRepair path: for each flagged row, re-open the doc in the app, reassign');
    console.log('ownership via OwnerPicker to the correct BDM, then re-submit. Period locks');
    console.log('and journal reversals apply as normal.');
  }

  await mongoose.disconnect();
}

main().catch(err => {
  console.error('Failed:', err);
  process.exit(1);
});
