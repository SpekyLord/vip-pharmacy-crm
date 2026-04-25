#!/usr/bin/env node
/* eslint-disable vip-tenant/require-entity-filter -- standalone admin/migration/diagnostic script: no req context; intentional cross-entity reads/writes for ops work */
/**
 * migrateCalfOneAckFlow.js — Phase G4.5h (Apr 2026)
 *
 * One-time transition script for the CALF↔Expense one-acknowledge cascade.
 * Before G4.5h, an ACCESS-bearing Expense was submitted separately from its
 * CALF; both had their own ApprovalRequest row and the Expense was held in
 * SUBMITTED until CALF was approved. After G4.5h, the Expense posts purely
 * via the CALF cascade — a standalone EXPENSE_ENTRY ApprovalRequest is no
 * longer valid and the SUBMITTED limbo state is a leftover to be cleared.
 *
 * Strategy (per stuck Expense):
 *   - Find Expense docs in SUBMITTED that have any line with calf_required
 *     and calf_id set.
 *   - Group by CALF status:
 *       * CALF is POSTED → cascade should already have fired. Log for manual
 *         review (post the Expense via postSinglePrfCalf re-run, or hand-post).
 *         Do NOT auto-cascade here — the CALF event is in the past and the
 *         JE would be backdated; defer to an operator.
 *       * CALF is anything else (DRAFT / VALID / ERROR) → revert Expense to
 *         DRAFT and delete its EXPENSE_ENTRY ApprovalRequest row. The CALF
 *         submit (upcoming) will drive approval from then on.
 *   - Idempotent. Dry-run is the default.
 *
 * Usage:
 *   node backend/erp/scripts/migrateCalfOneAckFlow.js                  (dry-run)
 *   node backend/erp/scripts/migrateCalfOneAckFlow.js --apply          (execute)
 *   node backend/erp/scripts/migrateCalfOneAckFlow.js --entity=<id>    (scope)
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const mongoose = require('mongoose');

const args = new Set(process.argv.slice(2));
const APPLY = args.has('--apply');
const entityArg = [...args].find(a => a.startsWith('--entity='));
const ENTITY_ID = entityArg ? entityArg.split('=')[1] : null;

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error('[migrate] MONGO_URI missing from env');
    process.exit(1);
  }
  await mongoose.connect(uri);
  console.log(`[migrate] connected (apply=${APPLY}${ENTITY_ID ? `, entity=${ENTITY_ID}` : ''})`);

  const ExpenseEntry = require('../models/ExpenseEntry');
  const PrfCalf = require('../models/PrfCalf');
  const ApprovalRequest = require('../models/ApprovalRequest');
  const ErpAuditLog = require('../models/ErpAuditLog');

  const filter = { status: 'SUBMITTED' };
  if (ENTITY_ID) filter.entity_id = new mongoose.Types.ObjectId(ENTITY_ID);

  const expenses = await ExpenseEntry.find(filter).lean();
  console.log(`[migrate] found ${expenses.length} SUBMITTED expense(s) in scope`);

  const stuck = [];
  for (const e of expenses) {
    const calfLine = (e.lines || []).find(l => l.calf_required && l.calf_id);
    if (!calfLine) continue;
    const calf = await PrfCalf.findById(calfLine.calf_id).select('status calf_number').lean();
    stuck.push({ expense: e, calf, calfLine });
  }
  console.log(`[migrate] ${stuck.length} of these are stuck by an unposted (or posted-but-orphaned) CALF`);

  const posted = stuck.filter(s => s.calf?.status === 'POSTED');
  const unposted = stuck.filter(s => !s.calf || s.calf.status !== 'POSTED');

  console.log(`  - CALF already POSTED (manual review): ${posted.length}`);
  console.log(`  - CALF not POSTED (revert to DRAFT):    ${unposted.length}`);

  // List what we'd do
  for (const row of posted) {
    console.log(`  [POSTED-CALF] expense ${row.expense._id} (EXP-${row.expense.period}-${row.expense.cycle}) — CALF ${row.calf.calf_number || row.calf._id} POSTED. Hand-post the expense or re-run postSinglePrfCalf.`);
  }
  for (const row of unposted) {
    console.log(`  [REVERT]      expense ${row.expense._id} (EXP-${row.expense.period}-${row.expense.cycle}) — CALF ${row.calf?._id || 'MISSING'} status=${row.calf?.status || 'NOT_FOUND'} → revert Expense to DRAFT, drop EXPENSE_ENTRY ApprovalRequest.`);
  }

  if (!APPLY) {
    console.log('\n[migrate] dry-run — re-run with --apply to commit.');
    await mongoose.disconnect();
    return;
  }

  // Apply: only the "CALF not POSTED" branch — the posted-CALF branch is
  // manual-review because blindly back-posting stale docs would backdate JEs.
  let reverted = 0;
  let requestsDeleted = 0;
  for (const row of unposted) {
    const exp = await ExpenseEntry.findById(row.expense._id);
    if (!exp || exp.status !== 'SUBMITTED') continue;
    exp.status = 'DRAFT';
    exp.validation_errors = [];
    await exp.save();
    reverted++;

    const del = await ApprovalRequest.deleteMany({
      module: 'EXPENSES',
      doc_type: 'EXPENSE_ENTRY',
      doc_id: exp._id,
      status: { $in: ['PENDING', 'IN_REVIEW'] },
    });
    requestsDeleted += del.deletedCount || 0;

    await ErpAuditLog.logChange({
      entity_id: exp.entity_id,
      bdm_id: exp.bdm_id,
      log_type: 'MIGRATE',
      target_ref: exp._id.toString(),
      target_model: 'ExpenseEntry',
      changed_by: null,
      note: 'Phase G4.5h migration: reverted SUBMITTED→DRAFT (CALF now owns approval).'
    }).catch(err => console.error('[migrate] audit write failed (non-critical):', err.message));
  }

  console.log(`\n[migrate] reverted ${reverted} expense(s) to DRAFT; deleted ${requestsDeleted} stale EXPENSE_ENTRY ApprovalRequest row(s).`);
  console.log(`[migrate] ${posted.length} POSTED-CALF expense(s) still need manual review.`);
  await mongoose.disconnect();
}

main().catch(err => {
  console.error('[migrate] FATAL', err);
  process.exit(1);
});
