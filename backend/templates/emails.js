/**
 * Email Templates
 *
 * HTML email templates for VIP CRM notifications.
 * Each template function returns { subject, html, text } for use with SES.
 */

/**
 * Shared base HTML layout with VIP CRM branding
 */
const baseLayout = (title, body) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          <!-- Header -->
          <tr>
            <td style="background:#d97706;padding:24px 32px;">
              <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;">VIP CRM</h1>
              <p style="margin:4px 0 0;color:#fde68a;font-size:13px;">Pharmaceutical Field Sales Management</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              ${body}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#f9fafb;padding:20px 32px;border-top:1px solid #e5e7eb;">
              <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">
                This is an automated message from VIP CRM. Please do not reply to this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

/**
 * Password reset email template
 * @param {string} resetUrl - Full URL with reset token
 * @param {string} userName - User's display name
 * @returns {{ subject: string, html: string, text: string }}
 */
const passwordResetTemplate = (resetUrl, userName) => {
  const subject = 'VIP CRM - Password Reset Request';

  const body = `
    <h2 style="margin:0 0 16px;color:#1f2937;font-size:20px;">Password Reset Request</h2>
    <p style="margin:0 0 16px;color:#4b5563;font-size:15px;line-height:1.6;">
      Hi ${userName},
    </p>
    <p style="margin:0 0 24px;color:#4b5563;font-size:15px;line-height:1.6;">
      We received a request to reset your password. Click the button below to create a new password. This link will expire in <strong>1 hour</strong>.
    </p>
    <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
      <tr>
        <td style="background:#f59e0b;border-radius:8px;padding:14px 28px;">
          <a href="${resetUrl}" style="color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;">
            Reset Password
          </a>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 8px;color:#6b7280;font-size:13px;">
      If you didn't request this, you can safely ignore this email.
    </p>
    <p style="margin:0;color:#6b7280;font-size:13px;">
      Or copy this link: <span style="color:#d97706;word-break:break-all;">${resetUrl}</span>
    </p>`;

  const text = `Hi ${userName},\n\nWe received a request to reset your password. Visit the following link to create a new password (expires in 1 hour):\n\n${resetUrl}\n\nIf you didn't request this, you can safely ignore this email.`;

  return { subject, html: baseLayout(subject, body), text };
};

/**
 * Admin weekly compliance summary template
 * @param {Object} data
 * @param {string} data.adminName
 * @param {string} data.weekLabel - e.g., "March 3-7, 2026"
 * @param {Array<{name: string, region: string, expected: number, actual: number, compliance: number}>} data.bdmStats
 * @returns {{ subject: string, html: string, text: string }}
 */
const adminWeeklySummaryTemplate = (data) => {
  const { adminName, weekLabel, bdmStats } = data;
  const subject = `VIP CRM - Weekly Compliance Summary (${weekLabel})`;

  const totalExpected = bdmStats.reduce((sum, b) => sum + b.expected, 0);
  const totalActual = bdmStats.reduce((sum, b) => sum + b.actual, 0);
  const overallCompliance = totalExpected > 0 ? Math.round((totalActual / totalExpected) * 100) : 0;

  const rows = bdmStats.map((b) => {
    const color = b.compliance >= 80 ? '#059669' : b.compliance >= 50 ? '#d97706' : '#dc2626';
    return `
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;font-size:14px;color:#374151;">${b.name}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;font-size:14px;color:#6b7280;">${b.region}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;font-size:14px;color:#6b7280;text-align:center;">${b.expected}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;font-size:14px;color:#6b7280;text-align:center;">${b.actual}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;font-size:14px;font-weight:600;color:${color};text-align:center;">${b.compliance}%</td>
      </tr>`;
  }).join('');

  const body = `
    <h2 style="margin:0 0 8px;color:#1f2937;font-size:20px;">Weekly Compliance Summary</h2>
    <p style="margin:0 0 24px;color:#6b7280;font-size:14px;">${weekLabel}</p>
    <p style="margin:0 0 16px;color:#4b5563;font-size:15px;">Hi ${adminName},</p>
    <p style="margin:0 0 24px;color:#4b5563;font-size:15px;">
      Here's the weekly compliance overview for all BDMs. Overall compliance: <strong>${overallCompliance}%</strong>
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
      <thead>
        <tr style="background:#f9fafb;">
          <th style="padding:10px 12px;text-align:left;font-size:13px;font-weight:600;color:#374151;border-bottom:2px solid #e5e7eb;">BDM</th>
          <th style="padding:10px 12px;text-align:left;font-size:13px;font-weight:600;color:#374151;border-bottom:2px solid #e5e7eb;">Region</th>
          <th style="padding:10px 12px;text-align:center;font-size:13px;font-weight:600;color:#374151;border-bottom:2px solid #e5e7eb;">Expected</th>
          <th style="padding:10px 12px;text-align:center;font-size:13px;font-weight:600;color:#374151;border-bottom:2px solid #e5e7eb;">Actual</th>
          <th style="padding:10px 12px;text-align:center;font-size:13px;font-weight:600;color:#374151;border-bottom:2px solid #e5e7eb;">Compliance</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>`;

  const textRows = bdmStats.map((b) => `  ${b.name} (${b.region}): ${b.actual}/${b.expected} visits (${b.compliance}%)`).join('\n');
  const text = `Hi ${adminName},\n\nWeekly Compliance Summary - ${weekLabel}\nOverall compliance: ${overallCompliance}%\n\n${textRows}`;

  return { subject, html: baseLayout(subject, body), text };
};

/**
 * BDM weekly report template
 * @param {Object} data
 * @param {string} data.bdmName
 * @param {string} data.weekLabel
 * @param {number} data.totalVisits
 * @param {number} data.expectedVisits
 * @param {number} data.compliance
 * @param {Array<{name: string, specialty: string}>} data.unvisitedDoctors
 * @returns {{ subject: string, html: string, text: string }}
 */
const bdmWeeklyReportTemplate = (data) => {
  const { bdmName, weekLabel, totalVisits, expectedVisits, compliance, unvisitedDoctors } = data;
  const subject = `VIP CRM - Your Weekly Report (${weekLabel})`;

  const complianceColor = compliance >= 80 ? '#059669' : compliance >= 50 ? '#d97706' : '#dc2626';

  const unvisitedList = unvisitedDoctors.length > 0
    ? unvisitedDoctors.map((d) => `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-size:14px;color:#374151;">${d.name}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-size:14px;color:#6b7280;">${d.specialty || 'N/A'}</td>
        </tr>`).join('')
    : '<tr><td colspan="2" style="padding:12px;text-align:center;color:#059669;font-size:14px;">All VIP Clients visited!</td></tr>';

  const body = `
    <h2 style="margin:0 0 8px;color:#1f2937;font-size:20px;">Your Weekly Report</h2>
    <p style="margin:0 0 24px;color:#6b7280;font-size:14px;">${weekLabel}</p>
    <p style="margin:0 0 24px;color:#4b5563;font-size:15px;">Hi ${bdmName},</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr>
        <td width="33%" style="padding:16px;background:#f9fafb;border-radius:8px;text-align:center;">
          <p style="margin:0 0 4px;font-size:24px;font-weight:700;color:#1f2937;">${totalVisits}</p>
          <p style="margin:0;font-size:12px;color:#6b7280;">Visits Made</p>
        </td>
        <td width="8"></td>
        <td width="33%" style="padding:16px;background:#f9fafb;border-radius:8px;text-align:center;">
          <p style="margin:0 0 4px;font-size:24px;font-weight:700;color:#1f2937;">${expectedVisits}</p>
          <p style="margin:0;font-size:12px;color:#6b7280;">Expected</p>
        </td>
        <td width="8"></td>
        <td width="33%" style="padding:16px;background:#f9fafb;border-radius:8px;text-align:center;">
          <p style="margin:0 0 4px;font-size:24px;font-weight:700;color:${complianceColor};">${compliance}%</p>
          <p style="margin:0;font-size:12px;color:#6b7280;">Compliance</p>
        </td>
      </tr>
    </table>
    <h3 style="margin:0 0 12px;color:#1f2937;font-size:16px;">Unvisited VIP Clients</h3>
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
      <thead>
        <tr style="background:#f9fafb;">
          <th style="padding:8px 12px;text-align:left;font-size:13px;font-weight:600;color:#374151;border-bottom:2px solid #e5e7eb;">Name</th>
          <th style="padding:8px 12px;text-align:left;font-size:13px;font-weight:600;color:#374151;border-bottom:2px solid #e5e7eb;">Specialty</th>
        </tr>
      </thead>
      <tbody>
        ${unvisitedList}
      </tbody>
    </table>`;

  const unvisitedText = unvisitedDoctors.length > 0
    ? unvisitedDoctors.map((d) => `  - ${d.name} (${d.specialty || 'N/A'})`).join('\n')
    : '  All VIP Clients visited!';
  const text = `Hi ${bdmName},\n\nYour Weekly Report - ${weekLabel}\n\nVisits: ${totalVisits}/${expectedVisits} (${compliance}% compliance)\n\nUnvisited VIP Clients:\n${unvisitedText}`;

  return { subject, html: baseLayout(subject, body), text };
};

/**
 * Behind-schedule alert template
 * @param {Object} data
 * @param {string} data.bdmName
 * @param {number} data.actualVisits
 * @param {number} data.expectedByNow
 * @param {number} data.percentageComplete
 * @param {number} data.currentWeek
 * @param {number} data.totalMonthlyTarget
 * @param {number} data.daysRemaining
 * @returns {{ subject: string, html: string, text: string }}
 */
const behindScheduleAlertTemplate = (data) => {
  const { bdmName, actualVisits, expectedByNow, percentageComplete, currentWeek, totalMonthlyTarget, daysRemaining } = data;
  const subject = 'VIP CRM - Behind Schedule Alert';

  const urgencyColor = percentageComplete < 50 ? '#dc2626' : '#d97706';
  const urgencyLabel = percentageComplete < 50 ? 'Critical' : 'Warning';
  const urgencyBg = percentageComplete < 50 ? '#fee2e2' : '#fef3c7';

  const body = `
    <div style="background:${urgencyBg};border-radius:8px;padding:16px;margin-bottom:24px;text-align:center;">
      <span style="display:inline-block;background:${urgencyColor};color:#ffffff;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:700;text-transform:uppercase;">${urgencyLabel}</span>
      <p style="margin:8px 0 0;color:${urgencyColor};font-size:15px;font-weight:600;">You are behind on your visit schedule</p>
    </div>
    <p style="margin:0 0 24px;color:#4b5563;font-size:15px;">Hi ${bdmName},</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr>
        <td width="50%" style="padding:16px;background:#f9fafb;border-radius:8px;text-align:center;">
          <p style="margin:0 0 4px;font-size:28px;font-weight:700;color:${urgencyColor};">${actualVisits} / ${expectedByNow}</p>
          <p style="margin:0;font-size:12px;color:#6b7280;">Actual vs Expected (Week ${currentWeek})</p>
        </td>
        <td width="8"></td>
        <td width="50%" style="padding:16px;background:#f9fafb;border-radius:8px;text-align:center;">
          <p style="margin:0 0 4px;font-size:28px;font-weight:700;color:#1f2937;">${daysRemaining}</p>
          <p style="margin:0;font-size:12px;color:#6b7280;">Work Days Remaining</p>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 8px;color:#4b5563;font-size:14px;">
      Monthly target: <strong>${totalMonthlyTarget} visits</strong> | Progress: <strong>${percentageComplete}%</strong>
    </p>
    <p style="margin:0;color:#6b7280;font-size:13px;">
      Log into VIP CRM to plan your remaining visits and catch up on your schedule.
    </p>`;

  const text = `Hi ${bdmName},\n\n${urgencyLabel.toUpperCase()}: You are behind on your visit schedule.\n\nProgress: ${actualVisits}/${expectedByNow} visits (${percentageComplete}%)\nCurrent Week: ${currentWeek}\nMonthly Target: ${totalMonthlyTarget}\nWork Days Remaining: ${daysRemaining}\n\nLog into VIP CRM to plan your remaining visits.`;

  return { subject, html: baseLayout(subject, body), text };
};

module.exports = {
  passwordResetTemplate,
  adminWeeklySummaryTemplate,
  bdmWeeklyReportTemplate,
  behindScheduleAlertTemplate,
};
