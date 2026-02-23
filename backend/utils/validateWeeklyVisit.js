/**
 * Weekly Visit Validation Utility
 *
 * This file handles:
 * - Weekly visit enforcement (one visit per doctor per week)
 * - Monthly quota tracking (2x or 4x per doctor)
 * - Work days validation (Monday-Friday only)
 * - Week number and date calculations
 *
 * Business Rules:
 * - Maximum ONE visit per doctor per calendar week (Mon-Fri)
 * - Monthly quota: 2x or 4x visits per doctor based on visitFrequency
 * - Work days only: Monday to Friday
 * - Hard limit: Block excess visits beyond monthly quota
 */

const mongoose = require('mongoose');
const Visit = require('../models/Visit');
const Doctor = require('../models/Doctor');
const User = require('../models/User');
const Region = require('../models/Region');

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
 * Uses ISO week standard: week starts on Monday
 * @param {Date} date
 * @returns {number} Week of month
 */
const getWeekOfMonth = (date) => {
  const firstOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
  // Get day of week for first of month (0=Sun, convert to Mon=0)
  const firstDayOfWeek = firstOfMonth.getDay();
  const adjustedFirst = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1; // ISO: Mon=0, Sun=6
  const dayOfMonth = date.getDate();
  return Math.ceil((dayOfMonth + adjustedFirst) / 7);
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
 * Get month-year string (2024-12) - Calendar month
 * @param {Date} date
 * @returns {string} Month-year string
 */
const getMonthYear = (date) => {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${date.getFullYear()}-${month}`;
};

/**
 * Get EFFECTIVE month-year, applying 5th week → next month logic
 * Matches Visit.js pre-save hook behavior exactly
 * @param {Date} date
 * @returns {string} Effective month-year string (may differ from calendar month)
 */
const getEffectiveMonthYear = (date) => {
  const weekOfMonth = getWeekOfMonth(date);

  let effectiveYear = date.getFullYear();
  let effectiveMonth = date.getMonth(); // 0-indexed

  // 5th+ week dates count towards next month (matches Visit.js logic)
  if (weekOfMonth > 4) {
    effectiveMonth++;
    if (effectiveMonth > 11) {
      effectiveMonth = 0;
      effectiveYear++;
    }
  }

  const monthStr = String(effectiveMonth + 1).padStart(2, '0');
  return `${effectiveYear}-${monthStr}`;
};

/**
 * Get year-week key (2024-W52) - ISO format
 * Uses ISO year which may differ from calendar year at year boundaries
 * e.g., Dec 30, 2025 is in Week 1 of 2026 (not Week 53 of 2025)
 * @param {Date} date
 * @returns {string} Year-week key
 */
const getYearWeekKey = (date) => {
  // Calculate ISO year (may differ from calendar year at year boundaries)
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const isoYear = d.getUTCFullYear();

  const week = String(getWeekNumber(date)).padStart(2, '0');
  return `${isoYear}-W${week}`;
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
 * Check if an employee can access a doctor's region (hierarchical check)
 * @param {Object} user - User object with assignedRegions
 * @param {ObjectId} doctorRegionId - The doctor's region ID
 * @returns {Promise<boolean>}
 */
const canAccessDoctorRegion = async (user, doctorRegionId) => {
  // Admin can access all regions
  if (user.role === 'admin' && user.canAccessAllRegions) {
    return true;
  }

  // If no assigned regions, no access
  if (!user.assignedRegions || user.assignedRegions.length === 0) {
    return false;
  }

  // Ensure we extract the actual ObjectId from potentially populated objects
  const targetRegionId = doctorRegionId?._id || doctorRegionId;
  if (!targetRegionId) {
    console.error('canAccessDoctorRegion: No valid doctor region ID provided');
    return false;
  }
  const doctorRegionStr = targetRegionId.toString();

  // Get all descendant regions for each assigned region
  for (const region of user.assignedRegions) {
    const regionId = region?._id || region;
    if (!regionId) continue;

    const descendants = await Region.getDescendantIds(regionId);

    // Check if doctor's region is in the descendants list
    const hasAccess = descendants.some((id) => id.toString() === doctorRegionStr);
    if (hasAccess) {
      return true;
    }
  }

  return false;
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
 * Check if user can visit this doctor (region access, weekly and monthly limits)
 * @param {string} doctorId
 * @param {Object} user - User object (with _id and assignedRegions)
 * @param {Date} visitDate - Optional date, defaults to today
 * @returns {Promise<{canVisit: boolean, reason?: string, weeklyCount: number, monthlyCount: number, monthlyLimit: number}>}
 */
const canVisitDoctor = async (doctorId, user, visitDate = new Date()) => {
  // Handle both user object and userId for backward compatibility
  const userId = user._id || user;

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
  const doctor = await Doctor.findById(doctorId).populate('region');
  if (!doctor) {
    return {
      canVisit: false,
      reason: 'Doctor not found',
      weeklyCount: 0,
      monthlyCount: 0,
      monthlyLimit: 0,
    };
  }

  // Check region access (only if user object with assignedRegions is provided)
  if (user.assignedRegions !== undefined) {
    const hasRegionAccess = await canAccessDoctorRegion(user, doctor.region._id || doctor.region);
    if (!hasRegionAccess) {
      return {
        canVisit: false,
        reason: 'You do not have access to this doctor\'s region',
        weeklyCount: 0,
        monthlyCount: 0,
        monthlyLimit: doctor.visitFrequency || 4,
      };
    }
  }

  const monthlyLimit = doctor.visitFrequency || 4;
  const monthYear = getEffectiveMonthYear(visitDate); // Use effective month (5th week → next month)
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

  // NOTE (Task A.2 / Phase C): Alternating week enforcement for 2x doctors (W1+W3 or W2+W4)
  // is deferred to Phase C (Task C.1 - Schedule System). The parity check cannot be
  // implemented correctly here because missed visits carry forward (a visit logged in W2
  // may be a legitimate carried W1 entry, not an invalid W2 visit). Once the Schedule
  // model exists, alternating weeks will be enforced through schedule entries themselves —
  // only scheduled/carried weeks will appear as visitable for each doctor.

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

/**
 * Batch check if user can visit multiple doctors
 * OPTIMIZED: Loads all doctors and visits once, then checks in parallel
 * @param {Array<string>} doctorIds - Array of doctor IDs
 * @param {Object} user - User object with _id and assignedRegions
 * @param {Date} visitDate - Optional date, defaults to today
 * @returns {Promise<Array<{doctorId: string, canVisit: boolean, reason?: string, weeklyCount: number, monthlyCount: number, monthlyLimit: number}>>}
 */
const canVisitDoctorsBatch = async (doctorIds, user, visitDate = new Date()) => {
  // Check if it's a work day first
  if (!isWorkDay(visitDate)) {
    return doctorIds.map((doctorId) => ({
      doctorId,
      canVisit: false,
      reason: 'Visits can only be logged on work days (Monday-Friday)',
      weeklyCount: 0,
      monthlyCount: 0,
      monthlyLimit: 0,
    }));
  }

  const userId = user._id || user;
  const monthYear = getEffectiveMonthYear(visitDate); // Use effective month (5th week → next month)
  const yearWeekKey = getYearWeekKey(visitDate);

  // OPTIMIZATION: Load all doctors in one query
  const doctors = await Doctor.find({ _id: { $in: doctorIds } }).populate('region');
  const doctorMap = new Map(doctors.map((d) => [d._id.toString(), d]));

  // OPTIMIZATION: Get all weekly visits in one query
  const weeklyVisits = await Visit.find({
    doctor: { $in: doctorIds },
    user: userId,
    yearWeekKey,
    status: 'completed',
  }).select('doctor');
  const visitedThisWeek = new Set(weeklyVisits.map((v) => v.doctor.toString()));

  // OPTIMIZATION: Get all monthly visit counts in one aggregation
  const monthlyCounts = await Visit.aggregate([
    {
      $match: {
        doctor: { $in: doctorIds.map((id) => new mongoose.Types.ObjectId(id)) },
        user: new mongoose.Types.ObjectId(userId),
        monthYear,
        status: 'completed',
      },
    },
    {
      $group: {
        _id: '$doctor',
        count: { $sum: 1 },
      },
    },
  ]);
  const monthlyCountMap = new Map(monthlyCounts.map((c) => [c._id.toString(), c.count]));

  // Check region access for all doctors if user has assignedRegions
  let regionAccessMap = new Map();
  if (user.assignedRegions !== undefined) {
    // Get all unique region IDs from doctors
    const regionIds = [...new Set(doctors.map((d) => (d.region?._id || d.region)?.toString()).filter(Boolean))];

    // For each assigned region, get all descendants
    const allAccessibleRegions = new Set();
    for (const region of user.assignedRegions || []) {
      const regionId = region?._id || region;
      if (regionId) {
        const descendants = await Region.getDescendantIds(regionId);
        descendants.forEach((id) => allAccessibleRegions.add(id.toString()));
      }
    }

    // Build access map for each doctor's region
    regionIds.forEach((regionId) => {
      regionAccessMap.set(regionId, allAccessibleRegions.has(regionId));
    });

    // Admin can access all
    if (user.role === 'admin' && user.canAccessAllRegions) {
      regionIds.forEach((regionId) => regionAccessMap.set(regionId, true));
    }
  }

  // Process each doctor
  return doctorIds.map((doctorId) => {
    const doctor = doctorMap.get(doctorId);

    if (!doctor) {
      return {
        doctorId,
        canVisit: false,
        reason: 'Doctor not found',
        weeklyCount: 0,
        monthlyCount: 0,
        monthlyLimit: 0,
      };
    }

    const monthlyLimit = doctor.visitFrequency || 4;
    const monthlyCount = monthlyCountMap.get(doctorId) || 0;
    const doctorRegionId = (doctor.region?._id || doctor.region)?.toString();

    // Check region access
    if (user.assignedRegions !== undefined && doctorRegionId) {
      const hasRegionAccess = regionAccessMap.get(doctorRegionId);
      if (!hasRegionAccess) {
        return {
          doctorId,
          canVisit: false,
          reason: 'You do not have access to this doctor\'s region',
          weeklyCount: 0,
          monthlyCount,
          monthlyLimit,
        };
      }
    }

    // Check weekly limit
    if (visitedThisWeek.has(doctorId)) {
      return {
        doctorId,
        canVisit: false,
        reason: 'You have already visited this doctor this week. Only one visit per doctor per week is allowed.',
        weeklyCount: 1,
        monthlyCount,
        monthlyLimit,
      };
    }

    // Check monthly limit
    if (monthlyCount >= monthlyLimit) {
      return {
        doctorId,
        canVisit: false,
        reason: `Monthly visit quota reached. This doctor requires ${monthlyLimit}x visits per month, and you have already visited ${monthlyCount} times.`,
        weeklyCount: 0,
        monthlyCount,
        monthlyLimit,
      };
    }

    // NOTE (Task A.2 / Phase C): Alternating week enforcement deferred to Phase C Schedule system.
    // See canVisitDoctor() for full explanation.

    return {
      doctorId,
      canVisit: true,
      weeklyCount: 0,
      monthlyCount,
      monthlyLimit,
    };
  });
};

module.exports = {
  getWeekNumber,
  getWeekOfMonth,
  getDayOfWeek,
  getWeekLabel,
  getMonthYear,
  getEffectiveMonthYear,
  getYearWeekKey,
  getWeekDateRange,
  isWorkDay,
  canAccessDoctorRegion,
  hasVisitedThisWeek,
  getMonthlyVisitCount,
  canVisitDoctor,
  canVisitDoctorsBatch,
  getWeeklyComplianceStats,
  getComplianceReport,
  checkBehindSchedule,
};
