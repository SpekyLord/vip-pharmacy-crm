/**
 * Seed Script — Petty Cash Funds for Iloilo eBDMs
 * Phase 19
 *
 * Creates:
 * - PCF-ILO1: eBDM 1 Iloilo Petty Cash (Jay Ann Protacio)
 * - PCF-ILO2: eBDM 2 Iloilo Petty Cash (Jenny Rose Jacosalem)
 *
 * Usage: node backend/erp/scripts/seedPettyCashFunds.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const PettyCashFund = require('../models/PettyCashFund');
const Warehouse = require('../models/Warehouse');
const User = require('../../../backend/models/User');

const FUNDS = [
  {
    fund_code: 'PCF-ILO1',
    fund_name: 'eBDM 1 Iloilo Petty Cash',
    warehouse_code: 'ILO1',
    custodian_email: 's22.vippharmacy@gmail.com', // Jay Ann Protacio
    balance_ceiling: 5000,
    authorized_amount: 10000
  },
  {
    fund_code: 'PCF-ILO2',
    fund_name: 'eBDM 2 Iloilo Petty Cash',
    warehouse_code: 'ILO2',
    custodian_email: 's26.vippharmacy@gmail.com', // Jenny Rose Jacosalem
    balance_ceiling: 5000,
    authorized_amount: 10000
  }
];

async function seed() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB');

  for (const fundDef of FUNDS) {
    // Look up custodian by email
    const user = await User.findOne({ email: fundDef.custodian_email }).lean();
    if (!user) {
      console.log(`[SKIP] ${fundDef.fund_code} — custodian ${fundDef.custodian_email} not found`);
      continue;
    }

    // Look up warehouse by code
    const warehouse = await Warehouse.findOne({ warehouse_code: fundDef.warehouse_code }).lean();

    // Look up entity from warehouse or user
    const entityId = warehouse?.entity_id || user.entity_id;
    if (!entityId) {
      console.log(`[SKIP] ${fundDef.fund_code} — no entity_id found`);
      continue;
    }

    // Check if already exists
    const existing = await PettyCashFund.findOne({ entity_id: entityId, fund_code: fundDef.fund_code });
    if (existing) {
      console.log(`[SKIP] ${fundDef.fund_code} — already exists`);
      continue;
    }

    await PettyCashFund.create({
      entity_id: entityId,
      fund_name: fundDef.fund_name,
      fund_code: fundDef.fund_code,
      custodian_id: user._id,
      warehouse_id: warehouse?._id,
      authorized_amount: fundDef.authorized_amount,
      current_balance: 0,
      balance_ceiling: fundDef.balance_ceiling,
      status: 'ACTIVE'
    });

    console.log(`[CREATED] ${fundDef.fund_code} — ${fundDef.fund_name} (custodian: ${user.name || user.email})`);
  }

  console.log('\nDone!');
  await mongoose.disconnect();
}

seed().catch(err => { console.error(err); process.exit(1); });
