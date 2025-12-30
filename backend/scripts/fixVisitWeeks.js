/**
 * Migration Script: Fix Visit Week Calculations
 *
 * This script recalculates weekOfMonth and monthYear for existing visits
 * that have weekOfMonth > 4 (5th+ week). These visits should be counted
 * towards the next month's report as Week 1.
 *
 * Business Rule:
 * - Grid only supports 4 weeks (20 work days per month)
 * - Visits on 5th+ week days count towards NEXT month's report
 *
 * Usage: node backend/scripts/fixVisitWeeks.js
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

// Connect to MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('MongoDB connected');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
};

/**
 * Calculate week of month using ISO week standard (Mon=0, Sun=6)
 */
function getWeekOfMonth(date) {
  const firstOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
  const firstDayOfWeek = firstOfMonth.getDay();
  const adjustedFirst = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;
  const dayOfMonth = date.getDate();
  return Math.ceil((dayOfMonth + adjustedFirst) / 7);
}

/**
 * Main migration function
 */
async function migrateVisits() {
  await connectDB();

  // Import Visit model after connection
  const Visit = require('../models/Visit');

  console.log('\n--- Visit Week Migration Script ---\n');

  // Find all visits (we need to recalculate all of them to ensure consistency)
  const visits = await Visit.find({}).select('_id visitDate weekOfMonth monthYear dayOfWeek weekLabel');

  console.log(`Found ${visits.length} total visits to check`);

  let updated = 0;
  let skipped = 0;
  const updates = [];

  for (const visit of visits) {
    const date = new Date(visit.visitDate);
    const originalWeekOfMonth = getWeekOfMonth(date);

    // Calculate day of week (ISO: Mon=1, Sun=7)
    const jsDay = date.getDay();
    const dayOfWeek = jsDay === 0 ? 7 : jsDay;

    // Calculate effective month
    let effectiveYear = date.getFullYear();
    let effectiveMonth = date.getMonth();
    let weekOfMonth = originalWeekOfMonth;

    if (originalWeekOfMonth > 4) {
      // 5th+ week - count towards next month
      effectiveMonth++;
      if (effectiveMonth > 11) {
        effectiveMonth = 0;
        effectiveYear++;
      }
      weekOfMonth = 1;
    }

    const monthYear = `${effectiveYear}-${String(effectiveMonth + 1).padStart(2, '0')}`;
    const weekLabel = `W${weekOfMonth}D${dayOfWeek}`;

    // Check if update is needed
    if (visit.weekOfMonth !== weekOfMonth ||
        visit.monthYear !== monthYear ||
        visit.dayOfWeek !== dayOfWeek ||
        visit.weekLabel !== weekLabel) {

      updates.push({
        updateOne: {
          filter: { _id: visit._id },
          update: {
            $set: {
              weekOfMonth,
              monthYear,
              dayOfWeek,
              weekLabel
            }
          }
        }
      });

      if (originalWeekOfMonth > 4) {
        console.log(`  Visit ${visit._id}:`);
        console.log(`    Date: ${date.toISOString().split('T')[0]}`);
        console.log(`    Original week: ${originalWeekOfMonth} -> New week: ${weekOfMonth}`);
        console.log(`    Month: ${visit.monthYear} -> ${monthYear}`);
      }
      updated++;
    } else {
      skipped++;
    }
  }

  // Execute bulk update
  if (updates.length > 0) {
    console.log(`\nExecuting ${updates.length} updates...`);
    const result = await Visit.bulkWrite(updates);
    console.log(`Modified: ${result.modifiedCount} visits`);
  }

  console.log(`\n--- Migration Summary ---`);
  console.log(`Total visits checked: ${visits.length}`);
  console.log(`Visits updated: ${updated}`);
  console.log(`Visits skipped (no change needed): ${skipped}`);

  await mongoose.disconnect();
  console.log('\nMongoDB disconnected. Migration complete.');
}

// Run migration
migrateVisits().catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
