const mongoose = require('mongoose');
const SalesGoalPlan = require('../models/SalesGoalPlan');
const SalesGoalTarget = require('../models/SalesGoalTarget');
const KpiSnapshot = require('../models/KpiSnapshot');
const ActionItem = require('../models/ActionItem');
const Entity = require('../models/Entity');
const PeopleMaster = require('../models/PeopleMaster');
const Lookup = require('../models/Lookup');
const ErpAuditLog = require('../models/ErpAuditLog');
const KpiTemplate = require('../models/KpiTemplate');
const Territory = require('../models/Territory');
const { catchAsync } = require('../../middleware/errorHandler');
const { safeXlsxRead } = require('../../utils/safeXlsxRead');
const XLSX = require('xlsx');
const salesGoalService = require('../services/salesGoalService');
const incentivePlanService = require('../services/incentivePlanService');
const { gateApproval } = require('../services/approvalService');
const { checkPeriodOpen } = require('../utils/periodLock');
const { generateSalesGoalNumber } = require('../services/docNumbering');
const { notifySalesGoalPlanLifecycle } = require('../services/erpNotificationService');

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

// ─────────────────────────────────────────────────────────────────────────────
// SG-3R — Plan defaults expansion.
//
// `createPlan` optionally pre-populates `growth_drivers[].kpi_definitions[]`
// from two lookup-driven sources:
//   (a) KpiTemplate rows — when the client passes `template_id` (row._id) OR
//       `template_name` in the request body. Template rows are grouped by
//       driver_code and mapped to kpi_definitions subdocs.
//   (b) GROWTH_DRIVER lookup `metadata.default_kpi_codes[]` — applied only for
//       drivers that have no `kpi_definitions` already set AND `template_id`
//       was not used to fill them. KPI labels + units are sourced from the
//       KPI_CODE lookup.
//
// Both sources are advisory — the plan owns its own copy after creation, so
// subsequent lookup edits do NOT mutate existing plans (prevents retroactive
// schema drift, matches SAP Commissions "events are immutable" posture).
//
// Backwards-compatible: callers who do not pass `template_id` /
// `use_driver_defaults=true` see the previous behavior (plain create).
// ─────────────────────────────────────────────────────────────────────────────
async function expandTemplateIntoDrivers(entityId, body) {
  const out = Array.isArray(body.growth_drivers) ? JSON.parse(JSON.stringify(body.growth_drivers)) : [];

  // Helper: find a driver entry by code; create if missing. Returns the entry.
  const ensureDriver = (driverCode, label, sortOrder) => {
    let d = out.find(x => String(x.driver_code).toUpperCase() === String(driverCode).toUpperCase());
    if (!d) {
      d = {
        driver_code: String(driverCode).toUpperCase(),
        driver_label: label || driverCode,
        revenue_target_min: 0,
        revenue_target_max: 0,
        description: '',
        sort_order: sortOrder || 0,
        kpi_definitions: [],
      };
      out.push(d);
    }
    if (!Array.isArray(d.kpi_definitions)) d.kpi_definitions = [];
    return d;
  };

  // ── (a) KpiTemplate expansion ────────────────────────────────────────────
  let templateRows = [];
  if (body.template_id) {
    const anchor = await KpiTemplate.findOne({ _id: body.template_id, entity_id: entityId }).lean();
    if (anchor) {
      templateRows = await KpiTemplate.find({
        entity_id: entityId,
        template_name: anchor.template_name,
        is_active: true,
      }).sort({ sort_order: 1, kpi_code: 1 }).lean();
    }
  } else if (body.template_name) {
    templateRows = await KpiTemplate.find({
      entity_id: entityId,
      template_name: String(body.template_name).trim(),
      is_active: true,
    }).sort({ sort_order: 1, kpi_code: 1 }).lean();
  }

  for (const row of templateRows) {
    const d = ensureDriver(row.driver_code);
    // Skip if caller already provided this KPI (idempotent merge)
    const dup = d.kpi_definitions.some(k => String(k.kpi_code) === String(row.kpi_code));
    if (dup) continue;
    d.kpi_definitions.push({
      kpi_code: row.kpi_code,
      kpi_label: row.kpi_label || '',
      target_value: Number(row.default_target) || 0,
      unit: row.unit_code || '',
      direction: row.direction || 'higher_better',
      computation: row.computation || 'manual',
      source_model: '',
    });
  }

  // ── (b) GROWTH_DRIVER metadata.default_kpi_codes[] expansion ──────────────
  // Applied ONLY to drivers whose kpi_definitions is still empty after template
  // expansion. Respects caller's explicit definitions — never overwrites them.
  if (body.use_driver_defaults && out.length > 0) {
    const driverCodes = out.map(d => String(d.driver_code).toUpperCase());
    const [driverLookups, kpiLookups] = await Promise.all([
      Lookup.find({ entity_id: entityId, category: 'GROWTH_DRIVER', code: { $in: driverCodes }, is_active: true }).lean(),
      Lookup.find({ entity_id: entityId, category: 'KPI_CODE', is_active: true }).select('code label metadata').lean(),
    ]);
    const kpiMap = new Map(kpiLookups.map(k => [k.code, k]));
    const driverMap = new Map(driverLookups.map(d => [d.code, d]));

    for (const d of out) {
      if (d.kpi_definitions.length > 0) continue;     // respect caller
      const meta = driverMap.get(String(d.driver_code).toUpperCase())?.metadata;
      const codes = Array.isArray(meta?.default_kpi_codes) ? meta.default_kpi_codes : [];
      for (const code of codes) {
        const k = kpiMap.get(code);
        if (!k) continue;                             // silently skip unknown codes
        d.kpi_definitions.push({
          kpi_code: code,
          kpi_label: k.label || '',
          target_value: 0,
          unit: k.metadata?.unit || '',
          direction: k.metadata?.direction || 'higher_better',
          computation: k.metadata?.computation || 'manual',
          source_model: k.metadata?.source_model || '',
        });
      }
    }
  }

  return out;
}

exports.createPlan = catchAsync(async (req, res) => {
  const entityId = req.body.entity_id || req.entityId;
  const body = { ...req.body };

  // Expand advisory defaults (template_id / template_name / use_driver_defaults).
  // Falls back to the supplied growth_drivers when no expansion source matches.
  if (body.template_id || body.template_name || body.use_driver_defaults) {
    body.growth_drivers = await expandTemplateIntoDrivers(entityId, body);
  }

  // Strip non-schema hint keys before persisting so the lean model stays clean.
  delete body.template_id;
  delete body.template_name;
  delete body.use_driver_defaults;

  const plan = await SalesGoalPlan.create({
    ...body,
    entity_id: entityId,
    created_by: req.user._id,
  });

  // Phase SG-4 #21 — auto-create the IncentivePlan header (versioning).
  // Best-effort: header creation never blocks plan create. Failure here is
  // logged and lazily retried on next read/save via ensureHeader().
  try {
    await incentivePlanService.ensureHeader(plan, { persist: true });
  } catch (err) {
    console.warn('[createPlan] ensureHeader skipped:', err.message);
  }

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

      // Phase SG-Q2 W3 follow-up — lazy-seed KPI_VARIANCE_THRESHOLDS.GLOBAL so
      // kpiVarianceAgent fires on day one for a fresh subsidiary without
      // requiring an admin to open Control Center first. Non-fatal; the agent
      // also has in-memory defaults as a final safety net.
      await salesGoalService.ensureKpiVarianceGlobalThreshold(plan.entity_id, session);

      // Phase SG-4 #21 — sync the IncentivePlan header so it points at this
      // newly-activated version and mark any prior version as superseded.
      // Header is the single source of truth (O(1) via the unique index on
      // {entity_id, fiscal_year}). Idempotent. Wrapped in the same transaction
      // so a failure rolls back the activation.
      await incentivePlanService.syncHeaderOnActivation(plan, { session });

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

  // Phase SG-Q2 W3 — Plan-lifecycle notification (fire-and-forget; never blocks).
  notifySalesGoalPlanLifecycle({
    entityId: plan.entity_id,
    planId: plan._id,
    planRef: plan.reference,
    planName: plan.plan_name,
    fiscalYear: plan.fiscal_year,
    event: 'ACTIVATED',
    triggeredBy: req.user.name || req.user.email,
    enrollmentCount: enrollmentSummary.enrolled,
  }).catch(e => console.error('[notifySalesGoalPlanLifecycle ACTIVATED] failed:', e.message));

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

      // Phase SG-4 #21 — keep header status in sync (mirrors current version).
      await incentivePlanService.syncHeaderOnLifecycleChange(plan, { session });
    });
  } finally {
    session.endSession();
  }

  notifySalesGoalPlanLifecycle({
    entityId: plan.entity_id,
    planId: plan._id,
    planRef: plan.reference,
    planName: plan.plan_name,
    fiscalYear: plan.fiscal_year,
    event: 'REOPENED',
    triggeredBy: req.user.name || req.user.email,
  }).catch(e => console.error('[notifySalesGoalPlanLifecycle REOPENED] failed:', e.message));

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

      // Phase SG-4 #21 — mirror CLOSED onto the header (only if this plan is
      // still the header's current version — header doesn't follow superseded
      // versions).
      await incentivePlanService.syncHeaderOnLifecycleChange(plan, { session });
    });
  } finally {
    session.endSession();
  }

  notifySalesGoalPlanLifecycle({
    entityId: plan.entity_id,
    planId: plan._id,
    planRef: plan.reference,
    planName: plan.plan_name,
    fiscalYear: plan.fiscal_year,
    event: 'CLOSED',
    triggeredBy: req.user.name || req.user.email,
  }).catch(e => console.error('[notifySalesGoalPlanLifecycle CLOSED] failed:', e.message));

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

// ─────────────────────────────────────────────────────────────────────────────
// SG-3R — Bulk Excel import of sales goal targets.
//
// Accepts a .xlsx upload (`req.file.buffer`, field name `file`) via multer.
// Two sheets are recognized, both optional (import succeeds if at least one
// has valid rows):
//
//   Sheet "ENTITY" — columns: entity_code (matches Entity.short_name or .code),
//                    sales_target, collection_target (optional; auto-derived
//                    from plan.collection_target_pct if omitted), target_label.
//   Sheet "BDM"    — columns: bdm_code (PeopleMaster.bdm_code or full_name),
//                    sales_target, collection_target (optional), target_label,
//                    territory_code (optional; Territory.territory_code).
//
// Required query/body param: `plan_id` (identifies which plan the targets attach to).
// Approval: gated by gateApproval('SALES_GOAL_PLAN','BULK_TARGETS_IMPORT'); non-
// authorized submitters get HTTP 202 (Approval Hub). Valid rows import atomically
// under one transaction; if ANY row in the valid set fails, the whole transaction
// rolls back and the response lists row-level errors.
//
// Row-level errors are returned as { sheet, row_number, error, raw } so admins
// can correct the spreadsheet and re-upload without re-deriving which row broke.
//
// Scalability: lookup-based resolution of entity_code / bdm_code / territory_code
// means onboarding a new subsidiary requires no code change — populate Entity +
// PeopleMaster and the import works immediately.
// ─────────────────────────────────────────────────────────────────────────────
exports.importTargets = catchAsync(async (req, res) => {
  if (!req.file || !req.file.buffer) {
    return res.status(400).json({ success: false, message: 'Excel file (field `file`) is required' });
  }
  const planId = req.body.plan_id || req.query.plan_id;
  if (!planId) return res.status(400).json({ success: false, message: 'plan_id is required' });

  const plan = await SalesGoalPlan.findById(planId).lean();
  if (!plan) return res.status(404).json({ success: false, message: 'Plan not found' });
  // Subscription safety: refuse to import targets into another entity's plan.
  if (String(plan.entity_id) !== String(req.entityId) && !req.isPresident) {
    return res.status(403).json({ success: false, message: 'Plan belongs to a different entity' });
  }

  // Parse workbook
  let wb;
  try {
    wb = safeXlsxRead(req.file.buffer, { type: 'buffer' });
  } catch (err) {
    return res.status(400).json({ success: false, message: `Could not parse Excel: ${err.message}` });
  }

  const pickSheet = (nameOrNames) => {
    const names = Array.isArray(nameOrNames) ? nameOrNames : [nameOrNames];
    for (const n of names) {
      const hit = wb.SheetNames.find(s => String(s).trim().toLowerCase() === String(n).toLowerCase());
      if (hit) return wb.Sheets[hit];
    }
    return null;
  };
  const entitySheet = pickSheet(['ENTITY', 'entity', 'Entity Targets', 'entity_targets']);
  const bdmSheet = pickSheet(['BDM', 'bdm', 'BDM Targets', 'bdm_targets']);
  if (!entitySheet && !bdmSheet) {
    return res.status(400).json({ success: false, message: 'Workbook must contain at least one of: ENTITY, BDM sheet' });
  }

  const toRows = (sheet) => sheet ? XLSX.utils.sheet_to_json(sheet, { defval: '' }) : [];
  const entityRows = toRows(entitySheet);
  const bdmRows = toRows(bdmSheet);

  // Resolve ALL referenced codes up front so the transaction phase is pure DB writes.
  const entityCodesRaw = entityRows.map(r => String(r.entity_code || r['Entity Code'] || r.code || '').trim()).filter(Boolean);
  const bdmCodesRaw = bdmRows.map(r => String(r.bdm_code || r['BDM Code'] || r.full_name || r['Full Name'] || '').trim()).filter(Boolean);
  const territoryCodesRaw = bdmRows.map(r => String(r.territory_code || r['Territory Code'] || '').trim()).filter(Boolean);

  const [entities, people, territories] = await Promise.all([
    entityCodesRaw.length
      ? Entity.find({
          $or: [
            { short_name: { $in: entityCodesRaw } },
            { entity_name: { $in: entityCodesRaw } },
          ],
        }).select('_id entity_name short_name').lean()
      : [],
    bdmCodesRaw.length
      ? PeopleMaster.find({
          entity_id: plan.entity_id,
          $or: [
            { bdm_code: { $in: bdmCodesRaw } },
            { full_name: { $in: bdmCodesRaw } },
          ],
        }).select('_id user_id bdm_code full_name territory_id').lean()
      : [],
    territoryCodesRaw.length
      ? Territory.find({ entity_id: plan.entity_id, territory_code: { $in: territoryCodesRaw } }).select('_id territory_code').lean()
      : [],
  ]);

  const entityByCode = new Map();
  for (const e of entities) {
    if (e.short_name) entityByCode.set(e.short_name, e);
    if (e.entity_code) entityByCode.set(e.entity_code, e);
    if (e.entity_name) entityByCode.set(e.entity_name, e);
  }
  const personByCode = new Map();
  for (const p of people) {
    if (p.bdm_code) personByCode.set(p.bdm_code, p);
    if (p.full_name) personByCode.set(p.full_name, p);
  }
  const territoryByCode = new Map(territories.map(t => [t.territory_code, t]));

  // Validate rows and build write plan.
  const errors = [];
  const toUpsert = [];
  const collectionPct = Number(plan.collection_target_pct) || 0;

  entityRows.forEach((raw, idx) => {
    const rowNumber = idx + 2;  // +2 for header row + 1-based
    const code = String(raw.entity_code || raw['Entity Code'] || raw.code || '').trim();
    const salesTarget = Number(raw.sales_target || raw['Sales Target'] || 0);
    if (!code) {
      errors.push({ sheet: 'ENTITY', row_number: rowNumber, error: 'entity_code is required', raw });
      return;
    }
    if (!(salesTarget > 0)) {
      errors.push({ sheet: 'ENTITY', row_number: rowNumber, error: 'sales_target must be > 0', raw });
      return;
    }
    const ent = entityByCode.get(code);
    if (!ent) {
      errors.push({ sheet: 'ENTITY', row_number: rowNumber, error: `entity_code "${code}" did not match any Entity (short_name / entity_code / entity_name)`, raw });
      return;
    }
    const explicitCollection = Number(raw.collection_target || raw['Collection Target'] || 0);
    toUpsert.push({
      sheet: 'ENTITY',
      filter: { plan_id: plan._id, target_type: 'ENTITY', target_entity_id: ent._id, bdm_id: null, territory_id: null },
      doc: {
        entity_id: plan.entity_id,
        plan_id: plan._id,
        fiscal_year: plan.fiscal_year,
        target_type: 'ENTITY',
        target_entity_id: ent._id,
        target_label: String(raw.target_label || raw['Label'] || ent.entity_name || ent.short_name || ''),
        sales_target: salesTarget,
        collection_target: explicitCollection > 0 ? explicitCollection : Math.round(salesTarget * collectionPct),
        status: plan.status === 'ACTIVE' ? 'ACTIVE' : 'DRAFT',
        created_by: req.user._id,
      },
    });
  });

  bdmRows.forEach((raw, idx) => {
    const rowNumber = idx + 2;
    const code = String(raw.bdm_code || raw['BDM Code'] || raw.full_name || raw['Full Name'] || '').trim();
    const salesTarget = Number(raw.sales_target || raw['Sales Target'] || 0);
    if (!code) {
      errors.push({ sheet: 'BDM', row_number: rowNumber, error: 'bdm_code (or full_name) is required', raw });
      return;
    }
    if (!(salesTarget > 0)) {
      errors.push({ sheet: 'BDM', row_number: rowNumber, error: 'sales_target must be > 0', raw });
      return;
    }
    const person = personByCode.get(code);
    if (!person) {
      errors.push({ sheet: 'BDM', row_number: rowNumber, error: `bdm_code "${code}" did not match any active PeopleMaster row in this entity`, raw });
      return;
    }
    const territoryCode = String(raw.territory_code || raw['Territory Code'] || '').trim();
    let territoryId = person.territory_id || null;
    if (territoryCode) {
      const t = territoryByCode.get(territoryCode);
      if (!t) {
        errors.push({ sheet: 'BDM', row_number: rowNumber, error: `territory_code "${territoryCode}" did not match any Territory in this entity`, raw });
        return;
      }
      territoryId = t._id;
    }
    const explicitCollection = Number(raw.collection_target || raw['Collection Target'] || 0);
    toUpsert.push({
      sheet: 'BDM',
      filter: { plan_id: plan._id, target_type: 'BDM', bdm_id: person.user_id || null, target_entity_id: null, territory_id: null },
      doc: {
        entity_id: plan.entity_id,
        plan_id: plan._id,
        fiscal_year: plan.fiscal_year,
        target_type: 'BDM',
        bdm_id: person.user_id || null,
        person_id: person._id,
        territory_id: territoryId || null,
        target_label: String(raw.target_label || raw['Label'] || person.full_name || ''),
        sales_target: salesTarget,
        collection_target: explicitCollection > 0 ? explicitCollection : Math.round(salesTarget * collectionPct),
        status: plan.status === 'ACTIVE' ? 'ACTIVE' : 'DRAFT',
        created_by: req.user._id,
      },
    });
  });

  // If every row is invalid, don't even try to import — nothing to do.
  if (toUpsert.length === 0) {
    return res.status(400).json({
      success: false,
      message: `No valid rows to import. ${errors.length} row(s) had errors.`,
      errors,
    });
  }

  // Approval gate — amount = total sales target of valid rows (same semantics as bulkCreateTargets).
  const totalSalesTarget = toUpsert.reduce((s, u) => s + (Number(u.doc.sales_target) || 0), 0);
  const gated = await gateApproval({
    entityId: plan.entity_id,
    module: 'SALES_GOAL_PLAN',
    docType: 'BULK_TARGETS_IMPORT',
    docId: plan._id,
    docRef: plan.reference || `${plan.plan_name} FY${plan.fiscal_year}`,
    amount: totalSalesTarget,
    description: `Excel import: ${toUpsert.length} target row(s) under ${plan.plan_name} FY${plan.fiscal_year} (total ₱${totalSalesTarget.toLocaleString()})`,
    requesterId: req.user._id,
    requesterName: req.user.name || req.user.email,
  }, res);
  if (gated) return;

  // Atomic upsert under a transaction. If ANY upsert throws, the whole import rolls back.
  const imported = [];
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      for (const u of toUpsert) {
        const target = await SalesGoalTarget.findOneAndUpdate(
          u.filter,
          { $set: u.doc },
          { upsert: true, new: true, session }
        );
        imported.push(target);
      }
      await ErpAuditLog.logChange([{
        entity_id: plan.entity_id,
        log_type: 'STATUS_CHANGE',
        target_ref: plan._id.toString(),
        target_model: 'SalesGoalPlan',
        field_changed: 'targets_excel_import',
        old_value: null,
        new_value: `${imported.length} targets imported`,
        changed_by: req.user._id,
        note: `Excel import under ${plan.reference || plan.plan_name}: ${imported.length} valid row(s), ${errors.length} invalid (total ₱${totalSalesTarget.toLocaleString()}). File: ${req.file.originalname || 'upload.xlsx'}`,
      }], { session });
    });
  } finally {
    session.endSession();
  }

  res.json({
    success: true,
    message: `${imported.length} target(s) imported${errors.length ? `, ${errors.length} row(s) skipped` : ''}`,
    data: imported,
    imported_count: imported.length,
    error_count: errors.length,
    errors,
  });
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
    // SG-5 #25 — expose accelerator so the Incentive Tracker can render
    // the multiplier badge + effective (accelerated) payout preview.
    accelerator_factor: t.accelerator_factor ?? 1.0,
    effective_budget: Math.round((Number(t.budget_per_bdm) || 0) * (Number(t.accelerator_factor) || 1.0)),
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

// ─────────────────────────────────────────────────────────────────────────────
// SG-4 #21 — Plan versioning endpoints.
//
// Versioning is opt-in: pre-SG-4 plans continue working as v1 (lazy header
// backfill). New endpoints add the ability to spawn v2, v3, ... when mid-year
// revisions happen — historical KpiSnapshot/IncentivePayout rows stay tied to
// the version that was active when they were written.
// ─────────────────────────────────────────────────────────────────────────────

// GET /sales-goals/plans/:id/versions — list every version of the logical plan
// owned by the same IncentivePlan header. Used by the SalesGoalSetup UI to
// render a version-history strip + "active" badge.
exports.listPlanVersions = catchAsync(async (req, res) => {
  const plan = await SalesGoalPlan.findById(req.params.id);
  if (!plan) return res.status(404).json({ success: false, message: 'Plan not found' });

  // Lazy-backfill the header if missing (legacy row).
  const { header } = await incentivePlanService.ensureHeader(plan, { persist: true });
  const versions = await incentivePlanService.listVersions(header._id);

  res.json({
    success: true,
    data: {
      header: {
        _id: header._id,
        entity_id: header.entity_id,
        fiscal_year: header.fiscal_year,
        plan_name: header.plan_name,
        current_version_no: header.current_version_no,
        current_version_id: header.current_version_id,
        status: header.status,
      },
      versions,
    },
  });
});

// POST /sales-goals/plans/:id/new-version — mint v(N+1) copying from the
// supplied basis plan id. Body may override any of: { plan_name,
// baseline_revenue, target_revenue, collection_target_pct, growth_drivers,
// incentive_programs, effective_from }.
//
// Gated by gateApproval('SALES_GOAL_PLAN', 'PLAN_NEW_VERSION') — non-authorized
// submitters routed to Approval Hub. New version starts in DRAFT — operator
// must POST /activate separately, which is *also* gated. Two gates by design
// because creating a draft is reversible (delete) but activation supersedes
// the prior version's effective range.
exports.createNewVersion = catchAsync(async (req, res) => {
  const basis = await SalesGoalPlan.findById(req.params.id);
  if (!basis) return res.status(404).json({ success: false, message: 'Basis plan not found' });

  // Only the latest version may be the basis (refused inside the service too,
  // but cheap to pre-check here for a clearer error).
  const { header } = await incentivePlanService.ensureHeader(basis, { persist: true });
  const latestNewer = await SalesGoalPlan.findOne({
    incentive_plan_id: header._id,
    version_no: { $gt: basis.version_no || 1 },
  }).select('version_no').lean();
  if (latestNewer) {
    return res.status(400).json({
      success: false,
      message: `Cannot create new version from v${basis.version_no || 1} — v${latestNewer.version_no} already exists`,
    });
  }

  const gated = await gateApproval({
    entityId: basis.entity_id,
    module: 'SALES_GOAL_PLAN',
    docType: 'PLAN_NEW_VERSION',
    docId: basis._id,
    docRef: basis.reference || `${basis.plan_name} FY${basis.fiscal_year}`,
    amount: basis.target_revenue || 0,
    description: `Create new version (v${(basis.version_no || 1) + 1}) of ${basis.plan_name} FY${basis.fiscal_year}`,
    requesterId: req.user._id,
    requesterName: req.user.name || req.user.email,
  }, res);
  if (gated) return;

  let newPlan;
  try {
    newPlan = await incentivePlanService.createNewVersion({
      basisPlanId: basis._id,
      body: req.body || {},
      userId: req.user._id,
    });
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }

  await ErpAuditLog.logChange({
    entity_id: basis.entity_id,
    log_type: 'STATUS_CHANGE',
    target_ref: newPlan._id.toString(),
    target_model: 'SalesGoalPlan',
    field_changed: 'version_no',
    old_value: String(basis.version_no || 1),
    new_value: String(newPlan.version_no),
    changed_by: req.user._id,
    note: `Created new plan version v${newPlan.version_no} from v${basis.version_no || 1} (${basis.reference || basis.plan_name})`,
  });

  res.status(201).json({
    success: true,
    data: newPlan,
    message: `Plan v${newPlan.version_no} created in DRAFT — activate to supersede v${basis.version_no || 1}`,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SG-3R — President-Reverse on a Sales Goal plan.
//
// Reuses `buildPresidentReverseHandler('SALES_GOAL_PLAN')` — the same factory
// used by Sales/Collection/Expense/PRF-CALF/GRN/IC-Transfer/PettyCash/Payslip.
// UX contract: body = { reason: string, confirm: 'DELETE' }. Cascade logic
// lives in `documentReversalService.reverseSalesGoalPlan`. Route must be gated
// by `erpSubAccessCheck('accounting', 'reverse_posted')` — the baseline danger
// sub-perm (lookup-driven, subscriber-extendable).
// ─────────────────────────────────────────────────────────────────────────────
const { buildPresidentReverseHandler } = require('../services/documentReversalService');
exports.presidentReversePlan = buildPresidentReverseHandler('SALES_GOAL_PLAN');

// ─────────────────────────────────────────────────────────────────────────────
// SG-5 #26 — What-if / scenario modeling endpoint.
//
// POST /sales-goals/plans/:id/simulate
// Body: { target_revenue_override?, baseline_override?, driver_weight_overrides?,
//         tier_attainment_overrides? }
//
// Pure read + compute — no DB writes, no journal post, no approval gate. Any
// user with sales_goals VIEW can exercise the modeler; privileged roles see
// all BDMs in the output while contractors see only themselves (scope-filter
// applied post-compute so the math is always full-company).
// ─────────────────────────────────────────────────────────────────────────────
exports.simulatePlan = catchAsync(async (req, res) => {
  const plan = await SalesGoalPlan.findById(req.params.id).lean();
  if (!plan) return res.status(404).json({ success: false, message: 'Plan not found' });

  // Enforce entity scope — even president/admin are pinned to their current
  // req.entityId unless they switched context via the entity switcher.
  if (!req.isPresident && String(plan.entity_id) !== String(req.entityId)) {
    return res.status(403).json({ success: false, message: 'Plan is in a different entity' });
  }

  const overrides = req.body || {};
  const result = await salesGoalService.simulatePlanSnapshots(plan, overrides);

  // BDM scoping (Rule #21 alignment): contractors see only their own row.
  const canSeeAll = req.isPresident || req.isAdmin || req.isFinance;
  const rows = canSeeAll
    ? result.rows
    : result.rows.filter(r => String(r.bdm_id) === String(req.user._id));

  res.json({
    success: true,
    data: {
      plan: {
        _id: plan._id,
        plan_name: plan.plan_name,
        fiscal_year: plan.fiscal_year,
        reference: plan.reference || '',
        status: plan.status,
      },
      plan_overrides: result.plan_overrides,
      drivers: result.drivers,
      rows,
      summary: canSeeAll
        ? result.summary
        : {
          // BDM-scoped summary only reflects their own row.
          bdm_count: rows.length,
          current: {
            total_incentive_budget: rows.reduce((s, r) => s + r.tier_budget_current, 0),
            total_actual_revenue: rows.reduce((s, r) => s + r.sales_actual, 0),
            attainment_pct: rows[0]?.attainment_current || 0,
          },
          scenario: {
            total_incentive_budget: rows.reduce((s, r) => s + r.tier_budget_scenario, 0),
            total_actual_revenue: rows.reduce((s, r) => s + r.sales_actual, 0),
            attainment_pct: rows[0]?.attainment_scenario || 0,
          },
          diff: {
            total_incentive_budget: rows.reduce((s, r) => s + r.budget_delta, 0),
          },
        },
      config: result.config,
      tiers: result.tiers,
    },
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SG-5 #28 — Year-over-Year / Quarter-over-Quarter trending endpoint.
//
// GET /sales-goals/trending?fiscal_year=&bdm_id=&kpi_code=
//
// Joins the current fiscal year's YTD KpiSnapshot with prior fiscal year(s) by
// (bdm_id, kpi_code) so the dashboard can render a "2025 vs 2026" comparison.
// Plan-version-aware (SG-4 #21): snapshots are keyed by plan_id which in turn
// belongs to a specific IncentivePlan version, so YoY comparisons implicitly
// use each year's active version at the time the snapshot was written.
//
// Output structure:
//   {
//     fiscal_year_current: 2026,
//     fiscal_year_prior:   2025,
//     company: { revenue: {current, prior, delta_pct}, attainment: {...} },
//     per_bdm: [{ bdm_id, name, current_revenue, prior_revenue, delta_pct,
//                 current_attainment, prior_attainment, kpi_trends: [...] }],
//     per_kpi: [{ kpi_code, kpi_label, current_avg, prior_avg, delta_pct }],
//   }
// ─────────────────────────────────────────────────────────────────────────────
exports.getTrending = catchAsync(async (req, res) => {
  const fiscalYear = Number(req.query.fiscal_year) || new Date().getFullYear();
  const priorYear = fiscalYear - 1;
  const entityId = req.entityId;

  const canSeeAll = req.isPresident || req.isAdmin || req.isFinance;
  const bdmScope = canSeeAll && req.query.bdm_id
    ? req.query.bdm_id
    : (canSeeAll ? null : req.user._id);

  // Snapshots for both years — YTD only (annual roll-up is the comparable unit).
  const match = {
    entity_id: new mongoose.Types.ObjectId(entityId),
    period_type: 'YTD',
    fiscal_year: { $in: [fiscalYear, priorYear] },
  };
  if (bdmScope) match.bdm_id = new mongoose.Types.ObjectId(bdmScope);

  const snapshots = await KpiSnapshot.find(match)
    .populate('person_id', 'full_name bdm_code is_active')
    .lean();

  // Bucket by (bdm_id, fiscal_year)
  const byBdm = new Map();
  for (const s of snapshots) {
    if (s.person_id && s.person_id.is_active === false) continue;
    const bdmKey = String(s.bdm_id || '');
    if (!byBdm.has(bdmKey)) {
      byBdm.set(bdmKey, {
        bdm_id: s.bdm_id,
        name: s.person_id?.full_name || 'Unknown',
        bdm_code: s.person_id?.bdm_code || '',
        years: new Map(),
      });
    }
    byBdm.get(bdmKey).years.set(s.fiscal_year, s);
  }

  const filterKpiCode = req.query.kpi_code ? String(req.query.kpi_code).toUpperCase() : null;

  // Per-BDM rows
  const perBdm = [];
  let companyCurrent = 0;
  let companyPrior = 0;
  let companyCurrentAtt = 0;
  let companyPriorAtt = 0;
  let companyCurrentCount = 0;
  let companyPriorCount = 0;

  for (const { bdm_id, name, bdm_code, years } of byBdm.values()) {
    const cur = years.get(fiscalYear);
    const prior = years.get(priorYear);

    const curRev = Number(cur?.sales_actual) || 0;
    const priorRev = Number(prior?.sales_actual) || 0;
    const curAtt = Number(cur?.sales_attainment_pct) || 0;
    const priorAtt = Number(prior?.sales_attainment_pct) || 0;

    companyCurrent += curRev;
    companyPrior += priorRev;
    if (cur) { companyCurrentAtt += curAtt; companyCurrentCount++; }
    if (prior) { companyPriorAtt += priorAtt; companyPriorCount++; }

    // Per-KPI comparison — joined by kpi_code across both years
    const curKpiMap = new Map();
    for (const d of (cur?.driver_kpis || [])) {
      for (const k of (d.kpis || [])) {
        if (filterKpiCode && String(k.kpi_code).toUpperCase() !== filterKpiCode) continue;
        curKpiMap.set(String(k.kpi_code).toUpperCase(), k);
      }
    }
    const priorKpiMap = new Map();
    for (const d of (prior?.driver_kpis || [])) {
      for (const k of (d.kpis || [])) {
        if (filterKpiCode && String(k.kpi_code).toUpperCase() !== filterKpiCode) continue;
        priorKpiMap.set(String(k.kpi_code).toUpperCase(), k);
      }
    }
    const allKpiCodes = new Set([...curKpiMap.keys(), ...priorKpiMap.keys()]);
    const kpiTrends = [];
    for (const code of allKpiCodes) {
      const curK = curKpiMap.get(code);
      const priorK = priorKpiMap.get(code);
      kpiTrends.push({
        kpi_code: code,
        kpi_label: curK?.kpi_label || priorK?.kpi_label || code,
        current_value: Number(curK?.actual_value) || 0,
        prior_value: Number(priorK?.actual_value) || 0,
        current_attainment: Number(curK?.attainment_pct) || 0,
        prior_attainment: Number(priorK?.attainment_pct) || 0,
      });
    }

    perBdm.push({
      bdm_id,
      name,
      bdm_code,
      current_revenue: curRev,
      prior_revenue: priorRev,
      revenue_delta: curRev - priorRev,
      revenue_delta_pct: priorRev > 0 ? Math.round(((curRev - priorRev) / priorRev) * 1000) / 10 : 0,
      current_attainment: curAtt,
      prior_attainment: priorAtt,
      attainment_delta: curAtt - priorAtt,
      kpi_trends: kpiTrends,
    });
  }

  // Aggregate per-KPI across BDMs
  const perKpiMap = new Map();
  for (const row of perBdm) {
    for (const k of row.kpi_trends) {
      if (!perKpiMap.has(k.kpi_code)) {
        perKpiMap.set(k.kpi_code, {
          kpi_code: k.kpi_code,
          kpi_label: k.kpi_label,
          current_sum: 0, prior_sum: 0,
          current_count: 0, prior_count: 0,
        });
      }
      const agg = perKpiMap.get(k.kpi_code);
      if (k.current_value || k.current_attainment) { agg.current_sum += k.current_value; agg.current_count++; }
      if (k.prior_value || k.prior_attainment) { agg.prior_sum += k.prior_value; agg.prior_count++; }
    }
  }
  const perKpi = [...perKpiMap.values()].map(a => {
    const curAvg = a.current_count > 0 ? a.current_sum / a.current_count : 0;
    const priorAvg = a.prior_count > 0 ? a.prior_sum / a.prior_count : 0;
    return {
      kpi_code: a.kpi_code,
      kpi_label: a.kpi_label,
      current_avg: Math.round(curAvg * 100) / 100,
      prior_avg: Math.round(priorAvg * 100) / 100,
      delta_pct: priorAvg > 0 ? Math.round(((curAvg - priorAvg) / priorAvg) * 1000) / 10 : 0,
    };
  });

  res.json({
    success: true,
    data: {
      fiscal_year_current: fiscalYear,
      fiscal_year_prior: priorYear,
      company: {
        revenue: {
          current: companyCurrent,
          prior: companyPrior,
          delta_pct: companyPrior > 0 ? Math.round(((companyCurrent - companyPrior) / companyPrior) * 1000) / 10 : 0,
        },
        attainment: {
          current: companyCurrentCount > 0 ? Math.round((companyCurrentAtt / companyCurrentCount) * 10) / 10 : 0,
          prior: companyPriorCount > 0 ? Math.round((companyPriorAtt / companyPriorCount) * 10) / 10 : 0,
        },
        bdm_count_current: companyCurrentCount,
        bdm_count_prior: companyPriorCount,
      },
      per_bdm: perBdm,
      per_kpi: perKpi,
    },
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SG-5 #27 — Variance Alert Center endpoints.
// Implemented in backend/erp/controllers/varianceAlertController.js (sibling
// file) to keep controller sizes manageable. Exports re-declared there.
// ─────────────────────────────────────────────────────────────────────────────
