/**
 * Seed script for ERP Settings
 * Creates the single settings document with defaults if it doesn't exist
 * Idempotent — safe to run multiple times
 *
 * Usage: node backend/erp/scripts/seedSettings.js
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const connectDB = require('../../config/db');
const Settings = require('../models/Settings');

const seedSettings = async () => {
  await connectDB();

  const existing = await Settings.findOne();
  if (existing) {
    console.log(`✓ Settings already exist (version ${existing.version}). Skipping.`);
    return;
  }

  const settings = await Settings.create({ version: 1 });
  console.log(`✓ Settings created with defaults (version ${settings.version})`);
  console.log('  Key values:');
  console.log(`  - VAT_RATE: ${settings.VAT_RATE}`);
  console.log(`  - PERDIEM_MD_FULL / HALF: ${settings.PERDIEM_MD_FULL} / ${settings.PERDIEM_MD_HALF}`);
  console.log(`  - (per-diem rate now lives in PERDIEM_RATES lookup — run seedAllLookups.js)`);
  console.log(`  - DEFAULT_PAYMENT_TERMS: ${settings.DEFAULT_PAYMENT_TERMS}`);
  console.log(`  - NEAR_EXPIRY_DAYS: ${settings.NEAR_EXPIRY_DAYS}`);
};

if (require.main === module) {
  seedSettings()
    .then(() => mongoose.disconnect())
    .catch(err => {
      console.error('Seed error:', err);
      mongoose.disconnect();
      process.exit(1);
    });
}

module.exports = seedSettings;
