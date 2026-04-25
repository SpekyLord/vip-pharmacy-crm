/**
 * Expense Anomaly Detection Service — Period-over-period and budget overrun detection
 * Phase 14.3
 */
const mongoose = require('mongoose');
const SmerEntry = require('../models/SmerEntry');
const CarLogbookEntry = require('../models/CarLogbookEntry');
const ExpenseEntry = require('../models/ExpenseEntry');
const Collection = require('../models/Collection');
const BudgetAllocation = require('../models/BudgetAllocation');
const PeopleMaster = require('../models/PeopleMaster');
const Settings = require('../models/Settings');

function periodToDates(period) {
  const [year, month] = period.split('-').map(Number);
  return { start: new Date(year, month - 1, 1), end: new Date(year, month, 1) };
}

function priorPeriod(period) {
  let [year, month] = period.split('-').map(Number);
  month -= 1;
  if (month < 1) { month = 12; year -= 1; }
  return `${year}-${String(month).padStart(2, '0')}`;
}

/**
 * Aggregate a component for a period, grouped by bdm_id
 */
async function aggregateComponent(entityId, period, component) {
  const eId = new mongoose.Types.ObjectId(entityId);
  const { start, end } = periodToDates(period);
  const baseMatch = { entity_id: eId, status: 'POSTED' };

  switch (component) {
    case 'SMER':
      // eslint-disable-next-line vip-tenant/require-entity-filter -- entity_id present via ...baseMatch spread (linter can't trace spread)
      return SmerEntry.aggregate([
        { $match: { ...baseMatch, period } },
        { $group: { _id: '$bdm_id', total: { $sum: '$total_reimbursable' } } }
      ]);
    case 'GAS_OFFICIAL':
      // eslint-disable-next-line vip-tenant/require-entity-filter -- entity_id present via ...baseMatch spread (linter can't trace spread)
      return CarLogbookEntry.aggregate([
        { $match: { ...baseMatch, period } },
        { $group: { _id: '$bdm_id', total: { $sum: '$official_gas_amount' } } }
      ]);
    case 'INSURANCE':
      // eslint-disable-next-line vip-tenant/require-entity-filter -- entity_id present via ...baseMatch spread (linter can't trace spread)
      return Collection.aggregate([
        { $match: { ...baseMatch, cr_date: { $gte: start, $lt: end } } },
        { $group: { _id: '$bdm_id', total: { $sum: '$total_partner_rebates' } } }
      ]);
    case 'ACCESS':
      // eslint-disable-next-line vip-tenant/require-entity-filter -- entity_id present via ...baseMatch spread (linter can't trace spread)
      return ExpenseEntry.aggregate([
        { $match: { ...baseMatch, period } },
        { $group: { _id: '$bdm_id', total: { $sum: '$total_access' } } }
      ]);
    case 'CORE_COMM':
      // eslint-disable-next-line vip-tenant/require-entity-filter -- entity_id present via ...baseMatch spread (linter can't trace spread)
      return Collection.aggregate([
        { $match: { ...baseMatch, cr_date: { $gte: start, $lt: end } } },
        { $group: { _id: '$bdm_id', total: { $sum: '$total_commission' } } }
      ]);
    default:
      return [];
  }
}

function toMap(aggResult) {
  return new Map(aggResult.map(r => [r._id.toString(), r.total || 0]));
}

/**
 * detectAnomalies — compare current vs prior period per person per component
 */
async function detectAnomalies(entityId, period) {
  const settings = await Settings.getSettings();
  const threshold = settings.EXPENSE_ANOMALY_THRESHOLD || 0.30;
  const prior = priorPeriod(period);

  const components = ['SMER', 'GAS_OFFICIAL', 'INSURANCE', 'ACCESS', 'CORE_COMM'];

  // Aggregate all components for both periods in parallel
  const [currentResults, priorResults] = await Promise.all([
    Promise.all(components.map(c => aggregateComponent(entityId, period, c))),
    Promise.all(components.map(c => aggregateComponent(entityId, prior, c)))
  ]);

  const currentMaps = components.map((_, i) => toMap(currentResults[i]));
  const priorMaps = components.map((_, i) => toMap(priorResults[i]));

  // Get all people for name lookup
  const eId = new mongoose.Types.ObjectId(entityId);
  const people = await PeopleMaster.find({ entity_id: eId, is_active: true })
    .select('user_id full_name').lean();
  const nameMap = new Map(people.map(p => [p.user_id?.toString(), p.full_name]));

  // Collect all bdm_ids across all components
  const allBdmIds = new Set();
  [...currentMaps, ...priorMaps].forEach(m => {
    for (const key of m.keys()) allBdmIds.add(key);
  });

  const anomalies = [];
  for (const bdmId of allBdmIds) {
    for (let ci = 0; ci < components.length; ci++) {
      const current_amount = currentMaps[ci].get(bdmId) || 0;
      const prior_amount = priorMaps[ci].get(bdmId) || 0;

      if (prior_amount === 0 && current_amount === 0) continue;

      const change_pct = prior_amount > 0
        ? Math.round(((current_amount - prior_amount) / prior_amount) * 10000) / 100
        : (current_amount > 0 ? 100 : 0);

      const flag = Math.abs(change_pct) > threshold * 100 ? 'ALERT' : 'NORMAL';

      anomalies.push({
        person_id: bdmId,
        person_name: nameMap.get(bdmId) || 'Unknown',
        component: components[ci],
        prior_amount: Math.round(prior_amount * 100) / 100,
        current_amount: Math.round(current_amount * 100) / 100,
        change_pct,
        flag
      });
    }
  }

  // Sort by absolute change % descending
  anomalies.sort((a, b) => Math.abs(b.change_pct) - Math.abs(a.change_pct));

  return { period, prior_period: prior, threshold: threshold * 100, anomalies };
}

/**
 * detectBudgetOverruns — compare actual vs budgeted per component
 */
async function detectBudgetOverruns(entityId, period) {
  const eId = new mongoose.Types.ObjectId(entityId);

  const allocations = await BudgetAllocation.find({
    entity_id: eId, period, status: 'APPROVED'
  }).lean();

  if (allocations.length === 0) return { period, overruns: [] };

  // Component code to aggregation source mapping
  const componentMap = {
    SMER: 'SMER', GAS: 'GAS_OFFICIAL', INSURANCE: 'INSURANCE',
    ACCESS: 'ACCESS', ORE: 'ORE', CORE_COMM: 'CORE_COMM'
  };

  // All transaction models key by User._id (bdm_id). BudgetAllocation.target_id
  // must also store User._id when target_type='BDM' for consistent lookups.
  const people = await PeopleMaster.find({ entity_id: eId })
    .select('user_id full_name').lean();
  const nameMap = new Map(people.map(p => [p.user_id?.toString(), p.full_name]));

  // Pre-aggregate all components
  const components = ['SMER', 'GAS_OFFICIAL', 'INSURANCE', 'ACCESS', 'CORE_COMM'];
  const aggResults = await Promise.all(components.map(c => aggregateComponent(entityId, period, c)));
  const aggMaps = {};
  components.forEach((c, i) => { aggMaps[c] = toMap(aggResults[i]); });

  // Also get ORE separately
  const oreResult = await ExpenseEntry.aggregate([
    { $match: { entity_id: eId, status: 'POSTED', period } },
    { $group: { _id: '$bdm_id', total: { $sum: '$total_ore' } } }
  ]);
  aggMaps['ORE'] = toMap(oreResult);

  const overruns = [];
  for (const alloc of allocations) {
    // target_id is User._id (same as bdm_id in transaction models)
    const userId = alloc.target_id?.toString();
    const personName = nameMap.get(userId) || alloc.target_name || 'Unknown';

    for (const comp of (alloc.components || [])) {
      const sourceKey = componentMap[comp.component_code] || comp.component_code;
      const aggMap = aggMaps[sourceKey];
      const actual = aggMap ? (aggMap.get(userId) || 0) : 0;
      const budgeted = comp.budgeted_amount || 0;
      const variance = Math.round((actual - budgeted) * 100) / 100;
      const variance_pct = budgeted > 0 ? Math.round((variance / budgeted) * 10000) / 100 : 0;

      overruns.push({
        person_id: alloc.target_id,
        person_name: personName,
        component: comp.component_code,
        budgeted_amount: budgeted,
        actual_amount: Math.round(actual * 100) / 100,
        variance,
        variance_pct,
        flag: actual > budgeted ? 'OVER_BUDGET' : 'WITHIN_BUDGET'
      });
    }
  }

  overruns.sort((a, b) => b.variance - a.variance);

  return { period, overruns };
}

module.exports = {
  detectAnomalies,
  detectBudgetOverruns
};
