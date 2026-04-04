/**
 * Cycle Report Service — GENERATED → REVIEWED → BDM_CONFIRMED → CREDITED (Phase 15.3)
 */
const mongoose = require('mongoose');
const CycleReport = require('../models/CycleReport');
const SalesLine = require('../models/SalesLine');
const Collection = require('../models/Collection');
const ExpenseEntry = require('../models/ExpenseEntry');
const SmerEntry = require('../models/SmerEntry');
const CarLogbookEntry = require('../models/CarLogbookEntry');

function periodToDates(period) {
  const [year, month] = period.split('-').map(Number);
  return { start: new Date(year, month - 1, 1), end: new Date(year, month, 1) };
}

/**
 * Generate a cycle report snapshot
 */
async function generateCycleReport(entityId, bdmId, period, cycle, userId) {
  const eId = new mongoose.Types.ObjectId(entityId);
  const bId = new mongoose.Types.ObjectId(bdmId);
  const { start, end } = periodToDates(period);
  const baseMatch = { entity_id: eId, bdm_id: bId, status: 'POSTED' };

  // Aggregate sales
  const salesAgg = await SalesLine.aggregate([
    { $match: { ...baseMatch, csi_date: { $gte: start, $lt: end } } },
    { $group: { _id: null, total: { $sum: '$invoice_total' }, count: { $sum: 1 } } }
  ]);
  const sales_total = salesAgg[0]?.total || 0;

  // Aggregate collections
  const collAgg = await Collection.aggregate([
    { $match: { ...baseMatch, cr_date: { $gte: start, $lt: end } } },
    {
      $group: {
        _id: null,
        total: { $sum: '$cr_amount' },
        commission: { $sum: '$total_commission' },
        count: { $sum: 1 }
      }
    }
  ]);
  const collections_total = collAgg[0]?.total || 0;
  const commission_total = collAgg[0]?.commission || 0;

  // Aggregate expenses across 3 sources
  const periodMatch = { ...baseMatch, period };
  const [smerAgg, gasAgg, expAgg] = await Promise.all([
    SmerEntry.aggregate([{ $match: periodMatch }, { $group: { _id: null, total: { $sum: '$total_reimbursable' } } }]),
    CarLogbookEntry.aggregate([{ $match: periodMatch }, { $group: { _id: null, total: { $sum: '$official_gas_amount' } } }]),
    ExpenseEntry.aggregate([{ $match: periodMatch }, { $group: { _id: null, total: { $sum: '$total_amount' } } }])
  ]);
  const expenses_total = (smerAgg[0]?.total || 0) + (gasAgg[0]?.total || 0) + (expAgg[0]?.total || 0);
  const net_income = Math.round((collections_total - expenses_total) * 100) / 100;

  // Build breakdowns
  const sales_breakdown = { total: sales_total, count: salesAgg[0]?.count || 0 };
  const collection_breakdown = { total: collections_total, commission: commission_total, count: collAgg[0]?.count || 0 };
  const expense_breakdown = {
    smer: smerAgg[0]?.total || 0,
    gas: gasAgg[0]?.total || 0,
    other_expenses: expAgg[0]?.total || 0,
    total: expenses_total
  };

  // Create or update cycle report
  const report = await CycleReport.findOneAndUpdate(
    { entity_id: eId, bdm_id: bId, period, cycle },
    {
      sales_total: Math.round(sales_total * 100) / 100,
      collections_total: Math.round(collections_total * 100) / 100,
      expenses_total: Math.round(expenses_total * 100) / 100,
      commission_total: Math.round(commission_total * 100) / 100,
      net_income,
      sales_breakdown,
      expense_breakdown,
      collection_breakdown,
      status: 'GENERATED',
      generated_at: new Date(),
      generated_by: userId
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return report;
}

/**
 * Review a cycle report (GENERATED -> REVIEWED)
 */
async function reviewCycleReport(reportId, userId, notes) {
  const report = await CycleReport.findById(reportId);
  if (!report) throw Object.assign(new Error('Cycle report not found'), { statusCode: 404 });
  if (report.status !== 'GENERATED') {
    throw Object.assign(new Error(`Cannot review report in ${report.status} status`), { statusCode: 400 });
  }

  report.status = 'REVIEWED';
  report.reviewed_at = new Date();
  report.reviewed_by = userId;
  report.review_notes = notes || '';
  await report.save();
  return report;
}

/**
 * BDM confirms cycle report (REVIEWED -> BDM_CONFIRMED)
 */
async function confirmCycleReport(reportId, userId, notes) {
  const report = await CycleReport.findById(reportId);
  if (!report) throw Object.assign(new Error('Cycle report not found'), { statusCode: 404 });
  if (report.status !== 'REVIEWED') {
    throw Object.assign(new Error(`Cannot confirm report in ${report.status} status`), { statusCode: 400 });
  }

  report.status = 'BDM_CONFIRMED';
  report.bdm_confirmed_at = new Date();
  report.bdm_confirmed_by = userId;
  report.bdm_notes = notes || '';
  await report.save();
  return report;
}

/**
 * Credit a cycle report (BDM_CONFIRMED -> CREDITED)
 */
async function creditCycleReport(reportId, userId, creditReference) {
  const report = await CycleReport.findById(reportId);
  if (!report) throw Object.assign(new Error('Cycle report not found'), { statusCode: 404 });
  if (report.status !== 'BDM_CONFIRMED') {
    throw Object.assign(new Error(`Cannot credit report in ${report.status} status`), { statusCode: 400 });
  }

  report.status = 'CREDITED';
  report.credited_at = new Date();
  report.credited_by = userId;
  report.credit_reference = creditReference || '';
  await report.save();
  return report;
}

/**
 * List cycle reports with filters
 */
async function getCycleReports(entityId, filters = {}) {
  const query = { entity_id: new mongoose.Types.ObjectId(entityId) };
  if (filters.bdm_id) query.bdm_id = new mongoose.Types.ObjectId(filters.bdm_id);
  if (filters.period) query.period = filters.period;
  if (filters.status) query.status = filters.status;

  const reports = await CycleReport.find(query)
    .sort({ period: -1, created_at: -1 })
    .lean();

  return reports;
}

module.exports = {
  generateCycleReport,
  reviewCycleReport,
  confirmCycleReport,
  creditCycleReport,
  getCycleReports
};
