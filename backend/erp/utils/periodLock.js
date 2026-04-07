/**
 * Period Lock Utility — Prevents posting to closed/locked periods
 *
 * Used by all submit functions (Sales, Collections, Expenses, SMER, Car Logbook, PRF/CALF)
 * to enforce month-end close integrity.
 */
const MonthlyArchive = require('../models/MonthlyArchive');
const mongoose = require('mongoose');

/**
 * Check if a period is open for posting.
 * Throws an error if the period is CLOSED or LOCKED.
 *
 * @param {String|ObjectId} entityId
 * @param {String} period - "YYYY-MM" format
 * @throws {Error} if period is closed or locked
 */
async function checkPeriodOpen(entityId, period) {
  if (!entityId || !period) return; // skip if no entity or period

  const archive = await MonthlyArchive.findOne({
    entity_id: new mongoose.Types.ObjectId(entityId),
    period,
    record_type: 'MONTHLY'
  }).select('period_status').lean();

  if (archive && ['CLOSED', 'LOCKED'].includes(archive.period_status)) {
    const err = new Error(`Period ${period} is ${archive.period_status}. Cannot post new transactions. Contact Finance to re-open.`);
    err.code = 'PERIOD_LOCKED';
    err.status = 400;
    throw err;
  }
}

/**
 * Extract period string from a Date object
 * @param {Date} date
 * @returns {String} "YYYY-MM"
 */
function dateToPeriod(date) {
  if (!date) return null;
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

module.exports = { checkPeriodOpen, dateToPeriod };
