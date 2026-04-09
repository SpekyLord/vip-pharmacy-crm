/**
 * Controller Helper Functions
 *
 * Shared utilities for controllers to reduce code duplication
 * and ensure consistent patterns across the application.
 */

const { ForbiddenError } = require('../middleware/errorHandler');
const { ROLES } = require('../constants/roles');

/**
 * Update allowed fields from request body to a document
 * @param {Object} doc - Mongoose document to update
 * @param {Object} data - Request body data
 * @param {Array<string>} allowedFields - List of field names to allow
 * @returns {Object} - Updated document
 */
const updateFields = (doc, data, allowedFields) => {
  allowedFields.forEach((field) => {
    if (data[field] !== undefined) {
      doc[field] = data[field];
    }
  });
  return doc;
};

/**
 * Ensure the current user owns the resource or is an admin
 * Throws ForbiddenError if access is denied
 * @param {Object} req - Express request object with user
 * @param {Object} resource - Resource with user field (ObjectId or populated)
 * @param {string} message - Optional custom error message
 */
const ensureOwnerOrAdmin = (req, resource, message = 'Access denied. You can only access your own resources.') => {
  // Admin can access anything
  if (req.user.role === ROLES.ADMIN) {
    return;
  }

  // Get user ID from resource (handle both populated and unpopulated)
  const resourceUserId = resource.user?._id || resource.user;
  const currentUserId = req.user._id;

  if (!resourceUserId || resourceUserId.toString() !== currentUserId.toString()) {
    throw new ForbiddenError(message);
  }
};

/**
 * Parse pagination parameters from query string
 * @param {Object} query - Express request query object
 * @param {Object} defaults - Default values { page: 1, limit: 20 }
 * @returns {Object} - { page, limit, skip }
 */
const parsePagination = (query, defaults = { page: 1, limit: 20 }) => {
  const page = parseInt(query.page, 10) || defaults.page;
  const limit = parseInt(query.limit, 10) || defaults.limit;
  const skip = (page - 1) * limit;

  return { page, limit, skip };
};

/**
 * Build pagination response object
 * @param {number} page - Current page
 * @param {number} limit - Items per page
 * @param {number} total - Total item count
 * @returns {Object} - Pagination metadata
 */
const buildPaginationResponse = (page, limit, total) => ({
  page,
  limit,
  total,
  pages: Math.ceil(total / limit),
});

/**
 * Sanitize a string for safe text searching (escape regex special chars)
 * @param {string} str - String to sanitize
 * @returns {string} - Sanitized string safe for regex
 */
const sanitizeSearchString = (str) => {
  if (!str || typeof str !== 'string') return '';
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

module.exports = {
  updateFields,
  ensureOwnerOrAdmin,
  parsePagination,
  buildPaginationResponse,
  sanitizeSearchString,
};
