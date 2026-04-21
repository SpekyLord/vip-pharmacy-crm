/**
 * Schedule Model
 *
 * Tracks BDM visit schedules on a 4-week rotating cycle anchored to Jan 5, 2026.
 * Each entry represents one planned visit: which VIP Client, which week/day.
 *
 * Status flow: planned → carried → completed | missed
 *   - planned: scheduled for a specific week/day
 *   - carried: missed its scheduled week, carried forward
 *   - completed: visit was logged
 *   - missed: past cycle end (W4D5) without being completed
 */

const mongoose = require('mongoose');
const { CYCLE_ANCHOR, MANILA_OFFSET_MS, getWeekOfMonth, getDayOfWeek, isWorkDay } = require('../utils/scheduleCycleUtils');

const scheduleSchema = new mongoose.Schema(
  {
    doctor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Doctor',
      required: [true, 'VIP Client is required'],
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'BDM user is required'],
    },
    cycleStart: {
      type: Date,
      required: [true, 'Cycle start date is required'],
    },
    cycleNumber: {
      type: Number,
      required: [true, 'Cycle number is required'],
    },
    scheduledWeek: {
      type: Number,
      required: [true, 'Scheduled week is required'],
      min: 1,
      max: 4,
    },
    scheduledDay: {
      type: Number,
      required: [true, 'Scheduled day is required'],
      min: 1,
      max: 5,
    },
    scheduledLabel: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ['planned', 'carried', 'completed', 'missed'],
      default: 'planned',
    },
    carriedToWeek: {
      type: Number,
      min: 1,
      max: 4,
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    completedInWeek: {
      type: Number,
      min: 1,
      max: 4,
      default: null,
    },
    visit: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Visit',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
scheduleSchema.index({ user: 1, cycleNumber: 1 });
scheduleSchema.index({ doctor: 1, user: 1, cycleNumber: 1 });
scheduleSchema.index({ user: 1, cycleNumber: 1, status: 1 });
scheduleSchema.index(
  { doctor: 1, user: 1, cycleNumber: 1, scheduledWeek: 1, scheduledDay: 1 },
  { unique: true }
);

// ─── Static Methods ────────────────────────────────────────────────────────────

/**
 * Get 0-based cycle number from anchor date.
 * Cycle 0 = Jan 5 – Feb 1, 2026.
 */
scheduleSchema.statics.getCycleNumber = function (date) {
  const manilaDate = new Date(date.getTime() + MANILA_OFFSET_MS);
  const diffMs = manilaDate.getTime() - CYCLE_ANCHOR.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  return Math.floor(diffDays / 28);
};

/**
 * Get the Monday start date for a given cycle number.
 */
scheduleSchema.statics.getCycleStartDate = function (cycleNumber) {
  const start = new Date(CYCLE_ANCHOR);
  start.setDate(start.getDate() + cycleNumber * 28);
  return start;
};

/**
 * Get current week (1-4) within the cycle for a given date.
 */
scheduleSchema.statics.getCurrentCycleWeek = function (date) {
  return getWeekOfMonth(date);
};

/**
 * Get the cycle end date (W4D5 = Friday of week 4).
 */
scheduleSchema.statics.getCycleEndDate = function (cycleNumber) {
  const start = this.getCycleStartDate(cycleNumber);
  const end = new Date(start);
  end.setDate(end.getDate() + 25); // 4 weeks - 3 days = Friday of W4
  end.setHours(23, 59, 59, 999);
  return end;
};

/**
 * Get visitable entries for a BDM on a given date.
 * Returns entries that are:
 *   - planned for current week or earlier (should be carried)
 *   - already carried to current week or earlier
 */
scheduleSchema.statics.getVisitableEntries = async function (userId, date = new Date()) {
  const cycleNumber = this.getCycleNumber(date);
  const currentWeek = this.getCurrentCycleWeek(date);

  return this.find({
    user: userId,
    cycleNumber,
    status: { $in: ['planned', 'carried'] },
    $or: [
      { scheduledWeek: { $lte: currentWeek }, status: 'planned' },
      { status: 'carried' },
    ],
  })
    .populate('doctor', 'firstName lastName specialization clinicOfficeAddress locality province visitFrequency')
    .sort({ scheduledWeek: 1, scheduledDay: 1 });
};

/**
 * Get full cycle schedule for a BDM.
 */
scheduleSchema.statics.getCycleSchedule = async function (userId, cycleNumber) {
  return this.find({
    user: userId,
    cycleNumber,
  })
    .populate('doctor', 'firstName lastName specialization clinicOfficeAddress locality province visitFrequency')
    .sort({ scheduledWeek: 1, scheduledDay: 1 });
};

module.exports = mongoose.model('Schedule', scheduleSchema);
