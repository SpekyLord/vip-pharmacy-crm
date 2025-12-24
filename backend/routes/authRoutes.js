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

const { protect } = require('../middleware/auth');
const { adminOnly } = require('../middleware/roleCheck');
const {
  loginValidation,
  registerValidation,
} = require('../middleware/validation');

// Public routes
router.post('/login', loginValidation, login);
router.post('/refresh-token', refreshToken);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password/:token', resetPassword);

// Protected routes
router.use(protect); // All routes below require authentication

router.post('/register', adminOnly, registerValidation, register);
router.post('/logout', logout);
router.get('/me', getMe);
router.put('/update-password', updatePassword);

module.exports = router;
