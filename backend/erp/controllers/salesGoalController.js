const mongoose = require('mongoose');
const SalesGoalPlan = require('../models/SalesGoalPlan');
const SalesGoalTarget = require('../models/SalesGoalTarget');
const KpiSnapshot = require('../models/KpiSnapshot');
const ActionItem = require('../models/ActionItem');
const Entity = require('../models/Entity');
const PeopleMaster = require('../models/PeopleMaster');
const Lookup = require('../models/Lookup');
const ErpAuditLog = require('../models/ErpAuditLog');
const { catchAsync } = require('../../middleware/errorHandler');
const salesGoalService = require('../services/salesGoalService');
const { gateApproval } = require('../services/approvalService');
const { checkPeriodOpen } = require('../utils/periodLock');
const { generateSalesGoalNumber } = require('../services/docNumbering');

/**
 * Sales Goal Controller — Phase 28 (SG-Q2 compliance floor April 2026)
 * CRUD for plans, targets, KPI snapshots, actions, and dashboard endpoints.
 *
 * Compliance plumbing (SG-Q2 W1):
 *  - Default-Roles Gate via gateApproval({ module: 'SALES_GOAL_PLAN' }) on every
 *    state transition (activate/reopen/close/bulkTarget/computeSnapshots).
 *  - State changes wrapped in mongoose.startSession + withTransaction.
 *  - Every transition emits an ErpAuditLog.logChange() entry.
 *  - Reference number generated on first activation via generateSalesGoalNumber().
 *  - Auto-enrollment of sales-goal-eligible BDMs from PeopleMaster on activate
 *    (role registry lookup-driven: SALES_GOAL_ELIGIBLE_ROLES). Idempotent.
 */

function currentPeriod() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// SG-Q2 W1 — Auto-enrollment of active BDMs on plan activation.
// Reads SALES_GOAL_ELIGIBLE_ROLES (lookup-driven, subscription-ready) to decide
// which person_types enroll automatically. Zero code change when subscribers
// add new sales-facing roles (SALES_REP, SALES_MANAGER, etc.) via Control Center.
//
// Idempotent — skips persons who already have a BDM target under this plan.
// Caller is responsible for transaction session management; pass `session` so
// all creates are part of the plan-activation txn.
// ─────────────────────────────────────────────────────────────────────────────
async function autoEnrollEligibleBdms(plan, userId, session) {
  // 1) Read eligible role codes (auto-seed if this is a fresh entity)
  let eligibleLookups = await Lookup.find({
    entity_id: plan.entity_id,
    category: 'SALES_GOAL_ELIGIBLE_ROLES',
    is_active: true,
  }).session(session).lean();

  // Lazy self-seed mirror of getModulePostingRoles — a new subsidiary does not
  // need an admin to open Control Center before activation works.
  if (eligibleLookups.length === 0) {
    try {
      const SEED = [{ code: 'BDM', label: 'BDM (Business Development Manager)' }];
      await Lookup.updateOne(
        { entity_id: plan.entity_id, category: 'SALES_GOAL_ELIGIBLE_ROLES', code: 'BDM' },
        { $setOnInsert: { label: SEED[0].label, sort_order: 0, is_active: true, metadata: {} } },
        { upsert: true, session }
      );
      eligibleLookups = await Lookup.find({
        entity_id: plan.entity_id,
        category: 'SALES_GOAL_ELIGIBLE_ROLES',
        is_active: true,
      }).session(session).lean();
    } catch (err) {
      console.error('[salesGoal] SALES_GOAL_ELIGIBLE_ROLES lazy-seed failed:', err.message);
    }
  }

  const eligibleCodes = eligibleLookups.map(l => l.code).filter(Boolean);
  if (eligibleCodes.length === 0) return { enrolled: 0, skipped: 0 };

  // 2) Read GOAL_CONFIG defaults (fall back to zero if not seeded for this entity)
  const config = await salesGoalService.getGoalConfig(plan.entity_id);
  const defaultTargetRevenue = Number(config.DEFAULT_TARGET_REVENUE) || 0;
  const collectionPct = Number(plan.collection_target_pct) || 0;

  // 3) Enumerate eligible active people for this entity
  const people = await PeopleMaster.find({
    entity_id: plan.entity_id,
    person_type: { $in: eligibleCodes },
    is_active: true,
  }).select('_id user_id full_name territory_id').session(session).lean();

  if (people.length === 0) return { enrolled: 0, skipped: 0 };

  // 4) Find which already have a BDM target under this plan (idempotent check)
  const personIds = people.map(p => p._id);
  const existing = await SalesGoalTarget.find({
    plan_id: plan._id,
    target_type: 'BDM',
    person_id: { $in: personIds },
  }).select('person_id').session(session).lean();
  const alreadyEnrolled = new Set(existing.map(e => e.person_id?.toString()).filter(Boolean));

  // 5) Create target rows for the rest
  const toCreate = people.filter(p => !alreadyEnrolled.has(p._id.toString()));
  let enrolled = 0;
  for (const p of toCreate) {
    const collectionTarget = Math.round(defaultTargetRevenue * collectionPct);
    await SalesGoalTarget.create([{
      entity_id: plan.entity_id,
      plan_id: plan._id,
      fiscal_year: plan.fiscal_year,
      target_type: 'BDM',
      bdm_id: p.user_id || null,       // null is valid — some BDMs have no login yet
      person_id: p._id,
      territory_id: p.territory_id || null,
      target_label: p.full_name || '',
      sales_target: defaultTargetRevenue,
      collection_target: collectionTarget,
      status: 'ACTIVE',                 // matches the activated plan
      created_by: userId,
    }], { session });
    enrolled++;
  }

  return { enrolled, skipped: people.length - toCreate.length };
}

// ═══════════════════════════════════════
// PLAN CRUD
// ═══════════════════════════════════════

exports.getPlans = catchAsync(async (req, res) => {
  const filter = {};
  if (req.query.fiscal_year) filter.fiscal_year = Number(req.query.fiscal_year);
  if (req.query.status) filter.status = req.query.status;

  if (req.isPresident) {
    if (req.query.entity_id) filter.entity_id = req.query.entity_id;
  } else {
    filter.entity_id = req.entityId;
  }

  const plans = await SalesGoalPlan.find(filter)
    .populate('entity_id', 'entity_name short_name')
    .sort({ fiscal_year: -1 })
    .lean();

  res.json({ success: true, data: plans });
});

exports.getPlanById = catchAsync(async (req, res) => {
  const plan = await SalesGoalPlan.findById(req.params.id)
    .populate('entity_id', 'entity_name short_name')
    .populate('approved_by', 'name email')
    .populate('created_by', 'name email')
    .lean();

  if (!plan) return res.status(404).json({ success: false, message: 'Plan not found' });
  res.json({ success: true, data: plan });
});

exports.createPlan = catchAsync(async (req, res) => {
  const plan = await SalesGoalPlan.create({
    ...req.body,
    entity_id: req.body.entity_id || req.entityId,
    created_by: req.user._id,
  });
  res.status(201).json({ success: true, data: plan, message: 'Sales goal plan created' });
});

exports.updatePlan = catchAsync(async (req, res) => {
  const plan = await SalesGoalPlan.findById(req.params.id);
  if (!plan) return res.status(404).json({ success: false, message: 'Plan not found' });
  if (plan.status !== 'DRAFT') {
    return res.status(400).json({ success: false, message: 'Only DRAFT plans can be edited' });
  }

  Object.assign(plan, req.body);
  await plan.save();
  res.json({ success: true, data: plan, message: 'Plan updated' });
});

exports.activatePlan = catchAsync(async (req, res) => {
  const plan = await SalesGoalPlan.findById(req.params.id);
  if (!plan) return res.status(404).json({ success: false, message: 'Plan not found' });
  if (plan.status !== 'DRAFT') {
    return res.status(400).json({ success: false, message: 'Only DRAFT plans can be activated' });
  }

  // ── Default-Roles Gate (Phase G4) ─────────────────────────────────────────
  // Non-authorized submitters are held in the Approval Hub (HTTP 202).
  const gated = await gateApproval({
    entityId: plan.entity_id,
    module: 'SALES_GOAL_PLAN',
    docType: 'PLAN_ACTIVATE',
    docId: plan._id,
    docRef: plan.reference || `${plan.plan_name} FY${plan.fiscal_year}`,
    amount: plan.target_revenue || 0,
    description: `Activate Sales Goal Plan — ${plan.plan_name} FY${plan.fiscal_year}`,
    requesterId: req.user._id,
    requesterName: req.user.name || req.user.email,
  }, res);
  if (gated) return;

  // ── Transaction wrap (matches expenseController.js:248-269) ────────────────
  let enrollmentSummary = { enrolled: 0, skipped: 0 };
  let priorReference = plan.reference;
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      // Populate reference on first activation (preserved across reopen → re-activate)
      if (!plan.reference) {
        plan.reference = await generateSalesGoalNumber({ entityId: plan.entity_id });
      }
      plan.status = 'ACTIVE';
      plan.approved_by = req.user._id;
      plan.approved_at = new Date();
      await plan.save({ session });

      await SalesGoalTarget.updateMany(
        { plan_id: plan._id, status: 'DRAFT' },
        { $set: { status: 'ACTIVE' } },
        { session }
      );

      // Auto-enroll active eligible BDMs (idempotent; lookup-driven roles)
      enrollmentSummary = await autoEnrollEligibleBdms(plan, req.user._id, session);

      await ErpAuditLog.logChange([{
        entity_id: plan.entity_id,
        log_type: 'STATUS_CHANGE',
        target_ref: plan._id.toString(),
        target_model: 'SalesGoalPlan',
        field_changed: 'status',
        old_value: 'DRAFT',
        new_value: 'ACTIVE',
        changed_by: req.user._id,
        note: `Activated plan ${plan.reference || plan.plan_name} — auto-enrolled ${enrollmentSummary.enrolled} BDM(s)${priorReference ? '' : ' (reference assigned: ' + plan.reference + ')'}`,
      }], { session });
    });
  } finally {
    session.endSession();
  }

  res.json({
    success: true,
    data: plan,
    message: `Plan activated — ${enrollmentSummary.enrolled} BDM(s) auto-enrolled${enrollmentSummary.skipped ? ` (${enrollmentSummary.skipped} already enrolled)` : ''}`,
    enrollment: enrollmentSummary,
  });
});

exports.reopenPlan = catchAsync(async (req, res) => {
  const plan = await SalesGoalPlan.findById(req.params.id);
  if (!plan) return res.status(404).json({ success: false, message: 'Plan not found' });
  if (plan.status !== 'ACTIVE') {
    return res.status(400).json({ success: false, message: 'Only ACTIVE plans can be reopened' });
  }

  const gated = await gateApproval({
    entityId: plan.entity_id,
    module: 'SALES_GOAL_PLAN',
    docType: 'PLAN_REOPEN',
    docId: plan._id,
    docRef: plan.reference || `${plan.plan_name} FY${plan.fiscal_year}`,
    amount: plan.target_revenue || 0,
    description: `Reopen Sales Goal Plan to DRAFT — ${plan.plan_name} FY${plan.fiscal_year}`,
    requesterId: req.user._id,
    requesterName: req.user.name || req.user.email,
  }, res);
  if (gated) return;

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      plan.status = 'DRAFT';
      plan.reopened_by = req.user._id;
      plan.reopened_at = new Date();
      await plan.save({ session });

      await SalesGoalTarget.updateMany(
        { plan_id: plan._id, status: 'ACTIVE' },
        { $set: { status: 'DRAFT' } },
        { session }
      );

      await ErpAuditLog.logChange([{
        entity_id: plan.entity_id,
        log_type: 'REOPEN',
        target_ref: plan._id.toString(),
        target_model: 'SalesGoalPlan',
        field_changed: 'status',
        old_value: 'ACTIVE',
        new_value: 'DRAFT',
        changed_by: req.user._id,
        note: `Reopened plan ${plan.reference || plan.plan_name}`,
      }], { session });
    });
  } finally {
    session.endSession();
  }

  res.json({ success: true, data: plan, message: 'Plan reopened to DRAFT' });
});

exports.closePlan = catchAsync(async (req, res) => {
  const plan = await SalesGoalPlan.findById(req.params.id);
  if (!plan) return res.status(404).json({ success: false, message: 'Plan not found' });
  if (plan.status === 'CLOSED') {
    return res.status(400).json({ success: false, message: 'Plan is already closed' });
  }

  const gated = await gateApproval({
    entityId: plan.entity_id,
    module: 'SALES_GOAL_PLAN',
    docType: 'PLAN_CLOSE',
    docId: plan._id,
    docRef: plan.reference || `${plan.plan_name} FY${plan.fiscal_year}`,
    amount: plan.target_revenue || 0,
    description: `Close Sales Goal Plan — ${plan.plan_name} FY${plan.fiscal_year}`,
    requesterId: req.user._id,
    requesterName: req.user.name || req.user.email,
  }, res);
  if (gated) return;

  const previousStatus = plan.status;
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      plan.status = 'CLOSED';
      plan.closed_by = req.user._id;
      plan.closed_at = new Date();
      await plan.save({ session });

      await SalesGoalTarget.updateMany(
        { plan_id: plan._id },
        { $set: { status: 'CLOSED' } },
        { session }
      );

      await ErpAuditLog.logChange([{
        entity_id: plan.entity_id,
        log_type: 'STATUS_CHANGE',
        target_ref: plan._id.toString(),
        target_model: 'SalesGoalPlan',
        field_changed: 'status',
        old_value: previousStatus,
        new_value: 'CLOSED',
        changed_by: req.user._id,
        note: `Closed plan ${plan.reference || plan.plan_name}`,
      }], { session });
    });
  } finally {
    session.endSession();
  }

  res.json({ success: true, data: plan, message: 'Plan closed' });
});

// ═══════════════════════════════════════
// TARGET CRUD
// ═══════════════════════════════════════

exports.getTargets = catchAsync(async (req, res) => {
  const filter = {};
  if (req.query.plan_id) filter.plan_id = req.query.plan_id;
  if (req.query.target_type) filter.target_type = req.query.target_type;
  if (req.query.fiscal_year) filter.fiscal_year = Number(req.query.fiscal_year);

  // BDMs see only their own targets
  if (!req.isPresident && req.user.role !== 'admin' && req.user.role !== 'finance') {
    filter.bdm_id = req.user._id;
  } else if (!req.isPresident) {
    filter.entity_id = req.entityId;
  }

  const targets = await SalesGoalTarget.find(filter)
    .populate('bdm_id', 'name email')
    .populate('person_id', 'full_name bdm_code position')
    .populate('territory_id', 'territory_code territory_name')
    .populate('target_entity_id', 'entity_name short_name')
    .sort({ target_type: 1, sales_target: -1 })
    .lean();

  res.json({ success: true, data: targets });
});

exports.getMyTarget = catchAsync(async (req, res) => {
  const fiscalYear = req.query.fiscal_year || new Date().getFullYear();
  const target = await SalesGoalTarget.findOne({
    bdm_id: req.user._id,
    fiscal_year: Number(fiscalYear),
    target_type: 'BDM',
    status: 'ACTIVE',
  })
    .populate('plan_id', 'plan_name fiscal_year target_revenue baseline_revenue growth_drivers incentive_programs')
    .populate('territory_id', 'territory_code territory_name')
    .lean();

  res.json({ success: true, data: target });
});

exports.createTarget = catchAsync(async (req, res) => {
  const plan = await SalesGoalPlan.findById(req.body.plan_id).lean();
  if (!plan) return res.status(404).json({ success: false, message: 'Plan not found' });

  // Auto-compute collection target if not provided
  const collectionTarget = req.body.collection_target || Math.round(req.body.sales_target * plan.collection_target_pct);

  const target = await SalesGoalTarget.create({
    ...req.body,
    entity_id: req.body.entity_id || req.entityId,
    fiscal_year: plan.fiscal_year,
    collection_target: collectionTarget,
    status: plan.status === 'ACTIVE' ? 'ACTIVE' : 'DRAFT',
    created_by: req.user._id,
  });

  res.status(201).json({ success: true, data: target, message: 'Target created' });
});

exports.bulkCreateTargets = catchAsync(async (req, res) => {
  const { plan_id, targets } = req.body;
  if (!Array.isArray(targets) || targets.length === 0) {
    return res.status(400).json({ success: false, message: 'targets array required' });
  }
  const plan = await SalesGoalPlan.findById(plan_id).lean();
  if (!plan) return res.status(404).json({ success: false, message: 'Plan not found' });

  const totalSalesTarget = targets.reduce((s, t) => s + (Number(t.sales_target) || 0), 0);

  const gated = await gateApproval({
    entityId: plan.entity_id,
    module: 'SALES_GOAL_PLAN',
    docType: 'BULK_TARGETS',
    docId: plan._id,
    docRef: plan.reference || `${plan.plan_name} FY${plan.fiscal_year}`,
    amount: totalSalesTarget,
    description: `Bulk-assign ${targets.length} target(s) under ${plan.plan_name} FY${plan.fiscal_year} (total ₱${totalSalesTarget.toLocaleString()})`,
    requesterId: req.user._id,
    requesterName: req.user.name || req.user.email,
  }, res);
  if (gated) return;

  const results = [];
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      for (const t of targets) {
        const salesTarget = Number(t.sales_target) || 0;
        const collectionTarget = t.collection_target || Math.round(salesTarget * (plan.collection_target_pct || 0));
        const target = await SalesGoalTarget.findOneAndUpdate(
          { plan_id, target_type: t.target_type, bdm_id: t.bdm_id || null, target_entity_id: t.target_entity_id || null, territory_id: t.territory_id || null },
          {
            $set: {
              ...t,
              entity_id: t.entity_id || req.entityId,
              plan_id,
              fiscal_year: plan.fiscal_year,
              collection_target: collectionTarget,
              status: plan.status === 'ACTIVE' ? 'ACTIVE' : 'DRAFT',
              created_by: req.user._id,
            },
          },
          { upsert: true, new: true, session }
        );
        results.push(target);
      }

      await ErpAuditLog.logChange([{
        entity_id: plan.entity_id,
        log_type: 'STATUS_CHANGE',
        target_ref: plan._id.toString(),
        target_model: 'SalesGoalPlan',
        field_changed: 'targets_bulk',
        old_value: null,
        new_value: `${results.length} targets upserted`,
        changed_by: req.user._id,
        note: `Bulk-assigned ${results.length} targets (total ₱${totalSalesTarget.toLocaleString()}) under plan ${plan.reference || plan.plan_name}`,
      }], { session });
    });
  } finally {
    session.endSession();
  }

  res.json({ success: true, data: results, message: `${results.length} targets saved` });
});

exports.updateTarget = catchAsync(async (req, res) => {
  const target = await SalesGoalTarget.findById(req.params.id);
  if (!target) return res.status(404).json({ success: false, message: 'Target not found' });

  if (req.body.sales_target && !req.body.collection_target) {
    const plan = await SalesGoalPlan.findById(target.plan_id).lean();
    req.body.collection_target = Math.round(req.body.sales_target * (plan?.collection_target_pct));
  }

  Object.assign(target, req.body);
  await target.save();
  res.json({ success: true, data: target, message: 'Target updated' });
});

// ═══════════════════════════════════════
// KPI SNAPSHOTS
// ═══════════════════════════════════════

exports.computeSnapshots = catchAsync(async (req, res) => {
  const plan = await SalesGoalPlan.findById(req.body.plan_id || req.query.plan_id);
  if (!plan) return res.status(404).json({ success: false, message: 'Plan not found' });

  const period = req.body.period || req.query.period || currentPeriod();

  // Period lock — refuse to compute snapshots for a CLOSED/LOCKED period.
  // Snapshot computation writes KpiSnapshot rows; those rows drive incentive
  // accrual downstream (Week 2), which would post journals into the period.
  // Blocking here keeps the ledger consistent with finance's month-end close.
  try {
    await checkPeriodOpen(plan.entity_id, period);
  } catch (err) {
    if (err.code === 'PERIOD_LOCKED') {
      return res.status(err.status || 400).json({ success: false, message: err.message, code: err.code });
    }
    throw err;
  }

  // ── Default-Roles Gate ────────────────────────────────────────────────────
  // Computing snapshots is a company-wide operation (touches every active BDM)
  // and produces the data incentive payouts will key off. Gate it behind the
  // same authority matrix as plan lifecycle operations.
  const gated = await gateApproval({
    entityId: plan.entity_id,
    module: 'SALES_GOAL_PLAN',
    docType: 'COMPUTE_SNAPSHOT',
    docId: plan._id,
    docRef: plan.reference || `${plan.plan_name} FY${plan.fiscal_year}`,
    amount: 0,
    description: `Compute KPI snapshots for ${plan.plan_name} FY${plan.fiscal_year} (period ${period})`,
    requesterId: req.user._id,
    requesterName: req.user.name || req.user.email,
  }, res);
  if (gated) return;

  // Compute monthly + YTD. NOT transaction-wrapped: KpiSnapshot upserts are
  // idempotent, and MongoDB transactions have a practical size ceiling that a
  // full company-wide re-compute can exceed. Failures mid-loop leave partial
  // data; re-running closes the gap.
  //
  // Incentive accrual fires inside each YTD snapshot (see
  // salesGoalService.computeBdmSnapshot → accrueIncentive). Upserts are
  // idempotent on (plan_id, bdm_id, period, period_type, program_code), so
  // re-computing the same period does NOT double-post the journal.
  const runOpts = { userId: req.user._id };
  const monthlyResults = await salesGoalService.computeAllSnapshots(plan, period, 'MONTHLY', { ...runOpts, accrueIncentives: false });
  const ytdResults = await salesGoalService.computeAllSnapshots(plan, String(plan.fiscal_year), 'YTD', runOpts);

  await ErpAuditLog.logChange({
    entity_id: plan.entity_id,
    log_type: 'STATUS_CHANGE',
    target_ref: plan._id.toString(),
    target_model: 'SalesGoalPlan',
    field_changed: 'snapshot_compute',
    old_value: null,
    new_value: `${monthlyResults.length}M + ${ytdResults.length}Y`,
    changed_by: req.user._id,
    note: `KPI snapshots computed for ${plan.reference || plan.plan_name} period ${period}`,
  });

  res.json({
    success: true,
    message: `Computed ${monthlyResults.length} monthly + ${ytdResults.length} YTD snapshots for ${period}`,
    data: { period, monthly: monthlyResults, ytd: ytdResults },
  });
});

exports.getSnapshots = catchAsync(async (req, res) => {
  const filter = {};
  if (req.query.plan_id) filter.plan_id = req.query.plan_id;
  if (req.query.period) filter.period = req.query.period;
  if (req.query.period_type) filter.period_type = req.query.period_type;
  if (req.query.bdm_id) filter.bdm_id = req.query.bdm_id;

  if (!req.isPresident) filter.entity_id = req.entityId;

  const snapshots = await KpiSnapshot.find(filter)
    .populate('bdm_id', 'name email')
    .populate('person_id', 'full_name bdm_code')
    .populate('territory_id', 'territory_code territory_name')
    .sort({ sales_attainment_pct: -1 })
    .lean();

  res.json({ success: true, data: snapshots });
});

exports.getMySnapshot = catchAsync(async (req, res) => {
  const fiscalYear = req.query.fiscal_year || new Date().getFullYear();
  const period = req.query.period || currentPeriod();
  const periodType = req.query.period_type || 'YTD';

  const snapshot = await KpiSnapshot.findOne({
    bdm_id: req.user._id,
    fiscal_year: Number(fiscalYear),
    period: periodType === 'YTD' ? String(fiscalYear) : period,
    period_type: periodType,
  })
    .populate('person_id', 'full_name bdm_code position')
    .populate('territory_id', 'territory_code territory_name')
    .lean();

  // Also get last 6 months history
  const history = await KpiSnapshot.find({
    bdm_id: req.user._id,
    fiscal_year: Number(fiscalYear),
    period_type: 'MONTHLY',
  })
    .sort({ period: -1 })
    .limit(6)
    .select('period sales_actual sales_target sales_attainment_pct incentive_status')
    .lean();

  res.json({ success: true, data: { current: snapshot, history } });
});

// ═══════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════

exports.getGoalDashboard = catchAsync(async (req, res) => {
  const planId = req.query.plan_id;
  const plan = planId
    ? await SalesGoalPlan.findById(planId).lean()
    : await SalesGoalPlan.findOne({ status: 'ACTIVE', entity_id: req.entityId }).sort({ fiscal_year: -1 }).lean();

  if (!plan) return res.json({ success: true, data: null, message: 'No active plan found' });

  const config = await salesGoalService.getGoalConfig(req.entityId);

  // Get YTD snapshots
  const rawSnapshots = await KpiSnapshot.find({
    plan_id: plan._id,
    period_type: 'YTD',
  })
    .populate('bdm_id', 'name email')
    .populate('person_id', 'full_name bdm_code position is_active')
    .populate('territory_id', 'territory_code territory_name')
    .sort({ sales_attainment_pct: -1 })
    .lean();

  // SG-Q2 W1 — drop snapshots whose person_id is a deactivated BDM. Keep
  // snapshots with no person_id (legacy data) so historic coverage isn't hidden.
  const snapshots = rawSnapshots.filter(s => !s.person_id || s.person_id.is_active !== false);

  // Entity targets — keep raw target_entity_id (no populate) so orphan references survive
  const entityTargetsRaw = await SalesGoalTarget.find({
    plan_id: plan._id,
    target_type: 'ENTITY',
    status: { $in: ['ACTIVE', 'DRAFT'] },
  }).lean();

  // Resolve entity names via direct lookup (no status filter — include inactive/orphan)
  const entityIds = entityTargetsRaw
    .map(t => t.target_entity_id)
    .filter(Boolean);
  const entityDocs = entityIds.length
    ? await Entity.find({ _id: { $in: entityIds } }).select('entity_name short_name status').lean()
    : [];
  const entityMap = new Map(entityDocs.map(e => [e._id.toString(), e]));

  // Actuals per entity: sum BDM snapshots grouped by entity_id
  const actualByEntity = new Map();
  for (const snap of snapshots) {
    const eid = snap.entity_id?.toString();
    if (!eid) continue;
    actualByEntity.set(eid, (actualByEntity.get(eid) || 0) + (snap.sales_actual || 0));
  }

  const entityTargets = entityTargetsRaw.map(t => {
    const entId = t.target_entity_id;
    const entIdStr = entId?.toString() || '';
    const ent = entIdStr ? entityMap.get(entIdStr) : null;
    const nameFromDoc = ent?.entity_name || '';
    const isInactive = ent ? ent.status !== 'ACTIVE' : !!entIdStr;
    return {
      _id: t._id,
      entity_id: entId || null,
      entity_name: nameFromDoc || t.target_label || (entIdStr ? 'Deleted entity' : 'Unassigned'),
      short_name: ent?.short_name || '',
      is_inactive: isInactive,
      sales_target: t.sales_target || 0,
      collection_target: t.collection_target || 0,
      actual: entIdStr ? (actualByEntity.get(entIdStr) || 0) : 0,
      status: t.status,
    };
  });

  // Company totals
  const totalSalesTarget = snapshots.reduce((s, snap) => s + (snap.sales_target || 0), 0);
  const totalSalesActual = snapshots.reduce((s, snap) => s + (snap.sales_actual || 0), 0);
  const totalCollActual = snapshots.reduce((s, snap) => s + (snap.collections_actual || 0), 0);
  const overallAttainment = totalSalesTarget > 0 ? Math.round((totalSalesActual / totalSalesTarget) * 100) : 0;
  const overallCollRate = totalSalesActual > 0 ? Math.round((totalCollActual / totalSalesActual) * 100) : 0;

  // Leaderboard with rank
  const leaderboard = snapshots.map((s, i) => ({
    rank: i + 1,
    bdm_id: s.bdm_id?._id,
    name: s.person_id?.full_name || s.bdm_id?.name,
    bdm_code: s.person_id?.bdm_code,
    territory: s.territory_id?.territory_name,
    sales_target: s.sales_target,
    sales_actual: s.sales_actual,
    sales_attainment_pct: s.sales_attainment_pct,
    collection_rate_pct: s.collection_rate_pct,
    incentive_tier: s.incentive_status?.[0]?.tier_label || '',
    incentive_budget: s.incentive_status?.[0]?.tier_budget || 0,
    projected_tier: s.incentive_status?.[0]?.projected_tier_label || '',
    status: s.sales_attainment_pct >= config.ATTAINMENT_GREEN ? 'on_track'
      : s.sales_attainment_pct >= config.ATTAINMENT_YELLOW ? 'needs_attention'
      : 'at_risk',
  }));

  // Aggregate driver actuals from snapshot.driver_kpis (sum of KPI actual_value per driver_code)
  const driverActualByCode = new Map();
  for (const snap of snapshots) {
    for (const g of snap.driver_kpis || []) {
      const sum = (g.kpis || []).reduce((s, k) => s + (k.actual_value || 0), 0);
      driverActualByCode.set(g.driver_code, (driverActualByCode.get(g.driver_code) || 0) + sum);
    }
  }
  const growthDriversWithActual = (plan.growth_drivers || []).map(d => ({
    ...(d.toObject ? d.toObject() : d),
    actual: driverActualByCode.get(d.driver_code) || 0,
  }));

  res.json({
    success: true,
    data: {
      plan: {
        _id: plan._id,
        plan_name: plan.plan_name,
        fiscal_year: plan.fiscal_year,
        status: plan.status,
        baseline_revenue: plan.baseline_revenue,
        target_revenue: plan.target_revenue,
        growth_drivers: growthDriversWithActual,
      },
      summary: {
        total_sales_target: totalSalesTarget,
        total_sales_actual: totalSalesActual,
        total_collections_actual: totalCollActual,
        overall_attainment_pct: overallAttainment,
        collection_rate_pct: overallCollRate,
        bdm_count: snapshots.length,
      },
      entity_targets: entityTargets,
      leaderboard,
      tiers: await salesGoalService.getIncentiveTiers(req.entityId),
      // Lookup-driven STATUS_PALETTE — colors + labels for ON_TRACK / NEEDS_ATTENTION / AT_RISK.
      // Subscribers re-brand via Control Center → Lookup Tables (no code change).
      palette: await salesGoalService.getStatusPalette(req.entityId),
      config: {
        attainment_green: config.ATTAINMENT_GREEN,
        attainment_yellow: config.ATTAINMENT_YELLOW,
        attainment_red: config.ATTAINMENT_RED,
      },
    },
  });
});

exports.getBdmGoalDetail = catchAsync(async (req, res) => {
  const { bdmId } = req.params;
  const fiscalYear = req.query.fiscal_year || new Date().getFullYear();

  const plan = await SalesGoalPlan.findOne({
    status: { $in: ['ACTIVE', 'CLOSED'] },
    fiscal_year: Number(fiscalYear),
  }).lean();

  if (!plan) return res.json({ success: true, data: null });

  const target = await SalesGoalTarget.findOne({
    plan_id: plan._id, target_type: 'BDM', bdm_id: bdmId,
  })
    .populate('territory_id', 'territory_code territory_name')
    .lean();

  const ytdSnapshot = await KpiSnapshot.findOne({
    plan_id: plan._id, bdm_id: bdmId, period_type: 'YTD',
  }).lean();

  const monthlyHistory = await KpiSnapshot.find({
    plan_id: plan._id, bdm_id: bdmId, period_type: 'MONTHLY',
  }).sort({ period: 1 }).lean();

  const actions = await ActionItem.find({
    plan_id: plan._id, bdm_id: bdmId, status: { $nin: ['CANCELLED'] },
  }).sort({ status: 1, due_date: 1 }).lean();

  const person = await PeopleMaster.findOne({ user_id: bdmId })
    .select('full_name bdm_code position bdm_stage territory_id')
    .lean();

  const config = await salesGoalService.getGoalConfig(req.entityId);
  const tiers = await salesGoalService.getIncentiveTiers(req.entityId);
  const palette = await salesGoalService.getStatusPalette(req.entityId);

  // Enrich target with running actual + remaining from YTD snapshot
  const enrichedTarget = target ? {
    ...target,
    actual: ytdSnapshot?.sales_actual || 0,
    remaining: Math.max(0, (target.sales_target || 0) - (ytdSnapshot?.sales_actual || 0)),
    collection_actual: ytdSnapshot?.collections_actual || 0,
  } : null;

  // Enrich incentive_status[0] with "amount_to_next_tier" + "next_tier" for UI
  let enrichedYtd = ytdSnapshot;
  if (ytdSnapshot) {
    const is = ytdSnapshot.incentive_status?.[0];
    const tiersAsc = [...tiers].sort((a, b) => a.attainment_min - b.attainment_min);
    const attPct = ytdSnapshot.sales_attainment_pct || 0;
    const next = tiersAsc.find(t => t.attainment_min > attPct);
    const amountToNext = next
      ? Math.max(0, Math.round((next.attainment_min / 100) * (ytdSnapshot.sales_target || 0)) - (ytdSnapshot.sales_actual || 0))
      : 0;
    enrichedYtd = {
      ...ytdSnapshot,
      incentive_status: is ? [{
        ...is,
        amount_to_next_tier: amountToNext,
        next_tier: next?.label || '',
      }] : ytdSnapshot.incentive_status,
    };
  }

  // Normalize monthly history to {month, actual, target}
  const monthlyHistoryNorm = monthlyHistory.map(m => {
    const [, mm] = (m.period || '').split('-');
    return {
      period: m.period,
      month: Number(mm) || 0,
      actual: m.sales_actual || 0,
      target: m.sales_target || 0,
    };
  });

  res.json({
    success: true,
    data: {
      plan,
      target: enrichedTarget,
      person,
      ytdSnapshot: enrichedYtd,
      monthlyHistory: monthlyHistoryNorm,
      actions,
      config,
      tiers,
      palette,
    },
  });
});

exports.getDriverSummary = catchAsync(async (req, res) => {
  const planId = req.query.plan_id;
  if (!planId) return res.status(400).json({ success: false, message: 'plan_id required' });

  const plan = await SalesGoalPlan.findById(planId).lean();
  if (!plan) return res.status(404).json({ success: false, message: 'Plan not found' });

  const snapshots = await KpiSnapshot.find({
    plan_id: planId, period_type: 'YTD',
  }).lean();

  const driverSummary = (plan.growth_drivers || []).map(driver => {
    const allKpis = {};
    for (const snap of snapshots) {
      const driverGroup = snap.driver_kpis?.find(d => d.driver_code === driver.driver_code);
      if (driverGroup) {
        for (const kpi of driverGroup.kpis) {
          if (!allKpis[kpi.kpi_code]) {
            allKpis[kpi.kpi_code] = { kpi_code: kpi.kpi_code, kpi_label: kpi.kpi_label, values: [] };
          }
          allKpis[kpi.kpi_code].values.push(kpi.actual_value);
        }
      }
    }

    const kpiAverages = Object.values(allKpis).map(k => ({
      kpi_code: k.kpi_code,
      kpi_label: k.kpi_label,
      avg_value: k.values.length > 0 ? Math.round((k.values.reduce((a, b) => a + b, 0) / k.values.length) * 10) / 10 : 0,
      bdm_count: k.values.length,
    }));

    return {
      driver_code: driver.driver_code,
      driver_label: driver.driver_label,
      revenue_target_min: driver.revenue_target_min,
      revenue_target_max: driver.revenue_target_max,
      kpi_averages: kpiAverages,
    };
  });

  res.json({ success: true, data: driverSummary });
});

exports.getIncentiveBoard = catchAsync(async (req, res) => {
  const planId = req.query.plan_id;
  const plan = planId
    ? await SalesGoalPlan.findById(planId).lean()
    : await SalesGoalPlan.findOne({ status: 'ACTIVE', entity_id: req.entityId }).sort({ fiscal_year: -1 }).lean();

  if (!plan) return res.json({ success: true, data: null });

  const rawBoardSnapshots = await KpiSnapshot.find({ plan_id: plan._id, period_type: 'YTD' })
    .populate('person_id', 'full_name bdm_code position is_active')
    .populate('territory_id', 'territory_name')
    .sort({ 'incentive_status.0.attainment_pct': -1 })
    .lean();

  // SG-Q2 W1 — hide deactivated BDMs from the leaderboard and tier counts.
  const snapshots = rawBoardSnapshots.filter(s => !s.person_id || s.person_id.is_active !== false);

  const tiersRaw = await salesGoalService.getIncentiveTiers(req.entityId);
  const advisor = await salesGoalService.getIncentiveBudgetAdvisor(req.entityId, plan);
  const config = await salesGoalService.getGoalConfig(req.entityId);

  // Tiers sorted by attainment_min descending (highest first from service)
  const tierCountByCode = new Map();
  for (const s of snapshots) {
    const code = s.incentive_status?.[0]?.tier_code;
    if (code) tierCountByCode.set(code, (tierCountByCode.get(code) || 0) + 1);
  }
  const tiers = tiersRaw.map(t => ({
    tier_code: t.code,
    tier_label: t.label,
    label: t.label,
    budget: t.budget_per_bdm,
    budget_per_bdm: t.budget_per_bdm,
    attainment_min: t.attainment_min,
    bdm_count: tierCountByCode.get(t.code) || 0,
    bg_color: t.bg_color,
    text_color: t.text_color,
    reward_description: t.reward_description,
  }));

  // Ascending list by attainment_min for "distance to next tier" computation
  const tiersAsc = [...tiersRaw].sort((a, b) => a.attainment_min - b.attainment_min);

  const board = snapshots.map((s, i) => {
    const is = s.incentive_status?.[0];
    const attPct = s.sales_attainment_pct || 0;
    const nextTier = tiersAsc.find(t => t.attainment_min > attPct);
    const amountToNext = nextTier
      ? Math.max(0, Math.round((nextTier.attainment_min / 100) * (s.sales_target || 0)) - (s.sales_actual || 0))
      : 0;
    return {
      rank: i + 1,
      bdm_id: s.bdm_id,
      bdm_name: s.person_id?.full_name,
      bdm_code: s.person_id?.bdm_code,
      territory: s.territory_id?.territory_name,
      sales_target: s.sales_target,
      sales_actual: s.sales_actual,
      attainment_pct: attPct,
      current_tier: is?.tier_label || '',
      budget: is?.tier_budget || 0,
      projected_tier: is?.projected_tier_label || '',
      projected_budget: is?.projected_tier_budget || 0,
      amount_to_next_tier: amountToNext,
    };
  });

  res.json({
    success: true,
    data: {
      plan: { _id: plan._id, plan_name: plan.plan_name, fiscal_year: plan.fiscal_year },
      tiers,
      board,
      advisor,
      palette: await salesGoalService.getStatusPalette(req.entityId),
      config: {
        attainment_green: config.ATTAINMENT_GREEN,
        attainment_yellow: config.ATTAINMENT_YELLOW,
        attainment_red: config.ATTAINMENT_RED,
      },
    },
  });
});

// ═══════════════════════════════════════
// ACTION ITEMS
// ═══════════════════════════════════════

exports.getActions = catchAsync(async (req, res) => {
  const filter = {};
  if (req.query.plan_id) filter.plan_id = req.query.plan_id;
  if (req.query.driver_code) filter.driver_code = req.query.driver_code;
  if (req.query.status) filter.status = req.query.status;
  if (req.query.bdm_id) filter.bdm_id = req.query.bdm_id;

  if (!req.isPresident && req.user.role !== 'admin') {
    filter.bdm_id = req.user._id;
  } else if (!req.isPresident) {
    filter.entity_id = req.entityId;
  }

  const actions = await ActionItem.find(filter)
    .populate('bdm_id', 'name email')
    .populate('person_id', 'full_name bdm_code')
    .sort({ status: 1, priority: -1, due_date: 1 })
    .lean();

  res.json({ success: true, data: actions });
});

exports.getMyActions = catchAsync(async (req, res) => {
  const filter = { bdm_id: req.user._id };
  if (req.query.plan_id) filter.plan_id = req.query.plan_id;
  if (req.query.status) filter.status = req.query.status;

  const actions = await ActionItem.find(filter)
    .sort({ status: 1, priority: -1, due_date: 1 })
    .lean();

  res.json({ success: true, data: actions });
});

exports.createAction = catchAsync(async (req, res) => {
  const action = await ActionItem.create({
    ...req.body,
    entity_id: req.body.entity_id || req.entityId,
    bdm_id: req.body.bdm_id || req.user._id,
    created_by: req.user._id,
  });
  res.status(201).json({ success: true, data: action, message: 'Action item created' });
});

exports.updateAction = catchAsync(async (req, res) => {
  const action = await ActionItem.findById(req.params.id);
  if (!action) return res.status(404).json({ success: false, message: 'Action not found' });

  // BDMs can only update their own actions
  if (!req.isPresident && req.user.role !== 'admin') {
    if (action.bdm_id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Cannot edit another BDM\'s action' });
    }
  }

  Object.assign(action, req.body);
  await action.save();
  res.json({ success: true, data: action, message: 'Action updated' });
});

exports.completeAction = catchAsync(async (req, res) => {
  const action = await ActionItem.findById(req.params.id);
  if (!action) return res.status(404).json({ success: false, message: 'Action not found' });

  action.status = 'DONE';
  action.completed_at = new Date();
  action.completed_by = req.user._id;
  if (req.body.actual_revenue) action.actual_revenue = req.body.actual_revenue;
  await action.save();

  res.json({ success: true, data: action, message: 'Action completed' });
});

// ═══════════════════════════════════════
// MANUAL KPI ENTRY
// ═══════════════════════════════════════

exports.enterManualKpi = catchAsync(async (req, res) => {
  const { plan_id, period, driver_code, kpi_code, actual_value } = req.body;
  const bdmId = req.body.bdm_id || req.user._id;

  const snapshot = await KpiSnapshot.findOne({
    plan_id,
    bdm_id: bdmId,
    period,
    period_type: 'MONTHLY',
  });

  if (!snapshot) {
    return res.status(404).json({ success: false, message: 'No snapshot found for this period. Run KPI computation first.' });
  }

  // Find the driver group and KPI
  const driverGroup = snapshot.driver_kpis.find(d => d.driver_code === driver_code);
  if (!driverGroup) {
    return res.status(404).json({ success: false, message: `Driver ${driver_code} not found in snapshot` });
  }

  const kpi = driverGroup.kpis.find(k => k.kpi_code === kpi_code);
  if (!kpi) {
    return res.status(404).json({ success: false, message: `KPI ${kpi_code} not found` });
  }

  kpi.actual_value = actual_value;
  kpi.data_source = 'manual';
  if (kpi.target_value > 0) {
    kpi.attainment_pct = Math.round((actual_value / kpi.target_value) * 100);
  }

  await snapshot.save();
  res.json({ success: true, data: snapshot, message: 'Manual KPI value saved' });
});
