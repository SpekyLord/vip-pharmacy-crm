/**
 * Schedule Controller
 *
 * Handles 4-week cycle schedule management:
 * - Cycle grid retrieval with lazy reconciliation
 * - Today's visitable VIP Clients
 * - Auto-generation from assigned doctors
 * - Schedule looping (clone from previous cycle)
 * - Admin operations (create, clear, view any BDM)
 */

const Schedule = require('../models/Schedule');
const Doctor = require('../models/Doctor');
const Region = require('../models/Region');
const Visit = require('../models/Visit');
const { catchAsync, NotFoundError } = require('../middleware/errorHandler');
const { getCycleNumber, getCycleStartDate, getCycleEndDate, getWeekOfMonth, getDayOfWeek } = require('../utils/scheduleCycleUtils');

// ─── Reconciliation ────────────────────────────────────────────────────────────

/**
 * Reconcile schedule entries for a user+cycle.
 * Updates statuses: planned→carried (past week), carried→missed (past cycle end).
 * Marks entries completed if a matching visit exists.
 *
 * @param {string} userId
 * @param {number} cycleNumber
 * @param {Array|null} prefetchedEntries - Optional pre-fetched unresolved entries to avoid redundant query
 * @returns {Promise<boolean>} true if any entries were updated
 */
const reconcileEntries = async (userId, cycleNumber, prefetchedEntries = null) => {
  const now = new Date();
  const currentCycle = getCycleNumber(now);
  const currentWeek = getWeekOfMonth(now);
  const cycleEnd = getCycleEndDate(cycleNumber);
  const cycleStart = getCycleStartDate(cycleNumber);

  // Parallel fetch: unresolved entries + visits (if entries not pre-fetched)
  let entries;
  let visits;

  if (prefetchedEntries) {
    entries = prefetchedEntries;
    if (entries.length === 0) return false;
    // Still need visits
    visits = await Visit.find({
      user: userId,
      visitDate: { $gte: cycleStart, $lte: cycleEnd },
      status: 'completed',
    }).select('doctor visitDate');
  } else {
    // Parallel fetch both
    const [fetchedEntries, fetchedVisits] = await Promise.all([
      Schedule.find({
        user: userId,
        cycleNumber,
        status: { $in: ['planned', 'carried'] },
      }),
      Visit.find({
        user: userId,
        visitDate: { $gte: cycleStart, $lte: cycleEnd },
        status: 'completed',
      }).select('doctor visitDate'),
    ]);
    entries = fetchedEntries;
    visits = fetchedVisits;
  }

  if (entries.length === 0) return false;

  // Build visit lookup: doctorId → array of visit dates
  const visitsByDoctor = new Map();
  visits.forEach((v) => {
    const did = v.doctor.toString();
    if (!visitsByDoctor.has(did)) visitsByDoctor.set(did, []);
    visitsByDoctor.get(did).push(v);
  });

  const bulkOps = [];

  for (const entry of entries) {
    const did = entry.doctor.toString();
    const doctorVisits = visitsByDoctor.get(did) || [];

    // Check if any visit matches this entry's scheduled week
    const matchingVisit = doctorVisits.find((v) => {
      const visitWeek = getWeekOfMonth(v.visitDate);
      return visitWeek === entry.scheduledWeek;
    });

    if (matchingVisit) {
      // Mark completed
      bulkOps.push({
        updateOne: {
          filter: { _id: entry._id },
          update: {
            status: 'completed',
            completedAt: matchingVisit.visitDate,
            completedInWeek: getWeekOfMonth(matchingVisit.visitDate),
            visit: matchingVisit._id,
          },
        },
      });
      // Remove used visit from pool to avoid double-matching
      const idx = doctorVisits.indexOf(matchingVisit);
      doctorVisits.splice(idx, 1);
    } else if (cycleNumber < currentCycle || now > cycleEnd) {
      // Past cycle end → missed
      bulkOps.push({
        updateOne: {
          filter: { _id: entry._id },
          update: { status: 'missed' },
        },
      });
    } else if (entry.status === 'planned' && entry.scheduledWeek < currentWeek) {
      // Past scheduled week but still in cycle → carry forward
      bulkOps.push({
        updateOne: {
          filter: { _id: entry._id },
          update: {
            status: 'carried',
            carriedToWeek: currentWeek,
          },
        },
      });
    }
  }

  if (bulkOps.length > 0) {
    await Schedule.bulkWrite(bulkOps);
    return true;
  }
  return false;
};

// ─── Schedule Looping ──────────────────────────────────────────────────────────

/**
 * Clone schedule from the most recent cycle into a new cycle.
 * Returns the newly created entries.
 */
const loopScheduleFromPrevious = async (userId, targetCycleNumber) => {
  // Find most recent cycle with entries
  const latestEntry = await Schedule.findOne({
    user: userId,
    cycleNumber: { $lt: targetCycleNumber },
  }).sort({ cycleNumber: -1 });

  if (!latestEntry) return [];

  const sourceCycle = latestEntry.cycleNumber;
  const sourceEntries = await Schedule.find({
    user: userId,
    cycleNumber: sourceCycle,
  });

  if (sourceEntries.length === 0) return [];

  const targetCycleStart = getCycleStartDate(targetCycleNumber);
  const newEntries = sourceEntries.map((e) => ({
    doctor: e.doctor,
    user: e.user,
    cycleStart: targetCycleStart,
    cycleNumber: targetCycleNumber,
    scheduledWeek: e.scheduledWeek,
    scheduledDay: e.scheduledDay,
    scheduledLabel: e.scheduledLabel,
    status: 'planned',
  }));

  // Use insertMany with ordered:false to skip duplicates
  try {
    const created = await Schedule.insertMany(newEntries, { ordered: false });
    return created;
  } catch (err) {
    // Duplicate key errors are expected if some entries already exist
    if (err.code === 11000 || err.writeErrors) {
      return Schedule.find({ user: userId, cycleNumber: targetCycleNumber });
    }
    throw err;
  }
};

// ─── Endpoints ─────────────────────────────────────────────────────────────────

/**
 * @desc    Get full 4-week cycle grid for the current BDM
 * @route   GET /api/schedules/cycle
 * @access  Private (Employee, Admin)
 * @query   cycleNumber (optional, defaults to current)
 */
const getCycle = catchAsync(async (req, res) => {
  const userId = req.query.userId && req.user.role === 'admin'
    ? req.query.userId
    : req.user._id;

  const now = new Date();
  const requestedCycle = req.query.cycleNumber != null
    ? parseInt(req.query.cycleNumber)
    : getCycleNumber(now);

  // Fetch with populate upfront (combines existence check + final fetch)
  let entries = await Schedule.getCycleSchedule(userId, requestedCycle);

  // If no entries, try looping from previous cycle
  if (entries.length === 0) {
    const looped = await loopScheduleFromPrevious(userId, requestedCycle);
    if (looped.length > 0) {
      entries = await Schedule.getCycleSchedule(userId, requestedCycle);
    }
  }

  // Reconcile only unresolved entries, skip re-fetch if nothing changed
  if (entries.length > 0) {
    const unresolvedEntries = entries.filter((e) => e.status === 'planned' || e.status === 'carried');
    if (unresolvedEntries.length > 0) {
      const changed = await reconcileEntries(userId, requestedCycle, unresolvedEntries);
      if (changed) {
        entries = await Schedule.getCycleSchedule(userId, requestedCycle);
      }
    }
  }

  const cycleStart = getCycleStartDate(requestedCycle);
  const currentCycle = getCycleNumber(now);
  const currentWeek = currentCycle === requestedCycle ? getWeekOfMonth(now) : null;
  const currentDay = currentCycle === requestedCycle ? getDayOfWeek(now) : null;

  // Summary stats
  const completed = entries.filter((e) => e.status === 'completed').length;
  const carried = entries.filter((e) => e.status === 'carried').length;
  const missed = entries.filter((e) => e.status === 'missed').length;
  const planned = entries.filter((e) => e.status === 'planned').length;

  res.json({
    success: true,
    data: {
      cycleNumber: requestedCycle,
      cycleStart,
      currentWeek,
      currentDay,
      entries,
      summary: { completed, carried, missed, planned, total: entries.length },
    },
  });
});

/**
 * @desc    Get today's visitable VIP Clients
 * @route   GET /api/schedules/today
 * @access  Private (Employee, Admin)
 */
const getToday = catchAsync(async (req, res) => {
  const userId = req.user._id;
  const now = new Date();
  const currentCycle = getCycleNumber(now);

  // Reconcile (parallel fetch inside), then get visitable entries
  // Only re-reconcile if there were changes; getVisitableEntries always fetches fresh
  await reconcileEntries(userId, currentCycle);

  const entries = await Schedule.getVisitableEntries(userId, now);

  res.json({
    success: true,
    data: entries,
    count: entries.length,
  });
});

/**
 * @desc    Auto-generate schedule for a BDM from assigned doctors
 * @route   POST /api/schedules/generate
 * @access  Private (Admin)
 * @body    { userId, cycleNumber? }
 */
const generateSchedule = catchAsync(async (req, res) => {
  const { userId, cycleNumber } = req.body;

  if (!userId) {
    return res.status(400).json({ success: false, message: 'userId is required' });
  }

  const User = require('../models/User');
  const user = await User.findById(userId);
  if (!user || user.role !== 'employee') {
    return res.status(400).json({ success: false, message: 'Valid BDM user required' });
  }

  const targetCycle = cycleNumber != null ? cycleNumber : getCycleNumber(new Date());
  const cycleStart = getCycleStartDate(targetCycle);

  // Get all region IDs the BDM has access to
  const allRegionIds = [];
  for (const region of user.assignedRegions || []) {
    const descendants = await Region.getDescendantIds(region);
    allRegionIds.push(...descendants);
  }

  // Get all active doctors in those regions
  const doctors = await Doctor.find({
    region: { $in: allRegionIds },
    isActive: true,
  }).select('_id visitFrequency');

  if (doctors.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'No active VIP Clients found in assigned regions',
    });
  }

  // Clear existing planned entries for this cycle (don't touch completed/missed)
  await Schedule.deleteMany({
    user: userId,
    cycleNumber: targetCycle,
    status: { $in: ['planned', 'carried'] },
  });

  const entries = [];
  let dayCounter = 1; // Round-robin day assignment (1-5)
  let alternateToggle = false; // Alternate W1+W3 vs W2+W4 across 2x doctors

  for (const doctor of doctors) {
    const freq = doctor.visitFrequency || 4;

    if (freq === 4) {
      // 4x: one entry per week, round-robin days
      for (let week = 1; week <= 4; week++) {
        entries.push({
          doctor: doctor._id,
          user: userId,
          cycleStart,
          cycleNumber: targetCycle,
          scheduledWeek: week,
          scheduledDay: dayCounter,
          scheduledLabel: `W${week}D${dayCounter}`,
          status: 'planned',
        });
      }
      dayCounter = (dayCounter % 5) + 1;
    } else if (freq === 2) {
      // 2x: alternating weeks — W1+W3 or W2+W4
      const weeks = alternateToggle ? [2, 4] : [1, 3];
      alternateToggle = !alternateToggle;

      for (const week of weeks) {
        entries.push({
          doctor: doctor._id,
          user: userId,
          cycleStart,
          cycleNumber: targetCycle,
          scheduledWeek: week,
          scheduledDay: dayCounter,
          scheduledLabel: `W${week}D${dayCounter}`,
          status: 'planned',
        });
      }
      dayCounter = (dayCounter % 5) + 1;
    }
  }

  const created = await Schedule.insertMany(entries);

  res.status(201).json({
    success: true,
    message: `Generated ${created.length} schedule entries for ${doctors.length} VIP Clients`,
    data: {
      cycleNumber: targetCycle,
      entriesCreated: created.length,
      doctors4x: doctors.filter((d) => (d.visitFrequency || 4) === 4).length,
      doctors2x: doctors.filter((d) => d.visitFrequency === 2).length,
    },
  });
});

/**
 * @desc    Manually trigger reconciliation
 * @route   POST /api/schedules/reconcile
 * @access  Private (Admin)
 * @body    { userId, cycleNumber? }
 */
const reconcile = catchAsync(async (req, res) => {
  const { userId, cycleNumber } = req.body;

  if (!userId) {
    return res.status(400).json({ success: false, message: 'userId is required' });
  }

  const targetCycle = cycleNumber != null ? cycleNumber : getCycleNumber(new Date());

  await reconcileEntries(userId, targetCycle);

  const entries = await Schedule.getCycleSchedule(userId, targetCycle);

  res.json({
    success: true,
    message: 'Reconciliation complete',
    data: entries,
  });
});

/**
 * @desc    Get any BDM's cycle schedule (Admin)
 * @route   GET /api/schedules/admin/cycle
 * @access  Private (Admin)
 * @query   userId (required), cycleNumber (optional)
 */
const adminGetCycle = catchAsync(async (req, res) => {
  const { userId, cycleNumber } = req.query;

  if (!userId) {
    return res.status(400).json({ success: false, message: 'userId query parameter is required' });
  }

  const targetCycle = cycleNumber != null
    ? parseInt(cycleNumber)
    : getCycleNumber(new Date());

  // Fetch with populate first, reconcile only unresolved, skip re-fetch if no changes
  let entries = await Schedule.getCycleSchedule(userId, targetCycle);

  if (entries.length > 0) {
    const unresolvedEntries = entries.filter((e) => e.status === 'planned' || e.status === 'carried');
    if (unresolvedEntries.length > 0) {
      const changed = await reconcileEntries(userId, targetCycle, unresolvedEntries);
      if (changed) {
        entries = await Schedule.getCycleSchedule(userId, targetCycle);
      }
    }
  }

  const cycleStart = getCycleStartDate(targetCycle);
  const now = new Date();
  const currentCycle = getCycleNumber(now);
  const currentWeek = currentCycle === targetCycle ? getWeekOfMonth(now) : null;
  const currentDay = currentCycle === targetCycle ? getDayOfWeek(now) : null;

  const completed = entries.filter((e) => e.status === 'completed').length;
  const carried = entries.filter((e) => e.status === 'carried').length;
  const missed = entries.filter((e) => e.status === 'missed').length;
  const planned = entries.filter((e) => e.status === 'planned').length;

  res.json({
    success: true,
    data: {
      cycleNumber: targetCycle,
      cycleStart,
      currentWeek,
      currentDay,
      entries,
      summary: { completed, carried, missed, planned, total: entries.length },
    },
  });
});

/**
 * @desc    Manually create schedule entries (Admin)
 * @route   POST /api/schedules/admin/create
 * @access  Private (Admin)
 * @body    { entries: [{ doctor, user, scheduledWeek, scheduledDay }], cycleNumber? }
 */
const adminCreate = catchAsync(async (req, res) => {
  const { entries: rawEntries, cycleNumber } = req.body;

  if (!rawEntries || !Array.isArray(rawEntries) || rawEntries.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'entries array is required',
    });
  }

  const targetCycle = cycleNumber != null ? cycleNumber : getCycleNumber(new Date());
  const cycleStart = getCycleStartDate(targetCycle);

  const entries = rawEntries.map((e) => ({
    doctor: e.doctor,
    user: e.user,
    cycleStart,
    cycleNumber: targetCycle,
    scheduledWeek: e.scheduledWeek,
    scheduledDay: e.scheduledDay,
    scheduledLabel: `W${e.scheduledWeek}D${e.scheduledDay}`,
    status: 'planned',
  }));

  try {
    const created = await Schedule.insertMany(entries, { ordered: false });
    res.status(201).json({
      success: true,
      message: `Created ${created.length} schedule entries`,
      data: created,
    });
  } catch (err) {
    if (err.code === 11000 || err.writeErrors) {
      const insertedCount = err.insertedDocs?.length || 0;
      const duplicateCount = err.writeErrors?.length || 0;
      return res.status(207).json({
        success: true,
        message: `Created ${insertedCount} entries, ${duplicateCount} duplicates skipped`,
        data: { insertedCount, duplicateCount },
      });
    }
    throw err;
  }
});

/**
 * @desc    Clear planned/carried entries for a BDM's cycle (Admin)
 * @route   DELETE /api/schedules/admin/cycle
 * @access  Private (Admin)
 * @query   userId (required), cycleNumber (optional)
 */
const adminClearCycle = catchAsync(async (req, res) => {
  const { userId, cycleNumber } = req.query;

  if (!userId) {
    return res.status(400).json({ success: false, message: 'userId query parameter is required' });
  }

  const targetCycle = cycleNumber != null
    ? parseInt(cycleNumber)
    : getCycleNumber(new Date());

  const result = await Schedule.deleteMany({
    user: userId,
    cycleNumber: targetCycle,
    status: { $in: ['planned', 'carried'] },
  });

  res.json({
    success: true,
    message: `Cleared ${result.deletedCount} entries (completed/missed entries preserved)`,
    data: { deletedCount: result.deletedCount },
  });
});

module.exports = {
  getCycle,
  getToday,
  generateSchedule,
  reconcile,
  adminGetCycle,
  adminCreate,
  adminClearCycle,
};
