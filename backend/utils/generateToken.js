/**
 * JWT Token Generator Utility
 *
 * This file handles:
 * - Access token generation
 * - Refresh token generation
 * - Token payload configuration
 * - Token expiration settings
 */

const jwt = require('jsonwebtoken');

/**
 * Generate access token (short-lived)
 * @param {Object} user - User object with _id, role, email
 * @returns {string} JWT access token
 */
const generateAccessToken = (user) => {
  return jwt.sign(
    {
      id: user._id,
      role: user.role,
      email: user.email,
    },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_EXPIRE || '15m',
    }
  );
};

/**
 * Generate refresh token (long-lived)
 * @param {Object} user - User object with _id
 * @returns {string} JWT refresh token
 */
const generateRefreshToken = (user) => {
  return jwt.sign(
    {
      id: user._id,
    },
    process.env.JWT_REFRESH_SECRET,
    {
      expiresIn: process.env.JWT_REFRESH_EXPIRE || '7d',
    }
  );
};

/**
 * Generate both access and refresh tokens
 * @param {Object} user - User object
 * @returns {{accessToken: string, refreshToken: string}}
 */
const generateTokens = (user) => {
  return {
    accessToken: generateAccessToken(user),
    refreshToken: generateRefreshToken(user),
  };
};

/**
 * Decode token without verification (for debugging)
 * @param {string} token
 * @returns {Object|null}
 */
const decodeToken = (token) => {
  try {
    return jwt.decode(token);
  } catch {
    return null;
  }
};

/**
 * Get token expiration time in milliseconds
 * @param {string} expireString - e.g., '15m', '7d', '1h'
 * @returns {number} Milliseconds
 */
const getExpirationMs = (expireString) => {
  const match = expireString.match(/^(\d+)([smhd])$/);
  if (!match) return 0;

  const value = parseInt(match[1]);
  const unit = match[2];

  switch (unit) {
    case 's':
      return value * 1000;
    case 'm':
      return value * 60 * 1000;
    case 'h':
      return value * 60 * 60 * 1000;
    case 'd':
      return value * 24 * 60 * 60 * 1000;
    default:
      return 0;
  }
};

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  generateTokens,
  decodeToken,
  getExpirationMs,
};
