/**
 * Migration Script: Fix Visit Week Calculations to Anchor-Based Cycles
 *
 * Recalculates weekOfMonth, weekLabel, dayOfWeek, and monthYear for ALL visits
 * using the anchor-based 4-week cycle (Jan 5, 2026 = W1D1).
 *
 * Before: naive "week of calendar month" with 5th-week overflow to next month
 * After:  anchor-based cycle position, monthYear = calendar month
 *
 * Usage: node backend/scripts/fixVisitCycleWeeks.js
 *        node backend/scripts/fixVisitCycleWeeks.js --dry-run
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

const CYCLE_ANCHOR = new Date(2026, 0, 5); // Jan 5, 2026 (Monday)

function getCyclePosition(date) {
  const diffMs = date.getTime() - CYCLE_ANCHOR.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  const dayInCycle = ((diffDays % 28) + 28) % 28;
  const weekInCycle = Math.floor(dayInCycle / 7) + 1;
  const dayOfWeekInCycle = (dayInCycle % 7) + 1;
  return { weekInCycle, dayOfWeekInCycle };
}

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('MongoDB connected');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
};

const run = async () => {
  await connectDB();

  const dryRun = process.argv.includes('--dry-run');
  if (dryRun) console.log('=== DRY RUN (no changes will be saved) ===\n');

  const Visit = require('../models/Visit');
  const visits = await Visit.find({}).sort({ visitDate: 1 });

  console.log(`Found ${visits.length} visits to process\n`);

  let changed = 0;

  for (const visit of visits) {
    const date = visit.visitDate;
    const { weekInCycle, dayOfWeekInCycle } = getCyclePosition(date);
    const calendarMonthYear = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const newLabel = `W${weekInCycle}D${dayOfWeekInCycle}`;

    const needsUpdate =
      visit.weekOfMonth !== weekInCycle ||
      visit.dayOfWeek !== dayOfWeekInCycle ||
      visit.weekLabel !== newLabel ||
      visit.monthYear !== calendarMonthYear;

    if (needsUpdate) {
      const dateStr = date.toISOString().split('T')[0];
      console.log(
        `  ${dateStr}: ${visit.weekLabel || 'none'} → ${newLabel}, ` +
        `monthYear: ${visit.monthYear || 'none'} → ${calendarMonthYear}`
      );

      if (!dryRun) {
        await Visit.updateOne(
          { _id: visit._id },
          {
            $set: {
              weekOfMonth: weekInCycle,
              dayOfWeek: dayOfWeekInCycle,
              weekLabel: newLabel,
              monthYear: calendarMonthYear,
            },
          }
        );
      }
      changed++;
    }
  }

  console.log(`\n${dryRun ? 'Would update' : 'Updated'} ${changed} of ${visits.length} visits`);

  await mongoose.connection.close();
  console.log('Done.');
};

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
