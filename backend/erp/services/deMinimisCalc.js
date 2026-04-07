const GovernmentRates = require('../models/GovernmentRates');

/**
 * Compute de minimis benefit tax treatment.
 * Compares compensation profile allowances against BIR de minimis limits.
 * Amounts within limits are tax-exempt; excess is added to taxable income.
 *
 * @param {object} compProfile — compensation profile with allowance amounts
 * @returns {{ exempt_total: number, taxable_excess: number, breakdown: Array }}
 */
async function computeDeMinimis(compProfile) {
  const rate = await GovernmentRates.getActiveRate('DE_MINIMIS');

  // Map benefit_code → monthly limit (annualized if period is YEARLY)
  const limitMap = {};
  if (rate?.benefit_limits) {
    for (const bl of rate.benefit_limits) {
      const monthlyLimit = bl.limit_period === 'YEARLY'
        ? bl.limit_amount / 12
        : bl.limit_amount;
      limitMap[bl.benefit_code] = monthlyLimit;
    }
  }

  // Map comp profile fields to benefit codes
  const benefits = [
    { code: 'RICE', field: 'rice_allowance', label: 'Rice Allowance' },
    { code: 'CLOTHING', field: 'clothing_allowance', label: 'Clothing Allowance' },
    { code: 'MEDICAL', field: 'medical_allowance', label: 'Medical Allowance' },
    { code: 'LAUNDRY', field: 'laundry_allowance', label: 'Laundry Allowance' },
  ];

  let exempt_total = 0;
  let taxable_excess = 0;
  const breakdown = [];

  for (const b of benefits) {
    const amount = compProfile[b.field] || 0;
    const limit = limitMap[b.code] || 0;
    const exempt = Math.min(amount, limit);
    const excess = Math.max(0, amount - limit);

    exempt_total += exempt;
    taxable_excess += excess;
    breakdown.push({
      code: b.code,
      label: b.label,
      amount,
      limit,
      exempt,
      excess,
    });
  }

  return {
    exempt_total: Math.round(exempt_total * 100) / 100,
    taxable_excess: Math.round(taxable_excess * 100) / 100,
    breakdown,
  };
}

module.exports = { computeDeMinimis };
