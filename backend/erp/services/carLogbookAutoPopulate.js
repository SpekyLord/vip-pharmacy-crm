/**
 * Car Logbook Auto-Populate service — Phase P1.2 Slice 6 (May 06 2026).
 *
 * Single-purpose service: take a (entity, bdm, drive day) tuple and return the
 * Car Logbook row that the proxy WOULD post if they accepted every signal as-is.
 * Four data sources, one merged shape:
 *
 *   1. SMER daily entry (existing)         → destination
 *   2. SMER ODO captures                   → starting_km / ending_km + photo URLs
 *   3. DriveAllocation (Slice 4)           → personal_km / official_km
 *   4. FUEL_ENTRY captures                 → fuel_entries[] (station, liters, ₱/L, OCR)
 *
 * The proxy then reviews on `/erp/car-logbook` and saves the row — every field
 * is editable, MANUAL overrides win, source badges show provenance so the proxy
 * knows which numbers came from where.
 *
 * Why a separate service (not inline in expenseController):
 *   - Deterministic: testable with stub data; one entry point per day.
 *   - Reusable: createCarLogbook merges with body, previewCarLogbookDay returns
 *     the raw shape, and a future "refresh row" endpoint can call the same fn.
 *   - The pre-save hook on CarLogbookEntry derives total_km / official_km /
 *     fuel total_amount / efficiency. We only write the INPUTS — the hook
 *     does the math. Service avoids re-deriving.
 *
 * Rule #19: entity_id stamped — cross-entity reads blocked by passing it to
 *           every find() filter.
 * Rule #21: bdm_id required, no silent self-fallback. Caller's responsibility.
 * Rule #3:  service is config-light; future tunables (e.g., "min ODO readings
 *           required for ending_km auto-fill") would land in
 *           CAR_LOGBOOK_AUTOPOP_CONFIG lookup category.
 */

const SmerEntry = require('../models/SmerEntry');
const CaptureSubmission = require('../models/CaptureSubmission');
const DriveAllocation = require('../models/DriveAllocation');
const CarLogbookEntry = require('../models/CarLogbookEntry');
const { manilaDateString } = require('../utils/cycleC1C2');

// ── Source tag enum — exposed for healthcheck + tests + frontend badge map ──
const SOURCE_TAGS = Object.freeze({
  SMER: 'SMER',                       // SMER daily_entries.hospital_covered + notes
  SMER_CAPTURE: 'SMER_CAPTURE',       // CaptureSubmission workflow_type=SMER, ocr_result.reading
  DRIVE_ALLOCATION: 'DRIVE_ALLOCATION',
  FUEL_ENTRY_CAPTURE: 'FUEL_ENTRY_CAPTURE',
  PRIOR_DAY: 'PRIOR_DAY',             // ending_km of prior CarLogbookEntry (fallback for starting_km)
  MANUAL: 'MANUAL',                   // proxy edited the field
});

// CaptureSubmission lifecycle statuses we treat as "valid source data".
// CANCELLED is the only exclusion — every other lifecycle stage carries OCR.
const VALID_CAPTURE_STATUSES = [
  'PENDING_PROXY',
  'IN_PROGRESS',
  'PROCESSED',
  'AWAITING_BDM_REVIEW',
  'ACKNOWLEDGED',
  'AUTO_ACKNOWLEDGED',
  'DISPUTED', // disputed entries still carry OCR data — proxy decides
];

/**
 * Convert a 'YYYY-MM-DD' Manila-local string to UTC bounds for that day.
 * Manila midnight = UTC midnight − 8h. Returns { startUtc, endUtc } where
 * endUtc is exclusive (next-day Manila midnight).
 */
function manilaDayBounds(dateStr) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateStr || ''))) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;
  const startUtc = new Date(Date.UTC(y, m - 1, d) - MANILA_OFFSET_MS);
  const endUtc = new Date(Date.UTC(y, m - 1, d + 1) - MANILA_OFFSET_MS);
  return { startUtc, endUtc };
}

/**
 * Coerce mixed OCR result values to a Number.
 * OCR pipeline returns either a raw number, a `{value, confidence}` envelope,
 * or a string. Handle all three; return null on garbage.
 */
function readOcrNumber(field) {
  if (field === null || field === undefined) return null;
  if (typeof field === 'number') return Number.isFinite(field) ? field : null;
  if (typeof field === 'object' && 'value' in field) return readOcrNumber(field.value);
  if (typeof field === 'string') {
    // Strip commas + non-digit/period/minus; parse. Empty after strip → null
    // (so 'garbage' doesn't masquerade as 0 when Number('') === 0).
    const cleaned = field.replace(/[^\d.\-]/g, '');
    if (!cleaned) return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Coerce mixed OCR result values to a String (trim, default ''). */
function readOcrString(field) {
  if (field === null || field === undefined) return '';
  if (typeof field === 'string') return field.trim();
  if (typeof field === 'number') return String(field);
  if (typeof field === 'object' && 'value' in field) return readOcrString(field.value);
  return '';
}

/**
 * Pull the SMER daily entry for the given (bdm × entity × day).
 * Same logic as expenseController.getSmerDailyByDate — kept colocated so
 * service is self-contained.
 */
async function pullSmerDestination({ entity_id, bdm_id, dateStr }) {
  const bounds = manilaDayBounds(dateStr);
  if (!bounds) return null;
  const smer = await SmerEntry.findOne({
    entity_id,
    bdm_id,
    'daily_entries.entry_date': { $gte: bounds.startUtc, $lt: bounds.endUtc },
  }).lean();
  if (!smer) return null;
  const dayEntry = (smer.daily_entries || []).find(de => {
    const t = new Date(de.entry_date).getTime();
    return t >= bounds.startUtc.getTime() && t < bounds.endUtc.getTime();
  });
  if (!dayEntry) return null;
  return {
    hospital_covered: dayEntry.hospital_covered || '',
    notes: dayEntry.notes || '',
    activity_type: dayEntry.activity_type || '',
    destination: [dayEntry.hospital_covered, dayEntry.notes].filter(Boolean).join(' — '),
  };
}

/**
 * Pull SMER ODO captures (workflow_type='SMER') for the day, extract numeric
 * readings, return min as starting_km + max as ending_km. Picks the first photo
 * URL of the lowest-reading artifact for starting_km_photo_url, highest for
 * ending_km_photo_url.
 *
 * If only ONE valid reading exists for the day we report it as starting_km and
 * leave ending_km null — proxy fills the second.
 */
async function pullSmerOdoCaptures({ entity_id, bdm_id, dateStr }) {
  const bounds = manilaDayBounds(dateStr);
  if (!bounds) return { starting_km: null, ending_km: null, starting_km_photo_url: '', ending_km_photo_url: '' };
  const captures = await CaptureSubmission.find({
    entity_id,
    bdm_id,
    workflow_type: 'SMER',
    status: { $in: VALID_CAPTURE_STATUSES },
    created_at: { $gte: bounds.startUtc, $lt: bounds.endUtc },
  }).select('captured_artifacts created_at').lean();

  // Collect every readable ODO artifact across all captures for the day.
  const readings = [];
  for (const cap of captures || []) {
    for (const art of cap.captured_artifacts || []) {
      if (!art) continue;
      // Look for a numeric reading anywhere in ocr_result. Two common shapes:
      //   ocr_result.reading
      //   ocr_result.extracted.reading
      const raw = art.ocr_result || {};
      const reading =
        readOcrNumber(raw.reading) ??
        readOcrNumber(raw.extracted?.reading) ??
        readOcrNumber(raw.value);
      if (reading === null || reading <= 0) continue;
      readings.push({
        reading,
        url: art.url || '',
        timestamp: art.timestamp || cap.created_at,
      });
    }
  }

  if (readings.length === 0) {
    return { starting_km: null, ending_km: null, starting_km_photo_url: '', ending_km_photo_url: '' };
  }

  // Sort ascending by reading. Min = start, Max = end. If only one reading,
  // it's the starting_km (morning capture is the typical first capture of the
  // day; proxy fills the ending number from the next day's first capture or
  // the BDM's verbal report).
  readings.sort((a, b) => a.reading - b.reading);
  const lo = readings[0];
  const hi = readings[readings.length - 1];

  return {
    starting_km: lo.reading,
    ending_km: readings.length > 1 ? hi.reading : null,
    starting_km_photo_url: lo.url || '',
    ending_km_photo_url: readings.length > 1 ? (hi.url || '') : '',
  };
}

/**
 * Pull the DriveAllocation row for the given (bdm × entity × day).
 * Returns { personal_km, official_km, total_km, status } or null.
 * NO_DRIVE rows are returned with status='NO_DRIVE' so caller can render the
 * "No drive" state distinctly from "0 km allocated".
 */
async function pullDriveAllocation({ entity_id, bdm_id, dateStr }) {
  const row = await DriveAllocation.findOne({
    entity_id,
    bdm_id,
    drive_date: dateStr,
  }).select('status start_km end_km personal_km official_km total_km').lean();
  if (!row) return null;
  return {
    status: row.status,
    start_km: row.start_km || 0,
    end_km: row.end_km || 0,
    total_km: row.total_km || 0,
    personal_km: row.personal_km || 0,
    official_km: row.official_km || 0,
  };
}

/**
 * Pull FUEL_ENTRY captures for the day, build CarLogbookEntry.fuel_entries[]
 * shape from each artifact's OCR result.
 *
 * Each capture is one fuel fill-up. Multiple captures on the same day produce
 * multiple fuel_entries[]. Manual override flag is set when OCR fails — this
 * keeps the legibility-flag chain intact (CarLogbookEntry validate stage will
 * still warn the proxy if a manual_override_flag entry has no manual_override_reason).
 */
async function pullFuelEntries({ entity_id, bdm_id, dateStr }) {
  const bounds = manilaDayBounds(dateStr);
  if (!bounds) return [];
  const captures = await CaptureSubmission.find({
    entity_id,
    bdm_id,
    workflow_type: 'FUEL_ENTRY',
    status: { $in: VALID_CAPTURE_STATUSES },
    created_at: { $gte: bounds.startUtc, $lt: bounds.endUtc },
  }).select('captured_artifacts amount_declared payment_mode created_at').lean();

  const fuel_entries = [];
  for (const cap of captures || []) {
    for (const art of cap.captured_artifacts || []) {
      if (!art) continue;
      const ocr = art.ocr_result || {};
      const ext = ocr.extracted || ocr || {};
      const liters = readOcrNumber(ext.liters) ?? 0;
      const price_per_liter = readOcrNumber(ext.price_per_liter) ?? 0;
      const station_name = readOcrString(ext.station_name);
      const fuel_type = readOcrString(ext.fuel_type) || 'UNLEADED';
      const total_amount_ocr = readOcrNumber(ext.total_amount);
      const receipt_date = readOcrString(ext.date) || readOcrString(ext.receipt_date);

      fuel_entries.push({
        station_name,
        fuel_type,
        liters,
        price_per_liter,
        // Pre-save will recompute total_amount = liters × price_per_liter.
        // Persist the OCR-claimed value too so a downstream cross-check can
        // compare OCR's total against the derived total.
        total_amount: total_amount_ocr ?? Math.round(liters * price_per_liter * 100) / 100,
        receipt_url: art.url || '',
        receipt_attachment_id: art._id ? String(art._id) : undefined,
        receipt_ocr_data: ocr,
        receipt_ocr_source: 'SCAN',
        receipt_date: receipt_date || undefined,
        manual_override_flag: liters === 0 || price_per_liter === 0,
        payment_mode: (cap.payment_mode || 'CASH').toUpperCase(),
      });
    }
  }
  return fuel_entries;
}

/**
 * Fall back to PRIOR DAY's CarLogbookEntry.ending_km for starting_km when the
 * SMER ODO capture pipeline is empty. Same heuristic as
 * driveAllocationController.inferTodayStartKm but scoped to a specific day
 * (we look for the most recent VALID/POSTED entry strictly before `dateStr`).
 */
async function pullPriorDayEndingKm({ entity_id, bdm_id, dateStr }) {
  const bounds = manilaDayBounds(dateStr);
  if (!bounds) return null;
  const prior = await CarLogbookEntry.findOne({
    entity_id,
    bdm_id,
    entry_date: { $lt: bounds.startUtc },
    status: { $in: ['VALID', 'POSTED'] },
  }).sort({ entry_date: -1 }).select('ending_km entry_date').lean();
  if (!prior || !prior.ending_km || prior.ending_km <= 0) return null;
  return prior.ending_km;
}

/**
 * Main entry point. Returns the populated row + provenance map.
 *
 * @param {Object} args
 * @param {ObjectId|String} args.entity_id  — Required (Rule #19)
 * @param {ObjectId|String} args.bdm_id     — Required (Rule #21 — no fallback)
 * @param {String|Date} args.entry_date     — 'YYYY-MM-DD' (Manila local) or Date
 * @returns {Promise<Object>} { destination, starting_km, ending_km, starting_km_photo_url,
 *                              ending_km_photo_url, personal_km, official_km, fuel_entries,
 *                              _autopop_sources, _smer_meta, _drive_allocation }
 */
async function autoPopulateCarLogbookDay({ entity_id, bdm_id, entry_date }) {
  if (!entity_id) throw new Error('autoPopulateCarLogbookDay: entity_id is required');
  if (!bdm_id) throw new Error('autoPopulateCarLogbookDay: bdm_id is required');
  if (!entry_date) throw new Error('autoPopulateCarLogbookDay: entry_date is required');

  const dateStr = entry_date instanceof Date ? manilaDateString(entry_date) : String(entry_date).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    throw new Error(`autoPopulateCarLogbookDay: entry_date must be YYYY-MM-DD or a Date (got ${entry_date})`);
  }

  // Pull all four sources in parallel — Rule #19 entity_id is on every find()
  const [smer, odo, alloc, fuel] = await Promise.all([
    pullSmerDestination({ entity_id, bdm_id, dateStr }),
    pullSmerOdoCaptures({ entity_id, bdm_id, dateStr }),
    pullDriveAllocation({ entity_id, bdm_id, dateStr }),
    pullFuelEntries({ entity_id, bdm_id, dateStr }),
  ]);

  // Resolve starting_km — prefer SMER capture, fall back to prior day ending.
  let starting_km = odo.starting_km;
  let starting_km_photo_url = odo.starting_km_photo_url;
  let starting_km_source = odo.starting_km !== null ? SOURCE_TAGS.SMER_CAPTURE : null;
  if (starting_km === null) {
    const priorEnd = await pullPriorDayEndingKm({ entity_id, bdm_id, dateStr });
    if (priorEnd !== null) {
      starting_km = priorEnd;
      starting_km_source = SOURCE_TAGS.PRIOR_DAY;
    }
  }

  // ending_km from ODO captures only — no fallback (proxy fills if missing).
  const ending_km = odo.ending_km;
  const ending_km_photo_url = odo.ending_km_photo_url;
  const ending_km_source = ending_km !== null ? SOURCE_TAGS.SMER_CAPTURE : null;

  // KM split — DriveAllocation when present. NO_DRIVE row → 0/0 (the BDM
  // confirmed they didn't drive that day; logbook day still gets posted as
  // a zero-km row for audit completeness).
  const personal_km = alloc ? (alloc.personal_km || 0) : 0;
  const personal_km_source = alloc ? SOURCE_TAGS.DRIVE_ALLOCATION : null;
  const official_km = alloc ? (alloc.official_km || 0) : 0;
  // official_km is derived by the CarLogbookEntry pre-save hook from total_km
  // and personal_km — we expose it on the preview shape for UI display only.

  // Destination — SMER hospital_covered + notes
  const destination = smer ? smer.destination : '';
  const destination_source = (smer && smer.destination) ? SOURCE_TAGS.SMER : null;

  // Fuel entries — every FUEL_ENTRY capture for the day becomes a row
  const fuel_entries = fuel;
  const fuel_entries_source = fuel.length > 0 ? SOURCE_TAGS.FUEL_ENTRY_CAPTURE : null;

  return {
    destination,
    starting_km: starting_km ?? 0,
    ending_km: ending_km ?? 0,
    starting_km_photo_url,
    ending_km_photo_url,
    personal_km,
    official_km,
    fuel_entries,
    _autopop_sources: {
      destination: destination_source,
      starting_km: starting_km_source,
      ending_km: ending_km_source,
      starting_km_photo_url: starting_km_source,
      ending_km_photo_url: ending_km_source,
      personal_km: personal_km_source,
      official_km: personal_km_source, // same source — DriveAllocation
      fuel_entries: fuel_entries_source,
    },
    // Surface raw signals so the controller / UI can show "no drive" state,
    // SMER notes, etc., without re-querying.
    _smer_meta: smer,
    _drive_allocation: alloc,
    _has_any_signal: !!(
      destination_source || starting_km_source || ending_km_source ||
      personal_km_source || fuel_entries_source
    ),
  };
}

module.exports = {
  autoPopulateCarLogbookDay,
  SOURCE_TAGS,
  VALID_CAPTURE_STATUSES,
  // exported for unit tests / healthcheck
  manilaDayBounds,
  readOcrNumber,
  readOcrString,
  pullSmerDestination,
  pullSmerOdoCaptures,
  pullDriveAllocation,
  pullFuelEntries,
  pullPriorDayEndingKm,
};
