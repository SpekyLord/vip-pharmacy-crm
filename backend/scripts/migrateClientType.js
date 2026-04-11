/**
 * Migration: Set clientType='MD' on all existing Doctor records
 *
 * Gap 9 — Rx Correlation feature adds clientType field to Doctor model.
 * All existing VIP Clients are MDs, so default them to 'MD'.
 * hospitals[] left empty — admin populates via UI or Excel import.
 *
 * Usage: node backend/scripts/migrateClientType.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');

async function migrate() {
  await connectDB();

  const Doctor = require('../models/Doctor');

  // Set clientType='MD' on all records that don't have it yet
  const result = await Doctor.updateMany(
    { $or: [{ clientType: { $exists: false } }, { clientType: null }, { clientType: '' }] },
    { $set: { clientType: 'MD' } }
  );

  console.log(`[migrateClientType] Updated ${result.modifiedCount} of ${result.matchedCount} matched Doctor records to clientType='MD'`);

  // Ensure hospitals field exists (empty array) on records missing it
  const result2 = await Doctor.updateMany(
    { hospitals: { $exists: false } },
    { $set: { hospitals: [] } }
  );

  console.log(`[migrateClientType] Initialized hospitals[] on ${result2.modifiedCount} Doctor records`);

  await mongoose.disconnect();
  console.log('[migrateClientType] Done.');
  process.exit(0);
}

migrate().catch(err => {
  console.error('[migrateClientType] Error:', err.message);
  process.exit(1);
});
