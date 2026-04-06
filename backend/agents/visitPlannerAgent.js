/**
 * Smart Visit Planner Agent (#B) — AI-powered visit scheduling
 *
 * Runs weekly Sunday 6:00 PM. Plans next week's visits per BDM based on:
 *   - VIP Client visit frequency (2x or 4x monthly)
 *   - Pending/missed visits from current cycle
 *   - Hospital geography (group nearby hospitals)
 *   - Engagement decay signals
 *
 * Notifies: Each BDM with their suggested schedule
 */
const { askClaude } = require('./claudeClient');
const { notify } = require('./notificationService');
const AgentRun = require('../erp/models/AgentRun');

async function run() {
  console.log('[VisitPlanner] Running...');
  try {
    const User = require('../models/User');
    const Doctor = require('../models/Doctor');
    const Visit = require('../models/Visit');
    const Region = require('../models/Region');

    const bdms = await User.find({ role: 'employee', isActive: true }).select('_id name regions').lean();
    if (!bdms.length) { console.log('[VisitPlanner] No active BDMs.'); return; }

    const now = new Date();
    const nextMon = new Date(now);
    nextMon.setDate(now.getDate() + (8 - now.getDay()) % 7);
    if (nextMon <= now) nextMon.setDate(nextMon.getDate() + 7);
    const nextFri = new Date(nextMon);
    nextFri.setDate(nextMon.getDate() + 4);

    // Current month's week number (1-4)
    const weekOfMonth = Math.ceil(nextMon.getDate() / 7);
    const monthStart = new Date(nextMon.getFullYear(), nextMon.getMonth(), 1);

    for (const bdm of bdms) {
      // Get BDM's assigned VIP Clients
      let regionIds = bdm.regions || [];
      if (regionIds.length) {
        const allRegionIds = [];
        for (const rId of regionIds) {
          const descendants = await Region.getDescendantIds(rId);
          allRegionIds.push(rId, ...descendants);
        }
        regionIds = allRegionIds;
      }

      const doctors = await Doctor.find({
        ...(regionIds.length ? { region: { $in: regionIds } } : {}),
        isActive: true
      }).select('firstName lastName visitFrequency region clinicAddress').lean();

      if (!doctors.length) continue;

      // Get this month's visits already logged
      const monthVisits = await Visit.find({
        user: bdm._id,
        visitDate: { $gte: monthStart, $lte: nextFri }
      }).select('doctor visitDate weekOfMonth').lean();

      const visitedThisMonth = {};
      for (const v of monthVisits) {
        const dId = v.doctor?.toString();
        if (!dId) continue;
        if (!visitedThisMonth[dId]) visitedThisMonth[dId] = [];
        visitedThisMonth[dId].push(v.weekOfMonth);
      }

      // Build VIP Client status list
      const clientStatus = doctors.map(d => {
        const dId = d._id.toString();
        const freq = d.visitFrequency || 4;
        const visited = visitedThisMonth[dId] || [];
        const remaining = freq - visited.length;
        return {
          name: `${d.lastName}, ${d.firstName}`,
          freq,
          visited: visited.length,
          remaining: Math.max(0, remaining),
          weeks: visited,
          address: d.clinicAddress || ''
        };
      }).filter(c => c.remaining > 0);

      if (!clientStatus.length) continue;

      const statusText = clientStatus
        .sort((a, b) => b.remaining - a.remaining)
        .slice(0, 30)
        .map(c => `${c.name} (${c.freq}x/mo, ${c.visited} done, ${c.remaining} left) — ${c.address || 'no address'}`)
        .join('\n');

      const { text } = await askClaude({
        system: `You are a visit scheduling assistant for a Philippine pharma BDM. Plan Monday-Friday visits considering:
- VIP Clients needing visits (frequency 2x = alternating weeks, 4x = every week)
- Group nearby clients by area to minimize travel
- Max ~8-10 visits per day
- Prioritize clients with more remaining visits
Output a simple Mon-Fri schedule. Be practical and concise.`,
        prompt: `BDM: ${bdm.name}\nWeek: ${nextMon.toLocaleDateString('en-PH')} – ${nextFri.toLocaleDateString('en-PH')} (Week ${weekOfMonth} of month)\n\nClients needing visits:\n${statusText}\n\nSuggest a Mon-Fri visit schedule.`,
        maxTokens: 600,
        agent: 'visit_planner'
      });

      await notify({
        recipient_id: bdm._id,
        title: `Visit Plan — Week of ${nextMon.toLocaleDateString('en-PH')}`,
        body: text,
        category: 'ai_schedule',
        priority: 'normal',
        channels: ['in_app'],
        agent: 'visit_planner'
      });

      console.log(`[VisitPlanner] ${bdm.name}: ${clientStatus.length} clients need visits next week`);
    }

    // Log agent run
    await AgentRun.create({
      agent_key: 'visit_planner',
      agent_label: 'Smart Visit Planner',
      status: 'success',
      summary: {
        bdms_processed: bdms.length,
        alerts_generated: 0,
        messages_sent: bdms.length,
        key_findings: [`${bdms.length} BDMs received visit plans for week of ${nextMon.toLocaleDateString('en-PH')}`]
      }
    });

    console.log('[VisitPlanner] Done.');
  } catch (err) {
    console.error('[VisitPlanner] Error:', err.message);
    try { await AgentRun.create({ agent_key: 'visit_planner', agent_label: 'Smart Visit Planner', status: 'error', error_msg: err.message }); } catch {}
  }
}

module.exports = { run };
