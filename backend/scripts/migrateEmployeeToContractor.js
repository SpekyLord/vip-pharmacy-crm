/**
 * Migration: Rename role 'employee' → 'contractor'
 *
 * BDMs, consultants, pharmacists, cleaners, IT professionals are all
 * independent contractors, not employees. The 'employee' role is reserved
 * for future actual hires.
 *
 * Run BEFORE deploying the new code:
 *   node backend/scripts/migrateEmployeeToContractor.js
 *
 * Safe to run multiple times (idempotent).
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');
const connectDB = require('../config/db');

async function migrate() {
  await connectDB();
  const db = mongoose.connection.db;
  const usersCol = db.collection('users');

  // Count before
  const beforeCount = await usersCol.countDocuments({ role: 'employee' });
  console.log(`Found ${beforeCount} users with role='employee'`);

  if (beforeCount === 0) {
    console.log('Nothing to migrate.');
    process.exit(0);
  }

  // Update all employee → contractor
  const result = await usersCol.updateMany(
    { role: 'employee' },
    { $set: { role: 'contractor' } }
  );

  console.log(`Updated ${result.modifiedCount} users: role 'employee' → 'contractor'`);

  // Verify
  const afterCount = await usersCol.countDocuments({ role: 'employee' });
  console.log(`Remaining users with role='employee': ${afterCount}`);

  const contractorCount = await usersCol.countDocuments({ role: 'contractor' });
  console.log(`Total users with role='contractor': ${contractorCount}`);

  process.exit(0);
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
