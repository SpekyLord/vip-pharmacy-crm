/**
 * Deduction Schedule Service — CRUD + business logic for recurring/non-recurring deductions
 *
 * Contractors create schedules (PENDING_APPROVAL). Finance approves → ACTIVE.
 * Active schedule installments auto-inject into payslips via incomeCalc.js
 * (BDM owner) or payslipCalc.js (employee owner, Phase G1.4).
 *
 * Owner is XOR: createSchedule takes either `bdm_id` (contractor) or `person_id`
 * (employee). Validator in DeductionSchedule pre-save enforces the invariant.
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
    // eslint-disable-next-line vip-tenant/require-entity-filter -- doc_id is the schedule's _id (entity-unique); ApprovalRequest's entity_id matches the schedule's by Phase G4.2 invariant
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
 *
 * Owner is XOR: pass `{ bdm_id }` for contractors (schedule installments feed
 * IncomeReport.deduction_lines) or `{ person_id }` for employees (feed
 * Payslip.deduction_lines). Legacy callers that pass a plain `bdmId` string
 * as the second argument continue to work (back-compat for the BDM path).
 *
 * @param {String} entityId
 * @param {String|Object} ownerOrBdmId — legacy BDM id string, or
 *   `{ bdm_id }` / `{ person_id }` for explicit owner selection.
 * @param {Object} data — deduction fields
 * @param {String} userId — acting user
 * @param {Boolean} isFinance — when true, schedule activates immediately (bypasses the gate)
 */
async function createSchedule(entityId, ownerOrBdmId, data, userId, isFinance = false) {
  const { deduction_type, deduction_label, description, total_amount, term_months, start_period, target_cycle } = data;

  if (!deduction_type || !deduction_label || !total_amount || !term_months || !start_period) {
    throw new Error('deduction_type, deduction_label, total_amount, term_months, and start_period are required');
  }
  if (total_amount <= 0) throw new Error('total_amount must be positive');
  if (term_months < 1) throw new Error('term_months must be at least 1');

  // Resolve owner — string is legacy BDM id, object selects explicitly.
  let bdmId = null;
  let personId = null;
  if (ownerOrBdmId && typeof ownerOrBdmId === 'object') {
    bdmId = ownerOrBdmId.bdm_id || null;
    personId = ownerOrBdmId.person_id || null;
  } else {
    bdmId = ownerOrBdmId || null;
  }
  if (!!bdmId === !!personId) {
    throw new Error('createSchedule requires exactly one owner: bdm_id (contractor) OR person_id (employee)');
  }

  // Doc numbering: BDM schedules use territory code (existing behaviour).
  // Employee schedules have no BDM/territory, so fall back to entity short_name
  // (Rule #19 — subscription-ready, no territory required).
  const schedule_code = await generateDocNumber({
    prefix: 'DS',
    bdmId: bdmId || undefined,
    entityId: bdmId ? undefined : entityId,
    date: new Date()
  });

  const schedule = await DeductionSchedule.create({
    entity_id: entityId,
    bdm_id: bdmId || undefined,
    person_id: personId || undefined,
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
  // eslint-disable-next-line vip-tenant/require-entity-filter -- scheduleId from controller (req.params.id); entityId not threaded to this service signature, deferred to controller-side gate
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
  // eslint-disable-next-line vip-tenant/require-entity-filter -- scheduleId from controller (req.params.id); entityId not threaded to this service signature, deferred to controller-side gate
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
  // eslint-disable-next-line vip-tenant/require-entity-filter -- scheduleId from controller (req.params.id); entityId not threaded to this service signature, deferred to controller-side gate
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
  // eslint-disable-next-line vip-tenant/require-entity-filter -- scheduleId from controller (req.params.id); entityId not threaded to this service signature, deferred to controller-side gate
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
  // eslint-disable-next-line vip-tenant/require-entity-filter -- scheduleId from controller (req.params.id); entityId not threaded to this service signature, deferred to controller-side gate
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
 *
 * Contractor path — updates `income_report_id` on the installment.
 */
async function syncInstallmentStatus(scheduleId, installmentId, newStatus, incomeReportId, deductionLineId) {
  // eslint-disable-next-line vip-tenant/require-entity-filter -- scheduleId is the IncomeReport's deduction_line.schedule_id (from same-entity-scoped income report); internal sync from incomeController
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
 * Phase G1.4 — employee counterpart of syncInstallmentStatus. Called by
 * payrollController (Finance verify/reject of a SCHEDULE line on a Payslip)
 * and by payslipCalc (post-save to mark freshly injected installments as
 * INJECTED). Updates `payslip_id` on the installment instead of
 * `income_report_id` so the schedule carries a clean audit trail of which
 * payslip each installment landed in.
 */
async function syncInstallmentStatusForPayslip(scheduleId, installmentId, newStatus, payslipId, deductionLineId) {
  // eslint-disable-next-line vip-tenant/require-entity-filter -- scheduleId is the Payslip's deduction_line.schedule_id (from same-entity-scoped payslip); internal sync from payrollController / payslipCalc
  const schedule = await DeductionSchedule.findById(scheduleId);
  if (!schedule) return;

  const inst = schedule.installments.id(installmentId);
  if (!inst) return;

  inst.status = newStatus;
  if (payslipId) inst.payslip_id = payslipId;
  if (deductionLineId) inst.deduction_line_id = deductionLineId;

  await schedule.save();
}

/**
 * BDM withdraws a PENDING_APPROVAL schedule (self-service cancel before Finance acts)
 */
async function withdrawSchedule(scheduleId, bdmId, entityId) {
  const schedule = await DeductionSchedule.findOne({ _id: scheduleId, entity_id: entityId });
  if (!schedule) throw new Error('Schedule not found');
  // Phase G1.4 — route is contractor-only, so an employee-owner schedule (no
  // bdm_id) should never match. Guard defensively in case the route gate is
  // ever loosened: ownership check becomes "no bdm_id or wrong bdm_id → reject".
  if (!schedule.bdm_id || schedule.bdm_id.toString() !== bdmId.toString()) {
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
  // Phase G1.4 — same defensive null-check as withdrawSchedule. Employee
  // schedules (no bdm_id) cannot reach this path via the current contractor-
  // gated route, but the guard makes the service layer safe if the gate is
  // ever opened (e.g. for an employee self-service edit future story).
  if (!schedule.bdm_id || schedule.bdm_id.toString() !== bdmId.toString()) {
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
      { entity_id: entityId, doc_id: schedule._id, module: 'DEDUCTION_SCHEDULE', status: 'PENDING' },
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
  // Phase G1.4 — employee-owner counterpart (Payslip-linked installments)
  syncInstallmentStatusForPayslip,
  withdrawSchedule,
  editPendingSchedule
};
