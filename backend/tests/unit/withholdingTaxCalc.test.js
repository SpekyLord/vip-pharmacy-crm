/**
 * Withholding Tax Calculator — Unit Tests
 * Tests against Philippine TRAIN Law 2025-2026 brackets.
 *
 * Bracket structure (from GovernmentRates model):
 *   min_salary = bracket floor (annual)
 *   max_salary = bracket ceiling or null
 *   employer_share = base tax for bracket
 *   employee_share = marginal rate (decimal)
 */

// Mock GovernmentRates.getActiveRate before requiring the calc
const TRAIN_BRACKETS = [
  { min_salary: 0, max_salary: 250000, employee_share: 0, employer_share: 0, ec: 0 },
  { min_salary: 250000, max_salary: 400000, employee_share: 0.15, employer_share: 0, ec: 0 },
  { min_salary: 400000, max_salary: 800000, employee_share: 0.20, employer_share: 22500, ec: 0 },
  { min_salary: 800000, max_salary: 2000000, employee_share: 0.25, employer_share: 102500, ec: 0 },
  { min_salary: 2000000, max_salary: 8000000, employee_share: 0.30, employer_share: 402500, ec: 0 },
  { min_salary: 8000000, max_salary: null, employee_share: 0.35, employer_share: 2202500, ec: 0 },
];

jest.mock('../../erp/models/GovernmentRates', () => ({
  getActiveRate: jest.fn().mockResolvedValue({ brackets: TRAIN_BRACKETS })
}));

const { computeWithholdingTax } = require('../../erp/services/withholdingTaxCalc');

describe('Withholding Tax Calculator (TRAIN Law)', () => {
  test('0 income → 0 tax', async () => {
    const result = await computeWithholdingTax(0);
    expect(result.annual_tax).toBe(0);
    expect(result.monthly_tax).toBe(0);
  });

  test('negative income → 0 tax', async () => {
    const result = await computeWithholdingTax(-50000);
    expect(result.annual_tax).toBe(0);
    expect(result.monthly_tax).toBe(0);
  });

  test('250,000 (exactly at first bracket ceiling) → 0 tax', async () => {
    const result = await computeWithholdingTax(250000);
    expect(result.annual_tax).toBe(0);
    expect(result.monthly_tax).toBe(0);
  });

  test('250,001 → minimal tax at 15%', async () => {
    const result = await computeWithholdingTax(250001);
    // 0 + (250001 - 250000) * 0.15 = 0.15
    expect(result.annual_tax).toBeCloseTo(0.15, 2);
  });

  test('400,000 → base 0 + (400000-250000)*0.15 = 22,500', async () => {
    const result = await computeWithholdingTax(400000);
    // bracket: 250K, rate 0.15, base 0
    // excess = 400000 - 250000 = 150000
    // tax = 0 + 150000 * 0.15 = 22500
    expect(result.annual_tax).toBe(22500);
    expect(result.monthly_tax).toBeCloseTo(1875, 2);
  });

  test('500,000 → base 22500 + (500000-400000)*0.20 = 42,500', async () => {
    const result = await computeWithholdingTax(500000);
    expect(result.annual_tax).toBe(42500);
  });

  test('800,000 → base 22500 + (800000-400000)*0.20 = 102,500', async () => {
    const result = await computeWithholdingTax(800000);
    expect(result.annual_tax).toBe(102500);
    expect(result.monthly_tax).toBeCloseTo(8541.67, 1);
  });

  test('2,000,000 → base 102500 + (2M-800K)*0.25 = 402,500', async () => {
    const result = await computeWithholdingTax(2000000);
    expect(result.annual_tax).toBe(402500);
  });

  test('8,000,000 → base 402500 + (8M-2M)*0.30 = 2,202,500', async () => {
    const result = await computeWithholdingTax(8000000);
    expect(result.annual_tax).toBe(2202500);
  });

  test('10,000,000 → base 2202500 + (10M-8M)*0.35 = 2,902,500', async () => {
    const result = await computeWithholdingTax(10000000);
    expect(result.annual_tax).toBe(2902500);
    expect(result.monthly_tax).toBeCloseTo(241875, 1);
  });

  test('monthly tax = annual / 12, rounded to 2 decimals', async () => {
    const result = await computeWithholdingTax(300000);
    // excess = 300000 - 250000 = 50000
    // annual = 0 + 50000 * 0.15 = 7500
    // monthly = 7500 / 12 = 625
    expect(result.annual_tax).toBe(7500);
    expect(result.monthly_tax).toBe(625);
  });

  test('throws if no active rate table', async () => {
    const GovernmentRates = require('../../erp/models/GovernmentRates');
    GovernmentRates.getActiveRate.mockResolvedValueOnce(null);
    await expect(computeWithholdingTax(500000)).rejects.toThrow('No active withholding tax rate table found');
  });
});
