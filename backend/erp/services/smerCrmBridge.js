/**
 * SMER ↔ CRM Bridge — Pulls MD visit counts from CRM visit logs
 *
 * Counts both halves of CRM activity (yes-equal-weight, locked May 05 2026):
 *   Visit       — VIP visits to Doctor (the curated VIP client list)
 *   ClientVisit — EXTRA calls to Client (regular non-VIP MDs)
 *
 * Both share the same lifecycle contract:
 *   {Visit|ClientVisit}.user      = BDM who visited
 *   {Visit|ClientVisit}.{doctor|client} = MD visited
 *   {Visit|ClientVisit}.visitDate = date of visit
 *   {Visit|ClientVisit}.status    = 'completed'
 *   {Visit|ClientVisit}.photoFlags = audit flags (skipped if skipFlagged)
 *
 * The CRM list view (MyVisits, EmployeeVisitReport) merges both streams; this
 * bridge mirrors that contract so the SMER pull-from-CRM reconciles with what
 * the BDM and admin see in the CRM list. Pre-May-05 the bridge only counted
 * the VIP half, silently undercounting per-diem on days BDMs logged extra calls.
 *
 * Counts feed SMER md_count, which drives per diem tier calculation:
 *   ≥ 8 MDs → FULL (100% per diem)
 *   ≥ 3 MDs → HALF (50% per diem)
 *   < 3 MDs → ZERO (0% per diem)
 *
 * The fix is forward-only: already-POSTED SMERs stay frozen at their pre-fix
 * amounts (period-lock + reopen-safety per Rule #20). Only future pulls and
 * still-DRAFT SMERs see the corrected count.
 */

const Visit = require('../../models/Visit');
const Doctor = require('../../models/Doctor');
// EXTRA-call counterparts of Visit/Doctor — pulled into the per-diem MD count
// alongside VIP visits per the yes-equal-weight policy (May 05 2026). The CRM
// list (MyVisits / EmployeeVisitReport) has always merged both streams; this
// bridge previously only counted the VIP half, silently undercounting per-diem
// on days BDMs logged extra calls.
const ClientVisit = require('../../models/ClientVisit');
const Client = require('../../models/Client');
const CarLogbookEntry = require('../models/CarLogbookEntry');

// Phase O (May 2026) — only FRAUD flags should disqualify a visit from per-diem.
// The pre-Phase-O bridge treated ANY photoFlag as disqualifying ($size === 0
// guard at line ~230). That worked when only `date_mismatch` and `duplicate_photo`
// existed (both unambiguous fraud signals). Phase O introduces three new
// SIGNAL flags carried by legitimate visits:
//   - no_exif_timestamp     ← every in-app camera capture (canvas → JPEG has no EXIF)
//   - gps_in_photo          ← positive signal! shouldn't penalize the BDM
//   - late_log_cross_week   ← informational; admin reviewer eyes the row, BDM keeps per-diem
// Without this whitelist, Phase O would silently kill per-diem for every BDM
// using the in-app camera. Future-Phase work: lift to a Lookup category
// (PERDIEM_DISQUALIFYING_PHOTO_FLAGS) so subscribers tune per-entity without a
// code deploy. Keeping it as a code constant for now to minimize the Phase O
// blast radius — the Lookup row is already seeded
// (lookupGenericController.js → PHOTO_FLAG extension) so promotion is one
// future PR away.
const PERDIEM_DISQUALIFYING_FLAGS = ['date_mismatch', 'duplicate_photo'];

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
async function getDailyMdCount(bdmUserId, date, opts = {}) {
  const { includeExtraCalls = true } = opts;
  const dateKey = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(date)
    ? date.slice(0, 10)
    : toManilaDateKey(date);

  const window = { $gte: manilaDayStart(dateKey), $lte: manilaDayEnd(dateKey) };
  const promises = [
    Visit.distinct('doctor', { user: bdmUserId, visitDate: window, status: 'completed' })
  ];
  if (includeExtraCalls) {
    promises.push(
      ClientVisit.distinct('client', { user: bdmUserId, visitDate: window, status: 'completed' })
    );
  }
  const results = await Promise.all(promises);
  return results.reduce((sum, ids) => sum + ids.length, 0);
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
  // includeExtraCalls (May 05 2026, lookup-driven via PERDIEM_RATES.<role>.metadata.include_extra_calls):
  //   true  = sum VIP Visit + EXTRA ClientVisit (yes-equal-weight policy, default)
  //   false = strict VIP-only (legacy / opt-out for subscribers that gate per-diem on the curated VIP list)
  const { skipFlagged = false, source = 'visit', includeExtraCalls = true } = opts;

  // Phase G1.6 — dispatch by eligibility source. 'visit' = pharma CRM Visit (+ ClientVisit
  // when includeExtraCalls is true, default); 'logbook' = CarLogbook (non-pharma
  // worked-day credit); 'manual'/'none' return empty so expenseController falls back to
  // md_count=0 for every day.
  if (source === 'logbook') return getDailyLogbookCounts(bdmUserId, startDate, endDate);
  if (source === 'manual' || source === 'none') return {};

  // Accept Date objects or YYYY-MM-DD strings; normalize to Manila calendar keys.
  const startKey = typeof startDate === 'string' && /^\d{4}-\d{2}-\d{2}/.test(startDate)
    ? startDate.slice(0, 10)
    : toManilaDateKey(startDate);
  const endKey = typeof endDate === 'string' && /^\d{4}-\d{2}-\d{2}/.test(endDate)
    ? endDate.slice(0, 10)
    : toManilaDateKey(endDate);

  const userObjectId = typeof bdmUserId === 'string'
    ? require('mongoose').Types.ObjectId.createFromHexString(bdmUserId)
    : bdmUserId;
  const dateRange = { $gte: manilaDayStart(startKey), $lte: manilaDayEnd(endKey) };

  // Run the same per-day "all vs unflagged" aggregation against both Visit (VIP,
  // FK = doctor) and ClientVisit (EXTRA, FK = client). Both schemas share user /
  // visitDate / status / photoFlags, so the only thing that varies is the FK
  // field name. Results are merged in JS keyed by Manila calendar day. When
  // includeExtraCalls=false we short-circuit the EXTRA stream to an empty
  // result so the merge code stays single-shape.
  const [vipResults, extraResults] = await Promise.all([
    aggregateDailyByCollection(Visit, 'doctor', userObjectId, dateRange),
    includeExtraCalls
      ? aggregateDailyByCollection(ClientVisit, 'client', userObjectId, dateRange)
      : Promise.resolve([])
  ]);

  // Batch-fetch master records to resolve location labels. Doctor and Client
  // share the locality/province/clinicOfficeAddress contract (Phase G1.5).
  const doctorIds = collectIds(vipResults);
  const clientIds = collectIds(extraResults);
  const [doctors, clients] = await Promise.all([
    doctorIds.size
      ? Doctor.find({ _id: { $in: [...doctorIds] } })
          .select('firstName lastName clinicOfficeAddress locality province').lean()
      : [],
    clientIds.size
      ? Client.find({ _id: { $in: [...clientIds] } })
          .select('firstName lastName clinicOfficeAddress locality province').lean()
      : []
  ]);
  const masterMap = new Map();
  for (const d of doctors) masterMap.set(d._id.toString(), d);
  for (const c of clients) masterMap.set(c._id.toString(), c);

  // Merge per-day buckets across the two streams. EXTRA and VIP IDs live in
  // different collections so they cannot collide; we just union them. If the
  // same physical MD appears in both Doctor and Client master data (legacy
  // dirty-data case the merge tool is designed to clean), each visit log
  // counts separately — this mirrors how the CRM list view renders them.
  const allDayKeys = new Set([...vipResults.map(r => r._id), ...extraResults.map(r => r._id)]);
  const counts = {};
  for (const dayKey of [...allDayKeys].sort()) {
    const vip = vipResults.find(r => r._id === dayKey);
    const extra = extraResults.find(r => r._id === dayKey);

    const idsAll = [
      ...((vip && vip.ids_all) || []),
      ...((extra && extra.ids_all) || [])
    ];
    const idsUnflagged = [
      ...((vip && (vip.ids_unflagged || []).filter(x => x !== null)) || []),
      ...((extra && (extra.ids_unflagged || []).filter(x => x !== null)) || [])
    ];

    const flaggedCount = idsAll.length - idsUnflagged.length;
    const countedIds = skipFlagged ? idsUnflagged : idsAll;

    const locationLabels = countedIds
      .map(id => {
        const m = masterMap.get(id.toString());
        if (!m) return null;
        if (m.locality && m.province) return `${m.locality}, ${m.province}`;
        if (m.locality) return m.locality;
        if (m.clinicOfficeAddress) return m.clinicOfficeAddress;
        return null;
      })
      .filter(Boolean);
    const uniqueLocations = [...new Set(locationLabels)];

    const uniqueMdCount = countedIds.length;
    counts[dayKey] = {
      md_count: uniqueMdCount,
      unique_doctors: uniqueMdCount,
      flagged_excluded: skipFlagged ? flaggedCount : 0,
      locations: uniqueLocations.join('; ')
    };
  }
  return counts;
}

/**
 * Per-collection daily aggregation used by getDailyMdCounts. Returns
 * [{ _id: 'YYYY-MM-DD', ids_all: [...], ids_unflagged: [...] }] where
 * `fkField` is 'doctor' (Visit) or 'client' (ClientVisit).
 *
 * The "match all completed, split flagged inside $group" pattern (Phase G1.5)
 * is preserved: pulling all rows lets the caller surface flagged_excluded
 * truthfully when skipFlagged is on, instead of silently dropping rows at
 * $match time and making the bridge disagree with the CRM list.
 */
async function aggregateDailyByCollection(Model, fkField, userObjectId, dateRange) {
  return Model.aggregate([
    { $match: { user: userObjectId, visitDate: dateRange, status: 'completed' } },
    {
      $group: {
        _id: {
          $dateToString: { format: '%Y-%m-%d', date: '$visitDate', timezone: MANILA_TZ }
        },
        ids_all: { $addToSet: `$${fkField}` },
        // Phase O — "unflagged" means "no FRAUD flags". A visit with only
        // SIGNAL flags (no_exif_timestamp, gps_in_photo, late_log_cross_week)
        // still counts toward per-diem. Pre-Phase-O this was a $size === 0
        // check which would have dropped most in-app camera captures
        // post-Phase-O (canvas-output JPEGs have no EXIF → flagged →
        // skip_flagged dropped them). The $setIntersection check is empty-set
        // ⇔ no overlap with the disqualifying list.
        ids_unflagged: {
          $addToSet: {
            $cond: [
              {
                $eq: [
                  { $size: { $setIntersection: [
                    { $ifNull: ['$photoFlags', []] },
                    PERDIEM_DISQUALIFYING_FLAGS
                  ]}},
                  0
                ]
              },
              `$${fkField}`,
              null
            ]
          }
        }
      }
    },
    { $sort: { _id: 1 } }
  ]);
}

function collectIds(results) {
  const ids = new Set();
  for (const r of results) {
    for (const id of (r.ids_all || [])) ids.add(id.toString());
  }
  return ids;
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
  // eslint-disable-next-line vip-tenant/require-entity-filter -- by-bdm_id cascade: caller (smerEntry / smerCrmRouter) is entity-scoped; BDM resolves to a single entity (FRA proxy uses a separate code path)
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
      flagged_excluded: 0,   // Logbook source has no photo-flag concept.
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
  const { source = 'visit', includeExtraCalls = true } = opts;
  const dateKey = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(date)
    ? date.slice(0, 10)
    : toManilaDateKey(date);

  if (source === 'logbook') {
    // eslint-disable-next-line vip-tenant/require-entity-filter -- by-bdm_id cascade: caller (smerEntry / smerCrmRouter) is entity-scoped; BDM resolves to a single entity (FRA proxy uses a separate code path)
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

  // Pull both VIP visits (Visit→Doctor) and EXTRA calls (ClientVisit→Client) so
  // drill-down matches the SMER count (yes-equal-weight policy). EXTRA rows are
  // adapted to expose their client under the `doctor` key, matching the contract
  // universalApprovalService relies on (`v.doctor?.clinicOfficeAddress`).
  // includeExtraCalls=false short-circuits the EXTRA stream so the drill-down
  // matches strict VIP-only mode.
  const window = { $gte: manilaDayStart(dateKey), $lte: manilaDayEnd(dateKey) };
  const [vipVisits, extraVisits] = await Promise.all([
    Visit.find({ user: bdmUserId, visitDate: window, status: 'completed' })
      .populate('doctor', 'firstName lastName specialization clinicOfficeAddress locality province')
      .select('doctor visitDate visitType engagementTypes weekLabel')
      .sort({ visitDate: 1 })
      .lean(),
    includeExtraCalls
      ? ClientVisit.find({ user: bdmUserId, visitDate: window, status: 'completed' })
          .populate('client', 'firstName lastName specialization clinicOfficeAddress locality province')
          .select('client visitDate visitType engagementTypes weekLabel')
          .sort({ visitDate: 1 })
          .lean()
      : Promise.resolve([])
  ]);

  const adaptedExtras = extraVisits.map(v => ({
    _id: v._id,
    doctor: v.client,
    visitDate: v.visitDate,
    visitType: v.visitType || 'EXTRA',
    engagementTypes: v.engagementTypes || [],
    weekLabel: v.weekLabel
  }));

  return [...vipVisits, ...adaptedExtras].sort(
    (a, b) => new Date(a.visitDate) - new Date(b.visitDate)
  );
}

module.exports = {
  getDailyMdCount,
  getDailyMdCounts,
  getDailyLogbookCounts,
  getDailyVisitDetails
};
