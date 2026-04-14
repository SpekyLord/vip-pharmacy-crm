/**
 * Income Calculation Service — BDM Payslip Generation + Projection
 *
 * PRD §10: BDM Income Computation (per cycle)
 * Earnings: SMER + CORE Commission + CALF Reimbursement + Bonus + Profit Sharing + Reimbursements
 * Deductions: Lookup-driven deduction_lines[] (BDM enters, Finance verifies)
 *   Auto-deductions: CALF excess (auto_source: 'CALF'), Personal Gas (auto_source: 'PERSONAL_GAS'),
 *                    Schedule installments (auto_source: 'SCHEDULE')
 * Net Pay = Total Earnings - Total Deductions
 *
 * Phase G1: CALF bidirectional settlement, personal gas auto-deduction, income projection
 */
const mongoose = require('mongoose');
const IncomeReport = require('../models/IncomeReport');
const PnlReport = require('../models/PnlReport');
const SmerEntry = require('../models/SmerEntry');
const Collection = require('../models/Collection');
const ExpenseEntry = require('../models/ExpenseEntry');
const PrfCalf = require('../models/PrfCalf');
const CarLogbookEntry = require('../models/CarLogbookEntry');
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

  // 1. SMER earnings (includes ORE — ORE is paid from revolving fund, already in total_reimbursable)
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

  // 4. CALF settlement — bidirectional
  //    Positive balance (advance > liquidation) → deduction (BDM returns excess)
  //    Negative balance (liquidation > advance) → reimbursement in earnings (company pays BDM back)
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
  const calfBalance = Math.round((calfData.total_advance - calfData.total_liquidation) * 100) / 100;
  const calfReimbursement = calfBalance < 0 ? Math.abs(calfBalance) : 0;
  const calfExcessDeduction = calfBalance > 0 ? calfBalance : 0;

  // 4b. Personal gas deduction from Car Logbook
  const gasAgg = await CarLogbookEntry.aggregate([
    {
      $match: {
        ...filter,
        period, cycle,
        status: { $in: ['POSTED', 'VALID'] }
      }
    },
    {
      $group: {
        _id: null,
        total_personal_gas: { $sum: '$personal_gas_amount' }
      }
    }
  ]);
  const personalGasDeduction = Math.round((gasAgg[0]?.total_personal_gas || 0) * 100) / 100;

  // 4c. Recurring deduction schedule installments (filter by target_cycle)
  const activeSchedules = await DeductionSchedule.find({
    entity_id: new mongoose.Types.ObjectId(entityId),
    bdm_id: new mongoose.Types.ObjectId(bdmId),
    status: 'ACTIVE',
    $or: [
      { target_cycle: cycle },
      { target_cycle: { $exists: false } } // legacy schedules without target_cycle
    ],
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

  // Build auto-deduction lines (rebuilt fresh each generation)
  const autoLines = [];
  if (calfExcessDeduction > 0) {
    autoLines.push({
      deduction_type: 'CASH_ADVANCE',
      deduction_label: 'CALF Settlement (Return Excess)',
      amount: calfExcessDeduction,
      description: `Advance \u20B1${calfData.total_advance.toLocaleString()} \u2212 Liquidated \u20B1${calfData.total_liquidation.toLocaleString()}`,
      entered_by: userId,
      entered_at: new Date(),
      status: 'VERIFIED',
      auto_source: 'CALF'
    });
  }
  if (personalGasDeduction > 0) {
    autoLines.push({
      deduction_type: 'PERSONAL_GAS',
      deduction_label: 'Personal Gas Usage',
      amount: personalGasDeduction,
      description: 'Auto-computed from Car Logbook personal km \u00D7 fuel cost',
      entered_by: userId,
      entered_at: new Date(),
      status: 'VERIFIED',
      auto_source: 'PERSONAL_GAS'
    });
  }

  // Build income data
  const incomeData = {
    entity_id: entityId,
    bdm_id: bdmId,
    period,
    cycle,
    earnings: {
      smer: Math.round(smerAmount * 100) / 100,
      core_commission: Math.round(coreCommission * 100) / 100,
      profit_sharing: Math.round(profitSharing * 100) / 100,
      calf_reimbursement: Math.round(calfReimbursement * 100) / 100
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

    // Preserve BDM-entered manual deduction lines only (strip all auto-source lines — they're rebuilt fresh)
    const manualLines = (existing.deduction_lines || []).filter(
      l => !l.auto_source
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

    incomeData.deduction_lines = [...autoLines, ...existingScheduleLines, ...newScheduleLines, ...manualLines];

    // Legacy flat deductions for backward compat
    incomeData.deductions = {
      cash_advance: calfExcessDeduction,
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

  // New report — create with auto lines
  incomeData.earnings.bonus = 0;
  incomeData.earnings.reimbursements = 0;

  incomeData.deduction_lines = [...autoLines, ...scheduleLines];

  // Legacy flat deductions
  incomeData.deductions = {
    cash_advance: calfExcessDeduction,
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
 * After saving a report, sync SCHEDULE deduction lines -> mark installments as INJECTED.
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
 * Project income for a BDM's current cycle — read-only, no document creation.
 * Returns breakdown of what's earned so far with confidence/source indicators.
 *
 * @param {String} entityId
 * @param {String} bdmId
 * @param {String} period - "2026-04"
 * @param {String} cycle - "C1" | "C2" | "MONTHLY"
 * @returns {Object} Income projection with confidence levels
 */
async function projectIncome(entityId, bdmId, period, cycle) {
  const { start, end } = periodToDates(period);
  const filter = {
    entity_id: new mongoose.Types.ObjectId(entityId),
    bdm_id: new mongoose.Types.ObjectId(bdmId)
  };

  // 1. SMER — any active status (exclude DELETION_REQUESTED)
  const smer = await SmerEntry.findOne({
    ...filter, period, cycle,
    status: { $in: ['DRAFT', 'VALID', 'ERROR', 'POSTED'] }
  }).sort({ updatedAt: -1 }).lean();

  // 2. Commission from Collections — split by status
  const collAgg = await Collection.aggregate([
    { $match: { ...filter, cr_date: { $gte: start, $lt: end } } },
    {
      $group: {
        _id: '$status',
        total_commission: { $sum: '$total_commission' },
        count: { $sum: 1 }
      }
    }
  ]);
  const postedComm = collAgg.find(r => r._id === 'POSTED') || { total_commission: 0, count: 0 };
  const draftComm = collAgg.find(r => r._id === 'DRAFT') || { total_commission: 0, count: 0 };
  const validComm = collAgg.find(r => r._id === 'VALID') || { total_commission: 0, count: 0 };

  // 3. Profit sharing
  const pnl = await PnlReport.findOne({ ...filter, period }).lean();
  const profitSharing = (pnl?.profit_sharing?.eligible && pnl?.profit_sharing?.bdm_share > 0)
    ? pnl.profit_sharing.bdm_share : 0;

  // 4. CALF settlement — bidirectional
  const calfAgg = await PrfCalf.aggregate([
    { $match: { ...filter, doc_type: 'CALF', period, status: { $in: ['POSTED', 'VALID', 'DRAFT'] } } },
    { $group: { _id: null, total_advance: { $sum: '$advance_amount' }, total_liquidation: { $sum: '$liquidation_amount' } } }
  ]);
  const calfData = calfAgg[0] || { total_advance: 0, total_liquidation: 0 };
  const calfBalance = Math.round((calfData.total_advance - calfData.total_liquidation) * 100) / 100;

  // 5. Personal gas from Car Logbook
  const gasAgg = await CarLogbookEntry.aggregate([
    { $match: { ...filter, period, cycle, status: { $in: ['POSTED', 'VALID', 'DRAFT'] } } },
    { $group: { _id: null, total_personal_gas: { $sum: '$personal_gas_amount' } } }
  ]);
  const personalGas = Math.round((gasAgg[0]?.total_personal_gas || 0) * 100) / 100;

  // 6. Pending deduction schedules
  const schedules = await DeductionSchedule.find({
    entity_id: new mongoose.Types.ObjectId(entityId),
    bdm_id: new mongoose.Types.ObjectId(bdmId),
    status: 'ACTIVE',
    installments: { $elemMatch: { period, status: { $in: ['PENDING', 'INJECTED'] } } }
  }).lean();
  let scheduleAmount = 0, scheduleCount = 0;
  for (const s of schedules) {
    const inst = s.installments.find(i => i.period === period && ['PENDING', 'INJECTED'].includes(i.status));
    if (inst) { scheduleAmount += inst.amount || 0; scheduleCount++; }
  }

  // 7. Existing income report (if already generated)
  const existing = await IncomeReport.findOne({ ...filter, period, cycle })
    .select('status total_earnings total_deductions net_pay earnings deduction_lines')
    .lean();

  // Count manual deduction lines
  const manualLines = existing
    ? (existing.deduction_lines || []).filter(l => !l.auto_source && l.status !== 'REJECTED')
    : [];
  const manualAmount = manualLines.reduce((sum, l) => sum + (l.amount || 0), 0);

  // Compute confidence helper
  const statusConfidence = (status) => {
    if (status === 'POSTED') return 'CONFIRMED';
    if (status === 'VALID' || status === 'DRAFT') return 'PROJECTED';
    return 'NONE';
  };

  // Earnings
  const smerAmount = smer?.total_reimbursable || 0;
  const totalCommission = postedComm.total_commission + draftComm.total_commission + validComm.total_commission;
  const calfReimb = calfBalance < 0 ? Math.abs(calfBalance) : 0;
  const projectedEarnings = Math.round((smerAmount + totalCommission + calfReimb +
    profitSharing + (existing?.earnings?.bonus || 0) + (existing?.earnings?.reimbursements || 0)) * 100) / 100;

  // Deductions
  const calfExcess = calfBalance > 0 ? calfBalance : 0;
  const totalDeductions = Math.round((calfExcess + personalGas + scheduleAmount + manualAmount) * 100) / 100;

  return {
    period,
    cycle,
    has_official_report: !!existing,
    official_status: existing?.status || null,

    projection: {
      smer: {
        amount: Math.round(smerAmount * 100) / 100,
        ore_included: Math.round((smer?.total_ore || 0) * 100) / 100,
        status: smer?.status || 'NONE',
        confidence: smer ? statusConfidence(smer.status) : 'NONE'
      },
      core_commission: {
        posted: Math.round(postedComm.total_commission * 100) / 100,
        pending: Math.round((draftComm.total_commission + validComm.total_commission) * 100) / 100,
        total: Math.round(totalCommission * 100) / 100,
        posted_count: postedComm.count,
        pending_count: draftComm.count + validComm.count,
        confidence: postedComm.count > 0 ? 'PARTIAL' : (totalCommission > 0 ? 'PROJECTED' : 'NONE')
      },
      calf_reimbursement: {
        amount: Math.round(calfReimb * 100) / 100,
        confidence: calfReimb > 0 ? 'PROJECTED' : 'NONE'
      },
      profit_sharing: {
        amount: Math.round(profitSharing * 100) / 100,
        confidence: profitSharing > 0 ? 'PROJECTED' : 'NONE'
      },
      bonus: {
        amount: existing?.earnings?.bonus || 0,
        confidence: existing ? 'CONFIRMED' : 'NONE'
      },
      reimbursements: {
        amount: existing?.earnings?.reimbursements || 0,
        confidence: existing ? 'CONFIRMED' : 'NONE'
      }
    },

    deductions: {
      calf_excess: {
        amount: Math.round(calfExcess * 100) / 100,
        confidence: calfExcess > 0 ? 'PROJECTED' : 'NONE'
      },
      personal_gas: {
        amount: personalGas,
        confidence: personalGas > 0 ? 'PROJECTED' : 'NONE'
      },
      schedule_installments: {
        amount: Math.round(scheduleAmount * 100) / 100,
        count: scheduleCount,
        confidence: scheduleCount > 0 ? 'CONFIRMED' : 'NONE'
      },
      manual_lines: {
        amount: Math.round(manualAmount * 100) / 100,
        count: manualLines.length
      }
    },

    calf_summary: {
      total_advance: calfData.total_advance,
      total_liquidated: calfData.total_liquidation,
      balance: calfBalance
    },

    totals: {
      projected_earnings: projectedEarnings,
      total_deductions: totalDeductions,
      projected_net: Math.round((projectedEarnings - totalDeductions) * 100) / 100
    },

    revolving_fund: {
      travel_advance: smer?.travel_advance || 0,
      total_reimbursable: smerAmount,
      balance_on_hand: smer?.balance_on_hand || 0
    }
  };
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
 *   GENERATED -> REVIEWED (Finance reviews)
 *   REVIEWED -> RETURNED (Finance returns with reason)
 *   RETURNED -> GENERATED (re-generate after fixes)
 *   REVIEWED -> BDM_CONFIRMED (BDM confirms)
 *   BDM_CONFIRMED -> CREDITED (Finance marks as paid)
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
  projectIncome,
  getIncomeReport,
  transitionIncomeStatus,
  VALID_TRANSITIONS
};
