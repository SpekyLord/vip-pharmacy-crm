/**
 * Deduction Schedule Service — CRUD + business logic for recurring/non-recurring deductions
 *
 * Contractors create schedules (PENDING_APPROVAL). Finance approves → ACTIVE.
 * Active schedule installments auto-inject into payslips via incomeCalc.js.
 */
const mongoose = require('mongoose');
const DeductionSchedule = require('../models/DeductionSchedule');
const ApprovalRequest = require('../models/ApprovalRequest');
const { generateDocNumber } = require('./docNumbering');

// Phase G4.2 — close any open PENDING ApprovalRequest for a schedule when the
// decision is reached via the direct route (POST /:id/approve|reject|withdraw).
// The Approval Hub path closes the request in universalApprovalController via
// the catch-all at lines 705-734; keeping the close logic here too means both
// paths behave identically so `Approval History` never diverges from the
// `DeductionSchedule` source of truth.
//
// Idempotent: $set only fires when status is still PENDING, so a second call
// (e.g. Hub approve → catch-all → direct route) is a no-op.
async function closeApprovalRequest(docId, decisionStatus, userId, reason) {
  if (!docId) return;
  try {
    await ApprovalRequest.updateMany(
      { doc_id: docId, module: 'DEDUCTION_SCHEDULE', status: 'PENDING' },
      {
        $set: {
          status: decisionStatus,
          decided_by: userId,
          decided_at: new Date(),
          decision_reason: reason || `${decisionStatus.toLowerCase()} via deduction schedule route`,
        },
        $push: {
          history: {
            status: decisionStatus,
            by: userId,
            reason: reason || `${decisionStatus.toLowerCase()} via deduction schedule route`,
          },
        },
      }
    );
  } catch (err) {
    // Non-fatal: schedule state is already persisted. Log and continue — a stuck
    // ApprovalRequest can be repaired with the migration script below.
    console.error(`DeductionSchedule closeApprovalRequest failed (doc_id=${docId}):`, err.message);
  }
}

/**
 * Create a new deduction schedule with pre-generated installments.
 */
async function createSchedule(entityId, bdmId, data, userId, isFinance = false) {
  const { deduction_type, deduction_label, description, total_amount, term_months, start_period, target_cycle } = data;

  if (!deduction_type || !deduction_label || !total_amount || !term_months || !start_period) {
    throw new Error('deduction_type, deduction_label, total_amount, term_months, and start_period are required');
  }
  if (total_amount <= 0) throw new Error('total_amount must be positive');
  if (term_months < 1) throw new Error('term_months must be at least 1');

  const schedule_code = await generateDocNumber({
    prefix: 'DS',
    bdmId,
    date: new Date()
  });

  const schedule = await DeductionSchedule.create({
    entity_id: entityId,
    bdm_id: bdmId,
    schedule_code,
    deduction_type,
    deduction_label,
    description: description || '',
    total_amount,
    term_months,
    start_period,
    target_cycle: target_cycle || 'C2',
    status: isFinance ? 'ACTIVE' : 'PENDING_APPROVAL',
    approved_by: isFinance ? userId : undefined,
    approved_at: isFinance ? new Date() : undefined,
    created_by: userId
  });

  return schedule;
}

/**
 * Approve a PENDING_APPROVAL schedule → ACTIVE
 */
async function approveSchedule(scheduleId, userId) {
  const schedule = await DeductionSchedule.findById(scheduleId);
  if (!schedule) throw new Error('Schedule not found');
  if (schedule.status !== 'PENDING_APPROVAL') {
    throw new Error(`Cannot approve schedule in ${schedule.status} status`);
  }

  schedule.status = 'ACTIVE';
  schedule.approved_by = userId;
  schedule.approved_at = new Date();
  await schedule.save();

  // Phase G4.2 — close the audit loop so Approval History mirrors the decision.
  await closeApprovalRequest(schedule._id, 'APPROVED', userId);

  return schedule;
}

/**
 * Reject a PENDING_APPROVAL schedule
 */
async function rejectSchedule(scheduleId, userId, reason) {
  const schedule = await DeductionSchedule.findById(scheduleId);
  if (!schedule) throw new Error('Schedule not found');
  if (schedule.status !== 'PENDING_APPROVAL') {
    throw new Error(`Cannot reject schedule in ${schedule.status} status`);
  }

  schedule.status = 'REJECTED';
  schedule.reject_reason = reason || '';
  await schedule.save();

  // Phase G4.2 — close the audit loop with the provided rejection reason so the
  // Approval History row carries the same `decision_reason` surfaced on the schedule.
  await closeApprovalRequest(schedule._id, 'REJECTED', userId, reason);

  return schedule;
}

/**
 * Cancel an ACTIVE schedule — marks all PENDING installments as CANCELLED
 */
async function cancelSchedule(scheduleId, userId, reason) {
  const schedule = await DeductionSchedule.findById(scheduleId);
  if (!schedule) throw new Error('Schedule not found');
  if (schedule.status !== 'ACTIVE') {
    throw new Error(`Cannot cancel schedule in ${schedule.status} status`);
  }

  for (const inst of schedule.installments) {
    if (inst.status === 'PENDING') {
      inst.status = 'CANCELLED';
      inst.note = reason || 'Schedule cancelled';
    }
  }

  schedule.status = 'CANCELLED';
  await schedule.save();
  return schedule;
}

/**
 * Early payoff — cancel remaining PENDING installments, create lump-sum for remaining balance
 */
async function earlyPayoff(scheduleId, payoffPeriod, userId) {
  const schedule = await DeductionSchedule.findById(scheduleId);
  if (!schedule) throw new Error('Schedule not found');
  if (schedule.status !== 'ACTIVE') {
    throw new Error(`Cannot early payoff schedule in ${schedule.status} status`);
  }

  const pendingInstallments = schedule.installments.filter(i => i.status === 'PENDING');
  if (pendingInstallments.length === 0) {
    throw new Error('No pending installments to pay off');
  }

  // Cancel all remaining PENDING installments
  const lumpSum = pendingInstallments.reduce((sum, i) => sum + i.amount, 0);
  for (const inst of pendingInstallments) {
    inst.status = 'CANCELLED';
    inst.note = `Replaced by early payoff in ${payoffPeriod}`;
  }

  // Add lump-sum installment
  const maxNo = Math.max(...schedule.installments.map(i => i.installment_no));
  schedule.installments.push({
    period: payoffPeriod,
    installment_no: maxNo + 1,
    amount: Math.round(lumpSum * 100) / 100,
    status: 'PENDING',
    note: `Early payoff (${pendingInstallments.length} installments consolidated)`
  });

  await schedule.save();
  return schedule;
}

/**
 * Finance adjusts a single installment amount
 */
async function adjustInstallment(scheduleId, installmentId, newAmount, userId, note) {
  const schedule = await DeductionSchedule.findById(scheduleId);
  if (!schedule) throw new Error('Schedule not found');

  const inst = schedule.installments.id(installmentId);
  if (!inst) throw new Error('Installment not found');
  if (!['PENDING', 'INJECTED'].includes(inst.status)) {
    throw new Error(`Cannot adjust installment in ${inst.status} status`);
  }

  inst.amount = Math.round(newAmount * 100) / 100;
  inst.note = note || `Adjusted by Finance to ₱${inst.amount}`;
  inst.verified_by = userId;
  inst.verified_at = new Date();

  await schedule.save();
  return schedule;
}

/**
 * Sync installment status from payslip verification back to schedule.
 * Called by incomeController when Finance verifies/rejects a SCHEDULE deduction line.
 */
async function syncInstallmentStatus(scheduleId, installmentId, newStatus, incomeReportId, deductionLineId) {
  const schedule = await DeductionSchedule.findById(scheduleId);
  if (!schedule) return;

  const inst = schedule.installments.id(installmentId);
  if (!inst) return;

  inst.status = newStatus;
  if (incomeReportId) inst.income_report_id = incomeReportId;
  if (deductionLineId) inst.deduction_line_id = deductionLineId;

  await schedule.save();
}

/**
 * BDM withdraws a PENDING_APPROVAL schedule (self-service cancel before Finance acts)
 */
async function withdrawSchedule(scheduleId, bdmId, entityId) {
  const schedule = await DeductionSchedule.findOne({ _id: scheduleId, entity_id: entityId });
  if (!schedule) throw new Error('Schedule not found');
  if (schedule.bdm_id.toString() !== bdmId.toString()) {
    throw new Error('You can only withdraw your own schedules');
  }
  if (schedule.status !== 'PENDING_APPROVAL') {
    throw new Error(`Cannot withdraw schedule in ${schedule.status} status`);
  }

  for (const inst of schedule.installments) {
    if (inst.status === 'PENDING') {
      inst.status = 'CANCELLED';
      inst.note = 'Withdrawn by BDM';
    }
  }

  schedule.status = 'CANCELLED';
  schedule.edit_history.push({
    action: 'WITHDRAWN',
    by: bdmId,
    at: new Date()
  });
  await schedule.save();

  // Phase G4.2 — BDM voluntarily pulled the request; close the ApprovalRequest as
  // CANCELLED so approvers no longer see it and the history row reflects the BDM's
  // action rather than an approver decision.
  await closeApprovalRequest(schedule._id, 'CANCELLED', bdmId, 'Withdrawn by BDM');

  return schedule;
}

/**
 * BDM edits a PENDING_APPROVAL schedule (modify before Finance reviews)
 */
async function editPendingSchedule(scheduleId, bdmId, entityId, updates) {
  const schedule = await DeductionSchedule.findOne({ _id: scheduleId, entity_id: entityId });
  if (!schedule) throw new Error('Schedule not found');
  if (schedule.bdm_id.toString() !== bdmId.toString()) {
    throw new Error('You can only edit your own schedules');
  }
  if (schedule.status !== 'PENDING_APPROVAL') {
    throw new Error(`Cannot edit schedule in ${schedule.status} status`);
  }

  const { deduction_type, deduction_label, description, total_amount, term_months, start_period, target_cycle } = updates;

  // Snapshot old values for audit trail
  schedule.edit_history.push({
    action: 'EDITED',
    by: bdmId,
    at: new Date(),
    previous: {
      deduction_type: schedule.deduction_type,
      deduction_label: schedule.deduction_label,
      description: schedule.description,
      total_amount: schedule.total_amount,
      term_months: schedule.term_months,
      start_period: schedule.start_period,
      target_cycle: schedule.target_cycle
    }
  });

  // Apply updates
  if (deduction_type) schedule.deduction_type = deduction_type;
  if (deduction_label) schedule.deduction_label = deduction_label;
  if (description !== undefined) schedule.description = description;
  if (total_amount && total_amount > 0) schedule.total_amount = total_amount;
  if (term_months && term_months >= 1) schedule.term_months = term_months;
  if (start_period) schedule.start_period = start_period;
  if (target_cycle) schedule.target_cycle = target_cycle;

  // Regenerate installments (pre-save hook only runs on isNew)
  const { incrementPeriod } = require('../models/DeductionSchedule');
  const baseAmount = Math.floor(schedule.total_amount / schedule.term_months * 100) / 100;
  const lastAmount = Math.round((schedule.total_amount - baseAmount * (schedule.term_months - 1)) * 100) / 100;

  schedule.installment_amount = baseAmount;
  schedule.installments = [];
  for (let i = 0; i < schedule.term_months; i++) {
    schedule.installments.push({
      period: incrementPeriod(schedule.start_period, i),
      installment_no: i + 1,
      amount: i === schedule.term_months - 1 ? lastAmount : baseAmount,
      status: 'PENDING'
    });
  }
  schedule.remaining_balance = schedule.total_amount;

  await schedule.save();

  // Phase G4.2 — BDM edited total_amount / label / term, so the PENDING
  // ApprovalRequest's `amount` and `description` must be refreshed. Otherwise
  // the Approval Hub and the eventual Approval History row show stale values.
  try {
    await ApprovalRequest.updateMany(
      { doc_id: schedule._id, module: 'DEDUCTION_SCHEDULE', status: 'PENDING' },
      {
        $set: {
          amount: schedule.total_amount,
          doc_type: schedule.term_months === 1 ? 'ONE_TIME' : 'INSTALLMENT',
          description: `${schedule.deduction_label}${schedule.term_months > 1 ? ` · ₱${schedule.installment_amount}/mo × ${schedule.term_months}` : ''} · ${schedule.target_cycle}`,
        },
      }
    );
  } catch (err) {
    console.error(`DeductionSchedule editPending approvalRequest sync failed (doc_id=${schedule._id}):`, err.message);
  }

  return schedule;
}

module.exports = {
  createSchedule,
  approveSchedule,
  rejectSchedule,
  cancelSchedule,
  earlyPayoff,
  adjustInstallment,
  syncInstallmentStatus,
  withdrawSchedule,
  editPendingSchedule
};
