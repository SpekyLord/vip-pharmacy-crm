/**
 * Role-Based Authorization Middleware
 *
 * This file handles:
 * - Role-based access control (RBAC)
 * - Permission checking
 * - Access denial handling
 *
 * Roles defined in backend/constants/roles.js
 */

const { ROLES, ROLE_SETS, isAdminLike } = require('../constants/roles');

/**
 * Check if user has one of the allowed roles
 * @param {...string} allowedRoles - Roles that are permitted to access the route
 * @returns {Function} Express middleware function
 */
const roleCheck = (...allowedRoles) => {
  return (req, res, next) => {
    // Check if user is authenticated
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required. Please log in.',
      });
    }

    // President always has full access (supersedes all role checks)
    if (req.user.role === ROLES.PRESIDENT) return next();

    // Check if user's role is in the allowed roles list
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Access denied. This action requires one of the following roles: ${allowedRoles.join(', ')}.`,
      });
    }

    next();
  };
};

/**
 * Admin only middleware
 * Shortcut for roleCheck with admin-like roles
 */
const adminOnly = roleCheck(...ROLE_SETS.ADMIN_LIKE);

/**
 * Staff only middleware (BDMs, field staff, non-management workers).
 * Back-compat aliased as `employeeOnly` because many route files import
 * that name; the function body keys off ROLES.STAFF.
 */
const staffOnly = roleCheck(ROLES.STAFF);
const employeeOnly = staffOnly;

/**
 * Admin or Staff middleware
 * For routes accessible by both admin and non-management workers
 */
const adminOrStaff = roleCheck(...ROLE_SETS.ADMIN_LIKE, ROLES.STAFF);
const adminOrEmployee = adminOrStaff; // legacy alias

/**
 * All authenticated users middleware
 * For routes accessible by any authenticated user
 */
const anyRole = roleCheck(...ROLE_SETS.ADMIN_LIKE, ROLES.STAFF);

/**
 * Check if user owns the resource (for user profile updates)
 * @param {string} userIdParam - Request parameter name containing user ID (default: 'id')
 * @returns {Function} Express middleware function
 */
const isOwnerOrAdmin = (userIdParam = 'id') => {
  return (req, res, next) => {
    // Check if user is authenticated
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required. Please log in.',
      });
    }

    // Admin-like can access any user
    if (isAdminLike(req.user.role)) {
      return next();
    }

    // Get user ID from params
    const targetUserId = req.params[userIdParam];

    // Check if user is accessing their own resource
    if (req.user._id.toString() === targetUserId) {
      return next();
    }

    return res.status(403).json({
      success: false,
      message: 'Access denied. You can only access your own resources.',
    });
  };
};

/**
 * Validate that the current user is the assigned staff member for a doctor.
 * Use for visit creation to ensure non-management users only visit doctors
 * assigned to them.
 */
const isAssignedToDoctor = async (req, res, next) => {
  // Check if user is authenticated
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required. Please log in.',
    });
  }

  // Admin-like can access any doctor
  if (isAdminLike(req.user.role)) {
    return next();
  }

  // Get doctor ID from params or body
  const doctorId = req.params.doctorId || req.body?.doctor;

  if (!doctorId) {
    return res.status(400).json({
      success: false,
      message: 'Doctor ID is required.',
    });
  }

  try {
    const Doctor = require('../models/Doctor');
    const doctor = await Doctor.findById(doctorId);

    if (!doctor) {
      return res.status(404).json({
        success: false,
        message: 'Doctor not found.',
      });
    }

    // Check if doctor is assigned to this staff member
    if (req.user.role === ROLES.STAFF) {
      const assignedToId = doctor.assignedTo?._id || doctor.assignedTo;
      if (!assignedToId || assignedToId.toString() !== req.user._id.toString()) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. This VIP Client is not assigned to you.',
        });
      }
    }

    // Attach doctor to request for later use
    req.doctor = doctor;
    next();
  } catch (error) {
    console.error('Error checking doctor assignment:', error);
    return res.status(500).json({
      success: false,
      message: 'Error verifying doctor assignment.',
    });
  }
};

module.exports = {
  roleCheck,
  adminOnly,
  staffOnly,
  employeeOnly,       // legacy alias → staffOnly
  adminOrStaff,
  adminOrEmployee,    // legacy alias → adminOrStaff
  anyRole,
  isOwnerOrAdmin,
  isAssignedToDoctor,
};
