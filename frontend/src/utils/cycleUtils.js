/**
 * Cycle utilities — mirrors backend/utils/scheduleCycleUtils.js
 * 4-week rotating cycle anchored to Jan 5, 2026 (Monday = W1D1).
 */

const CYCLE_ANCHOR_MS = Date.UTC(2026, 0, 5); // Jan 5, 2026 00:00 UTC
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;  // UTC+8

/**
 * Get the week of the 4-week cycle (1-4) for a given date.
 * Uses Manila time (UTC+8).
 * @param {Date} date
 * @returns {number} 1-4
 */
export function getWeekOfMonth(date = new Date()) {
  const manilaMs = date.getTime() + MANILA_OFFSET_MS;
  const diffMs = manilaMs - CYCLE_ANCHOR_MS;
  const diffDays = Math.floor(diffMs / 86400000);
  const dayInCycle = ((diffDays % 28) + 28) % 28;
  return Math.floor(dayInCycle / 7) + 1;
}

/**
 * Get the start and end dates (Manila time) for the current cycle week.
 * Useful for displaying "Week X (Apr 7-13)" labels.
 * @param {Date} date
 * @returns {{ weekStart: Date, weekEnd: Date }}
 */
export function getCycleWeekRange(date = new Date()) {
  const manilaMs = date.getTime() + MANILA_OFFSET_MS;
  const diffMs = manilaMs - CYCLE_ANCHOR_MS;
  const diffDays = Math.floor(diffMs / 86400000);
  const dayInCycle = ((diffDays % 28) + 28) % 28;
  const dayInWeek = dayInCycle % 7; // 0 = Monday of cycle week

  const weekStartMs = date.getTime() - dayInWeek * 86400000;
  const weekEndMs = weekStartMs + 6 * 86400000;

  return {
    weekStart: new Date(weekStartMs),
    weekEnd: new Date(weekEndMs),
  };
}
