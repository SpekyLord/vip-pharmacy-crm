/**
 * Email Scheduler
 *
 * Cron jobs for automated email notifications:
 * - Weekly compliance summary (Monday 7 AM Manila time)
 * - Scheduled reports (Every hour)
 *
 * Initialized from server.js after DB connection.
 * Skips if email provider is not configured.
 */

const cron = require('node-cron');
const User = require('../models/User');
const Doctor = require('../models/Doctor');
const Visit = require('../models/Visit');
const NotificationPreference = require('../models/NotificationPreference');
const { isConfigured } = require('../config/ses');
const { sendOperationalAlert } = require('../utils/alerts');
const { logInfo, logError } = require('../utils/logger');
const {
  getComplianceReport,
  getMonthYear,
  getWeekOfMonth,
  isWorkDay,
} = require('../utils/validateWeeklyVisit');
const {
  sendAdminWeeklyCompliance,
  sendBdmWeeklyReport,
} = require('../services/emailService');

/**
 * Get user's notification preferences (with defaults)
 */
const getUserPrefs = async (userId) => {
  const prefs = await NotificationPreference.findOne({ user: userId }).lean();
  return {
    emailNotifications: true,
    weeklyComplianceSummary: true,
    ...prefs,
  };
};

/**
 * Format current week label for emails
 */
const getWeekLabel = () => {
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);

  const format = (d) => d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  return `${format(monday)} - ${format(friday)}`;
};

/**
 * Weekly compliance job — runs Monday 7 AM
 * Sends individual BDM reports and admin summary
 */
const runWeeklyCompliance = async () => {
  logInfo('email_scheduler_weekly_compliance_started');

  try {
    const now = new Date();
    const monthYear = getMonthYear(now);
    const weekLabel = getWeekLabel();

    // Get all active BDMs
    const bdms = await User.find({ role: 'employee', isActive: true }).lean();
    if (bdms.length === 0) {
      logInfo('email_scheduler_no_active_bdms');
      return;
    }

    const bdmStats = [];

    // Process each BDM
    for (const bdm of bdms) {
      const prefs = await getUserPrefs(bdm._id);

      // Get compliance data
      const report = await getComplianceReport(bdm._id.toString(), monthYear);

      // Get unvisited doctors for BDM report
      const assignedDoctors = await Doctor.find({
        assignedTo: bdm._id,
        isActive: true,
      }).select('firstName lastName specialty').lean();

      const visitedDoctorIds = new Set();
      const visits = await Visit.find({
        user: bdm._id,
        monthYear,
      }).select('doctor').lean();
      visits.forEach((v) => visitedDoctorIds.add(v.doctor.toString()));

      const unvisitedDoctors = assignedDoctors
        .filter((d) => !visitedDoctorIds.has(d._id.toString()))
        .map((d) => ({
          name: `${d.lastName}, ${d.firstName}`,
          specialty: d.specialty,
        }));

      // Get region name for admin summary
      let regionName = 'Unassigned';
      if (assignedDoctors.length > 0) {
        // Use first doctor's region as representative
        const doctorWithRegion = await Doctor.findById(assignedDoctors[0]._id)
          .populate('region', 'name')
          .lean();
        if (doctorWithRegion?.region?.name) {
          regionName = doctorWithRegion.region.name;
        }
      }

      // Collect stats for admin summary
      bdmStats.push({
        name: bdm.name,
        region: regionName,
        expected: report.expectedVisits,
        actual: report.totalVisits,
        compliance: report.compliancePercentage,
      });

      // Send individual BDM report
      if (prefs.emailNotifications && prefs.weeklyComplianceSummary) {
        await sendBdmWeeklyReport(bdm, {
          weekLabel,
          totalVisits: report.totalVisits,
          expectedVisits: report.expectedVisits,
          compliance: report.compliancePercentage,
          unvisitedDoctors,
        });
      }
    }

    // Send admin summary
    const admins = await User.find({ role: 'admin', isActive: true }).lean();
    for (const admin of admins) {
      const prefs = await getUserPrefs(admin._id);
      if (prefs.emailNotifications && prefs.weeklyComplianceSummary) {
        await sendAdminWeeklyCompliance(admin, { weekLabel, bdmStats });
      }
    }

    logInfo('email_scheduler_weekly_compliance_completed', {
      bdmCount: bdms.length,
      adminCount: admins.length,
    });
  } catch (err) {
    logError('email_scheduler_weekly_compliance_failed', { error: err.message });
    await sendOperationalAlert({
      source: 'emailScheduler',
      event: 'weekly_compliance_failed',
      message: 'Weekly compliance job failed.',
      error: err.message,
    });
  }
};

/**
 * Initialize the email scheduler
 * Call this from server.js after DB connection
 */
const initEmailScheduler = () => {
  if (!isConfigured()) {
    logInfo('email_scheduler_disabled_email_not_configured');
    logInfo('set_RESEND_API_KEY_and_RESEND_FROM_EMAIL_to_enable_email_notifications');
    return;
  }

  // Weekly compliance — Monday 7 AM Manila time
  cron.schedule('0 7 * * 1', runWeeklyCompliance, {
    timezone: 'Asia/Manila',
  });

  // Scheduled reports — every hour, check for due reports
  cron.schedule('0 * * * *', runScheduledReports, {
    timezone: 'Asia/Manila',
  });

  logInfo('email_scheduler_initialized', {
    weeklyCompliance: 'Monday 7:00 AM (Asia/Manila)',
    scheduledReports: 'Every hour (Asia/Manila)',
  });
};

/**
 * Run due scheduled reports
 */
const runScheduledReports = async () => {
  try {
    const ScheduledReport = require('../models/ScheduledReport');
    const { generateReport, calculateNextRun, getScheduledDateRange } = require('../services/reportGenerator');

    const dueReports = await ScheduledReport.find({
      status: 'active',
      nextRunAt: { $lte: new Date() },
    });

    if (dueReports.length === 0) return;

    logInfo('email_scheduler_scheduled_reports_started', {
      dueCount: dueReports.length,
    });

    for (const scheduled of dueReports) {
      try {
        const dateRange = getScheduledDateRange(scheduled.frequency);

        await generateReport({
          type: scheduled.type,
          format: scheduled.format,
          filters: {
            ...scheduled.filters,
            startDate: dateRange.startDate,
            endDate: dateRange.endDate,
          },
          generatedBy: scheduled.createdBy,
          name: scheduled.name,
          scheduledReportId: scheduled._id,
        });

        scheduled.lastRunAt = new Date();
        scheduled.lastRunStatus = 'success';
        scheduled.nextRunAt = calculateNextRun(scheduled.frequency);
        await scheduled.save();

        logInfo('email_scheduler_scheduled_report_success', {
          scheduledReportId: scheduled._id,
          name: scheduled.name,
        });
      } catch (err) {
        scheduled.lastRunAt = new Date();
        scheduled.lastRunStatus = 'failed';
        scheduled.nextRunAt = calculateNextRun(scheduled.frequency);
        await scheduled.save();

        logError('email_scheduler_scheduled_report_failed', {
          scheduledReportId: scheduled._id,
          name: scheduled.name,
          error: err.message,
        });
        await sendOperationalAlert({
          source: 'emailScheduler',
          event: 'scheduled_report_failed',
          message: `Scheduled report "${scheduled.name}" failed.`,
          error: err.message,
          metadata: { scheduledReportId: String(scheduled._id) },
        });
      }
    }
  } catch (err) {
    logError('email_scheduler_scheduled_reports_failed', { error: err.message });
    await sendOperationalAlert({
      source: 'emailScheduler',
      event: 'scheduled_reports_loop_failed',
      message: 'Scheduled reports loop failed.',
      error: err.message,
    });
  }
};

module.exports = {
  initEmailScheduler,
  runWeeklyCompliance,
  runScheduledReports,
};
