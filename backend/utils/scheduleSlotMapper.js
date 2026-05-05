/**
 * Schedule Slot Mapper
 *
 * Phase A.6 (May 05 2026) — Admin-driven one-off scheduling.
 *
 * Single source of truth for converting a calendar date into the
 * {cycleNumber, scheduledWeek, scheduledDay, scheduledLabel} tuple
 * that the Schedule model stores. The CPT bulk-import path constructs
 * these tuples directly from sheet position; the new admin-driven path
 * (Add VIP / Upgrade to VIP / Reschedule) constructs them from a date.
 *
 * Also exposes:
 *   - validateSlotForDoctor(doctor, scheduledWeek): enforce the alternating-week
 *     rule for 2x/mo VIPs (must stay W1+W3 or W2+W4 — never W1+W2).
 *   - generateDefaultDates(doctor, cycleNumber, opts): smart-default dates for
 *     prefill on the Add/Upgrade modal.
 *
 * The alternating-week rule mirrors the same constraint enforced at visit-log
 * time in validateWeeklyVisit.js — this is the planning-time gate so admin
 * can't schedule a 2x/mo VIP for W1 + W2 (which would later be blocked at
 * visit time anyway, but admin should fail earlier with a clearer message).
 */

const {
  CYCLE_ANCHOR,
  MANILA_OFFSET_MS,
  getWeekOfMonth,
  getDayOfWeek,
  isWorkDay,
  getCycleNumber,
  getCycleStartDate,
  getCycleEndDate,
} = require('./scheduleCycleUtils');

/**
 * Convert a calendar date to the Schedule slot tuple.
 *
 * @param {Date|string} input - date to map
 * @returns {{ cycleNumber, scheduledWeek, scheduledDay, scheduledLabel, cycleStart }}
 * @throws {Error} if the date is not a Mon-Fri work day
 */
function dateToSlot(input) {
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) {
    throw new Error('Invalid date');
  }
  if (!isWorkDay(date)) {
    throw new Error('Schedule date must be a work day (Monday-Friday)');
  }
  const cycleNumber = getCycleNumber(date);
  const scheduledWeek = getWeekOfMonth(date);
  const scheduledDay = getDayOfWeek(date);
  const scheduledLabel = `W${scheduledWeek}D${scheduledDay}`;
  const cycleStart = getCycleStartDate(cycleNumber);
  return { cycleNumber, scheduledWeek, scheduledDay, scheduledLabel, cycleStart };
}

/**
 * Convert a {cycleNumber, scheduledWeek, scheduledDay} triple back to a calendar date.
 * Useful for the modal that reads existing entries and renders them as <input type=date>.
 *
 * @returns {Date}
 */
function slotToDate(cycleNumber, scheduledWeek, scheduledDay) {
  const start = getCycleStartDate(cycleNumber);
  const offsetDays = (scheduledWeek - 1) * 7 + (scheduledDay - 1);
  const out = new Date(start);
  out.setUTCDate(out.getUTCDate() + offsetDays);
  return out;
}

/**
 * Validate a scheduled-week against a doctor's visitFrequency rule.
 *
 * - visitFrequency=4 → any of W1..W4 is fine (one per week).
 * - visitFrequency=2 → must be a pair of {W1,W3} OR {W2,W4}. Each individual
 *   slot is fine in isolation; the *pair* is what the existing-entries set
 *   constrains. This function checks ONE candidate against ALREADY-SCHEDULED
 *   entries in the same cycle for the same doctor.
 *
 * @param {Object} doctor - { visitFrequency }
 * @param {Number} candidateWeek - the new scheduledWeek (1-4)
 * @param {Array<{scheduledWeek}>} existingEntries - already-scheduled in same cycle for this doctor
 * @returns {{ ok: boolean, reason?: string }}
 */
function validateAlternatingWeek(doctor, candidateWeek, existingEntries = []) {
  if (!doctor || doctor.visitFrequency !== 2) {
    return { ok: true };
  }
  const otherWeeks = existingEntries.map((e) => e.scheduledWeek).filter((w) => w !== candidateWeek);
  if (otherWeeks.length === 0) {
    return { ok: true };
  }
  const validPair = (a, b) => (a === 1 && b === 3) || (a === 3 && b === 1) || (a === 2 && b === 4) || (a === 4 && b === 2);
  for (const other of otherWeeks) {
    if (other === candidateWeek) continue;
    if (!validPair(candidateWeek, other)) {
      return {
        ok: false,
        reason: `2x/mo VIPs must alternate weeks (W1+W3 or W2+W4). Existing entry on W${other} conflicts with proposed W${candidateWeek}.`,
      };
    }
  }
  return { ok: true };
}

/**
 * Generate prefill dates for the Add/Upgrade modal.
 *
 * Strategy:
 *   - 4x/mo: one date per week (W1..W4), preferred day = Tuesday (D2).
 *   - 2x/mo: two dates following the W1+W3 pattern, preferred day = Tuesday.
 *
 * Caller is expected to skip past dates (the modal's date input minDate).
 * If today is mid-cycle, slots in earlier weeks of the current cycle are
 * still returned — the modal's minDate guard prevents past-date submission.
 *
 * @param {Object} doctor - { visitFrequency }
 * @param {Number} cycleNumber - target cycle (default current)
 * @param {Object} opts - { preferredDay = 2 } (1=Mon..5=Fri)
 * @returns {Array<{ date: string (YYYY-MM-DD), week: number, day: number }>}
 */
function generateDefaultDates(doctor, cycleNumber = getCycleNumber(new Date()), opts = {}) {
  const preferredDay = Math.min(5, Math.max(1, opts.preferredDay || 2));
  const visitFrequency = doctor?.visitFrequency === 2 ? 2 : 4;
  const weeks = visitFrequency === 2 ? [1, 3] : [1, 2, 3, 4];
  return weeks.map((week) => {
    const d = slotToDate(cycleNumber, week, preferredDay);
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    return { date: `${yyyy}-${mm}-${dd}`, week, day: preferredDay };
  });
}

/**
 * Reject if the target cycle is in the past.
 * (Reschedule into a past cycle is nonsensical and would silently bypass
 *  the BDM's current-cycle visibility.)
 */
function rejectPastCycle(targetCycle, today = new Date()) {
  const currentCycle = getCycleNumber(today);
  if (targetCycle < currentCycle) {
    return {
      ok: false,
      reason: `Target cycle ${targetCycle} is in the past (current cycle is ${currentCycle}). Use the CPT re-import flow for historical adjustments.`,
    };
  }
  return { ok: true };
}

module.exports = {
  dateToSlot,
  slotToDate,
  validateAlternatingWeek,
  generateDefaultDates,
  rejectPastCycle,
};
