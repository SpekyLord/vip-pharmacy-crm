/**
 * Deduction Schedule Service — CRUD + business logic for recurring/non-recurring deductions
 *
 * Contractors create schedules (PENDING_APPROVAL). Finance approves → ACTIVE.
 * Active schedule installments auto-inject into payslips via incomeCalc.js.
 */
const mongoose = require('mongoose');
const DeductionSchedule = require('../models/DeductionSchedule');
const { generateDocNumber } = require('./docNumbering');

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

module.exports = {
  createSchedule,
  approveSchedule,
  rejectSchedule,
  cancelSchedule,
  earlyPayoff,
  adjustInstallment,
  syncInstallmentStatus
};
