const GovernmentRates = require('../models/GovernmentRates');

/**
 * Compute SSS contributions given monthly salary.
 * Looks up bracket from GovernmentRates SSS table.
 * @param {number} monthlySalary
 * @returns {{ employee_share: number, employer_share: number, ec: number }}
 */
async function computeSSS(monthlySalary) {
  const rate = await GovernmentRates.getActiveRate('SSS');
  if (!rate || !rate.brackets?.length) {
    throw new Error('No active SSS rate table found');
  }

  // Find matching bracket
  const bracket = rate.brackets.find(
    (b) => monthlySalary >= b.min_salary && (b.max_salary == null || monthlySalary <= b.max_salary)
  );

  if (!bracket) {
    // Use highest bracket if salary exceeds all
    const last = rate.brackets[rate.brackets.length - 1];
    return {
      employee_share: last.employee_share || 0,
      employer_share: last.employer_share || 0,
      ec: last.ec || 0,
    };
  }

  return {
    employee_share: bracket.employee_share || 0,
    employer_share: bracket.employer_share || 0,
    ec: bracket.ec || 0,
  };
}

module.exports = { computeSSS };
