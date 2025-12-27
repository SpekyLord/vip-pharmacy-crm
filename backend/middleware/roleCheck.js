/**
 * Role-Based Authorization Middleware
 *
 * This file handles:
 * - Role-based access control (RBAC)
 * - Permission checking
 * - Regional access verification
 * - Access denial handling
 *
 * Roles:
 * - admin: Full system access, can access all regions
 * - medrep: Medical representative - can assign products to doctors
 * - employee: Field employee - can only access assigned regions
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
 * Med rep only middleware
 * Shortcut for roleCheck('medrep')
 */
const medRepOnly = roleCheck('medrep');

/**
 * Employee only middleware
 * Shortcut for roleCheck('employee')
 */
const employeeOnly = roleCheck('employee');

/**
 * Admin or Med rep middleware
 * For routes accessible by both admin and med reps
 */
const adminOrMedRep = roleCheck('admin', 'medrep');

/**
 * Admin or Employee middleware
 * For routes accessible by both admin and employees
 */
const adminOrEmployee = roleCheck('admin', 'employee');

/**
 * All authenticated users middleware
 * For routes accessible by any authenticated user
 */
const anyRole = roleCheck('admin', 'medrep', 'employee');

/**
 * Check if user can access a specific region
 * Use after auth middleware
 * @param {string} regionIdParam - Request parameter name containing region ID (default: 'regionId')
 * @returns {Function} Express middleware function
 */
const canAccessRegion = (regionIdParam = 'regionId') => {
  return async (req, res, next) => {
    // Check if user is authenticated
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required. Please log in.',
      });
    }

    // Admin with canAccessAllRegions can access any region
    if (req.user.role === 'admin' && req.user.canAccessAllRegions) {
      return next();
    }

    // Med reps can access all regions (for product assignment)
    if (req.user.role === 'medrep') {
      return next();
    }

    // Get region ID from params or body
    const regionId = req.params[regionIdParam] || req.body?.region || req.query?.region;

    if (!regionId) {
      // No region specified, allow access (will be filtered later)
      return next();
    }

    // Check if user has access to this region (async - includes descendant regions)
    if (req.user.canAccessRegion) {
      const hasAccess = await req.user.canAccessRegion(regionId);
      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. You are not assigned to this region.',
        });
      }
    } else {
      // If canAccessRegion method not available, check assignedRegions directly
      const hasAccess = req.user.assignedRegions?.some(
        (r) => r.toString() === regionId.toString()
      );
      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. You are not assigned to this region.',
        });
      }
    }

    next();
  };
};

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

    // Check if doctor is in user's assigned regions
    const hasRegionAccess = req.user.assignedRegions?.some(
      (r) => r.toString() === doctor.region.toString()
    );

    if (!hasRegionAccess && req.user.role === 'employee') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. This doctor is not in your assigned region.',
      });
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
  medRepOnly,
  employeeOnly,
  adminOrMedRep,
  adminOrEmployee,
  anyRole,
  canAccessRegion,
  isOwnerOrAdmin,
  isAssignedToDoctor,
};
