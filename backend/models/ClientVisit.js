/**
 * ClientVisit Model (Regular Client Visit / Extra Call)
 *
 * Simplified Visit schema for non-VIP client visits.
 * No weekly tracking, no products discussed, no unique weekly constraint.
 *
 * Key differences from Visit:
 * - No weekNumber, weekOfMonth, weekLabel, yearWeekKey
 * - No productsDiscussed
 * - No compound unique index (no weekly limit)
 * - Daily limit: 30 per BDM per day (enforced at controller level)
 */

const mongoose = require('mongoose');

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
    // Auto-computed for future CPT reporting
    monthYear: {
      type: String, // "2026-02"
    },
    dayOfWeek: {
      type: Number, // 1-5 (Mon-Fri)
      min: 1,
      max: 5,
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

// Pre-save hook: compute monthYear, dayOfWeek, enforce work-day-only
clientVisitSchema.pre('save', function (next) {
  if (this.isNew || this.isModified('visitDate')) {
    const date = this.visitDate;

    // Enforce work days only (Mon-Fri)
    const jsDay = date.getDay();
    if (jsDay === 0 || jsDay === 6) {
      return next(new Error('Visits can only be logged on work days (Monday-Friday)'));
    }

    // Compute dayOfWeek (1=Mon, 5=Fri)
    this.dayOfWeek = jsDay;

    // Compute monthYear
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    this.monthYear = `${year}-${month}`;
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
