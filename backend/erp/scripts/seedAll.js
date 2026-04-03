/**
 * Master ERP seed script — runs all seeds in dependency order
 *
 * Usage: node backend/erp/scripts/seedAll.js
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const connectDB = require('../../config/db');

const seedEntities = require('./seedEntities');
const seedSettings = require('./seedSettings');
const seedGovernmentRates = require('./seedGovernmentRates');
const seedLookups = require('./seedLookups');
const seedVendors = require('./seedVendors');
const seedAccessTemplates = require('./seedAccessTemplates');
const seedCOA = require('./seedCOA');

const seedAll = async () => {
  await connectDB();
  console.log('═══ ERP Seed All ═══\n');

  console.log('--- 1/7 Entities ---');
  await seedEntities();
  console.log('');

  console.log('--- 2/7 Settings ---');
  await seedSettings();
  console.log('');

  console.log('--- 3/7 Government Rates ---');
  await seedGovernmentRates();
  console.log('');

  console.log('--- 4/7 Lookups (Payment Modes, Expense Components) ---');
  await seedLookups();
  console.log('');

  console.log('--- 5/7 Vendors ---');
  await seedVendors();
  console.log('');

  console.log('--- 6/7 Access Templates ---');
  await seedAccessTemplates();
  console.log('');

  console.log('--- 7/7 Chart of Accounts ---');
  await seedCOA();
  console.log('');

  console.log('═══ All ERP seeds complete ═══');
};

seedAll()
  .then(() => mongoose.disconnect())
  .catch(err => {
    console.error('Seed error:', err);
    mongoose.disconnect();
    process.exit(1);
  });
