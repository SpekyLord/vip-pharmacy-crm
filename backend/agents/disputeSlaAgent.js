/**
 * Dispute SLA Agent (#DSP) — Phase SG-4 #24
 *
 * Type: FREE (rule-based — no AI cost).
 * Schedule: daily 06:30 Manila — runs after kpiSnapshot (05:00) and before
 *   kpiVariance (06:00 day-2). Manual Run Now via Agent Console.
 *
 * Purpose: walks every IncentiveDispute that is NOT in a terminal state
 * (CLOSED) and checks whether it has been sitting in its current state for
 * longer than the per-state SLA. When breached, fires an escalation
 * notification + appends a row to dispute.sla_breaches[] (idempotent — one
 * row per unique state breach, so re-runs don't spam).
 *
 * Lookup-driven SLAs (DISPUTE_SLA_DAYS, per-entity):
 *   metadata.sla_days         — N days the state may sit before breaching
 *   metadata.escalate_to_role — which role chain to ping (finance|president)
 *   When a row is missing for a state, the agent uses 7 days as a safe floor
 *   and escalates to president.
 *
 * The agent NEVER auto-transitions a dispute. Resolution is always a human
 * decision (Rule #20 — never bypass approval gates).
 *
 * Subscriber posture: zero hardcoded SLAs in code. Subscribers tune per-
 * entity via Control Center → Lookup Tables → DISPUTE_SLA_DAYS without a
 * code deploy. New entities inherit SEED_DEFAULTS on first read.
 */

const Entity = require('../erp/models/Entity');
const IncentiveDispute = require('../erp/models/IncentiveDispute');
const Lookup = require('../erp/models/Lookup');
const User = require('../models/User');
const PeopleMaster = require('../erp/models/PeopleMaster');
const { ROLE_SETS } = require('../constants/roles');
const { getParentEntityIds } = require('../erp/utils/parentEntityResolver');
const {
  resolveEntityName,
  buildBdmEscalationAudience,
  dispatchMultiChannel,
} = require('../erp/services/erpNotificationService');

const DEFAULT_SLA_DAYS = 7;
const DEFAULT_ESCALATE_ROLE = 'president';

const NON_TERMINAL_STATES = ['OPEN', 'UNDER_REVIEW', 'RESOLVED_APPROVED', 'RESOLVED_DENIED'];

async function loadSlaConfig(entityId) {
  const rows = await Lookup.find({
    entity_id: entityId,
    category: 'DISPUTE_SLA_DAYS',
    is_active: true,
  }).lean();
  const map = new Map();
  for (const r of rows) {
    map.set(String(r.code).toUpperCase(), {
      sla_days: Number(r.metadata?.sla_days) > 0 ? Number(r.metadata.sla_days) : DEFAULT_SLA_DAYS,
      escalate_to_role: r.metadata?.escalate_to_role || DEFAULT_ESCALATE_ROLE,
    });
  }
  return map;
}

function daysSince(date) {
  if (!date) return 0;
  return Math.floor((Date.now() - new Date(date).getTime()) / (24 * 60 * 60 * 1000));
}

/**
 * Was the same state already flagged as breached in sla_breaches[]?
 * Used to ensure idempotency — one breach row per (state, daily run window).
 */
function alreadyBreachedForCurrentState(dispute) {
  if (!Array.isArray(dispute.sla_breaches)) return false;
  // The state may have transitioned and re-entered — match by both state
  // AND a breach detected after the most recent state change.
  return dispute.sla_breaches.some(b =>
    b.state === dispute.current_state
    && new Date(b.breached_at) > new Date(dispute.state_changed_at)
  );
}

/**
 * Build the escalation audience for a breached dispute.
 * Approach: filer + affected BDM + reviewer (if assigned) + role chain
 * matching escalate_to_role + presidents. Dedupe by user _id.
 */
async function buildAudience(dispute, escalateToRole) {
  const ids = new Set();
  for (const id of [dispute.filed_by, dispute.affected_bdm_id, dispute.reviewer_id]) {
    if (id) ids.add(String(id));
  }

  // Pull users matching escalate_to_role + parent-entity presidents only.
  // Subsidiary presidents are scoped to their own entity via the entity_id
  // / entity_ids clauses — they must NOT receive disputes from other entities.
  const parentEntityIds = await getParentEntityIds();
  const presidentRoles = ROLE_SETS.PRESIDENT_ROLES || ['president'];
  const roleQuery = {
    isActive: true,
    email: { $exists: true, $ne: '' },
    $or: [
      { role: escalateToRole },
      { role: { $in: presidentRoles } },
    ],
  };
  const scopedRole = await User.find({
    ...roleQuery,
    $and: [{
      $or: [
        { entity_id: dispute.entity_id },
        { entity_ids: dispute.entity_id },
        { role: { $in: presidentRoles }, entity_id: { $in: parentEntityIds } },
      ],
    }],
  }).select('_id email name phone role').lean();
  for (const u of scopedRole) ids.add(String(u._id));

  // Hydrate the final user list
  const users = await User.find({
    _id: { $in: Array.from(ids) },
    isActive: true,
    email: { $exists: true, $ne: '' },
  }).select('_id email name phone role').lean();
  return users;
}

/**
 * Lightweight inline template — avoids editing erpEmails.js for this agent.
 * Same baseLayout pattern as the other agent templates (SG-Q2 W3).
 */
function disputeSlaTemplate({ recipientName, dispute, daysOverdue, slaDays, entityName }) {
  const subject = `VIP ERP - Dispute SLA breached: DSP-${String(dispute._id).slice(-6)} (${dispute.current_state}) [${entityName}]`;
  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:600px;padding:16px;background:#fff;color:#1f2937;">
      <h2 style="margin:0 0 12px;font-size:18px;color:#991b1b;">Dispute SLA Breached</h2>
      <p>Hi ${recipientName},</p>
      <p>Dispute <strong>DSP-${String(dispute._id).slice(-6)}</strong> has been in state
        <strong>${dispute.current_state}</strong> for <strong>${daysOverdue} day(s)</strong> —
        exceeding the SLA of ${slaDays} day(s).</p>
      <table cellpadding="6" cellspacing="0" style="border-collapse:collapse;margin:12px 0;">
        <tr><td style="color:#6b7280;">Type</td><td>${dispute.dispute_type}</td></tr>
        <tr><td style="color:#6b7280;">Affected BDM</td><td>${dispute.affected_bdm_id}</td></tr>
        <tr><td style="color:#6b7280;">Period</td><td>${dispute.period || ''}</td></tr>
        <tr><td style="color:#6b7280;">Claim Amount</td><td>₱${(Number(dispute.claim_amount) || 0).toLocaleString('en-PH')}</td></tr>
        <tr><td style="color:#6b7280;">Filed</td><td>${new Date(dispute.filed_at).toISOString().slice(0, 10)}</td></tr>
        <tr><td style="color:#6b7280;">Reason</td><td>${dispute.reason || ''}</td></tr>
      </table>
      <p style="font-size:12px;color:#6b7280;">Open the Dispute Center to take action. SLA thresholds are configured per state in <code>DISPUTE_SLA_DAYS</code>.</p>
    </div>`;
  const text = `Dispute DSP-${String(dispute._id).slice(-6)} in state ${dispute.current_state} has breached its ${slaDays}-day SLA (currently ${daysOverdue} days). Type: ${dispute.dispute_type}. Reason: ${dispute.reason}. Entity: ${entityName}.`;
  return { subject, html, text };
}

async function run(args = {}) {
  const startTime = Date.now();
  const entityFilter = { status: 'ACTIVE' };
  if (args.entity_id) entityFilter._id = args.entity_id;

  const entities = await Entity.find(entityFilter).select('_id entity_name short_name').lean();
  if (entities.length === 0) {
    return {
      status: 'success',
      summary: { disputes_checked: 0, breaches_detected: 0, messages_sent: 0, key_findings: ['No active entities'] },
      execution_ms: Date.now() - startTime,
    };
  }

  let disputesChecked = 0;
  let breachesDetected = 0;
  let messagesSent = 0;
  const findings = [];
  const errors = [];

  for (const entity of entities) {
    try {
      const sla = await loadSlaConfig(entity._id);

      const open = await IncentiveDispute.find({
        entity_id: entity._id,
        current_state: { $in: NON_TERMINAL_STATES },
      });

      if (open.length === 0) continue;

      const entityName = entity.short_name || entity.entity_name;
      let entityBreaches = 0;

      for (const dispute of open) {
        disputesChecked++;
        const cfg = sla.get(dispute.current_state) || { sla_days: DEFAULT_SLA_DAYS, escalate_to_role: DEFAULT_ESCALATE_ROLE };
        const days = daysSince(dispute.state_changed_at || dispute.filed_at);
        if (days < cfg.sla_days) continue;
        if (alreadyBreachedForCurrentState(dispute)) continue;

        // Append breach row
        breachesDetected++;
        entityBreaches++;
        const audience = await buildAudience(dispute, cfg.escalate_to_role);
        dispute.sla_breaches.push({
          state: dispute.current_state,
          breached_at: new Date(),
          detected_by: 'disputeSlaAgent',
          notified_user_ids: audience.map(a => a._id),
        });
        await dispute.save();

        // Fire escalation (best-effort; never throws into the agent loop)
        if (audience.length > 0) {
          try {
            await dispatchMultiChannel(audience, {
              templateFn: disputeSlaTemplate,
              templateData: {
                dispute,
                daysOverdue: days,
                slaDays: cfg.sla_days,
                entityName,
              },
              emailType: 'ERP_DISPUTE_SLA_BREACH',
              category: 'compliance_alert',
              entityId: entity._id,
              inAppCategory: 'compliance_alert',
              inAppPriority: 'high',
            });
            messagesSent += audience.length;
          } catch (notifyErr) {
            console.error('[disputeSlaAgent] notify dispatch failed:', notifyErr.message);
          }
        }
      }

      findings.push(`${entityName}: ${entityBreaches} breach(es)`);
    } catch (err) {
      console.error(`[disputeSlaAgent] Entity ${entity._id} failed:`, err.message);
      errors.push(`${entity.short_name || entity.entity_name}: ${err.message}`);
    }
  }

  return {
    status: errors.length > 0 && disputesChecked === 0 ? 'error' : (errors.length > 0 ? 'partial' : 'success'),
    summary: {
      disputes_checked: disputesChecked,
      breaches_detected: breachesDetected,
      messages_sent: messagesSent,
      key_findings: [
        `Disputes scanned: ${disputesChecked}`,
        `Breaches detected: ${breachesDetected}`,
        `Notifications sent: ${messagesSent}`,
        ...findings.slice(0, 5),
        ...(errors.length > 0 ? [`Errors: ${errors.length} — ${errors.slice(0, 2).join(' | ')}`] : []),
      ],
    },
    error_msg: errors.length > 0 ? errors.join(' | ') : null,
    message_ids: [],
    execution_ms: Date.now() - startTime,
  };
}

module.exports = { run };
