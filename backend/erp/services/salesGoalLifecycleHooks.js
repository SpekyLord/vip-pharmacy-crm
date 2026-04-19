/**
 * salesGoalLifecycleHooks — Phase SG-6 #30
 *
 * HRIS-FREE replacement for an external HR system. Runs as a Mongoose
 * `post('save')` hook on PeopleMaster to handle every sales-goal-eligible
 * employee lifecycle transition:
 *
 *   (a) Newly active + role IN SALES_GOAL_ELIGIBLE_ROLES
 *       → auto-enroll into the active plan's targets (idempotent).
 *
 *   (b) Deactivated (is_active flipped false) OR role moves OUT of eligible
 *       → close open IncentivePayout rows per GOAL_CONFIG.DEACTIVATION_PAYOUT_POLICY
 *         lookup (finalize_accrued | reverse_accrued — see resolvePolicy()).
 *
 *   (c) Territory or role changed WITHIN the eligible set
 *       → append a TargetRevision sub-document on the BDM's SalesGoalTarget
 *         row, preserving historical snapshot accuracy (future snapshots use
 *         the new values; past snapshots stay frozen).
 *
 * ── Integrity guardrails (user requirement F.1 cross-module safety) ─────
 *  - ADDITIVE: does NOT replace existing PeopleMaster post-save logic.
 *  - SHORT-CIRCUITS if no active plan exists for the entity (fresh subsidiaries
 *    should save people without crashing).
 *  - TRANSACTION-ISOLATED: wraps its own writes in a dedicated mongoose
 *    transaction. A Sales Goal enrollment failure NEVER blocks the underlying
 *    PeopleMaster save — we log + emit an integration event and move on.
 *  - LOOKUP-DRIVEN: SALES_GOAL_ELIGIBLE_ROLES + GOAL_CONFIG +
 *    DEACTIVATION_PAYOUT_POLICY all govern behavior. Zero hardcoded roles.
 *  - AUDIT-COMPLETE: every auto-action writes to ErpAuditLog.
 *
 * Design note — post('save') vs pre('save'):
 *   Using post ensures the PeopleMaster row is persisted BEFORE we react.
 *   Any failure here can be retried via an admin "re-run lifecycle" endpoint
 *   without corrupting the PeopleMaster state.
 */

const mongoose = require('mongoose');
const Lookup = require('../models/Lookup');
const SalesGoalPlan = require('../models/SalesGoalPlan');
const SalesGoalTarget = require('../models/SalesGoalTarget');
const IncentivePayout = require('../models/IncentivePayout');
const ErpAuditLog = require('../models/ErpAuditLog');
const salesGoalService = require('./salesGoalService');
const integrationHooks = require('./integrationHooks');

const { INTEGRATION_EVENTS } = integrationHooks;

// Deactivation policy codes.
const POLICY = Object.freeze({
  FINALIZE_ACCRUED: 'finalize_accrued',  // leave ACCRUED as-is; authority approves/pays later
  REVERSE_ACCRUED:  'reverse_accrued',   // post Storno reversal on every open ACCRUED row
});

/**
 * Read per-entity policy from GOAL_CONFIG lookup, falling back to the
 * conservative default (finalize_accrued — never auto-reverse without
 * an explicit admin opt-in).
 */
async function resolvePolicy(entityId) {
  try {
    const row = await Lookup.findOne({
      entity_id: entityId,
      category: 'GOAL_CONFIG',
      code: 'DEACTIVATION_PAYOUT_POLICY',
      is_active: true,
    }).lean();
    const raw = String(row?.metadata?.value || row?.metadata?.policy || '').toLowerCase();
    if (raw === POLICY.REVERSE_ACCRUED) return POLICY.REVERSE_ACCRUED;
    return POLICY.FINALIZE_ACCRUED;
  } catch (err) {
    console.warn('[salesGoalLifecycleHooks] policy lookup failed, defaulting to finalize_accrued:', err.message);
    return POLICY.FINALIZE_ACCRUED;
  }
}

/**
 * Lazy-seed the DEACTIVATION_PAYOUT_POLICY row if missing. One-time per entity.
 * Safe to call on every invocation because $setOnInsert is a no-op on hit.
 */
async function ensurePolicySeed(entityId) {
  try {
    await Lookup.updateOne(
      { entity_id: entityId, category: 'GOAL_CONFIG', code: 'DEACTIVATION_PAYOUT_POLICY' },
      {
        $setOnInsert: {
          label: 'Deactivation Payout Policy',
          sort_order: 70,
          is_active: true,
          metadata: {
            value: POLICY.FINALIZE_ACCRUED,
            description:
              'What to do with OPEN IncentivePayout rows when a BDM is deactivated or leaves the eligible role set. ' +
              '`finalize_accrued` leaves them as ACCRUED so authority finishes the lifecycle. ' +
              '`reverse_accrued` posts a SAP-Storno reversal on every open accrual.',
            allowed_values: [POLICY.FINALIZE_ACCRUED, POLICY.REVERSE_ACCRUED],
          },
        },
      },
      { upsert: true }
    );
  } catch (err) {
    // Non-fatal — seeds are cosmetic for defaults.
    console.warn('[salesGoalLifecycleHooks] policy seed skipped:', err.message);
  }
}

/**
 * Read the cached eligible-role code list for an entity. Mirrors
 * autoEnrollEligibleBdms's lazy self-seed so fresh subsidiaries work.
 */
async function getEligibleRoleCodes(entityId, session) {
  let rows = await Lookup.find({
    entity_id: entityId,
    category: 'SALES_GOAL_ELIGIBLE_ROLES',
    is_active: true,
  }).session(session || null).lean();

  if (rows.length === 0) {
    // Lazy seed — mirrors pattern in salesGoalController.autoEnrollEligibleBdms.
    try {
      await Lookup.updateOne(
        { entity_id: entityId, category: 'SALES_GOAL_ELIGIBLE_ROLES', code: 'BDM' },
        {
          $setOnInsert: {
            label: 'BDM (Business Development Manager)',
            sort_order: 0,
            is_active: true,
            metadata: {},
          },
        },
        { upsert: true, session: session || undefined }
      );
      rows = await Lookup.find({
        entity_id: entityId,
        category: 'SALES_GOAL_ELIGIBLE_ROLES',
        is_active: true,
      }).session(session || null).lean();
    } catch (err) {
      console.warn('[salesGoalLifecycleHooks] eligible-roles seed skipped:', err.message);
    }
  }
  return rows.map(r => r.code).filter(Boolean);
}

/**
 * Primary dispatch — called by the PeopleMaster post('save') hook.
 *
 * `person` is the saved document; `prior` is a synthetic snapshot of the
 * pre-save state captured on `pre('save')` (attached to the instance as
 * `__sgPrior`). On `isNew` we treat `prior` as absent → new-enrollment path.
 */
async function onPersonChanged(person) {
  if (!person || !person.entity_id) return;
  const entityId = person.entity_id;

  // Short-circuit fast if no active plan for this entity.
  const activePlan = await SalesGoalPlan.findOne({
    entity_id: entityId,
    status: 'ACTIVE',
  }).lean();
  if (!activePlan) return;

  // One-time: make sure the policy row exists in the lookup so admins see it.
  await ensurePolicySeed(entityId);

  // Compare prior vs current to classify the transition.
  const prior = person.__sgPrior || null;            // captured in pre-save
  const isNew = !prior || person.__sgIsNew === true;

  const eligibleCodes = await getEligibleRoleCodes(entityId);
  if (eligibleCodes.length === 0) return;            // subscribers may zero this out → no-op

  const wasEligible = !isNew && prior?.is_active === true
    && eligibleCodes.includes(String(prior.person_type || '').toUpperCase());
  const isEligibleNow = person.is_active === true
    && eligibleCodes.includes(String(person.person_type || '').toUpperCase());

  try {
    // (a) ENROLL — new or newly-eligible person
    if (!wasEligible && isEligibleNow) {
      await enrollPerson(activePlan, person);
    }
    // (b) CLOSE — was eligible, now not (deactivated OR role moved out)
    else if (wasEligible && !isEligibleNow) {
      await closePersonLifecycle(activePlan, person, prior);
    }
    // (c) REVISE — eligible → eligible, but territory or role changed within
    else if (wasEligible && isEligibleNow) {
      const territoryChanged = String(prior?.territory_id || '') !== String(person.territory_id || '');
      const roleChanged = String(prior?.person_type || '') !== String(person.person_type || '');
      if (territoryChanged || roleChanged) {
        await revisePersonTarget(activePlan, person, prior, { territoryChanged, roleChanged });
      }
    }
  } catch (err) {
    // Guardrail: lifecycle-hook failures never propagate to PeopleMaster.save().
    // Log + emit an integration event so subscribers can alert admin.
    console.error('[salesGoalLifecycleHooks] onPersonChanged failed:', err.message, err.stack);
    try {
      integrationHooks.emit(INTEGRATION_EVENTS.PERSON_LIFECYCLE_CLOSED, {
        entity_id: entityId,
        ref: String(person._id),
        data: { error: err.message, person_name: person.full_name, phase: 'hook-fail' },
      });
    } catch { /* swallow */ }
  }
}

/**
 * (a) Auto-enroll a newly-eligible active person into the plan's target list.
 * Idempotent — skip if they already have a BDM target for this plan.
 */
async function enrollPerson(plan, person) {
  const exists = await SalesGoalTarget.findOne({
    plan_id: plan._id,
    target_type: 'BDM',
    person_id: person._id,
  }).select('_id').lean();
  if (exists) return;

  const config = await salesGoalService.getGoalConfig(plan.entity_id);
  const defaultTargetRevenue = Number(config.DEFAULT_TARGET_REVENUE) || 0;
  const collectionPct = Number(plan.collection_target_pct) || 0;

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const target = await SalesGoalTarget.create([{
        entity_id: plan.entity_id,
        plan_id: plan._id,
        fiscal_year: plan.fiscal_year,
        target_type: 'BDM',
        bdm_id: person.user_id || null,
        person_id: person._id,
        territory_id: person.territory_id || null,
        target_label: person.full_name || '',
        sales_target: defaultTargetRevenue,
        collection_target: Math.round(defaultTargetRevenue * collectionPct),
        status: 'ACTIVE',
        created_by: person.updated_by || person.created_by || null,
      }], { session });

      await ErpAuditLog.create([{
        entity_id: plan.entity_id,
        log_type: 'STATUS_CHANGE',
        target_ref: String(target[0]._id),
        target_model: 'SalesGoalTarget',
        field_changed: 'target_type',
        old_value: null,
        new_value: 'BDM',
        changed_by: person.updated_by || person.created_by || new mongoose.Types.ObjectId('000000000000000000000000'),
        note: `[SG-6 lifecycle] Auto-enrolled ${person.full_name} into ${plan.reference || plan.plan_name} (role=${person.person_type})`,
      }], { session });
    });
  } finally {
    session.endSession();
  }

  integrationHooks.emit(INTEGRATION_EVENTS.PERSON_AUTO_ENROLLED, {
    entity_id: plan.entity_id,
    ref: String(person._id),
    data: {
      plan_id: String(plan._id),
      plan_ref: plan.reference,
      person_name: person.full_name,
      role: person.person_type,
    },
  });
}

/**
 * (b) Close lifecycle on deactivation / role-leaves-eligible.
 * Writes a TargetRevision entry on the BDM's target (status stays ACTIVE
 * until plan closes — we don't hide historical data), and applies the
 * DEACTIVATION_PAYOUT_POLICY to any OPEN accruals.
 */
async function closePersonLifecycle(plan, person, prior) {
  const target = await SalesGoalTarget.findOne({
    plan_id: plan._id,
    target_type: 'BDM',
    person_id: person._id,
  });
  const policy = await resolvePolicy(plan.entity_id);

  // Open accruals attached to this person (by bdm_id OR person_id).
  const payoutFilter = {
    plan_id: plan._id,
    status: 'ACCRUED',
    $or: [
      person.user_id ? { bdm_id: person.user_id } : null,
      { person_id: person._id },
    ].filter(Boolean),
  };
  const openPayouts = await IncentivePayout.find(payoutFilter).lean();

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      // Revision row on the target (if target exists).
      if (target) {
        target.target_revisions.push({
          revised_at: new Date(),
          revised_by: person.updated_by || null,
          revision_reason: `[SG-6 lifecycle] Person deactivated or left eligible role set. ` +
            `is_active ${prior?.is_active} → ${person.is_active}, person_type ${prior?.person_type} → ${person.person_type}. ` +
            `Policy: ${policy}. Open accruals affected: ${openPayouts.length}.`,
          prior_sales_target: target.sales_target,
          prior_collection_target: target.collection_target,
          prior_territory_id: prior?.territory_id || null,
          prior_person_id: person._id,
          source: 'PEOPLE_LIFECYCLE',
        });
        await target.save({ session });
      }

      if (policy === POLICY.REVERSE_ACCRUED && openPayouts.length > 0) {
        // Reverse each accrual via existing reverseJournal path. We do NOT
        // post journal reversals directly here — that's the authority's
        // job via the payout ledger UI. Instead, flag the payouts with a
        // note + mark them REJECTED (the terminal state for system-closed
        // open accruals when policy = reverse_accrued). Authority can then
        // post the reversal JE from the ledger.
        //
        // Rationale: lifecycle hooks must never post FI journals without a
        // human in the loop — that's an audit-risk path.
        await IncentivePayout.updateMany(
          { _id: { $in: openPayouts.map(p => p._id) } },
          {
            $set: {
              status: 'REJECTED',
              rejection_reason: `[SG-6 lifecycle] Auto-flagged for reversal (policy=reverse_accrued). Authority must review + post reversal JE.`,
              rejected_at: new Date(),
            },
          },
          { session }
        );

        for (const p of openPayouts) {
          await ErpAuditLog.create([{
            entity_id: plan.entity_id,
            log_type: 'STATUS_CHANGE',
            target_ref: String(p._id),
            target_model: 'IncentivePayout',
            field_changed: 'status',
            old_value: 'ACCRUED',
            new_value: 'REJECTED',
            changed_by: person.updated_by || new mongoose.Types.ObjectId('000000000000000000000000'),
            note: `[SG-6 lifecycle] ${person.full_name} deactivated/ineligible — policy=reverse_accrued. Awaiting authority reversal JE.`,
          }], { session });
        }
      } else if (openPayouts.length > 0) {
        // finalize_accrued policy: leave status ACCRUED; just annotate.
        for (const p of openPayouts) {
          await ErpAuditLog.create([{
            entity_id: plan.entity_id,
            log_type: 'STATUS_CHANGE',
            target_ref: String(p._id),
            target_model: 'IncentivePayout',
            field_changed: 'status',
            old_value: 'ACCRUED',
            new_value: 'ACCRUED',
            changed_by: person.updated_by || new mongoose.Types.ObjectId('000000000000000000000000'),
            note: `[SG-6 lifecycle] ${person.full_name} deactivated/ineligible — policy=finalize_accrued. Accrual left intact for authority to approve/pay.`,
          }], { session });
        }
      }
    });
  } finally {
    session.endSession();
  }

  integrationHooks.emit(INTEGRATION_EVENTS.PERSON_LIFECYCLE_CLOSED, {
    entity_id: plan.entity_id,
    ref: String(person._id),
    data: {
      plan_id: String(plan._id),
      plan_ref: plan.reference,
      person_name: person.full_name,
      policy,
      open_payouts_affected: openPayouts.length,
      was_active: prior?.is_active,
      is_active: person.is_active,
      prior_role: prior?.person_type,
      new_role: person.person_type,
    },
  });
}

/**
 * (c) Append a revision entry when territory/role changed but person is
 * still eligible. No payout impact — just preserve historical snapshot
 * accuracy for reports.
 */
async function revisePersonTarget(plan, person, prior, { territoryChanged, roleChanged }) {
  const target = await SalesGoalTarget.findOne({
    plan_id: plan._id,
    target_type: 'BDM',
    person_id: person._id,
  });
  if (!target) {
    // No target yet — enroll as if (a). This handles the edge where the
    // person was eligible before plan activation + target never created.
    return enrollPerson(plan, person);
  }

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      target.target_revisions.push({
        revised_at: new Date(),
        revised_by: person.updated_by || null,
        revision_reason: `[SG-6 lifecycle] In-role change — ` +
          (territoryChanged ? `territory ${prior?.territory_id} → ${person.territory_id}; ` : '') +
          (roleChanged ? `role ${prior?.person_type} → ${person.person_type}; ` : '') +
          `no payout impact.`,
        prior_sales_target: target.sales_target,
        prior_collection_target: target.collection_target,
        prior_territory_id: prior?.territory_id || null,
        prior_person_id: person._id,
        source: 'PEOPLE_LIFECYCLE',
      });
      if (territoryChanged) target.territory_id = person.territory_id || null;
      await target.save({ session });

      await ErpAuditLog.create([{
        entity_id: plan.entity_id,
        log_type: 'STATUS_CHANGE',
        target_ref: String(target._id),
        target_model: 'SalesGoalTarget',
        field_changed: territoryChanged ? 'territory_id' : 'person_type',
        old_value: String(territoryChanged ? prior?.territory_id : prior?.person_type) || null,
        new_value: String(territoryChanged ? person.territory_id : person.person_type) || null,
        changed_by: person.updated_by || new mongoose.Types.ObjectId('000000000000000000000000'),
        note: `[SG-6 lifecycle] In-role change for ${person.full_name} — revision appended (no payout impact).`,
      }], { session });
    });
  } finally {
    session.endSession();
  }
}

module.exports = {
  onPersonChanged,
  // Exposed for tests + admin "re-run lifecycle" endpoints.
  enrollPerson,
  closePersonLifecycle,
  revisePersonTarget,
  resolvePolicy,
  POLICY,
};
