/* eslint-disable vip-tenant/require-entity-filter -- standalone admin/remediation script: no req context; intentional cross-entity reads/writes for ops work */
/**
 * Quarantine Phantom GRNs — May 6, 2026
 *
 * Context: 3 GRNs were found in APPROVED status with null event_id, no
 * TransactionEvent, and (almost certainly) no InventoryLedger effect.
 * They reached APPROVED via the Approval Hub bug in
 * universalApprovalController.js (now patched) which flipped status
 * without invoking approveGrnCore. They are paper artifacts — claim
 * stock received but never actually posted any inventory.
 *
 * This script flips them to REJECTED with an explicit rejection_reason
 * so they no longer claim received stock and cannot be reversed (the
 * guard already blocks reversal of APPROVED + null-event_id GRNs, but
 * REJECTED is cleaner — surfaces explicitly in BDM's queue and audit
 * trail. BDM can re-create + re-submit through the now-fixed flow if
 * the receipt was physically real.)
 *
 * Idempotent: if a GRN is already REJECTED with the QUARANTINE tag, skip.
 *
 * Per-GRN safety checks before flipping:
 *   - status === 'APPROVED'
 *   - event_id is null/missing
 *   - deletion_event_id is null/missing
 *   - No InventoryLedger rows reference grn._id via event_id (defensive
 *     — confirms truly phantom; if rows exist, abort with warning)
 *
 * Usage (from backend/):
 *   node erp/scripts/quarantinePhantomGrns_2026-05-06.js           # dry-run
 *   node erp/scripts/quarantinePhantomGrns_2026-05-06.js --apply   # writes
 */
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../../config/db');
const GrnEntry = require('../models/GrnEntry');
const InventoryLedger = require('../models/InventoryLedger');
const TransactionEvent = require('../models/TransactionEvent');
const Undertaking = require('../models/Undertaking');
const ErpAuditLog = require('../models/ErpAuditLog');
const Warehouse = require('../models/Warehouse');

const APPLY = process.argv.includes('--apply');
const QUARANTINE_TAG = 'QUARANTINE_PHANTOM_GRN_2026-05-06';

const TARGET_GRN_IDS = [
  '69f2be85803f7f73aba46170',
  '69faa033bdb8ae7f776ae499',
  '69faa18bd2f8917690f75143',
];

const REJECTION_REASON =
  `[${QUARANTINE_TAG}] GRN reached APPROVED via the Approval Hub bug ` +
  `(universalApprovalController.js, fixed 2026-05-06). approveGrnCore was ` +
  `never invoked, so no TransactionEvent / InventoryLedger / event_id was ` +
  `created — this GRN is a paper artifact with no actual stock impact. ` +
  `Quarantined to REJECTED. If the physical receipt was real, BDM should ` +
  `re-create this GRN through the normal flow (which now properly posts ` +
  `inventory when approved through the Hub).`;

async function run() {
  await connectDB();

  const warehouses = await Warehouse.find({}).lean();
  const whMap = new Map(warehouses.map(w => [w._id.toString(), w.warehouse_code]));

  console.log(`\nMode: ${APPLY ? 'APPLY (writes will occur)' : 'DRY-RUN (no writes)'}\n`);

  let processed = 0;
  let alreadyDone = 0;
  let aborted = 0;

  for (const grnId of TARGET_GRN_IDS) {
    const grn = await GrnEntry.findById(grnId);
    if (!grn) {
      console.log(`  ${grnId} — NOT FOUND, skipping`);
      continue;
    }

    // Idempotency check
    if (grn.status === 'REJECTED' && (grn.rejection_reason || '').includes(QUARANTINE_TAG)) {
      console.log(`  ${grnId} — already quarantined, skipping`);
      alreadyDone++;
      continue;
    }

    // Safety checks
    if (grn.status !== 'APPROVED') {
      console.log(`  ${grnId} — UNEXPECTED status='${grn.status}' (expected APPROVED), skipping`);
      aborted++;
      continue;
    }
    if (grn.event_id) {
      console.log(`  ${grnId} — UNEXPECTED event_id is set (${grn.event_id}), skipping`);
      aborted++;
      continue;
    }
    if (grn.deletion_event_id) {
      console.log(`  ${grnId} — UNEXPECTED deletion_event_id is set, skipping`);
      aborted++;
      continue;
    }

    // Defensive: confirm no InventoryLedger rows reference this GRN's id
    // (via TransactionEvent.document_ref). If any exist, it would mean the
    // GRN DID post stock through some other path; quarantine is unsafe.
    const matchingEvents = await TransactionEvent.find({
      document_ref: grn._id.toString(),
      event_type: { $in: ['GRN', 'STOCK_REASSIGNMENT_GRN'] },
    }).lean();
    if (matchingEvents.length > 0) {
      console.log(`  ${grnId} — UNEXPECTED ${matchingEvents.length} matching TransactionEvent(s) found (may have posted stock), skipping for manual review`);
      aborted++;
      continue;
    }

    // Check linked Undertaking (informational)
    const ut = await Undertaking.findOne({ linked_grn_id: grn._id }).lean();
    const utInfo = ut ? `UT ${ut.undertaking_number || ut._id} status=${ut.status}` : 'no UT';

    const whCode = whMap.get(grn.warehouse_id?.toString()) || '?';
    const lines = grn.line_items?.length || 0;
    console.log(`  ${grnId} — APPROVED→REJECTED | warehouse=${whCode} | lines=${lines} | ${utInfo}`);

    if (APPLY) {
      const oldStatus = grn.status;
      grn.status = 'REJECTED';
      grn.rejection_reason = REJECTION_REASON;
      grn.reviewed_at = new Date();
      // reviewed_by deliberately not changed — preserves the original Hub approver's identity
      await grn.save();

      await ErpAuditLog.logChange({
        entity_id: grn.entity_id,
        bdm_id: grn.bdm_id,
        log_type: 'STATUS_CHANGE',
        target_ref: grn._id.toString(),
        target_model: 'GrnEntry',
        field_changed: 'status',
        old_value: oldStatus,
        new_value: 'REJECTED',
        changed_by: null,
        note: `Quarantine remediation script (${QUARANTINE_TAG}): phantom GRN with no event_id and no InventoryLedger effect`,
      }).catch(err => console.warn(`    audit log failed (non-critical): ${err.message}`));
      processed++;
    }
  }

  console.log(`\nSummary:`);
  console.log(`  Processed:        ${processed}`);
  console.log(`  Already done:     ${alreadyDone}`);
  console.log(`  Aborted (safety): ${aborted}`);
  console.log(`  Total targets:    ${TARGET_GRN_IDS.length}`);

  if (!APPLY && processed === 0 && alreadyDone === 0) {
    console.log('\nDRY-RUN only. Re-run with --apply to flip status to REJECTED.');
  }

  await mongoose.disconnect();
}

run().catch(err => { console.error(err); process.exit(1); });
