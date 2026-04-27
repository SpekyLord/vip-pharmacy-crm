/**
 * Find Orphaned Ledger Entries — VIP-1.B / Apr 2026 follow-up.
 *
 * Context: Collection / Sales / PRF-CALF auto-journals run OUTSIDE the POST
 * transaction (best-effort, "non-blocking"). If the journal helper throws,
 * the source doc stays POSTED but no JournalEntry exists for it. The CR-rebate
 * routing addition (VIP-1.B) is atomic with the POST — that asymmetry means a
 * silent failure leaves an INTERNAL rebate trail intact while the BIR-facing
 * settlement ledger row is missing.
 *
 * This script sweeps each transactional collection where rows are POSTED with
 * an `event_id` set, and flags any whose corresponding `JournalEntry` (matched
 * by `source_event_id`) is missing or non-POSTED. It is READ-ONLY — repair is
 * a per-doc human decision (re-trigger the JE via "Retry JE" once that ships,
 * or re-open + re-submit the doc in the meantime).
 *
 * Modules covered:
 *   - SALES         (SalesLine.event_id ↔ JournalEntry.source_module='SALES')
 *   - COLLECTION    (Collection.event_id ↔ JournalEntry.source_module='COLLECTION')
 *   - EXPENSE/PRF   (PrfCalf.event_id ↔ JournalEntry.source_module='EXPENSE')
 *
 * Note: zero-amount sales (complimentary/samples) are intentionally skipped
 * by `journalFromSale` — the script honors that to avoid false positives.
 *
 * Usage (from backend/):
 *   node erp/scripts/findOrphanedLedgerEntries.js
 *
 * Optional flags:
 *   --entity <id>    Scope to a single entity (default: all entities)
 *   --module <name>  Scope to one of: sales, collections, prf
 *   --days <n>       Only check rows posted in the last N days (default: 30)
 *   --csv            Emit a CSV block to stdout
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
const DAYS = parseInt(flag('days'), 10) || 30;

const MODULES = [
  {
    key: 'sales',
    sourceModule: 'SALES',
    modelPath: '../models/SalesLine',
    docRefField: 'doc_ref',
    dateField: 'csi_date',
    amountField: 'invoice_total',
    skipFilter: { invoice_total: { $gt: 0 } }, // zero-amount sales skip JE by design
  },
  {
    key: 'collections',
    sourceModule: 'COLLECTION',
    modelPath: '../models/Collection',
    docRefField: 'cr_no',
    dateField: 'cr_date',
    amountField: 'cr_amount',
    skipFilter: { cr_amount: { $gt: 0 } },
  },
  {
    key: 'prf',
    sourceModule: 'EXPENSE',
    modelPath: '../models/PrfCalf',
    docRefField: 'doc_ref',
    dateField: 'posted_at',
    amountField: 'amount',
    skipFilter: { amount: { $gt: 0 } },
  },
];

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log(`Connected. Scanning POSTED rows from last ${DAYS} day(s) for orphan ledgers…\n`);

  const Entity = require('../models/Entity');
  const JournalEntry = require('../models/JournalEntry');

  const entityQuery = ENTITY_FILTER && ENTITY_FILTER !== true ? { _id: ENTITY_FILTER } : {};
  const entities = await Entity.find(entityQuery).select('_id name short_name').lean();
  if (!entities.length) {
    console.error('No entities matched filter.');
    process.exit(1);
  }

  const since = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000);
  const csvRows = [];
  let grandTotal = 0;
  let grandScanned = 0;

  for (const entity of entities) {
    console.log(`\n═══ Entity: ${entity.short_name || entity.name} (${entity._id}) ═══`);

    for (const mod of MODULES) {
      if (MODULE_FILTER && MODULE_FILTER !== mod.key) continue;

      const Model = require(mod.modelPath);

      // Candidate rows: POSTED, in window, with event_id stamped, non-zero.
      const candidateFilter = {
        entity_id: entity._id,
        status: 'POSTED',
        event_id: { $ne: null },
        posted_at: { $gte: since },
        ...(mod.skipFilter || {}),
      };
      const candidates = await Model.find(candidateFilter)
        .select(`_id event_id ${mod.docRefField} ${mod.dateField} ${mod.amountField} bdm_id status posted_at`)
        .lean();

      grandScanned += candidates.length;

      if (!candidates.length) {
        console.log(`  [${mod.key}] clean (0 POSTED rows in window)`);
        continue;
      }

      const eventIds = candidates.map(c => c.event_id);

      // For each candidate, is there a POSTED JE referencing its event_id?
      const jeRows = await JournalEntry.find({
        entity_id: entity._id,
        source_module: mod.sourceModule,
        source_event_id: { $in: eventIds },
        status: 'POSTED',
      }).select('source_event_id').lean();

      const haveJe = new Set(jeRows.map(j => String(j.source_event_id)));

      const orphans = candidates.filter(c => !haveJe.has(String(c.event_id)));

      if (!orphans.length) {
        console.log(`  [${mod.key}] clean (${candidates.length} rows scanned, all have POSTED JE)`);
        continue;
      }

      grandTotal += orphans.length;
      console.log(`  [${mod.key}] ⚠ ${orphans.length}/${candidates.length} POSTED rows MISSING settlement JE:`);

      const preview = orphans.slice(0, 5);
      for (const row of preview) {
        const ref = row[mod.docRefField] || row._id;
        const dt = row[mod.dateField] ? new Date(row[mod.dateField]).toISOString().slice(0, 10) : '';
        const amt = row[mod.amountField] ?? '';
        console.log(`    • ${ref}  ${dt}  ₱${amt}  posted_at=${row.posted_at?.toISOString().slice(0, 16) || ''}`);
      }
      if (orphans.length > 5) console.log(`    … (+${orphans.length - 5} more)`);

      if (EMIT_CSV) {
        for (const row of orphans) {
          csvRows.push([
            entity.short_name || entity.name,
            mod.key,
            row[mod.docRefField] || row._id,
            row[mod.dateField] ? new Date(row[mod.dateField]).toISOString() : '',
            row[mod.amountField] ?? '',
            row.posted_at ? row.posted_at.toISOString() : '',
            String(row._id),
            String(row.event_id),
          ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
        }
      }
    }
  }

  console.log(`\n═══ Scanned: ${grandScanned} rows · Orphans: ${grandTotal} ═══`);

  if (EMIT_CSV && csvRows.length) {
    console.log('\n--- CSV BEGIN ---');
    console.log('entity,module,doc_ref,doc_date,amount,posted_at,_id,event_id');
    for (const line of csvRows) console.log(line);
    console.log('--- CSV END ---');
  }

  if (grandTotal > 0) {
    console.log('\nRepair path:');
    console.log('  1. For each orphan, check ErpAuditLog for a LEDGER_ERROR with target_ref matching');
    console.log('     the doc_ref — that captures why the JE engine crashed.');
    console.log('  2. Once the "Retry JE" feature ships (planned next), open the doc and click retry.');
    console.log('  3. Until then: reopen → re-submit (idempotent JE creation by source_event_id).');
    console.log('\nExit code 1 — wire this script into a daily cron and alert if grandTotal > 0.');
  }

  await mongoose.disconnect();
  process.exit(grandTotal > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Failed:', err);
  process.exit(2);
});
