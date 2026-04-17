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

/**
 * Get MD visit count for a BDM on a specific date
 * @param {String} bdmUserId - CRM User._id of the BDM
 * @param {Date|String} date - The date to count visits for
 * @returns {Promise<Number>} Count of completed visits on that date
 */
async function getDailyMdCount(bdmUserId, date) {
  const d = new Date(date);
  const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
  const dayEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

  return Visit.countDocuments({
    user: bdmUserId,
    visitDate: { $gte: dayStart, $lte: dayEnd },
    status: 'completed'
  });
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
  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999);

  const pipeline = [
    {
      $match: {
        user: typeof bdmUserId === 'string'
          ? require('mongoose').Types.ObjectId.createFromHexString(bdmUserId)
          : bdmUserId,
        visitDate: { $gte: start, $lte: end },
        status: 'completed'
      }
    },
    {
      // Group by date (YYYY-MM-DD)
      $group: {
        _id: {
          $dateToString: { format: '%Y-%m-%d', date: '$visitDate', timezone: '+08:00' }
        },
        md_count: { $sum: 1 },
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

    counts[r._id] = {
      md_count: r.md_count,
      unique_doctors: r.doctors_visited.length,
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
  const d = new Date(date);
  const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
  const dayEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

  return Visit.find({
    user: bdmUserId,
    visitDate: { $gte: dayStart, $lte: dayEnd },
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
