/**
 * Doctor Model (VIP Client)
 *
 * This model represents VIP Clients (doctors/healthcare providers) visited by BDMs (employees).
 *
 * Key features:
 * - Visit frequency: 2x or 4x monthly (no A/B/C/D categorization)
 * - Assignment-based access (assignedTo field)
 * - Name split into firstName + lastName for Call Plan Template format
 * - Free-form specialization (not enum)
 * - Level of engagement tracking (1-5 scale)
 * - Target products (3 slots with showcasing/accepted status)
 * - Programs and support type tracking
 */

const mongoose = require('mongoose');

const doctorSchema = new mongoose.Schema(
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
    // Free-form specialization (client uses "Pedia Hema", "Im Car", "Breast Surg", etc.)
    specialization: {
      type: String,
      trim: true,
    },
    // Single address field (merged from old hospital + address fields)
    clinicOfficeAddress: {
      type: String,
      trim: true,
      maxlength: [500, 'Clinic/Office address cannot exceed 500 characters'],
    },
    // GeoJSON for location-based queries
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        default: [0, 0],
      },
    },
    phone: {
      type: String,
      trim: true,
      match: [/^[0-9+\-() ]{10,20}$/, 'Please enter a valid phone number'],
    },
    email: {
      type: String,
      lowercase: true,
      trim: true,
      match: [
        /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
        'Please enter a valid email',
      ],
    },
    // Visit frequency: 2x or 4x monthly (replaces A/B/C/D category)
    visitFrequency: {
      type: Number,
      enum: {
        values: [2, 4],
        message: 'Visit frequency must be 2 or 4 visits per month',
      },
      default: 4,
      required: true,
    },
    // Employee assigned to visit this doctor
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    notes: {
      type: String,
      maxlength: [1000, 'Notes cannot exceed 1000 characters'],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    // Clinic/office schedule for planning
    clinicSchedule: {
      monday: { type: Boolean, default: true },
      tuesday: { type: Boolean, default: true },
      wednesday: { type: Boolean, default: true },
      thursday: { type: Boolean, default: true },
      friday: { type: Boolean, default: true },
    },
    // --- New fields (Task A.1) ---
    outletIndicator: {
      type: String,
      trim: true,
    },
    // Dynamic arrays — values managed via /api/programs and /api/support-types
    programsToImplement: [{ type: String, trim: true }],
    supportDuringCoverage: [{ type: String, trim: true }],
    // Level of engagement: 1=visited 4x, 2=knows BDM/products, 3=tried products, 4=in GC, 5=active partner
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
    // 3 target product slots — BDM showcases products, marks as accepted when VIP Client likes it
    targetProducts: [
      {
        product: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'CrmProduct',
        },
        status: {
          type: String,
          enum: {
            values: ['showcasing', 'accepted'],
            message: 'Product status must be showcasing or accepted',
          },
          default: 'showcasing',
        },
      },
    ],
    // Whether admin has approved this doctor as VIP partner
    isVipAssociated: {
      type: Boolean,
      default: false,
    },
    // Lookup: VIP_CLIENT_TYPE — no hardcoded enum (Phase C compliance)
    // Distinguishes MDs from other stakeholders (pharmacist, purchaser, administrator, etc.)
    clientType: {
      type: String,
      trim: true,
      default: 'MD',
    },
    // Hospital affiliations — VIP Clients can be at multiple hospitals
    // MDs bring patients to different hospitals; stakeholders may serve multiple facilities
    hospitals: [{
      hospital_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' },
      is_primary: { type: Boolean, default: false },
    }],
  },
  {
    collection: 'doctors',
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes for performance
doctorSchema.index({ assignedTo: 1 });
doctorSchema.index({ specialization: 1 });
doctorSchema.index({ isActive: 1 });
doctorSchema.index({ firstName: 'text', lastName: 'text', clinicOfficeAddress: 'text' }); // Text search
doctorSchema.index({ location: '2dsphere' }); // Geospatial queries
// Compound indexes for common query patterns
doctorSchema.index({ assignedTo: 1, isActive: 1 });
doctorSchema.index({ lastName: 1, firstName: 1 }); // For alphabetical sorting
doctorSchema.index({ supportDuringCoverage: 1 });
doctorSchema.index({ programsToImplement: 1 });
doctorSchema.index({ clientType: 1 });
doctorSchema.index({ 'hospitals.hospital_id': 1 });

// Virtual: Full name (combines firstName and lastName)
doctorSchema.virtual('fullName').get(function () {
  return `${this.firstName || ''} ${this.lastName || ''}`.trim();
});

// Virtual: Get assigned products (populated via ProductAssignment)
doctorSchema.virtual('assignedProducts', {
  ref: 'ProductAssignment',
  localField: '_id',
  foreignField: 'doctor',
  match: { status: 'active' },
});

// Static: Find doctors assigned to an employee
doctorSchema.statics.findByEmployee = function (employeeId) {
  return this.find({ assignedTo: employeeId, isActive: true });
};

// Static: Find doctors by specialization
doctorSchema.statics.findBySpecialization = function (specialization) {
  return this.find({ specialization, isActive: true });
};

// Instance: Check if doctor is available on a given day
doctorSchema.methods.isAvailableOnDay = function (dayOfWeek) {
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const day = days[dayOfWeek];
  // Only check Mon-Fri (work days)
  if (dayOfWeek === 0 || dayOfWeek === 6) return false;
  return this.clinicSchedule?.[day] !== false;
};

// Pre-save hook: auto-clean firstName/lastName to proper case (lookup-driven)
doctorSchema.pre('save', async function (next) {
  if (!this.isModified('firstName') && !this.isModified('lastName')) return next();
  try {
    const { loadNameRules, cleanName } = require('../utils/nameCleanup');
    const rules = await loadNameRules(null);
    if (this.isModified('firstName') && this.firstName) {
      this.firstName = cleanName(this.firstName, rules);
    }
    if (this.isModified('lastName') && this.lastName) {
      this.lastName = cleanName(this.lastName, rules);
    }
    next();
  } catch (error) {
    next(error);
  }
});

// Pre-delete hook to cascade delete related ProductAssignments
doctorSchema.pre('deleteOne', { document: true, query: false }, async function (next) {
  try {
    const ProductAssignment = mongoose.model('ProductAssignment');
    await ProductAssignment.deleteMany({ doctor: this._id });
    next();
  } catch (error) {
    next(error);
  }
});

// Also handle findOneAndDelete and deleteMany via query middleware
doctorSchema.pre('findOneAndDelete', async function (next) {
  try {
    const doc = await this.model.findOne(this.getFilter());
    if (doc) {
      const ProductAssignment = mongoose.model('ProductAssignment');
      await ProductAssignment.deleteMany({ doctor: doc._id });
    }
    next();
  } catch (error) {
    next(error);
  }
});

const Doctor = mongoose.model('Doctor', doctorSchema);

module.exports = Doctor;
