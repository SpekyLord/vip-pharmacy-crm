/**
 * Visit Model
 *
 * This model represents visits made by field employees to doctors
 *
 * Key features:
 * - Weekly visit enforcement: One visit per doctor per week (Mon-Fri)
 * - Required GPS location for proof of visit
 * - Required photo capture for verification
 * - Weekly tracking with W1D1, W2D3 format labels
 * - Hard limit on monthly quota (2x or 4x based on doctor's visitFrequency)
 */

const mongoose = require('mongoose');

const visitSchema = new mongoose.Schema(
  {
    // References
    doctor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Doctor',
      required: [true, 'Doctor is required'],
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User is required'],
    },

    // Visit timing
    visitDate: {
      type: Date,
      required: [true, 'Visit date is required'],
      default: Date.now,
    },
    visitType: {
      type: String,
      enum: ['regular', 'follow-up', 'emergency'],
      default: 'regular',
    },

    // Weekly tracking fields (critical for enforcement)
    weekNumber: {
      type: Number,
      required: true,
      min: 1,
      max: 53,
    },
    weekOfMonth: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    dayOfWeek: {
      type: Number,
      required: true,
      min: 1, // 1 = Monday
      max: 5, // 5 = Friday
    },
    weekLabel: {
      type: String,
      required: true, // "W1D1", "W2D3", etc.
    },
    monthYear: {
      type: String,
      required: true, // "2024-12"
    },
    yearWeekKey: {
      type: String,
      required: true, // "2024-W52" - ISO week format for unique constraint
    },

    // Location (REQUIRED for proof of visit)
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
        type: Number, // GPS accuracy in meters
      },
      capturedAt: {
        type: Date,
        required: true,
        default: Date.now,
      },
    },

    // Photos (REQUIRED - minimum 1 for proof of visit)
    photos: {
      type: [
        {
          url: { type: String, required: true }, // S3 URL
          capturedAt: { type: Date, required: true },
          thumbnailUrl: { type: String },
        },
      ],
      validate: {
        validator: function (arr) {
          return arr && arr.length >= 1;
        },
        message: 'At least one photo is required as proof of visit',
      },
    },

    // Products discussed during visit
    productsDiscussed: [
      {
        product: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Product',
        },
        presented: { type: Boolean, default: true },
        feedback: { type: String },
      },
    ],

    // Visit details
    purpose: {
      type: String,
      maxlength: [500, 'Purpose cannot exceed 500 characters'],
    },
    doctorFeedback: {
      type: String,
      maxlength: [1000, 'Feedback cannot exceed 1000 characters'],
    },
    notes: {
      type: String,
      maxlength: [1000, 'Notes cannot exceed 1000 characters'],
    },
    duration: {
      type: Number, // Duration in minutes
      min: 1,
      max: 480, // Max 8 hours
    },

    // Status tracking
    status: {
      type: String,
      enum: ['completed', 'cancelled'],
      default: 'completed',
    },
    cancelReason: {
      type: String,
      maxlength: [500, 'Cancel reason cannot exceed 500 characters'],
    },

    // Next visit scheduling
    nextVisitDate: {
      type: Date,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Compound index to enforce ONE visit per doctor per week per user
visitSchema.index(
  { doctor: 1, user: 1, yearWeekKey: 1 },
  {
    unique: true,
    partialFilterExpression: { status: 'completed' },
  }
);

// Other indexes for performance
visitSchema.index({ user: 1, visitDate: -1 });
visitSchema.index({ doctor: 1, visitDate: -1 });
visitSchema.index({ monthYear: 1, user: 1 });
visitSchema.index({ status: 1 });
visitSchema.index({ visitDate: -1 });
visitSchema.index({ yearWeekKey: 1 });

// Pre-save hook to generate week tracking fields
visitSchema.pre('save', function (next) {
  if (this.isNew || this.isModified('visitDate')) {
    const date = this.visitDate;

    // Get ISO week number (1-53)
    const startOfYear = new Date(date.getFullYear(), 0, 1);
    const days = Math.floor((date - startOfYear) / (24 * 60 * 60 * 1000));
    this.weekNumber = Math.ceil((days + startOfYear.getDay() + 1) / 7);

    // Get week of month (1-5)
    const startOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
    const dayOfMonth = date.getDate();
    const startDayOfWeek = startOfMonth.getDay();
    this.weekOfMonth = Math.ceil((dayOfMonth + startDayOfWeek) / 7);

    // Get day of week (1 = Monday, 5 = Friday)
    const jsDay = date.getDay(); // 0 = Sunday
    this.dayOfWeek = jsDay === 0 ? 7 : jsDay; // Convert to ISO (Mon = 1)

    // Generate week label (W1D1, W2D3, etc.)
    this.weekLabel = `W${this.weekOfMonth}D${this.dayOfWeek}`;

    // Generate monthYear (2024-12)
    const month = String(date.getMonth() + 1).padStart(2, '0');
    this.monthYear = `${date.getFullYear()}-${month}`;

    // Generate yearWeekKey (2024-W52) - ISO format
    const week = String(this.weekNumber).padStart(2, '0');
    this.yearWeekKey = `${date.getFullYear()}-W${week}`;
  }
  next();
});

// Pre-save validation for work days only (Mon-Fri)
visitSchema.pre('save', function (next) {
  const jsDay = this.visitDate.getDay();
  if (jsDay === 0 || jsDay === 6) {
    return next(new Error('Visits can only be logged on work days (Monday-Friday)'));
  }
  next();
});

// Virtual: Check if this is today's visit
visitSchema.virtual('isToday').get(function () {
  const today = new Date();
  return (
    this.visitDate.getDate() === today.getDate() &&
    this.visitDate.getMonth() === today.getMonth() &&
    this.visitDate.getFullYear() === today.getFullYear()
  );
});

// Static: Get visits for a user in a specific month
visitSchema.statics.getMonthlyVisits = function (userId, monthYear) {
  return this.find({
    user: userId,
    monthYear: monthYear,
    status: 'completed',
  }).populate('doctor', 'name specialization hospital');
};

// Static: Get visits for a user in a specific week
visitSchema.statics.getWeeklyVisits = function (userId, yearWeekKey) {
  return this.find({
    user: userId,
    yearWeekKey: yearWeekKey,
    status: 'completed',
  }).populate('doctor', 'name specialization hospital');
};

// Static: Count visits to a doctor by a user in a month
visitSchema.statics.countDoctorVisitsInMonth = async function (doctorId, userId, monthYear) {
  return this.countDocuments({
    doctor: doctorId,
    user: userId,
    monthYear: monthYear,
    status: 'completed',
  });
};

// Static: Check if user already visited doctor this week
visitSchema.statics.hasVisitedThisWeek = async function (doctorId, userId, yearWeekKey) {
  const visit = await this.findOne({
    doctor: doctorId,
    user: userId,
    yearWeekKey: yearWeekKey,
    status: 'completed',
  });
  return !!visit;
};

// Static: Get weekly compliance stats for a user
visitSchema.statics.getWeeklyComplianceStats = async function (userId, monthYear) {
  return this.aggregate([
    {
      $match: {
        user: new mongoose.Types.ObjectId(userId),
        monthYear: monthYear,
        status: 'completed',
      },
    },
    {
      $group: {
        _id: '$weekOfMonth',
        visitCount: { $sum: 1 },
        doctors: { $addToSet: '$doctor' },
      },
    },
    {
      $sort: { _id: 1 },
    },
  ]);
};

const Visit = mongoose.model('Visit', visitSchema);

module.exports = Visit;
