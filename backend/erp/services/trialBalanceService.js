/**
 * Trial Balance Service — aggregate POSTED JE lines by account
 *
 * PRD v5 §11.6 — Generates trial balance for a period.
 * Flags ABNORMAL balances (net balance opposite to normal_balance).
 * Bottom-line check: total debits must equal total credits.
 */
const mongoose = require('mongoose');
const JournalEntry = require('../models/JournalEntry');
const ChartOfAccounts = require('../models/ChartOfAccounts');

/**
 * Generate Trial Balance for entity up to (and including) the given period
 * @param {String|ObjectId} entityId
 * @param {String} period — "YYYY-MM" (cumulative up to this month)
 * @returns {Object} { accounts[], total_debit, total_credit, is_balanced }
 */
async function generateTrialBalance(entityId, period) {
  const eId = typeof entityId === 'string' ? new mongoose.Types.ObjectId(entityId) : entityId;

  // Aggregate all POSTED JE lines up to period
  const pipeline = [
    {
      $match: {
        entity_id: eId,
        status: 'POSTED',
        period: { $lte: period }
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

  const aggregated = await JournalEntry.aggregate(pipeline);

  // Get COA metadata for each account
  const coaMap = new Map();
  const coa = await ChartOfAccounts.find({ entity_id: eId, is_active: true }).lean();
  for (const acct of coa) {
    coaMap.set(acct.account_code, acct);
  }

  let grandDebit = 0;
  let grandCredit = 0;

  const accounts = aggregated.map(row => {
    const coaInfo = coaMap.get(row._id) || {};
    const netBalance = row.total_debit - row.total_credit;
    const balanceDirection = netBalance >= 0 ? 'DEBIT' : 'CREDIT';
    const expectedBalance = coaInfo.normal_balance || 'DEBIT';
    const isAbnormal = balanceDirection !== expectedBalance && Math.abs(netBalance) > 0.01;

    grandDebit += row.total_debit;
    grandCredit += row.total_credit;

    return {
      account_code: row._id,
      account_name: row.account_name || coaInfo.account_name || '',
      account_type: coaInfo.account_type || '',
      account_subtype: coaInfo.account_subtype || '',
      normal_balance: expectedBalance,
      total_debit: Math.round(row.total_debit * 100) / 100,
      total_credit: Math.round(row.total_credit * 100) / 100,
      net_balance: Math.round(Math.abs(netBalance) * 100) / 100,
      balance_direction: balanceDirection,
      is_abnormal: isAbnormal
    };
  });

  return {
    period,
    accounts,
    total_debit: Math.round(grandDebit * 100) / 100,
    total_credit: Math.round(grandCredit * 100) / 100,
    is_balanced: Math.abs(grandDebit - grandCredit) <= 0.01
  };
}

module.exports = { generateTrialBalance };
