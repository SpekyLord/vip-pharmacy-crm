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

/**
 * Calculate ISO 8601 week number
 */
function getISOWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNumber = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  const weekYear = d.getUTCFullYear();
  return { weekNumber, weekYear };
}

/**
 * Get cycle position (W1-W4, day 1-7) based on anchor date
 */
function getCyclePosition(date) {
  const diffMs = date.getTime() - CYCLE_ANCHOR.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  const dayInCycle = ((diffDays % 28) + 28) % 28;
  const weekInCycle = Math.floor(dayInCycle / 7) + 1;
  const dayOfWeek = date.getDay();
  const dayOfWeekInCycle = dayOfWeek === 0 ? 7 : dayOfWeek;
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
    // Location (required for proof of visit)
    location: {
      latitude: {
        type: Number,
        required: [true, 'GPS latitude is required'],
        min: -90,
        max: 90,
      },
      longitude: {
        type: Number,
        required: [true, 'GPS longitude is required'],
        min: -180,
        max: 180,
      },
      accuracy: {
        type: Number,
      },
      capturedAt: {
        type: Date,
        required: true,
        default: Date.now,
      },
    },
    // Photos (required — 1-10 for proof)
    photos: {
      type: [
        {
          url: { type: String, required: true },
          capturedAt: { type: Date, required: true },
        },
      ],
      validate: {
        validator: function (arr) {
          return arr && arr.length >= 1 && arr.length <= 10;
        },
        message: 'Visits must have 1-10 photos as proof of visit',
      },
    },
    // Engagement types (maps to Excel CPT day sheet columns G-K)
    engagementTypes: {
      type: [String],
      enum: ['TXT_PROMATS', 'MES_VIBER_GIF', 'PICTURE', 'SIGNED_CALL', 'VOICE_CALL'],
      default: [],
    },
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
      type: Number, // 1-5 (Mon-Fri)
      min: 1,
      max: 5,
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

    // Enforce work days only (Mon-Fri)
    const jsDay = date.getDay();
    if (jsDay === 0 || jsDay === 6) {
      return next(new Error('Visits can only be logged on work days (Monday-Friday)'));
    }

    // ISO week number
    const { weekNumber, weekYear } = getISOWeek(date);
    this.weekNumber = weekNumber;

    // Cycle position (W1-W4, day 1-5)
    const { weekInCycle, dayOfWeekInCycle } = getCyclePosition(date);
    this.weekOfMonth = weekInCycle;
    this.dayOfWeek = dayOfWeekInCycle;

    // Week label
    this.weekLabel = `W${this.weekOfMonth}D${this.dayOfWeek}`;

    // Month-year
    const month = String(date.getMonth() + 1).padStart(2, '0');
    this.monthYear = `${date.getFullYear()}-${month}`;

    // Year-week key for unique constraint
    const week = String(weekNumber).padStart(2, '0');
    this.yearWeekKey = `${weekYear}-W${week}`;
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
