/**
 * Email Service
 *
 * Orchestrates email sending for all notification types.
 * All functions catch errors silently (log + create EmailLog) — email failure
 * should never break business logic.
 */

const { sendEmail } = require('../config/ses');
const EmailLog = require('../models/EmailLog');
const {
  passwordResetTemplate,
  adminWeeklySummaryTemplate,
  bdmWeeklyReportTemplate,
} = require('../templates/emails');

/**
 * Log an email send attempt
 */
const logEmail = async (recipient, recipientUserId, emailType, subject, status, sesMessageId, errorMessage) => {
  try {
    await EmailLog.create({
      recipient,
      recipientUserId,
      emailType,
      subject,
      status,
      sesMessageId,
      errorMessage,
    });
  } catch (err) {
    console.error('Failed to create email log:', err.message);
  }
};

/**
 * Send password reset email
 * @param {Object} user - User document with email and name
 * @param {string} resetToken - Raw (unhashed) reset token
 */
const sendPasswordResetEmail = async (user, resetToken) => {
  try {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const resetUrl = `${frontendUrl}/reset-password/${resetToken}`;
    const { subject, html, text } = passwordResetTemplate(resetUrl, user.name);

    const { messageId } = await sendEmail({ to: user.email, subject, html, text });
    await logEmail(user.email, user._id, 'PASSWORD_RESET', subject, 'sent', messageId);
  } catch (err) {
    console.error('Failed to send password reset email:', err.message);
    await logEmail(user.email, user._id, 'PASSWORD_RESET', 'Password Reset', 'failed', null, err.message);
  }
};

/**
 * Send admin weekly compliance summary
 * @param {Object} adminUser - Admin user document
 * @param {Object} complianceData - { weekLabel, bdmStats: [{name, region, expected, actual, compliance}] }
 */
const sendAdminWeeklyCompliance = async (adminUser, complianceData) => {
  try {
    const data = { adminName: adminUser.name, ...complianceData };
    const { subject, html, text } = adminWeeklySummaryTemplate(data);

    const { messageId } = await sendEmail({ to: adminUser.email, subject, html, text });
    await logEmail(adminUser.email, adminUser._id, 'ADMIN_WEEKLY_SUMMARY', subject, 'sent', messageId);
  } catch (err) {
    console.error('Failed to send admin weekly summary:', err.message);
    await logEmail(adminUser.email, adminUser._id, 'ADMIN_WEEKLY_SUMMARY', 'Weekly Summary', 'failed', null, err.message);
  }
};

/**
 * Send BDM weekly report
 * @param {Object} bdmUser - BDM user document
 * @param {Object} reportData - { weekLabel, totalVisits, expectedVisits, compliance, unvisitedDoctors }
 */
const sendBdmWeeklyReport = async (bdmUser, reportData) => {
  try {
    const data = { bdmName: bdmUser.name, ...reportData };
    const { subject, html, text } = bdmWeeklyReportTemplate(data);

    const { messageId } = await sendEmail({ to: bdmUser.email, subject, html, text });
    await logEmail(bdmUser.email, bdmUser._id, 'BDM_WEEKLY_REPORT', subject, 'sent', messageId);
  } catch (err) {
    console.error('Failed to send BDM weekly report:', err.message);
    await logEmail(bdmUser.email, bdmUser._id, 'BDM_WEEKLY_REPORT', 'Weekly Report', 'failed', null, err.message);
  }
};

module.exports = {
  sendPasswordResetEmail,
  sendAdminWeeklyCompliance,
  sendBdmWeeklyReport,
};
