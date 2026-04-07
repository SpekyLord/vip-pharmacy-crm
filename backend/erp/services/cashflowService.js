/**
 * Cashflow Statement Service — generates cashflow from POSTED journal entries
 *
 * PRD v5 §11.8 — Source: aggregate POSTED JE lines hitting cash/bank
 * accounts (1000-1015). Classify by source_module into sections.
 */
const mongoose = require('mongoose');
const JournalEntry = require('../models/JournalEntry');
const CashflowStatement = require('../models/CashflowStatement');

// Cash/bank account codes (1000-1015)
const CASH_CODES = ['1000', '1010', '1011', '1012', '1013', '1014', '1015'];

// source_module → cashflow section mapping
const SECTION_MAP = {
  SALES: 'operating',
  COLLECTION: 'operating',
  EXPENSE: 'operating',
  PAYROLL: 'operating',
  COMMISSION: 'operating',
  VAT: 'operating',
  PEOPLE_COMP: 'operating',
  AP: 'operating',
  DEPRECIATION: null,       // non-cash, exclude
  INTEREST: 'financing',
  OWNER: 'financing',
  MANUAL: 'operating',
  BANKING: 'operating',
  SERVICE_REVENUE: 'operating',
  PETTY_CASH: 'operating',
  INVENTORY: 'operating',
  IC_TRANSFER: 'financing'
};

/**
 * Generate cashflow statement for a period
 * @param {String|ObjectId} entityId
 * @param {String} period — "YYYY-MM"
 * @param {String} userId — who generated
 * @returns {Object} CashflowStatement document
 */
async function generateCashflow(entityId, period, userId) {
  const eId = typeof entityId === 'string' ? new mongoose.Types.ObjectId(entityId) : entityId;

  // Find all POSTED JEs for the period with cash account lines
  const pipeline = [
    {
      $match: {
        entity_id: eId,
        status: 'POSTED',
        period: period,
        'lines.account_code': { $in: CASH_CODES }
      }
    },
    { $unwind: '$lines' },
    { $match: { 'lines.account_code': { $in: CASH_CODES } } },
    {
      $group: {
        _id: '$source_module',
        total_debit: { $sum: '$lines.debit' },
        total_credit: { $sum: '$lines.credit' }
      }
    }
  ];

  const results = await JournalEntry.aggregate(pipeline);

  const operating = { lines: [], total: 0 };
  const investing = { lines: [], total: 0 };
  const financing = { lines: [], total: 0 };

  for (const row of results) {
    const netCash = row.total_debit - row.total_credit; // debit = cash in, credit = cash out
    const section = SECTION_MAP[row._id];

    if (!section) continue; // skip non-cash (depreciation)

    const line = {
      label: row._id,
      amount: Math.round(netCash * 100) / 100,
      source_module: row._id
    };

    if (section === 'operating') {
      operating.lines.push(line);
      operating.total += netCash;
    } else if (section === 'investing') {
      investing.lines.push(line);
      investing.total += netCash;
    } else if (section === 'financing') {
      financing.lines.push(line);
      financing.total += netCash;
    }
  }

  operating.total = Math.round(operating.total * 100) / 100;
  investing.total = Math.round(investing.total * 100) / 100;
  financing.total = Math.round(financing.total * 100) / 100;

  const netChange = Math.round((operating.total + investing.total + financing.total) * 100) / 100;

  // Get opening cash from previous period
  const prevPeriod = getPreviousPeriod(period);
  const prevCashflow = await CashflowStatement.findOne({ entity_id: eId, period: prevPeriod }).lean();
  const openingCash = prevCashflow ? prevCashflow.closing_cash : 0;
  const closingCash = Math.round((openingCash + netChange) * 100) / 100;

  // Upsert the statement
  const statement = await CashflowStatement.findOneAndUpdate(
    { entity_id: eId, period },
    {
      operating,
      investing,
      financing,
      net_change: netChange,
      opening_cash: openingCash,
      closing_cash: closingCash,
      generated_at: new Date(),
      generated_by: userId
    },
    { upsert: true, new: true }
  );

  return statement;
}

/**
 * Get previous period (YYYY-MM)
 */
function getPreviousPeriod(period) {
  const [y, m] = period.split('-').map(Number);
  if (m === 1) return `${y - 1}-12`;
  return `${y}-${String(m - 1).padStart(2, '0')}`;
}

module.exports = { generateCashflow };
