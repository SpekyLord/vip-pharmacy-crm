/**
 * CWT Service — CWT Ledger management and BIR 2307 summary.
 *
 * PRD v5 §11.5 — CWT entries auto-created from collections with CWT.
 * 2307 summary aggregates per hospital per quarter.
 *
 * Phase VIP-1.J / J6 (May 2026) — Reconciliation fields default at write
 * time so every collection-driven row starts in `PENDING_2307` and tags
 * the calendar year as the natural 1702 credit year. Bookkeeper flips
 * status via cwt2307ReconciliationService.markReceived once the hospital
 * sends the certificate.
 */
const CwtLedger = require('../models/CwtLedger');

/**
 * Create a CWT ledger entry. New rows default to PENDING_2307 status with
 * the calendar year as the 1702 tagging year — bookkeeper or finance can
 * later flip status / retag year via cwt2307ReconciliationService.
 */
async function createCwtEntry(data) {
  return CwtLedger.create({
    entity_id: data.entity_id,
    bdm_id: data.bdm_id,
    period: data.period,
    hospital_id: data.hospital_id,
    hospital_tin: data.hospital_tin,
    cr_no: data.cr_no,
    cr_date: data.cr_date,
    cr_amount: data.cr_amount || 0,
    cwt_rate: data.cwt_rate || 0.02,
    cwt_amount: data.cwt_amount || 0,
    atc_code: data.atc_code,
    quarter: data.quarter,
    year: data.year,
    // J6 — reconciliation defaults
    status: data.status || 'PENDING_2307',
    tagged_for_1702_year: data.tagged_for_1702_year || data.year,
  });
}

/**
 * Get CWT ledger for a period
 */
async function getCwtLedger(entityId, period) {
  const filter = { entity_id: entityId };
  if (period) filter.period = period;

  return CwtLedger.find(filter).sort({ cr_date: -1 }).lean();
}

/**
 * Compute BIR 2307 summary — per hospital per quarter
 */
async function computeCwt2307Summary(entityId, quarter, year) {
  const pipeline = [
    { $match: { entity_id: entityId, quarter, year } },
    {
      $group: {
        _id: {
          hospital_id: '$hospital_id',
          hospital_tin: '$hospital_tin'
        },
        total_cr_amount: { $sum: '$cr_amount' },
        total_cwt_amount: { $sum: '$cwt_amount' },
        certificates: { $push: { cr_no: '$cr_no', cr_date: '$cr_date', cr_amount: '$cr_amount', cwt_amount: '$cwt_amount' } },
        count: { $sum: 1 }
      }
    },
    { $sort: { total_cwt_amount: -1 } }
  ];

  const results = await CwtLedger.aggregate(pipeline);

  const grandTotal = results.reduce((sum, r) => sum + r.total_cwt_amount, 0);

  return {
    quarter,
    year,
    hospitals: results.map(r => ({
      hospital_id: r._id.hospital_id,
      hospital_tin: r._id.hospital_tin,
      total_cr_amount: r.total_cr_amount,
      total_cwt_amount: r.total_cwt_amount,
      certificate_count: r.count,
      certificates: r.certificates
    })),
    grand_total_cwt: grandTotal,
    hospital_count: results.length
  };
}

module.exports = {
  createCwtEntry,
  getCwtLedger,
  computeCwt2307Summary
};
