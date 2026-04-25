/* eslint-disable vip-tenant/require-entity-filter -- standalone admin/migration/diagnostic script: no req context; intentional cross-entity reads/writes for ops work */
/**
 * Trace where a GRN's stock actually landed.
 *
 * Usage:
 *   node backend/erp/scripts/traceGrnStock.js GRN-ACC042326-002
 *
 * Prints:
 *   - The GRN doc (status, reviewed_by, bdm_id, event_id, line_items)
 *   - The linked UT (status, acknowledged_by)
 *   - The TransactionEvent this GRN emitted
 *   - Every InventoryLedger row tied to that event (who owns them NOW)
 *   - The named user of each bdm_id so you can see who got the stock
 */
require('dotenv').config();
const mongoose = require('mongoose');

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error('Usage: node traceGrnStock.js <GRN-number or GRN _id>');
    process.exit(1);
  }

  const MONGO = process.env.MONGO_URI;
  if (!MONGO) {
    console.error('MONGO_URI not set. Run from project root with .env loaded.');
    process.exit(1);
  }

  await mongoose.connect(MONGO);
  console.log(`\nConnected. Tracing GRN: ${arg}\n${'═'.repeat(70)}`);

  const GrnEntry = require('../models/GrnEntry');
  const Undertaking = require('../models/Undertaking');
  const InventoryLedger = require('../models/InventoryLedger');
  const TransactionEvent = require('../models/TransactionEvent');
  const User = require('../../models/User');

  const byRef = mongoose.Types.ObjectId.isValid(arg)
    ? { _id: new mongoose.Types.ObjectId(arg) }
    : { grn_number: arg };
  const grn = await GrnEntry.findOne(byRef).lean();
  if (!grn) {
    console.error(`GRN not found: ${arg}`);
    process.exit(2);
  }

  const nameOf = async (id) => {
    if (!id) return '(null)';
    const u = await User.findById(id).select('name email role').lean();
    return u ? `${u.name} <${u.email}> [${u.role}]` : `(unknown _id=${id})`;
  };

  console.log('\nGRN DOC');
  console.log('───────');
  console.log(`  _id:             ${grn._id}`);
  console.log(`  grn_number:      ${grn.grn_number}`);
  console.log(`  entity_id:       ${grn.entity_id}`);
  console.log(`  status:          ${grn.status}`);
  console.log(`  bdm_id:          ${grn.bdm_id}  →  ${await nameOf(grn.bdm_id)}`);
  console.log(`  reviewed_by:     ${grn.reviewed_by}  →  ${await nameOf(grn.reviewed_by)}`);
  console.log(`  reviewed_at:     ${grn.reviewed_at}`);
  console.log(`  created_by:      ${grn.created_by}  →  ${await nameOf(grn.created_by)}`);
  console.log(`  event_id:        ${grn.event_id}`);
  console.log(`  waybill:         ${grn.waybill_photo_url ? 'present' : 'MISSING'}`);
  console.log(`  line_items:      ${(grn.line_items || []).length} line(s)`);
  (grn.line_items || []).forEach((li, i) => {
    console.log(`    [${i}] product=${li.product_id} batch=${li.batch_lot_no} qty=${li.qty} qty_selling=${li.qty_selling_units ?? '(unset)'}`);
  });

  console.log('\nLINKED UNDERTAKING');
  console.log('──────────────────');
  const ut = await Undertaking.findOne({ linked_grn_id: grn._id }).lean();
  if (!ut) {
    console.log('  (no UT found)');
  } else {
    console.log(`  _id:             ${ut._id}`);
    console.log(`  undertaking_no:  ${ut.undertaking_number}`);
    console.log(`  status:          ${ut.status}`);
    console.log(`  bdm_id:          ${ut.bdm_id}  →  ${await nameOf(ut.bdm_id)}`);
    console.log(`  acknowledged_by: ${ut.acknowledged_by}  →  ${await nameOf(ut.acknowledged_by)}`);
    console.log(`  acknowledged_at: ${ut.acknowledged_at}`);
    if (grn.bdm_id && ut.bdm_id && String(grn.bdm_id) !== String(ut.bdm_id)) {
      console.log(`  *** MISMATCH: GRN.bdm_id ≠ UT.bdm_id — stock wrote under GRN.bdm_id ***`);
    }
  }

  console.log('\nTRANSACTION EVENT');
  console.log('─────────────────');
  if (!grn.event_id) {
    console.log('  (no event_id on GRN — approveGrnCore likely never ran, even though status may show APPROVED)');
  } else {
    const ev = await TransactionEvent.findById(grn.event_id).lean();
    if (!ev) {
      console.log(`  (event_id=${grn.event_id} not found — broken reference)`);
    } else {
      console.log(`  _id:             ${ev._id}`);
      console.log(`  event_type:      ${ev.event_type}`);
      console.log(`  bdm_id:          ${ev.bdm_id}  →  ${await nameOf(ev.bdm_id)}`);
      console.log(`  created_by:      ${ev.created_by}  →  ${await nameOf(ev.created_by)}`);
    }
  }

  console.log('\nINVENTORY LEDGER ROWS FOR THIS GRN');
  console.log('──────────────────────────────────');
  const rows = grn.event_id
    ? await InventoryLedger.find({ event_id: grn.event_id }).lean()
    : [];
  if (rows.length === 0) {
    console.log('  (no ledger rows found — stock did not post)');
  } else {
    for (const r of rows) {
      console.log(`  product=${r.product_id} batch=${r.batch_lot_no} qty_in=${r.qty_in}`);
      console.log(`    bdm_id=${r.bdm_id}  →  ${await nameOf(r.bdm_id)}`);
      console.log(`    warehouse_id=${r.warehouse_id || '(none)'}`);
    }
  }

  console.log(`\n${'═'.repeat(70)}`);
  console.log('Interpretation');
  console.log('──────────────');
  if (rows.length === 0 && grn.status === 'APPROVED') {
    console.log('  ⚠ GRN shows APPROVED but there are no ledger rows. approveGrnCore never wrote them.');
    console.log('    Most likely: gateApproval routed the approval to the Approval Hub (HTTP 202) and');
    console.log('    the status flip happened via a separate path that skipped the ledger write.');
  } else if (rows.length > 0) {
    const uniqueBdms = [...new Set(rows.map(r => String(r.bdm_id)))];
    if (uniqueBdms.length === 1) {
      console.log(`  Stock landed under bdm_id = ${uniqueBdms[0]}.`);
      console.log('  If that user name above is NOT "Judy Mae Patrocinio", her My Stock will be empty.');
      console.log('  Remedy: reverse this GRN, then re-capture with correct bdm_id.');
    }
  }

  await mongoose.disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(99);
});
