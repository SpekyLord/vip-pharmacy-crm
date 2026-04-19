/**
 * incentivePlanService — Phase SG-4 #21 (plan versioning)
 *
 * One service for the whole versioning lifecycle:
 *   - ensureHeader(plan)      — lazy-create IncentivePlan header for a SalesGoalPlan
 *   - getActiveVersion(...)   — resolve "the active plan right now" by header / fy
 *   - listVersions(headerId)  — every SalesGoalPlan tied to one header, newest first
 *   - createNewVersion(...)   — copy current → new draft version, mark old superseded
 *   - syncHeaderOnActivation  — keep IncentivePlan.current_version_id + status fresh
 *   - syncHeaderOnLifecycleChange — mirror status onto the header on close/reopen
 *
 * Source of truth for "what version is active for (entity, fiscal_year)":
 *   IncentivePlan.current_version_id (already O(1) via the unique index on
 *   {entity_id, fiscal_year}). Earlier drafts also wrote a parallel
 *   ACTIVE_PLAN_VERSION Lookup row, which was deliberately removed — operational
 *   state doesn't belong in the Lookup table (admins shouldn't see / edit it,
 *   and the lookup-driven Foundation Health check would fight with auto-upserts).
 *
 * Backward compatibility (Rule #2 wiring + plan integrity guardrail F.1):
 *   - All existing SalesGoalPlan code continues to work unchanged. Versioning
 *     fields (incentive_plan_id, version_no, effective_*, supersedes_plan_id)
 *     are optional on the schema; ensureHeader backfills v1 on first touch.
 *   - getActivePlan() helpers across the codebase keep returning a SalesGoalPlan
 *     row — versioning is a *header* atop the existing rows, not a replacement.
 *   - KpiSnapshot.plan_id, IncentivePayout.plan_id stay tied to the version
 *     that was active at compute time. Versioning never re-points historical
 *     rows. Snapshot accuracy is preserved by definition.
 *
 * Subscription posture:
 *   - One IncentivePlan header row per (entity_id, fiscal_year). Lazy-seeded.
 *   - Adding a new subsidiary requires zero rows up-front; first plan create
 *     auto-creates the header.
 */

const mongoose = require('mongoose');
const IncentivePlan = require('../models/IncentivePlan');
const SalesGoalPlan = require('../models/SalesGoalPlan');

/**
 * Ensure an IncentivePlan header exists for the given SalesGoalPlan and that
 * the plan's `incentive_plan_id` + `version_no` fields are populated. Idempotent.
 *
 * Used in three places:
 *  1. createPlan controller — right after SalesGoalPlan.create()
 *  2. activatePlan controller — defensive (in case create predated SG-4)
 *  3. createNewVersion service — to find the parent header by plan id
 *
 * Returns { header, plan, didBackfill }.
 */
async function ensureHeader(plan, opts = {}) {
  if (!plan || !plan._id || !plan.entity_id || !plan.fiscal_year) {
    throw new Error('ensureHeader: plan must have _id, entity_id, fiscal_year');
  }
  const session = opts.session || null;

  // Already linked → fast path; just confirm header exists (in case row was deleted).
  if (plan.incentive_plan_id) {
    const existingHeader = await IncentivePlan.findById(plan.incentive_plan_id).session(session);
    if (existingHeader) {
      return { header: existingHeader, plan, didBackfill: false };
    }
    // Header missing — fall through to upsert path.
  }

  // Upsert by (entity_id, fiscal_year). Mirrors plan_name from current row.
  const filter = { entity_id: plan.entity_id, fiscal_year: plan.fiscal_year };
  let header = await IncentivePlan.findOne(filter).session(session);

  if (!header) {
    // Use `findOneAndUpdate` with upsert to handle two-process race safely.
    header = await IncentivePlan.findOneAndUpdate(
      filter,
      {
        $setOnInsert: {
          entity_id: plan.entity_id,
          fiscal_year: plan.fiscal_year,
          plan_name: plan.plan_name,
          description: '',
          current_version_no: plan.version_no || 1,
          current_version_id: plan._id,
          status: plan.status,
          created_by: plan.created_by || null,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true, session }
    );
  }

  // Backfill plan-side fields if missing
  let didBackfill = false;
  if (!plan.incentive_plan_id) {
    plan.incentive_plan_id = header._id;
    didBackfill = true;
  }
  if (!plan.version_no) {
    plan.version_no = 1;
    didBackfill = true;
  }
  if (didBackfill && opts.persist !== false) {
    await plan.save({ session });
  }

  return { header, plan, didBackfill };
}

/**
 * Resolve the SalesGoalPlan version that is currently active for an
 * (entity_id, fiscal_year). Falls back across:
 *   1. IncentivePlan.current_version_id (fast path)
 *   2. SalesGoalPlan.findOne({ entity_id, fiscal_year, status: 'ACTIVE' })
 *      sorted by version_no desc (back-compat for pre-SG-4 rows)
 *   3. null
 *
 * Used by snapshot triggers (kpiSnapshotAgent, manual computeSnapshots) so
 * accruals always land on the right version.
 */
async function getActiveVersion(entityId, fiscalYear, opts = {}) {
  if (!entityId || !fiscalYear) return null;
  const session = opts.session || null;

  const header = await IncentivePlan.findOne({
    entity_id: entityId,
    fiscal_year: fiscalYear,
  }).session(session).lean();

  if (header?.current_version_id) {
    const versioned = await SalesGoalPlan.findById(header.current_version_id).session(session).lean();
    if (versioned && versioned.status === 'ACTIVE') return versioned;
  }

  // Back-compat fallback (legacy rows with no header)
  return SalesGoalPlan.findOne({
    entity_id: entityId,
    fiscal_year: fiscalYear,
    status: 'ACTIVE',
  }).sort({ version_no: -1, createdAt: -1 }).session(session).lean();
}

/**
 * List every version of a logical plan (by header id) newest-first.
 */
async function listVersions(headerId) {
  if (!headerId) return [];
  return SalesGoalPlan.find({ incentive_plan_id: headerId })
    .sort({ version_no: -1, createdAt: -1 })
    .populate('supersedes_plan_id', 'version_no reference status')
    .populate('superseded_by_plan_id', 'version_no reference status')
    .lean();
}

/**
 * Create a new version (v(N+1)) of the logical plan owned by `basisPlanId`.
 *
 * Behavior:
 *   - Validates `basisPlan` exists and is the latest version (no orphaned forks).
 *   - Copies growth_drivers / incentive_programs / baseline_revenue / target_revenue
 *     from the basis. Caller-supplied overrides in `body` win.
 *   - Mints `version_no = basis.version_no + 1`, status = DRAFT, links via
 *     `supersedes_plan_id = basis._id`. Reference number is NOT inherited;
 *     a fresh one is minted on first activation (matches pre-SG-4 behavior).
 *   - effective_from defaults to `body.effective_from` or now.
 *   - The basis plan's `superseded_by_plan_id` + `effective_to` are NOT set
 *     here — they are set in `syncHeaderOnSupersede()` once the new version
 *     transitions to ACTIVE (so a draft v2 sitting in review doesn't break
 *     v1's effective span).
 *
 * Returns the newly-created SalesGoalPlan v(N+1).
 *
 * Thread-safe: wraps the read-validate-create in a transaction so two parallel
 * "Create New Version" clicks can't mint v3 + v3' simultaneously.
 */
async function createNewVersion({ basisPlanId, body = {}, userId, session: outerSession = null }) {
  const useExternalSession = !!outerSession;
  const session = outerSession || await mongoose.startSession();

  let newPlan = null;
  try {
    const work = async () => {
      const basis = await SalesGoalPlan.findById(basisPlanId).session(session);
      if (!basis) throw new Error('Basis plan not found');

      // Ensure the basis has a header (handles legacy rows)
      const { header } = await ensureHeader(basis, { session });

      // Reject if a newer version already exists (only the *latest* version
      // can be the basis for v(N+1)).
      const newer = await SalesGoalPlan.findOne({
        incentive_plan_id: header._id,
        version_no: { $gt: basis.version_no },
      }).select('_id version_no').session(session).lean();
      if (newer) {
        throw new Error(`Cannot create new version from v${basis.version_no} — v${newer.version_no} already exists`);
      }

      const nextVersionNo = (basis.version_no || 1) + 1;
      const effectiveFrom = body.effective_from ? new Date(body.effective_from) : new Date();

      newPlan = await SalesGoalPlan.create([{
        entity_id: basis.entity_id,
        fiscal_year: basis.fiscal_year,
        plan_name: body.plan_name || basis.plan_name,
        status: 'DRAFT',
        baseline_revenue: body.baseline_revenue ?? basis.baseline_revenue,
        target_revenue: body.target_revenue ?? basis.target_revenue,
        collection_target_pct: body.collection_target_pct ?? basis.collection_target_pct,
        growth_drivers: Array.isArray(body.growth_drivers) ? body.growth_drivers : (basis.growth_drivers || []),
        incentive_programs: Array.isArray(body.incentive_programs) ? body.incentive_programs : (basis.incentive_programs || []),
        // Versioning fields
        incentive_plan_id: header._id,
        version_no: nextVersionNo,
        effective_from: effectiveFrom,
        effective_to: null,
        supersedes_plan_id: basis._id,
        superseded_by_plan_id: null,
        // Audit / lifecycle
        created_by: userId,
        // reference: minted on first activation (do NOT inherit basis.reference)
      }], { session });

      newPlan = newPlan[0];
    };

    if (useExternalSession) await work();
    else await session.withTransaction(work);
  } finally {
    if (!useExternalSession) session.endSession();
  }

  return newPlan;
}

/**
 * Called from activatePlan(): once a plan transitions to ACTIVE, mark the
 * basis version (if any) as superseded and point the header to the new version.
 *
 * Idempotent — safe to call on a v1 with no basis.
 */
async function syncHeaderOnActivation(plan, opts = {}) {
  const session = opts.session || null;
  if (!plan || !plan._id) return;

  // Make sure header exists
  const { header } = await ensureHeader(plan, { session, persist: true });

  // If this version supersedes a prior one, close out the prior version's
  // effective_to and link superseded_by_plan_id.
  if (plan.supersedes_plan_id) {
    await SalesGoalPlan.updateOne(
      { _id: plan.supersedes_plan_id, superseded_by_plan_id: { $in: [null, undefined] } },
      {
        $set: {
          superseded_by_plan_id: plan._id,
          effective_to: plan.effective_from || new Date(),
        },
      },
      { session }
    );
  }

  // Update header to point at this newly-activated version. This is the
  // single source of truth for "what version is active for (entity_id,
  // fiscal_year)" — already O(1) via the unique index, so no parallel lookup
  // mirror is needed.
  await IncentivePlan.updateOne(
    { _id: header._id },
    {
      $set: {
        current_version_no: plan.version_no || 1,
        current_version_id: plan._id,
        status: 'ACTIVE',
        plan_name: plan.plan_name || header.plan_name,
      },
    },
    { session }
  );
}

/**
 * Called from closePlan / president-reverse: when the active version closes
 * or reverses, mirror that status onto the header.
 */
async function syncHeaderOnLifecycleChange(plan, opts = {}) {
  const session = opts.session || null;
  if (!plan?.incentive_plan_id) return;
  await IncentivePlan.updateOne(
    { _id: plan.incentive_plan_id, current_version_id: plan._id },
    { $set: { status: plan.status } },
    { session }
  );
}

module.exports = {
  ensureHeader,
  getActiveVersion,
  listVersions,
  createNewVersion,
  syncHeaderOnActivation,
  syncHeaderOnLifecycleChange,
};
