/**
 * ClientVisit Model (Regular Client Visit)
 *
 * Visit schema for regular client visits with the same weekly tracking
 * and enforcement as VIP visits (weekly unique constraint, monthly limits).
 */

const mongoose = require('mongoose');
const { getWeekOfMonth } = require('../utils/scheduleCycleUtils');

// Cycle anchor: Monday, January 5, 2026
const CYCLE_ANCHOR = new Date(Date.UTC(2026, 0, 5));
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000; // UTC+8 (Asia/Manila)

/**
 * Calculate ISO 8601 week number
 * Expects a Manila-adjusted date; uses UTC methods for timezone-safe calculation.
 */
function getISOWeek(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNumber = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  const weekYear = d.getUTCFullYear();
  return { weekNumber, weekYear };
}

/**
 * Get cycle position (W1-W4, day 1-7) based on anchor date.
 * Uses Manila time (UTC+8) so midnight visits in the Philippines get the correct day/week.
 */
function getCyclePosition(date) {
  const manilaDate = new Date(date.getTime() + MANILA_OFFSET_MS);
  const diffMs = manilaDate.getTime() - CYCLE_ANCHOR.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  const dayInCycle = ((diffDays % 28) + 28) % 28;
  const weekInCycle = Math.floor(dayInCycle / 7) + 1;
  const jsDay = manilaDate.getUTCDay();
  const dayOfWeekInCycle = jsDay === 0 ? 7 : jsDay;
  return { weekInCycle, dayOfWeekInCycle };
}

const clientVisitSchema = new mongoose.Schema(
  {
    client: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Client',
      required: [true, 'Client is required'],
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User is required'],
    },
    visitDate: {
      type: Date,
      required: [true, 'Visit date is required'],
      default: Date.now,
    },
    // Location (optional — attached when available for extra verification)
    location: {
      latitude: {
        type: Number,
      },
      longitude: {
        type: Number,
      },
      accuracy: {
        type: Number,
      },
      capturedAt: {
        type: Date,
        default: Date.now,
      },
    },
    // Photos (required — 1-10 for proof)
    photos: {
      type: [
        {
          url: { type: String, required: true },
          capturedAt: { type: Date, required: true },
          source: { type: String, default: 'camera' }, // Lookup: PHOTO_SOURCE
          hash: { type: String }, // MD5 hash for duplicate detection
        },
      ],
      validate: {
        validator: function (arr) {
          return arr && arr.length >= 1 && arr.length <= 10;
        },
        message: 'Visits must have 1-10 photos as proof of visit',
      },
    },

    // Photo audit flags (for admin review)
    photoFlags: {
      type: [String], // Lookup: PHOTO_FLAG
      default: [],
    },
    photoFlagDetails: [
      {
        flag: { type: String }, // Lookup: PHOTO_FLAG
        photoIndex: { type: Number },
        detail: { type: String },
        matchedVisitId: { type: mongoose.Schema.Types.ObjectId },
        matchedVisitType: { type: String }, // vip | regular
      },
    ],
    // Engagement types (maps to Excel CPT day sheet columns G-K)
    engagementTypes: {
      type: [String],
      default: [],
    }, // Lookup: ENGAGEMENT_TYPE
    purpose: {
      type: String,
      maxlength: [500, 'Purpose cannot exceed 500 characters'],
    },
    notes: {
      type: String,
      maxlength: [1000, 'Notes cannot exceed 1000 characters'],
    },
    status: {
      type: String,
      enum: ['completed', 'cancelled'],
      default: 'completed',
    },
    // Auto-computed for CPT reporting and enforcement
    weekNumber: {
      type: Number, // ISO week 1-53
      min: 1,
      max: 53,
    },
    monthYear: {
      type: String, // "2026-02"
    },
    dayOfWeek: {
      type: Number, // 1-7 (Mon-Sun, weekends allowed for regular clients)
      min: 1,
      max: 7,
    },
    weekOfMonth: {
      type: Number, // 1-4 (cycle-based week)
      min: 1,
      max: 4,
    },
    weekLabel: {
      type: String, // "W1D1", "W2D3", etc.
    },
    yearWeekKey: {
      type: String, // "2026-W11" — for unique constraint
    },

    // Weekend visit flag (for reporting)
    isWeekendVisit: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes
clientVisitSchema.index({ user: 1, visitDate: -1 });
clientVisitSchema.index({ client: 1, visitDate: -1 });
clientVisitSchema.index({ user: 1, monthYear: 1 });
clientVisitSchema.index({ yearWeekKey: 1 });
clientVisitSchema.index({ client: 1, user: 1, monthYear: 1 });
clientVisitSchema.index({ 'photos.hash': 1 }, { sparse: true }); // For duplicate photo detection
clientVisitSchema.index({ photoFlags: 1 }, { sparse: true }); // For photo audit queries

// Compound unique index: ONE visit per client per week per user
clientVisitSchema.index(
  { client: 1, user: 1, yearWeekKey: 1 },
  {
    unique: true,
    partialFilterExpression: { status: 'completed', yearWeekKey: { $exists: true, $ne: null } },
  }
);

// Pre-save hook: compute all weekly tracking fields
clientVisitSchema.pre('save', function (next) {
  if (this.isNew || this.isModified('visitDate')) {
    const date = this.visitDate;
    // Use Manila time for all calendar calculations (UTC+8)
    const manilaDate = new Date(date.getTime() + MANILA_OFFSET_MS);

    // ISO week number — pass Manila-adjusted date
    const { weekNumber, weekYear } = getISOWeek(manilaDate);
    this.weekNumber = weekNumber;

    // Cycle position (W1-W4, day 1-7)
    const { weekInCycle, dayOfWeekInCycle } = getCyclePosition(date);
    this.weekOfMonth = weekInCycle;
    this.dayOfWeek = dayOfWeekInCycle;

    // Week label
    this.weekLabel = `W${this.weekOfMonth}D${this.dayOfWeek}`;

    // Month-year using Manila date
    const month = String(manilaDate.getUTCMonth() + 1).padStart(2, '0');
    this.monthYear = `${manilaDate.getUTCFullYear()}-${month}`;

    // Year-week key for unique constraint
    const week = String(weekNumber).padStart(2, '0');
    this.yearWeekKey = `${weekYear}-W${week}`;

    // Set weekend flag using Manila day
    const jsDay = manilaDate.getUTCDay();
    this.isWeekendVisit = jsDay === 0 || jsDay === 6;
  }
  next();
});

// Static: Count daily visits for a user on a specific date
clientVisitSchema.statics.countDailyVisits = async function (userId, date) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  return this.countDocuments({
    user: userId,
    visitDate: { $gte: start, $lt: end },
    status: 'completed',
  });
};

const ClientVisit = mongoose.model('ClientVisit', clientVisitSchema);

module.exports = ClientVisit;
