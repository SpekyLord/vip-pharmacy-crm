/* eslint-disable vip-tenant/require-entity-filter -- standalone admin/diagnostic script: no req context; intentional cross-entity reads for ops work */
/**
 * Audit GRNs with null event_id — Read-only diagnostic
 *
 * Context: A GRN with null event_id will trigger the reverseInventoryFor
 * null-match cross-cut bug (now guarded post-09847d3, but worth knowing
 * which GRNs exist in this state). This script reports every active GRN
 * (status=APPROVED, deletion_event_id=null) that has event_id missing or
 * null, and attempts to identify a candidate TransactionEvent that could
 * be backfilled.
 *
 * Read-only — writes nothing. Safe to run in prod whenever.
 *
 * Usage (from backend/):
 *   node erp/scripts/auditGrnNullEventId.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../../config/db');
const GrnEntry = require('../models/GrnEntry');
const TransactionEvent = require('../models/TransactionEvent');
const Warehouse = require('../models/Warehouse');
const Entity = require('../models/Entity');

async function run() {
  await connectDB();

  // 1. Find active GRNs with null/missing event_id
  const broken = await GrnEntry.find({
    status: 'APPROVED',
    deletion_event_id: null,
    $or: [{ event_id: null }, { event_id: { $exists: false } }],
  }).lean();

  if (!broken.length) {
    console.log('\nNo active GRNs with null event_id found. Guard has nothing to block.\n');
    return await mongoose.disconnect();
  }

  // 2. Lookup tables for human-readable output
  const warehouses = await Warehouse.find({}).lean();
  const whMap = new Map(warehouses.map(w => [w._id.toString(), w.warehouse_code]));
  const entities = await Entity.find({}).lean();
  const entMap = new Map(entities.map(e => [e._id.toString(), e.entity_code || e.name]));

  console.log(`\nFound ${broken.length} active GRN(s) with null/missing event_id:\n`);
  console.log('GRN ID                    | Entity      | Warehouse   | Lines | Candidate TransactionEvent');
  console.log('-'.repeat(115));

  let withCandidate = 0;
  let withoutCandidate = 0;

  for (const grn of broken) {
    // Look for a TransactionEvent whose document_ref matches this GRN's _id
    // (approveGrnCore stamps `document_ref: grn._id.toString()` at line 886)
    const candidates = await TransactionEvent.find({
      document_ref: grn._id.toString(),
      event_type: { $in: ['GRN', 'STOCK_REASSIGNMENT_GRN'] },
    }).lean();

    const entityCode = entMap.get(grn.entity_id?.toString()) || '?';
    const whCode = whMap.get(grn.warehouse_id?.toString()) || '?';
    const lines = grn.line_items?.length || 0;

    let candidateStr;
    if (candidates.length === 0) {
      candidateStr = '(none — manual review needed)';
      withoutCandidate++;
    } else if (candidates.length === 1) {
      candidateStr = `${candidates[0]._id} (backfill OK)`;
      withCandidate++;
    } else {
      candidateStr = `${candidates.length} candidates (ambiguous — pick by created_at)`;
      withoutCandidate++;
    }

    console.log(
      `${grn._id} | ${entityCode.padEnd(11)} | ${whCode.padEnd(11)} | ${String(lines).padStart(5)} | ${candidateStr}`
    );
  }

  console.log('-'.repeat(115));
  console.log(`\nSummary:`);
  console.log(`  Total broken GRNs:       ${broken.length}`);
  console.log(`  Backfillable (1 match):  ${withCandidate}`);
  console.log(`  Need manual review:      ${withoutCandidate}`);
  console.log(`\nAll of the above are blocked by the guard in documentReversalService.js`);
  console.log(`from triggering the OPENING_BALANCE cross-cut. They cannot be reversed`);
  console.log(`through the President Reversals Console until event_id is backfilled.`);
  console.log(`\nNext step: write a separate backfill script after reviewing this list.\n`);

  await mongoose.disconnect();
}

run().catch(err => { console.error(err); process.exit(1); });
