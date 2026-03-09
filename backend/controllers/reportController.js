/**
 * Report Controller
 *
 * Handles CRUD operations for generated reports and scheduled reports.
 * All endpoints are admin-only.
 */

const Report = require('../models/Report');
const ScheduledReport = require('../models/ScheduledReport');
const { catchAsync } = require('../middleware/errorHandler');
const { generateReport: generateReportService, calculateNextRun, getScheduledDateRange } = require('../services/reportGenerator');
const { getSignedDownloadUrl, deleteFromS3 } = require('../config/s3');

// ──────────────────────────────────────────────────────────────
// Generated Reports
// ──────────────────────────────────────────────────────────────

/**
 * @desc    Generate a new report
 * @route   POST /api/reports/generate
 * @access  Admin
 */
const generateReport = catchAsync(async (req, res) => {
  const { type, format, filters, name, schedule } = req.body;

  if (!type) {
    return res.status(400).json({ success: false, message: 'Report type is required' });
  }

  const validTypes = ['compliance', 'visits', 'performance', 'regional', 'products'];
  if (!validTypes.includes(type)) {
    return res.status(400).json({ success: false, message: `Invalid report type. Must be one of: ${validTypes.join(', ')}` });
  }

  // If schedule is requested, create a ScheduledReport too
  let scheduledReport = null;
  if (schedule && schedule.frequency) {
    scheduledReport = await ScheduledReport.create({
      name: name || `Scheduled ${type} Report`,
      type,
      frequency: schedule.frequency,
      format: format || 'excel',
      filters: {
        regionId: filters?.regionId || undefined,
        employeeId: filters?.employeeId || undefined,
      },
      createdBy: req.user._id,
      nextRunAt: calculateNextRun(schedule.frequency),
    });
  }

  // Generate report (runs inline — fast enough for CRM data sizes)
  const report = await generateReportService({
    type,
    format: format || 'excel',
    filters: filters || {},
    generatedBy: req.user._id,
    name,
    scheduledReportId: scheduledReport?._id,
  });

  res.status(201).json({
    success: true,
    message: 'Report generated successfully',
    data: { report, scheduledReport },
  });
});

/**
 * @desc    Get all generated reports (paginated)
 * @route   GET /api/reports
 * @access  Admin
 */
const getReports = catchAsync(async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 20;
  const skip = (page - 1) * limit;

  const query = {};
  if (req.query.type) query.type = req.query.type;
  if (req.query.status) query.status = req.query.status;

  const [reports, total] = await Promise.all([
    Report.find(query)
      .populate('generatedBy', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Report.countDocuments(query),
  ]);

  res.json({
    success: true,
    data: {
      reports,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    },
  });
});

/**
 * @desc    Get report stats for Quick Stats cards
 * @route   GET /api/reports/stats
 * @access  Admin
 */
const getReportStats = catchAsync(async (req, res) => {
  const [totalReports, scheduledCount, avgTimeResult] = await Promise.all([
    Report.countDocuments({ status: 'ready' }),
    ScheduledReport.countDocuments({ status: 'active' }),
    Report.aggregate([
      { $match: { status: 'ready', generationTimeMs: { $exists: true } } },
      { $group: { _id: null, avgTime: { $avg: '$generationTimeMs' } } },
    ]),
  ]);

  const avgTimeMs = avgTimeResult.length > 0 ? avgTimeResult[0].avgTime : 0;
  const avgTime = avgTimeMs > 1000 ? `${(avgTimeMs / 1000).toFixed(1)}s` : `${Math.round(avgTimeMs)}ms`;

  res.json({
    success: true,
    data: { totalReports, scheduledCount, avgTime },
  });
});

/**
 * @desc    Download a report (returns signed S3 URL)
 * @route   GET /api/reports/:id/download
 * @access  Admin
 */
const downloadReport = catchAsync(async (req, res) => {
  const report = await Report.findById(req.params.id);

  if (!report) {
    return res.status(404).json({ success: false, message: 'Report not found' });
  }

  if (report.status !== 'ready' || !report.s3Key) {
    return res.status(400).json({ success: false, message: 'Report is not ready for download' });
  }

  const url = await getSignedDownloadUrl(report.s3Key, 3600);

  res.json({
    success: true,
    data: { url, name: report.name, format: report.format },
  });
});

/**
 * @desc    Delete a report
 * @route   DELETE /api/reports/:id
 * @access  Admin
 */
const deleteReport = catchAsync(async (req, res) => {
  const report = await Report.findById(req.params.id);

  if (!report) {
    return res.status(404).json({ success: false, message: 'Report not found' });
  }

  // Delete S3 file if exists
  if (report.s3Key) {
    try {
      await deleteFromS3(report.s3Key);
    } catch {
      // S3 file may already be deleted — continue
    }
  }

  await Report.findByIdAndDelete(req.params.id);

  res.json({ success: true, message: 'Report deleted successfully' });
});

// ──────────────────────────────────────────────────────────────
// Scheduled Reports
// ──────────────────────────────────────────────────────────────

/**
 * @desc    Create a scheduled report
 * @route   POST /api/reports/scheduled
 * @access  Admin
 */
const createScheduledReport = catchAsync(async (req, res) => {
  const { name, type, frequency, format, filters } = req.body;

  if (!type || !frequency) {
    return res.status(400).json({ success: false, message: 'Type and frequency are required' });
  }

  const scheduled = await ScheduledReport.create({
    name: name || `Scheduled ${type} Report`,
    type,
    frequency,
    format: format || 'excel',
    filters: filters || {},
    createdBy: req.user._id,
    nextRunAt: calculateNextRun(frequency),
  });

  res.status(201).json({
    success: true,
    message: 'Scheduled report created',
    data: scheduled,
  });
});

/**
 * @desc    Get all scheduled reports
 * @route   GET /api/reports/scheduled
 * @access  Admin
 */
const getScheduledReports = catchAsync(async (req, res) => {
  const scheduled = await ScheduledReport.find()
    .populate('createdBy', 'name')
    .sort({ createdAt: -1 })
    .lean();

  res.json({ success: true, data: scheduled });
});

/**
 * @desc    Update a scheduled report (pause/resume/edit)
 * @route   PUT /api/reports/scheduled/:id
 * @access  Admin
 */
const updateScheduledReport = catchAsync(async (req, res) => {
  const { status, name, frequency, format, filters } = req.body;

  const scheduled = await ScheduledReport.findById(req.params.id);
  if (!scheduled) {
    return res.status(404).json({ success: false, message: 'Scheduled report not found' });
  }

  if (status) scheduled.status = status;
  if (name) scheduled.name = name;
  if (format) scheduled.format = format;
  if (filters) scheduled.filters = filters;
  if (frequency && frequency !== scheduled.frequency) {
    scheduled.frequency = frequency;
    scheduled.nextRunAt = calculateNextRun(frequency);
  }

  await scheduled.save();

  res.json({ success: true, message: 'Scheduled report updated', data: scheduled });
});

/**
 * @desc    Delete a scheduled report
 * @route   DELETE /api/reports/scheduled/:id
 * @access  Admin
 */
const deleteScheduledReport = catchAsync(async (req, res) => {
  const scheduled = await ScheduledReport.findById(req.params.id);
  if (!scheduled) {
    return res.status(404).json({ success: false, message: 'Scheduled report not found' });
  }

  await ScheduledReport.findByIdAndDelete(req.params.id);

  res.json({ success: true, message: 'Scheduled report deleted' });
});

/**
 * @desc    Run a scheduled report immediately
 * @route   POST /api/reports/scheduled/:id/run
 * @access  Admin
 */
const runScheduledNow = catchAsync(async (req, res) => {
  const scheduled = await ScheduledReport.findById(req.params.id);
  if (!scheduled) {
    return res.status(404).json({ success: false, message: 'Scheduled report not found' });
  }

  const dateRange = getScheduledDateRange(scheduled.frequency);

  const report = await generateReportService({
    type: scheduled.type,
    format: scheduled.format,
    filters: {
      ...scheduled.filters,
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
    },
    generatedBy: req.user._id,
    name: scheduled.name,
    scheduledReportId: scheduled._id,
  });

  // Update scheduled report tracking
  scheduled.lastRunAt = new Date();
  scheduled.lastRunStatus = report.status === 'ready' ? 'success' : 'failed';
  await scheduled.save();

  res.json({
    success: true,
    message: 'Report generated successfully',
    data: report,
  });
});

module.exports = {
  generateReport,
  getReports,
  getReportStats,
  downloadReport,
  deleteReport,
  createScheduledReport,
  getScheduledReports,
  updateScheduledReport,
  deleteScheduledReport,
  runScheduledNow,
};
