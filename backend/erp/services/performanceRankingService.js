/**
 * Performance Ranking Service — Net Cash Ranking, MoM Trend, Sales/Collections Trackers
 * Phase 14.1
 */
const mongoose = require('mongoose');
const SalesLine = require('../models/SalesLine');
const Collection = require('../models/Collection');
const ExpenseEntry = require('../models/ExpenseEntry');
const SmerEntry = require('../models/SmerEntry');
const CarLogbookEntry = require('../models/CarLogbookEntry');
const PeopleMaster = require('../models/PeopleMaster');

function periodToDates(period) {
  const [year, month] = period.split('-').map(Number);
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 1);
  return { start, end };
}

function subtractMonth(period, n = 1) {
  let [year, month] = period.split('-').map(Number);
  month -= n;
  while (month < 1) { month += 12; year -= 1; }
  return `${year}-${String(month).padStart(2, '0')}`;
}

/**
 * Aggregate a single financial metric grouped by bdm_id for a period
 */
async function aggregateByBdm(Model, entityId, dateField, amountField, start, end, extraMatch = {}) {
  const match = {
    entity_id: new mongoose.Types.ObjectId(entityId),
    status: 'POSTED',
    [dateField]: { $gte: start, $lt: end },
    ...extraMatch
  };
  const result = await Model.aggregate([
    { $match: match },
    { $group: { _id: '$bdm_id', total: { $sum: `$${amountField}` } } }
  ]);
  return new Map(result.map(r => [r._id.toString(), r.total]));
}

/**
 * Aggregate expenses across 3 sources for a period, grouped by bdm_id
 */
async function aggregateExpenses(entityId, start, end) {
  const eId = new mongoose.Types.ObjectId(entityId);
  const periodStr = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`;
  const baseMatch = { entity_id: eId, status: 'POSTED' };

  const [smer, gas, expense] = await Promise.all([
    SmerEntry.aggregate([
      { $match: { ...baseMatch, period: periodStr } },
      { $group: { _id: '$bdm_id', total: { $sum: '$total_reimbursable' } } }
    ]),
    CarLogbookEntry.aggregate([
      { $match: { ...baseMatch, period: periodStr } },
      { $group: { _id: '$bdm_id', total: { $sum: '$official_gas_amount' } } }
    ]),
    ExpenseEntry.aggregate([
      { $match: { ...baseMatch, period: periodStr } },
      { $group: { _id: '$bdm_id', total: { $sum: '$total_amount' } } }
    ])
  ]);

  const map = new Map();
  const merge = (rows) => {
    for (const r of rows) {
      const key = r._id.toString();
      map.set(key, (map.get(key) || 0) + (r.total || 0));
    }
  };
  merge(smer);
  merge(gas);
  merge(expense);
  return map;
}

/**
 * getNetCashRanking — ranks BDMs by Net Cash = Collections - Expenses
 */
async function getNetCashRanking(entityId, period) {
  const { start, end } = periodToDates(period);
  const eId = new mongoose.Types.ObjectId(entityId);

  // Parallel aggregations
  const [salesMap, collectionsMap, expensesMap, people] = await Promise.all([
    aggregateByBdm(SalesLine, entityId, 'csi_date', 'invoice_total', start, end),
    aggregateByBdm(Collection, entityId, 'cr_date', 'cr_amount', start, end),
    aggregateExpenses(entityId, start, end),
    PeopleMaster.find({ entity_id: eId, is_active: true, person_type: { $in: ['BDM', 'SALES_REP'] } })
      .select('user_id full_name person_type position').lean()
  ]);

  const rankings = people.map(p => {
    const key = p.user_id?.toString();
    const sales = key ? (salesMap.get(key) || 0) : 0;
    const collections = key ? (collectionsMap.get(key) || 0) : 0;
    const expenses = key ? (expensesMap.get(key) || 0) : 0;
    const net_cash = Math.round((collections - expenses) * 100) / 100;
    const collection_pct = sales > 0 ? Math.round((collections / sales) * 10000) / 100 : 0;

    return {
      person_id: p._id,
      bdm_id: p.user_id,
      full_name: p.full_name,
      person_type: p.person_type,
      sales: Math.round(sales * 100) / 100,
      collections: Math.round(collections * 100) / 100,
      collection_pct,
      expenses: Math.round(expenses * 100) / 100,
      net_cash
    };
  });

  rankings.sort((a, b) => b.net_cash - a.net_cash);
  rankings.forEach((r, i) => { r.rank = i + 1; });

  return { period, rankings };
}

/**
 * getMomTrend — 6-month rolling trend for a person
 */
async function getMomTrend(entityId, personId, periods = 6) {
  const person = await PeopleMaster.findById(personId).select('user_id full_name').lean();
  if (!person) return { person_id: personId, full_name: 'Unknown', trends: [] };

  const bdmId = person.user_id?.toString();
  const now = new Date();
  const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const trends = [];
  for (let i = 0; i < periods; i++) {
    const p = subtractMonth(currentPeriod, i);
    const { start, end } = periodToDates(p);

    const bdmMatch = bdmId ? { bdm_id: new mongoose.Types.ObjectId(bdmId) } : {};

    const [salesMap, collectionsMap, expensesMap] = await Promise.all([
      aggregateByBdm(SalesLine, entityId, 'csi_date', 'invoice_total', start, end, bdmMatch),
      aggregateByBdm(Collection, entityId, 'cr_date', 'cr_amount', start, end, bdmMatch),
      (async () => {
        if (!bdmId) return new Map();
        const eId = new mongoose.Types.ObjectId(entityId);
        const bId = new mongoose.Types.ObjectId(bdmId);
        const baseMatch = { entity_id: eId, bdm_id: bId, status: 'POSTED', period: p };
        const [s, g, e] = await Promise.all([
          SmerEntry.aggregate([{ $match: baseMatch }, { $group: { _id: null, t: { $sum: '$total_reimbursable' } } }]),
          CarLogbookEntry.aggregate([{ $match: baseMatch }, { $group: { _id: null, t: { $sum: '$official_gas_amount' } } }]),
          ExpenseEntry.aggregate([{ $match: baseMatch }, { $group: { _id: null, t: { $sum: '$total_amount' } } }])
        ]);
        return new Map([['total', (s[0]?.t || 0) + (g[0]?.t || 0) + (e[0]?.t || 0)]]);
      })()
    ]);

    const sales = bdmId ? (salesMap.get(bdmId) || 0) : 0;
    const collections = bdmId ? (collectionsMap.get(bdmId) || 0) : 0;
    const expenses = expensesMap.get('total') || expensesMap.get(bdmId) || 0;

    trends.unshift({ period: p, sales: Math.round(sales * 100) / 100, collections: Math.round(collections * 100) / 100, expenses: Math.round(expenses * 100) / 100 });
  }

  // Compute growth %
  for (let i = 1; i < trends.length; i++) {
    const prev = trends[i - 1];
    const curr = trends[i];
    curr.sales_growth_pct = prev.sales > 0 ? Math.round(((curr.sales - prev.sales) / prev.sales) * 10000) / 100 : 0;
    curr.collection_growth_pct = prev.collections > 0 ? Math.round(((curr.collections - prev.collections) / prev.collections) * 10000) / 100 : 0;
    curr.expense_growth_pct = prev.expenses > 0 ? Math.round(((curr.expenses - prev.expenses) / prev.expenses) * 10000) / 100 : 0;
  }
  if (trends.length > 0) {
    trends[0].sales_growth_pct = 0;
    trends[0].collection_growth_pct = 0;
    trends[0].expense_growth_pct = 0;
  }

  return { person_id: personId, full_name: person.full_name, trends };
}

/**
 * getSalesTracker — full year Jan-Dec by person
 */
async function getSalesTracker(entityId, year) {
  const eId = new mongoose.Types.ObjectId(entityId);
  const yearNum = Number(year);
  const start = new Date(yearNum, 0, 1);
  const end = new Date(yearNum + 1, 0, 1);

  const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const monthGroup = {};
  months.forEach((m, i) => {
    monthGroup[m] = { $sum: { $cond: [{ $eq: [{ $month: '$csi_date' }, i + 1] }, '$invoice_total', 0] } };
  });

  const result = await SalesLine.aggregate([
    { $match: { entity_id: eId, status: 'POSTED', csi_date: { $gte: start, $lt: end } } },
    { $group: { _id: '$bdm_id', ...monthGroup } },
    { $lookup: { from: 'erp_people_master', localField: '_id', foreignField: 'user_id', as: 'person' } },
    { $unwind: { path: '$person', preserveNullAndEmptyArrays: true } },
    { $addFields: { full_name: { $ifNull: ['$person.full_name', 'Unknown'] }, total: { $add: months.map(m => `$${m}`) } } },
    { $sort: { total: -1 } },
    { $project: { person_id: '$person._id', bdm_id: '$_id', full_name: 1, ...Object.fromEntries(months.map(m => [m, 1])), total: 1 } }
  ]);

  return { year: yearNum, tracker: result };
}

/**
 * getCollectionsTracker — full year Jan-Dec by person
 */
async function getCollectionsTracker(entityId, year) {
  const eId = new mongoose.Types.ObjectId(entityId);
  const yearNum = Number(year);
  const start = new Date(yearNum, 0, 1);
  const end = new Date(yearNum + 1, 0, 1);

  const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const monthGroup = {};
  months.forEach((m, i) => {
    monthGroup[m] = { $sum: { $cond: [{ $eq: [{ $month: '$cr_date' }, i + 1] }, '$cr_amount', 0] } };
  });

  const result = await Collection.aggregate([
    { $match: { entity_id: eId, status: 'POSTED', cr_date: { $gte: start, $lt: end } } },
    { $group: { _id: '$bdm_id', ...monthGroup } },
    { $lookup: { from: 'erp_people_master', localField: '_id', foreignField: 'user_id', as: 'person' } },
    { $unwind: { path: '$person', preserveNullAndEmptyArrays: true } },
    { $addFields: { full_name: { $ifNull: ['$person.full_name', 'Unknown'] }, total: { $add: months.map(m => `$${m}`) } } },
    { $sort: { total: -1 } },
    { $project: { person_id: '$person._id', bdm_id: '$_id', full_name: 1, ...Object.fromEntries(months.map(m => [m, 1])), total: 1 } }
  ]);

  return { year: yearNum, tracker: result };
}

module.exports = {
  getNetCashRanking,
  getMomTrend,
  getSalesTracker,
  getCollectionsTracker
};
