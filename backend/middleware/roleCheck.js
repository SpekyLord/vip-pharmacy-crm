/**
 * Role-Based Authorization Middleware
 *
 * This file handles:
 * - Role-based access control (RBAC)
 * - Permission checking
 * - Access denial handling
 *
 * Roles:
 * - admin: Full system access
 * - employee: Field employee (BDM) - can only access assigned doctors
 */

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
 * Shortcut for roleCheck('admin')
 */
const adminOnly = roleCheck('admin');

/**
 * Employee only middleware
 * Shortcut for roleCheck('employee')
 */
const employeeOnly = roleCheck('employee');

/**
 * Admin or Employee middleware
 * For routes accessible by both admin and employees
 */
const adminOrEmployee = roleCheck('admin', 'employee');

/**
 * All authenticated users middleware
 * For routes accessible by any authenticated user
 */
const anyRole = roleCheck('admin', 'employee');

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

    // Admin can access any user
    if (req.user.role === 'admin') {
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
 * Validate that the current user is the assigned employee for a doctor
 * Use for visit creation to ensure employees only visit doctors assigned to them
 */
const isAssignedToDoctor = async (req, res, next) => {
  // Check if user is authenticated
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required. Please log in.',
    });
  }

  // Admin can access any doctor
  if (req.user.role === 'admin') {
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

    // Check if doctor is assigned to this BDM
    if (req.user.role === 'employee') {
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
  employeeOnly,
  adminOrEmployee,
  anyRole,
  isOwnerOrAdmin,
  isAssignedToDoctor,
};
