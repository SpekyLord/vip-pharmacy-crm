/**
 * Client Model (Regular / Non-VIP Client)
 *
 * Simplified Doctor-like schema for regular clients that BDMs visit
 * as "extra calls" — clients NOT on the VIP Client list.
 *
 * Key differences from Doctor:
 * - No visitFrequency, no clinicSchedule, no targetProducts
 * - Owned by BDM who created (createdBy), not admin-assignable
 * - No engagement level, no programs, no support types
 * - Daily limit: 30 extra calls per day (enforced at controller level)
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
      match: [/^[0-9+\-() ]{10,20}$/, 'Please enter a valid phone number'],
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
