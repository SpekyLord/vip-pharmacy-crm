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
const { CYCLE_ANCHOR, MANILA_OFFSET_MS, getWeekOfMonth, getDayOfWeek, isWorkDay: isWorkDayUtil, getCycleNumber } = require('./scheduleCycleUtils');
const { ROLES, isAdminLike } = require('../constants/roles');

/**
 * Get ISO week number for a date
 * @param {Date} date
 * @returns {number} Week number (1-53)
 */
const getWeekNumber = (date) => {
  const manilaDate = new Date(date.getTime() + MANILA_OFFSET_MS);
  const d = new Date(Date.UTC(manilaDate.getUTCFullYear(), manilaDate.getUTCMonth(), manilaDate.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
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
  const manilaDate = new Date(date.getTime() + MANILA_OFFSET_MS);
  const month = String(manilaDate.getUTCMonth() + 1).padStart(2, '0');
  return `${manilaDate.getUTCFullYear()}-${month}`;
};

/**
 * Get EFFECTIVE month-year for a visit date.
 * Now that we use anchor-based cycles (Jan 5, 2026), there is no "5th week overflow".
 * weekOfMonth is always 1-4, so effective month = calendar month.
 * Kept for backward compatibility with callers.
 * @param {Date} date
 * @returns {string} Month-year string (always calendar month)
 */
const getEffectiveMonthYear = (date) => {
  return getMonthYear(date);
};

/**
 * Get year-week key (2024-W52) - ISO format
 * Uses ISO year which may differ from calendar year at year boundaries
 * e.g., Dec 30, 2025 is in Week 1 of 2026 (not Week 53 of 2025)
 * @param {Date} date
 * @returns {string} Year-week key
 */
const getYearWeekKey = (date) => {
  const manilaDate = new Date(date.getTime() + MANILA_OFFSET_MS);
  // Calculate ISO year (may differ from calendar year at year boundaries)
  const d = new Date(Date.UTC(manilaDate.getUTCFullYear(), manilaDate.getUTCMonth(), manilaDate.getUTCDate()));
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

// Use shared isWorkDay from scheduleCycleUtils
const isWorkDay = isWorkDayUtil;

/**
 * Check if an employee can access a doctor (assignment-based check)
 * @param {Object} user - User object with _id
 * @param {Object} doctor - Doctor object with assignedTo field
 * @returns {boolean}
 */
const canAccessDoctor = (user, doctor) => {
  // Admin-like roles (admin, finance, president, ceo) can access all doctors
  if (isAdminLike(user.role)) {
    return true;
  }

  // BDMs can only access doctors assigned to them
  const assignedToId = doctor.assignedTo?._id || doctor.assignedTo;
  if (!assignedToId) return false;
  return assignedToId.toString() === (user._id || user).toString();
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
 * @param {Object} user - User object (with _id and role)
 * @param {Date} visitDate - Optional date, defaults to today
 * @returns {Promise<{canVisit: boolean, reason?: string, weeklyCount: number, monthlyCount: number, monthlyLimit: number, isWeekend?: boolean}>}
 */
const canVisitDoctor = async (doctorId, user, visitDate = new Date()) => {
  // Handle both user object and userId for backward compatibility
  const userId = user._id || user;
  const manilaVisitDate = new Date(visitDate.getTime() + MANILA_OFFSET_MS);
  const jsDay = manilaVisitDate.getUTCDay();
  const isWeekendDate = jsDay === 0 || jsDay === 6;

  // Get doctor's visit frequency (2x or 4x monthly)
  const doctor = await Doctor.findById(doctorId);
  if (!doctor) {
    return {
      canVisit: false,
      reason: 'Doctor not found',
      weeklyCount: 0,
      monthlyCount: 0,
      monthlyLimit: 0,
      isWeekend: isWeekendDate,
    };
  }

  // Check assignment access (BDMs can only visit doctors assigned to them)
  if (user.role === ROLES.CONTRACTOR) {
    if (!canAccessDoctor(user, doctor)) {
      return {
        canVisit: false,
        reason: 'This VIP Client is not assigned to you',
        weeklyCount: 0,
        monthlyCount: 0,
        monthlyLimit: doctor.visitFrequency || 4,
        isWeekend: isWeekendDate,
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
      isWeekend: isWeekendDate,
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
      isWeekend: isWeekendDate,
    };
  }

  // Schedule-aware validation (Task A.2 + C.1):
  // If schedule entries exist for this doctor+user+cycle, enforce via schedule.
  // Only scheduled (current/past week) or carried entries are visitable.
  const Schedule = require('../models/Schedule');
  const currentCycle = Schedule.getCycleNumber(visitDate);
  const currentWeek = Schedule.getCurrentCycleWeek(visitDate);

  const scheduleEntries = await Schedule.find({
    doctor: doctorId,
    user: userId,
    cycleNumber: currentCycle,
  });

  if (scheduleEntries.length > 0) {
    // Schedule exists — enforce through schedule entries
    const visitable = scheduleEntries.filter((e) => {
      if (e.status === 'completed' || e.status === 'missed') return false;
      if (e.status === 'planned' && e.scheduledWeek <= currentWeek) return true;
      if (e.status === 'carried') return true;
      return false;
    });

    // Weekend conditional logic for VIP clients (doctors with schedules)
    // Weekends are only allowed if there are carried/overdue entries to clear
    // On weekends, ANY visitable entry counts as "overdue" since weekdays (Mon-Fri) have passed
    // - carried entries from previous weeks
    // - planned entries for current or past weeks (they missed their Mon-Fri window)
    if (isWeekendDate) {
      // If there are visitable entries, they can catch up on weekend
      // visitable already filters for carried OR planned with scheduledWeek <= currentWeek
      if (visitable.length === 0) {
        return {
          canVisit: false,
          reason: 'Weekend visits are only allowed for VIP Clients with carried or overdue visits.',
          weeklyCount: 0,
          monthlyCount,
          monthlyLimit,
          isWeekend: true,
          scheduleInfo: { hasSchedule: true },
        };
      }
    }

    if (visitable.length === 0) {
      // Check if all are completed
      const allCompleted = scheduleEntries.every((e) => e.status === 'completed');
      const reason = allCompleted
        ? 'All scheduled visits for this VIP Client have been completed this cycle.'
        : `This VIP Client is scheduled for ${scheduleEntries.filter(e => e.status === 'planned').map(e => `W${e.scheduledWeek}`).join(', ')}. Not visitable in W${currentWeek}.`;
      return {
        canVisit: false,
        reason,
        weeklyCount: 0,
        monthlyCount,
        monthlyLimit,
        isWeekend: isWeekendDate,
        scheduleInfo: { hasSchedule: true, entries: scheduleEntries },
      };
    }

    return {
      canVisit: true,
      weeklyCount: 0,
      monthlyCount,
      monthlyLimit,
      isWeekend: isWeekendDate,
      scheduleInfo: { hasSchedule: true, visitableEntries: visitable },
    };
  }

  // No schedule exists — VIP client without schedule
  // On weekends, block unless there's schedule with carried entries (handled above)
  if (isWeekendDate) {
    return {
      canVisit: false,
      reason: 'Weekend visits are only allowed for VIP Clients with carried or overdue visits.',
      weeklyCount: 0,
      monthlyCount,
      monthlyLimit,
      isWeekend: true,
    };
  }

  // Weekday with no schedule — fall through to existing monthly quota logic (backward compat)
  return {
    canVisit: true,
    weeklyCount: 0,
    monthlyCount,
    monthlyLimit,
    isWeekend: false,
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
  // Parallelize independent queries
  const [weeklyStats, user] = await Promise.all([
    getWeeklyComplianceStats(userId, monthYear),
    User.findById(userId),
  ]);

  // Get doctors assigned to this user
  const doctors = await Doctor.find({
    assignedTo: userId,
    isActive: true,
  }).lean();
  const totalDoctors = doctors.length;

  // Calculate totals
  const totalVisits = weeklyStats.reduce((sum, w) => sum + w.visitCount, 0);
  const uniqueDoctors = new Set();
  weeklyStats.forEach((w) => w.doctors.forEach((d) => uniqueDoctors.add(d.toString())));

  // Calculate expected visits (sum of all doctor frequencies)
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
 * Batch check if user can visit multiple doctors
 * OPTIMIZED: Loads all doctors and visits once, then checks in parallel
 * @param {Array<string>} doctorIds - Array of doctor IDs
 * @param {Object} user - User object with _id and role
 * @param {Date} visitDate - Optional date, defaults to today
 * @returns {Promise<Array<{doctorId: string, canVisit: boolean, reason?: string, weeklyCount: number, monthlyCount: number, monthlyLimit: number, isWeekend?: boolean}>>}
 */
const canVisitDoctorsBatch = async (doctorIds, user, visitDate = new Date()) => {
  const manilaVisitDate = new Date(visitDate.getTime() + MANILA_OFFSET_MS);
  const jsDay = manilaVisitDate.getUTCDay();
  const isWeekendDate = jsDay === 0 || jsDay === 6;

  const userId = user._id || user;
  const monthYear = getEffectiveMonthYear(visitDate); // Use effective month (5th week → next month)
  const yearWeekKey = getYearWeekKey(visitDate);

  // OPTIMIZATION: Load all data in parallel (doctors, weekly visits, monthly counts, schedule entries)
  const Schedule = require('../models/Schedule');
  const currentCycle = Schedule.getCycleNumber(visitDate);
  const currentWeek = Schedule.getCurrentCycleWeek(visitDate);

  const [doctors, weeklyVisits, monthlyCounts, scheduleEntries] = await Promise.all([
    Doctor.find({ _id: { $in: doctorIds } }).lean(),
    Visit.find({
      doctor: { $in: doctorIds },
      user: userId,
      yearWeekKey,
      status: 'completed',
    }).select('doctor'),
    Visit.aggregate([
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
    ]),
    Schedule.find({
      doctor: { $in: doctorIds },
      user: userId,
      cycleNumber: currentCycle,
    }).lean(),
  ]);

  const doctorMap = new Map(doctors.map((d) => [d._id.toString(), d]));
  const visitedThisWeek = new Set(weeklyVisits.map((v) => v.doctor.toString()));
  const monthlyCountMap = new Map(monthlyCounts.map((c) => [c._id.toString(), c.count]));

  // Process each doctor
  const results = doctorIds.map((doctorId) => {
    const doctor = doctorMap.get(doctorId);

    if (!doctor) {
      return {
        doctorId,
        canVisit: false,
        reason: 'Doctor not found',
        weeklyCount: 0,
        monthlyCount: 0,
        monthlyLimit: 0,
        isWeekend: isWeekendDate,
      };
    }

    const monthlyLimit = doctor.visitFrequency || 4;
    const monthlyCount = monthlyCountMap.get(doctorId) || 0;

    // Check assignment access for BDMs
    if (user.role === ROLES.CONTRACTOR) {
      if (!canAccessDoctor(user, doctor)) {
        return {
          doctorId,
          canVisit: false,
          reason: 'This VIP Client is not assigned to you',
          weeklyCount: 0,
          monthlyCount,
          monthlyLimit,
          isWeekend: isWeekendDate,
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
        isWeekend: isWeekendDate,
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
        isWeekend: isWeekendDate,
      };
    }

    return {
      doctorId,
      canVisit: true,
      weeklyCount: 0,
      monthlyCount,
      monthlyLimit,
      isWeekend: isWeekendDate,
    };
  });

  // Schedule-aware batch validation (Task A.2 + C.1):
  // Overlay schedule constraints on results for doctors that have schedule entries.
  // Group schedule entries by doctor
  const scheduleByDoctor = new Map();
  scheduleEntries.forEach((e) => {
    const did = e.doctor.toString();
    if (!scheduleByDoctor.has(did)) scheduleByDoctor.set(did, []);
    scheduleByDoctor.get(did).push(e);
  });

  // Override canVisit for doctors based on schedule AND weekend logic
  return results.map((result) => {
    const entries = scheduleByDoctor.get(result.doctorId);
    const hasSchedule = entries && entries.length > 0;

    // If already blocked by weekly/monthly/region check, keep that result
    if (!result.canVisit) return result;

    if (hasSchedule) {
      const visitable = entries.filter((e) => {
        if (e.status === 'completed' || e.status === 'missed') return false;
        if (e.status === 'planned' && e.scheduledWeek <= currentWeek) return true;
        if (e.status === 'carried') return true;
        return false;
      });

      // Weekend conditional logic for VIP clients with schedules
      // On weekends, ANY visitable entry counts as "overdue" since weekdays have passed
      if (isWeekendDate) {
        if (visitable.length === 0) {
          return {
            ...result,
            canVisit: false,
            reason: 'Weekend visits are only allowed for VIP Clients with carried or overdue visits.',
            scheduleInfo: { hasSchedule: true },
          };
        }
      }

      if (visitable.length === 0) {
        const allCompleted = entries.every((e) => e.status === 'completed');
        return {
          ...result,
          canVisit: false,
          reason: allCompleted
            ? 'All scheduled visits completed this cycle.'
            : `Scheduled for ${entries.filter(e => e.status === 'planned').map(e => `W${e.scheduledWeek}`).join(', ')}. Not visitable in W${currentWeek}.`,
          scheduleInfo: { hasSchedule: true },
        };
      }

      return {
        ...result,
        scheduleInfo: { hasSchedule: true, visitableCount: visitable.length },
      };
    }

    // No schedule — VIP client without schedule
    // On weekends, block (no schedule = no carried/overdue to clear)
    if (isWeekendDate) {
      return {
        ...result,
        canVisit: false,
        reason: 'Weekend visits are only allowed for VIP Clients with carried or overdue visits.',
      };
    }

    return result;
  });
};

/**
 * Find the best schedule entry to link a visit to.
 * Priority: current week planned first → oldest carried entry.
 * Uses findOneAndUpdate for race-condition safety.
 *
 * @param {string} doctorId
 * @param {string} userId
 * @param {Date} visitDate
 * @returns {Promise<{entry: Object|null, isExtra: boolean}>}
 */
const getScheduleMatchForVisit = async (doctorId, userId, visitDate = new Date()) => {
  const Schedule = require('../models/Schedule');
  const currentCycle = Schedule.getCycleNumber(visitDate);
  const currentWeek = Schedule.getCurrentCycleWeek(visitDate);

  // Try current week planned entry first
  let entry = await Schedule.findOneAndUpdate(
    {
      doctor: doctorId,
      user: userId,
      cycleNumber: currentCycle,
      scheduledWeek: currentWeek,
      status: 'planned',
    },
    {
      status: 'completed',
      completedAt: new Date(),
      completedInWeek: currentWeek,
    },
    { new: true }
  );

  if (entry) {
    return { entry, isExtra: false };
  }

  // Try oldest carried entry
  const carriedEntries = await Schedule.find({
    doctor: doctorId,
    user: userId,
    cycleNumber: currentCycle,
    status: 'carried',
  }).sort({ scheduledWeek: 1 });

  if (carriedEntries.length > 0) {
    entry = await Schedule.findOneAndUpdate(
      {
        _id: carriedEntries[0]._id,
        status: 'carried', // Ensure still carried (race condition guard)
      },
      {
        status: 'completed',
        completedAt: new Date(),
        completedInWeek: currentWeek,
      },
      { new: true }
    );

    if (entry) {
      return { entry, isExtra: false };
    }
  }

  // Try any planned entry for past weeks (should have been carried but wasn't reconciled yet)
  entry = await Schedule.findOneAndUpdate(
    {
      doctor: doctorId,
      user: userId,
      cycleNumber: currentCycle,
      scheduledWeek: { $lt: currentWeek },
      status: 'planned',
    },
    {
      status: 'completed',
      completedAt: new Date(),
      completedInWeek: currentWeek,
    },
    { new: true, sort: { scheduledWeek: 1 } }
  );

  if (entry) {
    return { entry, isExtra: false };
  }

  // No matching schedule entry — this is an extra visit
  return { entry: null, isExtra: true };
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
  canAccessDoctor,
  hasVisitedThisWeek,
  getMonthlyVisitCount,
  canVisitDoctor,
  canVisitDoctorsBatch,
  getWeeklyComplianceStats,
  getComplianceReport,
  getScheduleMatchForVisit,
  CYCLE_ANCHOR,
};
