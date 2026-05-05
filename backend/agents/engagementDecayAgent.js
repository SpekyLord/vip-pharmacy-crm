/**
 * Engagement Decay Agent (#C) - AI-powered churn detection for VIP clients.
 */

const { askClaude } = require('./claudeClient');
const { notify, countSuccessfulChannels, getInAppMessageIds } = require('./notificationService');

async function run() {
  console.log('[EngagementDecay] Running...');

  const User = require('../models/User');
  const Doctor = require('../models/Doctor');
  const Visit = require('../models/Visit');

  const now = new Date();
  const twoWeeksAgo = new Date(now.getTime() - 14 * 86400000);
  const fourWeeksAgo = new Date(now.getTime() - 28 * 86400000);
  const threeMonthsAgo = new Date(now.getTime() - 90 * 86400000);

  const doctors = await Doctor.find({ isActive: true })
    .select('firstName lastName visitFrequency region assignedTo assignedEmployee')
    .lean();

  if (!doctors.length) {
    return {
      status: 'success',
      summary: {
        bdms_processed: 0,
        alerts_generated: 0,
        messages_sent: 0,
        key_findings: ['No active VIP clients found for engagement monitoring.'],
      },
      message_ids: [],
    };
  }

  const decayingClients = [];

  for (const doctor of doctors) {
    const frequency = doctor.visitFrequency || 4;
    const cutoff = frequency >= 4 ? twoWeeksAgo : fourWeeksAgo;

    const lastVisit = await Visit.findOne({ doctor: doctor._id })
      .sort({ visitDate: -1 })
      .select('visitDate user')
      .lean();

    // Phase A.5.4 — assignedTo is an array; pick the primary assignee for the
    // single-BDM coaching alert. Falls back to the legacy assignedEmployee field
    // if the doc was never migrated past Phase A.4.
    const { getPrimaryAssigneeId } = require('../utils/assigneeAccess');
    const assignedBdmId = getPrimaryAssigneeId(doctor) || doctor.assignedEmployee || null;

    if (!lastVisit) {
      if (assignedBdmId) {
        decayingClients.push({
          doctor,
          lastVisitDate: null,
          daysSinceVisit: null,
          recentVisitCount: 0,
          expectedVisits: frequency * 3,
          ratio: 0,
          bdmId: assignedBdmId,
        });
      }
      continue;
    }

    const daysSinceVisit = Math.floor((now - new Date(lastVisit.visitDate)) / 86400000);

    if (new Date(lastVisit.visitDate) < cutoff) {
      const recentVisitCount = await Visit.countDocuments({
        doctor: doctor._id,
        visitDate: { $gte: threeMonthsAgo },
      });

      const expectedVisits = frequency * 3;
      const ratio = recentVisitCount / expectedVisits;

      if (ratio < 0.7) {
        decayingClients.push({
          doctor,
          lastVisitDate: lastVisit.visitDate,
          daysSinceVisit,
          recentVisitCount,
          expectedVisits,
          ratio,
          bdmId: lastVisit.user || assignedBdmId,
        });
      }
    }
  }

  if (!decayingClients.length) {
    console.log('[EngagementDecay] No decaying clients detected.');
    return {
      status: 'success',
      summary: {
        bdms_processed: 0,
        alerts_generated: 0,
        messages_sent: 0,
        key_findings: ['No decaying VIP clients detected this cycle.'],
      },
      message_ids: [],
    };
  }

  decayingClients.sort((a, b) => (a.ratio || 0) - (b.ratio || 0));

  const byBdm = {};
  for (const item of decayingClients) {
    const bdmKey = item.bdmId?.toString() || 'unassigned';
    if (!byBdm[bdmKey]) byBdm[bdmKey] = [];
    byBdm[bdmKey].push(item);
  }

  const bdmIds = Object.keys(byBdm).filter((key) => key !== 'unassigned');
  const bdmUsers = await User.find({ _id: { $in: bdmIds } }).select('_id name').lean();
  const bdmNameMap = {};
  for (const user of bdmUsers) bdmNameMap[user._id.toString()] = user.name;

  const formatRecency = (days) => (days == null ? 'never visited' : `last visit ${days} days ago`);

  const topClients = decayingClients
    .slice(0, 15)
    .map((client) => {
      const doctor = client.doctor;
      return `Dr. ${doctor.lastName}, ${doctor.firstName} (${doctor.visitFrequency || 4}x/mo): ${formatRecency(client.daysSinceVisit)}, ${client.recentVisitCount}/${client.expectedVisits || '?'} visits in 3 months (${((client.ratio || 0) * 100).toFixed(0)}% of target)`;
    })
    .join('\n');

  const { text } = await askClaude({
    system: `You are a customer engagement analyst for a Philippine pharma company. Analyze VIP client engagement decay and suggest re-engagement strategies. Consider:
- Philippine medical practice context
- Relationship rebuilding approaches
- Whether to escalate to management
Be concise with 2-3 sentences per client recommendation.`,
    prompt: `${decayingClients.length} VIP clients show engagement decay:\n\n${topClients}\n\nSuggest re-engagement strategies for the most critical cases.`,
    maxTokens: 600,
    agent: 'engagement_decay',
  });

  const notificationResults = [];
  notificationResults.push(
    ...(await notify({
      recipient_id: 'PRESIDENT',
      title: `Engagement Decay Alert - ${decayingClients.length} VIP Clients at risk`,
      body: text,
      category: 'ai_alert',
      priority: 'important',
      channels: ['in_app'],
      agent: 'engagement_decay',
    }))
  );

  for (const [bdmId, clients] of Object.entries(byBdm)) {
    if (bdmId === 'unassigned') continue;

    const names = clients
      .slice(0, 10)
      .map((client) => {
        const doctor = client.doctor;
        const recency = client.daysSinceVisit == null
          ? 'never visited'
          : `${client.daysSinceVisit} days since last visit`;
        return `Dr. ${doctor.lastName} - ${recency}`;
      })
      .join('\n');

    notificationResults.push(
      ...(await notify({
        recipient_id: bdmId,
        title: `${clients.length} VIP Client(s) need attention`,
        body: `The following VIP clients in your territory show declining engagement:\n\n${names}\n\nPlease prioritize re-engagement visits this week.`,
        category: 'ai_alert',
        priority: 'important',
        channels: ['in_app'],
        agent: 'engagement_decay',
      }))
    );
  }

  console.log(`[EngagementDecay] Flagged ${decayingClients.length} decaying clients across ${bdmIds.length} BDMs.`);

  return {
    status: 'success',
    summary: {
      bdms_processed: bdmIds.length,
      alerts_generated: decayingClients.length,
      messages_sent: countSuccessfulChannels(notificationResults, 'in_app'),
      key_findings: decayingClients.slice(0, 3).map((client) => {
        const recency = client.daysSinceVisit == null ? 'never visited' : `${client.daysSinceVisit} days`;
        return `Dr. ${client.doctor.lastName}: ${recency}, ${((client.ratio || 0) * 100).toFixed(0)}% target`;
      }),
    },
    message_ids: getInAppMessageIds(notificationResults),
  };
}

module.exports = { run };
