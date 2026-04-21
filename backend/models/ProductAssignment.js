/**
 * Product Assignment Model
 *
 * This model represents product-to-doctor assignments made by admins
 *
 * Key features:
 * - Admins and BDMs can create/manage assignments
 * - Simplified status (active/inactive only)
 * - Used to show relevant products during BDM visits
 */
const { ROLES } = require('../constants/roles');

const mongoose = require('mongoose');

const productAssignmentSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CrmProduct',
      required: [true, 'Product is required'],
    },
    doctor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Doctor',
      required: [true, 'Doctor is required'],
    },
    // User who made the assignment (admin or BDM)
    assignedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Assigned by user is required'],
    },
    assignedDate: {
      type: Date,
      default: Date.now,
    },
    // Simple status: active or inactive
    status: {
      type: String,
      enum: {
        values: ['active', 'inactive'],
        message: 'Status must be active or inactive',
      },
      default: 'active',
    },
    // Priority level for ordering product presentation
    priority: {
      type: Number,
      enum: [1, 2, 3], // 1 = high, 2 = medium, 3 = low
      default: 2,
    },
    // Notes about why this product is assigned to this doctor
    notes: {
      type: String,
      maxlength: [500, 'Notes cannot exceed 500 characters'],
    },
    // Reason for deactivation (if status is inactive)
    deactivationReason: {
      type: String,
      maxlength: [500, 'Deactivation reason cannot exceed 500 characters'],
    },
    deactivatedAt: {
      type: Date,
    },
    deactivatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Compound index to prevent duplicate active assignments
productAssignmentSchema.index(
  { product: 1, doctor: 1 },
  {
    unique: true,
    partialFilterExpression: { status: 'active' },
  }
);

// Other indexes for performance
productAssignmentSchema.index({ doctor: 1, status: 1 });
productAssignmentSchema.index({ product: 1, status: 1 });
productAssignmentSchema.index({ assignedBy: 1 });
productAssignmentSchema.index({ status: 1 });
productAssignmentSchema.index({ priority: 1 });

// Pre-save validation to ensure assignedBy is an admin or contractor
productAssignmentSchema.pre('save', async function (next) {
  if (this.isNew || this.isModified('assignedBy')) {
    const User = mongoose.model('User');
    const user = await User.findById(this.assignedBy);

    if (!user) {
      return next(new Error('Assigned user not found'));
    }

    if (user.role !== ROLES.ADMIN && user.role !== ROLES.CONTRACTOR) {
      return next(new Error('Only admins or BDMs can assign products to doctors'));
    }
  }
  next();
});

// Pre-save hook to set deactivation fields
productAssignmentSchema.pre('save', function (next) {
  if (this.isModified('status') && this.status === 'inactive' && !this.deactivatedAt) {
    this.deactivatedAt = new Date();
  }
  next();
});

// Static: Get active assignments for a doctor (for employee visit view)
// NOTE: Product data must be populated manually from website database
productAssignmentSchema.statics.getActiveForDoctor = function (doctorId) {
  return this.find({
    doctor: doctorId,
    status: 'active',
  })
    .sort({ priority: 1 })
    .lean();
};

// Static: Get active assignments by a user (admin or BDM)
// NOTE: Product data must be populated manually from website database
productAssignmentSchema.statics.getByUser = function (userId) {
  return this.find({
    assignedBy: userId,
    status: 'active',
  })
    .populate('doctor', 'firstName lastName specialization clinicOfficeAddress locality province')
    .sort({ createdAt: -1 });
};

// Static: Get all doctors assigned a specific product
productAssignmentSchema.statics.getDoctorsForProduct = function (productId) {
  return this.find({
    product: productId,
    status: 'active',
  })
    .populate('doctor', 'firstName lastName specialization clinicOfficeAddress locality province')
    .sort({ priority: 1 });
};

// Static: Check if product is already assigned to doctor
productAssignmentSchema.statics.isAssigned = async function (productId, doctorId) {
  const assignment = await this.findOne({
    product: productId,
    doctor: doctorId,
    status: 'active',
  });
  return !!assignment;
};

// Static: Bulk assign products to a doctor
productAssignmentSchema.statics.bulkAssign = async function (
  doctorId,
  productIds,
  assignedBy
) {
  const assignments = productIds.map((productId) => ({
    product: productId,
    doctor: doctorId,
    assignedBy,
    status: 'active',
  }));

  // Use insertMany with ordered: false to continue on duplicates
  return this.insertMany(assignments, { ordered: false });
};

// Static: Deactivate assignment
productAssignmentSchema.statics.deactivate = async function (
  assignmentId,
  userId,
  reason
) {
  return this.findByIdAndUpdate(
    assignmentId,
    {
      status: 'inactive',
      deactivatedBy: userId,
      deactivatedAt: new Date(),
      deactivationReason: reason,
    },
    { new: true }
  );
};

// Instance method to deactivate
productAssignmentSchema.methods.deactivate = function (userId, reason) {
  this.status = 'inactive';
  this.deactivatedBy = userId;
  this.deactivatedAt = new Date();
  this.deactivationReason = reason;
  return this.save();
};

const ProductAssignment = mongoose.model('ProductAssignment', productAssignmentSchema);

module.exports = ProductAssignment;
