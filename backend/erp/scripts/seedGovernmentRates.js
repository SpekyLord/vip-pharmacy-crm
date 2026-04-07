/**
 * Seed script for Government Rates (Philippine mandatories)
 * Seeds: SSS, PhilHealth, PagIBIG, BIR Withholding Tax, De Minimis
 * Based on 2025-2026 schedules (RA 11199, RA 11223, RA 9679, TRAIN Law)
 * Idempotent — upserts by rate_type + effective_date
 *
 * Usage: node backend/erp/scripts/seedGovernmentRates.js
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const connectDB = require('../../config/db');
const GovernmentRates = require('../models/GovernmentRates');

const effectiveDate = new Date('2025-01-01');

const seedGovernmentRates = async () => {
  await connectDB();

  // --- SSS (RA 11199 schedule, 2025) ---
  await GovernmentRates.findOneAndUpdate(
    { rate_type: 'SSS', effective_date: effectiveDate },
    {
      rate_type: 'SSS',
      effective_date: effectiveDate,
      expiry_date: null,
      notes: 'RA 11199 SSS contribution schedule 2025',
      brackets: [
        { min_salary: 0, max_salary: 4250, employee_share: 180, employer_share: 380, ec: 10 },
        { min_salary: 4250, max_salary: 4750, employee_share: 202.50, employer_share: 427.50, ec: 10 },
        { min_salary: 4750, max_salary: 5250, employee_share: 225, employer_share: 475, ec: 10 },
        { min_salary: 5250, max_salary: 5750, employee_share: 247.50, employer_share: 522.50, ec: 10 },
        { min_salary: 5750, max_salary: 6250, employee_share: 270, employer_share: 570, ec: 10 },
        { min_salary: 6250, max_salary: 6750, employee_share: 292.50, employer_share: 617.50, ec: 10 },
        { min_salary: 6750, max_salary: 7250, employee_share: 315, employer_share: 665, ec: 10 },
        { min_salary: 7250, max_salary: 7750, employee_share: 337.50, employer_share: 712.50, ec: 10 },
        { min_salary: 7750, max_salary: 8250, employee_share: 360, employer_share: 760, ec: 10 },
        { min_salary: 8250, max_salary: 8750, employee_share: 382.50, employer_share: 807.50, ec: 10 },
        { min_salary: 8750, max_salary: 9250, employee_share: 405, employer_share: 855, ec: 10 },
        { min_salary: 9250, max_salary: 9750, employee_share: 427.50, employer_share: 902.50, ec: 10 },
        { min_salary: 9750, max_salary: 10250, employee_share: 450, employer_share: 950, ec: 10 },
        { min_salary: 10250, max_salary: 10750, employee_share: 472.50, employer_share: 997.50, ec: 10 },
        { min_salary: 10750, max_salary: 11250, employee_share: 495, employer_share: 1045, ec: 10 },
        { min_salary: 11250, max_salary: 11750, employee_share: 517.50, employer_share: 1092.50, ec: 10 },
        { min_salary: 11750, max_salary: 12250, employee_share: 540, employer_share: 1140, ec: 10 },
        { min_salary: 12250, max_salary: 12750, employee_share: 562.50, employer_share: 1187.50, ec: 10 },
        { min_salary: 12750, max_salary: 13250, employee_share: 585, employer_share: 1235, ec: 10 },
        { min_salary: 13250, max_salary: 13750, employee_share: 607.50, employer_share: 1282.50, ec: 10 },
        { min_salary: 13750, max_salary: 14250, employee_share: 630, employer_share: 1330, ec: 10 },
        { min_salary: 14250, max_salary: 14750, employee_share: 652.50, employer_share: 1377.50, ec: 30 },
        { min_salary: 14750, max_salary: 15250, employee_share: 675, employer_share: 1425, ec: 30 },
        { min_salary: 15250, max_salary: 15750, employee_share: 697.50, employer_share: 1472.50, ec: 30 },
        { min_salary: 15750, max_salary: 16250, employee_share: 720, employer_share: 1520, ec: 30 },
        { min_salary: 16250, max_salary: 16750, employee_share: 742.50, employer_share: 1567.50, ec: 30 },
        { min_salary: 16750, max_salary: 17250, employee_share: 765, employer_share: 1615, ec: 30 },
        { min_salary: 17250, max_salary: 17750, employee_share: 787.50, employer_share: 1662.50, ec: 30 },
        { min_salary: 17750, max_salary: 18250, employee_share: 810, employer_share: 1710, ec: 30 },
        { min_salary: 18250, max_salary: 18750, employee_share: 832.50, employer_share: 1757.50, ec: 30 },
        { min_salary: 18750, max_salary: 19250, employee_share: 855, employer_share: 1805, ec: 30 },
        { min_salary: 19250, max_salary: 19750, employee_share: 877.50, employer_share: 1852.50, ec: 30 },
        { min_salary: 19750, max_salary: 20250, employee_share: 900, employer_share: 1900, ec: 30 },
        { min_salary: 20250, max_salary: 24750, employee_share: 1012.50, employer_share: 2137.50, ec: 30 },
        { min_salary: 24750, max_salary: 29250, employee_share: 1215, employer_share: 2565, ec: 30 },
        { min_salary: 29250, max_salary: null, employee_share: 1350, employer_share: 2850, ec: 30 }
      ]
    },
    { upsert: true, new: true }
  );
  console.log('✓ SSS brackets seeded (36 brackets)');

  // --- PhilHealth (RA 11223, 5% premium rate, 2025) ---
  await GovernmentRates.findOneAndUpdate(
    { rate_type: 'PHILHEALTH', effective_date: effectiveDate },
    {
      rate_type: 'PHILHEALTH',
      effective_date: effectiveDate,
      expiry_date: null,
      flat_rate: 0.05,
      employee_split: 0.50,
      employer_split: 0.50,
      min_contribution: 500, // Floor: ₱10,000 salary × 5% = ₱500
      max_contribution: 5000, // Ceiling: ₱100,000 salary × 5% = ₱5,000
      notes: 'RA 11223 Universal Health Care Act, 5% premium rate 2025'
    },
    { upsert: true, new: true }
  );
  console.log('✓ PhilHealth rate seeded (5%, floor ₱500, ceiling ₱5,000)');

  // --- PagIBIG (RA 9679, Pag-IBIG Fund) ---
  await GovernmentRates.findOneAndUpdate(
    { rate_type: 'PAGIBIG', effective_date: effectiveDate },
    {
      rate_type: 'PAGIBIG',
      effective_date: effectiveDate,
      expiry_date: null,
      brackets: [
        { min_salary: 0, max_salary: 1500, employee_share: 0.01, employer_share: 0.02, ec: 0 },
        { min_salary: 1500, max_salary: null, employee_share: 0.02, employer_share: 0.02, ec: 0 }
      ],
      max_contribution: 200, // Max MSC ₱5,000 × 2% = ₱100 employee + ₱100 employer
      notes: 'RA 9679 Pag-IBIG, max MSC ₱5,000'
    },
    { upsert: true, new: true }
  );
  console.log('✓ PagIBIG rate seeded (1-2% employee, 2% employer, max MSC ₱5,000)');

  // --- BIR Withholding Tax (TRAIN Law graduated rates) ---
  await GovernmentRates.findOneAndUpdate(
    { rate_type: 'WITHHOLDING_TAX', effective_date: effectiveDate },
    {
      rate_type: 'WITHHOLDING_TAX',
      effective_date: effectiveDate,
      expiry_date: null,
      brackets: [
        { min_salary: 0, max_salary: 250000, employee_share: 0, employer_share: 0, ec: 0 },
        { min_salary: 250000, max_salary: 400000, employee_share: 0.15, employer_share: 0, ec: 0 },
        { min_salary: 400000, max_salary: 800000, employee_share: 0.20, employer_share: 22500, ec: 0 },
        { min_salary: 800000, max_salary: 2000000, employee_share: 0.25, employer_share: 102500, ec: 0 },
        { min_salary: 2000000, max_salary: 8000000, employee_share: 0.30, employer_share: 402500, ec: 0 },
        { min_salary: 8000000, max_salary: null, employee_share: 0.35, employer_share: 2202500, ec: 0 }
      ],
      notes: 'TRAIN Law (RA 10963) graduated withholding tax brackets (annual). employee_share=marginal rate, employer_share=base tax amount for bracket'
    },
    { upsert: true, new: true }
  );
  console.log('✓ BIR Withholding Tax brackets seeded (TRAIN Law, 6 brackets)');

  // --- De Minimis Benefits (BIR Revenue Regulations) ---
  await GovernmentRates.findOneAndUpdate(
    { rate_type: 'DE_MINIMIS', effective_date: effectiveDate },
    {
      rate_type: 'DE_MINIMIS',
      effective_date: effectiveDate,
      expiry_date: null,
      benefit_limits: [
        { benefit_code: 'RICE', description: 'Rice subsidy', limit_amount: 2000, limit_period: 'MONTHLY' },
        { benefit_code: 'CLOTHING', description: 'Uniform/clothing allowance', limit_amount: 6000, limit_period: 'YEARLY' },
        { benefit_code: 'MEDICAL', description: 'Medical cash allowance', limit_amount: 1500, limit_period: 'MONTHLY' },
        { benefit_code: 'LAUNDRY', description: 'Laundry allowance', limit_amount: 300, limit_period: 'MONTHLY' },
        { benefit_code: 'ACHIEVEMENT', description: 'Achievement awards (tangible)', limit_amount: 10000, limit_period: 'YEARLY' }
      ],
      notes: 'BIR de minimis benefits — amounts within limits are tax-exempt, excess added to taxable income'
    },
    { upsert: true, new: true }
  );
  console.log('✓ De Minimis benefit limits seeded (5 benefit types)');

  console.log('\nGovernment rates seed complete.');
};

if (require.main === module) {
  seedGovernmentRates()
    .then(() => mongoose.disconnect())
    .catch(err => {
      console.error('Seed error:', err);
      mongoose.disconnect();
      process.exit(1);
    });
}

module.exports = seedGovernmentRates;
