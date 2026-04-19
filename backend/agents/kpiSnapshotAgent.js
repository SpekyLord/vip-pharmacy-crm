/**
 * KPI Snapshot Agent (#K) — Phase SG-Q2 Week 2
 *
 * Walks every entity's ACTIVE SalesGoalPlan and computes monthly + YTD
 * KPI snapshots for all enrolled BDMs. YTD snapshots trigger incentive
 * accruals (see salesGoalService.accrueIncentive).
 *
 * Type: FREE (rule-based — no AI cost).
 * Schedule: Monthly day 1 at 5:00 AM Manila (configured in agentScheduler.js).
 * Trigger sources: 'scheduled' (cron) or 'manual' (Run Now from Agent Console).
 *
 * Run history: writes AgentRun via the standard agentExecutor finalizeRun flow
 * (this module returns `{ status, summary, message_ids }` and agentExecutor
 * persists it). Do NOT write AgentRun directly.
 */

const Entity = require('../erp/models/Entity');
const SalesGoalPlan = require('../erp/models/SalesGoalPlan');
const IncentivePayout = require('../erp/models/IncentivePayout');
const salesGoalService = require('../erp/services/salesGoalService');

function previousMonth() {
  const now = new Date();
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;
}

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Run entry point. Receives standard args from agentExecutor:
 *   { triggerSource, runId, entity_id?, period?, period_type? }
 *
 * Optional `entity_id` scopes the run to a single entity (used by "Run Now
 * for this entity" UI); otherwise all active entities are processed.
 *
 * Optional `period` overrides the default monthly period (defaults to the
 * previous month on day 1, current month on manual runs). YTD is always
 * re-computed alongside monthly because incentive accrual fires on YTD.
 */
async function run(args = {}) {
  const startTime = Date.now();
  const entityFilter = { status: 'ACTIVE' };
  if (args.entity_id) entityFilter._id = args.entity_id;

  const entities = await Entity.find(entityFilter).select('_id entity_name short_name').lean();
  if (entities.length === 0) {
    return {
      status: 'success',
      summary: { bdms_processed: 0, alerts_generated: 0, messages_sent: 0, key_findings: ['No active entities'] },
      execution_ms: Date.now() - startTime,
    };
  }

  // Choose the monthly period to compute. Scheduled runs on day 1 target last
  // month; manual runs default to current month. Allow override for back-fill.
  const now = new Date();
  const defaultPeriod = (args.triggerSource === 'scheduled' && now.getDate() <= 3)
    ? previousMonth()
    : currentMonth();
  const period = args.period || defaultPeriod;

  let bdmsProcessed = 0;
  let accrualsCreated = 0;
  let plansRun = 0;
  const errors = [];
  const perEntity = [];

  for (const entity of entities) {
    try {
      // All ACTIVE plans for the entity — usually just 1 (FY current), but we
      // don't hardcode that so mid-year plan refactors are supported.
      const plans = await SalesGoalPlan.find({
        entity_id: entity._id,
        status: 'ACTIVE',
      }).lean();

      if (plans.length === 0) continue;

      let entityBdms = 0;
      for (const plan of plans) {
        // Monthly — informational, does NOT accrue (see computeBdmSnapshot guard)
        const monthly = await salesGoalService.computeAllSnapshots(
          plan, period, 'MONTHLY',
          { accrueIncentives: false, userId: null }
        );
        // YTD — triggers incentive accrual on tier qualification
        const ytd = await salesGoalService.computeAllSnapshots(
          plan, String(plan.fiscal_year), 'YTD',
          { accrueIncentives: true, userId: null }
        );
        entityBdms += Math.max(monthly.length, ytd.length);
        plansRun++;
      }

      // Count accruals created during this run (approximate — rows touched
      // in the last N seconds of this run window)
      const runStartDate = new Date(startTime);
      const accrualCount = await IncentivePayout.countDocuments({
        entity_id: entity._id,
        status: 'ACCRUED',
        updatedAt: { $gte: runStartDate },
      });
      accrualsCreated += accrualCount;

      bdmsProcessed += entityBdms;
      perEntity.push(`${entity.short_name || entity.entity_name}: ${entityBdms} BDMs, ${accrualCount} new accruals`);
    } catch (err) {
      console.error(`[kpiSnapshotAgent] Entity ${entity._id} failed:`, err.message);
      errors.push(`${entity.short_name || entity.entity_name}: ${err.message}`);
    }
  }

  const summary = {
    bdms_processed: bdmsProcessed,
    alerts_generated: 0,         // snapshot agent does not emit alerts (kpiVarianceAgent will, Week 3)
    messages_sent: 0,
    key_findings: [
      `Period: ${period} (monthly) + YTD`,
      `Entities processed: ${entities.length} | Plans: ${plansRun}`,
      `Accruals created this run: ${accrualsCreated}`,
      ...perEntity.slice(0, 5),
      ...(errors.length > 0 ? [`Errors: ${errors.length} — ${errors.slice(0, 2).join(' | ')}`] : []),
    ],
  };

  return {
    status: errors.length > 0 && bdmsProcessed === 0 ? 'error' : (errors.length > 0 ? 'partial' : 'success'),
    summary,
    error_msg: errors.length > 0 ? errors.join(' | ') : null,
    message_ids: [],
    execution_ms: Date.now() - startTime,
  };
}

module.exports = { run };
