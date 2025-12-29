/**
 * JWT Authentication Middleware
 *
 * This file handles:
 * - JWT token verification
 * - Token extraction from headers
 * - User authentication state
 * - Token expiration handling
 * - Attaching user to request object
 */

const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Common error messages (DRY principle)
const AUTH_ERRORS = {
  NO_TOKEN: 'Not authorized. Please log in to access this resource.',
  USER_NOT_FOUND: 'User not found. Please log in again.',
  ACCOUNT_DEACTIVATED: 'Your account has been deactivated. Please contact an administrator.',
  TOKEN_EXPIRED: 'Token expired. Please log in again.',
  TOKEN_INVALID: 'Invalid token. Please log in again.',
  AUTH_FAILED: 'Authentication failed. Please log in again.',
};

/**
 * Extract JWT token from request (DRY utility)
 * Checks Authorization header first, then cookies
 */
const extractTokenFromRequest = (req) => {
  // 1) Authorization header
  if (req.headers.authorization?.startsWith('Bearer ')) {
    return req.headers.authorization.split(' ')[1];
  }

  // 2) Cookies (support common names)
  const cookies = req.cookies || {};
  return cookies.accessToken || cookies.token || null;
};


/**
 * Protect routes - require authentication
 * Extracts and verifies JWT token from Authorization header
 */
const protect = async (req, res, next) => {
  const token = extractTokenFromRequest(req);

  // No token found
  if (!token) {
    return res.status(401).json({
      success: false,
      message: AUTH_ERRORS.NO_TOKEN,
    });
  }

  try {
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Get user from database
    const user = await User.findById(decoded.id).populate('assignedRegions');

    if (!user) {
      return res.status(401).json({
        success: false,
        message: AUTH_ERRORS.USER_NOT_FOUND,
      });
    }

    // Check if user is active
    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: AUTH_ERRORS.ACCOUNT_DEACTIVATED,
      });
    }

    // Attach user to request
    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: AUTH_ERRORS.TOKEN_EXPIRED,
        code: 'TOKEN_EXPIRED',
      });
    }

    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: AUTH_ERRORS.TOKEN_INVALID,
        code: 'TOKEN_INVALID',
      });
    }

    console.error('Auth middleware error:', error);
    return res.status(401).json({
      success: false,
      message: AUTH_ERRORS.AUTH_FAILED,
    });
  }
};

/**
 * Optional authentication
 * Attaches user to request if token is valid, but doesn't require it
 */
const optionalAuth = async (req, res, next) => {
  const token = extractTokenFromRequest(req);

  // No token - continue without user
  if (!token) {
    return next();
  }

  try {
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Get user from database
    const user = await User.findById(decoded.id).populate('assignedRegions');

    if (user && user.isActive) {
      req.user = user;
    }

    next();
  } catch {
    // Token invalid/expired - continue without user
    next();
  }
};

/**
 * Verify refresh token
 * Used for token refresh endpoint
 */
const verifyRefreshToken = async (req, res, next) => {
  const refreshToken = req.body.refreshToken || req.cookies?.refreshToken;

  if (!refreshToken) {
    return res.status(401).json({
      success: false,
      message: 'Refresh token not provided.',
    });
  }

  try {
    // Verify refresh token
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);

    // Get user and check if refresh token matches
    const user = await User.findById(decoded.id).select('+refreshToken');

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not found.',
      });
    }

    if (user.refreshToken !== refreshToken) {
      return res.status(401).json({
        success: false,
        message: 'Invalid refresh token.',
      });
    }

    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Account deactivated.',
      });
    }

    // Attach user to request
    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Refresh token expired. Please log in again.',
        code: 'REFRESH_TOKEN_EXPIRED',
      });
    }

    return res.status(401).json({
      success: false,
      message: 'Invalid refresh token.',
    });
  }
};

module.exports = {
  protect,
  optionalAuth,
  verifyRefreshToken,
};
