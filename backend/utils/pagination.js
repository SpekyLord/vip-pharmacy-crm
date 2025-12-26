/**
 * Pagination Utility
 *
 * Provides reusable pagination logic for controllers
 * Eliminates duplicate code across controllers
 */

/**
 * Get pagination parameters from request query
 * @param {Object} req - Express request object
 * @param {number} defaultLimit - Default items per page (default: 20)
 * @returns {Object} { page, limit, skip }
 */
const getPaginationParams = (req, defaultLimit = 20) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || defaultLimit));
  const skip = (page - 1) * limit;

  return { page, limit, skip };
};

/**
 * Build pagination response object
 * @param {number} page - Current page
 * @param {number} limit - Items per page
 * @param {number} total - Total items count
 * @returns {Object} Pagination metadata
 */
const buildPaginationResponse = (page, limit, total) => ({
  page,
  limit,
  total,
  pages: Math.ceil(total / limit),
  hasMore: page * limit < total,
});

module.exports = {
  getPaginationParams,
  buildPaginationResponse,
};
