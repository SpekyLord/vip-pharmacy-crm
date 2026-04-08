/**
 * User Controller
 *
 * Handles user CRUD operations and profile management
 * Follows CLAUDE.md rules:
 * - Two roles: admin, employee
 * - Admin can access all users
 */

const User = require('../models/User');
const { catchAsync, NotFoundError, ForbiddenError } = require('../middleware/errorHandler');
const { sanitizeSearchString } = require('../utils/controllerHelpers');
const { isCrmAdminLike } = require('../utils/roleHelpers');
const { logAuditEvent, AuditActions } = require('../utils/auditLogger');

/**
 * @desc    Get currently active users (lastActivity within 15 minutes)
 * @route   GET /api/users/active
 * @access  Admin only
 */
const getActiveUsers = catchAsync(async (req, res) => {
  const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000);

  const users = await User.find({
    isActive: true,
    role: 'employee',
    lastActivity: { $gte: fifteenMinAgo },
  })
    .select('name email lastActivity')
    .sort({ lastActivity: -1 });

  res.status(200).json({
    success: true,
    data: users,
    count: users.length,
  });
});

/**
 * @desc    Get all users with pagination and filters
 * @route   GET /api/users
 * @access  Admin only
 */
const getAllUsers = catchAsync(async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const rawLimit = req.query.limit;
  const limit = rawLimit === '0' || rawLimit === 0 ? 0 : (parseInt(rawLimit, 10) || 20);
  const skip = limit > 0 ? (page - 1) * limit : 0;

  // Build filter query
  const filter = {};

  // Filter by role
  if (req.query.role && ['admin', 'employee', 'finance', 'president', 'ceo'].includes(req.query.role)) {
    filter.role = req.query.role;
  }

  // Filter by active status
  if (req.query.isActive !== undefined) {
    filter.isActive = req.query.isActive === 'true';
  }

  // Search by name or email
  if (req.query.search) {
    const safeSearch = sanitizeSearchString(req.query.search);
    filter.$or = [
      { name: { $regex: safeSearch, $options: 'i' } },
      { email: { $regex: safeSearch, $options: 'i' } },
    ];
  }

  // Execute query
  const query = User.find(filter)
    .select('-password -refreshToken')
    .sort({ createdAt: -1 });
  if (limit > 0) query.skip(skip).limit(limit);

  const [users, total] = await Promise.all([
    query,
    User.countDocuments(filter),
  ]);

  res.status(200).json({
    success: true,
    data: users,
    pagination: {
      page,
      limit,
      total,
      pages: limit > 0 ? Math.ceil(total / limit) : 1,
    },
  });
});

/**
 * @desc    Get user by ID
 * @route   GET /api/users/:id
 * @access  Admin or self
 */
const getUserById = catchAsync(async (req, res) => {
  const user = await User.findById(req.params.id)
    .select('-password -refreshToken');

  if (!user) {
    throw new NotFoundError('User not found');
  }

  // Check if user can access this resource
  if (!isCrmAdminLike(req.user.role) && req.user._id.toString() !== user._id.toString()) {
    throw new ForbiddenError('You can only view your own profile');
  }

  res.status(200).json({
    success: true,
    data: user,
  });
});

/**
 * @desc    Create new user
 * @route   POST /api/users
 * @access  Admin only
 */
const createUser = catchAsync(async (req, res) => {
  const { name, email, password, role, phone } = req.body;

  // Create user
  const user = await User.create({
    name,
    email,
    password,
    role: role || 'employee',
    phone,
  });

  res.status(201).json({
    success: true,
    message: 'User created successfully',
    data: user,
  });
});

/**
 * @desc    Update user
 * @route   PUT /api/users/:id
 * @access  Admin or self (limited fields)
 */
const updateUser = catchAsync(async (req, res) => {
  const user = await User.findById(req.params.id);

  if (!user) {
    throw new NotFoundError('User not found');
  }

  const isAdmin = isCrmAdminLike(req.user.role);
  const isSelf = req.user._id.toString() === user._id.toString();

  if (!isAdmin && !isSelf) {
    throw new ForbiddenError('You can only update your own profile');
  }

  // Fields that can be updated
  const allowedFields = ['name', 'phone', 'avatar'];

  // Admin can update additional fields
  if (isAdmin) {
    allowedFields.push('role', 'isActive');
  }

  // Update only allowed fields
  allowedFields.forEach((field) => {
    if (req.body[field] !== undefined) {
      user[field] = req.body[field];
    }
  });

  await user.save();

  res.status(200).json({
    success: true,
    message: 'User updated successfully',
    data: user,
  });
});

/**
 * @desc    Deactivate user (soft delete)
 * @route   DELETE /api/users/:id
 * @access  Admin only
 */
const deleteUser = catchAsync(async (req, res) => {
  const user = await User.findById(req.params.id);

  if (!user) {
    throw new NotFoundError('User not found');
  }

  // Prevent self-deactivation
  if (req.user._id.toString() === user._id.toString()) {
    throw new ForbiddenError('You cannot deactivate your own account');
  }

  // Soft delete
  user.isActive = false;
  user.refreshToken = null;
  await user.save();

  res.status(200).json({
    success: true,
    message: 'User deactivated successfully',
  });
});

/**
 * @desc    Get all employees (for admin)
 * @route   GET /api/users/employees
 * @access  Admin
 */
const getEmployees = catchAsync(async (req, res) => {
  const filter = { role: 'employee', isActive: true };

  const employees = await User.find(filter)
    .select('name email phone isActive lastLogin')
    .sort({ name: 1 });

  res.status(200).json({
    success: true,
    data: employees,
    count: employees.length,
  });
});

/**
 * @desc    Get current user's profile
 * @route   GET /api/users/profile
 * @access  Private
 */
const getProfile = catchAsync(async (req, res) => {
  const user = await User.findById(req.user._id)
    .select('-password -refreshToken');

  res.status(200).json({
    success: true,
    data: user,
  });
});

/**
 * @desc    Update current user's profile
 * @route   PUT /api/users/profile
 * @access  Private
 */
const updateProfile = catchAsync(async (req, res) => {
  const user = await User.findById(req.user._id);

  if (!user) {
    throw new NotFoundError('User not found');
  }

  // Only allow updating limited fields for own profile
  const allowedFields = ['name', 'phone'];

  allowedFields.forEach((field) => {
    if (req.body[field] !== undefined) {
      user[field] = req.body[field];
    }
  });

  // Handle avatar upload if present
  if (req.file) {
    user.avatar = req.file.location || req.file.path;
  }

  await user.save();

  res.status(200).json({
    success: true,
    message: 'Profile updated successfully',
    data: user,
  });
});

/**
 * @desc    Admin reset a user's password (preserves all other fields including erp_access)
 * @route   PUT /api/users/:id/reset-password
 * @access  Admin only
 */
const resetUserPassword = catchAsync(async (req, res) => {
  const { newPassword } = req.body;

  if (!newPassword || newPassword.length < 8) {
    return res.status(400).json({
      success: false,
      message: 'Password must be at least 8 characters',
    });
  }

  const user = await User.findById(req.params.id);
  if (!user) {
    throw new NotFoundError('User not found');
  }

  // Set new password (pre-save hook hashes it), clear lockout, re-activate
  user.password = newPassword;
  user.failedLoginAttempts = 0;
  user.lockoutUntil = null;
  user.isActive = true;
  user.refreshToken = null; // Invalidate existing sessions
  await user.save();

  await logAuditEvent(AuditActions.PASSWORD_RESET_COMPLETE, {
    userId: user._id,
    req,
    details: { resetBy: req.user._id, adminReset: true },
  });

  res.status(200).json({
    success: true,
    message: `Password reset for ${user.name}. They can now log in with the new password.`,
  });
});

/**
 * @desc    Unlock a locked/deactivated user account (preserves erp_access)
 * @route   PUT /api/users/:id/unlock
 * @access  Admin only
 */
const unlockAccount = catchAsync(async (req, res) => {
  // Use $set to only touch lockout + active fields — never overwrites erp_access
  const result = await User.findByIdAndUpdate(
    req.params.id,
    {
      $set: {
        failedLoginAttempts: 0,
        lockoutUntil: null,
        isActive: true,
      },
    },
    { new: true }
  );

  if (!result) {
    throw new NotFoundError('User not found');
  }

  await logAuditEvent(AuditActions.ACCOUNT_UNLOCKED, {
    userId: result._id,
    req,
    details: { unlockedBy: req.user._id },
  });

  res.status(200).json({
    success: true,
    message: `Account unlocked and re-activated for ${result.name}.`,
  });
});

/**
 * @desc    Permanently delete a user (for cleaning up duplicate/orphaned logins)
 * @route   DELETE /api/users/:id/permanent
 * @access  Admin only
 */
const hardDeleteUser = catchAsync(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) {
    throw new NotFoundError('User not found');
  }

  // Prevent self-deletion
  if (req.user._id.toString() === user._id.toString()) {
    throw new ForbiddenError('You cannot delete your own account');
  }

  // Safety: prevent deleting the last active admin
  if (user.role === 'admin' && user.isActive) {
    const activeAdminCount = await User.countDocuments({ role: 'admin', isActive: true });
    if (activeAdminCount <= 1) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete the last active admin account',
      });
    }
  }

  // Unlink any PeopleMaster record that references this user
  try {
    const PeopleMaster = require('../erp/models/PeopleMaster');
    await PeopleMaster.updateMany(
      { user_id: user._id },
      { $set: { user_id: null } }
    );
  } catch {
    // PeopleMaster may not exist in CRM-only deployments — safe to ignore
  }

  const userName = user.name;
  const userEmail = user.email;
  await User.findByIdAndDelete(user._id);

  await logAuditEvent(AuditActions.USER_DELETED, {
    userId: user._id,
    req,
    details: { deletedBy: req.user._id, deletedUser: userName, deletedEmail: userEmail, permanent: true },
  });

  res.status(200).json({
    success: true,
    message: `User "${userName}" (${userEmail}) permanently deleted.`,
  });
});

module.exports = {
  getActiveUsers,
  getAllUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  getEmployees,
  getProfile,
  updateProfile,
  resetUserPassword,
  unlockAccount,
  hardDeleteUser,
};
