const SalesLine = require('../models/SalesLine');
const Collection = require('../models/Collection');
const Hospital = require('../models/Hospital');
const InventoryLedger = require('../models/InventoryLedger');
const ProductMaster = require('../models/ProductMaster');
const Visit = require('../../models/Visit');
const Doctor = require('../../models/Doctor');
const Lookup = require('../models/Lookup');
const SalesGoalTarget = require('../models/SalesGoalTarget');
const KpiSnapshot = require('../models/KpiSnapshot');
const ActionItem = require('../models/ActionItem');

/**
 * Sales Goal Service — Phase 28
 * KPI computation engine. Reads from existing ERP models (no data duplication).
 * All configuration from Lookup tables (zero hardcoding).
 */

// ═══ Config helpers ═══

/**
 * Read GOAL_CONFIG Lookup entries for entity, return as key→value map.
 */
async function getGoalConfig(entityId) {
  const entries = await Lookup.find({
    entity_id: entityId,
    category: 'GOAL_CONFIG',
    is_active: true,
  }).lean();
  const config = {};
  for (const e of entries) {
    config[e.code] = e.metadata?.value ?? e.label;
  }
  return config;
}

/**
 * Read INCENTIVE_TIER Lookup entries, sorted by attainment_min descending.
 */
async function getIncentiveTiers(entityId) {
  const entries = await Lookup.find({
    entity_id: entityId,
    category: 'INCENTIVE_TIER',
    is_active: true,
  }).lean();
  return entries
    .map(e => ({
      code: e.code,
      label: e.label,
      attainment_min: e.metadata?.attainment_min ?? 0,
      budget_per_bdm: e.metadata?.budget_per_bdm ?? 0,
      reward_description: e.metadata?.reward_description ?? '',
      bg_color: e.metadata?.bg_color ?? '',
      text_color: e.metadata?.text_color ?? '',
    }))
    .sort((a, b) => b.attainment_min - a.attainment_min); // highest first
}

/**
 * Match attainment % to highest qualifying tier.
 */
function computeIncentiveTier(attainmentPct, tiers) {
  for (const tier of tiers) {
    if (attainmentPct >= tier.attainment_min) {
      return tier;
    }
  }
  return null;
}

/**
 * Project annualized attainment and match to tier.
 */
function computeProjectedTier(actual, target, monthsElapsed, totalMonths, tiers) {
  if (monthsElapsed <= 0 || target <= 0) return null;
  const annualized = (actual / monthsElapsed) * totalMonths;
  const projectedPct = Math.round((annualized / target) * 100);
  return computeIncentiveTier(projectedPct, tiers);
}

// ═══ Date helpers ═══

function fiscalYearRange(fiscalYear, fiscalStartMonth = 1) {
  const start = new Date(fiscalYear, fiscalStartMonth - 1, 1);
  const end = new Date(fiscalYear + (fiscalStartMonth > 1 ? 1 : 0), fiscalStartMonth === 1 ? 11 : fiscalStartMonth - 2, 31, 23, 59, 59, 999);
  if (fiscalStartMonth === 1) {
    end.setFullYear(fiscalYear);
    end.setMonth(11);
    end.setDate(31);
  }
  return { start, end };
}

function monthRange(period) {
  const [y, m] = period.split('-').map(Number);
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 0, 23, 59, 59, 999);
  return { start, end };
}

// ═══ Auto KPI Computation ═══

/**
 * Compute auto KPI value based on kpi_code.
 * Reads from existing ERP models — zero data duplication.
 */
async function getAutoKpiValue(kpiCode, entityId, bdmId, startDate, endDate) {
  switch (kpiCode) {
    case 'PCT_HOSP_ACCREDITED': {
      const tagged = await Hospital.find({
        'tagged_bdms.bdm_id': bdmId,
        'tagged_bdms.is_active': true,
        status: 'ACTIVE',
      }).select('engagement_level').lean();
      if (tagged.length === 0) return 0;
      const config = await getGoalConfig(entityId);
      const threshold = config.ACCREDITATION_LEVEL;
      const accredited = tagged.filter(h => (h.engagement_level || 0) >= threshold).length;
      return Math.round((accredited / tagged.length) * 100);
    }

    case 'REV_PER_ACCREDITED_HOSP': {
      const config = await getGoalConfig(entityId);
      const threshold = config.ACCREDITATION_LEVEL;
      const accreditedHosps = await Hospital.find({
        'tagged_bdms.bdm_id': bdmId,
        'tagged_bdms.is_active': true,
        status: 'ACTIVE',
        engagement_level: { $gte: threshold },
      }).select('_id').lean();
      if (accreditedHosps.length === 0) return 0;
      const hospIds = accreditedHosps.map(h => h._id);
      const salesAgg = await SalesLine.aggregate([
        { $match: { entity_id: entityId, bdm_id: bdmId, status: 'POSTED', hospital_id: { $in: hospIds }, csi_date: { $gte: startDate, $lte: endDate } } },
        { $group: { _id: null, total: { $sum: '$invoice_total' } } },
      ]);
      return Math.round((salesAgg[0]?.total || 0) / accreditedHosps.length);
    }

    case 'SKUS_LISTED_PER_HOSP': {
      const agg = await SalesLine.aggregate([
        { $match: { entity_id: entityId, bdm_id: bdmId, status: 'POSTED', csi_date: { $gte: startDate, $lte: endDate } } },
        { $unwind: '$line_items' },
        { $group: { _id: '$hospital_id', skus: { $addToSet: '$line_items.product_id' } } },
        { $project: { skuCount: { $size: '$skus' } } },
        { $group: { _id: null, avgSkus: { $avg: '$skuCount' } } },
      ]);
      return Math.round(agg[0]?.avgSkus || 0);
    }

    case 'LOST_SALES_INCIDENTS': {
      const agg = await InventoryLedger.aggregate([
        { $match: { entity_id: entityId, transaction_date: { $gte: startDate, $lte: endDate }, running_balance: { $lte: 0 } } },
        { $group: { _id: null, count: { $sum: 1 } } },
      ]);
      return agg[0]?.count || 0;
    }

    case 'INVENTORY_TURNOVER': {
      const cogsAgg = await SalesLine.aggregate([
        { $match: { entity_id: entityId, bdm_id: bdmId, status: 'POSTED', csi_date: { $gte: startDate, $lte: endDate } } },
        { $unwind: '$line_items' },
        { $group: { _id: null, cogs: { $sum: { $multiply: ['$line_items.qty', { $ifNull: ['$line_items.purchase_price', 0] }] } } } },
      ]);
      const cogs = cogsAgg[0]?.cogs || 0;
      const invAgg = await InventoryLedger.aggregate([
        { $match: { entity_id: entityId } },
        { $group: { _id: '$product_id', avgVal: { $avg: { $multiply: ['$running_balance', { $ifNull: ['$unit_cost', 0] }] } } } },
        { $group: { _id: null, totalAvgInv: { $sum: '$avgVal' } } },
      ]);
      const avgInv = invAgg[0]?.totalAvgInv || 1;
      return Math.round((cogs / avgInv) * 100) / 100;
    }

    case 'MD_ENGAGEMENT_COVERAGE': {
      const assigned = await Doctor.countDocuments({ assignedTo: bdmId, isActive: true });
      if (assigned === 0) return 0;
      const visited = await Visit.distinct('doctor', {
        user: bdmId,
        visitDate: { $gte: startDate, $lte: endDate },
      });
      return Math.min(100, Math.round((visited.length / assigned) * 100));
    }

    case 'MONTHLY_REORDER_FREQ': {
      const agg = await SalesLine.aggregate([
        { $match: { entity_id: entityId, bdm_id: bdmId, status: 'POSTED', csi_date: { $gte: startDate, $lte: endDate } } },
        { $group: { _id: { hospital: '$hospital_id', month: { $month: '$csi_date' } } } },
        { $group: { _id: '$_id.hospital', monthCount: { $sum: 1 } } },
        { $match: { monthCount: { $gte: 2 } } },
        { $count: 'repeatHospitals' },
      ]);
      return agg[0]?.repeatHospitals || 0;
    }

    case 'EXPIRY_RETURNS': {
      const agg = await InventoryLedger.aggregate([
        { $match: { entity_id: entityId, transaction_type: 'RETURN_IN', transaction_date: { $gte: startDate, $lte: endDate } } },
        { $group: { _id: null, total: { $sum: '$qty_in' } } },
      ]);
      return agg[0]?.total || 0;
    }

    case 'GROSS_MARGIN_PER_SKU': {
      const products = await ProductMaster.find({
        entity_id: entityId,
        is_active: true,
        selling_price: { $gt: 0 },
      }).select('selling_price purchase_price').lean();
      if (products.length === 0) return 0;
      const totalMargin = products.reduce((sum, p) => {
        const margin = ((p.selling_price - (p.purchase_price || 0)) / p.selling_price) * 100;
        return sum + margin;
      }, 0);
      return Math.round((totalMargin / products.length) * 10) / 10;
    }

    case 'VOLUME_RETENTION_POST_INCREASE': {
      // Compare current period qty vs prior period for products with price > purchase
      return 0; // Complex — requires price change history, return 0 for now (manual entry fallback)
    }

    default:
      return 0;
  }
}

// ═══ Snapshot Computation ═══

/**
 * Compute KPI snapshot for a single BDM in a period.
 */
async function computeBdmSnapshot(entityId, plan, bdmId, personId, territoryId, period, periodType) {
  const isYTD = periodType === 'YTD';
  const config = await getGoalConfig(entityId);
  const fiscalStart = config.FISCAL_START_MONTH;

  let startDate, endDate;
  if (isYTD) {
    const range = fiscalYearRange(plan.fiscal_year, fiscalStart);
    startDate = range.start;
    endDate = new Date(); // up to now
  } else {
    const range = monthRange(period);
    startDate = range.start;
    endDate = range.end;
  }

  // Get target for this BDM
  const target = await SalesGoalTarget.findOne({
    plan_id: plan._id,
    target_type: 'BDM',
    bdm_id: bdmId,
    status: 'ACTIVE',
  }).lean();

  const salesTarget = target?.sales_target || 0;
  const collectionTarget = target?.collection_target || 0;

  // Sales actual
  const salesAgg = await SalesLine.aggregate([
    { $match: { entity_id: entityId, bdm_id: bdmId, status: 'POSTED', csi_date: { $gte: startDate, $lte: endDate } } },
    { $group: { _id: null, total: { $sum: '$invoice_total' }, count: { $sum: 1 } } },
  ]);
  const salesActual = salesAgg[0]?.total || 0;

  // Collections actual
  const collAgg = await Collection.aggregate([
    { $match: { entity_id: entityId, bdm_id: bdmId, status: 'POSTED', cr_date: { $gte: startDate, $lte: endDate } } },
    { $group: { _id: null, total: { $sum: '$cr_amount' } } },
  ]);
  const collectionsActual = collAgg[0]?.total || 0;

  const salesAttainmentPct = salesTarget > 0 ? Math.round((salesActual / salesTarget) * 100) : 0;
  const collectionAttainmentPct = collectionTarget > 0 ? Math.round((collectionsActual / collectionTarget) * 100) : 0;
  const collectionRatePct = salesActual > 0 ? Math.round((collectionsActual / salesActual) * 100) : 0;

  // Per-driver KPIs
  const driverKpis = [];
  for (const driver of (plan.growth_drivers || [])) {
    const kpis = [];
    for (const kpiDef of (driver.kpi_definitions || [])) {
      let actualValue = 0;
      if (kpiDef.computation === 'auto') {
        actualValue = await getAutoKpiValue(kpiDef.kpi_code, entityId, bdmId, startDate, endDate);
      }
      // For manual KPIs, check if there's an existing snapshot with manual data
      if (kpiDef.computation === 'manual') {
        const existing = await KpiSnapshot.findOne({
          plan_id: plan._id, bdm_id: bdmId, period, period_type: periodType,
        }).lean();
        const existingDriver = existing?.driver_kpis?.find(d => d.driver_code === driver.driver_code);
        const existingKpi = existingDriver?.kpis?.find(k => k.kpi_code === kpiDef.kpi_code && k.data_source === 'manual');
        if (existingKpi) actualValue = existingKpi.actual_value;
      }

      const targetVal = kpiDef.target_value || 0;
      const attainment = targetVal > 0
        ? (kpiDef.direction === 'lower_better'
          ? Math.round((targetVal / Math.max(actualValue, 1)) * 100)
          : Math.round((actualValue / targetVal) * 100))
        : 0;

      kpis.push({
        kpi_code: kpiDef.kpi_code,
        kpi_label: kpiDef.kpi_label || '',
        target_value: targetVal,
        actual_value: actualValue,
        attainment_pct: attainment,
        data_source: kpiDef.computation,
      });
    }
    driverKpis.push({ driver_code: driver.driver_code, kpis });
  }

  // Incentive tier computation
  const tiers = await getIncentiveTiers(entityId);
  const incentiveStatus = [];
  for (const prog of (plan.incentive_programs || [])) {
    let qualifyingAmount = salesTarget;
    let actualAmount = salesActual;
    if (prog.qualification_metric === 'collections') {
      qualifyingAmount = collectionTarget;
      actualAmount = collectionsActual;
    }
    const attainmentPct = qualifyingAmount > 0 ? Math.round((actualAmount / qualifyingAmount) * 100) : 0;

    let currentTier = null;
    let projectedTier = null;
    if (prog.use_tiers && tiers.length > 0) {
      currentTier = computeIncentiveTier(attainmentPct, tiers);
      // Projected: how many months have elapsed in fiscal year?
      const now = new Date();
      const fyStart = new Date(plan.fiscal_year, (config.FISCAL_START_MONTH) - 1, 1);
      const monthsElapsed = Math.max(1, (now.getFullYear() - fyStart.getFullYear()) * 12 + now.getMonth() - fyStart.getMonth() + 1);
      projectedTier = computeProjectedTier(actualAmount, qualifyingAmount, monthsElapsed, 12, tiers);
    }

    incentiveStatus.push({
      program_code: prog.program_code,
      qualifying_amount: qualifyingAmount,
      actual_amount: actualAmount,
      attainment_pct: attainmentPct,
      tier_code: currentTier?.code || '',
      tier_label: currentTier?.label || '',
      tier_budget: currentTier?.budget_per_bdm || 0,
      projected_tier_code: projectedTier?.code || '',
      projected_tier_label: projectedTier?.label || '',
      projected_tier_budget: projectedTier?.budget_per_bdm || 0,
      qualified: attainmentPct >= 100,
    });
  }

  // Action items summary
  const actionsTotal = await ActionItem.countDocuments({ plan_id: plan._id, bdm_id: bdmId, status: { $nin: ['CANCELLED'] } });
  const actionsCompleted = await ActionItem.countDocuments({ plan_id: plan._id, bdm_id: bdmId, status: 'DONE' });

  // Upsert snapshot
  return KpiSnapshot.findOneAndUpdate(
    { entity_id: entityId, plan_id: plan._id, bdm_id: bdmId, period, period_type: periodType },
    {
      $set: {
        fiscal_year: plan.fiscal_year,
        person_id: personId,
        territory_id: territoryId,
        sales_actual: salesActual,
        collections_actual: collectionsActual,
        collection_rate_pct: collectionRatePct,
        sales_target: salesTarget,
        sales_attainment_pct: salesAttainmentPct,
        collection_target: collectionTarget,
        collection_attainment_pct: collectionAttainmentPct,
        driver_kpis: driverKpis,
        incentive_status: incentiveStatus,
        actions_total: actionsTotal,
        actions_completed: actionsCompleted,
        computed_at: new Date(),
        computed_by: 'system',
      },
    },
    { upsert: true, new: true }
  );
}

/**
 * Compute snapshots for all BDMs in a plan.
 */
async function computeAllSnapshots(plan, period, periodType) {
  const targets = await SalesGoalTarget.find({
    plan_id: plan._id,
    target_type: 'BDM',
    status: 'ACTIVE',
  }).lean();

  const results = [];
  for (const t of targets) {
    if (!t.bdm_id) continue;
    const snap = await computeBdmSnapshot(
      t.entity_id, plan, t.bdm_id, t.person_id, t.territory_id, period, periodType
    );
    results.push({
      bdm_id: t.bdm_id,
      target_label: t.target_label,
      sales_attainment_pct: snap.sales_attainment_pct,
    });
  }
  return results;
}

/**
 * Get incentive budget advisor data (P&L-based).
 */
async function getIncentiveBudgetAdvisor(entityId, plan) {
  const config = await getGoalConfig(entityId);
  const tiers = await getIncentiveTiers(entityId);
  const { start, end } = fiscalYearRange(plan.fiscal_year, config.FISCAL_START_MONTH);

  // Total sales YTD
  const salesAgg = await SalesLine.aggregate([
    { $match: { entity_id: entityId, status: 'POSTED', csi_date: { $gte: start, $lte: new Date() } } },
    { $group: { _id: null, revenue: { $sum: '$invoice_total' } } },
  ]);
  const revenueYTD = salesAgg[0]?.revenue || 0;

  // Compute each BDM's current tier
  const snapshots = await KpiSnapshot.find({
    plan_id: plan._id,
    period_type: 'YTD',
  }).lean();

  let totalIncentiveSpend = 0;
  for (const snap of snapshots) {
    const is = snap.incentive_status?.[0];
    if (is) totalIncentiveSpend += is.tier_budget;
  }

  const incentiveToRevenueRatio = revenueYTD > 0
    ? Math.round((totalIncentiveSpend / revenueYTD) * 10000) / 100
    : 0;

  return {
    revenue_ytd: revenueYTD,
    total_incentive_spend: totalIncentiveSpend,
    incentive_to_revenue_pct: incentiveToRevenueRatio,
    bdm_count: snapshots.length,
    tiers: tiers.map(t => ({
      ...t,
      bdm_count: snapshots.filter(s => s.incentive_status?.[0]?.tier_code === t.code).length,
    })),
  };
}

module.exports = {
  getGoalConfig,
  getIncentiveTiers,
  computeIncentiveTier,
  computeProjectedTier,
  computeBdmSnapshot,
  computeAllSnapshots,
  getAutoKpiValue,
  getIncentiveBudgetAdvisor,
};
