/**
 * P&L Service — Four-View Profit & Loss from journal entries
 *
 * PRD v5 §11.7 — Distinct from existing pnlCalc.js (which derives P&L from
 * source documents). This service computes P&L from POSTED journal entries.
 *
 * Views:
 *   1. Internal — bir_flag IN (BOTH, INTERNAL)
 *   2. BIR     — bir_flag IN (BOTH, BIR), includes 8000+ deductions
 *   3. VAT 2550Q — delegates to vatService
 *   4. CWT 2307  — delegates to cwtService
 */
const mongoose = require('mongoose');
const JournalEntry = require('../models/JournalEntry');
const { computeVatReturn2550Q } = require('./vatService');
const { computeCwt2307Summary } = require('./cwtService');

/**
 * Helper: aggregate P&L lines from JEs with bir_flag filter
 */
async function aggregatePnl(entityId, period, birFlags) {
  const eId = typeof entityId === 'string' ? new mongoose.Types.ObjectId(entityId) : entityId;

  const pipeline = [
    {
      $match: {
        entity_id: eId,
        status: 'POSTED',
        period: period,
        bir_flag: { $in: birFlags }
      }
    },
    { $unwind: '$lines' },
    {
      $group: {
        _id: '$lines.account_code',
        account_name: { $first: '$lines.account_name' },
        total_debit: { $sum: '$lines.debit' },
        total_credit: { $sum: '$lines.credit' }
      }
    },
    { $sort: { _id: 1 } }
  ];

  const rows = await JournalEntry.aggregate(pipeline);

  // Classify by account code ranges
  const revenue = [];
  const cogs = [];
  const opex = [];
  const nonOpex = [];
  const birOnly = [];

  for (const row of rows) {
    const code = parseInt(row._id);
    const net = row.total_credit - row.total_debit; // revenue is credit-normal
    const entry = {
      account_code: row._id,
      account_name: row.account_name,
      amount: Math.round(Math.abs(row.total_debit - row.total_credit) * 100) / 100,
      debit: row.total_debit,
      credit: row.total_credit
    };

    if (code >= 4000 && code < 5000) {
      entry.amount = Math.round(net * 100) / 100;
      revenue.push(entry);
    } else if (code >= 5000 && code < 6000) {
      entry.amount = Math.round((row.total_debit - row.total_credit) * 100) / 100;
      cogs.push(entry);
    } else if (code >= 6000 && code < 7000) {
      entry.amount = Math.round((row.total_debit - row.total_credit) * 100) / 100;
      opex.push(entry);
    } else if (code >= 7000 && code < 8000) {
      entry.amount = Math.round((row.total_debit - row.total_credit) * 100) / 100;
      nonOpex.push(entry);
    } else if (code >= 8000) {
      entry.amount = Math.round((row.total_debit - row.total_credit) * 100) / 100;
      birOnly.push(entry);
    }
  }

  const totalRevenue = revenue.reduce((s, r) => s + r.amount, 0);
  const totalCogs = cogs.reduce((s, r) => s + r.amount, 0);
  const grossProfit = totalRevenue - totalCogs;
  const totalOpex = opex.reduce((s, r) => s + r.amount, 0);
  const totalNonOpex = nonOpex.reduce((s, r) => s + r.amount, 0);
  const totalBirOnly = birOnly.reduce((s, r) => s + r.amount, 0);
  const operatingIncome = grossProfit - totalOpex;
  const netIncome = operatingIncome - totalNonOpex - totalBirOnly;

  return {
    period,
    revenue: { lines: revenue, total: Math.round(totalRevenue * 100) / 100 },
    cost_of_sales: { lines: cogs, total: Math.round(totalCogs * 100) / 100 },
    gross_profit: Math.round(grossProfit * 100) / 100,
    gross_profit_pct: totalRevenue > 0 ? Math.round((grossProfit / totalRevenue) * 10000) / 100 : 0,
    operating_expenses: { lines: opex, total: Math.round(totalOpex * 100) / 100 },
    non_operating_expenses: { lines: nonOpex, total: Math.round(totalNonOpex * 100) / 100 },
    bir_only_deductions: { lines: birOnly, total: Math.round(totalBirOnly * 100) / 100 },
    operating_income: Math.round(operatingIncome * 100) / 100,
    operating_income_pct: totalRevenue > 0 ? Math.round((operatingIncome / totalRevenue) * 10000) / 100 : 0,
    net_income: Math.round(netIncome * 100) / 100,
    net_income_pct: totalRevenue > 0 ? Math.round((netIncome / totalRevenue) * 10000) / 100 : 0
  };
}

/**
 * Internal P&L — includes BOTH + INTERNAL JEs
 */
async function generatePnlInternal(entityId, period) {
  const result = await aggregatePnl(entityId, period, ['BOTH', 'INTERNAL']);
  result.view = 'INTERNAL';
  return result;
}

/**
 * BIR P&L — includes BOTH + BIR JEs, with 8000+ deductions
 */
async function generatePnlBir(entityId, period) {
  const result = await aggregatePnl(entityId, period, ['BOTH', 'BIR']);
  result.view = 'BIR';
  return result;
}

/**
 * VAT Return 2550Q view — delegates to vatService
 */
async function generateVatReturn(entityId, quarter, year) {
  return computeVatReturn2550Q(entityId, quarter, year);
}

/**
 * CWT 2307 summary view — delegates to cwtService
 */
async function generateCwtSummary(entityId, quarter, year) {
  return computeCwt2307Summary(entityId, quarter, year);
}

module.exports = {
  generatePnlInternal,
  generatePnlBir,
  generateVatReturn,
  generateCwtSummary
};
