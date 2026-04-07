const GovernmentRates = require('../models/GovernmentRates');

/**
 * Compute withholding tax using TRAIN Law graduated brackets.
 * Input: annual taxable income (gross - SSS - PhilHealth - PagIBIG).
 *
 * Bracket structure from GovernmentRates:
 *   min_salary = bracket floor (annual)
 *   max_salary = bracket ceiling or null
 *   employer_share = base tax for this bracket
 *   employee_share = marginal rate (e.g. 0.20 for 20%)
 *
 * @param {number} annualTaxableIncome
 * @returns {{ annual_tax: number, monthly_tax: number }}
 */
async function computeWithholdingTax(annualTaxableIncome) {
  const rate = await GovernmentRates.getActiveRate('WITHHOLDING_TAX');
  if (!rate || !rate.brackets?.length) {
    throw new Error('No active withholding tax rate table found');
  }

  if (annualTaxableIncome <= 0) {
    return { annual_tax: 0, monthly_tax: 0 };
  }

  // Find matching bracket (brackets sorted by min_salary ascending)
  let bracket = rate.brackets[0];
  for (const b of rate.brackets) {
    if (annualTaxableIncome >= b.min_salary) {
      bracket = b;
    } else {
      break;
    }
  }

  const baseTax = bracket.employer_share || 0; // base tax for bracket
  const marginalRate = bracket.employee_share || 0; // marginal rate
  const excessOverFloor = Math.max(0, annualTaxableIncome - bracket.min_salary);

  const annual_tax = Math.round((baseTax + (excessOverFloor * marginalRate)) * 100) / 100;
  const monthly_tax = Math.round((annual_tax / 12) * 100) / 100;

  return { annual_tax, monthly_tax };
}

module.exports = { computeWithholdingTax };
