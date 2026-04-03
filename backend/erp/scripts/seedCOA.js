/**
 * Seed Chart of Accounts — full account range per entity
 *
 * Account codes follow PRD v5 §11.1 (1000-8200).
 * Idempotent: uses updateOne with upsert per entity + account_code.
 *
 * Usage: node backend/erp/scripts/seedCOA.js
 */
const path = require('path');
if (require.main === module) {
  require('dotenv').config({ path: path.join(__dirname, '../../.env') });
}
const mongoose = require('mongoose');
const connectDB = require('../../config/db');
const ChartOfAccounts = require('../models/ChartOfAccounts');
const Entity = require('../models/Entity');

// ═══ Full COA Template ═══
const COA_TEMPLATE = [
  // ──── 1000-1014: Cash & Bank (ASSET) ────
  { account_code: '1000', account_name: 'Cash on Hand', account_type: 'ASSET', account_subtype: 'Cash', normal_balance: 'DEBIT' },
  { account_code: '1010', account_name: 'RCBC Savings', account_type: 'ASSET', account_subtype: 'Bank', normal_balance: 'DEBIT' },
  { account_code: '1011', account_name: 'Security Bank', account_type: 'ASSET', account_subtype: 'Bank', normal_balance: 'DEBIT' },
  { account_code: '1012', account_name: 'Metrobank', account_type: 'ASSET', account_subtype: 'Bank', normal_balance: 'DEBIT' },
  { account_code: '1013', account_name: 'UnionBank', account_type: 'ASSET', account_subtype: 'Bank', normal_balance: 'DEBIT' },
  { account_code: '1014', account_name: 'BPI', account_type: 'ASSET', account_subtype: 'Bank', normal_balance: 'DEBIT' },
  { account_code: '1015', account_name: 'GCash', account_type: 'ASSET', account_subtype: 'E-Wallet', normal_balance: 'DEBIT' },

  // ──── 1100-1220: Receivables (ASSET) ────
  { account_code: '1100', account_name: 'Accounts Receivable — Trade', account_type: 'ASSET', account_subtype: 'Receivable', normal_balance: 'DEBIT' },
  { account_code: '1110', account_name: 'AR — BDM Advances', account_type: 'ASSET', account_subtype: 'Receivable', normal_balance: 'DEBIT' },
  { account_code: '1200', account_name: 'Inventory', account_type: 'ASSET', account_subtype: 'Inventory', normal_balance: 'DEBIT' },
  { account_code: '1210', account_name: 'Input VAT', account_type: 'ASSET', account_subtype: 'Tax Receivable', normal_balance: 'DEBIT' },
  { account_code: '1220', account_name: 'CWT Receivable', account_type: 'ASSET', account_subtype: 'Tax Receivable', normal_balance: 'DEBIT' },

  // ──── 1300: Fixed Assets (ASSET) ────
  { account_code: '1300', account_name: 'Property, Plant & Equipment', account_type: 'ASSET', account_subtype: 'Fixed Asset', normal_balance: 'DEBIT' },
  { account_code: '1310', account_name: 'Office Equipment', account_type: 'ASSET', account_subtype: 'Fixed Asset', normal_balance: 'DEBIT' },
  { account_code: '1320', account_name: 'Vehicles', account_type: 'ASSET', account_subtype: 'Fixed Asset', normal_balance: 'DEBIT' },
  { account_code: '1350', account_name: 'Accumulated Depreciation', account_type: 'ASSET', account_subtype: 'Contra Asset', normal_balance: 'CREDIT' },

  // ──── 2000-2400: Liabilities ────
  { account_code: '2000', account_name: 'Accounts Payable — Trade', account_type: 'LIABILITY', account_subtype: 'AP', normal_balance: 'CREDIT' },
  { account_code: '2100', account_name: 'Output VAT', account_type: 'LIABILITY', account_subtype: 'Tax Payable', normal_balance: 'CREDIT' },
  { account_code: '2200', account_name: 'SSS Payable', account_type: 'LIABILITY', account_subtype: 'Gov Payable', normal_balance: 'CREDIT' },
  { account_code: '2210', account_name: 'PhilHealth Payable', account_type: 'LIABILITY', account_subtype: 'Gov Payable', normal_balance: 'CREDIT' },
  { account_code: '2220', account_name: 'Pag-IBIG Payable', account_type: 'LIABILITY', account_subtype: 'Gov Payable', normal_balance: 'CREDIT' },
  { account_code: '2230', account_name: 'Withholding Tax Payable', account_type: 'LIABILITY', account_subtype: 'Tax Payable', normal_balance: 'CREDIT' },
  { account_code: '2300', account_name: 'Loans Payable', account_type: 'LIABILITY', account_subtype: 'Loan', normal_balance: 'CREDIT' },
  { account_code: '2301', account_name: 'BPI Credit Card Payable', account_type: 'LIABILITY', account_subtype: 'CC Payable', normal_balance: 'CREDIT' },
  { account_code: '2302', account_name: 'Shell Fleet Card Payable', account_type: 'LIABILITY', account_subtype: 'CC Payable', normal_balance: 'CREDIT' },
  { account_code: '2400', account_name: 'Other Payables', account_type: 'LIABILITY', account_subtype: 'Other', normal_balance: 'CREDIT' },

  // ──── 3000-3200: Equity ────
  { account_code: '3000', account_name: 'Owner Capital', account_type: 'EQUITY', account_subtype: 'Capital', normal_balance: 'CREDIT' },
  { account_code: '3100', account_name: 'Owner Drawings', account_type: 'EQUITY', account_subtype: 'Drawings', normal_balance: 'DEBIT' },
  { account_code: '3200', account_name: 'Retained Earnings', account_type: 'EQUITY', account_subtype: 'Retained', normal_balance: 'CREDIT' },

  // ──── 4000-4200: Revenue ────
  { account_code: '4000', account_name: 'Sales Revenue — Vatable', account_type: 'REVENUE', account_subtype: 'Sales', normal_balance: 'CREDIT' },
  { account_code: '4100', account_name: 'Sales Revenue — VAT Exempt', account_type: 'REVENUE', account_subtype: 'Sales', normal_balance: 'CREDIT' },
  { account_code: '4200', account_name: 'Other Income', account_type: 'REVENUE', account_subtype: 'Other', normal_balance: 'CREDIT' },

  // ──── 5000-5300: Cost of Sales ────
  { account_code: '5000', account_name: 'Cost of Goods Sold', account_type: 'EXPENSE', account_subtype: 'COGS', normal_balance: 'DEBIT' },
  { account_code: '5100', account_name: 'BDM Commission', account_type: 'EXPENSE', account_subtype: 'COGS', normal_balance: 'DEBIT' },
  { account_code: '5200', account_name: 'Profit Share / Partner Rebate', account_type: 'EXPENSE', account_subtype: 'COGS', normal_balance: 'DEBIT' },
  { account_code: '5300', account_name: "Partners' Insurance", account_type: 'EXPENSE', account_subtype: 'COGS', normal_balance: 'DEBIT' },

  // ──── 6000-6900: Operating Expenses ────
  { account_code: '6000', account_name: 'Salaries & Wages', account_type: 'EXPENSE', account_subtype: 'OpEx', normal_balance: 'DEBIT' },
  { account_code: '6050', account_name: 'Allowances', account_type: 'EXPENSE', account_subtype: 'OpEx', normal_balance: 'DEBIT' },
  { account_code: '6100', account_name: 'Per Diem Expense', account_type: 'EXPENSE', account_subtype: 'OpEx', normal_balance: 'DEBIT' },
  { account_code: '6150', account_name: 'Transport Expense', account_type: 'EXPENSE', account_subtype: 'OpEx', normal_balance: 'DEBIT' },
  { account_code: '6200', account_name: 'Fuel & Gas', account_type: 'EXPENSE', account_subtype: 'OpEx', normal_balance: 'DEBIT' },
  { account_code: '6250', account_name: 'Vehicle Maintenance', account_type: 'EXPENSE', account_subtype: 'OpEx', normal_balance: 'DEBIT' },
  { account_code: '6300', account_name: 'Marketing Expense', account_type: 'EXPENSE', account_subtype: 'OpEx', normal_balance: 'DEBIT' },
  { account_code: '6350', account_name: 'ACCESS Expense', account_type: 'EXPENSE', account_subtype: 'OpEx', normal_balance: 'DEBIT' },
  { account_code: '6400', account_name: 'Office Supplies', account_type: 'EXPENSE', account_subtype: 'OpEx', normal_balance: 'DEBIT' },
  { account_code: '6450', account_name: 'Rent Expense', account_type: 'EXPENSE', account_subtype: 'OpEx', normal_balance: 'DEBIT' },
  { account_code: '6500', account_name: 'Courier & Delivery', account_type: 'EXPENSE', account_subtype: 'OpEx', normal_balance: 'DEBIT' },
  { account_code: '6600', account_name: 'Parking & Tolls', account_type: 'EXPENSE', account_subtype: 'OpEx', normal_balance: 'DEBIT' },
  { account_code: '6700', account_name: 'Communication Expense', account_type: 'EXPENSE', account_subtype: 'OpEx', normal_balance: 'DEBIT' },
  { account_code: '6800', account_name: 'Professional Fees', account_type: 'EXPENSE', account_subtype: 'OpEx', normal_balance: 'DEBIT' },
  { account_code: '6900', account_name: 'Miscellaneous Expense', account_type: 'EXPENSE', account_subtype: 'OpEx', normal_balance: 'DEBIT' },

  // ──── 7000-7100: Non-Operating Expenses ────
  { account_code: '7000', account_name: 'Depreciation Expense', account_type: 'EXPENSE', account_subtype: 'Non-Operating', normal_balance: 'DEBIT' },
  { account_code: '7050', account_name: 'Interest Expense', account_type: 'EXPENSE', account_subtype: 'Non-Operating', normal_balance: 'DEBIT' },
  { account_code: '7100', account_name: 'Bank Charges', account_type: 'EXPENSE', account_subtype: 'Non-Operating', normal_balance: 'DEBIT' },

  // ──── 8000-8200: BIR-Only Accounts ────
  { account_code: '8000', account_name: 'Personal Expense (BIR)', account_type: 'EXPENSE', account_subtype: 'BIR-Only', normal_balance: 'DEBIT', bir_flag: 'BIR' },
  { account_code: '8100', account_name: 'Owner Advance Expense (BIR)', account_type: 'EXPENSE', account_subtype: 'BIR-Only', normal_balance: 'DEBIT', bir_flag: 'BIR' },
  { account_code: '8200', account_name: 'BDM Advance Expense (BIR)', account_type: 'EXPENSE', account_subtype: 'BIR-Only', normal_balance: 'DEBIT', bir_flag: 'BIR' },
];

async function seedCOA() {
  const entities = await Entity.find({ status: 'ACTIVE' }).lean();
  if (entities.length === 0) {
    console.log('  No active entities found — skipping COA seed');
    return;
  }

  let totalUpserted = 0;

  for (const entity of entities) {
    let upserted = 0;
    for (const acct of COA_TEMPLATE) {
      const result = await ChartOfAccounts.updateOne(
        { entity_id: entity._id, account_code: acct.account_code },
        {
          $setOnInsert: {
            entity_id: entity._id,
            ...acct,
            bir_flag: acct.bir_flag || 'BOTH',
            is_active: true
          }
        },
        { upsert: true }
      );
      if (result.upsertedCount > 0) upserted++;
    }
    console.log(`  ${entity.entity_name}: ${upserted} new accounts (${COA_TEMPLATE.length} total)`);
    totalUpserted += upserted;
  }

  console.log(`  COA seed complete: ${totalUpserted} new accounts across ${entities.length} entities`);
}

// Allow standalone execution
if (require.main === module) {
  (async () => {
    await connectDB();
    console.log('═══ Seed Chart of Accounts ═══\n');
    await seedCOA();
    await mongoose.disconnect();
  })().catch(err => {
    console.error('Seed error:', err);
    mongoose.disconnect();
    process.exit(1);
  });
}

module.exports = seedCOA;
