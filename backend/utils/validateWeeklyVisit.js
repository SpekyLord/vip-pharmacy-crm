/**
 * Weekly Visit Validation Utility
 *
 * This file handles:
 * - Weekly visit enforcement (one visit per doctor per week)
 * - Monthly quota tracking (2x or 4x per doctor)
 * - Work days validation (Monday-Friday only)
 * - Week number and date calculations
 *
 * Business Rules (New):
 * - Maximum ONE visit per doctor per calendar week (Mon-Fri)
 * - Monthly quota: 2x or 4x visits per doctor based on visitFrequency
 * - Work days only: Monday to Friday
 * - Hard limit: Block excess visits beyond monthly quota
 */

const Visit = require('../models/Visit');
const Doctor = require('../models/Doctor');

/**
 * Get ISO week number for a date
 * @param {Date} date
 * @returns {number} Week number (1-53)
 */
const getWeekNumber = (date) => {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
};

/**
 * Get week of month (1-5)
 * @param {Date} date
 * @returns {number} Week of month
 */
const getWeekOfMonth = (date) => {
  const startOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
  const dayOfMonth = date.getDate();
  const startDayOfWeek = startOfMonth.getDay();
  return Math.ceil((dayOfMonth + startDayOfWeek) / 7);
};

/**
 * Get day of week (1 = Monday, 5 = Friday)
 * @param {Date} date
 * @returns {number} Day of week (1-7, Monday-Sunday)
 */
const getDayOfWeek = (date) => {
  const jsDay = date.getDay(); // 0 = Sunday
  return jsDay === 0 ? 7 : jsDay; // Convert to ISO (1 = Monday)
};

/**
 * Get week label format (W1D1, W2D3, etc.)
 * @param {Date} date
 * @returns {string} Week label
 */
const getWeekLabel = (date) => {
  const weekOfMonth = getWeekOfMonth(date);
  const dayOfWeek = getDayOfWeek(date);
  return `W${weekOfMonth}D${dayOfWeek}`;
};

/**
 * Get month-year string (2024-12)
 * @param {Date} date
 * @returns {string} Month-year string
 */
const getMonthYear = (date) => {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${date.getFullYear()}-${month}`;
};

/**
 * Get year-week key (2024-W52) - ISO format
 * @param {Date} date
 * @returns {string} Year-week key
 */
const getYearWeekKey = (date) => {
  const week = String(getWeekNumber(date)).padStart(2, '0');
  return `${date.getFullYear()}-W${week}`;
};

/**
 * Get date range for a specific week
 * @param {number} weekNumber - ISO week number
 * @param {number} year
 * @returns {{start: Date, end: Date}}
 */
const getWeekDateRange = (weekNumber, year) => {
  // Get January 4th of the year (always in week 1)
  const jan4 = new Date(year, 0, 4);
  const dayOfWeek = jan4.getDay() || 7;

  // Get Monday of week 1
  const week1Monday = new Date(jan4);
  week1Monday.setDate(jan4.getDate() - dayOfWeek + 1);

  // Get Monday of the requested week
  const start = new Date(week1Monday);
  start.setDate(week1Monday.getDate() + (weekNumber - 1) * 7);

  // Get Friday of the requested week (work days only)
  const end = new Date(start);
  end.setDate(start.getDate() + 4);
  end.setHours(23, 59, 59, 999);

  return { start, end };
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
 * Check if user has already visited this doctor this week
 * @param {string} doctorId
 * @param {string} userId
 * @param {Date} visitDate - Optional date, defaults to today
 * @returns {Promise<boolean>}
 */
const hasVisitedThisWeek = async (doctorId, userId, visitDate = new Date()) => {
  const yearWeekKey = getYearWeekKey(visitDate);
  return Visit.hasVisitedThisWeek(doctorId, userId, yearWeekKey);
};

/**
 * Get count of visits to a doctor by a user in a specific month
 * @param {string} doctorId
 * @param {string} userId
 * @param {string} monthYear - Format: "2024-12"
 * @returns {Promise<number>}
 */
const getMonthlyVisitCount = async (doctorId, userId, monthYear) => {
  return Visit.countDoctorVisitsInMonth(doctorId, userId, monthYear);
};

/**
 * Check if user can visit this doctor (both weekly and monthly limits)
 * @param {string} doctorId
 * @param {string} userId
 * @param {Date} visitDate - Optional date, defaults to today
 * @returns {Promise<{canVisit: boolean, reason?: string, weeklyCount: number, monthlyCount: number, monthlyLimit: number}>}
 */
const canVisitDoctor = async (doctorId, userId, visitDate = new Date()) => {
  // Check if it's a work day
  if (!isWorkDay(visitDate)) {
    return {
      canVisit: false,
      reason: 'Visits can only be logged on work days (Monday-Friday)',
      weeklyCount: 0,
      monthlyCount: 0,
      monthlyLimit: 0,
    };
  }

  // Get doctor's visit frequency (2x or 4x monthly)
  const doctor = await Doctor.findById(doctorId);
  if (!doctor) {
    return {
      canVisit: false,
      reason: 'Doctor not found',
      weeklyCount: 0,
      monthlyCount: 0,
      monthlyLimit: 0,
    };
  }

  const monthlyLimit = doctor.visitFrequency || 4;
  const monthYear = getMonthYear(visitDate);
  const yearWeekKey = getYearWeekKey(visitDate);

  // Check weekly limit (one per week)
  const alreadyVisitedThisWeek = await Visit.hasVisitedThisWeek(
    doctorId,
    userId,
    yearWeekKey
  );

  if (alreadyVisitedThisWeek) {
    return {
      canVisit: false,
      reason: 'You have already visited this doctor this week. Only one visit per doctor per week is allowed.',
      weeklyCount: 1,
      monthlyCount: await Visit.countDoctorVisitsInMonth(doctorId, userId, monthYear),
      monthlyLimit,
    };
  }

  // Check monthly limit (hard limit)
  const monthlyCount = await Visit.countDoctorVisitsInMonth(doctorId, userId, monthYear);

  if (monthlyCount >= monthlyLimit) {
    return {
      canVisit: false,
      reason: `Monthly visit quota reached. This doctor requires ${monthlyLimit}x visits per month, and you have already visited ${monthlyCount} times.`,
      weeklyCount: 0,
      monthlyCount,
      monthlyLimit,
    };
  }

  return {
    canVisit: true,
    weeklyCount: 0,
    monthlyCount,
    monthlyLimit,
  };
};

/**
 * Get weekly compliance stats for a user in a specific month
 * @param {string} userId
 * @param {string} monthYear - Format: "2024-12"
 * @returns {Promise<Array<{week: number, visited: number, doctors: Array}>>}
 */
const getWeeklyComplianceStats = async (userId, monthYear) => {
  return Visit.getWeeklyComplianceStats(userId, monthYear);
};

/**
 * Get full compliance report for a user
 * @param {string} userId
 * @param {string} monthYear - Format: "2024-12"
 * @returns {Promise<{weeks: Array, totalVisits: number, totalDoctors: number, compliancePercentage: number}>}
 */
const getComplianceReport = async (userId, monthYear) => {
  const weeklyStats = await getWeeklyComplianceStats(userId, monthYear);

  // Get total assigned doctors for this user
  const Doctor = require('../models/Doctor');
  const User = require('../models/User');

  const user = await User.findById(userId);
  let totalDoctors = 0;

  if (user.role === 'employee' && user.assignedRegions?.length > 0) {
    totalDoctors = await Doctor.countDocuments({
      region: { $in: user.assignedRegions },
      isActive: true,
    });
  }

  // Calculate totals
  const totalVisits = weeklyStats.reduce((sum, w) => sum + w.visitCount, 0);
  const uniqueDoctors = new Set();
  weeklyStats.forEach((w) => w.doctors.forEach((d) => uniqueDoctors.add(d.toString())));

  // Calculate expected visits (sum of all doctor frequencies)
  const doctors = await Doctor.find({
    region: { $in: user.assignedRegions || [] },
    isActive: true,
  });
  const expectedVisits = doctors.reduce((sum, d) => sum + (d.visitFrequency || 4), 0);

  return {
    weeks: weeklyStats.map((w) => ({
      week: w._id,
      visited: w.visitCount,
      uniqueDoctors: w.doctors.length,
    })),
    totalVisits,
    totalDoctors,
    uniqueDoctorsVisited: uniqueDoctors.size,
    expectedVisits,
    compliancePercentage: expectedVisits > 0
      ? Math.round((totalVisits / expectedVisits) * 100)
      : 0,
  };
};

/**
 * Check if an employee is behind schedule
 * @param {string} userId
 * @param {Date} checkDate - Optional date to check, defaults to today
 * @returns {Promise<{isBehind: boolean, details: object}>}
 */
const checkBehindSchedule = async (userId, checkDate = new Date()) => {
  const monthYear = getMonthYear(checkDate);
  const weekOfMonth = getWeekOfMonth(checkDate);

  // Get compliance stats
  const weeklyStats = await getWeeklyComplianceStats(userId, monthYear);

  // Get expected visits by this week
  const User = require('../models/User');
  const user = await User.findById(userId);

  if (!user || user.role !== 'employee') {
    return { isBehind: false, details: {} };
  }

  // Get doctors assigned to this user's regions
  const doctors = await Doctor.find({
    region: { $in: user.assignedRegions || [] },
    isActive: true,
  });

  // Calculate expected visits per week (simplified: total frequency / 4 weeks)
  const totalMonthlyTarget = doctors.reduce((sum, d) => sum + (d.visitFrequency || 4), 0);
  const expectedVisitsPerWeek = Math.ceil(totalMonthlyTarget / 4);
  const expectedByNow = expectedVisitsPerWeek * weekOfMonth;

  // Calculate actual visits so far
  const actualVisits = weeklyStats.reduce((sum, w) => sum + w.visitCount, 0);

  const isBehind = actualVisits < expectedByNow * 0.8; // 80% threshold

  return {
    isBehind,
    details: {
      currentWeek: weekOfMonth,
      actualVisits,
      expectedByNow,
      percentageComplete: expectedByNow > 0
        ? Math.round((actualVisits / expectedByNow) * 100)
        : 100,
      totalMonthlyTarget,
    },
  };
};

module.exports = {
  getWeekNumber,
  getWeekOfMonth,
  getDayOfWeek,
  getWeekLabel,
  getMonthYear,
  getYearWeekKey,
  getWeekDateRange,
  isWorkDay,
  hasVisitedThisWeek,
  getMonthlyVisitCount,
  canVisitDoctor,
  getWeeklyComplianceStats,
  getComplianceReport,
  checkBehindSchedule,
};
