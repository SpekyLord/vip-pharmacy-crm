/**
 * Smart Visit Planner Agent (#B) - AI-powered visit scheduling.
 */

const { askClaude } = require('./claudeClient');
const { notify, countSuccessfulChannels, getInAppMessageIds } = require('./notificationService');

async function run() {
  console.log('[VisitPlanner] Running...');

  const User = require('../models/User');
  const Doctor = require('../models/Doctor');
  const Visit = require('../models/Visit');

  const bdms = await User.find({ role: 'employee', isActive: true }).select('_id name regions').lean();
  if (!bdms.length) {
    return {
      status: 'success',
      summary: {
        bdms_processed: 0,
        alerts_generated: 0,
        messages_sent: 0,
        key_findings: ['No active BDMs found for visit planning.'],
      },
      message_ids: [],
    };
  }

  const now = new Date();
  const nextMon = new Date(now);
  nextMon.setDate(now.getDate() + ((8 - now.getDay()) % 7));
  if (nextMon <= now) nextMon.setDate(nextMon.getDate() + 7);
  const nextFri = new Date(nextMon);
  nextFri.setDate(nextMon.getDate() + 4);

  const weekOfMonth = Math.ceil(nextMon.getDate() / 7);
  const monthStart = new Date(nextMon.getFullYear(), nextMon.getMonth(), 1);

  const notificationResults = [];
  const plannedBdms = [];

  for (const bdm of bdms) {
    const doctors = await Doctor.find({
      $or: [
        { assignedTo: bdm._id },
        { assignedEmployee: bdm._id },
        ...(bdm.regions?.length ? [{ region: { $in: bdm.regions } }] : []),
      ],
      isActive: true,
    }).select('firstName lastName visitFrequency region clinicOfficeAddress clinicAddress').lean();

    if (!doctors.length) continue;

    const monthVisits = await Visit.find({
      user: bdm._id,
      visitDate: { $gte: monthStart, $lte: nextFri },
    }).select('doctor visitDate weekOfMonth').lean();

    const visitedThisMonth = {};
    for (const visit of monthVisits) {
      const doctorId = visit.doctor?.toString();
      if (!doctorId) continue;
      if (!visitedThisMonth[doctorId]) visitedThisMonth[doctorId] = [];
      visitedThisMonth[doctorId].push(visit.weekOfMonth);
    }

    const clientStatus = doctors
      .map((doctor) => {
        const doctorId = doctor._id.toString();
        const frequency = doctor.visitFrequency || 4;
        const visitedWeeks = visitedThisMonth[doctorId] || [];
        const remaining = frequency - visitedWeeks.length;

        return {
          name: `${doctor.lastName}, ${doctor.firstName}`,
          frequency,
          visited: visitedWeeks.length,
          remaining: Math.max(0, remaining),
          weeks: visitedWeeks,
          address: doctor.clinicOfficeAddress || doctor.clinicAddress || '',
        };
      })
      .filter((client) => client.remaining > 0);

    if (!clientStatus.length) continue;

    const statusText = clientStatus
      .sort((a, b) => b.remaining - a.remaining)
      .slice(0, 30)
      .map((client) => `${client.name} (${client.frequency}x/mo, ${client.visited} done, ${client.remaining} left) - ${client.address || 'no address'}`)
      .join('\n');

    const { text } = await askClaude({
      system: `You are a visit scheduling assistant for a Philippine pharma BDM. Plan Monday-Friday visits considering:
- VIP clients needing visits (frequency 2x = alternating weeks, 4x = every week)
- Group nearby clients by area to minimize travel
- Max about 8-10 visits per day
- Prioritize clients with more remaining visits
Output a practical Mon-Fri schedule.`,
      prompt: `BDM: ${bdm.name}\nWeek: ${nextMon.toLocaleDateString('en-PH')} - ${nextFri.toLocaleDateString('en-PH')} (Week ${weekOfMonth} of month)\n\nClients needing visits:\n${statusText}\n\nSuggest a Mon-Fri visit schedule.`,
      maxTokens: 600,
      agent: 'visit_planner',
    });

    notificationResults.push(
      ...(await notify({
        recipient_id: bdm._id,
        title: `Visit Plan - Week of ${nextMon.toLocaleDateString('en-PH')}`,
        body: text,
        category: 'ai_schedule',
        priority: 'normal',
        channels: ['in_app'],
        agent: 'visit_planner',
      }))
    );

    plannedBdms.push({
      name: bdm.name,
      clientsNeedingVisits: clientStatus.length,
    });
    console.log(`[VisitPlanner] ${bdm.name}: ${clientStatus.length} clients need visits next week`);
  }

  if (!plannedBdms.length) {
    return {
      status: 'success',
      summary: {
        bdms_processed: 0,
        alerts_generated: 0,
        messages_sent: 0,
        key_findings: [`No visit plans needed for week of ${nextMon.toLocaleDateString('en-PH')}.`],
      },
      message_ids: [],
    };
  }

  console.log('[VisitPlanner] Done.');

  return {
    status: 'success',
    summary: {
      bdms_processed: plannedBdms.length,
      alerts_generated: plannedBdms.reduce((sum, bdm) => sum + bdm.clientsNeedingVisits, 0),
      messages_sent: countSuccessfulChannels(notificationResults, 'in_app'),
      key_findings: [
        `${plannedBdms.length} BDMs received visit plans for week of ${nextMon.toLocaleDateString('en-PH')}`,
        ...plannedBdms.slice(0, 2).map((bdm) => `${bdm.name}: ${bdm.clientsNeedingVisits} clients queued for scheduling`),
      ],
    },
    message_ids: getInAppMessageIds(notificationResults),
  };
}

module.exports = { run };
