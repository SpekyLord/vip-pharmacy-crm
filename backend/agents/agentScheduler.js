/**
 * Agent Scheduler - Central cron runner for all VIP ERP/CRM agents.
 *
 * All times: Asia/Manila timezone.
 */

const cron = require('node-cron');
const { runScheduledAgent } = require('./agentExecutor');

const TIMEZONE = 'Asia/Manila';

async function triggerScheduled(agentKey, label, args = {}) {
  try {
    const result = await runScheduledAgent(agentKey, args);
    if (result?.reason === 'disabled') {
      console.log(`[AgentScheduler] ${label} skipped (disabled).`);
    }
  } catch (err) {
    console.error(`[AgentScheduler] ${label} failed:`, err.message);
  }
}

function initAgentScheduler() {
  console.log('[AgentScheduler] Initializing agent cron jobs...');

  cron.schedule('0 6 * * *', () => triggerScheduled('expense_anomaly', 'Expense Anomaly'), { timezone: TIMEZONE });
  console.log('[AgentScheduler]   ✓ #3 Expense Anomaly - daily 6:00 AM');

  cron.schedule('30 6 * * *', () => triggerScheduled('inventory_reorder', 'Inventory Reorder'), { timezone: TIMEZONE });
  console.log('[AgentScheduler]   ✓ #6 Inventory Reorder - daily 6:30 AM');

  cron.schedule('0 23 * * 0', () => triggerScheduled('credit_risk', 'Credit Risk'), { timezone: TIMEZONE });
  console.log('[AgentScheduler]   ✓ #8 Credit Risk - weekly Sunday 11:00 PM');

  cron.schedule('30 7 * * *', () => triggerScheduled('document_expiry', 'Document Expiry'), { timezone: TIMEZONE });
  console.log('[AgentScheduler]   ✓ #10 Document Expiry - daily 7:30 AM');

  cron.schedule('0 8 * * 3', () => triggerScheduled('visit_compliance', 'Visit Compliance (midweek)', { mode: 'midweek' }), { timezone: TIMEZONE });
  console.log('[AgentScheduler]   ✓ #A Visit Compliance - Wed 8:00 AM (midweek)');

  cron.schedule('0 10 * * 5', () => triggerScheduled('visit_compliance', 'Visit Compliance (endofweek)', { mode: 'endofweek' }), { timezone: TIMEZONE });
  console.log('[AgentScheduler]   ✓ #A Visit Compliance - Fri 10:00 AM (endofweek)');

  cron.schedule('30 8 * * *', () => triggerScheduled('photo_audit', 'Photo Audit'), { timezone: TIMEZONE });
  console.log('[AgentScheduler]   ✓ #D Photo Audit - daily 8:30 AM');

  cron.schedule('0 5 * * 1', () => triggerScheduled('system_integrity', 'System Integrity'), { timezone: TIMEZONE });
  console.log('[AgentScheduler]   ✓ #S System Integrity - weekly Monday 5:00 AM');

  const hasAiKey = !!process.env.ANTHROPIC_API_KEY;

  if (hasAiKey) {
    console.log('[AgentScheduler] ANTHROPIC_API_KEY detected - enabling paid agents');

    cron.schedule('0 7 * * 1-5', () => triggerScheduled('smart_collection', 'Smart Collection'), { timezone: TIMEZONE });
    console.log('[AgentScheduler]   ✓ #1 Smart Collection - weekdays 7:00 AM');

    cron.schedule('0 9 15 * *', () => triggerScheduled('bir_filing', 'BIR Filing Review'), { timezone: TIMEZONE });
    console.log('[AgentScheduler]   ✓ #5 BIR Filing Review - 15th monthly 9:00 AM');

    cron.schedule('0 6 * * 1', () => triggerScheduled('performance_coach', 'Performance Coach'), { timezone: TIMEZONE });
    console.log('[AgentScheduler]   ✓ #7 BDM Performance Coach - Monday 6:00 AM');

    cron.schedule('0 18 * * 0', () => triggerScheduled('visit_planner', 'Visit Planner'), { timezone: TIMEZONE });
    console.log('[AgentScheduler]   ✓ #B Smart Visit Planner - Sunday 6:00 PM');

    cron.schedule('0 7 * * 1', () => triggerScheduled('engagement_decay', 'Engagement Decay'), { timezone: TIMEZONE });
    console.log('[AgentScheduler]   ✓ #C Engagement Decay - Monday 7:00 AM');

    cron.schedule('30 5 * * 1', () => triggerScheduled('org_intelligence', 'Org Intelligence'), { timezone: TIMEZONE });
    console.log('[AgentScheduler]   ✓ #O Org Intelligence - Monday 5:30 AM');
  } else {
    console.log('[AgentScheduler] No ANTHROPIC_API_KEY - paid agents disabled. Add key to .env to enable.');
  }

  console.log('[AgentScheduler] All agent cron jobs initialized.');
}

module.exports = { initAgentScheduler };
