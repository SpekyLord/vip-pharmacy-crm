/**
 * Client Model (Regular / Non-VIP Client)
 *
 * Mirrors the Doctor (VIP) schema so regular clients can be upgraded
 * to VIP without re-entering data.
 */

const mongoose = require('mongoose');

const clientSchema = new mongoose.Schema(
  {
    firstName: {
      type: String,
      required: [true, 'First name is required'],
      trim: true,
      maxlength: [50, 'First name cannot exceed 50 characters'],
    },
    lastName: {
      type: String,
      required: [true, 'Last name is required'],
      trim: true,
      maxlength: [50, 'Last name cannot exceed 50 characters'],
    },
    specialization: {
      type: String,
      trim: true,
      maxlength: [100, 'Specialization cannot exceed 100 characters'],
    },
    clinicOfficeAddress: {
      type: String,
      trim: true,
      maxlength: [500, 'Clinic/Office address cannot exceed 500 characters'],
    },
    phone: {
      type: String,
      trim: true,
    },
    email: {
      type: String,
      lowercase: true,
      trim: true,
    },
    // BDM who created this client — always the owner
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Creator (BDM) is required'],
    },
    notes: {
      type: String,
      maxlength: [1000, 'Notes cannot exceed 1000 characters'],
    },
    // Scheduling mode: flexible (visit anytime) vs strict (enforced schedule)
    schedulingMode: {
      type: String,
      enum: ['flexible', 'strict'],
      default: 'flexible',
    },
    // Visit scheduling — same rules as VIP clients (only enforced in strict mode)
    visitFrequency: {
      type: Number,
      enum: [2, 4],
      default: 4,
    },
    weekSchedule: {
      w1: { type: Number, min: 1, max: 5 },
      w2: { type: Number, min: 1, max: 5 },
      w3: { type: Number, min: 1, max: 5 },
      w4: { type: Number, min: 1, max: 5 },
    },
    // --- Fields matching Doctor model for seamless VIP upgrade ---
    outletIndicator: {
      type: String,
      trim: true,
    },
    // Dynamic arrays — values managed via /api/programs and /api/support-types
    programsToImplement: [{ type: String, trim: true }],
    supportDuringCoverage: [{ type: String, trim: true }],
    levelOfEngagement: {
      type: Number,
      min: [1, 'Level of engagement must be at least 1'],
      max: [5, 'Level of engagement cannot exceed 5'],
    },
    secretaryName: {
      type: String,
      trim: true,
    },
    secretaryPhone: {
      type: String,
      trim: true,
    },
    // Multi-channel contact info
    whatsappNumber: {
      type: String,
      trim: true,
    },
    viberId: {
      type: String,
      trim: true,
      maxlength: [100, 'Viber ID cannot exceed 100 characters'],
    },
    messengerId: {
      type: String,
      trim: true,
      maxlength: [100, 'Messenger ID cannot exceed 100 characters'],
    },
    preferredChannel: {
      type: String,
      trim: true,
    },
    birthday: {
      type: Date,
    },
    anniversary: {
      type: Date,
    },
    otherDetails: {
      type: String,
      maxlength: [2000, 'Other details cannot exceed 2000 characters'],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes
clientSchema.index({ createdBy: 1 });
clientSchema.index({ isActive: 1 });
clientSchema.index({ firstName: 'text', lastName: 'text', clinicOfficeAddress: 'text' });
clientSchema.index({ createdBy: 1, isActive: 1 });
clientSchema.index({ createdBy: 1, isActive: 1, schedulingMode: 1 });
clientSchema.index({ lastName: 1, firstName: 1 });

// Virtual: Full name
clientSchema.virtual('fullName').get(function () {
  return `${this.firstName || ''} ${this.lastName || ''}`.trim();
});

// Static: Find clients created by an employee
clientSchema.statics.findByEmployee = function (employeeId) {
  return this.find({ createdBy: employeeId, isActive: true });
};

const Client = mongoose.model('Client', clientSchema);

module.exports = Client;
