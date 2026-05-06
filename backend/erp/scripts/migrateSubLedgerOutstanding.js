/**
 * Phase A.4 — Backfill `outstanding_amount` for existing POSTED SalesLines
 * and SupplierInvoices.
 *
 * Why: the new pre-save hooks (SalesLine seeds outstanding=invoice_total on
 * first POST; SupplierInvoice computes outstanding = total − amount_paid)
 * only fire when the doc is saved. Existing POSTED rows in the DB have
 * outstanding_amount=null, which would make the integrity sweep alarm and
 * the AR aging report empty until each row is touched.
 *
 * This script walks every POSTED row per entity, computes the correct
 * outstanding from authoritative sources, and updates the field atomically.
 *
 * Idempotent — re-running yields the same answer. Safe to run during business
 * hours (read-mostly sweep + per-row $set).
 *
 * Dry-run by default. Add --apply to write.
 *
 * Usage (from backend/):
 *   node erp/scripts/migrateSubLedgerOutstanding.js              # dry-run
 *   node erp/scripts/migrateSubLedgerOutstanding.js --apply
 *   node erp/scripts/migrateSubLedgerOutstanding.js --entity <id> --apply
 *   node erp/scripts/migrateSubLedgerOutstanding.js --kind ar    # AR only
 *   node erp/scripts/migrateSubLedgerOutstanding.js --kind ap    # AP only
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

const APPLY = !!flag('apply');
const ENTITY_FILTER = flag('entity');
const KIND_FILTER = (flag('kind') || 'all').toString().toLowerCase();

async function migrateAr(entityId) {
  const SalesLine = require('../models/SalesLine');
  const Collection = require('../models/Collection');
  const arAgingService = require('../services/arAgingService');

  const filter = { status: 'POSTED' };
  if (entityId) filter.entity_id = new mongoose.Types.ObjectId(entityId);

  const total = await SalesLine.countDocuments(filter);
  console.log(`  AR: ${total} POSTED SalesLine row(s)${entityId ? ' for this entity' : ''}`);

  let scanned = 0, updated = 0, unchanged = 0, cashRoute = 0, errors = 0;
  const overCollected = [];

  const cursor = SalesLine.find(filter).select('_id').cursor({ batchSize: 200 });
  for await (const doc of cursor) {
    scanned += 1;
    try {
      if (APPLY) {
        const r = await arAgingService.recomputeOutstandingForSale(doc._id);
        if (r.skipped === 'CASH_ROUTE') cashRoute += 1;
        else if (r.skipped) {/* NOT_POSTED guards — count nothing */}
        else updated += 1;
        if (r.over_collected > 0) {
          overCollected.push({ _id: String(r._id), over: r.over_collected });
        }
      } else {
        // Dry-run: compute the would-be outstanding without writing.
        const sl = await SalesLine.findById(doc._id)
          .select('_id invoice_total outstanding_amount petty_cash_fund_id payment_mode deletion_event_id')
          .lean();
        // Phase 28 SAP Storno — reversed rows have effective outstanding of 0
        // (the reversal JE credits AR_TRADE back). Mirror the service helper.
        if (sl.deletion_event_id) {
          if (sl.outstanding_amount === 0) unchanged += 1;
          else updated += 1;
          continue;
        }
        if (arAgingService.isCashRoute(sl)) {
          if (sl.outstanding_amount === 0) unchanged += 1;
          else { cashRoute += 1; updated += 1; }
          continue;
        }
        const agg = await Collection.aggregate([
          { $match: { status: 'POSTED' } },
          { $unwind: '$settled_csis' },
          { $match: { 'settled_csis.sales_line_id': sl._id } },
          { $group: { _id: null, paid: { $sum: '$settled_csis.invoice_amount' } } },
        ]);
        const paid = Math.round((agg[0]?.paid || 0) * 100) / 100;
        const outstanding = Math.max(
          0, Math.round((Number(sl.invoice_total || 0) - paid) * 100) / 100,
        );
        if (sl.outstanding_amount === outstanding) unchanged += 1;
        else updated += 1;
      }
    } catch (err) {
      errors += 1;
      console.error(`  AR error on ${doc._id}: ${err.message}`);
    }
    if (scanned % 500 === 0) {
      console.log(`    ... ${scanned}/${total} scanned`);
    }
  }

  return { scanned, updated, unchanged, cashRoute, errors, overCollected };
}

async function migrateAp(entityId) {
  const SupplierInvoice = require('../models/SupplierInvoice');
  const arAgingService = require('../services/arAgingService');

  const filter = { status: 'POSTED' };
  if (entityId) filter.entity_id = new mongoose.Types.ObjectId(entityId);

  const total = await SupplierInvoice.countDocuments(filter);
  console.log(`  AP: ${total} POSTED SupplierInvoice row(s)${entityId ? ' for this entity' : ''}`);

  let scanned = 0, updated = 0, unchanged = 0, errors = 0;
  const overPaid = [];

  const cursor = SupplierInvoice.find(filter).select('_id').cursor({ batchSize: 200 });
  for await (const doc of cursor) {
    scanned += 1;
    try {
      if (APPLY) {
        const r = await arAgingService.recomputeOutstandingForSupplierInvoice(doc._id);
        if (r.skipped) {/* NOT_POSTED — count nothing */}
        else updated += 1;
        if (r.over_paid > 0) {
          overPaid.push({ _id: String(r._id), over: r.over_paid });
        }
      } else {
        const si = await SupplierInvoice.findById(doc._id)
          .select('_id total_amount amount_paid outstanding_amount deletion_event_id')
          .lean();
        // Phase 28 SAP Storno — reversed SI rows clamp to 0.
        if (si.deletion_event_id) {
          if (si.outstanding_amount === 0) unchanged += 1;
          else updated += 1;
          continue;
        }
        const outstanding = Math.max(
          0,
          Math.round((Number(si.total_amount || 0) - Number(si.amount_paid || 0)) * 100) / 100,
        );
        if (si.outstanding_amount === outstanding) unchanged += 1;
        else updated += 1;
      }
    } catch (err) {
      errors += 1;
      console.error(`  AP error on ${doc._id}: ${err.message}`);
    }
  }

  return { scanned, updated, unchanged, errors, overPaid };
}

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log(`Connected. Mode: ${APPLY ? 'APPLY (writes)' : 'DRY-RUN (no writes)'}`);
  console.log(`Kind filter: ${KIND_FILTER}`);

  const Entity = require('../models/Entity');
  const entityQuery = ENTITY_FILTER ? { _id: ENTITY_FILTER } : {};
  const entities = await Entity.find(entityQuery).select('_id name short_name').lean();
  console.log(`Entities to scan: ${entities.length}\n`);

  const grand = { ar: { scanned: 0, updated: 0, unchanged: 0, cashRoute: 0, errors: 0, overCollected: [] },
                  ap: { scanned: 0, updated: 0, unchanged: 0, errors: 0, overPaid: [] } };

  for (const entity of entities) {
    const name = entity.short_name || entity.name || String(entity._id);
    console.log(`═══ ${name} (${entity._id}) ═══`);

    if (KIND_FILTER === 'all' || KIND_FILTER === 'ar') {
      const r = await migrateAr(entity._id);
      grand.ar.scanned += r.scanned;
      grand.ar.updated += r.updated;
      grand.ar.unchanged += r.unchanged;
      grand.ar.cashRoute += r.cashRoute;
      grand.ar.errors += r.errors;
      grand.ar.overCollected.push(...r.overCollected.map((o) => ({ entity: name, ...o })));
      console.log(`    AR done: ${r.scanned} scanned, ${r.updated} ${APPLY ? 'updated' : 'would update'}, ${r.unchanged} unchanged, ${r.cashRoute} cash-route, ${r.errors} errors`);
    }

    if (KIND_FILTER === 'all' || KIND_FILTER === 'ap') {
      const r = await migrateAp(entity._id);
      grand.ap.scanned += r.scanned;
      grand.ap.updated += r.updated;
      grand.ap.unchanged += r.unchanged;
      grand.ap.errors += r.errors;
      grand.ap.overPaid.push(...r.overPaid.map((o) => ({ entity: name, ...o })));
      console.log(`    AP done: ${r.scanned} scanned, ${r.updated} ${APPLY ? 'updated' : 'would update'}, ${r.unchanged} unchanged, ${r.errors} errors`);
    }
    console.log('');
  }

  console.log('═══ GRAND TOTAL ═══');
  if (KIND_FILTER === 'all' || KIND_FILTER === 'ar') {
    console.log(`  AR: ${grand.ar.scanned} scanned, ${grand.ar.updated} ${APPLY ? 'updated' : 'would update'}, ${grand.ar.unchanged} unchanged, ${grand.ar.cashRoute} cash-route, ${grand.ar.errors} errors`);
    if (grand.ar.overCollected.length) {
      console.log(`  ⚠ ${grand.ar.overCollected.length} over-collected SalesLine(s) clamped to 0:`);
      for (const oc of grand.ar.overCollected.slice(0, 20)) {
        console.log(`    [${oc.entity}] SalesLine ${oc._id} over by ₱${oc.over.toFixed(2)}`);
      }
      if (grand.ar.overCollected.length > 20) console.log(`    (${grand.ar.overCollected.length - 20} more — review with: db.erp_sales_lines.find({outstanding_amount:0,...}))`);
    }
  }
  if (KIND_FILTER === 'all' || KIND_FILTER === 'ap') {
    console.log(`  AP: ${grand.ap.scanned} scanned, ${grand.ap.updated} ${APPLY ? 'updated' : 'would update'}, ${grand.ap.unchanged} unchanged, ${grand.ap.errors} errors`);
    if (grand.ap.overPaid.length) {
      console.log(`  ⚠ ${grand.ap.overPaid.length} over-paid SupplierInvoice(s) clamped to 0:`);
      for (const op of grand.ap.overPaid.slice(0, 20)) {
        console.log(`    [${op.entity}] SupplierInvoice ${op._id} over by ₱${op.over.toFixed(2)}`);
      }
    }
  }

  if (!APPLY) {
    console.log('\nDry-run only. Re-run with --apply to write.');
  }

  await mongoose.disconnect();
  process.exit(grand.ar.errors + grand.ap.errors > 0 ? 1 : 0);
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Fatal:', err);
    process.exit(2);
  });
}
