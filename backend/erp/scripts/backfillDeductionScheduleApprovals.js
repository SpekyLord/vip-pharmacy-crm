/* eslint-disable vip-tenant/require-entity-filter -- standalone admin/migration/diagnostic script: no req context; intentional cross-entity reads/writes for ops work */
/**
 * Backfill Deduction Schedule ApprovalRequests — Phase G4.2
 *
 * Context (2026-04-21): before Phase G4.2, `deductionScheduleService.approveSchedule`
 * flipped `DeductionSchedule.status` → ACTIVE but never wrote an ApprovalRequest.
 * Result: the Approval Hub's History tab showed PERDIEM_OVERRIDE / SALES / EXPENSES
 * but no DEDUCTION_SCHEDULE rows, even though deductions WERE being approved.
 *
 * Phase G4.2 wires gateApproval into createSchedule (PENDING row on submit) and
 * closeApprovalRequest into approve/reject/withdraw (decision mirrored on the row).
 * This script backfills ApprovalRequest rows for schedules that decided BEFORE
 * the wiring landed, so Approval History is complete retroactively.
 *
 * Rules (idempotent — skip if an ApprovalRequest for the schedule already exists):
 *   status PENDING_APPROVAL  → ApprovalRequest status PENDING  (appears in All Pending)
 *   status ACTIVE            → ApprovalRequest status APPROVED (appears in History)
 *   status COMPLETED         → ApprovalRequest status APPROVED (was ACTIVE, auto-completed)
 *   status REJECTED          → ApprovalRequest status REJECTED
 *   status CANCELLED
 *     - approved_by set      → ApprovalRequest status APPROVED (ACTIVE then cancelled; approval did happen)
 *     - approved_by not set  → ApprovalRequest status CANCELLED (withdrawn from PENDING)
 *
 * Usage (from backend/):
 *   node erp/scripts/backfillDeductionScheduleApprovals.js           # dry-run
 *   node erp/scripts/backfillDeductionScheduleApprovals.js --apply   # writes
 */
require('dotenv').config();
const mongoose = require('mongoose');

const APPLY = process.argv.includes('--apply');

function buildDescription(schedule) {
  const parts = [schedule.deduction_label];
  if (schedule.term_months > 1) {
    parts.push(`₱${schedule.installment_amount}/mo × ${schedule.term_months}`);
  }
  parts.push(schedule.target_cycle || 'C2');
  return parts.join(' · ');
}

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log(`Connected. Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}`);

  const DeductionSchedule = require('../models/DeductionSchedule');
  const ApprovalRequest = require('../models/ApprovalRequest');

  const schedules = await DeductionSchedule.find({}).lean();
  console.log(`Scanning ${schedules.length} deduction schedules…`);

  const counts = { pending: 0, approved: 0, rejected: 0, cancelled: 0, skipped_existing: 0, skipped_other: 0 };

  for (const schedule of schedules) {
    // Skip if any ApprovalRequest exists for this doc (idempotent)
    const existing = await ApprovalRequest.findOne({
      doc_id: schedule._id,
      module: 'DEDUCTION_SCHEDULE',
    }).lean();
    if (existing) { counts.skipped_existing++; continue; }

    let decisionStatus, decidedBy, decidedAt, decisionReason;
    switch (schedule.status) {
      case 'PENDING_APPROVAL':
        decisionStatus = 'PENDING';
        break;
      case 'ACTIVE':
      case 'COMPLETED':
        decisionStatus = 'APPROVED';
        decidedBy = schedule.approved_by;
        decidedAt = schedule.approved_at;
        break;
      case 'REJECTED':
        decisionStatus = 'REJECTED';
        decidedBy = schedule.approved_by || schedule.created_by;
        decidedAt = schedule.approved_at || schedule.updated_at || schedule.createdAt;
        decisionReason = schedule.reject_reason || 'Rejected (pre-Phase G4.2, reason unrecorded)';
        break;
      case 'CANCELLED':
        if (schedule.approved_by) {
          // Was ACTIVE first → approval did happen. Reflect that in History.
          decisionStatus = 'APPROVED';
          decidedBy = schedule.approved_by;
          decidedAt = schedule.approved_at;
        } else {
          decisionStatus = 'CANCELLED';
          decidedBy = schedule.created_by;
          decidedAt = schedule.updated_at || schedule.createdAt;
          decisionReason = 'Withdrawn (pre-Phase G4.2)';
        }
        break;
      default:
        counts.skipped_other++;
        continue;
    }

    const description = buildDescription(schedule);
    const docType = schedule.term_months === 1 ? 'ONE_TIME' : 'INSTALLMENT';

    const payload = {
      entity_id: schedule.entity_id,
      rule_id: null,
      module: 'DEDUCTION_SCHEDULE',
      doc_type: docType,
      doc_id: schedule._id,
      doc_ref: schedule.schedule_code,
      amount: schedule.total_amount,
      description,
      metadata: { gate: 'DEFAULT_ROLES', backfilled: true },
      level: 0,
      requested_by: schedule.created_by || schedule.bdm_id,
      status: decisionStatus,
      history: [{
        status: 'PENDING',
        by: schedule.created_by || schedule.bdm_id,
        reason: 'Backfilled from DeductionSchedule (pre-Phase G4.2)',
        at: schedule.createdAt || schedule.created_at,
      }],
    };

    if (decisionStatus !== 'PENDING') {
      payload.decided_by = decidedBy;
      payload.decided_at = decidedAt;
      payload.decision_reason = decisionReason || `${decisionStatus.toLowerCase()} (backfill)`;
      payload.history.push({
        status: decisionStatus,
        by: decidedBy,
        reason: payload.decision_reason,
        at: decidedAt,
      });
    }

    console.log(`  [${decisionStatus}] ${schedule.schedule_code} (${schedule.status}) — ${description}`);
    if (APPLY) await ApprovalRequest.create(payload);

    if (decisionStatus === 'PENDING') counts.pending++;
    else if (decisionStatus === 'APPROVED') counts.approved++;
    else if (decisionStatus === 'REJECTED') counts.rejected++;
    else if (decisionStatus === 'CANCELLED') counts.cancelled++;
  }

  console.log('');
  console.log('Summary:');
  console.log(`  pending created:   ${counts.pending}`);
  console.log(`  approved created:  ${counts.approved}`);
  console.log(`  rejected created:  ${counts.rejected}`);
  console.log(`  cancelled created: ${counts.cancelled}`);
  console.log(`  skipped (had AR):  ${counts.skipped_existing}`);
  console.log(`  skipped (other):   ${counts.skipped_other}`);
  if (!APPLY) console.log('\nDRY-RUN — rerun with --apply to persist.');

  await mongoose.disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
