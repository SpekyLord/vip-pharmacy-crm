/**
 * Seed script for admin-managed lookup collections
 * Seeds: PaymentModes, ExpenseComponents
 * (BankAccounts are entity-specific — seeded separately or via admin UI)
 * Idempotent — upserts by code
 *
 * Usage: node backend/erp/scripts/seedLookups.js
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const connectDB = require('../../config/db');
const PaymentMode = require('../models/PaymentMode');
const ExpenseComponent = require('../models/ExpenseComponent');

const PAYMENT_MODES = [
  { mode_code: 'CASH', mode_label: 'Cash', mode_type: 'CASH', coa_code: '1000', requires_calf: false },
  { mode_code: 'CHECK', mode_label: 'Check', mode_type: 'CHECK', coa_code: '1011', requires_calf: false },
  { mode_code: 'BANK_TRANSFER', mode_label: 'Bank Transfer', mode_type: 'BANK_TRANSFER', coa_code: '1010', requires_calf: false },
  { mode_code: 'GCASH', mode_label: 'GCash', mode_type: 'GCASH', coa_code: '1015', requires_calf: false },
  { mode_code: 'CC_RCBC', mode_label: 'Credit Card (RCBC)', mode_type: 'CARD', coa_code: '2303', requires_calf: true },
  { mode_code: 'CC_SBC', mode_label: 'Credit Card (SBC)', mode_type: 'CARD', coa_code: '2301', requires_calf: true },
  { mode_code: 'CC_MBTC', mode_label: 'Credit Card (MBTC)', mode_type: 'CARD', coa_code: '2301', requires_calf: true },
  { mode_code: 'CC_UB', mode_label: 'Credit Card (UB)', mode_type: 'CARD', coa_code: '2301', requires_calf: true },
];

const EXPENSE_COMPONENTS = [
  { component_code: 'SMER', component_name: 'SMER (Sales & Marketing Expense Report)', or_required: true, calf_required: false },
  { component_code: 'GAS_OFFICIAL', component_name: 'Gas (Official)', or_required: true, calf_required: false },
  { component_code: 'GAS_PERSONAL', component_name: 'Gas (Personal)', or_required: true, calf_required: false },
  { component_code: 'INSURANCE', component_name: 'Insurance', or_required: true, calf_required: false },
  { component_code: 'ACCESS', component_name: 'ACCESS (Accommodation, Communication, etc.)', or_required: true, calf_required: true },
  { component_code: 'CORE_COMMISSION', component_name: 'Core Commission', or_required: false, calf_required: false },
];

const seedLookups = async () => {
  await connectDB();

  for (const pm of PAYMENT_MODES) {
    await PaymentMode.findOneAndUpdate(
      { mode_code: pm.mode_code },
      pm,
      { upsert: true }
    );
  }
  console.log(`✓ Payment modes seeded (${PAYMENT_MODES.length})`);

  for (const ec of EXPENSE_COMPONENTS) {
    await ExpenseComponent.findOneAndUpdate(
      { component_code: ec.component_code },
      ec,
      { upsert: true }
    );
  }
  console.log(`✓ Expense components seeded (${EXPENSE_COMPONENTS.length})`);
};

if (require.main === module) {
  seedLookups()
    .then(() => mongoose.disconnect())
    .catch(err => {
      console.error('Seed error:', err);
      mongoose.disconnect();
      process.exit(1);
    });
}

module.exports = seedLookups;
