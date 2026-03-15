/**
 * Schedule Cycle Utilities
 *
 * Shared cycle math used by both Schedule model and validateWeeklyVisit.
 * Single source of truth for the 4-week cycle anchor and calculations.
 *
 * Cycle anchor: January 5, 2026 (Monday) = W1D1 of Cycle 0
 * Each cycle is 28 days (4 weeks × 7 days).
 */

/**
 * 4-week cycle anchor: January 5, 2026 (Monday) = W1D1 (UTC midnight)
 */
const CYCLE_ANCHOR = new Date(Date.UTC(2026, 0, 5));

/**
 * Manila timezone offset (UTC+8).
 * All day/week calculations use Manila local time so midnight PH visits
 * don't flip to the previous UTC day.
 */
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;

/**
 * Get week in 4-week cycle (1-4) based on Jan 5, 2026 anchor.
 * Uses Manila time (UTC+8) for correct local-date calculation.
 * @param {Date} date
 * @returns {number} Week in cycle (1-4)
 */
const getWeekOfMonth = (date) => {
  const manilaDate = new Date(date.getTime() + MANILA_OFFSET_MS);
  const diffMs = manilaDate.getTime() - CYCLE_ANCHOR.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  const dayInCycle = ((diffDays % 28) + 28) % 28;
  return Math.floor(dayInCycle / 7) + 1;
};

/**
 * Get day of week (1 = Monday … 7 = Sunday) using Manila time.
 * @param {Date} date
 * @returns {number} Day of week (1-7)
 */
const getDayOfWeek = (date) => {
  const manilaDate = new Date(date.getTime() + MANILA_OFFSET_MS);
  const jsDay = manilaDate.getUTCDay(); // 0 = Sunday
  return jsDay === 0 ? 7 : jsDay;
};

/**
 * Check if a date is a work day (Monday-Friday) using Manila time.
 * @param {Date} date
 * @returns {boolean}
 */
const isWorkDay = (date) => {
  const manilaDate = new Date(date.getTime() + MANILA_OFFSET_MS);
  const day = manilaDate.getUTCDay();
  return day >= 1 && day <= 5;
};

/**
 * Cycles per year (13 cycles × 28 days = 364 days).
 */
const CYCLES_PER_YEAR = 13;

/**
 * Get absolute cycle number from anchor date (ever-increasing, used for DB storage).
 * Uses Manila time so cycle boundaries align with Philippine local dates.
 * @param {Date} date
 * @returns {number}
 */
const getCycleNumber = (date) => {
  const manilaDate = new Date(date.getTime() + MANILA_OFFSET_MS);
  const diffMs = manilaDate.getTime() - CYCLE_ANCHOR.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  return Math.floor(diffDays / 28);
};

/**
 * Get display cycle number (0-12), resets each year.
 * Used for UI display only — DB queries should use getCycleNumber().
 * @param {Date} date
 * @returns {number} 0-12
 */
const getDisplayCycleNumber = (date) => {
  const absolute = getCycleNumber(date);
  return ((absolute % CYCLES_PER_YEAR) + CYCLES_PER_YEAR) % CYCLES_PER_YEAR;
};

/**
 * Get the Monday start date for a given cycle number.
 * @param {number} cycleNumber - Absolute cycle number
 * @returns {Date}
 */
const getCycleStartDate = (cycleNumber) => {
  const start = new Date(CYCLE_ANCHOR);
  start.setDate(start.getDate() + cycleNumber * 28);
  return start;
};

/**
 * Get the cycle end date (W4D5 = Friday of week 4).
 * @param {number} cycleNumber - Absolute cycle number
 * @returns {Date}
 */
const getCycleEndDate = (cycleNumber) => {
  const start = getCycleStartDate(cycleNumber);
  const end = new Date(start);
  end.setDate(end.getDate() + 25);
  end.setHours(23, 59, 59, 999);
  return end;
};

module.exports = {
  CYCLE_ANCHOR,
  MANILA_OFFSET_MS,
  CYCLES_PER_YEAR,
  getWeekOfMonth,
  getDayOfWeek,
  isWorkDay,
  getCycleNumber,
  getDisplayCycleNumber,
  getCycleStartDate,
  getCycleEndDate,
};
