/**
 * Migration: Update Schedule unique index to include scheduledDay.
 *
 * Old index: { doctor, user, cycleNumber, scheduledWeek } unique
 * New index: { doctor, user, cycleNumber, scheduledWeek, scheduledDay } unique
 *
 * This allows multiple schedule entries per week for the same doctor
 * (e.g., W4D1 and W4D5 if that's what the BDM's Excel CPT specifies).
 *
 * Usage: node backend/scripts/migrateScheduleIndex.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const connectDB = require('../config/db');

async function main() {
  await connectDB();

  const db = mongoose.connection.db;
  const collection = db.collection('schedules');

  // List current indexes
  const indexes = await collection.indexes();
  console.log('Current indexes:');
  indexes.forEach((idx) => console.log(`  ${idx.name}: ${JSON.stringify(idx.key)} ${idx.unique ? '(unique)' : ''}`));

  // Find and drop the old index (doctor_1_user_1_cycleNumber_1_scheduledWeek_1)
  const oldIndex = indexes.find(
    (idx) =>
      idx.unique &&
      idx.key.doctor === 1 &&
      idx.key.user === 1 &&
      idx.key.cycleNumber === 1 &&
      idx.key.scheduledWeek === 1 &&
      !idx.key.scheduledDay
  );

  if (oldIndex) {
    console.log(`\nDropping old index: ${oldIndex.name}`);
    await collection.dropIndex(oldIndex.name);
    console.log('Old index dropped successfully.');
  } else {
    console.log('\nOld index not found (may already be migrated).');
  }

  // Ensure the new index exists
  console.log('\nCreating new index: { doctor, user, cycleNumber, scheduledWeek, scheduledDay } unique');
  await collection.createIndex(
    { doctor: 1, user: 1, cycleNumber: 1, scheduledWeek: 1, scheduledDay: 1 },
    { unique: true }
  );
  console.log('New index created successfully.');

  // Verify
  const updatedIndexes = await collection.indexes();
  console.log('\nUpdated indexes:');
  updatedIndexes.forEach((idx) => console.log(`  ${idx.name}: ${JSON.stringify(idx.key)} ${idx.unique ? '(unique)' : ''}`));

  console.log('\nMigration complete.');
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
