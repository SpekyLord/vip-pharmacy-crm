/**
 * Audit Log Controller
 *
 * Provides read-only access to audit logs for admin monitoring.
 *
 * Endpoints:
 * - GET /api/audit-logs - List audit logs with filters
 * - GET /api/audit-logs/stats - Aggregate stats for a given day
 */

const AuditLog = require('../models/AuditLog');
const { catchAsync } = require('../middleware/errorHandler');

/**
 * @desc    Get audit logs with filtering and pagination
 * @route   GET /api/audit-logs
 * @access  Private (Admin)
 */
const getAuditLogs = catchAsync(async (req, res) => {
  const { page = 1, limit = 50, action, dateFrom, dateTo } = req.query;

  const query = {};

  // Filter by action types (comma-separated)
  if (action) {
    const actions = action.split(',').map((a) => a.trim());
    query.action = { $in: actions };
  }

  // Filter by date range
  if (dateFrom || dateTo) {
    query.timestamp = {};
    if (dateFrom) query.timestamp.$gte = new Date(dateFrom);
    if (dateTo) {
      const d = new Date(dateTo);
      d.setHours(23, 59, 59, 999);
      query.timestamp.$lte = d;
    }
  }

  const skip = (page - 1) * parseInt(limit);
  const parsedLimit = parseInt(limit);

  const [logs, total] = await Promise.all([
    AuditLog.find(query)
      .populate('userId', 'name email')
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(parsedLimit)
      .lean(),
    AuditLog.countDocuments(query),
  ]);

  res.json({
    success: true,
    data: logs,
    pagination: {
      page: parseInt(page),
      limit: parsedLimit,
      total,
      pages: Math.ceil(total / parsedLimit),
    },
  });
});

/**
 * @desc    Get audit log stats for a given day
 * @route   GET /api/audit-logs/stats
 * @access  Private (Admin)
 */
const getAuditLogStats = catchAsync(async (req, res) => {
  const { date } = req.query;
  const targetDate = date ? new Date(date) : new Date();
  const startOfDay = new Date(targetDate);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(targetDate);
  endOfDay.setHours(23, 59, 59, 999);

  const [result] = await AuditLog.aggregate([
    { $match: { timestamp: { $gte: startOfDay, $lte: endOfDay } } },
    {
      $facet: {
        breakdown: [
          { $group: { _id: '$action', count: { $sum: 1 } } },
        ],
        peakHour: [
          { $group: { _id: { $hour: '$timestamp' }, count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 1 },
        ],
        activeUsers: [
          { $match: { action: 'LOGIN_SUCCESS' } },
          { $group: { _id: '$userId' } },
          { $count: 'count' },
        ],
        total: [
          { $count: 'count' },
        ],
      },
    },
  ]);

  const breakdown = {};
  (result?.breakdown || []).forEach((item) => {
    breakdown[item._id] = item.count;
  });

  const authEvents = (result?.total?.[0]?.count) || 0;
  const activeUsers = (result?.activeUsers?.[0]?.count) || 0;
  const peakHourRaw = result?.peakHour?.[0]?._id;
  const peakHour = peakHourRaw != null
    ? `${peakHourRaw % 12 || 12}:00 ${peakHourRaw >= 12 ? 'PM' : 'AM'}`
    : 'N/A';

  res.json({
    success: true,
    data: {
      authEvents,
      activeUsers,
      peakHour,
      breakdown,
    },
  });
});

module.exports = {
  getAuditLogs,
  getAuditLogStats,
};
