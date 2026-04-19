/**
 * KPI Variance Digest Agent (#VD) — Phase SG-5 #27
 *
 * Rolls up all VarianceAlert rows fired since the last digest run into a single
 * weekly email per manager. Complements kpiVarianceAgent (#V) which fires an
 * immediate alert per breach; the digest smooths that out to one Monday-morning
 * summary per manager so they're not deluged across the week.
 *
 * Type: FREE (rule-based — no AI cost).
 * Schedule: Weekly Monday 07:00 Manila (one step after kpiVarianceAgent's
 * monthly day-2 run so both agents are authoritative on their respective
 * cadences). Manual Run Now via Agent Console.
 *
 * Subscription posture:
 *   - Per-entity (walks Entity.find({ status: 'ACTIVE' })).
 *   - Aggregates by `reports_to` chain (resolved via erpNotificationService
 *     helpers). Manager sees a digest of *their BDMs*, not a firehose.
 *   - Digest format + subject line are lookup-configurable via the
 *     KPI_VARIANCE_DIGEST_TEMPLATE category (not mandatory — sensible
 *     fallback baked in).
 *   - Idempotency: each VarianceAlert carries `digested_at`. A single digest
 *     window marks every alert it included so re-running the agent the same
 *     week does NOT re-email the same manager.
 */

const Entity = require('../erp/models/Entity');
const VarianceAlert = require('../erp/models/VarianceAlert');
const PeopleMaster = require('../erp/models/PeopleMaster');
const User = require('../models/User');
const Lookup = require('../erp/models/Lookup');
const { dispatchMultiChannel } = require('../erp/services/erpNotificationService');
const { kpiVarianceDigestTemplate } = require('../templates/erpEmails');

async function loadDigestWindowDays(entityId) {
  try {
    const row = await Lookup.findOne({
      entity_id: entityId,
      category: 'VARIANCE_ALERT_DIGEST_WINDOW_DAYS',
      code: 'GLOBAL',
      is_active: true,
    }).lean();
    const n = Number(row?.metadata?.days ?? row?.metadata?.value);
    if (Number.isFinite(n) && n > 0) return n;
  } catch (_) { /* fall through */ }
  return 7; // default one-week window — matches the Monday digest cadence
}

/**
 * Group alerts by (manager user_id). Managers resolved by walking
 * PeopleMaster.reports_to up from each BDM's person_id. BDMs without a
 * reports_to line up to president (presidents are already in the escalation
 * audience for the immediate agent — we don't re-notify them weekly here to
 * avoid inbox noise).
 */
async function groupByManager(alerts) {
  const personIds = [...new Set(alerts.map(a => a.person_id?.toString()).filter(Boolean))];
  const people = await PeopleMaster.find({ _id: { $in: personIds } }).select('_id full_name reports_to user_id').lean();
  const personIndex = new Map(people.map(p => [String(p._id), p]));

  const managerIds = [...new Set(people.map(p => p.reports_to?.toString()).filter(Boolean))];
  const managerPeople = await PeopleMaster.find({ _id: { $in: managerIds } }).select('_id full_name user_id').lean();
  const managerPeopleIndex = new Map(managerPeople.map(p => [String(p._id), p]));

  const managerUserIds = managerPeople.map(p => p.user_id).filter(Boolean);
  const managerUsers = await User.find({ _id: { $in: managerUserIds }, isActive: true }).select('_id name email phone role').lean();
  const managerUserIndex = new Map(managerUsers.map(u => [String(u._id), u]));

  const bucket = new Map(); // managerUserId -> { user, alerts, bdms: Set }
  for (const a of alerts) {
    const person = a.person_id ? personIndex.get(String(a.person_id)) : null;
    if (!person) continue;
    const manager = person.reports_to ? managerPeopleIndex.get(String(person.reports_to)) : null;
    if (!manager?.user_id) continue;
    const managerUser = managerUserIndex.get(String(manager.user_id));
    if (!managerUser) continue;
    const key = String(managerUser._id);
    if (!bucket.has(key)) bucket.set(key, { user: managerUser, alerts: [], bdmIds: new Set() });
    const rec = bucket.get(key);
    rec.alerts.push({ ...a, bdm_name: person.full_name || 'BDM' });
    rec.bdmIds.add(String(person._id));
  }
  return bucket;
}

async function run(args = {}) {
  const startTime = Date.now();
  const entityFilter = { status: 'ACTIVE' };
  if (args.entity_id) entityFilter._id = args.entity_id;

  const entities = await Entity.find(entityFilter).select('_id entity_name short_name').lean();
  if (!entities.length) {
    return {
      status: 'success',
      summary: { digests_sent: 0, alerts_included: 0, managers_covered: 0, key_findings: ['No active entities'] },
      execution_ms: Date.now() - startTime,
    };
  }

  let digestsSent = 0;
  let alertsIncluded = 0;
  let managersCovered = 0;
  const errors = [];
  const findings = [];

  for (const entity of entities) {
    try {
      const windowDays = await loadDigestWindowDays(entity._id);
      const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

      // Pull every alert fired in the window that hasn't been digested yet.
      const alerts = await VarianceAlert.find({
        entity_id: entity._id,
        fired_at: { $gte: since },
        $or: [{ digested_at: null }, { digested_at: { $exists: false } }],
      }).lean();

      if (!alerts.length) {
        findings.push(`${entity.short_name || entity.entity_name}: 0 undigested alerts`);
        continue;
      }

      const grouped = await groupByManager(alerts);
      if (grouped.size === 0) {
        findings.push(`${entity.short_name || entity.entity_name}: ${alerts.length} alerts, no managers resolved`);
        continue;
      }

      for (const [, rec] of grouped) {
        const recipient = rec.user;
        const digestAlerts = rec.alerts.map(a => ({
          bdm_name: a.bdm_name,
          kpi_label: a.kpi_label || a.kpi_code,
          kpi_code: a.kpi_code,
          severity: a.severity,
          actual: a.actual_value,
          target: a.target_value,
          deviation_pct: a.deviation_pct,
          period: a.period,
        }));

        await dispatchMultiChannel([recipient], {
          templateFn: kpiVarianceDigestTemplate,
          templateData: {
            managerName: recipient.name || 'Manager',
            entityName: entity.entity_name || entity.short_name || '',
            windowDays,
            alerts: digestAlerts,
            bdmCount: rec.bdmIds.size,
          },
          emailType: 'ERP_KPI_VARIANCE_DIGEST',
          category: 'kpiVariance',
          entityId: entity._id,
          inAppCategory: 'compliance_alert',
          inAppPriority: digestAlerts.some(a => a.severity === 'critical') ? 'high' : 'normal',
        });

        // Mark every included alert as digested so next week's run starts clean.
        const alertIds = rec.alerts.map(a => a._id);
        if (alertIds.length) {
          await VarianceAlert.updateMany(
            { _id: { $in: alertIds } },
            { $set: { digested_at: new Date() } }
          );
        }

        digestsSent++;
        alertsIncluded += digestAlerts.length;
        managersCovered++;
      }

      findings.push(`${entity.short_name || entity.entity_name}: ${grouped.size} manager(s), ${alerts.length} alert(s)`);
    } catch (err) {
      console.error(`[kpiVarianceDigestAgent] Entity ${entity._id} failed:`, err.message);
      errors.push(`${entity.short_name || entity.entity_name}: ${err.message}`);
    }
  }

  return {
    status: errors.length > 0 && digestsSent === 0 ? 'error' : (errors.length > 0 ? 'partial' : 'success'),
    summary: {
      digests_sent: digestsSent,
      alerts_included: alertsIncluded,
      managers_covered: managersCovered,
      key_findings: [
        `Digests sent: ${digestsSent}`,
        `Alerts included: ${alertsIncluded}`,
        `Managers covered: ${managersCovered}`,
        ...findings.slice(0, 4),
        ...(errors.length > 0 ? [`Errors: ${errors.length} — ${errors.slice(0, 2).join(' | ')}`] : []),
      ],
    },
    error_msg: errors.length > 0 ? errors.join(' | ') : null,
    message_ids: [],
    execution_ms: Date.now() - startTime,
  };
}

module.exports = { run };
