/**
 * Authentication Controller
 *
 * This file handles:
 * - User registration
 * - User login with JWT token generation
 * - Password reset functionality
 * - Token refresh
 * - Logout functionality
 *
 * SECURITY: All authentication events are logged for audit trail
 */

const crypto = require('crypto');
const User = require('../models/User');
const { generateTokens, generateAccessToken } = require('../utils/generateToken');
const { catchAsync } = require('../middleware/errorHandler');
const { logAuditEvent, AuditActions } = require('../utils/auditLogger');

/**
 * @desc    Register a new user
 * @route   POST /api/auth/register
 * @access  Public (or Admin only in production)
 */
const register = catchAsync(async (req, res) => {
  const { name, email, password, role, phone } = req.body;

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
  });

  // Generate tokens
  const tokens = generateTokens(user);

  // Save refresh token to user
  user.refreshToken = tokens.refreshToken;
  await user.save();

  // Set httpOnly cookies for security
  res.cookie('accessToken', tokens.accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: 15 * 60 * 1000, // 15 mins
  });

  res.cookie('refreshToken', tokens.refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });

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
      // SECURITY: Tokens are only in httpOnly cookies - never exposed to JavaScript
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

  // Find user with password and lockout fields
  const user = await User.findByEmailWithPassword(email);

  if (!user) {
    // Log failed login attempt for non-existent user
    await logAuditEvent(AuditActions.LOGIN_FAILURE, {
      email,
      req,
      details: { reason: 'User not found' },
    });
    return res.status(401).json({
      success: false,
      message: 'Invalid email or password',
    });
  }

  // Check if account is locked due to too many failed attempts
  if (user.isLocked()) {
    const remainingSeconds = user.getLockoutRemaining();
    const remainingMinutes = Math.ceil(remainingSeconds / 60);
    return res.status(423).json({
      success: false,
      message: `Account is temporarily locked. Try again in ${remainingMinutes} minute${remainingMinutes > 1 ? 's' : ''}.`,
      data: {
        lockedUntil: user.lockoutUntil,
        remainingSeconds,
      },
    });
  }

  // Check if user is active
  if (!user.isActive) {
    await logAuditEvent(AuditActions.LOGIN_FAILURE, {
      userId: user._id,
      email,
      req,
      details: { reason: 'Account deactivated' },
    });
    return res.status(401).json({
      success: false,
      message: 'Your account has been deactivated. Please contact an administrator.',
    });
  }

  // Check password
  const isMatch = await user.matchPassword(password);
  if (!isMatch) {
    // Increment failed login attempts and potentially lock account
    const attempts = await user.handleFailedLogin();
    const remainingAttempts = 5 - attempts;

    // Log failed login attempt
    await logAuditEvent(AuditActions.LOGIN_FAILURE, {
      userId: user._id,
      email,
      req,
      details: { reason: 'Invalid password', attemptNumber: attempts },
    });

    // Different message if account is now locked
    if (user.isLocked()) {
      // Log account lockout
      await logAuditEvent(AuditActions.ACCOUNT_LOCKED, {
        userId: user._id,
        email,
        req,
        details: { lockoutUntil: user.lockoutUntil },
      });
      return res.status(423).json({
        success: false,
        message: 'Too many failed login attempts. Account is temporarily locked for 15 minutes.',
        data: {
          lockedUntil: user.lockoutUntil,
          remainingSeconds: user.getLockoutRemaining(),
        },
      });
    }

    return res.status(401).json({
      success: false,
      message: remainingAttempts > 0
        ? `Invalid email or password. ${remainingAttempts} attempt${remainingAttempts > 1 ? 's' : ''} remaining.`
        : 'Invalid email or password',
    });
  }

  // Successful login - reset failed attempts counter
  await user.resetLoginAttempts();

  // Log successful login
  await logAuditEvent(AuditActions.LOGIN_SUCCESS, {
    userId: user._id,
    email,
    req,
  });

  // Generate tokens
  const tokens = generateTokens(user);

  // Update refresh token and last login
  user.refreshToken = tokens.refreshToken;
  user.lastLogin = new Date();
  await user.save();

  // Get user without password
  const userResponse = await User.findById(user._id);

// ✅ set cookies (localhost-friendly)
res.cookie('accessToken', tokens.accessToken, {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production', // false on localhost
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  maxAge: 15 * 60 * 1000, // 15 mins (adjust to your access token expiry)
});

res.cookie('refreshToken', tokens.refreshToken, {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days (adjust)
});

res.json({
  success: true,
  message: 'Login successful',
  data: {
    user: userResponse,
    // SECURITY: Tokens are only in httpOnly cookies - never exposed to JavaScript
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

    // Log logout event
    await logAuditEvent(AuditActions.LOGOUT, {
      userId: req.user._id,
      req,
    });
  }

  res.clearCookie('accessToken');
  res.clearCookie('refreshToken');

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

  res.cookie('accessToken', accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: 15 * 60 * 1000,
  });

  res.json({
    success: true,
    data: { accessToken },
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

  // Log password reset request
  await logAuditEvent(AuditActions.PASSWORD_RESET_REQUEST, {
    userId: user._id,
    email,
    req,
  });

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

  // Log password reset completion
  await logAuditEvent(AuditActions.PASSWORD_RESET_COMPLETE, {
    userId: user._id,
    req,
  });

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
  const user = await User.findById(req.user._id);

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

  // Log password change
  await logAuditEvent(AuditActions.PASSWORD_CHANGE, {
    userId: user._id,
    req,
  });

  // Generate new tokens
  const tokens = generateTokens(user);
  user.refreshToken = tokens.refreshToken;
  await user.save();

  // Set new httpOnly cookies
  res.cookie('accessToken', tokens.accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: 15 * 60 * 1000, // 15 mins
  });

  res.cookie('refreshToken', tokens.refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });

  res.json({
    success: true,
    message: 'Password updated successfully',
    // SECURITY: Tokens are only in httpOnly cookies - never exposed to JavaScript
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
