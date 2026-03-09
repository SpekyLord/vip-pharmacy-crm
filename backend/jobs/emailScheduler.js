/**
 * Email Scheduler
 *
 * Cron jobs for automated email notifications:
 * - Weekly compliance summary (Monday 7 AM Manila time)
 * - Behind-schedule alerts (Weekdays 8 AM Manila time)
 *
 * Initialized from server.js after DB connection.
 * Skips if SES is not configured.
 */

const cron = require('node-cron');
const User = require('../models/User');
const Doctor = require('../models/Doctor');
const Visit = require('../models/Visit');
const NotificationPreference = require('../models/NotificationPreference');
const { isConfigured } = require('../config/ses');
const {
  getComplianceReport,
  checkBehindSchedule,
  getMonthYear,
  getWeekOfMonth,
  isWorkDay,
} = require('../utils/validateWeeklyVisit');
const {
  sendAdminWeeklyCompliance,
  sendBdmWeeklyReport,
  sendBehindScheduleAlert,
} = require('../services/emailService');

/**
 * Get user's notification preferences (with defaults)
 */
const getUserPrefs = async (userId) => {
  const prefs = await NotificationPreference.findOne({ user: userId }).lean();
  return {
    emailNotifications: true,
    behindScheduleAlertFrequency: 'twice_weekly',
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
 * Calculate work days remaining in the month
 */
const getWorkDaysRemaining = () => {
  const now = new Date();
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  let count = 0;
  for (let d = new Date(now); d <= lastDay; d.setDate(d.getDate() + 1)) {
    const day = d.getDay();
    if (day >= 1 && day <= 5) count++;
  }
  return count;
};

/**
 * Weekly compliance job — runs Monday 7 AM
 * Sends individual BDM reports and admin summary
 */
const runWeeklyCompliance = async () => {
  console.log('[EmailScheduler] Running weekly compliance job...');

  try {
    const now = new Date();
    const monthYear = getMonthYear(now);
    const weekLabel = getWeekLabel();

    // Get all active BDMs
    const bdms = await User.find({ role: 'employee', isActive: true }).lean();
    if (bdms.length === 0) {
      console.log('[EmailScheduler] No active BDMs found, skipping.');
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

    console.log(`[EmailScheduler] Weekly compliance done. ${bdms.length} BDMs, ${admins.length} admins processed.`);
  } catch (err) {
    console.error('[EmailScheduler] Weekly compliance job error:', err.message);
  }
};

/**
 * Behind-schedule alert job — runs weekdays 8 AM
 * Checks each BDM's progress and sends alerts based on their frequency preference
 */
const runBehindScheduleAlerts = async () => {
  console.log('[EmailScheduler] Running behind-schedule alerts...');

  try {
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon, ..., 5=Fri

    // Get all active BDMs
    const bdms = await User.find({ role: 'employee', isActive: true }).lean();
    let alertsSent = 0;

    for (const bdm of bdms) {
      const prefs = await getUserPrefs(bdm._id);

      // Skip if email notifications disabled
      if (!prefs.emailNotifications) continue;

      // Check frequency preference
      const freq = prefs.behindScheduleAlertFrequency;
      if (freq === 'never') continue;
      if (freq === 'weekly' && dayOfWeek !== 1) continue; // Monday only
      if (freq === 'twice_weekly' && dayOfWeek !== 1 && dayOfWeek !== 3) continue; // Mon + Wed

      // Check if behind schedule
      const { isBehind, details } = await checkBehindSchedule(bdm._id.toString(), now);

      if (isBehind) {
        await sendBehindScheduleAlert(bdm, {
          ...details,
          daysRemaining: getWorkDaysRemaining(),
        });
        alertsSent++;
      }
    }

    console.log(`[EmailScheduler] Behind-schedule alerts done. ${alertsSent} alerts sent.`);
  } catch (err) {
    console.error('[EmailScheduler] Behind-schedule alerts error:', err.message);
  }
};

/**
 * Initialize the email scheduler
 * Call this from server.js after DB connection
 */
const initEmailScheduler = () => {
  if (!isConfigured()) {
    console.log('[EmailScheduler] SES not configured, skipping email scheduler initialization.');
    console.log('[EmailScheduler] Set SES_FROM_EMAIL to enable email notifications.');
    return;
  }

  // Weekly compliance — Monday 7 AM Manila time
  cron.schedule('0 7 * * 1', runWeeklyCompliance, {
    timezone: 'Asia/Manila',
  });

  // Behind-schedule alerts — Weekdays 8 AM Manila time
  cron.schedule('0 8 * * 1-5', runBehindScheduleAlerts, {
    timezone: 'Asia/Manila',
  });

  // Scheduled reports — every hour, check for due reports
  cron.schedule('0 * * * *', runScheduledReports, {
    timezone: 'Asia/Manila',
  });

  console.log('[EmailScheduler] Email scheduler initialized.');
  console.log('[EmailScheduler] Weekly compliance: Monday 7:00 AM (Asia/Manila)');
  console.log('[EmailScheduler] Behind-schedule alerts: Weekdays 8:00 AM (Asia/Manila)');
  console.log('[EmailScheduler] Scheduled reports: Every hour (Asia/Manila)');
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

    console.log(`[EmailScheduler] Running ${dueReports.length} scheduled report(s)...`);

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

        console.log(`[EmailScheduler] Scheduled report "${scheduled.name}" generated successfully.`);
      } catch (err) {
        scheduled.lastRunAt = new Date();
        scheduled.lastRunStatus = 'failed';
        scheduled.nextRunAt = calculateNextRun(scheduled.frequency);
        await scheduled.save();

        console.error(`[EmailScheduler] Scheduled report "${scheduled.name}" failed:`, err.message);
      }
    }
  } catch (err) {
    console.error('[EmailScheduler] Scheduled reports error:', err.message);
  }
};

module.exports = {
  initEmailScheduler,
  runWeeklyCompliance,
  runBehindScheduleAlerts,
  runScheduledReports,
};
