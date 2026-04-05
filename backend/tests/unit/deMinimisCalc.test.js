/**
 * De Minimis Benefits Calculator — Unit Tests
 * Tests Philippine BIR de minimis limits.
 */

const BENEFIT_LIMITS = [
  { benefit_code: 'RICE', description: 'Rice Subsidy', limit_amount: 2000, limit_period: 'MONTHLY' },
  { benefit_code: 'CLOTHING', description: 'Clothing Allowance', limit_amount: 6000, limit_period: 'YEARLY' },
  { benefit_code: 'MEDICAL', description: 'Medical Cash Allowance', limit_amount: 10000, limit_period: 'YEARLY' },
  { benefit_code: 'LAUNDRY', description: 'Laundry Allowance', limit_amount: 300, limit_period: 'MONTHLY' },
];

jest.mock('../../erp/models/GovernmentRates', () => ({
  getActiveRate: jest.fn().mockResolvedValue({ benefit_limits: BENEFIT_LIMITS })
}));

const { computeDeMinimis } = require('../../erp/services/deMinimisCalc');

describe('De Minimis Calculator', () => {
  test('all zero allowances → zero exempt, zero taxable', async () => {
    const result = await computeDeMinimis({});
    expect(result.exempt_total).toBe(0);
    expect(result.taxable_excess).toBe(0);
    expect(result.breakdown).toHaveLength(4);
  });

  test('all allowances within limits → all exempt', async () => {
    const result = await computeDeMinimis({
      rice_allowance: 1500,
      clothing_allowance: 400, // 6000/12 = 500/month limit
      medical_allowance: 700, // 10000/12 ≈ 833.33/month limit
      laundry_allowance: 200,
    });
    expect(result.exempt_total).toBe(2800);
    expect(result.taxable_excess).toBe(0);
  });

  test('rice exceeding limit → excess is taxable', async () => {
    const result = await computeDeMinimis({
      rice_allowance: 2500, // limit 2000
      clothing_allowance: 0,
      medical_allowance: 0,
      laundry_allowance: 0,
    });
    const riceBD = result.breakdown.find(b => b.code === 'RICE');
    expect(riceBD.exempt).toBe(2000);
    expect(riceBD.excess).toBe(500);
    expect(result.exempt_total).toBe(2000);
    expect(result.taxable_excess).toBe(500);
  });

  test('clothing yearly limit converted to monthly (6000/12 = 500)', async () => {
    const result = await computeDeMinimis({
      rice_allowance: 0,
      clothing_allowance: 600, // exceeds 500 monthly limit
      medical_allowance: 0,
      laundry_allowance: 0,
    });
    const clothBD = result.breakdown.find(b => b.code === 'CLOTHING');
    expect(clothBD.limit).toBe(500);
    expect(clothBD.exempt).toBe(500);
    expect(clothBD.excess).toBe(100);
  });

  test('medical yearly limit converted to monthly (10000/12 ≈ 833.33)', async () => {
    const result = await computeDeMinimis({
      rice_allowance: 0,
      clothing_allowance: 0,
      medical_allowance: 900, // exceeds 833.33
      laundry_allowance: 0,
    });
    const medBD = result.breakdown.find(b => b.code === 'MEDICAL');
    expect(medBD.limit).toBeCloseTo(833.33, 1);
    expect(medBD.exempt).toBeCloseTo(833.33, 1);
    expect(medBD.excess).toBeCloseTo(66.67, 0);
  });

  test('laundry at exact limit → 0 excess', async () => {
    const result = await computeDeMinimis({
      rice_allowance: 0,
      clothing_allowance: 0,
      medical_allowance: 0,
      laundry_allowance: 300,
    });
    const laundryBD = result.breakdown.find(b => b.code === 'LAUNDRY');
    expect(laundryBD.exempt).toBe(300);
    expect(laundryBD.excess).toBe(0);
  });

  test('all exceeding → proper totals', async () => {
    const result = await computeDeMinimis({
      rice_allowance: 3000, // excess 1000
      clothing_allowance: 1000, // excess 500
      medical_allowance: 1500, // excess ≈ 666.67
      laundry_allowance: 500, // excess 200
    });
    expect(result.taxable_excess).toBeGreaterThan(0);
    expect(result.exempt_total).toBeGreaterThan(0);
    expect(result.exempt_total + result.taxable_excess).toBeCloseTo(6000, 0);
  });

  test('handles no active rate table gracefully (all amounts → 0 exempt)', async () => {
    const GovernmentRates = require('../../erp/models/GovernmentRates');
    GovernmentRates.getActiveRate.mockResolvedValueOnce(null);
    const result = await computeDeMinimis({ rice_allowance: 1000 });
    // With no limits, everything has limit 0 → all taxable
    expect(result.exempt_total).toBe(0);
    expect(result.taxable_excess).toBe(1000);
  });
});
