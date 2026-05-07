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
// Phase SMER-CL (May 07 2026) — manual-source CommunicationLog screenshots
// (Messenger / Viber / WhatsApp / Email / Google Chat) join Visit and ClientVisit
// as a third per-diem-bearing stream when admin opts in via PERDIEM_RATES.<role>.
// metadata.include_comm_log. Trust model: admin is in the BDM group chats, so
// chat-credit fraud is bounded by real-time spot-check. One CommLog row = one
// MD credit (existing doctor/client FK). Same-day same-MD across Visit + CommLog
// dedups at merge to 1. Phase O's 14-day photo cutoff inherits — old screenshots
// cannot retroactively pad SMER per-diem.
const CommunicationLog = require('../../models/CommunicationLog');

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
  // includeCommLog (Phase SMER-CL, May 07 2026, lookup-driven via .include_comm_log):
  //   true  = manual-source CommunicationLog screenshots also count
  //   false = visit/extra streams only (legacy default)
  const {
    skipFlagged = false,
    source = 'visit',
    includeExtraCalls = true,
    includeCommLog = false,
    commLogDailyCap = null,
    commLogRequireOutbound = false,
    commLogAllowedSources = ['manual'],
  } = opts;

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

  // Run the same per-day "all vs unflagged" aggregation against Visit (VIP,
  // FK = doctor), ClientVisit (EXTRA, FK = client), AND CommunicationLog
  // (CHAT, FK = doctor OR client) when their respective lookups are on. Visit/
  // ClientVisit share user / visitDate / status / photoFlags, so only FK name
  // varies. CommLog shares user but uses contactedAt (not visitDate), has no
  // photoFlags concept, and can reference EITHER doctor or client. Results
  // merge in JS keyed by Manila calendar day. Disabled streams short-circuit
  // to [] so the merge stays single-shape.
  const [vipResults, extraResults, commLogResults] = await Promise.all([
    aggregateDailyByCollection(Visit, 'doctor', userObjectId, dateRange),
    includeExtraCalls
      ? aggregateDailyByCollection(ClientVisit, 'client', userObjectId, dateRange)
      : Promise.resolve([]),
    includeCommLog
      ? aggregateCommLogDaily(userObjectId, dateRange, {
          allowedSources: commLogAllowedSources,
          requireOutbound: commLogRequireOutbound,
        })
      : Promise.resolve([])
  ]);

  // Batch-fetch master records to resolve location labels. Doctor and Client
  // share the locality/province/clinicOfficeAddress contract (Phase G1.5).
  // CommLog can reference either, so we union the IDs from all three streams
  // into the appropriate master fetch — no extra round trip vs. the legacy 2-stream pattern.
  const doctorIds = collectIds(vipResults);
  const clientIds = collectIds(extraResults);
  // CommLog rows surface ids_doctor and ids_client separately so each MD ID
  // routes to the correct master collection (Doctor vs Client).
  for (const r of commLogResults) {
    for (const id of (r.ids_doctor || [])) doctorIds.add(id.toString());
    for (const id of (r.ids_client || [])) clientIds.add(id.toString());
  }
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

  // Merge per-day buckets across all three streams. Phase SMER-CL (May 07 2026)
  // — the merge is now Set<string>-based on stringified ObjectIds so a same-day
  // same-MD pair across Visit + CommLog dedups to 1 (BDM in-person visits Dr. X
  // in the morning AND messages Dr. X in the evening = 1 MD credit, not 2).
  // Pre-Phase-SMER-CL the merge concat-then-counted, which was technically wrong
  // even for VIP+EXTRA cross-stream (Doctor/Client _id collisions are practically
  // zero but theoretically allowed). Switching to Set is strictly safer.
  const allDayKeys = new Set([
    ...vipResults.map(r => r._id),
    ...extraResults.map(r => r._id),
    ...commLogResults.map(r => r._id),
  ]);
  const counts = {};
  for (const dayKey of [...allDayKeys].sort()) {
    const vip = vipResults.find(r => r._id === dayKey);
    const extra = extraResults.find(r => r._id === dayKey);
    const chat = commLogResults.find(r => r._id === dayKey);

    // CommLog has no photoFlags concept — its rows always count toward both
    // ids_all and ids_unflagged. The skip_flagged guard (Phase G1.5) only
    // applies to Visit/ClientVisit fraud flags.
    const chatIds = chat ? [...(chat.ids_doctor || []), ...(chat.ids_client || [])] : [];

    // Set-based dedup across all three streams (Phase SMER-CL May 07 2026).
    // Stringify _id so the Set treats Mongo ObjectIds as primitives.
    const setAll = new Set();
    for (const id of ((vip && vip.ids_all) || [])) setAll.add(id.toString());
    for (const id of ((extra && extra.ids_all) || [])) setAll.add(id.toString());
    for (const id of chatIds) setAll.add(id.toString());

    const setUnflagged = new Set();
    for (const id of ((vip && (vip.ids_unflagged || []).filter(x => x !== null)) || [])) setUnflagged.add(id.toString());
    for (const id of ((extra && (extra.ids_unflagged || []).filter(x => x !== null)) || [])) setUnflagged.add(id.toString());
    // CommLog rows are unconditionally "unflagged" for the per-diem skip check.
    for (const id of chatIds) setUnflagged.add(id.toString());

    const flaggedCount = setAll.size - setUnflagged.size;
    const countedSet = skipFlagged ? setUnflagged : setAll;
    const countedIds = [...countedSet];

    // CommLog-only contribution post-dedup (a same-day same-MD with Visit
    // doesn't double-credit chat — it's already in the merged Set). This is
    // the count the row-level UI badge surfaces: "💬 N chats" reflects MDs
    // that earned per-diem ONLY via chat outreach today.
    const chatOnlySet = new Set();
    const visitMdSet = new Set();
    for (const id of ((vip && vip.ids_all) || [])) visitMdSet.add(id.toString());
    for (const id of ((extra && extra.ids_all) || [])) visitMdSet.add(id.toString());
    for (const id of chatIds) {
      const k = id.toString();
      if (!visitMdSet.has(k)) chatOnlySet.add(k);
    }

    const locationLabels = countedIds
      .map(id => {
        const m = masterMap.get(id);
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
      // Phase SMER-CL — chat-only contribution, post-cross-stream-dedup.
      // Frontend renders "💬 N chats" badge below md_count when > 0.
      comm_log_count: chatOnlySet.size,
      visit_count: visitMdSet.size,
      locations: uniqueLocations.join('; ')
    };

    // Phase SMER-CL — comm_log_daily_cap (lookup-tunable, default null = no cap).
    // Admin spot-check via Messenger is the primary fraud guard (trust model:
    // admin is in the BDM group chats). Cap exists for SaaS subscribers without
    // that trust model. When applied, it caps the chat-only contribution; the
    // BDM keeps any visit-driven count and loses excess chat credits.
    if (includeCommLog && commLogDailyCap != null && Number.isFinite(commLogDailyCap) && commLogDailyCap >= 0) {
      const cap = Number(commLogDailyCap);
      const chatOnly = chatOnlySet.size;
      if (chatOnly > cap) {
        const excess = chatOnly - cap;
        counts[dayKey].md_count = Math.max(uniqueMdCount - excess, 0);
        counts[dayKey].unique_doctors = counts[dayKey].md_count;
        counts[dayKey].comm_log_count = cap;
        counts[dayKey].comm_log_excluded = excess;
      }
    }
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
 * Phase SMER-CL (May 07 2026) — Daily aggregation of manual-source CommunicationLog
 * screenshots that earned per-diem credit. Mirrors aggregateDailyByCollection's
 * shape but with three structural differences:
 *
 *   1. Groups by `contactedAt` (CommLog's date field), not `visitDate`.
 *   2. Returns separate `ids_doctor` and `ids_client` arrays — CommLog can
 *      reference EITHER a Doctor (VIP Client) or a Client (Regular Client) via
 *      its `doctor` / `client` FK, and the merge needs to route each ID to the
 *      right master collection for location resolution.
 *   3. Eligibility is gated on:
 *      - `source ∈ allowedSources` (default ['manual'] — webhook/system spam excluded)
 *      - `direction === 'outbound'` IF `requireOutbound` (default false — group
 *        chats are bidirectional; participation is the work)
 *      - `photos.0` exists (manual-source already requires ≥1 screenshot at the
 *        model level — defensive check at the bridge in case the rule ever drifts)
 *      - **Phase O 14-day late-log inheritance**: `(createdAt - photos[0].capturedAt)
 *        ≤ COMM_LOG_MAX_AGE_MS`. Old screenshots cannot retroactively pad SMER per-diem.
 *        Falls back to `contactedAt` for legacy rows missing `photos[0].capturedAt`.
 *
 * No `photoFlags` concept — CommLog has none. Per-row counts always toward both
 * ids_all and ids_unflagged at merge time.
 *
 * @param {ObjectId} userObjectId
 * @param {{ $gte: Date, $lte: Date }} dateRange - Manila day window
 * @param {Object} opts
 * @param {String[]} [opts.allowedSources=['manual']]
 * @param {Boolean} [opts.requireOutbound=false]
 * @returns {Promise<Array<{ _id: string, ids_doctor: ObjectId[], ids_client: ObjectId[] }>>}
 */
async function aggregateCommLogDaily(userObjectId, dateRange, opts = {}) {
  const { allowedSources = ['manual'], requireOutbound = false } = opts;
  // Phase O inheritance: 14-day cutoff measured between photos[0].capturedAt
  // and createdAt. Hardcoded here for now — future Phase SMER-CL.2 can promote
  // to a lookup key (`comm_log_max_age_days`) if subscribers ask. Matches the
  // Phase O default (`VISIT_PHOTO_VALIDATION_RULES.late_log_max_days`).
  const COMM_LOG_MAX_AGE_DAYS = 14;
  const COMM_LOG_MAX_AGE_MS = COMM_LOG_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;

  const match = {
    user: userObjectId,
    contactedAt: dateRange,
    status: 'logged',
    source: { $in: allowedSources },
    // photos.0 means "at least one element exists at index 0" — guards
    // against rows where the photos array is empty (legacy or edge-case
    // rows that shouldn't have escaped pre-validate).
    'photos.0': { $exists: true },
  };
  if (requireOutbound) match.direction = 'outbound';

  return CommunicationLog.aggregate([
    { $match: match },
    // Phase O 14-day cutoff: gate per row using $expr so each row's own
    // photos[0].capturedAt vs createdAt drives the decision. ifNull falls back
    // to contactedAt for legacy rows missing photos[0].capturedAt.
    {
      $addFields: {
        _photo_capturedAt: {
          $ifNull: [
            { $arrayElemAt: ['$photos.capturedAt', 0] },
            '$contactedAt'
          ]
        }
      }
    },
    {
      $match: {
        $expr: {
          $lte: [
            { $subtract: ['$createdAt', '$_photo_capturedAt'] },
            COMM_LOG_MAX_AGE_MS
          ]
        }
      }
    },
    {
      $group: {
        _id: {
          $dateToString: { format: '%Y-%m-%d', date: '$contactedAt', timezone: MANILA_TZ }
        },
        ids_doctor: { $addToSet: '$doctor' },
        ids_client: { $addToSet: '$client' },
      }
    },
    // Strip null FK entries so ids_doctor / ids_client only contain real ObjectIds.
    // CommLog can have either doctor=null+client=set OR doctor=set+client=null.
    {
      $project: {
        _id: 1,
        ids_doctor: {
          $filter: { input: '$ids_doctor', as: 'd', cond: { $ne: ['$$d', null] } }
        },
        ids_client: {
          $filter: { input: '$ids_client', as: 'c', cond: { $ne: ['$$c', null] } }
        }
      }
    },
    { $sort: { _id: 1 } }
  ]);
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
  getDailyVisitDetails,
  // Phase SMER-CL (May 07 2026) — exported for healthcheck visibility and
  // future drilldown wiring. Not currently called by any controller directly.
  aggregateCommLogDaily,
};
