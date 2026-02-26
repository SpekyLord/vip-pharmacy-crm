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
 * 4-week cycle anchor: January 5, 2026 (Monday) = W1D1
 */
const CYCLE_ANCHOR = new Date(2026, 0, 5);

/**
 * Get week in 4-week cycle (1-4) based on Jan 5, 2026 anchor.
 * @param {Date} date
 * @returns {number} Week in cycle (1-4)
 */
const getWeekOfMonth = (date) => {
  const diffMs = date.getTime() - CYCLE_ANCHOR.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  const dayInCycle = ((diffDays % 28) + 28) % 28;
  return Math.floor(dayInCycle / 7) + 1;
};

/**
 * Get day of week (1 = Monday, 5 = Friday)
 * @param {Date} date
 * @returns {number} Day of week (1-7, Monday-Sunday)
 */
const getDayOfWeek = (date) => {
  const jsDay = date.getDay(); // 0 = Sunday
  return jsDay === 0 ? 7 : jsDay;
};

/**
 * Check if a date is a work day (Monday-Friday)
 * @param {Date} date
 * @returns {boolean}
 */
const isWorkDay = (date) => {
  const day = date.getDay();
  return day >= 1 && day <= 5;
};

/**
 * Get 0-based cycle number from anchor date.
 * @param {Date} date
 * @returns {number}
 */
const getCycleNumber = (date) => {
  const diffMs = date.getTime() - CYCLE_ANCHOR.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  return Math.floor(diffDays / 28);
};

/**
 * Get the Monday start date for a given cycle number.
 * @param {number} cycleNumber
 * @returns {Date}
 */
const getCycleStartDate = (cycleNumber) => {
  const start = new Date(CYCLE_ANCHOR);
  start.setDate(start.getDate() + cycleNumber * 28);
  return start;
};

/**
 * Get the cycle end date (W4D5 = Friday of week 4).
 * @param {number} cycleNumber
 * @returns {Date}
 */
const getCycleEndDate = (cycleNumber) => {
  const start = getCycleStartDate(cycleNumber);
  const end = new Date(start);
  end.setDate(end.getDate() + 25); // 3 weeks + 5 weekdays = Friday of W4
  end.setHours(23, 59, 59, 999);
  return end;
};

module.exports = {
  CYCLE_ANCHOR,
  getWeekOfMonth,
  getDayOfWeek,
  isWorkDay,
  getCycleNumber,
  getCycleStartDate,
  getCycleEndDate,
};
