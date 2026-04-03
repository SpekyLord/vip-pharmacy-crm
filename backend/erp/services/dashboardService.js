/**
 * Dashboard Service — CEO KPIs, Summary Cards, MTD & PNL-YTD
 *
 * PRD §13.5: BOSS-style dashboard with 4 summary cards, MTD metrics, and PNL-YTD.
 * Uses existing services (arEngine, fifoEngine, expenseSummary) for aggregation.
 */
const mongoose = require('mongoose');
const SalesLine = require('../models/SalesLine');
const Collection = require('../models/Collection');
const InventoryLedger = require('../models/InventoryLedger');
const ProductMaster = require('../models/ProductMaster');
const IncomeReport = require('../models/IncomeReport');
const SmerEntry = require('../models/SmerEntry');
const ExpenseEntry = require('../models/ExpenseEntry');
const CarLogbookEntry = require('../models/CarLogbookEntry');

/**
 * Get current month start/end dates
 */
function currentMonthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return { start, end };
}

/**
 * Get current year start/end dates
 */
function currentYearRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const end = new Date(now.getFullYear() + 1, 0, 1);
  return { start, end };
}

/**
 * Summary cards: Total Sales, AR, Stock Value, Engagements
 * PRD §13.5 Section 2
 */
async function getSummary(entityId, bdmId, isAdmin) {
  const filter = {};
  if (entityId) filter.entity_id = new mongoose.Types.ObjectId(entityId);
  if (bdmId && !isAdmin) filter.bdm_id = new mongoose.Types.ObjectId(bdmId);

  // 1. Total Sales (all POSTED)
  const salesAgg = await SalesLine.aggregate([
    { $match: { ...filter, status: 'POSTED' } },
    { $group: { _id: null, total: { $sum: '$invoice_total' } } }
  ]);
  const totalSales = salesAgg[0]?.total || 0;

  // 2. Total Collections (all POSTED)
  const collAgg = await Collection.aggregate([
    { $match: { ...filter, status: 'POSTED' } },
    { $group: { _id: null, total: { $sum: '$cr_amount' } } }
  ]);
  const totalCollections = collAgg[0]?.total || 0;

  // 3. AR = Sales - Collections
  const accountsReceivable = Math.round((totalSales - totalCollections) * 100) / 100;

  // 4. Stock on Hand Value (sum of available_qty × purchase_price per product)
  const stockAgg = await InventoryLedger.aggregate([
    { $match: filter },
    {
      $group: {
        _id: { product_id: '$product_id', batch_lot_no: '$batch_lot_no' },
        total_in: { $sum: '$qty_in' },
        total_out: { $sum: '$qty_out' }
      }
    },
    { $addFields: { available: { $subtract: ['$total_in', '$total_out'] } } },
    { $match: { available: { $gt: 0 } } },
    {
      $group: {
        _id: '$_id.product_id',
        total_qty: { $sum: '$available' }
      }
    },
    {
      $lookup: {
        from: 'erp_product_master',
        localField: '_id',
        foreignField: '_id',
        as: 'product'
      }
    },
    { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
    {
      $group: {
        _id: null,
        value: { $sum: { $multiply: ['$total_qty', { $ifNull: ['$product.purchase_price', 0] }] } }
      }
    }
  ]);
  const stockOnHandValue = Math.round((stockAgg[0]?.value || 0) * 100) / 100;

  // 5. Engagements — placeholder (CRM Schedule not fully wired yet)
  const engagements = { visited: 0, target: 0, rate: 0 };

  return {
    total_sales: Math.round(totalSales * 100) / 100,
    total_collections: Math.round(totalCollections * 100) / 100,
    accounts_receivable: accountsReceivable,
    stock_on_hand_value: stockOnHandValue,
    engagements
  };
}

/**
 * Month-to-Date metrics
 * PRD §13.5 Section 3
 */
async function getMtd(entityId, bdmId, isAdmin) {
  const { start, end } = currentMonthRange();
  const filter = {};
  if (entityId) filter.entity_id = new mongoose.Types.ObjectId(entityId);
  if (bdmId && !isAdmin) filter.bdm_id = new mongoose.Types.ObjectId(bdmId);

  // Sales MTD
  const salesAgg = await SalesLine.aggregate([
    { $match: { ...filter, status: 'POSTED', csi_date: { $gte: start, $lt: end } } },
    { $group: { _id: null, total: { $sum: '$invoice_total' } } }
  ]);
  const salesMtd = salesAgg[0]?.total || 0;

  // Collections MTD
  const collAgg = await Collection.aggregate([
    { $match: { ...filter, status: 'POSTED', cr_date: { $gte: start, $lt: end } } },
    { $group: { _id: null, total: { $sum: '$cr_amount' } } }
  ]);
  const collectionsMtd = collAgg[0]?.total || 0;

  // Income MTD (from IncomeReport if exists)
  const now = new Date();
  const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const incomeFilter = { period: currentPeriod };
  if (entityId) incomeFilter.entity_id = new mongoose.Types.ObjectId(entityId);
  if (bdmId && !isAdmin) incomeFilter.bdm_id = new mongoose.Types.ObjectId(bdmId);

  const incomeAgg = await IncomeReport.aggregate([
    { $match: incomeFilter },
    { $group: { _id: null, total: { $sum: '$net_pay' } } }
  ]);
  const incomeMtd = incomeAgg[0]?.total || 0;

  // Engagements MTD — placeholder
  const engagementsMtd = { visited: 0, target: 0, rate: 0 };

  return {
    sales_mtd: Math.round(salesMtd * 100) / 100,
    collections_mtd: Math.round(collectionsMtd * 100) / 100,
    engagements_mtd: engagementsMtd,
    income_mtd: Math.round(incomeMtd * 100) / 100
  };
}

/**
 * Year-to-Date PNL
 * PRD §13.5 Section 4, Tab 4
 */
async function getPnlYtd(entityId, bdmId, isAdmin) {
  const { start, end } = currentYearRange();
  const filter = {};
  if (entityId) filter.entity_id = new mongoose.Types.ObjectId(entityId);
  if (bdmId && !isAdmin) filter.bdm_id = new mongoose.Types.ObjectId(bdmId);

  // Total Sales YTD (net of VAT for P&L)
  const salesAgg = await SalesLine.aggregate([
    { $match: { ...filter, status: 'POSTED', csi_date: { $gte: start, $lt: end } } },
    { $group: { _id: null, total: { $sum: '$total_net_of_vat' } } }
  ]);
  const totalSalesYtd = salesAgg[0]?.total || 0;

  // Total Expenses YTD (SMER + Car Logbook + ORE/ACCESS)
  const now = new Date();
  const yearStr = String(now.getFullYear());
  const periodFilter = { ...filter };

  // SMER
  const smerAgg = await SmerEntry.aggregate([
    { $match: { ...periodFilter, status: 'POSTED', period: { $regex: `^${yearStr}` } } },
    { $group: { _id: null, total: { $sum: '$total_reimbursable' } } }
  ]);
  const smerTotal = smerAgg[0]?.total || 0;

  // Car Logbook (official gas)
  const carAgg = await CarLogbookEntry.aggregate([
    { $match: { ...periodFilter, status: 'POSTED', period: { $regex: `^${yearStr}` } } },
    { $group: { _id: null, total: { $sum: '$official_gas_amount' } } }
  ]);
  const carTotal = carAgg[0]?.total || 0;

  // ORE + ACCESS
  const expAgg = await ExpenseEntry.aggregate([
    { $match: { ...periodFilter, status: 'POSTED', period: { $regex: `^${yearStr}` } } },
    { $group: { _id: null, total: { $sum: '$total_amount' } } }
  ]);
  const expTotal = expAgg[0]?.total || 0;

  // Partner rebates from Collections YTD
  const rebateAgg = await Collection.aggregate([
    { $match: { ...filter, status: 'POSTED', cr_date: { $gte: start, $lt: end } } },
    { $group: { _id: null, total: { $sum: '$total_partner_rebates' } } }
  ]);
  const rebateTotal = rebateAgg[0]?.total || 0;

  const totalExpensesYtd = smerTotal + carTotal + expTotal + rebateTotal;
  const netPnlYtd = totalSalesYtd - totalExpensesYtd;

  return {
    total_sales_ytd: Math.round(totalSalesYtd * 100) / 100,
    total_expenses_ytd: Math.round(totalExpensesYtd * 100) / 100,
    net_pnl_ytd: Math.round(netPnlYtd * 100) / 100
  };
}

/**
 * Product stock levels for bottom tab "Product Master"
 */
async function getProductStockLevels(entityId, bdmId, isAdmin) {
  const filter = {};
  if (entityId) filter.entity_id = new mongoose.Types.ObjectId(entityId);
  if (bdmId && !isAdmin) filter.bdm_id = new mongoose.Types.ObjectId(bdmId);

  const result = await InventoryLedger.aggregate([
    { $match: filter },
    {
      $group: {
        _id: '$product_id',
        total_in: { $sum: '$qty_in' },
        total_out: { $sum: '$qty_out' }
      }
    },
    { $addFields: { available: { $subtract: ['$total_in', '$total_out'] } } },
    { $match: { available: { $gt: 0 } } },
    {
      $lookup: {
        from: 'erp_product_master',
        localField: '_id',
        foreignField: '_id',
        as: 'product'
      }
    },
    { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        product_id: '$_id',
        brand_name: '$product.brand_name',
        dosage_strength: '$product.dosage_strength',
        sold_per: '$product.sold_per',
        selling_price: '$product.selling_price',
        purchase_price: '$product.purchase_price',
        available_qty: '$available',
        stock_value: { $multiply: ['$available', { $ifNull: ['$product.purchase_price', 0] }] }
      }
    },
    { $sort: { brand_name: 1 } }
  ]);

  return result;
}

module.exports = {
  getSummary,
  getMtd,
  getPnlYtd,
  getProductStockLevels,
  currentMonthRange,
  currentYearRange
};
