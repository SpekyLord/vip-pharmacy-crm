/**
 * AR Engine — Accounts Receivable computed on-read
 *
 * AR = POSTED SalesLines minus POSTED Collections (settled amounts)
 * Never stored on SalesLine — always aggregated fresh from the ledger.
 */
const mongoose = require('mongoose');
const SalesLine = require('../models/SalesLine');
const Collection = require('../models/Collection');

/**
 * Get open (unpaid/partially-paid) CSIs for a hospital
 * Returns CSIs with balance_due > 0
 */
async function getOpenCsis(entityId, bdmId, hospitalId, customerId) {
  const match = { status: 'POSTED', deletion_event_id: { $exists: false } };
  if (entityId) match.entity_id = new mongoose.Types.ObjectId(entityId);
  if (bdmId) match.bdm_id = new mongoose.Types.ObjectId(bdmId);
  if (hospitalId) match.hospital_id = new mongoose.Types.ObjectId(hospitalId);
  if (customerId) match.customer_id = new mongoose.Types.ObjectId(customerId);

  const pipeline = [
    { $match: match },
    {
      $lookup: {
        from: 'erp_collections',
        let: { slId: '$_id' },
        pipeline: [
          { $match: { status: 'POSTED', deletion_event_id: { $exists: false } } },
          { $unwind: '$settled_csis' },
          { $match: { $expr: { $eq: ['$settled_csis.sales_line_id', '$$slId'] } } },
          { $group: { _id: null, total_collected: { $sum: '$settled_csis.invoice_amount' } } }
        ],
        as: 'collections'
      }
    },
    {
      $addFields: {
        amount_collected: {
          $ifNull: [{ $arrayElemAt: ['$collections.total_collected', 0] }, 0]
        }
      }
    },
    {
      $addFields: {
        balance_due: { $subtract: ['$invoice_total', '$amount_collected'] },
        days_outstanding: {
          $dateDiff: { startDate: '$csi_date', endDate: '$$NOW', unit: 'day' }
        }
      }
    },
    { $match: { balance_due: { $gt: 0.01 } } },
    {
      $lookup: {
        from: 'erp_hospitals',
        localField: 'hospital_id',
        foreignField: '_id',
        as: 'hospital'
      }
    },
    { $unwind: { path: '$hospital', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 1, doc_ref: 1, csi_date: 1, hospital_id: 1, bdm_id: 1, warehouse_id: 1,
        invoice_total: 1, total_net_of_vat: 1, source: 1,
        amount_collected: 1, balance_due: 1, days_outstanding: 1,
        hospital_name: '$hospital.hospital_name',
        line_items: 1
      }
    },
    { $sort: { csi_date: 1 } }
  ];

  return SalesLine.aggregate(pipeline);
}

/**
 * Get AR aging — bucket open CSIs by days outstanding
 */
async function getArAging(entityId, bdmId, hospitalId) {
  const openCsis = await getOpenCsis(entityId, bdmId, hospitalId);

  const buckets = { CURRENT: 0, OVERDUE_30: 0, OVERDUE_60: 0, OVERDUE_90: 0, OVERDUE_120: 0 };
  const hospitalMap = new Map();

  for (const csi of openCsis) {
    const days = csi.days_outstanding || 0;
    let bucket;
    if (days <= 30) bucket = 'CURRENT';
    else if (days <= 60) bucket = 'OVERDUE_30';
    else if (days <= 90) bucket = 'OVERDUE_60';
    else if (days <= 120) bucket = 'OVERDUE_90';
    else bucket = 'OVERDUE_120';

    buckets[bucket] += csi.balance_due;

    const hid = csi.hospital_id.toString();
    if (!hospitalMap.has(hid)) {
      hospitalMap.set(hid, {
        hospital_id: csi.hospital_id,
        hospital_name: csi.hospital_name || '—',
        CURRENT: 0, OVERDUE_30: 0, OVERDUE_60: 0, OVERDUE_90: 0, OVERDUE_120: 0,
        total_ar: 0, worst_days: 0, csis: []
      });
    }
    const h = hospitalMap.get(hid);
    h[bucket] += csi.balance_due;
    h.total_ar += csi.balance_due;
    if (days > h.worst_days) h.worst_days = days;
    h.csis.push({ ...csi, aging_bucket: bucket });
  }

  const hospitals = [...hospitalMap.values()].sort((a, b) => b.total_ar - a.total_ar);
  const totalAr = hospitals.reduce((sum, h) => sum + h.total_ar, 0);

  return {
    summary: {
      total_ar: Math.round(totalAr * 100) / 100,
      total_csis: openCsis.length,
      buckets: Object.fromEntries(Object.entries(buckets).map(([k, v]) => [k, Math.round(v * 100) / 100]))
    },
    hospitals
  };
}

/**
 * Collection rate = total collections / total sales × 100%
 */
async function getCollectionRate(entityId, bdmId, dateFrom, dateTo) {
  const salesMatch = { status: 'POSTED', deletion_event_id: { $exists: false } };
  const collMatch = { status: 'POSTED', deletion_event_id: { $exists: false } };

  if (entityId) {
    salesMatch.entity_id = new mongoose.Types.ObjectId(entityId);
    collMatch.entity_id = new mongoose.Types.ObjectId(entityId);
  }
  if (bdmId) {
    salesMatch.bdm_id = new mongoose.Types.ObjectId(bdmId);
    collMatch.bdm_id = new mongoose.Types.ObjectId(bdmId);
  }
  if (dateFrom || dateTo) {
    const dateFilter = {};
    if (dateFrom) dateFilter.$gte = new Date(dateFrom);
    if (dateTo) dateFilter.$lte = new Date(dateTo);
    salesMatch.csi_date = dateFilter;
    collMatch.cr_date = dateFilter;
  }

  const [salesAgg] = await SalesLine.aggregate([
    { $match: salesMatch },
    { $group: { _id: null, total: { $sum: '$invoice_total' } } }
  ]);
  const [collAgg] = await Collection.aggregate([
    { $match: collMatch },
    { $group: { _id: null, total: { $sum: '$cr_amount' } } }
  ]);

  const totalSales = salesAgg?.total || 0;
  const totalCollections = collAgg?.total || 0;
  const rate = totalSales > 0 ? (totalCollections / totalSales) : 0;

  // Use configurable threshold from Settings (not hardcoded 70%)
  const Settings = require('../models/Settings');
  const settings = await Settings.getSettings();
  const thresholdPct = (settings?.COLLECTION_OK_THRESHOLD || 0.70) * 100;

  return {
    total_sales: Math.round(totalSales * 100) / 100,
    total_collections: Math.round(totalCollections * 100) / 100,
    collection_rate: Math.round(rate * 10000) / 100,
    threshold: thresholdPct,
    status: rate >= (thresholdPct / 100) ? 'GREEN' : 'RED'
  };
}

/**
 * Simple AR balance for a hospital (for credit limit check)
 */
async function getHospitalArBalance(hospitalId, entityId) {
  const openCsis = await getOpenCsis(entityId, null, hospitalId);
  return openCsis.reduce((sum, csi) => sum + (csi.balance_due || 0), 0);
}

module.exports = { getOpenCsis, getArAging, getCollectionRate, getHospitalArBalance };
