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
    .populate('entity_id', 'entity_name short_name')
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
  const { name, email, password, role, phone, entity_id } = req.body;

  // Create user
  const user = await User.create({
    name,
    email,
    password,
    role: role || 'employee',
    phone,
    entity_id: entity_id || undefined,
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
    allowedFields.push('role', 'isActive', 'entity_id', 'erp_access');
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
 * @desc    Get active entities for dropdown (CRM-accessible)
 * @route   GET /api/users/lookup/entities
 * @access  Admin only
 */
const getEntities = catchAsync(async (req, res) => {
  const Entity = require('../erp/models/Entity');
  const entities = await Entity.find({ status: 'ACTIVE' })
    .select('entity_name short_name entity_type')
    .sort({ entity_name: 1 })
    .lean();
  res.json({ success: true, data: entities });
});

/**
 * @desc    Get active access templates for dropdown (CRM-accessible)
 * @route   GET /api/users/lookup/access-templates
 * @access  Admin only
 */
const getAccessTemplates = catchAsync(async (req, res) => {
  const AccessTemplate = require('../erp/models/AccessTemplate');
  const filter = { is_active: true };
  if (req.query.entity_id) filter.entity_id = req.query.entity_id;
  const templates = await AccessTemplate.find(filter)
    .select('template_name entity_id modules can_approve')
    .sort({ template_name: 1 })
    .lean();
  res.json({ success: true, data: templates });
});

/**
 * @desc    Sync CRM users with erp_access.enabled to ERP People Master
 * @route   POST /api/users/sync-to-erp
 * @access  Admin only
 */
const syncToErp = catchAsync(async (req, res) => {
  const PeopleMaster = require('../erp/models/PeopleMaster');

  // Find all CRM users with erp_access enabled and entity assigned
  const crmUsers = await User.find({
    'erp_access.enabled': true,
    entity_id: { $ne: null },
  })
    .select('_id name email phone role entity_id territory_id avatar bdm_stage live_date')
    .lean();

  const typeMap = {
    admin: 'EMPLOYEE',
    president: 'DIRECTOR',
    ceo: 'DIRECTOR',
    employee: 'BDM',
    finance: 'EMPLOYEE',
  };

  let created = 0, updated = 0, skipped = 0;

  for (const u of crmUsers) {
    const existing = await PeopleMaster.findOne({ user_id: u._id });

    if (existing) {
      // Update basic fields if changed
      const updates = {};
      if (u.email && u.email !== existing.email) updates.email = u.email;
      if (u.phone && u.phone !== existing.phone) updates.phone = u.phone;
      if (u.avatar && u.avatar !== existing.avatar) updates.avatar = u.avatar;
      if (u.territory_id && u.territory_id?.toString() !== existing.territory_id?.toString()) updates.territory_id = u.territory_id;
      if (u.bdm_stage && u.bdm_stage !== existing.bdm_stage) updates.bdm_stage = u.bdm_stage;
      if (u.live_date && u.live_date?.toISOString() !== existing.live_date?.toISOString()) updates.live_date = u.live_date;

      if (Object.keys(updates).length > 0) {
        await PeopleMaster.updateOne({ _id: existing._id }, { $set: updates });
        updated++;
      } else {
        skipped++;
      }
      continue;
    }

    // Create new PeopleMaster record
    const nameParts = (u.name || '').trim().split(/\s+/);
    await PeopleMaster.create({
      entity_id: u.entity_id,
      user_id: u._id,
      person_type: typeMap[u.role] || 'EMPLOYEE',
      full_name: u.name,
      first_name: nameParts[0] || u.name,
      last_name: nameParts.slice(1).join(' ') || '',
      email: u.email || '',
      phone: u.phone || '',
      avatar: u.avatar || '',
      territory_id: u.territory_id || undefined,
      bdm_stage: u.bdm_stage || undefined,
      live_date: u.live_date || undefined,
      position: u.role === 'employee' ? 'BDM' : u.role,
      department: u.role === 'employee' ? 'SALES' : 'ADMIN',
      employment_type: 'REGULAR',
      is_active: true,
    });
    created++;
  }

  res.json({
    success: true,
    message: `Synced: ${created} created, ${updated} updated, ${skipped} unchanged`,
    data: { created, updated, skipped, total_crm_users: crmUsers.length },
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
  getEntities,
  getAccessTemplates,
  syncToErp,
};
