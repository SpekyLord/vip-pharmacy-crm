/**
 * Engagement Decay Agent (#C) — AI-powered churn detection for VIP Clients
 *
 * Runs weekly Monday 7:00 AM. Identifies VIP Clients losing engagement:
 *   - Declining visit frequency (vs target)
 *   - Declining sales volume at hospital
 *   - No visits in 2+ weeks for 4x clients, 4+ weeks for 2x clients
 *
 * Suggests re-engagement strategies per client.
 * Notifies: Relevant BDMs + PRESIDENT
 */
const { askClaude } = require('./claudeClient');
const { notify } = require('./notificationService');
const AgentRun = require('../erp/models/AgentRun');

async function run() {
  console.log('[EngagementDecay] Running...');
  try {
    const User = require('../models/User');
    const Doctor = require('../models/Doctor');
    const Visit = require('../models/Visit');

    const now = new Date();
    const twoWeeksAgo = new Date(now.getTime() - 14 * 86400000);
    const fourWeeksAgo = new Date(now.getTime() - 28 * 86400000);
    const threeMonthsAgo = new Date(now.getTime() - 90 * 86400000);

    // Get all active VIP Clients
    const doctors = await Doctor.find({ isActive: true })
      .select('firstName lastName visitFrequency region assignedEmployee')
      .lean();

    if (!doctors.length) { console.log('[EngagementDecay] No active VIP Clients.'); return; }

    const decayingClients = [];

    for (const doc of doctors) {
      const freq = doc.visitFrequency || 4;
      const cutoff = freq >= 4 ? twoWeeksAgo : fourWeeksAgo;

      // Last visit
      const lastVisit = await Visit.findOne({ doctor: doc._id })
        .sort({ visitDate: -1 })
        .select('visitDate user')
        .lean();

      if (!lastVisit) {
        // Never visited — flag if assigned
        if (doc.assignedEmployee) {
          decayingClients.push({
            doctor: doc,
            lastVisitDate: null,
            daysSinceVisit: 999,
            recentVisitCount: 0,
            bdmId: doc.assignedEmployee
          });
        }
        continue;
      }

      const daysSince = Math.floor((now - new Date(lastVisit.visitDate)) / 86400000);

      // Check if overdue
      if (new Date(lastVisit.visitDate) < cutoff) {
        // Count visits in last 3 months to assess trend
        const recentCount = await Visit.countDocuments({
          doctor: doc._id,
          visitDate: { $gte: threeMonthsAgo }
        });

        // Expected visits in 3 months
        const expected = freq * 3;
        const ratio = recentCount / expected;

        if (ratio < 0.7) {  // Less than 70% of expected visits
          decayingClients.push({
            doctor: doc,
            lastVisitDate: lastVisit.visitDate,
            daysSinceVisit: daysSince,
            recentVisitCount: recentCount,
            expectedVisits: expected,
            ratio,
            bdmId: lastVisit.user || doc.assignedEmployee
          });
        }
      }
    }

    if (!decayingClients.length) {
      console.log('[EngagementDecay] No decaying clients detected.');
      return;
    }

    // Sort by severity (highest decay first)
    decayingClients.sort((a, b) => (a.ratio || 0) - (b.ratio || 0));

    // Group by BDM
    const byBdm = {};
    for (const item of decayingClients) {
      const bid = item.bdmId?.toString() || 'unassigned';
      if (!byBdm[bid]) byBdm[bid] = [];
      byBdm[bid].push(item);
    }

    // Get BDM names
    const bdmIds = Object.keys(byBdm).filter(k => k !== 'unassigned');
    const bdmUsers = await User.find({ _id: { $in: bdmIds } }).select('_id name').lean();
    const bdmNameMap = {};
    for (const u of bdmUsers) bdmNameMap[u._id.toString()] = u.name;

    // Generate AI insights for top decaying clients
    const topClients = decayingClients.slice(0, 15).map(c => {
      const d = c.doctor;
      return `Dr. ${d.lastName}, ${d.firstName} (${d.visitFrequency || 4}x/mo): Last visit ${c.daysSinceVisit} days ago, ${c.recentVisitCount}/${c.expectedVisits || '?'} visits in 3mo (${((c.ratio || 0) * 100).toFixed(0)}% of target)`;
    }).join('\n');

    const { text } = await askClaude({
      system: `You are a customer engagement analyst for a Philippine pharma company. Analyze VIP Client engagement decay and suggest re-engagement strategies. Consider:
- Philippine medical practice context (doctors are busy, visit timing matters)
- Relationship rebuilding approaches
- Whether to escalate to management
Be concise — 2-3 sentences per client recommendation.`,
      prompt: `${decayingClients.length} VIP Clients showing engagement decay:\n\n${topClients}\n\nSuggest re-engagement strategies for the most critical cases.`,
      maxTokens: 600,
      agent: 'engagement_decay'
    });

    // Notify president with full summary
    await notify({
      recipient_id: 'PRESIDENT',
      title: `Engagement Decay Alert — ${decayingClients.length} VIP Clients at risk`,
      body: text,
      category: 'ai_alert',
      priority: 'important',
      channels: ['in_app'],
      agent: 'engagement_decay'
    });

    // Notify each BDM about their decaying clients
    for (const [bdmId, clients] of Object.entries(byBdm)) {
      if (bdmId === 'unassigned') continue;
      const names = clients.slice(0, 10).map(c => {
        const d = c.doctor;
        return `Dr. ${d.lastName} — ${c.daysSinceVisit} days since last visit`;
      }).join('\n');

      await notify({
        recipient_id: bdmId,
        title: `${clients.length} VIP Client(s) need attention`,
        body: `The following VIP Clients in your territory show declining engagement:\n\n${names}\n\nPlease prioritize re-engagement visits this week.`,
        category: 'ai_alert',
        priority: 'important',
        channels: ['in_app'],
        agent: 'engagement_decay'
      });
    }

    // Log agent run
    await AgentRun.create({
      agent_key: 'engagement_decay',
      agent_label: 'Engagement Decay Monitor',
      status: 'success',
      summary: {
        bdms_processed: Object.keys(byBdm).length,
        alerts_generated: decayingClients.length,
        messages_sent: Object.keys(byBdm).length + 1,
        key_findings: decayingClients.slice(0, 3).map(c => `Dr. ${c.doctor.lastName}: ${c.daysSinceVisit} days, ${((c.ratio || 0) * 100).toFixed(0)}% target`)
      }
    });

    console.log(`[EngagementDecay] Flagged ${decayingClients.length} decaying clients across ${Object.keys(byBdm).length} BDMs.`);
  } catch (err) {
    console.error('[EngagementDecay] Error:', err.message);
    try { await AgentRun.create({ agent_key: 'engagement_decay', agent_label: 'Engagement Decay Monitor', status: 'error', error_msg: err.message }); } catch {}
  }
}

module.exports = { run };
