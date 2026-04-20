/**
 * Authentication Routes
 *
 * Endpoints:
 * POST /api/auth/register - Register new user (Admin only in production)
 * POST /api/auth/login - User login
 * POST /api/auth/logout - User logout
 * POST /api/auth/refresh-token - Refresh access token
 * POST /api/auth/forgot-password - Request password reset
 * POST /api/auth/reset-password/:token - Reset password
 * GET /api/auth/me - Get current user
 * PUT /api/auth/update-password - Update password
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();

const {
  register,
  login,
  logout,
  refreshToken,
  forgotPassword,
  resetPassword,
  getMe,
  updatePassword,
} = require('../controllers/authController');

const { protect, verifyRefreshToken } = require('../middleware/auth');
const { adminOnly } = require('../middleware/roleCheck');
const {
  loginValidation,
  registerValidation,
} = require('../middleware/validation');
const {
  getRateLimitWindowMs,
  getAuthRateLimitMax,
  formatMinutesLabel,
} = require('../config/runtime');

// Skip route-level rate limiting in development to prevent lockouts during testing
const isDev = process.env.NODE_ENV !== 'production';
const noop = (req, res, next) => next();
const authWindowMs = getRateLimitWindowMs();
const authWindowMinutes = Math.max(1, Math.ceil(authWindowMs / 60000));

// Rate limiting for auth routes (security: prevent brute force attacks)
const authLimiter = isDev ? noop : rateLimit({
  windowMs: authWindowMs,
  max: getAuthRateLimitMax(),
  message: {
    success: false,
    message: `Too many authentication attempts. Please try again after ${formatMinutesLabel(authWindowMinutes)}.`,
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Separate rate limiter for refresh-token (higher limit since frontend may fire multiple parallel requests)
const refreshLimiter = isDev ? noop : rateLimit({
  windowMs: authWindowMs,
  max: Math.max(60, getAuthRateLimitMax()),
  message: {
    success: false,
    message: 'Too many refresh attempts. Please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const passwordResetLimiter = isDev ? noop : rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // 5 attempts per hour
  message: {
    success: false,
    message: 'Too many password reset attempts. Please try again after 1 hour.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Public routes with rate limiting
router.post('/login', authLimiter, loginValidation, login);
router.post('/refresh-token', refreshLimiter, verifyRefreshToken, refreshToken);
router.post('/forgot-password', passwordResetLimiter, forgotPassword);
router.post('/reset-password/:token', passwordResetLimiter, resetPassword);

// Protected routes
router.use(protect); // All routes below require authentication

router.post('/register', adminOnly, registerValidation, register);
router.post('/logout', logout);
router.get('/me', getMe);
router.put('/update-password', updatePassword);

module.exports = router;
