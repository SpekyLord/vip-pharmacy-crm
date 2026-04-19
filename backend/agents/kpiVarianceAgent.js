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
const VarianceAlert = require('../erp/models/VarianceAlert');
const { notifyKpiVariance } = require('../erp/services/erpNotificationService');

const DEFAULT_WARNING_PCT = 20;
const DEFAULT_CRITICAL_PCT = 40;

// SG-5 #27 — Cooldown window for re-firing the same (plan, bdm, kpi, severity)
// breach. Lookup-driven via VARIANCE_ALERT_COOLDOWN_DAYS; this is the last-
// resort fallback used only if the Lookup read fails or is missing.
const DEFAULT_COOLDOWN_DAYS = 7;

/**
 * Read VARIANCE_ALERT_COOLDOWN_DAYS for the entity. A single GLOBAL row is the
 * typical shape, but admins can add per-severity rows (code = 'WARNING' or
 * 'CRITICAL') to differentiate cooldowns.
 */
async function loadCooldown(entityId) {
  try {
    const rows = await Lookup.find({
      entity_id: entityId,
      category: 'VARIANCE_ALERT_COOLDOWN_DAYS',
      is_active: true,
    }).lean();
    if (!rows.length) return { global: DEFAULT_COOLDOWN_DAYS, warning: null, critical: null };
    const out = { global: DEFAULT_COOLDOWN_DAYS, warning: null, critical: null };
    for (const r of rows) {
      const d = Number(r.metadata?.days ?? r.metadata?.value);
      const days = Number.isFinite(d) && d >= 0 ? d : DEFAULT_COOLDOWN_DAYS;
      const code = String(r.code).toUpperCase();
      if (code === 'GLOBAL') out.global = days;
      else if (code === 'WARNING') out.warning = days;
      else if (code === 'CRITICAL') out.critical = days;
    }
    return out;
  } catch (err) {
    console.warn('[kpiVarianceAgent] cooldown lookup failed, using default:', err.message);
    return { global: DEFAULT_COOLDOWN_DAYS, warning: null, critical: null };
  }
}

function cooldownFor(severity, cooldown) {
  if (severity === 'warning' && cooldown.warning !== null) return cooldown.warning;
  if (severity === 'critical' && cooldown.critical !== null) return cooldown.critical;
  return cooldown.global;
}

/**
 * Load KPI_VARIANCE_THRESHOLDS for the entity, indexed by KPI code (uppercase).
 * GLOBAL row (code='GLOBAL') becomes the fallback for any KPI without an
 * explicit threshold.
 */
async function loadThresholds(entityId) {
  let rows = await Lookup.find({
    entity_id: entityId,
    category: 'KPI_VARIANCE_THRESHOLDS',
    is_active: true,
  }).lean();

  // Safety net: seed the GLOBAL row if no thresholds exist yet for this entity.
  // The primary seed happens on plan activation (salesGoalService.
  // ensureKpiVarianceGlobalThreshold); this catches historical entities whose
  // plans were activated before the seeder was deployed. Non-fatal — the
  // hardcoded DEFAULT_* constants keep the agent functional either way.
  if (rows.length === 0 && entityId) {
    try {
      const salesGoalService = require('../erp/services/salesGoalService');
      const seedResult = await salesGoalService.ensureKpiVarianceGlobalThreshold(entityId);
      if (seedResult.seeded) {
        rows = await Lookup.find({
          entity_id: entityId,
          category: 'KPI_VARIANCE_THRESHOLDS',
          is_active: true,
        }).lean();
      }
    } catch (err) {
      console.warn('[kpiVarianceAgent] GLOBAL self-seed skipped:', err.message);
    }
  }

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
  let alertsSuppressed = 0;
  let alertsPersisted = 0;
  let messagesSent = 0;
  const errors = [];
  const findings = [];

  for (const entity of entities) {
    try {
      const thresholds = await loadThresholds(entity._id);
      const cooldown = await loadCooldown(entity._id);

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

          // Walk every driver KPI; flag deviations. Cooldown dedup (SG-5 #27)
          // filters out breaches that already fired within the window so
          // persistent low-performers don't spam the inbox every run.
          const alerts = [];
          const suppressedCodes = [];
          for (const driver of (snap.driver_kpis || [])) {
            for (const kpi of (driver.kpis || [])) {
              const upperCode = String(kpi.kpi_code).toUpperCase();
              const t = thresholds.map.get(upperCode) || thresholds.global;
              const deviation = computeDeviationPct(kpi.kpi_code, kpi.actual_value, kpi.target_value);
              const severity = classifySeverity(deviation, t);
              if (!severity) continue;

              const cdDays = cooldownFor(severity, cooldown);
              const suppress = cdDays > 0 ? await VarianceAlert.findOne({
                entity_id: entity._id,
                plan_id: plan._id,
                bdm_id: snap.bdm_id,
                kpi_code: upperCode,
                severity,
                fired_at: { $gte: new Date(Date.now() - cdDays * 24 * 60 * 60 * 1000) },
              }).select('_id').lean() : null;

              if (suppress) {
                suppressedCodes.push(upperCode);
                alertsSuppressed++;
                continue;
              }

              alerts.push({
                kpi_code: upperCode,
                kpi_label: kpi.kpi_label || kpi.kpi_code,
                actual: kpi.actual_value,
                target: kpi.target_value,
                deviation_pct: deviation,
                threshold_pct: severity === 'critical' ? t.critical_pct : t.warning_pct,
                severity,
              });
            }
          }

          if (alerts.length === 0) {
            if (suppressedCodes.length > 0) {
              // Keep a trace on findings for visibility even when no email fires.
              findings.push(`Cooldown suppressed ${suppressedCodes.length} alert(s) for ${snap.bdm_id}`);
            }
            continue;
          }
          bdmsFlagged++;
          alertsGenerated += alerts.length;

          // Persist each alert BEFORE dispatch so cooldown works for the next
          // run even if the notification path fails.
          try {
            const toPersist = alerts.map(a => ({
              entity_id: entity._id,
              plan_id: plan._id,
              bdm_id: snap.bdm_id,
              person_id: target?.person_id || snap.person_id || null,
              fiscal_year: plan.fiscal_year,
              period: snap.period,
              kpi_code: a.kpi_code,
              kpi_label: a.kpi_label,
              severity: a.severity,
              actual_value: Number(a.actual) || 0,
              target_value: Number(a.target) || 0,
              deviation_pct: Math.round((Number(a.deviation_pct) || 0) * 100) / 100,
              threshold_pct: Math.round((Number(a.threshold_pct) || 0) * 100) / 100,
              status: 'OPEN',
              fired_at: new Date(),
            }));
            await VarianceAlert.insertMany(toPersist, { ordered: false });
            alertsPersisted += toPersist.length;
          } catch (persistErr) {
            // Duplicate key collisions can occur if two agent runs race; safe
            // to log and move on (cooldown check above already prevents most
            // of this).
            console.warn('[kpiVarianceAgent] persist alerts failed:', persistErr.message);
          }

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
    alerts_suppressed: alertsSuppressed,
    alerts_persisted: alertsPersisted,
    messages_sent: messagesSent,
    key_findings: [
      `BDMs flagged: ${bdmsFlagged} of ${bdmsProcessed}`,
      `Total alerts: ${alertsGenerated} (persisted ${alertsPersisted}; cooldown-suppressed ${alertsSuppressed})`,
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
