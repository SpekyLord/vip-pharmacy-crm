/**
 * Income Calculation Service — BDM Payslip Generation
 *
 * PRD §10: BDM Income Computation (per cycle)
 * Earnings: SMER + CORE Commission + Bonus + Profit Sharing + Reimbursements
 * Deductions: Lookup-driven deduction_lines[] (BDM enters, Finance verifies)
 * Net Pay = Total Earnings − Total Deductions
 */
const mongoose = require('mongoose');
const IncomeReport = require('../models/IncomeReport');
const PnlReport = require('../models/PnlReport');
const SmerEntry = require('../models/SmerEntry');
const Collection = require('../models/Collection');
const ExpenseEntry = require('../models/ExpenseEntry');
const PrfCalf = require('../models/PrfCalf');
const DeductionSchedule = require('../models/DeductionSchedule');
const { syncInstallmentStatus } = require('./deductionScheduleService');

/**
 * Parse period to start/end dates
 */
function periodToDates(period) {
  const [year, month] = period.split('-').map(Number);
  return {
    start: new Date(year, month - 1, 1),
    end: new Date(year, month, 1)
  };
}

/**
 * Generate income report for a BDM's period + cycle.
 * Auto-computes earnings from source data; preserves manual fields and BDM deduction_lines from existing report.
 *
 * @param {String} entityId
 * @param {String} bdmId
 * @param {String} period - "2026-04"
 * @param {String} cycle - "C1" | "C2" | "MONTHLY"
 * @param {ObjectId} userId - who triggered generation
 * @returns {Object} IncomeReport document
 */
async function generateIncomeReport(entityId, bdmId, period, cycle, userId) {
  const { start, end } = periodToDates(period);
  const filter = {
    entity_id: new mongoose.Types.ObjectId(entityId),
    bdm_id: new mongoose.Types.ObjectId(bdmId)
  };

  // 1. SMER earnings
  const smer = await SmerEntry.findOne({
    ...filter, period, cycle,
    status: { $in: ['POSTED', 'VALID', 'DRAFT'] }
  }).lean();
  const smerAmount = smer?.total_reimbursable || 0;

  // 2. CORE commission from POSTED Collections
  const collAgg = await Collection.aggregate([
    {
      $match: {
        ...filter,
        status: 'POSTED',
        cr_date: { $gte: start, $lt: end }
      }
    },
    {
      $group: {
        _id: null,
        total_commission: { $sum: '$total_commission' }
      }
    }
  ]);
  const coreCommission = collAgg[0]?.total_commission || 0;

  // 3. Profit Sharing from PNL report
  const pnl = await PnlReport.findOne({ ...filter, period }).lean();
  const profitSharing = (pnl?.profit_sharing?.eligible && pnl?.profit_sharing?.bdm_share > 0)
    ? pnl.profit_sharing.bdm_share
    : 0;

  // 4. Cash advance deductions from CALF
  const calfAgg = await PrfCalf.aggregate([
    {
      $match: {
        ...filter,
        doc_type: 'CALF',
        period,
        status: { $in: ['POSTED', 'VALID'] }
      }
    },
    {
      $group: {
        _id: null,
        total_advance: { $sum: '$advance_amount' },
        total_liquidation: { $sum: '$liquidation_amount' }
      }
    }
  ]);
  const calfData = calfAgg[0] || { total_advance: 0, total_liquidation: 0 };
  const cashAdvanceDeduction = Math.max(0, calfData.total_advance - calfData.total_liquidation);

  // 4b. Recurring deduction schedule installments
  const activeSchedules = await DeductionSchedule.find({
    entity_id: new mongoose.Types.ObjectId(entityId),
    bdm_id: new mongoose.Types.ObjectId(bdmId),
    status: 'ACTIVE',
    installments: { $elemMatch: { period, status: 'PENDING' } }
  }).lean();

  const scheduleLines = [];
  for (const sched of activeSchedules) {
    const inst = sched.installments.find(i => i.period === period && i.status === 'PENDING');
    if (inst) {
      scheduleLines.push({
        deduction_type: sched.deduction_type,
        deduction_label: sched.deduction_label,
        amount: inst.amount,
        description: `${sched.description || sched.deduction_label} (${inst.installment_no}/${sched.term_months})`,
        entered_by: userId,
        entered_at: new Date(),
        status: 'PENDING',
        auto_source: 'SCHEDULE',
        schedule_ref: {
          schedule_id: sched._id,
          installment_id: inst._id
        }
      });
    }
  }

  // 5. Source references
  const collectionIds = await Collection.find({
    ...filter, status: 'POSTED',
    cr_date: { $gte: start, $lt: end }
  }).select('_id').lean();

  const expenseIds = await ExpenseEntry.find({
    ...filter, period, cycle
  }).select('_id').lean();

  // Build income data
  const incomeData = {
    entity_id: entityId,
    bdm_id: bdmId,
    period,
    cycle,
    earnings: {
      smer: Math.round(smerAmount * 100) / 100,
      core_commission: Math.round(coreCommission * 100) / 100,
      profit_sharing: Math.round(profitSharing * 100) / 100
      // bonus and reimbursements: manual — preserved from existing
    },
    source_refs: {
      smer_id: smer?._id || null,
      collection_ids: collectionIds.map(c => c._id),
      expense_ids: expenseIds.map(e => e._id),
      pnl_report_id: pnl?._id || null
    },
    status: 'GENERATED',
    generated_at: new Date(),
    created_by: userId
  };

  // Upsert — preserve manual fields and BDM deduction_lines from existing doc
  const existing = await IncomeReport.findOne({
    entity_id: entityId, bdm_id: bdmId, period, cycle
  });

  if (existing) {
    // Preserve manual Finance entries
    incomeData.earnings.bonus = existing.earnings?.bonus || 0;
    incomeData.earnings.reimbursements = existing.earnings?.reimbursements || 0;
    incomeData.notes = existing.notes;

    // Preserve BDM-entered manual deduction lines (non-auto)
    const manualLines = (existing.deduction_lines || []).filter(
      l => l.auto_source !== 'CALF' && l.auto_source !== 'SCHEDULE'
    );

    // Keep already-verified/posted schedule lines (don't re-inject)
    const existingScheduleLines = (existing.deduction_lines || []).filter(
      l => l.auto_source === 'SCHEDULE' && l.status !== 'PENDING'
    );

    // Only inject new schedule lines for installments not already present
    const newScheduleLines = scheduleLines.filter(sl =>
      !existingScheduleLines.some(el =>
        el.schedule_ref?.installment_id?.toString() === sl.schedule_ref.installment_id.toString()
      )
    );

    // Rebuild auto CASH_ADVANCE line
    const autoLines = [];
    if (cashAdvanceDeduction > 0) {
      autoLines.push({
        deduction_type: 'CASH_ADVANCE',
        deduction_label: 'Cash Advance',
        amount: Math.round(cashAdvanceDeduction * 100) / 100,
        description: 'Auto-computed from CALF advance balance',
        entered_by: userId,
        entered_at: new Date(),
        status: 'VERIFIED',
        auto_source: 'CALF'
      });
    }

    incomeData.deduction_lines = [...autoLines, ...existingScheduleLines, ...newScheduleLines, ...manualLines];

    // Preserve legacy flat deductions for backward compat
    incomeData.deductions = {
      cash_advance: Math.round(cashAdvanceDeduction * 100) / 100,
      credit_card_payment: existing.deductions?.credit_card_payment || 0,
      credit_payment: existing.deductions?.credit_payment || 0,
      purchased_goods: existing.deductions?.purchased_goods || 0,
      other_deductions: existing.deductions?.other_deductions || 0,
      over_payment: existing.deductions?.over_payment || 0
    };

    Object.assign(existing, incomeData);
    await existing.save();

    // Mark newly injected schedule installments as INJECTED
    await _syncInjectedInstallments(existing);

    return existing;
  }

  // New report — create with auto CASH_ADVANCE line
  incomeData.earnings.bonus = 0;
  incomeData.earnings.reimbursements = 0;

  incomeData.deduction_lines = [];
  if (cashAdvanceDeduction > 0) {
    incomeData.deduction_lines.push({
      deduction_type: 'CASH_ADVANCE',
      deduction_label: 'Cash Advance',
      amount: Math.round(cashAdvanceDeduction * 100) / 100,
      description: 'Auto-computed from CALF advance balance',
      entered_by: userId,
      entered_at: new Date(),
      status: 'VERIFIED',
      auto_source: 'CALF'
    });
  }

  // Add schedule installments for new report
  incomeData.deduction_lines.push(...scheduleLines);

  // Legacy flat deductions
  incomeData.deductions = {
    cash_advance: Math.round(cashAdvanceDeduction * 100) / 100,
    credit_card_payment: 0,
    credit_payment: 0,
    purchased_goods: 0,
    other_deductions: 0,
    over_payment: 0
  };

  const report = await IncomeReport.create(incomeData);

  // Mark injected schedule installments as INJECTED
  await _syncInjectedInstallments(report);

  return report;
}

/**
 * After saving a report, sync SCHEDULE deduction lines → mark installments as INJECTED.
 * Non-blocking — errors logged but don't fail the generate.
 */
async function _syncInjectedInstallments(report) {
  const schedLines = (report.deduction_lines || []).filter(
    l => l.auto_source === 'SCHEDULE' && l.schedule_ref?.schedule_id && l.status === 'PENDING'
  );
  for (const line of schedLines) {
    try {
      await syncInstallmentStatus(
        line.schedule_ref.schedule_id,
        line.schedule_ref.installment_id,
        'INJECTED',
        report._id,
        line._id
      );
    } catch (err) {
      console.error('Schedule injection sync (non-blocking):', err.message);
    }
  }
}

/**
 * Get an existing income report
 */
async function getIncomeReport(entityId, bdmId, period, cycle) {
  return IncomeReport.findOne({
    entity_id: new mongoose.Types.ObjectId(entityId),
    bdm_id: new mongoose.Types.ObjectId(bdmId),
    period,
    cycle
  });
}

/**
 * Transition income report workflow status.
 *
 * Valid transitions:
 *   GENERATED → REVIEWED (Finance reviews)
 *   REVIEWED → RETURNED (Finance returns with reason)
 *   RETURNED → GENERATED (re-generate after fixes)
 *   REVIEWED → BDM_CONFIRMED (BDM confirms)
 *   BDM_CONFIRMED → CREDITED (Finance marks as paid)
 */
const VALID_TRANSITIONS = {
  review:  { from: ['GENERATED'], to: 'REVIEWED' },
  return:  { from: ['REVIEWED'], to: 'RETURNED' },
  confirm: { from: ['REVIEWED'], to: 'BDM_CONFIRMED' },
  credit:  { from: ['BDM_CONFIRMED'], to: 'CREDITED' }
};

async function transitionIncomeStatus(reportId, action, userId, data = {}) {
  const transition = VALID_TRANSITIONS[action];
  if (!transition) {
    throw new Error(`Invalid action: ${action}`);
  }

  const report = await IncomeReport.findById(reportId);
  if (!report) {
    throw new Error('Income report not found');
  }

  if (!transition.from.includes(report.status)) {
    throw new Error(
      `Cannot ${action} from status ${report.status}. Expected: ${transition.from.join(' or ')}`
    );
  }

  report.status = transition.to;

  switch (action) {
    case 'review':
      report.reviewed_by = userId;
      report.reviewed_at = new Date();
      break;
    case 'return':
      report.return_reason = data.reason || '';
      // Revert INJECTED schedule installments back to PENDING so they re-evaluate on next generate
      for (const line of (report.deduction_lines || [])) {
        if (line.auto_source === 'SCHEDULE' && line.schedule_ref?.schedule_id) {
          try {
            await syncInstallmentStatus(
              line.schedule_ref.schedule_id,
              line.schedule_ref.installment_id,
              'PENDING',
              null, null
            );
          } catch (err) {
            // non-blocking
          }
        }
      }
      break;
    case 'confirm':
      report.confirmed_at = new Date();
      break;
    case 'credit':
      report.credited_by = userId;
      report.credited_at = new Date();
      break;
  }

  await report.save();
  return report;
}

module.exports = {
  generateIncomeReport,
  getIncomeReport,
  transitionIncomeStatus,
  VALID_TRANSITIONS
};
