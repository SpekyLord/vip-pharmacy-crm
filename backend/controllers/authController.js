/**
 * Authentication Controller
 *
 * This file handles:
 * - User registration
 * - User login with JWT token generation
 * - Password reset functionality
 * - Token refresh
 * - Logout functionality
 */

const crypto = require('crypto');
const User = require('../models/User');
const { generateTokens, generateAccessToken } = require('../utils/generateToken');
const { catchAsync } = require('../middleware/errorHandler');

/**
 * @desc    Register a new user
 * @route   POST /api/auth/register
 * @access  Public (or Admin only in production)
 */
const register = catchAsync(async (req, res) => {
  const { name, email, password, role, phone, assignedRegions } = req.body;

  // Check if user already exists
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    return res.status(400).json({
      success: false,
      message: 'Email already registered',
    });
  }

  // Create user
  const user = await User.create({
    name,
    email,
    password,
    role: role || 'employee',
    phone,
    assignedRegions,
  });

  // Generate tokens
  const tokens = generateTokens(user);

  // Save refresh token to user
  user.refreshToken = tokens.refreshToken;
  await user.save();

  res.status(201).json({
    success: true,
    message: 'Registration successful',
    data: {
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    },
  });
});

/**
 * @desc    Login user
 * @route   POST /api/auth/login
 * @access  Public
 */
const login = catchAsync(async (req, res) => {
  const { email, password } = req.body;

  // Find user with password
  const user = await User.findByEmailWithPassword(email);

  if (!user) {
    return res.status(401).json({
      success: false,
      message: 'Invalid email or password',
    });
  }

  // Check if user is active
  if (!user.isActive) {
    return res.status(401).json({
      success: false,
      message: 'Your account has been deactivated. Please contact an administrator.',
    });
  }

  // Check password
  const isMatch = await user.matchPassword(password);
  if (!isMatch) {
    return res.status(401).json({
      success: false,
      message: 'Invalid email or password',
    });
  }

  // Generate tokens
  const tokens = generateTokens(user);

  // Update refresh token and last login
  user.refreshToken = tokens.refreshToken;
  user.lastLogin = new Date();
  await user.save();

  // Get user without password
  const userResponse = await User.findById(user._id).populate('assignedRegions', 'name code');

  res.json({
    success: true,
    message: 'Login successful',
    data: {
      user: userResponse,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    },
  });
});

/**
 * @desc    Logout user
 * @route   POST /api/auth/logout
 * @access  Private
 */
const logout = catchAsync(async (req, res) => {
  // Clear refresh token from database
  if (req.user) {
    await User.findByIdAndUpdate(req.user._id, { refreshToken: null });
  }

  res.json({
    success: true,
    message: 'Logged out successfully',
  });
});

/**
 * @desc    Refresh access token
 * @route   POST /api/auth/refresh-token
 * @access  Public (with valid refresh token)
 */
const refreshToken = catchAsync(async (req, res) => {
  // User is attached by verifyRefreshToken middleware
  const user = req.user;

  // Generate new access token
  const accessToken = generateAccessToken(user);

  res.json({
    success: true,
    data: {
      accessToken,
    },
  });
});

/**
 * @desc    Request password reset
 * @route   POST /api/auth/forgot-password
 * @access  Public
 */
const forgotPassword = catchAsync(async (req, res) => {
  const { email } = req.body;

  const user = await User.findOne({ email });

  if (!user) {
    // Don't reveal if email exists
    return res.json({
      success: true,
      message: 'If an account with that email exists, a password reset link has been sent.',
    });
  }

  // Generate reset token
  const resetToken = crypto.randomBytes(32).toString('hex');
  const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');

  // Save hashed token and expiry
  user.passwordResetToken = hashedToken;
  user.passwordResetExpires = Date.now() + 3600000; // 1 hour
  await user.save();

  // TODO: Send email with reset link using AWS SES (Phase 2)
  // Reset link format: ${FRONTEND_URL}/reset-password/${resetToken}
  // SECURITY: Never expose reset token in response - only send via email
  // Note: In production, this should send an email via AWS SES

  res.json({
    success: true,
    message: 'If an account with that email exists, a password reset link has been sent.',
  });
});

/**
 * @desc    Reset password with token
 * @route   POST /api/auth/reset-password/:token
 * @access  Public
 */
const resetPassword = catchAsync(async (req, res) => {
  const { token } = req.params;
  const { password } = req.body;

  // Hash token to compare with stored hash
  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

  // Find user with valid token
  const user = await User.findOne({
    passwordResetToken: hashedToken,
    passwordResetExpires: { $gt: Date.now() },
  });

  if (!user) {
    return res.status(400).json({
      success: false,
      message: 'Invalid or expired reset token',
    });
  }

  // Update password
  user.password = password;
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  user.refreshToken = null; // Invalidate all sessions
  await user.save();

  res.json({
    success: true,
    message: 'Password reset successful. Please log in with your new password.',
  });
});

/**
 * @desc    Get current user profile
 * @route   GET /api/auth/me
 * @access  Private
 */
const getMe = catchAsync(async (req, res) => {
  const user = await User.findById(req.user._id).populate('assignedRegions', 'name code level');

  res.json({
    success: true,
    data: user,
  });
});

/**
 * @desc    Update current user password
 * @route   PUT /api/auth/update-password
 * @access  Private
 */
const updatePassword = catchAsync(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  // Get user with password
  const user = await User.findById(req.user._id).select('+password');

  // Check current password
  const isMatch = await user.matchPassword(currentPassword);
  if (!isMatch) {
    return res.status(400).json({
      success: false,
      message: 'Current password is incorrect',
    });
  }

  // Update password
  user.password = newPassword;
  user.refreshToken = null; // Invalidate all sessions
  await user.save();

  // Generate new tokens
  const tokens = generateTokens(user);
  user.refreshToken = tokens.refreshToken;
  await user.save();

  res.json({
    success: true,
    message: 'Password updated successfully',
    data: {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    },
  });
});

module.exports = {
  register,
  login,
  logout,
  refreshToken,
  forgotPassword,
  resetPassword,
  getMe,
  updatePassword,
};
