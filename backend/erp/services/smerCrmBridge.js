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
const CarLogbookEntry = require('../models/CarLogbookEntry');

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
 *
 * Phase G1.5 (Apr 2026):
 * - Optional `skipFlagged` flag — when true, visits with non-empty photoFlags
 *   (duplicate_photo, date_mismatch, etc.) are excluded from the count. Flagged
 *   visits stay in CRM (audit trail preserved); only per-diem credit drops.
 * - `locations` now uses structured `locality, province` from Doctor (per Rule #3 +
 *   user preference for "Iloilo City, Iloilo" style notes). Falls back to raw
 *   clinicOfficeAddress when a legacy doctor has no locality/province yet (post
 *   backfill, all doctors should have these fields).
 *
 * @param {String} bdmUserId
 * @param {Date|String} startDate
 * @param {Date|String} endDate
 * @param {Object} [opts]
 * @param {Boolean} [opts.skipFlagged=false] - Skip visits with photoFlags (per-diem integrity)
 * @returns {Promise<Object>} { "2026-04-01": { md_count, unique_doctors, locations }, ... }
 */
async function getDailyMdCounts(bdmUserId, startDate, endDate, opts = {}) {
  const { skipFlagged = false, source = 'visit' } = opts;

  // Phase G1.6 — dispatch by eligibility source. 'visit' = pharma CRM Visit model
  // (default); 'logbook' = CarLogbook (non-pharma worked-day credit); 'manual'/'none'
  // return empty so expenseController falls back to md_count=0 for every day.
  if (source === 'logbook') return getDailyLogbookCounts(bdmUserId, startDate, endDate);
  if (source === 'manual' || source === 'none') return {};

  // Accept Date objects or YYYY-MM-DD strings; normalize to Manila calendar keys.
  const startKey = typeof startDate === 'string' && /^\d{4}-\d{2}-\d{2}/.test(startDate)
    ? startDate.slice(0, 10)
    : toManilaDateKey(startDate);
  const endKey = typeof endDate === 'string' && /^\d{4}-\d{2}-\d{2}/.test(endDate)
    ? endDate.slice(0, 10)
    : toManilaDateKey(endDate);

  const baseMatch = {
    user: typeof bdmUserId === 'string'
      ? require('mongoose').Types.ObjectId.createFromHexString(bdmUserId)
      : bdmUserId,
    visitDate: { $gte: manilaDayStart(startKey), $lte: manilaDayEnd(endKey) },
    status: 'completed'
  };

  // Phase G1.5 — flagged-photo filter. Non-flagged visits either have photoFlags
  // missing (sparse index) or empty array. Match both shapes.
  if (skipFlagged) {
    baseMatch.$or = [
      { photoFlags: { $exists: false } },
      { photoFlags: { $size: 0 } }
    ];
  }

  const pipeline = [
    { $match: baseMatch },
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
      .select('firstName lastName clinicOfficeAddress locality province').lean();
    for (const d of doctors) doctorMap.set(d._id.toString(), d);
  }

  const counts = {};
  for (const r of results) {
    // Phase G1.5 — build location summary from structured locality+province.
    // Format: "Iloilo City, Iloilo" or "Digos City, Davao del Sur".
    // Fallback to clinicOfficeAddress for pre-backfill legacy doctors.
    const locationLabels = r.doctors_visited
      .map(id => {
        const d = doctorMap.get(id.toString());
        if (!d) return null;
        if (d.locality && d.province) return `${d.locality}, ${d.province}`;
        if (d.locality) return d.locality;
        if (d.clinicOfficeAddress) return d.clinicOfficeAddress;
        return null;
      })
      .filter(Boolean);
    const uniqueLocations = [...new Set(locationLabels)];

    // md_count is "per-person" — count DISTINCT MDs visited that day, not raw
    // visit rows. The weekly-unique index makes these equal today, but naming
    // them identically removes ambiguity if that constraint ever loosens.
    const uniqueMdCount = r.doctors_visited.length;
    counts[r._id] = {
      md_count: uniqueMdCount,
      unique_doctors: uniqueMdCount,
      locations: uniqueLocations.join('; ')
    };
  }
  return counts;
}

/**
 * Phase G1.6 — Logbook-sourced daily credits for non-pharma subscribers.
 *
 * Semantics: 1 POSTED CarLogbookEntry per day with official_km > 0 = 1 worked-day credit.
 * md_count returns the binary 0/1 "did the BDM work?" signal. Admin configures
 * PERDIEM_RATES.{role}.metadata.full_tier_threshold=1 (or similar) so any worked
 * day triggers full per-diem. Locations come from the CarLogbookEntry.destination
 * field (falls back to notes when destination is blank).
 *
 * Why POSTED-only: DRAFT/VALID/ERROR entries are in-progress and not audited.
 * Paying per-diem on an un-posted entry risks double-payment on reopen/edit.
 *
 * @param {String} bdmUserId
 * @param {Date|String} startDate
 * @param {Date|String} endDate
 * @returns {Promise<Object>} Same shape as getDailyMdCounts:
 *   { "2026-04-01": { md_count, unique_doctors, locations }, ... }
 */
async function getDailyLogbookCounts(bdmUserId, startDate, endDate) {
  const startKey = typeof startDate === 'string' && /^\d{4}-\d{2}-\d{2}/.test(startDate)
    ? startDate.slice(0, 10)
    : toManilaDateKey(startDate);
  const endKey = typeof endDate === 'string' && /^\d{4}-\d{2}-\d{2}/.test(endDate)
    ? endDate.slice(0, 10)
    : toManilaDateKey(endDate);

  const mongooseLib = require('mongoose');
  const entries = await CarLogbookEntry.find({
    bdm_id: typeof bdmUserId === 'string'
      ? mongooseLib.Types.ObjectId.createFromHexString(bdmUserId)
      : bdmUserId,
    entry_date: { $gte: manilaDayStart(startKey), $lte: manilaDayEnd(endKey) },
    status: 'POSTED',
    official_km: { $gt: 0 }
  })
    .select('entry_date official_km destination notes')
    .sort({ entry_date: 1 })
    .lean();

  const counts = {};
  for (const e of entries) {
    const dateKey = toManilaDateKey(e.entry_date);
    // If a BDM has multiple POSTED entries on one day (shouldn't happen — cycle
    // wrapper prevents duplicates — but defensive), treat as single worked day.
    if (counts[dateKey]) continue;

    const label = (e.destination && e.destination.trim()) || (e.notes && e.notes.trim()) || '';
    counts[dateKey] = {
      md_count: 1,           // Binary: worked = 1. Threshold config determines tier.
      unique_doctors: 1,     // Kept for response-shape parity with visit source.
      locations: label
    };
  }
  return counts;
}

/**
 * Get detailed drill-down for a BDM on a specific date (for SMER drill-down).
 * Phase G1.6 — dispatches by source. Visit source returns actual doctor rows;
 * logbook source returns a synthetic 1-row summary from the CarLogbookEntry.
 * @param {String} bdmUserId
 * @param {Date|String} date
 * @param {Object} [opts]
 * @param {String} [opts.source='visit'] - 'visit' | 'logbook' | 'manual' | 'none'
 * @returns {Promise<Array>} Visits (or logbook-adapted rows) for the day.
 */
async function getDailyVisitDetails(bdmUserId, date, opts = {}) {
  const { source = 'visit' } = opts;
  const dateKey = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(date)
    ? date.slice(0, 10)
    : toManilaDateKey(date);

  if (source === 'logbook') {
    const entries = await CarLogbookEntry.find({
      bdm_id: bdmUserId,
      entry_date: { $gte: manilaDayStart(dateKey), $lte: manilaDayEnd(dateKey) },
      status: 'POSTED',
      official_km: { $gt: 0 }
    })
      .select('entry_date official_km destination notes period cycle')
      .lean();

    // Adapt to the same shape the frontend consumes, so the drill-down UI renders
    // destination+km instead of doctor name without a separate template.
    return entries.map(e => ({
      doctor: {
        firstName: 'Logbook',
        lastName: 'Entry',
        specialization: `${e.official_km} km — ${e.cycle || ''}`,
        clinicOfficeAddress: e.destination || e.notes || '',
      },
      visitDate: e.entry_date,
      visitType: 'LOGBOOK',
      engagementTypes: [],
      weekLabel: e.cycle
    }));
  }

  if (source === 'manual' || source === 'none') return [];

  return Visit.find({
    user: bdmUserId,
    visitDate: { $gte: manilaDayStart(dateKey), $lte: manilaDayEnd(dateKey) },
    status: 'completed'
  })
    .populate('doctor', 'firstName lastName specialization clinicOfficeAddress locality province')
    .select('doctor visitDate visitType engagementTypes weekLabel')
    .sort({ visitDate: 1 })
    .lean();
}

module.exports = {
  getDailyMdCount,
  getDailyMdCounts,
  getDailyLogbookCounts,
  getDailyVisitDetails
};
