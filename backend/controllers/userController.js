/**
 * User Controller
 *
 * Handles user CRUD operations and profile management
 * Follows CLAUDE.md rules:
 * - Two roles: admin, employee
 * - Region-based access control
 * - Admin can access all users
 */

const User = require('../models/User');
const { catchAsync, NotFoundError, ForbiddenError } = require('../middleware/errorHandler');

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
  if (req.query.role && ['admin', 'employee'].includes(req.query.role)) {
    filter.role = req.query.role;
  }

  // Filter by active status
  if (req.query.isActive !== undefined) {
    filter.isActive = req.query.isActive === 'true';
  }

  // Filter by region
  if (req.query.region) {
    filter.assignedRegions = req.query.region;
  }

  // Search by name or email
  if (req.query.search) {
    filter.$or = [
      { name: { $regex: req.query.search, $options: 'i' } },
      { email: { $regex: req.query.search, $options: 'i' } },
    ];
  }

  // Execute query
  const [users, total] = await Promise.all([
    User.find(filter)
      .populate('assignedRegions', 'name code level')
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
    .populate('assignedRegions', 'name code level')
    .select('-password -refreshToken');

  if (!user) {
    throw new NotFoundError('User not found');
  }

  // Check if user can access this resource
  if (req.user.role !== 'admin' && req.user._id.toString() !== user._id.toString()) {
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
  const { name, email, password, role, phone, assignedRegions } = req.body;

  // Create user
  const user = await User.create({
    name,
    email,
    password,
    role: role || 'employee',
    phone,
    assignedRegions: assignedRegions || [],
    canAccessAllRegions: role === 'admin',
  });

  // Populate regions for response
  await user.populate('assignedRegions', 'name code level');

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

  const isAdmin = req.user.role === 'admin';
  const isSelf = req.user._id.toString() === user._id.toString();

  if (!isAdmin && !isSelf) {
    throw new ForbiddenError('You can only update your own profile');
  }

  // Fields that can be updated
  const allowedFields = ['name', 'phone', 'avatar'];

  // Admin can update additional fields
  if (isAdmin) {
    allowedFields.push('role', 'assignedRegions', 'isActive', 'canAccessAllRegions');
  }

  // Update only allowed fields
  allowedFields.forEach((field) => {
    if (req.body[field] !== undefined) {
      user[field] = req.body[field];
    }
  });

  // If role is set to admin, enable canAccessAllRegions
  if (req.body.role === 'admin') {
    user.canAccessAllRegions = true;
  }

  await user.save();
  await user.populate('assignedRegions', 'name code level');

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

  // Filter by region if specified
  if (req.query.region) {
    filter.assignedRegions = req.query.region;
  }

  const employees = await User.find(filter)
    .populate('assignedRegions', 'name code level')
    .select('name email phone assignedRegions isActive lastLogin')
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
    .populate('assignedRegions', 'name code level')
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
  await user.populate('assignedRegions', 'name code level');

  res.status(200).json({
    success: true,
    message: 'Profile updated successfully',
    data: user,
  });
});

/**
 * @desc    Update user's assigned regions
 * @route   PUT /api/users/:id/regions
 * @access  Admin only
 */
const assignRegions = catchAsync(async (req, res) => {
  const { assignedRegions } = req.body;

  if (!Array.isArray(assignedRegions)) {
    throw new ForbiddenError('assignedRegions must be an array');
  }

  const user = await User.findById(req.params.id);

  if (!user) {
    throw new NotFoundError('User not found');
  }

  user.assignedRegions = assignedRegions;
  await user.save();
  await user.populate('assignedRegions', 'name code level');

  res.status(200).json({
    success: true,
    message: 'User regions updated successfully',
    data: user,
  });
});

module.exports = {
  getAllUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  getEmployees,
  getProfile,
  updateProfile,
  assignRegions,
};
