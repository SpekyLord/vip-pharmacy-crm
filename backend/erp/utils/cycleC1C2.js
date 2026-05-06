/**
 * cycleC1C2.js — Shared C1/C2 half-monthly cycle helpers.
 *
 * Single source of truth for the ERP-domain reporting cycle:
 *   C1 = day 1–15 (inclusive), C2 = day 16–end-of-month.
 *
 * Used by every ERP-domain document that buckets by half-month: CarLogbookEntry,
 * SmerEntry, IncomeReport, Payslip, DeductionSchedule, DriveAllocation, and
 * CaptureSubmission archive. Do NOT use the 28-day BDM-visit cycle from CRM
 * `scheduleCycleUtils` — that's the wrong unit for ERP reporting (auditors
 * comparing a Capture cycle CSV against a SmerEntry per-diem CSV need both
 * to overlay on the same date window).
 *
 * Manila local time (UTC+8) governs all bucket boundaries — a 23:30 UTC
 * write on day 15 is a C2 row in Manila, not a C1 row.
 *
 * Why the extraction:
 * Both `driveAllocationController.js` (Phase P1.2 Slice 4) and
 * `captureSubmissionController.js` (Slice 8) had their own inline `cycleFor()`
 * + bounds math at first. Two copies will drift. This util removes the
 * duplication risk before a third caller arrives.
 */

const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;

/** Manila-local 'YYYY-MM-DD' for a given Date (or now). */
function manilaDateString(date = new Date()) {
  const manila = new Date(date.getTime() + MANILA_OFFSET_MS);
  const yyyy = manila.getUTCFullYear();
  const mm = String(manila.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(manila.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/** Manila-local period 'YYYY-MM' for a given Date (or now). */
function manilaPeriod(date = new Date()) {
  return manilaDateString(date).slice(0, 7);
}

/** Day-of-month (1–31) in Manila local time. */
function manilaDayOfMonth(date = new Date()) {
  return Number(manilaDateString(date).slice(8, 10));
}

/**
 * "C1" | "C2" from a Date OR a 'YYYY-MM-DD'-prefixed string.
 * Accepting both shapes lets aggregation pipelines + JS-side controllers
 * use the same helper.
 */
function cycleFor(dateOrStr) {
  const day = typeof dateOrStr === 'string'
    ? Number(dateOrStr.slice(8, 10))
    : Number(manilaDateString(dateOrStr).slice(8, 10));
  return day <= 15 ? 'C1' : 'C2';
}

/** Period 'YYYY-MM' from a Date OR a 'YYYY-MM-DD'-prefixed string. */
function periodFor(dateOrStr) {
  if (typeof dateOrStr === 'string') return dateOrStr.slice(0, 7);
  return manilaPeriod(dateOrStr);
}

/**
 * Returns Manila-local UTC bounds { start, end } for a given (period, cycle)
 * window. `start` is Manila midnight of the cycle's first day; `end` is the
 * last millisecond of the cycle's last day. Both Date objects, ready to pass
 * to a Mongoose `created_at: { $gte, $lte }` query.
 *
 * Returns null on malformed input (caller should 400 the request).
 */
function cycleBounds(period, cycle) {
  if (!/^\d{4}-\d{2}$/.test(String(period || ''))) return null;
  if (cycle !== 'C1' && cycle !== 'C2') return null;
  const [y, m] = period.split('-').map(Number);
  const startDay = cycle === 'C1' ? 1 : 16;
  // C1 ends day 15; C2 ends on the last day of the month (computed via the
  // Date.UTC(y, m, 0) trick — month is 1-indexed so passing day 0 of the
  // following month gives the last day of the current month, leap-year safe).
  const endDay = cycle === 'C1' ? 15 : new Date(Date.UTC(y, m, 0)).getUTCDate();
  // Manila midnight = UTC midnight − 8h. Build the UTC representation.
  const startUtc = new Date(Date.UTC(y, m - 1, startDay) - MANILA_OFFSET_MS);
  const endUtcExclusive = new Date(Date.UTC(y, m - 1, endDay + 1) - MANILA_OFFSET_MS);
  return { start: startUtc, end: new Date(endUtcExclusive.getTime() - 1) };
}

/** Mon-Fri Manila workday check from a Date or 'YYYY-MM-DD' string. */
function isWorkday(dateOrStr) {
  const dateStr = typeof dateOrStr === 'string'
    ? dateOrStr.slice(0, 10)
    : manilaDateString(dateOrStr);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const [y, m, d] = dateStr.split('-').map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d) - MANILA_OFFSET_MS);
  const manila = new Date(utc.getTime() + MANILA_OFFSET_MS);
  const dow = manila.getUTCDay(); // 0 = Sun
  return dow >= 1 && dow <= 5;
}

module.exports = {
  MANILA_OFFSET_MS,
  manilaDateString,
  manilaPeriod,
  manilaDayOfMonth,
  cycleFor,
  periodFor,
  cycleBounds,
  isWorkday,
};
