/**
 * Report Generation Service
 *
 * Generates Excel/CSV reports from real CRM data and uploads to S3.
 * Each report type queries different data sources and produces
 * a formatted workbook.
 */

const XLSX = require('xlsx');
const Visit = require('../models/Visit');
const Doctor = require('../models/Doctor');
const User = require('../models/User');
const ProductAssignment = require('../models/ProductAssignment');
const Report = require('../models/Report');
const { uploadToS3, generateS3Key } = require('../config/s3');
const { ROLES } = require('../constants/roles');
const { getWebsiteProductModel } = require('../models/WebsiteProduct');

/**
 * Main entry point — generates a report, uploads to S3, saves metadata.
 *
 * @param {Object} opts
 * @param {string} opts.type - Report type (compliance|visits|performance|regional|products)
 * @param {string} opts.format - Output format (excel|csv)
 * @param {Object} opts.filters - { startDate, endDate, regionId, employeeId }
 * @param {string} opts.generatedBy - User ID of admin generating the report
 * @param {string} [opts.name] - Custom name (auto-generated if omitted)
 * @param {string} [opts.scheduledReportId] - If triggered by a scheduled report
 * @returns {Promise<Object>} The saved Report document
 */
async function generateReport({ type, format = 'excel', filters = {}, generatedBy, name, scheduledReportId }) {
  const startTime = Date.now();

  // Create report record in 'generating' state
  const reportName = name || buildReportName(type, filters);
  const report = await Report.create({
    name: reportName,
    type,
    format,
    filters,
    generatedBy,
    status: 'generating',
    scheduledReportId: scheduledReportId || undefined,
  });

  try {
    // Gather data based on report type
    const data = await gatherData(type, filters);

    // Build workbook
    const wb = XLSX.utils.book_new();
    const sheetData = formatSheet(type, data);
    const ws = XLSX.utils.json_to_sheet(sheetData);

    // Auto-size columns
    const colWidths = sheetData.length > 0
      ? Object.keys(sheetData[0]).map((key) => ({
          wch: Math.max(key.length, ...sheetData.map((r) => String(r[key] || '').length)) + 2,
        }))
      : [];
    ws['!cols'] = colWidths;

    XLSX.utils.book_append_sheet(wb, ws, type.charAt(0).toUpperCase() + type.slice(1));

    // Write buffer
    let buffer;
    let contentType;
    let extension;

    if (format === 'csv') {
      const csvString = XLSX.utils.sheet_to_csv(ws);
      buffer = Buffer.from(csvString, 'utf-8');
      contentType = 'text/csv';
      extension = 'csv';
    } else {
      buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      extension = 'xlsx';
    }

    // Upload to S3
    const s3Key = generateS3Key(`${reportName}.${extension}`, 'reports');
    const fileUrl = await uploadToS3(buffer, s3Key, contentType);

    // Format file size
    const fileSizeBytes = buffer.length;
    const fileSize = fileSizeBytes > 1024 * 1024
      ? `${(fileSizeBytes / (1024 * 1024)).toFixed(1)} MB`
      : `${(fileSizeBytes / 1024).toFixed(1)} KB`;

    // Update report record
    report.status = 'ready';
    report.s3Key = s3Key;
    report.fileUrl = fileUrl;
    report.fileSize = fileSize;
    report.generationTimeMs = Date.now() - startTime;
    await report.save();

    return report;
  } catch (err) {
    report.status = 'failed';
    report.error = err.message;
    report.generationTimeMs = Date.now() - startTime;
    await report.save();
    throw err;
  }
}

/**
 * Build a human-readable report name
 */
function buildReportName(type, filters) {
  const typeNames = {
    compliance: 'Weekly Compliance Report',
    visits: 'Visit Summary',
    performance: 'Employee Performance Report',
    regional: 'Regional Comparison Report',
    products: 'Product Presentation Report',
  };
  const base = typeNames[type] || 'Report';
  const now = new Date();
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return `${base} — ${dateStr}`;
}

// ──────────────────────────────────────────────────────────────
// Data gathering by report type
// ──────────────────────────────────────────────────────────────

async function gatherData(type, filters) {
  const dateFilter = {};
  if (filters.startDate) dateFilter.$gte = new Date(filters.startDate);
  if (filters.endDate) {
    const end = new Date(filters.endDate);
    end.setHours(23, 59, 59, 999);
    dateFilter.$lte = end;
  }

  const visitQuery = { status: 'completed' };
  if (Object.keys(dateFilter).length) visitQuery.visitDate = dateFilter;
  if (filters.employeeId) visitQuery.user = filters.employeeId;

  switch (type) {
    case 'compliance':
      return gatherCompliance(visitQuery, filters);
    case 'visits':
      return gatherVisits(visitQuery, filters);
    case 'performance':
      return gatherPerformance(visitQuery, filters);
    default:
      throw new Error(`Unknown report type: ${type}`);
  }
}

async function gatherCompliance(visitQuery, filters) {
  // Get all active BDMs
  const bdmFilter = { role: ROLES.CONTRACTOR, isActive: true };
  if (filters.employeeId) bdmFilter._id = filters.employeeId;
  const bdms = await User.find(bdmFilter).select('name email').lean();

  // Get assigned doctor counts per BDM
  const doctorCounts = await Doctor.aggregate([
    { $match: { isActive: true, assignedTo: { $ne: null } } },
    { $group: { _id: '$assignedTo', totalDoctors: { $sum: 1 }, totalRequired: { $sum: '$visitFrequency' } } },
  ]);
  const doctorMap = new Map(doctorCounts.map((d) => [d._id.toString(), d]));

  // Get visit counts per BDM in the date range
  const visitCounts = await Visit.aggregate([
    { $match: visitQuery },
    { $group: { _id: '$user', totalVisits: { $sum: 1 }, uniqueDoctors: { $addToSet: '$doctor' } } },
    { $project: { totalVisits: 1, uniqueDoctors: { $size: '$uniqueDoctors' } } },
  ]);
  const visitMap = new Map(visitCounts.map((v) => [v._id.toString(), v]));

  return bdms.map((bdm) => {
    const id = bdm._id.toString();
    const docs = doctorMap.get(id) || { totalDoctors: 0, totalRequired: 0 };
    const vis = visitMap.get(id) || { totalVisits: 0, uniqueDoctors: 0 };
    const compliance = docs.totalRequired > 0 ? Math.round((vis.totalVisits / docs.totalRequired) * 100) : 0;
    return {
      bdm,
      totalDoctors: docs.totalDoctors,
      requiredVisits: docs.totalRequired,
      actualVisits: vis.totalVisits,
      uniqueDoctorsVisited: vis.uniqueDoctors,
      compliancePercent: compliance,
    };
  });
}

async function gatherVisits(visitQuery) {
  const visits = await Visit.find(visitQuery)
    .populate('doctor', 'firstName lastName specialization clinicOfficeAddress locality province')
    .populate('user', 'name email')
    .select('visitDate weekLabel monthYear location photos engagementTypes productsDiscussed purpose')
    .sort({ visitDate: -1 })
    .lean();

  return visits;
}

async function gatherPerformance(visitQuery, filters) {
  const bdmFilter = { role: ROLES.CONTRACTOR, isActive: true };
  if (filters.employeeId) bdmFilter._id = filters.employeeId;
  const bdms = await User.find(bdmFilter).select('name email').lean();

  const stats = await Visit.aggregate([
    { $match: visitQuery },
    {
      $group: {
        _id: '$user',
        totalVisits: { $sum: 1 },
        uniqueDoctors: { $addToSet: '$doctor' },
        visitDays: { $addToSet: { $dateToString: { format: '%Y-%m-%d', date: '$visitDate' } } },
      },
    },
    {
      $project: {
        totalVisits: 1,
        uniqueDoctors: { $size: '$uniqueDoctors' },
        activeDays: { $size: '$visitDays' },
      },
    },
  ]);
  const statsMap = new Map(stats.map((s) => [s._id.toString(), s]));

  // Get assigned doctor counts
  const doctorCounts = await Doctor.aggregate([
    { $match: { isActive: true, assignedTo: { $ne: null } } },
    { $group: { _id: '$assignedTo', assigned: { $sum: 1 } } },
  ]);
  const docMap = new Map(doctorCounts.map((d) => [d._id.toString(), d.assigned]));

  return bdms.map((bdm) => {
    const id = bdm._id.toString();
    const s = statsMap.get(id) || { totalVisits: 0, uniqueDoctors: 0, activeDays: 0 };
    const assigned = docMap.get(id) || 0;
    return {
      bdm,
      totalVisits: s.totalVisits,
      uniqueDoctorsVisited: s.uniqueDoctors,
      assignedDoctors: assigned,
      activeDays: s.activeDays,
      avgVisitsPerDay: s.activeDays > 0 ? (s.totalVisits / s.activeDays).toFixed(1) : '0',
      coveragePercent: assigned > 0 ? Math.round((s.uniqueDoctors / assigned) * 100) : 0,
    };
  });
}

// ──────────────────────────────────────────────────────────────
// Format data into flat rows for spreadsheet
// ──────────────────────────────────────────────────────────────

function formatSheet(type, data) {
  switch (type) {
    case 'compliance':
      return data.map((r) => ({
        'BDM Name': r.bdm.name,
        Email: r.bdm.email,
        'Assigned VIP Clients': r.totalDoctors,
        'Required Visits': r.requiredVisits,
        'Actual Visits': r.actualVisits,
        'Unique VIP Clients Visited': r.uniqueDoctorsVisited,
        'Compliance %': `${r.compliancePercent}%`,
      }));

    case 'visits':
      return data.map((v) => ({
        Date: v.visitDate ? new Date(v.visitDate).toLocaleDateString() : '',
        'Week Label': v.weekLabel || '',
        'BDM Name': v.user?.name || '',
        'VIP Client': v.doctor ? `${v.doctor.lastName}, ${v.doctor.firstName}` : '',
        Specialization: v.doctor?.specialization || '',
        'Clinic Address': v.doctor?.clinicOfficeAddress || '',
        Locality: v.doctor?.locality || '',
        Province: v.doctor?.province || '',
        'Photos Count': v.photos?.length || 0,
        'Engagement Types': (v.engagementTypes || []).join(', '),
        Purpose: v.purpose || '',
        'GPS Lat': v.location?.latitude || '',
        'GPS Lng': v.location?.longitude || '',
        'GPS Accuracy': v.location?.accuracy ? `${v.location.accuracy}m` : '',
      }));

    case 'performance':
      return data.map((r) => ({
        'BDM Name': r.bdm.name,
        Email: r.bdm.email,
        'Total Visits': r.totalVisits,
        'Unique VIP Clients Visited': r.uniqueDoctorsVisited,
        'Assigned VIP Clients': r.assignedDoctors,
        'Active Days': r.activeDays,
        'Avg Visits/Day': r.avgVisitsPerDay,
        'Coverage %': `${r.coveragePercent}%`,
      }));

    default:
      return data;
  }
}

// ──────────────────────────────────────────────────────────────
// Scheduled report helpers
// ──────────────────────────────────────────────────────────────

/**
 * Calculate the next run date based on frequency.
 * @param {string} frequency - daily|weekly|monthly
 * @returns {Date}
 */
function calculateNextRun(frequency) {
  const now = new Date();
  const next = new Date(now);

  switch (frequency) {
    case 'daily':
      next.setDate(next.getDate() + 1);
      next.setHours(7, 0, 0, 0);
      break;
    case 'weekly':
      // Next Monday at 7:00 AM
      next.setDate(next.getDate() + ((8 - next.getDay()) % 7 || 7));
      next.setHours(7, 0, 0, 0);
      break;
    case 'monthly':
      // 1st of next month at 7:00 AM
      next.setMonth(next.getMonth() + 1, 1);
      next.setHours(7, 0, 0, 0);
      break;
    default:
      next.setDate(next.getDate() + 1);
      next.setHours(7, 0, 0, 0);
  }

  return next;
}

/**
 * Build default date filters for a scheduled report based on frequency.
 * - daily: yesterday
 * - weekly: last 7 days
 * - monthly: last 30 days
 */
function getScheduledDateRange(frequency) {
  const end = new Date();
  const start = new Date();

  switch (frequency) {
    case 'daily':
      start.setDate(start.getDate() - 1);
      break;
    case 'weekly':
      start.setDate(start.getDate() - 7);
      break;
    case 'monthly':
      start.setDate(start.getDate() - 30);
      break;
  }

  return { startDate: start, endDate: end };
}

module.exports = {
  generateReport,
  calculateNextRun,
  getScheduledDateRange,
};
