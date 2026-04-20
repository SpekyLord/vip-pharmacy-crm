#!/usr/bin/env node
/**
 * backfillGrnUndertakings.js — Phase 32 (Apr 2026)
 *
 * For every APPROVED GRN that has no `undertaking_id`, create a historical
 * ACKNOWLEDGED Undertaking whose line_items mirror the GRN. Lines are marked
 * `scan_confirmed: false` (we can't retroactively claim the BDM scanned the
 * packaging), and a note is set on the Undertaking documenting the backfill.
 *
 * Strategy:
 *   1. Find every approved GrnEntry without `undertaking_id` and without a
 *      `deletion_event_id` (active, non-reversed GRN).
 *   2. For each, build a line_items array from the GRN's line_items, copying
 *      product_id, expected_qty, received_qty, batch_lot_no, expiry_date,
 *      purchase_uom/selling_uom/conversion_factor. scan_confirmed: false.
 *   3. Create the Undertaking in status ACKNOWLEDGED, acknowledged_by = GRN's
 *      reviewed_by or bdm_id (fallback), acknowledged_at = GRN's approved_at
 *      or created_at.
 *   4. Back-link GRN: set `undertaking_id` on the GRN.
 *   5. Log audit entry per created row.
 *
 * Idempotent: running twice finds no GRNs without undertaking_id on the
 * second pass. Does NOT touch InventoryLedger — that was written by the
 * original GRN approval.
 *
 * Usage:
 *   node backend/erp/scripts/backfillGrnUndertakings.js --dry-run
 *   node backend/erp/scripts/backfillGrnUndertakings.js            (apply)
 *   node backend/erp/scripts/backfillGrnUndertakings.js --entity=<id>  (scope)
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
const mongoose = require('mongoose');

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has('--dry-run');
const entityArg = [...args].find(a => a.startsWith('--entity='));
const ENTITY_ID = entityArg ? entityArg.split('=')[1] : null;

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error('[backfill] MONGO_URI missing from env');
    process.exit(1);
  }
  await mongoose.connect(uri);
  console.log(`[backfill] connected (dryRun=${DRY_RUN}${ENTITY_ID ? `, entity=${ENTITY_ID}` : ''})`);

  const GrnEntry = require('../models/GrnEntry');
  const Undertaking = require('../models/Undertaking');
  const ErpAuditLog = require('../models/ErpAuditLog');

  const filter = {
    status: 'APPROVED',
    deletion_event_id: { $exists: false },
    undertaking_id: { $exists: false },
  };
  if (ENTITY_ID) filter.entity_id = new mongoose.Types.ObjectId(ENTITY_ID);

  const grns = await GrnEntry.find(filter).lean();
  console.log(`[backfill] found ${grns.length} approved GRN(s) needing Undertaking backfill`);

  let created = 0;
  let skipped = 0;

  for (const grn of grns) {
    // Safety — if any Undertaking already points here, skip. Covers
    // partial-run recovery where undertaking_id failed to persist.
    const existing = await Undertaking.findOne({
      linked_grn_id: grn._id,
      deletion_event_id: { $exists: false }
    }).lean();
    if (existing) {
      skipped++;
      continue;
    }

    const lineItems = (grn.line_items || []).map(li => ({
      product_id: li.product_id,
      item_key: li.item_key,
      po_line_index: li.po_line_index,
      expected_qty: li.qty || 0,
      received_qty: li.qty || 0,
      batch_lot_no: li.batch_lot_no || '',
      expiry_date: li.expiry_date || null,
      purchase_uom: li.purchase_uom,
      selling_uom: li.selling_uom,
      conversion_factor: li.conversion_factor || 1,
      qty_selling_units: (li.qty || 0) * (li.conversion_factor || 1),
      scan_confirmed: false,
      variance_flag: null,
    }));

    const docPayload = {
      entity_id: grn.entity_id,
      bdm_id: grn.bdm_id,
      warehouse_id: grn.warehouse_id,
      linked_grn_id: grn._id,
      receipt_date: grn.grn_date || grn.created_at,
      line_items: lineItems,
      notes: 'Historical backfill — no scan confirmation available (created by backfillGrnUndertakings.js).',
      status: 'ACKNOWLEDGED',
      acknowledged_by: grn.reviewed_by || grn.bdm_id,
      acknowledged_at: grn.approved_at || grn.reviewed_at || grn.created_at,
      event_id: grn.event_id || undefined,
      created_by: grn.bdm_id,
      created_at: grn.created_at || new Date(),
    };

    if (DRY_RUN) {
      console.log(`[backfill] would create Undertaking for GRN ${grn._id} (${grn.po_number || '—'}, ${lineItems.length} lines)`);
      created++;
      continue;
    }

    try {
      const ut = await Undertaking.create(docPayload);
      await GrnEntry.updateOne({ _id: grn._id }, { $set: { undertaking_id: ut._id } });
      await ErpAuditLog.logChange({
        entity_id: grn.entity_id,
        bdm_id: grn.bdm_id,
        log_type: 'BACKFILL',
        target_ref: ut._id.toString(),
        target_model: 'Undertaking',
        field_changed: 'status',
        new_value: 'ACKNOWLEDGED',
        changed_by: grn.reviewed_by || grn.bdm_id,
        note: `Historical Undertaking backfilled for GRN ${grn._id} (${grn.po_number || 'standalone'}) — no scan confirmation.`
      }).catch(() => {});
      created++;
      if (created % 20 === 0) console.log(`[backfill] created ${created} so far…`);
    } catch (err) {
      skipped++;
      console.warn(`[backfill] FAILED GRN ${grn._id}: ${err.message}`);
    }
  }

  console.log(`[backfill] done — created: ${created}, skipped: ${skipped}${DRY_RUN ? ' (dry-run)' : ''}`);
  await mongoose.disconnect();
}

main().catch(err => {
  console.error('[backfill] fatal:', err);
  process.exit(1);
});
