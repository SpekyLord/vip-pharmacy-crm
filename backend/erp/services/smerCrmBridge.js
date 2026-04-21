/**
 * SMER ↔ CRM Bridge — Pulls MD visit counts from CRM visit logs
 *
 * CRM Visit model tracks every BDM visit to a Doctor (VIP Client / MD):
 *   Visit.user     = BDM who visited
 *   Visit.doctor   = MD/VIP Client visited
 *   Visit.visitDate = date of visit
 *   Visit.status   = 'completed'
 *
 * This bridge counts completed visits per day per BDM to auto-populate
 * the SMER md_count field, which drives per diem tier calculation:
 *   ≥ 8 MDs → FULL (100% per diem)
 *   ≥ 3 MDs → HALF (50% per diem)
 *   < 3 MDs → ZERO (0% per diem)
 *
 * Benefits over manual entry:
 * - Exact count from system (BDM can't miscount)
 * - Audit trail (each count traceable to actual visit records with GPS + photos)
 * - Auto-populated when generating SMER daily entries
 */

const Visit = require('../../models/Visit');
const Doctor = require('../../models/Doctor');

// Manila (UTC+8) — all day boundaries are anchored to Manila calendar days so a
// 1am-Manila visit (which lands at 5pm UTC the previous day) does not drop out
// of the query window when the server runs in UTC. Matches the inline +08:00
// convention used across Visit.js and the aggregation $dateToString below.
const MANILA_TZ = '+08:00';

function toManilaDateKey(date) {
  const d = date instanceof Date ? date : new Date(date);
  return new Date(d.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function manilaDayStart(dateKey) {
  return new Date(`${dateKey}T00:00:00${MANILA_TZ}`);
}

function manilaDayEnd(dateKey) {
  return new Date(`${dateKey}T23:59:59.999${MANILA_TZ}`);
}

/**
 * Get MD visit count for a BDM on a specific date
 * @param {String} bdmUserId - CRM User._id of the BDM
 * @param {Date|String} date - The date to count visits for (Manila calendar day)
 * @returns {Promise<Number>} Count of DISTINCT MDs visited that day (per-person)
 */
async function getDailyMdCount(bdmUserId, date) {
  const dateKey = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(date)
    ? date.slice(0, 10)
    : toManilaDateKey(date);

  const distinct = await Visit.distinct('doctor', {
    user: bdmUserId,
    visitDate: { $gte: manilaDayStart(dateKey), $lte: manilaDayEnd(dateKey) },
    status: 'completed'
  });
  return distinct.length;
}

/**
 * Get MD visit counts for a BDM across a date range (for SMER generation)
 * Returns a map of date string → visit count
 * @param {String} bdmUserId
 * @param {Date|String} startDate
 * @param {Date|String} endDate
 * @returns {Promise<Object>} { "2026-04-01": 8, "2026-04-02": 5, ... }
 */
async function getDailyMdCounts(bdmUserId, startDate, endDate) {
  // Accept Date objects or YYYY-MM-DD strings; normalize to Manila calendar keys.
  const startKey = typeof startDate === 'string' && /^\d{4}-\d{2}-\d{2}/.test(startDate)
    ? startDate.slice(0, 10)
    : toManilaDateKey(startDate);
  const endKey = typeof endDate === 'string' && /^\d{4}-\d{2}-\d{2}/.test(endDate)
    ? endDate.slice(0, 10)
    : toManilaDateKey(endDate);

  const pipeline = [
    {
      $match: {
        user: typeof bdmUserId === 'string'
          ? require('mongoose').Types.ObjectId.createFromHexString(bdmUserId)
          : bdmUserId,
        visitDate: { $gte: manilaDayStart(startKey), $lte: manilaDayEnd(endKey) },
        status: 'completed'
      }
    },
    {
      // Group by Manila calendar day (YYYY-MM-DD), de-dup doctors per day.
      $group: {
        _id: {
          $dateToString: { format: '%Y-%m-%d', date: '$visitDate', timezone: MANILA_TZ }
        },
        doctors_visited: { $addToSet: '$doctor' }
      }
    },
    {
      $sort: { _id: 1 }
    }
  ];

  const results = await Visit.aggregate(pipeline);

  // Collect all unique doctor IDs across all days to batch-fetch addresses
  const allDoctorIds = new Set();
  for (const r of results) {
    for (const docId of r.doctors_visited) allDoctorIds.add(docId.toString());
  }
  const doctorMap = new Map();
  if (allDoctorIds.size > 0) {
    const doctors = await Doctor.find({ _id: { $in: [...allDoctorIds] } })
      .select('firstName lastName clinicOfficeAddress').lean();
    for (const d of doctors) doctorMap.set(d._id.toString(), d);
  }

  const counts = {};
  for (const r of results) {
    // Build location summary from visited doctors' addresses
    const addresses = r.doctors_visited
      .map(id => doctorMap.get(id.toString())?.clinicOfficeAddress)
      .filter(Boolean);
    const uniqueAddresses = [...new Set(addresses)];

    // md_count is "per-person" — count DISTINCT MDs visited that day, not raw
    // visit rows. The weekly-unique index makes these equal today, but naming
    // them identically removes ambiguity if that constraint ever loosens.
    const uniqueMdCount = r.doctors_visited.length;
    counts[r._id] = {
      md_count: uniqueMdCount,
      unique_doctors: uniqueMdCount,
      locations: uniqueAddresses.join(', ')
    };
  }
  return counts;
}

/**
 * Get detailed visit info for a BDM on a specific date (for SMER drill-down)
 * Returns the actual doctors visited with their names
 * @param {String} bdmUserId
 * @param {Date|String} date
 * @returns {Promise<Array>} [{ doctor_id, doctor_name, visitDate, ... }]
 */
async function getDailyVisitDetails(bdmUserId, date) {
  const dateKey = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(date)
    ? date.slice(0, 10)
    : toManilaDateKey(date);

  return Visit.find({
    user: bdmUserId,
    visitDate: { $gte: manilaDayStart(dateKey), $lte: manilaDayEnd(dateKey) },
    status: 'completed'
  })
    .populate('doctor', 'firstName lastName specialization clinicOfficeAddress')
    .select('doctor visitDate visitType engagementTypes weekLabel')
    .sort({ visitDate: 1 })
    .lean();
}

module.exports = {
  getDailyMdCount,
  getDailyMdCounts,
  getDailyVisitDetails
};
