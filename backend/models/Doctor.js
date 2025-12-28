/**
 * Doctor Model
 *
 * This model represents doctors/healthcare providers visited by field employees
 *
 * Key features:
 * - Visit frequency: 2x or 4x monthly (no A/B/C/D categorization)
 * - Region-based assignment for employee filtering
 * - Specialization for med rep product targeting
 */

const mongoose = require('mongoose');

const doctorSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Doctor name is required'],
      trim: true,
      maxlength: [100, 'Name cannot exceed 100 characters'],
    },
    specialization: {
      type: String,
      required: [true, 'Specialization is required'],
      trim: true,
      enum: {
        values: [
          'IM Gastro',
          'Pediatrics',
          'General Surgery',
          'ENT',
          'Urology',
          'Internal Medicine',
          'Cardiology',
          'Dermatology',
          'Neurology',
          'Orthopedics',
          'Obstetrics/Gynecology',
          'Ophthalmology',
          'Pulmonology',
          'Nephrology',
          'Oncology',
          'General Practice',
          'Other',
        ],
        message: 'Invalid specialization',
      },
    },
    hospital: {
      type: String,
      required: [true, 'Hospital/Clinic name is required'],
      trim: true,
      maxlength: [200, 'Hospital name cannot exceed 200 characters'],
    },
    address: {
      street: { type: String, trim: true },
      city: { type: String, trim: true },
      province: { type: String, trim: true },
      postalCode: { type: String, trim: true },
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
    region: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Region',
      required: [true, 'Region is required'],
    },
    // Parent regions for hierarchical filtering (auto-populated on save)
    // Stores ancestor chain: e.g., if region is ILO-CITY, stores [ILO, REG-VI, PH]
    parentRegions: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Region',
      },
    ],
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
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes for performance
doctorSchema.index({ region: 1 });
doctorSchema.index({ parentRegions: 1 }); // For hierarchical region queries
doctorSchema.index({ assignedTo: 1 });
doctorSchema.index({ specialization: 1 });
doctorSchema.index({ isActive: 1 });
doctorSchema.index({ name: 'text', hospital: 'text' }); // Text search
doctorSchema.index({ location: '2dsphere' }); // Geospatial queries
// Compound indexes for common query patterns
doctorSchema.index({ region: 1, isActive: 1 });
doctorSchema.index({ assignedTo: 1, isActive: 1 });
doctorSchema.index({ specialization: 1, region: 1 });
doctorSchema.index({ parentRegions: 1, isActive: 1 });

// Pre-save hook to auto-populate parentRegions from region hierarchy
doctorSchema.pre('save', async function (next) {
  // Only update parentRegions if region has changed
  if (this.isModified('region') && this.region) {
    const Region = mongoose.model('Region');
    const ancestors = await Region.getAncestorChain(this.region);

    // Store all ancestor IDs except the region itself
    this.parentRegions = ancestors
      .filter((ancestor) => ancestor._id.toString() !== this.region.toString())
      .map((ancestor) => ancestor._id);
  }
  next();
});

// Virtual: Full address string
doctorSchema.virtual('fullAddress').get(function () {
  const parts = [];
  if (this.address?.street) parts.push(this.address.street);
  if (this.address?.city) parts.push(this.address.city);
  if (this.address?.province) parts.push(this.address.province);
  if (this.address?.postalCode) parts.push(this.address.postalCode);
  return parts.join(', ');
});

// Virtual: Get assigned products (populated via ProductAssignment)
doctorSchema.virtual('assignedProducts', {
  ref: 'ProductAssignment',
  localField: '_id',
  foreignField: 'doctor',
  match: { status: 'active' },
});

// Static: Find doctors by region
doctorSchema.statics.findByRegion = function (regionId) {
  return this.find({ region: regionId, isActive: true });
};

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
