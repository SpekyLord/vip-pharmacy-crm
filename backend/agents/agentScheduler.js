/**
 * Agent Scheduler — Central cron runner for all VIP ERP/CRM agents
 *
 * Free agents (rule-based, no AI API):
 *   #3  Expense Anomaly       — daily 6:00 AM
 *   #6  Inventory Reorder     — daily 6:30 AM
 *   #8  Credit Risk Scoring   — weekly Sunday 11:00 PM
 *   #10 Document Expiry       — daily 7:30 AM
 *   #A  Visit Compliance      — Wed 8:00 AM (midweek) + Fri 10:00 AM (endofweek)
 *   #D  Photo Audit           — daily 8:30 AM
 *
 * Paid agents (Claude API — activated when ANTHROPIC_API_KEY is set):
 *   #1  Smart Collection      — daily 7:00 AM
 *   #2  OCR Auto-Fill         — on-demand (not cron)
 *   #5  BIR Filing Review     — 15th of each month
 *   #7  BDM Performance Coach — weekly Monday 6:00 AM
 *   #B  Smart Visit Planner   — weekly Sunday 6:00 PM
 *   #C  Engagement Decay      — weekly Monday 7:00 AM
 *
 * All times: Asia/Manila timezone
 */

const cron = require('node-cron');

const TIMEZONE = 'Asia/Manila';

function initAgentScheduler() {
  console.log('[AgentScheduler] Initializing agent cron jobs...');

  // ═══════════════════════════════════════════
  // FREE AGENTS (always active)
  // ═══════════════════════════════════════════

  // #3 Expense Anomaly — daily 6:00 AM
  cron.schedule('0 6 * * *', async () => {
    try {
      const { run } = require('./expenseAnomalyAgent');
      await run();
    } catch (err) {
      console.error('[AgentScheduler] Expense Anomaly failed:', err.message);
    }
  }, { timezone: TIMEZONE });
  console.log('[AgentScheduler]   ✓ #3 Expense Anomaly — daily 6:00 AM');

  // #6 Inventory Reorder — daily 6:30 AM
  cron.schedule('30 6 * * *', async () => {
    try {
      const { run } = require('./inventoryReorderAgent');
      await run();
    } catch (err) {
      console.error('[AgentScheduler] Inventory Reorder failed:', err.message);
    }
  }, { timezone: TIMEZONE });
  console.log('[AgentScheduler]   ✓ #6 Inventory Reorder — daily 6:30 AM');

  // #8 Credit Risk Scoring — weekly Sunday 11:00 PM
  cron.schedule('0 23 * * 0', async () => {
    try {
      const { run } = require('./creditRiskAgent');
      await run();
    } catch (err) {
      console.error('[AgentScheduler] Credit Risk failed:', err.message);
    }
  }, { timezone: TIMEZONE });
  console.log('[AgentScheduler]   ✓ #8 Credit Risk — weekly Sunday 11:00 PM');

  // #10 Document Expiry — daily 7:30 AM
  cron.schedule('30 7 * * *', async () => {
    try {
      const { run } = require('./documentExpiryAgent');
      await run();
    } catch (err) {
      console.error('[AgentScheduler] Document Expiry failed:', err.message);
    }
  }, { timezone: TIMEZONE });
  console.log('[AgentScheduler]   ✓ #10 Document Expiry — daily 7:30 AM');

  // #A Visit Compliance — Wednesday 8:00 AM (midweek warning)
  cron.schedule('0 8 * * 3', async () => {
    try {
      const { run } = require('./visitComplianceAgent');
      await run('midweek');
    } catch (err) {
      console.error('[AgentScheduler] Visit Compliance (midweek) failed:', err.message);
    }
  }, { timezone: TIMEZONE });
  console.log('[AgentScheduler]   ✓ #A Visit Compliance — Wed 8:00 AM (midweek)');

  // #A Visit Compliance — Friday 10:00 AM (end-of-week alert)
  cron.schedule('0 10 * * 5', async () => {
    try {
      const { run } = require('./visitComplianceAgent');
      await run('endofweek');
    } catch (err) {
      console.error('[AgentScheduler] Visit Compliance (endofweek) failed:', err.message);
    }
  }, { timezone: TIMEZONE });
  console.log('[AgentScheduler]   ✓ #A Visit Compliance — Fri 10:00 AM (endofweek)');

  // #D Photo Audit — daily 8:30 AM
  cron.schedule('30 8 * * *', async () => {
    try {
      const { run } = require('./photoAuditAgent');
      await run();
    } catch (err) {
      console.error('[AgentScheduler] Photo Audit failed:', err.message);
    }
  }, { timezone: TIMEZONE });
  console.log('[AgentScheduler]   ✓ #D Photo Audit — daily 8:30 AM');

  // ═══════════════════════════════════════════
  // PAID AGENTS (activated when ANTHROPIC_API_KEY is set)
  // ═══════════════════════════════════════════

  const hasAiKey = !!process.env.ANTHROPIC_API_KEY;

  if (hasAiKey) {
    console.log('[AgentScheduler] ANTHROPIC_API_KEY detected — enabling paid agents');

    // #1 Smart Collection — daily 7:00 AM
    cron.schedule('0 7 * * 1-5', async () => {
      try {
        const { run } = require('./smartCollectionAgent');
        await run();
      } catch (err) {
        console.error('[AgentScheduler] Smart Collection failed:', err.message);
      }
    }, { timezone: TIMEZONE });
    console.log('[AgentScheduler]   ✓ #1 Smart Collection — daily 7:00 AM (weekdays)');

    // #5 BIR Filing Review — 15th of each month at 9:00 AM
    cron.schedule('0 9 15 * *', async () => {
      try {
        const { run } = require('./birFilingAgent');
        await run();
      } catch (err) {
        console.error('[AgentScheduler] BIR Filing Review failed:', err.message);
      }
    }, { timezone: TIMEZONE });
    console.log('[AgentScheduler]   ✓ #5 BIR Filing Review — 15th monthly 9:00 AM');

    // #7 BDM Performance Coach — Monday 6:00 AM
    cron.schedule('0 6 * * 1', async () => {
      try {
        const { run } = require('./performanceCoachAgent');
        await run();
      } catch (err) {
        console.error('[AgentScheduler] Performance Coach failed:', err.message);
      }
    }, { timezone: TIMEZONE });
    console.log('[AgentScheduler]   ✓ #7 BDM Performance Coach — Monday 6:00 AM');

    // #B Smart Visit Planner — Sunday 6:00 PM
    cron.schedule('0 18 * * 0', async () => {
      try {
        const { run } = require('./visitPlannerAgent');
        await run();
      } catch (err) {
        console.error('[AgentScheduler] Visit Planner failed:', err.message);
      }
    }, { timezone: TIMEZONE });
    console.log('[AgentScheduler]   ✓ #B Smart Visit Planner — Sunday 6:00 PM');

    // #C Engagement Decay — Monday 7:00 AM
    cron.schedule('0 7 * * 1', async () => {
      try {
        const { run } = require('./engagementDecayAgent');
        await run();
      } catch (err) {
        console.error('[AgentScheduler] Engagement Decay failed:', err.message);
      }
    }, { timezone: TIMEZONE });
    console.log('[AgentScheduler]   ✓ #C Engagement Decay — Monday 7:00 AM');
  } else {
    console.log('[AgentScheduler] No ANTHROPIC_API_KEY — paid agents disabled. Add key to .env to enable.');
  }

  console.log('[AgentScheduler] All agent cron jobs initialized.');
}

module.exports = { initAgentScheduler };
