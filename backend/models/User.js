/**
 * User Model
 *
 * This model represents system users (admins, field employees/BDMs)
 *
 * Roles:
 * - admin: Full system access, manage all users
 * - employee: Field employee (BDM) - logs visits to assigned doctors
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
        // RFC 5322 compliant email regex supporting modern TLDs (e.g., .technology, .museum)
        /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/,
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
        values: ['admin', 'employee'],
        message: 'Role must be admin or employee',
      },
      default: 'employee',
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
    // Track last activity (updated on each authenticated request, throttled to 1/min)
    lastActivity: {
      type: Date,
      default: null,
    },
    // Refresh token for JWT auth
    refreshToken: {
      type: String,
      select: false,
    },
    // Account lockout fields for brute force protection
    failedLoginAttempts: {
      type: Number,
      default: 0,
    },
    lockoutUntil: {
      type: Date,
      default: null,
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
        delete ret.failedLoginAttempts;
        delete ret.lockoutUntil;
        delete ret.__v;
        return ret;
      },
    },
  }
);

// Indexes for performance
userSchema.index({ email: 1 });
userSchema.index({ role: 1 });
userSchema.index({ isActive: 1 });
// Compound indexes for common query patterns
userSchema.index({ role: 1, isActive: 1 });
// TTL index to auto-expire password reset tokens
userSchema.index({ passwordResetExpires: 1 }, { expireAfterSeconds: 0 });

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

// Static method to find user by email with password and lockout fields
userSchema.statics.findByEmailWithPassword = function (email) {
  return this.findOne({ email }).select('+password +failedLoginAttempts +lockoutUntil');
};

// Static method to find active users by role
userSchema.statics.findActiveByRole = function (role) {
  return this.find({ role, isActive: true });
};

// Account lockout configuration
const LOCKOUT_CONFIG = {
  MAX_ATTEMPTS: 5,
  LOCKOUT_DURATION_MS: 15 * 60 * 1000, // 15 minutes
};

// Instance method to check if account is locked
userSchema.methods.isLocked = function () {
  if (!this.lockoutUntil) return false;
  return this.lockoutUntil > new Date();
};

// Instance method to get remaining lockout time in seconds
userSchema.methods.getLockoutRemaining = function () {
  if (!this.lockoutUntil) return 0;
  const remaining = Math.ceil((this.lockoutUntil - new Date()) / 1000);
  return Math.max(0, remaining);
};

// Instance method to handle failed login
userSchema.methods.handleFailedLogin = async function () {
  this.failedLoginAttempts = (this.failedLoginAttempts || 0) + 1;

  // Lock account after MAX_ATTEMPTS failed attempts
  if (this.failedLoginAttempts >= LOCKOUT_CONFIG.MAX_ATTEMPTS) {
    this.lockoutUntil = new Date(Date.now() + LOCKOUT_CONFIG.LOCKOUT_DURATION_MS);
  }

  await this.save();
  return this.failedLoginAttempts;
};

// Instance method to reset login attempts on successful login
userSchema.methods.resetLoginAttempts = async function () {
  if (this.failedLoginAttempts > 0 || this.lockoutUntil) {
    this.failedLoginAttempts = 0;
    this.lockoutUntil = null;
    await this.save();
  }
};

const User = mongoose.model('User', userSchema);

module.exports = User;
