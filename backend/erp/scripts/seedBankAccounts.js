/**
 * Seed Bank Accounts — company bank accounts per entity
 *
 * Usage: node backend/erp/scripts/seedBankAccounts.js
 */
const path = require('path');
if (require.main === module) {
  require('dotenv').config({ path: path.join(__dirname, '../../.env') });
}
const mongoose = require('mongoose');
const connectDB = require('../../config/db');
const BankAccount = require('../models/BankAccount');
const Entity = require('../models/Entity');

const VIP_ACCOUNTS = [
  { bank_code: 'SBC_SA', bank_name: 'Security Bank Savings', account_type: 'SAVINGS', coa_code: '1010' },
  { bank_code: 'SBC_CA', bank_name: 'Security Bank Current', account_type: 'CURRENT', coa_code: '1011' },
  { bank_code: 'RCBC_CA', bank_name: 'RCBC Current', account_type: 'CURRENT', coa_code: '1012' },
  { bank_code: 'MBTC_CA', bank_name: 'MBTC Current', account_type: 'CURRENT', coa_code: '1014' },
  { bank_code: 'GCASH', bank_name: 'VIP GCash', account_type: 'SAVINGS', coa_code: '1015' },
];

const MG_ACCOUNTS = [
  { bank_code: 'SBC_CA_MG', bank_name: 'Security Bank Current — MG and CO.', account_type: 'CURRENT', coa_code: '1016' },
];

async function seedBankAccounts() {
  const entities = await Entity.find({ status: 'ACTIVE' }).lean();

  for (const entity of entities) {
    const accounts = entity.entity_name?.includes('MG') ? MG_ACCOUNTS : VIP_ACCOUNTS;
    let upserted = 0;

    for (const acct of accounts) {
      const result = await BankAccount.updateOne(
        { entity_id: entity._id, bank_code: acct.bank_code },
        { $setOnInsert: { entity_id: entity._id, ...acct, is_active: true } },
        { upsert: true }
      );
      if (result.upsertedCount > 0) upserted++;
    }

    console.log(`  ${entity.entity_name}: ${upserted} new bank accounts (${accounts.length} total)`);
  }
}

if (require.main === module) {
  (async () => {
    await connectDB();
    console.log('═══ Seed Bank Accounts ═══\n');
    await seedBankAccounts();
    await mongoose.disconnect();
  })().catch(err => {
    console.error('Seed error:', err);
    mongoose.disconnect();
    process.exit(1);
  });
}

module.exports = seedBankAccounts;
