/**
 * User Model
 *
 * This model represents system users (admins, med reps, field employees)
 *
 * Roles:
 * - admin: Full system access, can see all regions, manage all users
 * - medrep: Medical representative - assigns products to doctors
 * - employee: Field employee - logs visits to doctors in assigned region
 */

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      maxlength: [100, 'Name cannot exceed 100 characters'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [
        /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
        'Please enter a valid email',
      ],
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [8, 'Password must be at least 8 characters'],
      select: false, // Don't include password in queries by default
    },
    role: {
      type: String,
      enum: {
        values: ['admin', 'medrep', 'employee'],
        message: 'Role must be admin, medrep, or employee',
      },
      default: 'employee',
    },
    // For employees: the regions they are assigned to visit
    assignedRegions: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Region',
      },
    ],
    // For admin users: whether they can access all regions or just assigned ones
    canAccessAllRegions: {
      type: Boolean,
      default: function () {
        return this.role === 'admin';
      },
    },
    phone: {
      type: String,
      trim: true,
      match: [/^[0-9+\-() ]{10,20}$/, 'Please enter a valid phone number'],
    },
    avatar: {
      type: String, // S3 URL
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    // Password reset fields
    passwordResetToken: {
      type: String,
      select: false,
    },
    passwordResetExpires: {
      type: Date,
      select: false,
    },
    // Track last login
    lastLogin: {
      type: Date,
      default: null,
    },
    // Refresh token for JWT auth
    refreshToken: {
      type: String,
      select: false,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: function (doc, ret) {
        delete ret.password;
        delete ret.refreshToken;
        delete ret.passwordResetToken;
        delete ret.passwordResetExpires;
        delete ret.__v;
        return ret;
      },
    },
  }
);

// Indexes for performance
userSchema.index({ email: 1 });
userSchema.index({ role: 1 });
userSchema.index({ assignedRegions: 1 });
userSchema.index({ isActive: 1 });

// Pre-save hook to hash password
userSchema.pre('save', async function (next) {
  // Only hash if password is modified
  if (!this.isModified('password')) {
    return next();
  }

  // Hash password with 12 rounds
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Instance method to compare passwords
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Instance method to check if user can access a specific region (hierarchical)
userSchema.methods.canAccessRegion = async function (regionId) {
  if (this.role === 'admin' && this.canAccessAllRegions) {
    return true;
  }
  if (this.role === 'medrep') {
    // Med reps can access all doctors for product assignment
    return true;
  }

  // Employees can access their assigned regions AND all descendant regions
  const Region = require('./Region');
  const targetRegionStr = (regionId._id || regionId).toString();

  for (const region of this.assignedRegions) {
    const assignedId = region._id || region;
    const descendants = await Region.getDescendantIds(assignedId);
    const hasAccess = descendants.some((id) => id.toString() === targetRegionStr);
    if (hasAccess) {
      return true;
    }
  }
  return false;
};

// Static method to find user by email with password
userSchema.statics.findByEmailWithPassword = function (email) {
  return this.findOne({ email }).select('+password');
};

// Static method to find active users by role
userSchema.statics.findActiveByRole = function (role) {
  return this.find({ role, isActive: true });
};

const User = mongoose.model('User', userSchema);

module.exports = User;
