const PeopleMaster = require('../models/PeopleMaster');
const CompProfile = require('../models/CompProfile');
const Payslip = require('../models/Payslip');
const { computeSSS } = require('./sssCalc');
const { computePhilHealth } = require('./philhealthCalc');
const { computePagIBIG } = require('./pagibigCalc');
const { computeWithholdingTax } = require('./withholdingTaxCalc');
const { computeDeMinimis } = require('./deMinimisCalc');

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

  const deductions = {
    sss_employee: Math.round((sss.employee_share / divisor) * 100) / 100,
    philhealth_employee: Math.round((ph.employee_share / divisor) * 100) / 100,
    pagibig_employee: Math.round((pag.employee_share / divisor) * 100) / 100,
    withholding_tax: Math.round((tax.monthly_tax / divisor) * 100) / 100,
  };

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

  if (existing) {
    // Preserve manual fields
    earnings.bonus = existing.earnings?.bonus || 0;
    earnings.reimbursements = existing.earnings?.reimbursements || 0;
    earnings.other_earnings = existing.earnings?.other_earnings || 0;
    earnings.overtime = existing.earnings?.overtime || 0;
    earnings.holiday_pay = existing.earnings?.holiday_pay || 0;
    earnings.night_diff = existing.earnings?.night_diff || 0;
    deductions.cash_advance = existing.deductions?.cash_advance || 0;
    deductions.loan_payments = existing.deductions?.loan_payments || 0;
    deductions.other_deductions = existing.deductions?.other_deductions || 0;

    existing.earnings = earnings;
    existing.deductions = deductions;
    existing.employer_contributions = employer_contributions;
    existing.person_type = person.person_type;
    existing.comp_profile_snapshot = comp;
    existing.gov_rates_snapshot = gov_rates_snapshot;
    existing.status = 'COMPUTED';
    existing.computed_at = new Date();
    existing.markModified('earnings');
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
};
