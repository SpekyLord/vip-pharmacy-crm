/**
 * Seed Script — Service Revenue COA Accounts + Petty Cash Fund Account
 * Phase 18 + Phase 19
 *
 * Usage: node backend/erp/scripts/seedServiceRevenueCoa.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const ChartOfAccounts = require('../models/ChartOfAccounts');
const Entity = require('../models/Entity');

const SERVICE_REVENUE_ACCOUNTS = [
  { account_code: '4100', account_name: 'Service Revenue — Consulting', account_type: 'REVENUE', account_subtype: 'Service Revenue', normal_balance: 'CREDIT', bir_flag: 'BOTH' },
  { account_code: '4101', account_name: 'Service Revenue — FNB', account_type: 'REVENUE', account_subtype: 'Service Revenue', normal_balance: 'CREDIT', bir_flag: 'BOTH' },
  { account_code: '4102', account_name: 'Service Revenue — Rental', account_type: 'REVENUE', account_subtype: 'Service Revenue', normal_balance: 'CREDIT', bir_flag: 'BOTH' },
  { account_code: '4103', account_name: 'Service Revenue — Other', account_type: 'REVENUE', account_subtype: 'Service Revenue', normal_balance: 'CREDIT', bir_flag: 'BOTH' },
  { account_code: '1015', account_name: 'Petty Cash Fund', account_type: 'ASSET', account_subtype: 'Cash & Bank', normal_balance: 'DEBIT', bir_flag: 'BOTH' },
];

async function seed() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB');

  const entities = await Entity.find({}).lean();
  if (!entities.length) {
    console.log('No entities found. Run entity setup first.');
    process.exit(1);
  }

  for (const entity of entities) {
    console.log(`\nSeeding COA for entity: ${entity.entity_name} (${entity._id})`);

    for (const acct of SERVICE_REVENUE_ACCOUNTS) {
      const existing = await ChartOfAccounts.findOne({
        entity_id: entity._id,
        account_code: acct.account_code
      });

      if (existing) {
        console.log(`  [SKIP] ${acct.account_code} ${acct.account_name} — already exists`);
        continue;
      }

      await ChartOfAccounts.create({ ...acct, entity_id: entity._id });
      console.log(`  [CREATED] ${acct.account_code} ${acct.account_name}`);
    }
  }

  console.log('\nDone!');
  await mongoose.disconnect();
}

seed().catch(err => { console.error(err); process.exit(1); });
