const GovernmentRates = require('../models/GovernmentRates');

/**
 * Compute PhilHealth contributions given monthly salary.
 * Flat rate (5%) with floor/ceiling, 50/50 employee-employer split.
 * @param {number} monthlySalary
 * @returns {{ employee_share: number, employer_share: number, total: number }}
 */
async function computePhilHealth(monthlySalary) {
  const rate = await GovernmentRates.getActiveRate('PHILHEALTH');
  if (!rate) {
    throw new Error('No active PhilHealth rate found');
  }

  const flatRate = rate.flat_rate || 0.05;
  const empSplit = rate.employee_split || 0.5;
  const erSplit = rate.employer_split || 0.5;
  const minContrib = rate.min_contribution || 500;
  const maxContrib = rate.max_contribution || 5000;

  const rawContribution = monthlySalary * flatRate;
  const total = Math.max(minContrib, Math.min(maxContrib, rawContribution));
  const employee_share = Math.round(total * empSplit * 100) / 100;
  const employer_share = Math.round(total * erSplit * 100) / 100;

  return { employee_share, employer_share, total: Math.round(total * 100) / 100 };
}

module.exports = { computePhilHealth };
