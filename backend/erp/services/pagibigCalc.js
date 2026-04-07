const GovernmentRates = require('../models/GovernmentRates');

/**
 * Compute PagIBIG (HDMF) contributions given monthly salary.
 * Two brackets: ≤₱1,500 (1% emp, 2% empl) and >₱1,500 (2% both).
 * Max Monthly Salary Credit ₱5,000 → max contribution ₱100 each side.
 * @param {number} monthlySalary
 * @returns {{ employee_share: number, employer_share: number }}
 */
async function computePagIBIG(monthlySalary) {
  const rate = await GovernmentRates.getActiveRate('PAGIBIG');
  if (!rate) {
    throw new Error('No active PagIBIG rate found');
  }

  // max_contribution in DB is the total max (e.g. 200 = ₱100 each side).
  // The actual Monthly Salary Credit (MSC) cap is ₱5,000.
  const MSC_CAP = 5000;
  const salary = Math.min(monthlySalary, MSC_CAP);
  const maxPerSide = rate.max_contribution ? rate.max_contribution / 2 : 100;

  let employee_share, employer_share;

  if (rate.brackets?.length) {
    // Bracket-based
    const bracket = rate.brackets.find(
      (b) => monthlySalary >= b.min_salary && (b.max_salary == null || monthlySalary <= b.max_salary)
    ) || rate.brackets[rate.brackets.length - 1];

    employee_share = Math.round(Math.min(salary * (bracket.employee_share || 0.02), maxPerSide) * 100) / 100;
    employer_share = Math.round(Math.min(salary * (bracket.employer_share || 0.02), maxPerSide) * 100) / 100;
  } else {
    // Flat-rate fallback
    const empRate = monthlySalary <= 1500 ? 0.01 : 0.02;
    const erRate = 0.02;
    employee_share = Math.round(Math.min(salary * empRate, maxPerSide) * 100) / 100;
    employer_share = Math.round(Math.min(salary * erRate, maxPerSide) * 100) / 100;
  }

  return { employee_share, employer_share };
}

module.exports = { computePagIBIG };
