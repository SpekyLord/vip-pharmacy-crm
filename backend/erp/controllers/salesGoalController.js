const SalesGoalPlan = require('../models/SalesGoalPlan');
const SalesGoalTarget = require('../models/SalesGoalTarget');
const KpiSnapshot = require('../models/KpiSnapshot');
const ActionItem = require('../models/ActionItem');
const Entity = require('../models/Entity');
const PeopleMaster = require('../models/PeopleMaster');
const { catchAsync } = require('../../middleware/errorHandler');
const salesGoalService = require('../services/salesGoalService');

/**
 * Sales Goal Controller — Phase 28
 * CRUD for plans, targets, KPI snapshots, actions, and dashboard endpoints.
 */

function currentPeriod() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
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

  plan.status = 'ACTIVE';
  plan.approved_by = req.user._id;
  plan.approved_at = new Date();
  await plan.save();

  // Activate all targets under this plan
  await SalesGoalTarget.updateMany(
    { plan_id: plan._id, status: 'DRAFT' },
    { $set: { status: 'ACTIVE' } }
  );

  res.json({ success: true, data: plan, message: 'Plan activated' });
});

exports.closePlan = catchAsync(async (req, res) => {
  const plan = await SalesGoalPlan.findById(req.params.id);
  if (!plan) return res.status(404).json({ success: false, message: 'Plan not found' });

  plan.status = 'CLOSED';
  await plan.save();

  await SalesGoalTarget.updateMany(
    { plan_id: plan._id },
    { $set: { status: 'CLOSED' } }
  );

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
  const plan = await SalesGoalPlan.findById(plan_id).lean();
  if (!plan) return res.status(404).json({ success: false, message: 'Plan not found' });

  const results = [];
  for (const t of targets) {
    const collectionTarget = t.collection_target || Math.round(t.sales_target * plan.collection_target_pct);
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
      { upsert: true, new: true }
    );
    results.push(target);
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

  // Compute monthly + YTD
  const monthlyResults = await salesGoalService.computeAllSnapshots(plan, period, 'MONTHLY');
  const ytdResults = await salesGoalService.computeAllSnapshots(plan, String(plan.fiscal_year), 'YTD');

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
  const snapshots = await KpiSnapshot.find({
    plan_id: plan._id,
    period_type: 'YTD',
  })
    .populate('bdm_id', 'name email')
    .populate('person_id', 'full_name bdm_code position')
    .populate('territory_id', 'territory_code territory_name')
    .sort({ sales_attainment_pct: -1 })
    .lean();

  // Entity targets
  const entityTargets = await SalesGoalTarget.find({
    plan_id: plan._id,
    target_type: 'ENTITY',
    status: { $in: ['ACTIVE', 'DRAFT'] },
  })
    .populate('target_entity_id', 'entity_name short_name')
    .lean();

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
        growth_drivers: plan.growth_drivers,
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

  res.json({
    success: true,
    data: { plan, target, person, ytdSnapshot, monthlyHistory, actions, config, tiers },
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

  const snapshots = await KpiSnapshot.find({ plan_id: plan._id, period_type: 'YTD' })
    .populate('person_id', 'full_name bdm_code position')
    .populate('territory_id', 'territory_name')
    .sort({ 'incentive_status.0.attainment_pct': -1 })
    .lean();

  const tiers = await salesGoalService.getIncentiveTiers(req.entityId);
  const advisor = await salesGoalService.getIncentiveBudgetAdvisor(req.entityId, plan);
  const config = await salesGoalService.getGoalConfig(req.entityId);

  const board = snapshots.map(s => ({
    bdm_name: s.person_id?.full_name,
    bdm_code: s.person_id?.bdm_code,
    territory: s.territory_id?.territory_name,
    sales_target: s.sales_target,
    sales_actual: s.sales_actual,
    attainment_pct: s.sales_attainment_pct,
    current_tier: s.incentive_status?.[0]?.tier_label || '',
    current_budget: s.incentive_status?.[0]?.tier_budget || 0,
    projected_tier: s.incentive_status?.[0]?.projected_tier_label || '',
    projected_budget: s.incentive_status?.[0]?.projected_tier_budget || 0,
  }));

  res.json({
    success: true,
    data: {
      plan: { _id: plan._id, plan_name: plan.plan_name, fiscal_year: plan.fiscal_year },
      tiers,
      board,
      advisor,
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
