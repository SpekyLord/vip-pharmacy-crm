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
  const limit = parseInt(req.query.limit, 10) || 20;
  const skip = (page - 1) * limit;

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
  const [users, total] = await Promise.all([
    User.find(filter)
      .select('-password -refreshToken')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    User.countDocuments(filter),
  ]);

  res.status(200).json({
    success: true,
    data: users,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
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
};
