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
const CompProfile = require('../models/CompProfile');
const PeopleMaster = require('../models/PeopleMaster');
const { syncInstallmentStatus } = require('./deductionScheduleService');

/**
 * Resolve the ACTIVE CompProfile for a BDM user in a given entity.
 * Mirrors loadBdmCompProfile in expenseController; inlined here to keep
 * the service module dependency graph flat (no controller imports).
 */
async function _resolveCompProfile(entityId, bdmUserId) {
  const person = await PeopleMaster.findOne({
    user_id: new mongoose.Types.ObjectId(bdmUserId),
    entity_id: new mongoose.Types.ObjectId(entityId)
  }).select('_id').lean();
  if (!person) return null;
  return CompProfile.findOne({
    person_id: person._id,
    entity_id: new mongoose.Types.ObjectId(entityId),
    status: 'ACTIVE'
  }).sort({ effective_date: -1 }).lean();
}

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

  // 1. SMER earnings — per diem + transport only.
  //    ORE retired 2026-04 (Phase G1 hardening): SMER-ORE is phantom and flows
  //    exclusively through ExpenseEntry.expense_type='ORE'. On pre-retirement
  //    docs with legacy total_ore > 0, we subtract it so we don't double-count
  //    when we add ExpenseEntry-ORE below. New SMERs always have total_ore=0.
  const smer = await SmerEntry.findOne({
    ...filter, period, cycle,
    status: { $in: ['POSTED', 'VALID', 'DRAFT'] }
  }).lean();
  const smerLegacyOre = smer?.total_ore || 0;
  const smerAmount = Math.round(((smer?.total_reimbursable || 0) - smerLegacyOre) * 100) / 100;

  // 1b. ORE always from ExpenseEntry (receipt-backed, CASH). ACCESS lines are
  //     NOT reimbursable — company already paid via credit card / GCash / bank.
  const oreAgg = await ExpenseEntry.aggregate([
    { $match: { ...filter, period, cycle, status: { $in: ['POSTED', 'VALID', 'DRAFT'] } } },
    { $unwind: '$lines' },
    { $match: { 'lines.expense_type': 'ORE' } },
    { $group: { _id: null, total: { $sum: '$lines.amount' } } }
  ]);
  const oreAmount = Math.round((oreAgg[0]?.total || 0) * 100) / 100;

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
    ...filter, period, cycle,
    status: { $in: ['POSTED', 'VALID'] }
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
  // Personal Gas — always render a row for logbook-eligible BDMs (even at \u20B10)
  // so the BDM can always confirm the logbook was reviewed. Non-eligible (office
  // staff with no car logbook) are suppressed to avoid a meaningless \u20B10 row.
  const compProfile = await _resolveCompProfile(entityId, bdmId);
  if (compProfile?.logbook_eligible) {
    autoLines.push({
      deduction_type: 'PERSONAL_GAS',
      deduction_label: 'Personal Gas Usage',
      amount: personalGasDeduction,
      description: personalGasDeduction > 0
        ? 'Auto-computed from Car Logbook personal km \u00D7 fuel cost'
        : 'No personal km logged this cycle \u2014 logbook reviewed',
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
      smer: Math.round((smerAmount + oreAmount) * 100) / 100,
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

  // 1b. ORE always from ExpenseEntry (Phase G1 hardening — SMER-ORE retired)
  const oreAggP = await ExpenseEntry.aggregate([
    { $match: { ...filter, period, cycle, status: { $in: ['POSTED', 'VALID', 'DRAFT'] } } },
    { $unwind: '$lines' },
    { $match: { 'lines.expense_type': 'ORE' } },
    { $group: { _id: null, total: { $sum: '$lines.amount' } } }
  ]);
  const expenseOreP = Math.round((oreAggP[0]?.total || 0) * 100) / 100;
  const smerLegacyOreP = smer?.total_ore || 0;

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

  // Earnings — strip legacy SMER-ORE (retired) to avoid double-count with ExpenseEntry-ORE
  const smerAmount = ((smer?.total_reimbursable || 0) - smerLegacyOreP) + expenseOreP;
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
        ore_included: expenseOreP,
        ore_from_expenses: expenseOreP,
        ore_legacy_smer: smerLegacyOreP, // pre-retirement audit only; 0 on new docs
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

/**
 * Get detailed income breakdown for a report — fetches all source documents
 * and returns structured data for transparent payslip display.
 *
 * @param {Object} report - IncomeReport document (lean)
 * @returns {Object} Detailed breakdown by source
 */
async function getIncomeBreakdown(report) {
  const entityId = report.entity_id;
  const bdmId = report.bdm_id?._id || report.bdm_id;
  const { period, cycle, source_refs } = report;
  const { start, end } = periodToDates(period);

  const filter = {
    entity_id: new mongoose.Types.ObjectId(entityId),
    bdm_id: new mongoose.Types.ObjectId(bdmId)
  };

  // Fetch all source documents in parallel
  const [smer, collections, pnl, calfs, logbookEntries, expenseEntries] = await Promise.all([
    // 1. SMER
    source_refs?.smer_id
      ? SmerEntry.findById(source_refs.smer_id).lean()
      : null,

    // 2. Collections (commission source)
    source_refs?.collection_ids?.length
      ? Collection.find({ _id: { $in: source_refs.collection_ids } })
          .populate('hospital_id', 'hospital_name')
          .populate('customer_id', 'customer_name')
          .sort({ cr_date: 1 })
          .lean()
      : [],

    // 3. PNL Report (profit sharing source)
    source_refs?.pnl_report_id
      ? PnlReport.findById(source_refs.pnl_report_id).lean()
      : null,

    // 4. CALF documents
    PrfCalf.find({
      ...filter, doc_type: 'CALF', period,
      status: { $in: ['POSTED', 'VALID'] }
    }).sort({ createdAt: 1 }).lean(),

    // 5. Car Logbook entries (personal gas source)
    CarLogbookEntry.find({
      ...filter, period, cycle,
      status: { $in: ['POSTED', 'VALID'] }
    }).sort({ entry_date: 1 }).lean(),

    // 6. Expense entries (ORE detail)
    source_refs?.expense_ids?.length
      ? ExpenseEntry.find({ _id: { $in: source_refs.expense_ids } }).lean()
      : []
  ]);

  // ── Build SMER breakdown ──
  // ORE subtotal row sources from ExpenseEntry (expense_type='ORE'). Legacy
  // SMER-ORE on pre-retirement docs is exposed via ore_legacy_smer for audit
  // only — the UI should not add it to the total (would double-count).
  const expenseOreForBreakdown = expenseEntries.flatMap(e =>
    (e.lines || []).filter(l => l.expense_type === 'ORE')
  ).reduce((sum, l) => sum + (l.amount || 0), 0);
  let smerBreakdown = null;
  if (smer) {
    smerBreakdown = {
      status: smer.status,
      working_days: smer.working_days,
      subtotals: {
        perdiem: smer.total_perdiem || 0,
        transport_p2p: smer.total_transpo || 0,
        transport_special: smer.total_special_cases || 0,
        ore: Math.round(expenseOreForBreakdown * 100) / 100,
        ore_legacy_smer: smer.total_ore || 0, // audit only — not summed
        total_reimbursable: Math.round(((smer.total_reimbursable || 0) - (smer.total_ore || 0) + expenseOreForBreakdown) * 100) / 100
      },
      daily_entries: (smer.daily_entries || []).map(d => ({
        day: d.day,
        entry_date: d.entry_date,
        activity_type: d.activity_type,
        hospital_covered: d.hospital_covered,
        md_count: d.md_count || 0,
        perdiem_tier: d.perdiem_tier,
        perdiem_amount: d.perdiem_amount || 0,
        perdiem_override: d.perdiem_override || false,
        override_tier: d.override_tier,
        override_reason: d.override_reason,
        transpo_p2p: d.transpo_p2p || 0,
        transpo_special: d.transpo_special || 0,
        ore_amount: d.ore_amount || 0
      })),
      revolving_fund: {
        travel_advance: smer.travel_advance || 0,
        total_reimbursable: smer.total_reimbursable || 0,
        balance_on_hand: smer.balance_on_hand || 0
      }
    };
  }

  // ── Build Commission breakdown ──
  const commissionBreakdown = {
    total: report.earnings?.core_commission || 0,
    collection_count: collections.length,
    collections: collections.map(c => ({
      _id: c._id,
      cr_no: c.cr_no,
      cr_date: c.cr_date,
      cr_amount: c.cr_amount,
      hospital_name: c.hospital_id?.hospital_name || c.customer_id?.customer_name || 'N/A',
      total_commission: c.total_commission || 0,
      settled_csis: (c.settled_csis || []).map(csi => ({
        doc_ref: csi.doc_ref,
        invoice_amount: csi.invoice_amount || 0,
        net_of_vat: csi.net_of_vat || 0,
        commission_rate: csi.commission_rate || 0,
        commission_amount: csi.commission_amount || 0
      }))
    }))
  };

  // ── Build Profit Sharing breakdown ──
  let profitSharingBreakdown = null;
  if (pnl && pnl.profit_sharing) {
    const ps = pnl.profit_sharing;
    profitSharingBreakdown = {
      eligible: ps.eligible || false,
      deficit_flag: ps.deficit_flag || false,
      bdm_share: ps.bdm_share || 0,
      vip_share: ps.vip_share || 0,
      products: (ps.ps_products || []).map(p => ({
        product_name: p.product_name,
        hospital_count: p.hospital_count || 0,
        md_count: p.md_count || 0,
        consecutive_months: p.consecutive_months || 0,
        qualified: p.qualified || false,
        conditions_met: p.conditions_met || false
      })),
      pnl_summary: {
        gross_profit: pnl.gross_profit || 0,
        total_expenses: pnl.total_expenses || 0,
        net_income: pnl.net_income || 0
      }
    };
  }

  // ── Build CALF breakdown ──
  const totalAdvance = calfs.reduce((sum, c) => sum + (c.advance_amount || 0), 0);
  const totalLiquidation = calfs.reduce((sum, c) => sum + (c.liquidation_amount || 0), 0);
  const calfBalance = Math.round((totalAdvance - totalLiquidation) * 100) / 100;

  const calfBreakdown = {
    total_advance: totalAdvance,
    total_liquidation: totalLiquidation,
    balance: calfBalance,
    is_reimbursement: calfBalance < 0,
    is_deduction: calfBalance > 0,
    amount_on_payslip: Math.abs(calfBalance),
    documents: calfs.map(c => ({
      _id: c._id,
      calf_number: c.calf_number,
      advance_amount: c.advance_amount || 0,
      liquidation_amount: c.liquidation_amount || 0,
      balance: Math.round(((c.advance_amount || 0) - (c.liquidation_amount || 0)) * 100) / 100,
      status: c.status,
      notes: c.notes
    }))
  };

  // ── Build Personal Gas breakdown (daily level) ──
  const gasSummary = {
    total_km: 0, total_personal_km: 0, total_official_km: 0,
    total_fuel_liters: 0, total_fuel_cost: 0, total_personal_gas: 0
  };

  const gasEntries = logbookEntries.map(e => {
    gasSummary.total_km += e.total_km || 0;
    gasSummary.total_personal_km += e.personal_km || 0;
    gasSummary.total_official_km += e.official_km || 0;
    const entryFuelLiters = (e.fuel_entries || []).reduce((sum, f) => sum + (f.liters || 0), 0);
    const entryFuelCost = (e.fuel_entries || []).reduce((sum, f) => sum + (f.total_amount || 0), 0);
    gasSummary.total_fuel_liters += entryFuelLiters;
    gasSummary.total_fuel_cost += entryFuelCost;
    gasSummary.total_personal_gas += e.personal_gas_amount || 0;

    return {
      _id: e._id,
      entry_date: e.entry_date,
      starting_km: e.starting_km,
      ending_km: e.ending_km,
      total_km: e.total_km || 0,
      personal_km: e.personal_km || 0,
      official_km: e.official_km || 0,
      km_per_liter: e.km_per_liter || 12,
      expected_personal_liters: e.expected_personal_liters || 0,
      avg_price_per_liter: entryFuelLiters > 0
        ? Math.round((entryFuelCost / entryFuelLiters) * 100) / 100
        : 0,
      personal_gas_amount: e.personal_gas_amount || 0,
      total_fuel_amount: entryFuelCost,
      fuel_entries: (e.fuel_entries || []).map(f => ({
        station_name: f.station_name,
        liters: f.liters || 0,
        price_per_liter: f.price_per_liter || 0,
        total_amount: f.total_amount || 0,
        payment_mode: f.payment_mode
      }))
    };
  });

  // Round summary totals
  gasSummary.total_personal_gas = Math.round(gasSummary.total_personal_gas * 100) / 100;
  gasSummary.total_fuel_cost = Math.round(gasSummary.total_fuel_cost * 100) / 100;
  gasSummary.avg_price_per_liter = gasSummary.total_fuel_liters > 0
    ? Math.round((gasSummary.total_fuel_cost / gasSummary.total_fuel_liters) * 100) / 100
    : 0;

  const personalGasBreakdown = {
    total_deduction: report.deduction_lines
      ?.find(l => l.auto_source === 'PERSONAL_GAS')?.amount || gasSummary.total_personal_gas,
    entry_count: gasEntries.length,
    entries: gasEntries,
    summary: gasSummary
  };

  // ── Build ORE breakdown (two layers) ──
  // Layer 1: Per-day ORE from SMER daily entries
  const oreDays = smer
    ? (smer.daily_entries || [])
        .filter(d => (d.ore_amount || 0) > 0)
        .map(d => ({
          day: d.day,
          entry_date: d.entry_date,
          ore_amount: d.ore_amount
        }))
    : [];

  // Layer 2: Actual expense lines (ORE type only)
  const oreExpenseLines = expenseEntries.flatMap(e =>
    (e.lines || [])
      .filter(l => l.expense_type === 'ORE')
      .map(l => ({
        expense_date: l.expense_date,
        expense_category: l.expense_category,
        establishment: l.establishment,
        particulars: l.particulars,
        amount: l.amount || 0,
        or_number: l.or_number,
        payment_mode: l.payment_mode
      }))
  );

  // Group ORE lines by category with subtotals
  const oreByCat = {};
  for (const l of oreExpenseLines) {
    const cat = l.expense_category || 'Uncategorized';
    if (!oreByCat[cat]) oreByCat[cat] = { category: cat, lines: [], subtotal: 0 };
    oreByCat[cat].lines.push(l);
    oreByCat[cat].subtotal += l.amount;
  }
  const oreCategories = Object.values(oreByCat).map(c => ({
    ...c,
    subtotal: Math.round(c.subtotal * 100) / 100
  }));

  // ORE breakdown — canonical source is ExpenseEntry (expense_type='ORE').
  // Legacy SMER-ORE (smer_ore) is surfaced for historical audit only: pre-retirement
  // POSTED SMERs may carry a non-zero total_ore / daily_ore, but those values are
  // already reflected in the historical total_reimbursable for that doc. UI must
  // NOT sum smer_ore into the current reimbursable total (would double-count).
  const expenseOreTotal = Math.round(oreExpenseLines.reduce((s, l) => s + l.amount, 0) * 100) / 100;
  const oreBreakdown = {
    total: expenseOreTotal,
    expense_ore: expenseOreTotal,
    smer_ore: smer?.total_ore || 0, // deprecated — audit only
    daily_ore: oreDays,              // deprecated — audit only (pre-retirement legacy)
    expense_lines: oreExpenseLines,
    by_category: oreCategories
  };

  // ── Build DeductionSchedule breakdown ──
  // Frontend expands any INSTALLMENT row to show the full timeline of the
  // schedule it came from: past / current / future installments, status
  // per installment, remaining balance. Keyed by schedule _id (string).
  const scheduleIds = [...new Set(
    (report.deduction_lines || [])
      .filter(l => l.auto_source === 'SCHEDULE' && l.schedule_ref?.schedule_id)
      .map(l => l.schedule_ref.schedule_id.toString())
  )];
  const schedulesByKey = {};
  if (scheduleIds.length > 0) {
    const scheds = await DeductionSchedule.find({
      _id: { $in: scheduleIds.map(id => new mongoose.Types.ObjectId(id)) }
    }).lean();
    for (const s of scheds) {
      schedulesByKey[s._id.toString()] = {
        _id: s._id,
        schedule_code: s.schedule_code,
        deduction_type: s.deduction_type,
        deduction_label: s.deduction_label,
        description: s.description,
        total_amount: s.total_amount || 0,
        installment_amount: s.installment_amount || 0,
        term_months: s.term_months || 1,
        start_period: s.start_period,
        target_cycle: s.target_cycle,
        remaining_balance: s.remaining_balance || 0,
        status: s.status,
        installments: (s.installments || []).map(i => ({
          _id: i._id,
          period: i.period,
          installment_no: i.installment_no,
          amount: i.amount || 0,
          status: i.status,
          income_report_id: i.income_report_id,
          verified_at: i.verified_at
        }))
      };
    }
  }

  return {
    report_id: report._id,
    period,
    cycle,
    bdm_name: report.bdm_id?.name || 'N/A',
    smer: smerBreakdown,
    commission: commissionBreakdown,
    profit_sharing: profitSharingBreakdown,
    calf: calfBreakdown,
    personal_gas: personalGasBreakdown,
    ore: oreBreakdown,
    schedules: schedulesByKey
  };
}

module.exports = {
  generateIncomeReport,
  projectIncome,
  getIncomeReport,
  getIncomeBreakdown,
  transitionIncomeStatus,
  VALID_TRANSITIONS,
  // Phase G1.3 — employee Payslip compute reuses this for logbook_eligible
  // resolution without a new util file or dependency on the controller layer.
  resolveCompProfile: _resolveCompProfile
};
