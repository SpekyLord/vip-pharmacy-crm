/**
 * Consignment Report Service — Consolidated Consignment Aging Report
 * Phase 14.2
 */
const mongoose = require('mongoose');
const ConsignmentTracker = require('../models/ConsignmentTracker');

const AGING_SORT_ORDER = { OVERDUE: 1, FORCE_CSI: 2, OPEN: 3, COLLECTED: 4 };

/**
 * getConsolidatedConsignmentAging — cross-BDM consignment aging view
 */
async function getConsolidatedConsignmentAging(entityId, filters = {}) {
  const eId = new mongoose.Types.ObjectId(entityId);
  const match = { entity_id: eId, status: 'ACTIVE' };

  if (filters.bdm_id) match.bdm_id = new mongoose.Types.ObjectId(filters.bdm_id);
  if (filters.hospital_id) match.hospital_id = new mongoose.Types.ObjectId(filters.hospital_id);
  if (filters.aging_status) match.aging_status = filters.aging_status;

  const now = new Date();

  const items = await ConsignmentTracker.aggregate([
    { $match: match },
    // Recompute days_outstanding live
    {
      $addFields: {
        days_outstanding_live: { $floor: { $divide: [{ $subtract: [now, '$dr_date'] }, 86400000] } },
        aging_status_live: {
          // Phase H6 — SAMPLING dispatches never convert to sale, so they
          // skip FORCE_CSI. OPEN → OVERDUE → COLLECTED only.
          $switch: {
            branches: [
              { case: { $lte: ['$qty_remaining', 0] }, then: 'COLLECTED' },
              {
                case: {
                  $and: [
                    { $ne: ['$dispatch_type', 'SAMPLING'] },
                    { $gte: [{ $floor: { $divide: [{ $subtract: [now, '$dr_date'] }, 86400000] } }, '$max_days_force_csi'] }
                  ]
                },
                then: 'FORCE_CSI'
              },
              { case: { $gte: [{ $floor: { $divide: [{ $subtract: [now, '$dr_date'] }, 86400000] } }, '$max_days_alert'] }, then: 'OVERDUE' }
            ],
            default: 'OPEN'
          }
        }
      }
    },
    // Lookup BDM name
    { $lookup: { from: 'users', localField: 'bdm_id', foreignField: '_id', as: 'bdm' } },
    { $unwind: { path: '$bdm', preserveNullAndEmptyArrays: true } },
    // Lookup hospital
    { $lookup: { from: 'erp_hospitals', localField: 'hospital_id', foreignField: '_id', as: 'hospital' } },
    { $unwind: { path: '$hospital', preserveNullAndEmptyArrays: true } },
    // Lookup product
    { $lookup: { from: 'erp_product_master', localField: 'product_id', foreignField: '_id', as: 'product' } },
    { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
    // Sort order
    {
      $addFields: {
        sort_order: {
          $switch: {
            branches: [
              { case: { $eq: ['$aging_status_live', 'OVERDUE'] }, then: 1 },
              { case: { $eq: ['$aging_status_live', 'FORCE_CSI'] }, then: 2 },
              { case: { $eq: ['$aging_status_live', 'OPEN'] }, then: 3 },
              { case: { $eq: ['$aging_status_live', 'COLLECTED'] }, then: 4 }
            ],
            default: 5
          }
        }
      }
    },
    { $sort: { sort_order: 1, days_outstanding_live: -1 } },
    {
      $project: {
        bdm_id: 1,
        bdm_name: { $ifNull: ['$bdm.name', 'Unknown'] },
        hospital_name: { $ifNull: ['$hospital.name', '$hospital_name'] },
        hospital_id: 1,
        dr_ref: 1,
        dr_date: 1,
        product_name: {
          $concat: [
            { $ifNull: ['$product.brand_name', ''] },
            ' ',
            { $ifNull: ['$product.dosage_strength', ''] }
          ]
        },
        product_id: 1,
        qty_delivered: 1,
        qty_consumed: 1,
        qty_remaining: 1,
        days_outstanding: '$days_outstanding_live',
        aging_status: '$aging_status_live',
        max_days_alert: 1,
        max_days_force_csi: 1
      }
    }
  ]);

  // Summary counts
  const summary = { total: items.length, open: 0, overdue: 0, force_csi: 0, collected: 0 };
  for (const item of items) {
    if (item.aging_status === 'OPEN') summary.open++;
    else if (item.aging_status === 'OVERDUE') summary.overdue++;
    else if (item.aging_status === 'FORCE_CSI') summary.force_csi++;
    else if (item.aging_status === 'COLLECTED') summary.collected++;
  }

  return { summary, items };
}

module.exports = {
  getConsolidatedConsignmentAging
};
