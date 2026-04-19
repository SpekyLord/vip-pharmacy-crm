/**
 * KPI Variance Agent (#V) — Phase SG-Q2 Week 3
 *
 * Reads the latest YTD KpiSnapshot for every active BDM and surfaces KPIs
 * that deviate from target by more than the per-KPI threshold. Sends a
 * variance email to the BDM, their reports_to chain, and president.
 *
 * Type: FREE (rule-based — no AI cost).
 * Schedule: Monthly day 2 at 6:00 AM Manila — fires the day AFTER kpiSnapshotAgent
 *   so it reads the freshly-computed snapshots. Manual Run Now via Agent Console.
 *
 * Lookup-driven thresholds (`KPI_VARIANCE_THRESHOLDS` category, per-entity):
 *   metadata.warning_pct   — deviation % that triggers a 'warning' alert
 *   metadata.critical_pct  — deviation % that triggers a 'critical' alert
 *   code = KPI_CODE the threshold applies to (e.g. 'PCT_HOSP_ACCREDITED')
 *   When no row exists for a given KPI, falls back to GLOBAL defaults:
 *     warning at 20% deviation, critical at 40%.
 *
 * Subscriber posture: zero hardcoded thresholds. Admins re-tune per entity
 * via Control Center → Lookup Tables → KPI_VARIANCE_THRESHOLDS without a
 * code deploy. New KPIs added to the plan inherit the GLOBAL defaults until
 * an entity-specific row is added.
 */

const Entity = require('../erp/models/Entity');
const SalesGoalPlan = require('../erp/models/SalesGoalPlan');
const KpiSnapshot = require('../erp/models/KpiSnapshot');
const SalesGoalTarget = require('../erp/models/SalesGoalTarget');
const PeopleMaster = require('../erp/models/PeopleMaster');
const Lookup = require('../erp/models/Lookup');
const { notifyKpiVariance } = require('../erp/services/erpNotificationService');

const DEFAULT_WARNING_PCT = 20;
const DEFAULT_CRITICAL_PCT = 40;

/**
 * Load KPI_VARIANCE_THRESHOLDS for the entity, indexed by KPI code (uppercase).
 * GLOBAL row (code='GLOBAL') becomes the fallback for any KPI without an
 * explicit threshold.
 */
async function loadThresholds(entityId) {
  const rows = await Lookup.find({
    entity_id: entityId,
    category: 'KPI_VARIANCE_THRESHOLDS',
    is_active: true,
  }).lean();

  const map = new Map();
  let global = { warning_pct: DEFAULT_WARNING_PCT, critical_pct: DEFAULT_CRITICAL_PCT };

  for (const r of rows) {
    const w = Number(r.metadata?.warning_pct);
    const c = Number(r.metadata?.critical_pct);
    const t = {
      warning_pct: Number.isFinite(w) && w > 0 ? w : DEFAULT_WARNING_PCT,
      critical_pct: Number.isFinite(c) && c > 0 ? c : DEFAULT_CRITICAL_PCT,
    };
    if (String(r.code).toUpperCase() === 'GLOBAL') {
      global = t;
    } else {
      map.set(String(r.code).toUpperCase(), t);
    }
  }

  return { map, global };
}

/**
 * Compute the deviation % between actual and target. Direction-aware:
 *   - higher_better (default): deviation = (target - actual) / target * 100, only
 *     positive deviations (under-performance) count.
 *   - lower_better: deviation = (actual - target) / target * 100, only positive
 *     deviations (over-shoot, i.e. higher = worse) count.
 *
 * Plan KPI definitions are not stored on the snapshot (only kpi_code + value),
 * so we infer direction from a small lookup of "lower_better" KPIs that the
 * salesGoalService computes inversely. Anything not in this list is treated as
 * higher_better. This keeps the agent self-contained and avoids re-loading
 * the full plan + driver tree per BDM.
 */
const LOWER_BETTER_KPIS = new Set([
  'LOST_SALES_INCIDENTS',
  'EXPIRY_RETURNS',
]);

function computeDeviationPct(kpiCode, actual, target) {
  const t = Number(target) || 0;
  const a = Number(actual) || 0;
  if (t === 0) return 0;
  if (LOWER_BETTER_KPIS.has(String(kpiCode).toUpperCase())) {
    // higher = worse; alert when actual exceeds target
    return Math.max(((a - t) / t) * 100, 0);
  }
  // higher = better; alert when actual falls short of target
  return Math.max(((t - a) / t) * 100, 0);
}

function classifySeverity(deviationPct, threshold) {
  if (deviationPct >= threshold.critical_pct) return 'critical';
  if (deviationPct >= threshold.warning_pct) return 'warning';
  return null;
}

/**
 * Run entry point — standard agent signature called by agentExecutor.
 * Receives `{ triggerSource, runId, entity_id?, period? }`.
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

  let bdmsProcessed = 0;
  let bdmsFlagged = 0;
  let alertsGenerated = 0;
  let messagesSent = 0;
  const errors = [];
  const findings = [];

  for (const entity of entities) {
    try {
      const thresholds = await loadThresholds(entity._id);

      // ACTIVE plans for this entity
      const plans = await SalesGoalPlan.find({
        entity_id: entity._id,
        status: 'ACTIVE',
      }).select('_id fiscal_year plan_name reference').lean();

      if (plans.length === 0) continue;

      for (const plan of plans) {
        // Pull every YTD snapshot for the plan
        const snapshots = await KpiSnapshot.find({
          plan_id: plan._id,
          period_type: 'YTD',
          period: String(plan.fiscal_year),
        }).lean();

        for (const snap of snapshots) {
          if (!snap.bdm_id) continue;
          bdmsProcessed++;

          // Filter to active BDMs (skip deactivated PeopleMaster)
          const target = await SalesGoalTarget.findOne({
            plan_id: plan._id,
            bdm_id: snap.bdm_id,
            status: 'ACTIVE',
          }).select('person_id').lean();
          if (target?.person_id) {
            const person = await PeopleMaster.findById(target.person_id).select('is_active full_name bdm_code').lean();
            if (person && !person.is_active) continue;
          }

          // Walk every driver KPI; flag deviations
          const alerts = [];
          for (const driver of (snap.driver_kpis || [])) {
            for (const kpi of (driver.kpis || [])) {
              const t = thresholds.map.get(String(kpi.kpi_code).toUpperCase()) || thresholds.global;
              const deviation = computeDeviationPct(kpi.kpi_code, kpi.actual_value, kpi.target_value);
              const severity = classifySeverity(deviation, t);
              if (!severity) continue;
              alerts.push({
                kpi_code: kpi.kpi_code,
                kpi_label: kpi.kpi_label || kpi.kpi_code,
                actual: kpi.actual_value,
                target: kpi.target_value,
                deviation_pct: deviation,
                threshold_pct: severity === 'critical' ? t.critical_pct : t.warning_pct,
                severity,
              });
            }
          }

          if (alerts.length === 0) continue;
          bdmsFlagged++;
          alertsGenerated += alerts.length;

          // Resolve a readable name for the BDM (PeopleMaster preferred, else snap.person_id)
          let bdmLabel = 'BDM';
          try {
            const personId = target?.person_id || snap.person_id;
            if (personId) {
              const person = await PeopleMaster.findById(personId).select('full_name bdm_code').lean();
              if (person) bdmLabel = `${person.full_name}${person.bdm_code ? ` (${person.bdm_code})` : ''}`;
            }
          } catch { /* fall back to 'BDM' */ }

          // Fire-and-forget notification (the service already swallows its own errors).
          // We await here so the agent counts dispatches accurately.
          await notifyKpiVariance({
            entityId: entity._id,
            bdmId: snap.bdm_id,
            bdmLabel,
            fiscalYear: plan.fiscal_year,
            period: snap.period,
            alerts,
          });
          messagesSent++;
        }
      }

      findings.push(`${entity.short_name || entity.entity_name}: ${bdmsFlagged} BDMs flagged, ${alertsGenerated} alerts`);
    } catch (err) {
      console.error(`[kpiVarianceAgent] Entity ${entity._id} failed:`, err.message);
      errors.push(`${entity.short_name || entity.entity_name}: ${err.message}`);
    }
  }

  const summary = {
    bdms_processed: bdmsProcessed,
    alerts_generated: alertsGenerated,
    messages_sent: messagesSent,
    key_findings: [
      `BDMs flagged: ${bdmsFlagged} of ${bdmsProcessed}`,
      `Total alerts: ${alertsGenerated} (warning + critical)`,
      `Notifications dispatched: ${messagesSent}`,
      ...findings.slice(0, 5),
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
