/**
 * IC AR Engine — Inter-Company Accounts Receivable computed on-read
 *
 * IC AR = POSTED IC Transfers (VIP's CSIs to subsidiaries) minus POSTED IC Settlements.
 * Pattern mirrors arEngine.js but for inter-company receivables instead of hospital CSIs.
 */
const mongoose = require('mongoose');
const InterCompanyTransfer = require('../models/InterCompanyTransfer');
const IcSettlement = require('../models/IcSettlement');

/**
 * Get open (unpaid/partially-paid) IC Transfers for a debtor entity.
 * Returns transfers with balance_due > 0.
 */
async function getOpenIcTransfers(creditorEntityId, debtorEntityId) {
  const match = { status: 'POSTED' };
  if (creditorEntityId) match.source_entity_id = new mongoose.Types.ObjectId(creditorEntityId);
  if (debtorEntityId) match.target_entity_id = new mongoose.Types.ObjectId(debtorEntityId);

  const pipeline = [
    { $match: match },
    {
      $lookup: {
        from: 'erp_ic_settlements',
        let: { tfrId: '$_id' },
        pipeline: [
          { $match: { status: 'POSTED' } },
          { $unwind: '$settled_transfers' },
          { $match: { $expr: { $eq: ['$settled_transfers.transfer_id', '$$tfrId'] } } },
          { $group: { _id: null, total_settled: { $sum: '$settled_transfers.amount_settled' } } }
        ],
        as: 'settlements'
      }
    },
    {
      $addFields: {
        amount_settled: {
          $ifNull: [{ $arrayElemAt: ['$settlements.total_settled', 0] }, 0]
        }
      }
    },
    {
      $addFields: {
        balance_due: { $subtract: ['$total_amount', '$amount_settled'] },
        days_outstanding: {
          $dateDiff: { startDate: '$transfer_date', endDate: '$$NOW', unit: 'day' }
        }
      }
    },
    { $match: { balance_due: { $gt: 0.01 } } },
    {
      $lookup: {
        from: 'entities',
        localField: 'target_entity_id',
        foreignField: '_id',
        as: 'debtor_entity'
      }
    },
    { $unwind: { path: '$debtor_entity', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'entities',
        localField: 'source_entity_id',
        foreignField: '_id',
        as: 'creditor_entity'
      }
    },
    { $unwind: { path: '$creditor_entity', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 1, transfer_ref: 1, csi_ref: 1, transfer_date: 1,
        source_entity_id: 1, target_entity_id: 1,
        total_amount: 1, total_items: 1, line_items: 1,
        amount_settled: 1, balance_due: 1, days_outstanding: 1,
        debtor_name: '$debtor_entity.entity_name',
        creditor_name: '$creditor_entity.entity_name'
      }
    },
    { $sort: { transfer_date: 1 } }
  ];

  return InterCompanyTransfer.aggregate(pipeline);
}

/**
 * IC AR Summary — per-subsidiary totals for president dashboard.
 */
async function getIcArSummary(creditorEntityId) {
  const openTransfers = await getOpenIcTransfers(creditorEntityId, null);

  const subsidiaryMap = new Map();
  for (const t of openTransfers) {
    const did = t.target_entity_id.toString();
    if (!subsidiaryMap.has(did)) {
      subsidiaryMap.set(did, {
        debtor_entity_id: t.target_entity_id,
        debtor_name: t.debtor_name || '—',
        total_owed: 0, total_settled: 0, balance: 0,
        open_transfers: 0, worst_days: 0
      });
    }
    const s = subsidiaryMap.get(did);
    s.total_owed += t.total_amount;
    s.total_settled += t.amount_settled;
    s.balance += t.balance_due;
    s.open_transfers++;
    if (t.days_outstanding > s.worst_days) s.worst_days = t.days_outstanding;
  }

  const subsidiaries = [...subsidiaryMap.values()].sort((a, b) => b.balance - a.balance);
  const totalBalance = subsidiaries.reduce((sum, s) => sum + s.balance, 0);

  return {
    total_ic_ar: Math.round(totalBalance * 100) / 100,
    total_open_transfers: openTransfers.length,
    subsidiaries
  };
}

/**
 * IC AR for a specific subsidiary — transfer-level detail.
 */
async function getIcArBySubsidiary(creditorEntityId, debtorEntityId) {
  return getOpenIcTransfers(creditorEntityId, debtorEntityId);
}

module.exports = { getOpenIcTransfers, getIcArSummary, getIcArBySubsidiary };
