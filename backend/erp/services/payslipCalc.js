/**
 * Payslip Calculation Service — Employee / Sales Rep / Consultant / Director
 *
 * Phase G1.3 — transparency parity with contractor IncomeReport:
 *   Deductions render as a deduction_lines[] array (label + amount + kind
 *   badge + expandable source). Flat deductions.* fields are DERIVED from the
 *   lines so the JE consumer (autoJournal.journalFromPayroll) keeps working
 *   without changes. Personal Gas auto-emits for employees whose CompProfile
 *   has logbook_eligible=true.
 *
 * Statutory (auto_source = SSS / PHILHEALTH / PAGIBIG / WITHHOLDING_TAX):
 *   Rebuilt every compute from the lookup-driven rate tables. Not user-
 *   editable. Single VERIFIED line per source.
 *
 * Personal Gas (auto_source = PERSONAL_GAS):
 *   Only emitted when CompProfile.logbook_eligible=true. Always rendered (even
 *   at ₱0) so Finance can confirm the logbook was reviewed this cycle.
 *
 * Manual (auto_source = null):
 *   Cash Advance, Loan Payments, Other Deductions are preserved from the
 *   existing payslip's flat fields on re-compute. Today they still enter via
 *   flat-field paths; deduction_lines surface them transparently. Phase G1.4
 *   will add per-line Finance add/verify UI (parity with IncomeReport).
 */
const mongoose = require('mongoose');
const PeopleMaster = require('../models/PeopleMaster');
const CompProfile = require('../models/CompProfile');
const Payslip = require('../models/Payslip');
const CarLogbookEntry = require('../models/CarLogbookEntry');
const { computeSSS } = require('./sssCalc');
const { computePhilHealth } = require('./philhealthCalc');
const { computePagIBIG } = require('./pagibigCalc');
const { computeWithholdingTax } = require('./withholdingTaxCalc');
const { computeDeMinimis } = require('./deMinimisCalc');

// ────────────────────────────────────────────────────────────────────────────
// Deduction-line builders
// ────────────────────────────────────────────────────────────────────────────

/**
 * Build the auto-generated deduction_lines[] from statutory amounts + Personal
 * Gas (when eligible). Called every compute; replaces the previous auto-lines
 * on re-compute (preserving only the manual non-auto_source lines).
 *
 * Lines are VERIFIED by default — these are system-computed, not user-entered.
 * Finance can still override via the existing flat-field path until G1.4 adds
 * per-line verify/correct UI.
 */
function buildAutoDeductionLines({ stat, personalGas, emitPersonalGas, userId }) {
  const now = new Date();
  const lines = [];

  const push = (auto_source, deduction_label, amount, description) => {
    lines.push({
      deduction_type: auto_source,
      deduction_label,
      amount: Math.round((amount || 0) * 100) / 100,
      description: description || '',
      entered_by: userId,
      entered_at: now,
      status: 'VERIFIED',
      auto_source,
    });
  };

  // Statutory — only emit rows with > 0 amounts. Zero-amount statutory lines
  // would clutter the payslip without adding information (unlike Personal Gas,
  // where a ₱0 row proves the logbook was reviewed).
  if ((stat.sss || 0) > 0) push('SSS', 'SSS (Employee Share)', stat.sss, 'Social Security System contribution');
  if ((stat.philhealth || 0) > 0) push('PHILHEALTH', 'PhilHealth (Employee Share)', stat.philhealth, 'PhilHealth premium');
  if ((stat.pagibig || 0) > 0) push('PAGIBIG', 'Pag-IBIG (Employee Share)', stat.pagibig, 'HDMF contribution');
  if ((stat.withholding_tax || 0) > 0) push('WITHHOLDING_TAX', 'Withholding Tax', stat.withholding_tax, 'BIR withholding tax on compensation');

  // Personal Gas — always render for logbook-eligible employees (even at ₱0)
  // so Finance can see the logbook was reviewed this cycle. Suppress entirely
  // for non-eligible employees (office staff without a car) to avoid a
  // meaningless ₱0 row.
  if (emitPersonalGas) {
    lines.push({
      deduction_type: 'PERSONAL_GAS',
      deduction_label: 'Personal Gas Usage',
      amount: Math.round((personalGas || 0) * 100) / 100,
      description: (personalGas || 0) > 0
        ? 'Auto-computed from Car Logbook personal km \u00D7 fuel cost'
        : 'No personal km logged this cycle \u2014 logbook reviewed',
      entered_by: userId,
      entered_at: now,
      status: 'VERIFIED',
      auto_source: 'PERSONAL_GAS',
    });
  }

  return lines;
}

/**
 * Rebuild manual (non-statutory, non-auto) lines from the existing payslip's
 * flat fields. Called when we need to reflect Finance-entered flat-field
 * values in the transparent lines array. Lines keep auto_source=null and are
 * VERIFIED (they came in via a Finance path, not a self-service path).
 *
 * Today the Cash Advance / Loan Payments / Other Deductions flows still set
 * the flat fields directly (no line-level UI yet). This helper ensures the
 * array stays consistent with the flat fields regardless of entry path.
 */
function buildManualLinesFromFlat({ flat, userId }) {
  const now = new Date();
  const lines = [];
  const entries = [
    ['CASH_ADVANCE', 'Cash Advance', flat.cash_advance],
    ['LOAN', 'Loan Payment', flat.loan_payments],
    ['OTHER', 'Other Deduction', flat.other_deductions],
  ];
  for (const [code, label, amount] of entries) {
    if ((amount || 0) > 0) {
      lines.push({
        deduction_type: code,
        deduction_label: label,
        amount: Math.round(amount * 100) / 100,
        description: '',
        entered_by: userId,
        entered_at: now,
        status: 'VERIFIED',
        auto_source: null,
      });
    }
  }
  return lines;
}

/**
 * Derive the flat deductions.* fields from deduction_lines. Keeps the JE
 * consumer (autoJournal.journalFromPayroll) working unchanged — it reads
 * the flat fields, we keep them in sync with the array.
 */
function deriveFlatFromLines(lines) {
  const flat = {
    sss_employee: 0,
    philhealth_employee: 0,
    pagibig_employee: 0,
    withholding_tax: 0,
    cash_advance: 0,
    loan_payments: 0,
    other_deductions: 0,
  };
  for (const l of (lines || [])) {
    if (l.status === 'REJECTED') continue;
    switch (l.auto_source) {
      case 'SSS': flat.sss_employee += l.amount || 0; break;
      case 'PHILHEALTH': flat.philhealth_employee += l.amount || 0; break;
      case 'PAGIBIG': flat.pagibig_employee += l.amount || 0; break;
      case 'WITHHOLDING_TAX': flat.withholding_tax += l.amount || 0; break;
      case 'PERSONAL_GAS': flat.other_deductions += l.amount || 0; break;
      // Manual lines go to their canonical bucket by deduction_type, not by
      // auto_source (auto_source is null for manual).
      default: {
        if (l.deduction_type === 'CASH_ADVANCE') flat.cash_advance += l.amount || 0;
        else if (l.deduction_type === 'LOAN') flat.loan_payments += l.amount || 0;
        else flat.other_deductions += l.amount || 0;
      }
    }
  }
  for (const k of Object.keys(flat)) flat[k] = Math.round(flat[k] * 100) / 100;
  return flat;
}

/**
 * Personal-gas aggregation for employees — mirrors incomeCalc's CarLogbook
 * query. Keyed on entity + person (via PeopleMaster.user_id) + period + cycle.
 *
 * Employees typically won't have a Car Logbook today, so the aggregation
 * returns 0. The gate is CompProfile.logbook_eligible; if that flag is true
 * and the person_id's linked user has car logbook entries, they aggregate.
 */
async function aggregatePersonalGas(entityId, userId, period, cycle) {
  if (!userId) return 0;
  const match = {
    entity_id: new mongoose.Types.ObjectId(entityId),
    bdm_id: new mongoose.Types.ObjectId(userId),
    period,
    status: { $in: ['POSTED', 'VALID'] },
  };
  if (cycle && cycle !== 'MONTHLY') match.cycle = cycle;
  const agg = await CarLogbookEntry.aggregate([
    { $match: match },
    { $group: { _id: null, total: { $sum: '$personal_gas_amount' } } },
  ]);
  return Math.round((agg[0]?.total || 0) * 100) / 100;
}

// ────────────────────────────────────────────────────────────────────────────
// Generate / compute
// ────────────────────────────────────────────────────────────────────────────

/**
 * Generate a payslip for a fixed-salary employee.
 * Computes earnings from comp profile, government deductions, and net pay.
 */
async function generateEmployeePayslip(entityId, personId, period, cycle, userId) {
  const person = await PeopleMaster.findById(personId).lean();
  if (!person) throw new Error('Person not found');

  const comp = await CompProfile.getActiveProfile(personId);
  if (!comp) throw new Error(`No active compensation profile for ${person.full_name}`);

  // Prorate for semi-monthly cycles
  const divisor = cycle === 'MONTHLY' ? 1 : 2;

  const earnings = {
    basic_salary: Math.round((comp.basic_salary / divisor) * 100) / 100,
    rice_allowance: Math.round((comp.rice_allowance / divisor) * 100) / 100,
    clothing_allowance: Math.round((comp.clothing_allowance / divisor) * 100) / 100,
    medical_allowance: Math.round((comp.medical_allowance / divisor) * 100) / 100,
    laundry_allowance: Math.round((comp.laundry_allowance / divisor) * 100) / 100,
    transport_allowance: Math.round((comp.transport_allowance / divisor) * 100) / 100,
  };

  // Government deductions (monthly basis, split for semi-monthly)
  const monthlySalary = comp.monthly_gross || comp.basic_salary || 0;
  const sss = await computeSSS(monthlySalary);
  const ph = await computePhilHealth(monthlySalary);
  const pag = await computePagIBIG(monthlySalary);

  // De minimis: compute taxable excess from allowances
  const deMi = await computeDeMinimis(comp);

  // Taxable income: gross - SSS - PhilHealth - PagIBIG - de minimis exempt
  const monthlyTaxable = monthlySalary - sss.employee_share - ph.employee_share - pag.employee_share - deMi.exempt_total + deMi.taxable_excess;
  const annualTaxable = monthlyTaxable * 12;
  const tax = await computeWithholdingTax(annualTaxable);

  const stat = {
    sss: Math.round((sss.employee_share / divisor) * 100) / 100,
    philhealth: Math.round((ph.employee_share / divisor) * 100) / 100,
    pagibig: Math.round((pag.employee_share / divisor) * 100) / 100,
    withholding_tax: Math.round((tax.monthly_tax / divisor) * 100) / 100,
  };

  // Personal gas gate — only aggregate & emit for logbook-eligible employees.
  // Zero-amount row still renders so Finance can confirm the logbook was
  // reviewed. Rule #3: logbook_eligible is a per-person CompProfile flag.
  const emitPersonalGas = !!comp.logbook_eligible;
  const personalGas = emitPersonalGas
    ? await aggregatePersonalGas(entityId, person.user_id, period, cycle)
    : 0;

  const employer_contributions = {
    sss_employer: Math.round((sss.employer_share / divisor) * 100) / 100,
    philhealth_employer: Math.round((ph.employer_share / divisor) * 100) / 100,
    pagibig_employer: Math.round((pag.employer_share / divisor) * 100) / 100,
    ec_employer: Math.round((sss.ec / divisor) * 100) / 100,
  };

  // Snapshot rates for audit
  const gov_rates_snapshot = {
    sss: { employee: sss.employee_share, employer: sss.employer_share, ec: sss.ec },
    philhealth: { employee: ph.employee_share, employer: ph.employer_share },
    pagibig: { employee: pag.employee_share, employer: pag.employer_share },
    tax: { annual_taxable: annualTaxable, annual_tax: tax.annual_tax, monthly_tax: tax.monthly_tax },
    de_minimis: { exempt: deMi.exempt_total, taxable_excess: deMi.taxable_excess },
  };

  // Upsert: preserve manual fields (bonus, reimbursements, cash_advance, loan_payments, other)
  const existing = await Payslip.findOne({ entity_id: entityId, person_id: personId, period, cycle });

  // Preserved manual earnings from existing payslip
  const preservedManual = existing ? {
    bonus: existing.earnings?.bonus || 0,
    reimbursements: existing.earnings?.reimbursements || 0,
    other_earnings: existing.earnings?.other_earnings || 0,
    overtime: existing.earnings?.overtime || 0,
    holiday_pay: existing.earnings?.holiday_pay || 0,
    night_diff: existing.earnings?.night_diff || 0,
    flat_cash_advance: existing.deductions?.cash_advance || 0,
    flat_loan_payments: existing.deductions?.loan_payments || 0,
    flat_other_deductions: existing.deductions?.other_deductions || 0,
  } : {
    bonus: 0, reimbursements: 0, other_earnings: 0,
    overtime: 0, holiday_pay: 0, night_diff: 0,
    flat_cash_advance: 0, flat_loan_payments: 0, flat_other_deductions: 0,
  };

  // Assemble final earnings with preserved manual bits
  earnings.bonus = preservedManual.bonus;
  earnings.reimbursements = preservedManual.reimbursements;
  earnings.other_earnings = preservedManual.other_earnings;
  earnings.overtime = preservedManual.overtime;
  earnings.holiday_pay = preservedManual.holiday_pay;
  earnings.night_diff = preservedManual.night_diff;

  // Build deduction_lines — auto lines rebuilt fresh, manual lines reconstructed
  // from the preserved flat fields. Preserving any already-present user-entered
  // lines (future G1.4 UI) is a superset operation: keep non-auto lines whose
  // deduction_type isn't CASH_ADVANCE/LOAN/OTHER (those are the flat-field path).
  const autoLines = buildAutoDeductionLines({
    stat, personalGas, emitPersonalGas, userId,
  });
  const manualLines = buildManualLinesFromFlat({
    flat: {
      cash_advance: preservedManual.flat_cash_advance,
      loan_payments: preservedManual.flat_loan_payments,
      other_deductions: preservedManual.flat_other_deductions,
    },
    userId,
  });
  const preservedFreeformLines = (existing?.deduction_lines || []).filter(l =>
    !l.auto_source &&
    !['CASH_ADVANCE', 'LOAN', 'OTHER'].includes(l.deduction_type)
  );
  const deduction_lines = [...autoLines, ...manualLines, ...preservedFreeformLines];

  // Derive flat fields from the final lines (keeps JE consumer in sync)
  const deductions = deriveFlatFromLines(deduction_lines);

  if (existing) {
    existing.earnings = earnings;
    existing.deduction_lines = deduction_lines;
    existing.deductions = deductions;
    existing.employer_contributions = employer_contributions;
    existing.person_type = person.person_type;
    existing.comp_profile_snapshot = comp;
    existing.gov_rates_snapshot = gov_rates_snapshot;
    existing.status = 'COMPUTED';
    existing.computed_at = new Date();
    existing.markModified('earnings');
    existing.markModified('deduction_lines');
    existing.markModified('deductions');
    existing.markModified('employer_contributions');
    existing.markModified('comp_profile_snapshot');
    existing.markModified('gov_rates_snapshot');
    await existing.save();
    return existing;
  }

  const payslip = await Payslip.create({
    entity_id: entityId,
    person_id: personId,
    person_type: person.person_type,
    period,
    cycle,
    earnings,
    deduction_lines,
    deductions,
    employer_contributions,
    comp_profile_snapshot: comp,
    gov_rates_snapshot: gov_rates_snapshot,
    status: 'COMPUTED',
    computed_at: new Date(),
    created_by: userId,
  });

  return payslip;
}

/**
 * Generate a BDM payslip — commission-based.
 * BDMs typically get per diem + fuel + commission; government deductions
 * may apply depending on employment type.
 */
async function generateBdmPayslip(entityId, personId, period, cycle, userId) {
  // BDM payslips use the same structure but earnings come from per diem/commission
  // For now, use the same generator with comp profile fields
  return generateEmployeePayslip(entityId, personId, period, cycle, userId);
}

/**
 * Generate a sales rep payslip — hybrid (basic + incentive).
 */
async function generateSalesRepPayslip(entityId, personId, period, cycle, userId) {
  return generateEmployeePayslip(entityId, personId, period, cycle, userId);
}

/**
 * Compute 13th month pay for a person for a given year.
 * Formula: (total basic salary earned in year) / 12
 * Tax-exempt up to ₱90,000.
 */
async function computeThirteenthMonth(entityId, personId, year, userId) {
  const payslips = await Payslip.find({
    entity_id: entityId,
    person_id: personId,
    period: { $regex: `^${year}-` },
    status: { $in: ['COMPUTED', 'REVIEWED', 'APPROVED', 'POSTED'] },
  }).lean();

  let totalBasic = 0;
  for (const ps of payslips) {
    totalBasic += ps.earnings?.basic_salary || 0;
  }

  const thirteenthMonth = Math.round((totalBasic / 12) * 100) / 100;
  const period = `${year}-12`;

  // Upsert a special payslip for December
  const existing = await Payslip.findOne({
    entity_id: entityId,
    person_id: personId,
    period,
    cycle: 'MONTHLY',
  });

  if (existing) {
    existing.earnings.thirteenth_month = thirteenthMonth;
    existing.markModified('earnings');
    await existing.save();
    return existing;
  }

  const person = await PeopleMaster.findById(personId).lean();
  return Payslip.create({
    entity_id: entityId,
    person_id: personId,
    person_type: person?.person_type || 'EMPLOYEE',
    period,
    cycle: 'MONTHLY',
    earnings: { thirteenth_month: thirteenthMonth },
    status: 'COMPUTED',
    computed_at: new Date(),
    created_by: userId,
  });
}

// ────────────────────────────────────────────────────────────────────────────
// Transparent breakdown — mirrors getIncomeBreakdown from incomeCalc.js
// ────────────────────────────────────────────────────────────────────────────

/**
 * Lazy backfill: if a historical POSTED payslip has no deduction_lines but
 * carries flat deductions.*, reconstruct the lines in-memory (no DB write).
 * Lets PayslipView.jsx render the new transparent layout for pre-G1.3 docs.
 *
 * Safe to call on every read — returns an array either way. Never mutates
 * the input doc.
 */
function backfillDeductionLines(payslip) {
  if (payslip?.deduction_lines?.length) return payslip.deduction_lines;
  const d = payslip?.deductions || {};
  const lines = [];
  const now = payslip?.computed_at || payslip?.createdAt || new Date();
  const push = (code, label, amount, auto_source) => {
    if ((amount || 0) > 0) {
      lines.push({
        _id: new mongoose.Types.ObjectId(), // synthetic — for React key only
        deduction_type: code,
        deduction_label: label,
        amount: Math.round(amount * 100) / 100,
        description: '(historical — reconstructed for display)',
        entered_at: now,
        status: 'VERIFIED',
        auto_source: auto_source || null,
      });
    }
  };
  push('SSS', 'SSS (Employee Share)', d.sss_employee, 'SSS');
  push('PHILHEALTH', 'PhilHealth (Employee Share)', d.philhealth_employee, 'PHILHEALTH');
  push('PAGIBIG', 'Pag-IBIG (Employee Share)', d.pagibig_employee, 'PAGIBIG');
  push('WITHHOLDING_TAX', 'Withholding Tax', d.withholding_tax, 'WITHHOLDING_TAX');
  push('CASH_ADVANCE', 'Cash Advance', d.cash_advance, null);
  push('LOAN', 'Loan Payment', d.loan_payments, null);
  push('OTHER', 'Other Deduction', d.other_deductions, null);
  return lines;
}

/**
 * Get detailed breakdown for a payslip — fetches Car Logbook entries for the
 * Personal Gas expandable section. Returns null fields for sources that don't
 * apply to this payslip (e.g. no logbook for office staff).
 *
 * Shape mirrors IncomeReport.getIncomeBreakdown so PayslipView.jsx can render
 * with the same components as Income.jsx / MyIncome.jsx.
 */
async function getPayslipBreakdown(payslip) {
  const personId = payslip.person_id?._id || payslip.person_id;
  const entityId = payslip.entity_id?._id || payslip.entity_id;
  const { period, cycle } = payslip;

  const person = await PeopleMaster.findById(personId).select('user_id full_name').lean();
  const userId = person?.user_id;

  // Personal Gas — only resolve if there's a line with auto_source='PERSONAL_GAS'
  const lines = payslip.deduction_lines?.length
    ? payslip.deduction_lines
    : backfillDeductionLines(payslip);
  const hasPersonalGasLine = lines.some(l => l.auto_source === 'PERSONAL_GAS');

  let personalGasBreakdown = null;
  if (hasPersonalGasLine && userId) {
    const match = {
      entity_id: new mongoose.Types.ObjectId(entityId),
      bdm_id: new mongoose.Types.ObjectId(userId),
      period,
      status: { $in: ['POSTED', 'VALID'] },
    };
    if (cycle && cycle !== 'MONTHLY') match.cycle = cycle;
    const logbookEntries = await CarLogbookEntry.find(match).sort({ entry_date: 1 }).lean();

    const summary = {
      total_km: 0, total_personal_km: 0, total_official_km: 0,
      total_fuel_liters: 0, total_fuel_cost: 0, total_personal_gas: 0,
    };
    const entries = logbookEntries.map(e => {
      summary.total_km += e.total_km || 0;
      summary.total_personal_km += e.personal_km || 0;
      summary.total_official_km += e.official_km || 0;
      const entryFuelLiters = (e.fuel_entries || []).reduce((s, f) => s + (f.liters || 0), 0);
      const entryFuelCost = (e.fuel_entries || []).reduce((s, f) => s + (f.total_amount || 0), 0);
      summary.total_fuel_liters += entryFuelLiters;
      summary.total_fuel_cost += entryFuelCost;
      summary.total_personal_gas += e.personal_gas_amount || 0;
      return {
        _id: e._id,
        entry_date: e.entry_date,
        starting_km: e.starting_km,
        ending_km: e.ending_km,
        total_km: e.total_km || 0,
        personal_km: e.personal_km || 0,
        official_km: e.official_km || 0,
        personal_gas_amount: e.personal_gas_amount || 0,
        total_fuel_amount: entryFuelCost,
        fuel_entries: (e.fuel_entries || []).map(f => ({
          station_name: f.station_name,
          liters: f.liters || 0,
          price_per_liter: f.price_per_liter || 0,
          total_amount: f.total_amount || 0,
          payment_mode: f.payment_mode,
        })),
      };
    });
    summary.total_personal_gas = Math.round(summary.total_personal_gas * 100) / 100;
    summary.total_fuel_cost = Math.round(summary.total_fuel_cost * 100) / 100;
    summary.avg_price_per_liter = summary.total_fuel_liters > 0
      ? Math.round((summary.total_fuel_cost / summary.total_fuel_liters) * 100) / 100
      : 0;

    const lineAmount = lines.find(l => l.auto_source === 'PERSONAL_GAS')?.amount || summary.total_personal_gas;
    personalGasBreakdown = {
      total_deduction: lineAmount,
      entry_count: entries.length,
      entries,
      summary,
    };
  }

  return {
    payslip_id: payslip._id,
    period,
    cycle,
    person_name: person?.full_name || 'N/A',
    personal_gas: personalGasBreakdown,
    // Forward-compat: schedules remains empty until employee DeductionSchedule
    // is wired (Phase G1.4). PayslipView.jsx uses `breakdown?.schedules?.[id]`
    // with optional chaining, so an empty map is safe.
    schedules: {},
  };
}

// Valid workflow transitions
const VALID_TRANSITIONS = {
  review: { from: ['COMPUTED'], to: 'REVIEWED' },
  approve: { from: ['REVIEWED'], to: 'APPROVED' },
  post: { from: ['APPROVED'], to: 'POSTED' },
};

async function transitionPayslipStatus(payslipId, action, userId) {
  const transition = VALID_TRANSITIONS[action];
  if (!transition) throw new Error(`Invalid action: ${action}`);

  const payslip = await Payslip.findById(payslipId);
  if (!payslip) throw new Error('Payslip not found');
  if (!transition.from.includes(payslip.status)) {
    throw new Error(`Cannot ${action} payslip in ${payslip.status} status`);
  }

  payslip.status = transition.to;
  if (action === 'review') { payslip.reviewed_by = userId; payslip.reviewed_at = new Date(); }
  if (action === 'approve') { payslip.approved_by = userId; payslip.approved_at = new Date(); }
  if (action === 'post') { payslip.posted_by = userId; payslip.posted_at = new Date(); }

  await payslip.save();
  return payslip;
}

module.exports = {
  generateEmployeePayslip,
  generateBdmPayslip,
  generateSalesRepPayslip,
  computeThirteenthMonth,
  transitionPayslipStatus,
  // Phase G1.3 — transparent payslip breakdown + lazy backfill helper
  getPayslipBreakdown,
  backfillDeductionLines,
};
