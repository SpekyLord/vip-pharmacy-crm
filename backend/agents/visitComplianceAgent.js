/**
 * Visit Compliance Agent (#A)
 */

const { notify, countSuccessfulChannels, getInAppMessageIds } = require('./notificationService');

function getISOWeekData(date) {
  const utcDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = utcDate.getUTCDay() || 7;
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1));
  const weekNumber = Math.ceil(((utcDate - yearStart) / 86400000 + 1) / 7);
  return { weekNumber, weekYear: utcDate.getUTCFullYear() };
}

async function run({ mode = 'midweek' } = {}) {
  const label = mode === 'endofweek' ? 'EndOfWeek' : 'MidWeek';
  console.log(`[VisitCompliance:${label}] Running...`);

  const User = require('../models/User');
  const Doctor = require('../models/Doctor');
  const Visit = require('../models/Visit');

  const now = new Date();
  const { weekNumber, weekYear } = getISOWeekData(now);
  const yearWeekKey = `${weekYear}-W${String(weekNumber).padStart(2, '0')}`;
  const monthYear = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const bdms = await User.find({ role: 'employee', isActive: true }).select('_id name email').lean();
  if (!bdms.length) {
    return {
      status: 'success',
      summary: {
        bdms_processed: 0,
        alerts_generated: 0,
        messages_sent: 0,
        key_findings: ['No active BDMs found for visit compliance.'],
      },
      message_ids: [],
    };
  }

  const bdmResults = [];
  const monthlyLowCompliance = [];
  const notificationResults = [];
  let directAlertsGenerated = 0;

  for (const bdm of bdms) {
    try {
      const assignedDoctors = await Doctor.find({
        $or: [{ assignedTo: bdm._id }, { assignedEmployee: bdm._id }],
        isActive: true,
      }).select('_id firstName lastName visitFrequency').lean();

      if (!assignedDoctors.length) continue;

      const freq4Doctors = assignedDoctors.filter((doctor) => doctor.visitFrequency === 4);
      const freq2Doctors = assignedDoctors.filter((doctor) => doctor.visitFrequency === 2);
      const expectedFreq2 = Math.ceil(freq2Doctors.length / 2);
      const expectedThisWeek = freq4Doctors.length + expectedFreq2;
      if (expectedThisWeek === 0) continue;

      const visitsThisWeek = await Visit.find({
        user: bdm._id,
        yearWeekKey,
        status: 'completed',
      }).select('doctor').lean();

      const visitedDoctorIds = new Set(visitsThisWeek.map((visit) => String(visit.doctor)));
      const completedCount = visitsThisWeek.length;
      const completionPct = Math.round((completedCount / expectedThisWeek) * 100);
      const unvisitedDoctors = freq4Doctors.filter((doctor) => !visitedDoctorIds.has(String(doctor._id)));

      bdmResults.push({
        bdm,
        expectedThisWeek,
        completedCount,
        completionPct,
        unvisitedDoctors,
        totalAssigned: assignedDoctors.length,
      });

      if (mode === 'midweek' && completionPct < 50) {
        directAlertsGenerated += 1;
        notificationResults.push(
          ...(await notify({
            recipient_id: String(bdm._id),
            title: `Mid-Week Warning: ${completedCount}/${expectedThisWeek} visits completed`,
            body: `You have completed ${completionPct}% of your weekly target (${completedCount} of ${expectedThisWeek}).\n\n${expectedThisWeek - completedCount} more visit(s) expected by Friday.\n\nPlease prioritize your remaining VIP client visits.`,
            category: 'system',
            priority: 'important',
            channels: ['in_app'],
            agent: 'visit_compliance',
          }))
        );
      }

      if (mode === 'endofweek' && unvisitedDoctors.length > 0) {
        directAlertsGenerated += unvisitedDoctors.length;
        const doctorList = unvisitedDoctors.map((doctor) => `  - Dr. ${doctor.lastName}, ${doctor.firstName}`).join('\n');
        notificationResults.push(
          ...(await notify({
            recipient_id: String(bdm._id),
            title: `End-of-Week Alert: ${unvisitedDoctors.length} unvisited VIP Client(s)`,
            body: `Weekly compliance: ${completedCount}/${expectedThisWeek} (${completionPct}%)\n\nThe following scheduled VIP clients were not visited this week:\n${doctorList}\n\nThese may carry forward to next week.`,
            category: 'system',
            priority: 'important',
            channels: ['in_app'],
            agent: 'visit_compliance',
          }))
        );
      }

      const expectedThisMonth = freq4Doctors.length * 4 + freq2Doctors.length * 2;
      if (expectedThisMonth > 0) {
        const visitsThisMonth = await Visit.countDocuments({
          user: bdm._id,
          monthYear,
          status: 'completed',
        });
        const monthlyPct = Math.round((visitsThisMonth / expectedThisMonth) * 100);
        if (monthlyPct < 70) {
          monthlyLowCompliance.push({
            name: bdm.name,
            visitsThisMonth,
            expectedThisMonth,
            monthlyPct,
          });
        }
      }
    } catch (err) {
      console.error(`[VisitCompliance:${label}] Error processing BDM ${bdm.name}:`, err.message);
    }
  }

  if (!bdmResults.length) {
    return {
      status: 'success',
      summary: {
        bdms_processed: 0,
        alerts_generated: 0,
        messages_sent: 0,
        key_findings: [`No assigned doctors found for ${label} visit compliance.`],
      },
      message_ids: [],
    };
  }

  const lowPerformers = bdmResults.filter((result) => result.completionPct < 50);
  let body = `Visit Compliance Report (${label}) - Week ${yearWeekKey}\n`;
  body += `Date: ${now.toLocaleDateString()}\n\n`;
  body += `BDMs tracked: ${bdmResults.length}\n\n`;
  body += '=== WEEKLY PROGRESS ===\n';

  for (const result of bdmResults.sort((a, b) => a.completionPct - b.completionPct)) {
    const status = result.completionPct >= 80 ? 'OK' : result.completionPct >= 50 ? 'BEHIND' : 'LOW';
    body += `  [${status}] ${result.bdm.name}: ${result.completedCount}/${result.expectedThisWeek} (${result.completionPct}%)`;
    if (result.unvisitedDoctors.length > 0 && mode === 'endofweek') {
      body += ` - ${result.unvisitedDoctors.length} unvisited`;
    }
    body += '\n';
  }

  if (monthlyLowCompliance.length > 0) {
    body += '\n=== MONTHLY COMPLIANCE < 70% ===\n';
    for (const monthly of monthlyLowCompliance) {
      body += `  - ${monthly.name}: ${monthly.visitsThisMonth}/${monthly.expectedThisMonth} (${monthly.monthlyPct}%)\n`;
    }
  }

  if (lowPerformers.length > 0) {
    body += `\n${lowPerformers.length} BDM(s) below 50% weekly target.`;
  }

  notificationResults.push(
    ...(await notify({
      recipient_id: 'PRESIDENT',
      title: `Visit Compliance ${label}: ${lowPerformers.length} BDM(s) behind`,
      body,
      category: 'system',
      priority: lowPerformers.length > 0 ? 'important' : 'normal',
      channels: ['in_app', 'email'],
      agent: 'visit_compliance',
    }))
  );

  console.log(`[VisitCompliance:${label}] Complete. Tracked ${bdmResults.length} BDMs.`);

  return {
    status: 'success',
    summary: {
      bdms_processed: bdmResults.length,
      alerts_generated: directAlertsGenerated,
      messages_sent: countSuccessfulChannels(notificationResults, 'in_app'),
      key_findings: [
        `${label}: ${lowPerformers.length} BDM(s) below 50% weekly target`,
        ...bdmResults.slice(0, 2).map((result) => `${result.bdm.name}: ${result.completedCount}/${result.expectedThisWeek} (${result.completionPct}%)`),
      ],
    },
    message_ids: getInAppMessageIds(notificationResults),
  };
}

module.exports = { run };
