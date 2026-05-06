/**
 * PS-Eligibility Auto-Flip (Phase VIP-1.J / J2.2)
 *
 * When `evaluateEligibility(...)` from profitShareEngine flips `eligible=true`
 * for a BDM the FIRST time:
 *   1. Set PeopleMaster.withhold_active = true (the per-payee BIR posture flag).
 *   2. Emit a MessageInbox alert to the admin / finance / president audience
 *      so admin knows to flip Entity.withholding_active too (the entity-level
 *      master switch the WithholdingLedger emitter ALSO requires).
 *
 * Idempotent: subsequent runs are no-ops because `withhold_active` is already
 * true on the second pass.
 *
 * Failure isolation: never throws into the caller. The persistence flip and
 * the notification each have their own try/catch. The PnlReport upsert in
 * pnlCalc.generatePnlReport must complete even if either step here fails.
 *
 * Lookup-driven (Rule #3 + Rule #19): recipient role list comes from
 * PS_AUTO_FLIP_NOTIFY_ROLES.metadata.roles per entity. Inline DEFAULTS
 * mirror SEED_DEFAULTS in lookupGenericController.js so a fresh subsidiary
 * inherits sensible defaults during the lazy-seed window.
 */

const PeopleMaster = require('../models/PeopleMaster');
const Lookup = require('../models/Lookup');
const {
  findNotificationRecipients,
  dispatchMultiChannel,
} = require('./erpNotificationService');

const DEFAULT_NOTIFY_ROLES = ['admin', 'finance', 'president'];
const LOOKUP_CATEGORY = 'PS_AUTO_FLIP_NOTIFY_ROLES';
const LOOKUP_CODE = 'RECEIVE_PS_FLIP_ALERT';

/**
 * Resolve the per-entity recipient role list. Reads the lookup row; falls back
 * to inline defaults on read errors so a Lookup outage never blocks the alert.
 * Lazy-seed is owned by the lookup seed pipeline (lookupGenericController);
 * this resolver only reads.
 */
async function resolveNotifyRoles(entityId) {
  if (!entityId) return DEFAULT_NOTIFY_ROLES;
  try {
    const row = await Lookup.findOne({
      entity_id: entityId,
      category: LOOKUP_CATEGORY,
      code: LOOKUP_CODE,
      is_active: true,
    }).lean();
    const roles = Array.isArray(row?.metadata?.roles) ? row.metadata.roles : null;
    if (!roles || roles.length === 0) return DEFAULT_NOTIFY_ROLES;
    const cleaned = roles
      .map((r) => String(r || '').toLowerCase().trim())
      .filter(Boolean);
    return cleaned.length > 0 ? cleaned : DEFAULT_NOTIFY_ROLES;
  } catch (err) {
    console.warn('[psAutoFlip] resolveNotifyRoles failed, using defaults:', err.message);
    return DEFAULT_NOTIFY_ROLES;
  }
}

/**
 * Inspect the latest PS evaluation result for a BDM and, if this is the first
 * time `eligible=true`, flip PeopleMaster.withhold_active and notify management.
 *
 * @param {Object} args
 * @param {String|ObjectId} args.entityId
 * @param {String|ObjectId} args.bdmId  - User._id (matches PeopleMaster.user_id)
 * @param {String} args.period          - "YYYY-MM"
 * @param {Object} args.psResult        - return shape from evaluateEligibility
 * @returns {Promise<{ changed: boolean, reason?: string, person_id?: any, error?: string }>}
 */
async function maybeAutoFlipPsEligibility({ entityId, bdmId, period, psResult }) {
  try {
    if (!entityId || !bdmId) return { changed: false, reason: 'missing_args' };
    if (!psResult || psResult.eligible !== true) {
      return { changed: false, reason: 'not_eligible' };
    }

    const person = await PeopleMaster.findOne({
      entity_id: entityId,
      user_id: bdmId,
      is_active: true,
    }).select('_id full_name withhold_active bdm_stage user_id entity_id');

    if (!person) return { changed: false, reason: 'no_people_row' };
    if (person.withhold_active === true) {
      return { changed: false, reason: 'already_active', person_id: person._id };
    }

    person.withhold_active = true;
    await person.save();

    // Notification is best-effort: if it fails the flip remains persisted and
    // a future PS evaluation will not re-emit (idempotency via `already_active`).
    // The ops fix in that case is admin reading the BIR posture page rather
    // than a re-fire — same posture as `notify*` helpers in erpNotificationService.
    try {
      await emitPsFlipAlert({ entityId, period, psResult, person });
    } catch (notifyErr) {
      console.warn(
        '[psAutoFlip] notification failed (flip persisted, withhold_active=true):',
        notifyErr.message
      );
    }

    return { changed: true, person_id: person._id };
  } catch (err) {
    console.error('[psAutoFlip] failed:', err.message);
    return { changed: false, reason: 'error', error: err.message };
  }
}

/**
 * Build + dispatch the MessageInbox alert. Uses the multi-channel pipeline so
 * email + in-app + SMS-opt-in all honour the per-entity NOTIFICATION_CHANNELS
 * + per-user NotificationPreference gates.
 */
async function emitPsFlipAlert({ entityId, period, psResult, person }) {
  const roles = await resolveNotifyRoles(entityId);
  const recipients = await findNotificationRecipients(entityId, {
    role: { $in: roles },
  });
  if (!recipients || recipients.length === 0) return;

  const qualifiedCount = (psResult.ps_products || []).filter((p) => p.qualified).length;
  const fmtPeso = (n) =>
    `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const subject = `BIR withholding now active for ${person.full_name} (${period})`;
  const text = [
    `${person.full_name} just qualified for profit-sharing in period ${period}.`,
    ``,
    `BIR posture flipped: PeopleMaster.withhold_active = true.`,
    ``,
    `Action needed: confirm Entity.withholding_active is enabled for this entity.`,
    `The withholding engine emits WithholdingLedger rows only when BOTH the`,
    `per-person AND the per-entity master switch are true.`,
    ``,
    `Period totals (this month):`,
    `  BDM share:       ${fmtPeso(psResult.bdm_share)}`,
    `  VIP share:       ${fmtPeso(psResult.vip_share)}`,
    `  Qualified products: ${qualifiedCount}`,
    ``,
    `Open the BIR posture page (/erp/bir) to review and toggle the master switch.`,
  ].join('\n');
  const html = `
    <p><strong>${person.full_name}</strong> just qualified for profit-sharing in period <strong>${period}</strong>.</p>
    <p>BIR posture flipped: <code>PeopleMaster.withhold_active = true</code>.</p>
    <p><strong>Action needed:</strong> confirm <code>Entity.withholding_active</code> is enabled for this entity.
       The withholding engine emits <code>WithholdingLedger</code> rows only when BOTH the
       per-person AND the per-entity master switch are true.</p>
    <table style="border-collapse:collapse;font-family:monospace;">
      <tr><td>BDM share:</td><td>${fmtPeso(psResult.bdm_share)}</td></tr>
      <tr><td>VIP share:</td><td>${fmtPeso(psResult.vip_share)}</td></tr>
      <tr><td>Qualified products:</td><td>${qualifiedCount}</td></tr>
    </table>
    <p>Open <a href="${process.env.FRONTEND_URL || ''}/erp/bir">BIR posture</a> to review and toggle the master switch.</p>`;

  const templateFn = () => ({ subject, html, text });

  await dispatchMultiChannel(recipients, {
    templateFn,
    templateData: {},
    emailType: 'ERP_PS_ELIGIBILITY_FLIP',
    category: 'compliance_alert',
    entityId,
    inAppCategory: 'compliance_alert',
    inAppFolder: 'ACTION_REQUIRED',
    inAppPriority: 'high',
    inAppRequiresAction: true,
    inAppActionType: 'acknowledge',
    inAppActionPayload: {
      people_id: person._id ? String(person._id) : null,
      bdm_id: person.user_id ? String(person.user_id) : null,
      period,
      qualified_products: qualifiedCount,
      bdm_share: psResult.bdm_share || 0,
      vip_share: psResult.vip_share || 0,
      deep_link: '/erp/bir',
    },
  });
}

module.exports = {
  maybeAutoFlipPsEligibility,
  resolveNotifyRoles,
  DEFAULT_NOTIFY_ROLES,
  LOOKUP_CATEGORY,
  LOOKUP_CODE,
};
