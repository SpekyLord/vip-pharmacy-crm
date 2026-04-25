/**
 * PNL Calculation Service — Territory P&L per BDM per month
 *
 * Revenue: POSTED SalesLines + POSTED Collections
 * COGS: SalesLine line_items × ProductMaster.purchase_price (weighted-average)
 * Expenses: from expenseSummary service + sampling DR cost
 * Net Income: Gross Profit − Total Expenses
 *
 * Also handles Year-End Close data capture (Phase 11 will generate journals).
 */
const mongoose = require('mongoose');
const SalesLine = require('../models/SalesLine');
const Collection = require('../models/Collection');
const InventoryLedger = require('../models/InventoryLedger');
const PnlReport = require('../models/PnlReport');
const MonthlyArchive = require('../models/MonthlyArchive');
const TransactionEvent = require('../models/TransactionEvent');
const ProductMaster = require('../models/ProductMaster');
const { generateExpenseSummary } = require('./expenseSummary');
const { evaluateEligibility } = require('./profitShareEngine');
const { generatePnlInternal } = require('./pnlService');
const { createAndPostJournal } = require('./journalEngine');
const JournalEntry = require('../models/JournalEntry');

/**
 * Parse period string "YYYY-MM" to start/end Date objects
 */
function periodToDates(period) {
  const [year, month] = period.split('-').map(Number);
  return {
    start: new Date(year, month - 1, 1),
    end: new Date(year, month, 1)
  };
}

/**
 * Compute COGS for a BDM in a period.
 * Joins SalesLine line_items with ProductMaster.purchase_price.
 *
 * @returns {{ total_cogs, breakdown: [{ product_id, product_name, qty_sold, unit_cost, cogs }] }}
 */
async function computeCogs(entityId, bdmId, periodStart, periodEnd) {
  const result = await SalesLine.aggregate([
    {
      $match: {
        entity_id: new mongoose.Types.ObjectId(entityId),
        bdm_id: new mongoose.Types.ObjectId(bdmId),
        status: 'POSTED',
        csi_date: { $gte: periodStart, $lt: periodEnd }
      }
    },
    { $unwind: '$line_items' },
    {
      $lookup: {
        from: 'erp_product_master',
        localField: 'line_items.product_id',
        foreignField: '_id',
        as: 'product'
      }
    },
    { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
    {
      $group: {
        _id: '$line_items.product_id',
        product_name: { $first: '$product.brand_name' },
        qty_sold: { $sum: '$line_items.qty' },
        unit_cost: { $first: { $ifNull: ['$product.purchase_price', 0] } }
      }
    },
    {
      $addFields: {
        cogs: { $multiply: ['$qty_sold', '$unit_cost'] }
      }
    }
  ]);

  const totalCogs = result.reduce((sum, r) => sum + (r.cogs || 0), 0);
  return {
    total_cogs: Math.round(totalCogs * 100) / 100,
    breakdown: result.map(r => ({
      product_id: r._id,
      product_name: r.product_name || 'Unknown',
      qty_sold: r.qty_sold,
      unit_cost: r.unit_cost,
      cogs: Math.round((r.cogs || 0) * 100) / 100
    }))
  };
}

/**
 * Compute sampling DR cost from InventoryLedger.
 * DR_SAMPLING entries × ProductMaster.purchase_price
 */
async function computeSamplingDrCost(entityId, bdmId, periodStart, periodEnd) {
  const result = await InventoryLedger.aggregate([
    {
      $match: {
        entity_id: new mongoose.Types.ObjectId(entityId),
        bdm_id: new mongoose.Types.ObjectId(bdmId),
        transaction_type: 'DR_SAMPLING',
        recorded_at: { $gte: periodStart, $lt: periodEnd }
      }
    },
    {
      $lookup: {
        from: 'erp_product_master',
        localField: 'product_id',
        foreignField: '_id',
        as: 'product'
      }
    },
    { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
    {
      $group: {
        _id: null,
        total: {
          $sum: { $multiply: ['$qty_out', { $ifNull: ['$product.purchase_price', 0] }] }
        }
      }
    }
  ]);
  return Math.round((result[0]?.total || 0) * 100) / 100;
}

/**
 * Generate PNL Report for a BDM in a given month.
 *
 * @param {String} entityId
 * @param {String} bdmId
 * @param {String} period - "2026-04"
 * @param {ObjectId} userId - who triggered the generation
 * @returns {Object} PnlReport document
 */
async function generatePnlReport(entityId, bdmId, period, userId) {
  const { start, end } = periodToDates(period);

  // 1. Revenue: POSTED SalesLines
  const salesAgg = await SalesLine.aggregate([
    {
      $match: {
        entity_id: new mongoose.Types.ObjectId(entityId),
        bdm_id: new mongoose.Types.ObjectId(bdmId),
        status: 'POSTED',
        csi_date: { $gte: start, $lt: end }
      }
    },
    {
      $group: {
        _id: null,
        gross_sales: { $sum: '$invoice_total' },
        total_vat: { $sum: '$total_vat' },
        net_sales: { $sum: '$total_net_of_vat' }
      }
    }
  ]);
  const salesData = salesAgg[0] || { gross_sales: 0, total_vat: 0, net_sales: 0 };

  // 2. Revenue: POSTED Collections net of VAT
  const collAgg = await Collection.aggregate([
    {
      $match: {
        entity_id: new mongoose.Types.ObjectId(entityId),
        bdm_id: new mongoose.Types.ObjectId(bdmId),
        status: 'POSTED',
        cr_date: { $gte: start, $lt: end }
      }
    },
    {
      $group: {
        _id: null,
        collections_net_of_vat: { $sum: '$total_net_of_vat' }
      }
    }
  ]);
  const collectionsNetOfVat = collAgg[0]?.collections_net_of_vat || 0;

  // 3. COGS
  const cogsData = await computeCogs(entityId, bdmId, start, end);

  // 4. Expenses from existing service
  const expSummary = await generateExpenseSummary(entityId, bdmId, period, 'MONTHLY');

  // 5. Sampling DR cost
  const samplingDrCost = await computeSamplingDrCost(entityId, bdmId, start, end);

  // Build PNL data (pre-save hook computes derived fields)
  const pnlData = {
    entity_id: entityId,
    bdm_id: bdmId,
    period,
    revenue: {
      gross_sales: salesData.gross_sales,
      total_vat: salesData.total_vat,
      net_sales: salesData.net_sales,
      collections_net_of_vat: collectionsNetOfVat
    },
    cogs: {
      total_cogs: cogsData.total_cogs
    },
    expenses: {
      smer_reimbursable: expSummary.categories.smer_reimbursable,
      gasoline_less_personal: expSummary.categories.gasoline_less_personal,
      partners_insurance: expSummary.categories.partners_insurance,
      access_total: expSummary.categories.access_total,
      ore_total: expSummary.categories.ore_total,
      sampling_dr_cost: samplingDrCost
      // depreciation and loan_amortization: kept from existing doc or default 0
    },
    status: 'GENERATED',
    generated_at: new Date(),
    created_by: userId
  };

  // Compute gross_profit and net_income for PS evaluation
  // Include depreciation + loan_amortization from existing doc (manual Finance entries)
  const existingForExp = await PnlReport.findOne({ entity_id: entityId, bdm_id: bdmId, period })
    .select('expenses.depreciation expenses.loan_amortization').lean();
  const depreciation = existingForExp?.expenses?.depreciation || 0;
  const loanAmortization = existingForExp?.expenses?.loan_amortization || 0;

  const grossProfit = Math.round((collectionsNetOfVat - cogsData.total_cogs) * 100) / 100;
  const totalExp = Math.round(
    (expSummary.categories.smer_reimbursable + expSummary.categories.gasoline_less_personal +
     expSummary.categories.partners_insurance + expSummary.categories.access_total +
     expSummary.categories.ore_total + samplingDrCost + depreciation + loanAmortization) * 100
  ) / 100;
  const netIncome = Math.round((grossProfit - totalExp) * 100) / 100;

  // 6. Profit Sharing eligibility
  const psResult = await evaluateEligibility(entityId, bdmId, period, { net_income: netIncome });

  // Populate product names — entity-scope to prevent foreign-entity leak
  if (psResult.ps_products.length > 0) {
    const productIds = psResult.ps_products.map(p => p.product_id);
    const products = await ProductMaster.find({ entity_id: entityId, _id: { $in: productIds } })
      .select('brand_name dosage_strength').lean();
    const prodMap = new Map(products.map(p => [p._id.toString(), p]));
    for (const psp of psResult.ps_products) {
      const prod = prodMap.get(psp.product_id.toString());
      psp.product_name = prod
        ? `${prod.brand_name}${prod.dosage_strength ? ' ' + prod.dosage_strength : ''}`
        : 'Unknown';
    }
  }

  pnlData.profit_sharing = psResult;

  // Upsert — preserve manual fields (depreciation, loan_amortization) from existing doc
  const existing = await PnlReport.findOne({
    entity_id: entityId, bdm_id: bdmId, period
  });

  if (existing) {
    // Preserve manual Finance entries
    pnlData.expenses.depreciation = existing.expenses?.depreciation || 0;
    pnlData.expenses.loan_amortization = existing.expenses?.loan_amortization || 0;

    Object.assign(existing, pnlData);
    await existing.save();
    return existing;
  }

  const report = await PnlReport.create(pnlData);
  return report;
}

/**
 * Get an existing PNL report
 */
async function getPnlReport(entityId, bdmId, period) {
  return PnlReport.findOne({
    entity_id: new mongoose.Types.ObjectId(entityId),
    bdm_id: new mongoose.Types.ObjectId(bdmId),
    period
  });
}

// ═══════════════════════════════════════════
// YEAR-END CLOSE
// ═══════════════════════════════════════════

/**
 * Validate that all monthly periods in a fiscal year are CLOSED.
 * Returns readiness status.
 */
async function validateYearEndClose(entityId, fiscalYear) {
  const periods = [];
  for (let m = 1; m <= 12; m++) {
    periods.push(`${fiscalYear}-${String(m).padStart(2, '0')}`);
  }

  const archives = await MonthlyArchive.find({
    entity_id: new mongoose.Types.ObjectId(entityId),
    record_type: 'MONTHLY',
    period: { $in: periods }
  }).lean();

  const archiveMap = new Map(archives.map(a => [a.period, a]));

  const missingPeriods = [];
  const openPeriods = [];
  const closedPeriods = [];

  for (const p of periods) {
    const arch = archiveMap.get(p);
    if (!arch) {
      missingPeriods.push(p);
    } else if (arch.period_status === 'OPEN') {
      openPeriods.push(p);
    } else {
      closedPeriods.push(p);
    }
  }

  // Check if fiscal year already closed
  const fyRecord = await MonthlyArchive.findOne({
    entity_id: new mongoose.Types.ObjectId(entityId),
    record_type: 'FISCAL_YEAR',
    fiscal_year: fiscalYear
  }).lean();

  const ready = missingPeriods.length === 0 && openPeriods.length === 0 &&
                (!fyRecord || fyRecord.fy_status !== 'CLOSED');

  return {
    ready,
    fiscal_year: fiscalYear,
    already_closed: fyRecord?.fy_status === 'CLOSED',
    missing_periods: missingPeriods,
    open_periods: openPeriods,
    closed_periods: closedPeriods,
    warnings: fyRecord?.fy_status === 'CLOSED'
      ? [`Fiscal year ${fiscalYear} is already closed`]
      : []
  };
}

/**
 * Execute Year-End Close.
 * Aggregates full-year PNL, creates FISCAL_YEAR archive, locks all periods.
 */
async function executeYearEndClose(entityId, fiscalYear, userId) {
  // 1. Validate
  const validation = await validateYearEndClose(entityId, fiscalYear);
  if (!validation.ready) {
    const err = new Error('Year-end close validation failed');
    err.code = 'YEAR_END_VALIDATION_FAILED';
    err.details = validation;
    throw err;
  }

  // 2. Aggregate all PnlReports for the fiscal year
  const periods = [];
  for (let m = 1; m <= 12; m++) {
    periods.push(`${fiscalYear}-${String(m).padStart(2, '0')}`);
  }

  const pnlReports = await PnlReport.find({
    entity_id: new mongoose.Types.ObjectId(entityId),
    period: { $in: periods },
    status: { $in: ['GENERATED', 'REVIEWED', 'POSTED'] }
  }).lean();

  // Aggregate by BDM
  const bdmMap = new Map();
  let totalRevenue = 0;
  let totalExpenses = 0;

  for (const pnl of pnlReports) {
    const bid = pnl.bdm_id.toString();
    if (!bdmMap.has(bid)) {
      bdmMap.set(bid, { bdm_id: pnl.bdm_id, total_revenue: 0, total_expenses: 0, net_income: 0 });
    }
    const bdm = bdmMap.get(bid);
    const rev = pnl.revenue?.collections_net_of_vat || 0;
    const exp = pnl.total_expenses || 0;
    bdm.total_revenue += rev;
    bdm.total_expenses += exp;
    bdm.net_income += (rev - (pnl.cogs?.total_cogs || 0) - exp);
    totalRevenue += rev;
    totalExpenses += (pnl.cogs?.total_cogs || 0) + exp;
  }

  const netIncome = Math.round((totalRevenue - totalExpenses) * 100) / 100;

  // 3. Create FISCAL_YEAR archive
  const fyArchive = await MonthlyArchive.findOneAndUpdate(
    {
      entity_id: entityId,
      period: `FY-${fiscalYear}`,
      record_type: 'FISCAL_YEAR'
    },
    {
      entity_id: entityId,
      period: `FY-${fiscalYear}`,
      record_type: 'FISCAL_YEAR',
      fiscal_year: fiscalYear,
      fy_status: 'CLOSED',
      year_end_data: {
        total_revenue: Math.round(totalRevenue * 100) / 100,
        total_expenses: Math.round(totalExpenses * 100) / 100,
        net_income: netIncome,
        retained_earnings_transfer: netIncome,
        closing_entries_pending: true,
        periods_included: periods,
        bdm_year_summaries: Array.from(bdmMap.values()).map(b => ({
          ...b,
          total_revenue: Math.round(b.total_revenue * 100) / 100,
          total_expenses: Math.round(b.total_expenses * 100) / 100,
          net_income: Math.round(b.net_income * 100) / 100
        }))
      },
      fy_closed_at: new Date(),
      fy_closed_by: userId,
      created_by: userId
    },
    { upsert: true, new: true }
  );

  // 4. Lock all monthly PnlReports
  await PnlReport.updateMany(
    {
      entity_id: new mongoose.Types.ObjectId(entityId),
      period: { $in: periods }
    },
    { $set: { locked: true, status: 'LOCKED' } }
  );

  // 5. Lock all monthly archives
  await MonthlyArchive.updateMany(
    {
      entity_id: new mongoose.Types.ObjectId(entityId),
      record_type: 'MONTHLY',
      period: { $in: periods }
    },
    { $set: { period_status: 'LOCKED' } }
  );

  // 6. Create TransactionEvent
  await TransactionEvent.create({
    entity_id: entityId,
    bdm_id: userId,
    event_type: 'YEAR_END_CLOSE',
    event_date: new Date(),
    document_ref: `FY-${fiscalYear}`,
    payload: {
      fiscal_year: fiscalYear,
      total_revenue: fyArchive.year_end_data.total_revenue,
      total_expenses: fyArchive.year_end_data.total_expenses,
      net_income: fyArchive.year_end_data.net_income,
      retained_earnings_transfer: fyArchive.year_end_data.retained_earnings_transfer
    },
    confirmed_fields: { fiscal_year: fiscalYear },
    source_image_url: 'system://year-end-close',
    created_by: userId
  });

  // 7. Create closing JE — transfer net income to Retained Earnings
  // Uses GL-based P&L (pnlService) to get authoritative revenue/expense totals
  try {
    // Aggregate full-year GL P&L across all 12 periods
    const closingLines = [];
    let totalDebit = 0;
    let totalCredit = 0;

    // Get all POSTED JE lines for revenue (4000-4999) and expense (5000-7999) accounts
    const glAgg = await JournalEntry.aggregate([
      {
        $match: {
          entity_id: new mongoose.Types.ObjectId(entityId),
          status: 'POSTED',
          is_reversal: { $ne: true },
          period: { $in: periods }
        }
      },
      { $unwind: '$lines' },
      {
        $match: {
          'lines.account_code': { $gte: '4000', $lt: '8000' }
        }
      },
      {
        $group: {
          _id: '$lines.account_code',
          account_name: { $first: '$lines.account_name' },
          total_debit: { $sum: '$lines.debit' },
          total_credit: { $sum: '$lines.credit' }
        }
      }
    ]);

    for (const acct of glAgg) {
      const net = acct.total_debit - acct.total_credit;
      if (Math.abs(net) < 0.01) continue;

      // Close revenue accounts (4xxx have credit balances → debit to close)
      // Close expense accounts (5xxx-7xxx have debit balances → credit to close)
      if (net < 0) {
        // Credit balance (revenue, CREDIT-normal) → debit to close. DR on CREDIT-normal = contra.
        closingLines.push({
          account_code: acct._id,
          account_name: acct.account_name || acct._id,
          debit: Math.abs(net),
          credit: 0,
          description: `Year-end close FY${fiscalYear}`,
          is_contra: true
        });
        totalDebit += Math.abs(net);
      } else {
        // Debit balance (expense, DEBIT-normal) → credit to close. CR on DEBIT-normal = contra.
        closingLines.push({
          account_code: acct._id,
          account_name: acct.account_name || acct._id,
          debit: 0,
          credit: net,
          description: `Year-end close FY${fiscalYear}`,
          is_contra: true
        });
        totalCredit += net;
      }
    }

    // Net difference goes to 3200 Retained Earnings
    const retainedEarnings = Math.round((totalDebit - totalCredit) * 100) / 100;
    if (Math.abs(retainedEarnings) >= 0.01) {
      if (retainedEarnings > 0) {
        // Net income (revenue > expenses) → credit Retained Earnings
        closingLines.push({
          account_code: '3200',
          account_name: 'Retained Earnings',
          debit: 0,
          credit: retainedEarnings,
          description: `Net income transfer FY${fiscalYear}`
        });
      } else {
        // Net loss → debit Retained Earnings (CREDIT-normal equity). DR = contra.
        closingLines.push({
          account_code: '3200',
          account_name: 'Retained Earnings',
          debit: Math.abs(retainedEarnings),
          credit: 0,
          description: `Net loss transfer FY${fiscalYear}`,
          is_contra: true
        });
      }
    }

    if (closingLines.length > 0) {
      await createAndPostJournal(entityId, {
        je_date: new Date(`${fiscalYear}-12-31`),
        period: `${fiscalYear}-12`,
        description: `Year-End Closing Entry FY${fiscalYear}`,
        source_module: 'MANUAL',
        source_doc_ref: `FY-CLOSE-${fiscalYear}`,
        lines: closingLines,
        bir_flag: 'BOTH',
        vat_flag: 'N/A',
        created_by: userId
      });

      // Mark closing entries as done
      fyArchive.year_end_data.closing_entries_pending = false;
      await fyArchive.save();
    }
  } catch (closingErr) {
    console.error('[AUTO_JOURNAL_FAILURE] YearEndClose', closingErr.message);
    // Don't fail the entire close — data capture is done, JE can be retried
  }

  return fyArchive;
}

/**
 * Get fiscal year status
 */
async function getFiscalYearStatus(entityId, fiscalYear) {
  const record = await MonthlyArchive.findOne({
    entity_id: new mongoose.Types.ObjectId(entityId),
    record_type: 'FISCAL_YEAR',
    fiscal_year: fiscalYear
  }).lean();

  return record
    ? { status: record.fy_status, closed_at: record.fy_closed_at, data: record.year_end_data }
    : { status: 'OPEN', closed_at: null, data: null };
}

module.exports = {
  generatePnlReport,
  getPnlReport,
  computeCogs,
  computeSamplingDrCost,
  validateYearEndClose,
  executeYearEndClose,
  getFiscalYearStatus
};
