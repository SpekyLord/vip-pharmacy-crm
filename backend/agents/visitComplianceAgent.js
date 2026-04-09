/**
 * Visit Compliance Agent (#A)
 * Runs twice per week:
 *   - Wednesday 8 AM (midweek warning)
 *   - Friday 10 AM (end-of-week alert)
 *
 * Accepts mode parameter: 'midweek' or 'endofweek'
 *
 * Checks:
 * 1. Per-BDM weekly visit progress vs expected (assigned doctors)
 * 2. Midweek: warns if < 50% of weekly target completed
 * 3. End-of-week: alerts with list of unvisited scheduled doctors
 * 4. Monthly compliance: flags if < 70% of monthly target
 */

const { notify } = require('./notificationService');
const { ROLES } = require('../constants/roles');

/**
 * Get current ISO week number and year
 */
function getISOWeekData(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNumber = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return { weekNumber, weekYear: d.getUTCFullYear() };
}

async function run(mode = 'midweek') {
  const label = mode === 'endofweek' ? 'EndOfWeek' : 'MidWeek';
  console.log(`[VisitCompliance:${label}] Running...`);
  try {
    const User = require('../models/User');
    const Doctor = require('../models/Doctor');
    const Visit = require('../models/Visit');

    const now = new Date();
    const { weekNumber, weekYear } = getISOWeekData(now);
    const yearWeekKey = `${weekYear}-W${String(weekNumber).padStart(2, '0')}`;
    const monthYear = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    // Get all active BDMs
    const bdms = await User.find({ role: ROLES.CONTRACTOR, isActive: true }).select('_id name email').lean();

    const bdmResults = [];
    const monthlyLowCompliance = [];

    for (const bdm of bdms) {
      try {
        // Get doctors assigned to this BDM
        const assignedDoctors = await Doctor.find({
          assignedTo: bdm._id,
          isActive: true
        }).select('_id firstName lastName visitFrequency').lean();

        if (assignedDoctors.length === 0) continue;

        // Calculate expected visits this week:
        // visitFrequency=4 → visit every week (1 per week)
        // visitFrequency=2 → visit alternating weeks (might or might not be this week)
        // For simplicity: freq=4 doctors always expected; freq=2 doctors expected 50% of weeks
        const freq4Doctors = assignedDoctors.filter(d => d.visitFrequency === 4);
        const freq2Doctors = assignedDoctors.filter(d => d.visitFrequency === 2);

        // freq=2 doctors: expected on odd weeks (W1, W3) or even weeks (W2, W4)
        // Use week parity as a simple heuristic
        const isOddWeek = weekNumber % 2 === 1;
        // Approximate: half of freq=2 doctors are expected each week
        const expectedFreq2 = Math.ceil(freq2Doctors.length / 2);
        const expectedThisWeek = freq4Doctors.length + expectedFreq2;

        if (expectedThisWeek === 0) continue;

        // Get actual visits this week
        const visitsThisWeek = await Visit.find({
          user: bdm._id,
          yearWeekKey,
          status: 'completed'
        }).select('doctor').lean();

        const visitedDoctorIds = new Set(visitsThisWeek.map(v => String(v.doctor)));
        const completedCount = visitsThisWeek.length;
        const completionPct = Math.round((completedCount / expectedThisWeek) * 100);

        // Find unvisited freq=4 doctors (definitely expected this week)
        const unvisitedDoctors = freq4Doctors.filter(d => !visitedDoctorIds.has(String(d._id)));

        const result = {
          bdm,
          expectedThisWeek,
          completedCount,
          completionPct,
          unvisitedDoctors,
          totalAssigned: assignedDoctors.length
        };

        bdmResults.push(result);

        // ─── Midweek check: warn if < 50% ─────────────────────────
        if (mode === 'midweek' && completionPct < 50) {
          const deficit = expectedThisWeek - completedCount;
          await notify({
            recipient_id: String(bdm._id),
            title: `Mid-Week Warning: ${completedCount}/${expectedThisWeek} visits completed`,
            body: `You have completed ${completionPct}% of your weekly target (${completedCount} of ${expectedThisWeek}).\n\n${deficit} more visit(s) expected by Friday.\n\nPlease prioritize your remaining VIP Client visits.`,
            category: 'system',
            priority: 'important',
            channels: ['in_app'],
            agent: 'visit_compliance'
          });
        }

        // ─── End-of-week check: alert with unvisited list ──────────
        if (mode === 'endofweek' && unvisitedDoctors.length > 0) {
          const doctorList = unvisitedDoctors
            .map(d => `  - Dr. ${d.lastName}, ${d.firstName}`)
            .join('\n');

          await notify({
            recipient_id: String(bdm._id),
            title: `End-of-Week Alert: ${unvisitedDoctors.length} unvisited VIP Client(s)`,
            body: `Weekly compliance: ${completedCount}/${expectedThisWeek} (${completionPct}%)\n\nThe following scheduled VIP Clients were NOT visited this week:\n${doctorList}\n\nThese may carry forward to next week.`,
            category: 'system',
            priority: 'important',
            channels: ['in_app'],
            agent: 'visit_compliance'
          });
        }

        // ─── Monthly compliance check ──────────────────────────────
        try {
          // Total expected this month: freq4 * 4 weeks + freq2 * 2 weeks
          const expectedThisMonth = (freq4Doctors.length * 4) + (freq2Doctors.length * 2);
          if (expectedThisMonth === 0) continue;

          const visitsThisMonth = await Visit.countDocuments({
            user: bdm._id,
            monthYear,
            status: 'completed'
          });

          const monthlyPct = Math.round((visitsThisMonth / expectedThisMonth) * 100);

          if (monthlyPct < 70) {
            monthlyLowCompliance.push({
              name: bdm.name,
              visitsThisMonth,
              expectedThisMonth,
              monthlyPct
            });
          }
        } catch (err) {
          // Skip monthly check errors
        }
      } catch (err) {
        console.error(`[VisitCompliance:${label}] Error processing BDM ${bdm.name}:`, err.message);
      }
    }

    // ─── President summary ─────────────────────────────────────────
    if (bdmResults.length > 0) {
      const lowPerformers = bdmResults.filter(r => r.completionPct < 50);

      let body = `Visit Compliance Report (${label}) — Week ${yearWeekKey}\n`;
      body += `Date: ${now.toLocaleDateString()}\n\n`;
      body += `BDMs tracked: ${bdmResults.length}\n\n`;

      // Summary table
      body += '=== WEEKLY PROGRESS ===\n';
      for (const r of bdmResults.sort((a, b) => a.completionPct - b.completionPct)) {
        const status = r.completionPct >= 80 ? 'OK' : r.completionPct >= 50 ? 'BEHIND' : 'LOW';
        body += `  [${status}] ${r.bdm.name}: ${r.completedCount}/${r.expectedThisWeek} (${r.completionPct}%)`;
        if (r.unvisitedDoctors.length > 0 && mode === 'endofweek') {
          body += ` — ${r.unvisitedDoctors.length} unvisited`;
        }
        body += '\n';
      }

      if (monthlyLowCompliance.length > 0) {
        body += '\n=== MONTHLY COMPLIANCE < 70% ===\n';
        for (const m of monthlyLowCompliance) {
          body += `  - ${m.name}: ${m.visitsThisMonth}/${m.expectedThisMonth} (${m.monthlyPct}%)\n`;
        }
      }

      if (lowPerformers.length > 0) {
        body += `\n${lowPerformers.length} BDM(s) below 50% weekly target.`;
      }

      await notify({
        recipient_id: 'PRESIDENT',
        title: `Visit Compliance ${label}: ${lowPerformers.length} BDM(s) behind`,
        body,
        category: 'system',
        priority: lowPerformers.length > 0 ? 'important' : 'normal',
        channels: ['in_app', 'email'],
        agent: 'visit_compliance'
      });
    }

    console.log(`[VisitCompliance:${label}] Complete. Tracked ${bdmResults.length} BDMs.`);
  } catch (err) {
    console.error(`[VisitCompliance:${label}] Error:`, err.message);
  }
}

module.exports = { run };
