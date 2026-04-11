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
const Visit = require('../models/Visit');
const ClientVisit = require('../models/ClientVisit');
const { catchAsync, NotFoundError } = require('../middleware/errorHandler');
const { getCycleNumber, getDisplayCycleNumber, getCycleStartDate, getCycleEndDate, getWeekOfMonth, getDayOfWeek, isWorkDay } = require('../utils/scheduleCycleUtils');
const { ROLES, isAdminLike: isCrmAdminLike } = require('../constants/roles');

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
const reconcileEntries = async (userId, cycleNumber, prefetchedEntries = null, prefetchedVisits = null) => {
  const now = new Date();
  const currentCycle = getCycleNumber(now);
  const currentWeek = getWeekOfMonth(now);
  const cycleEnd = getCycleEndDate(cycleNumber);
  const cycleStart = getCycleStartDate(cycleNumber);

  // Resolve entries + visits from pre-fetched data or DB
  let entries;
  let visits;

  if (prefetchedEntries && prefetchedVisits) {
    entries = prefetchedEntries;
    visits = prefetchedVisits;
    if (entries.length === 0) return { changed: false };
  } else if (prefetchedEntries) {
    entries = prefetchedEntries;
    if (entries.length === 0) return { changed: false };
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

  if (entries.length === 0) return { changed: false };

  // Build visit lookup: doctorId → array of visit dates
  const visitsByDoctor = new Map();
  visits.forEach((v) => {
    const did = v.doctor.toString();
    if (!visitsByDoctor.has(did)) visitsByDoctor.set(did, []);
    visitsByDoctor.get(did).push(v);
  });

  const bulkOps = [];

  for (const entry of entries) {
    const did = (entry.doctor._id || entry.doctor).toString();
    const doctorVisits = visitsByDoctor.get(did) || [];

    // Check if any visit matches this entry's scheduled week
    const matchingVisit = doctorVisits.find((v) => {
      const visitWeek = getWeekOfMonth(v.visitDate);
      return visitWeek === entry.scheduledWeek;
    });

    if (matchingVisit) {
      const update = {
        status: 'completed',
        completedAt: matchingVisit.visitDate,
        completedInWeek: getWeekOfMonth(matchingVisit.visitDate),
        visit: matchingVisit._id,
      };
      bulkOps.push({
        updateOne: {
          filter: { _id: entry._id },
          update,
        },
      });
      // Apply in-memory so caller doesn't need to re-fetch
      Object.assign(entry, update);
      // Remove used visit from pool to avoid double-matching
      const idx = doctorVisits.indexOf(matchingVisit);
      doctorVisits.splice(idx, 1);
    } else if (cycleNumber < currentCycle || now > cycleEnd) {
      const update = { status: 'missed' };
      bulkOps.push({
        updateOne: {
          filter: { _id: entry._id },
          update,
        },
      });
      Object.assign(entry, update);
    } else if (entry.status === 'planned' && entry.scheduledWeek < currentWeek) {
      const update = {
        status: 'carried',
        carriedToWeek: currentWeek,
      };
      bulkOps.push({
        updateOne: {
          filter: { _id: entry._id },
          update,
        },
      });
      Object.assign(entry, update);
    }
  }

  if (bulkOps.length > 0) {
    await Schedule.bulkWrite(bulkOps);
    return { changed: true };
  }
  return { changed: false };
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
  const userId = req.query.userId && isCrmAdminLike(req.user.role)
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
      const { changed } = await reconcileEntries(userId, requestedCycle, unresolvedEntries);
      if (changed) {
        entries = await Schedule.getCycleSchedule(userId, requestedCycle);
      }
    }
  }

  const cycleStart = getCycleStartDate(requestedCycle);
  const currentCycle = getCycleNumber(now);
  const isCurrentCycle = currentCycle === requestedCycle;
  const currentWeek = isCurrentCycle && isWorkDay(now) ? getWeekOfMonth(now) : null;
  const currentDay = isCurrentCycle && isWorkDay(now) ? getDayOfWeek(now) : null;

  // Summary stats
  const completed = entries.filter((e) => e.status === 'completed').length;
  const carried = entries.filter((e) => e.status === 'carried').length;
  const missed = entries.filter((e) => e.status === 'missed').length;
  const planned = entries.filter((e) => e.status === 'planned').length;

  res.json({
    success: true,
    data: {
      cycleNumber: requestedCycle,
      displayCycleNumber: getDisplayCycleNumber(getCycleStartDate(requestedCycle)),
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
  if (!user || user.role !== ROLES.CONTRACTOR) {
    return res.status(400).json({ success: false, message: 'Valid BDM user required' });
  }

  const targetCycle = cycleNumber != null ? cycleNumber : getCycleNumber(new Date());
  const cycleStart = getCycleStartDate(targetCycle);

  // Get all active doctors assigned to this BDM
  const doctors = await Doctor.find({
    assignedTo: userId,
    isActive: true,
  }).select('_id visitFrequency');

  if (doctors.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'No active VIP Clients assigned to this BDM',
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
      const { changed } = await reconcileEntries(userId, targetCycle, unresolvedEntries);
      if (changed) {
        entries = await Schedule.getCycleSchedule(userId, targetCycle);
      }
    }
  }

  const cycleStart = getCycleStartDate(targetCycle);
  const now = new Date();
  const currentCycle = getCycleNumber(now);
  const isCurrentCycle = currentCycle === targetCycle;
  const currentWeek = isCurrentCycle && isWorkDay(now) ? getWeekOfMonth(now) : null;
  const currentDay = isCurrentCycle && isWorkDay(now) ? getDayOfWeek(now) : null;

  const completed = entries.filter((e) => e.status === 'completed').length;
  const carried = entries.filter((e) => e.status === 'carried').length;
  const missed = entries.filter((e) => e.status === 'missed').length;
  const planned = entries.filter((e) => e.status === 'planned').length;

  res.json({
    success: true,
    data: {
      cycleNumber: targetCycle,
      displayCycleNumber: getDisplayCycleNumber(getCycleStartDate(targetCycle)),
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

// ─── CPT Grid ────────────────────────────────────────────────────────────────

/**
 * @desc    Get CPT grid data (doctor-row × day-column) with DCR summary
 * @route   GET /api/schedules/cpt-grid
 * @access  Private (Employee, Admin)
 * @query   cycleNumber (optional), userId (optional, admin only)
 */
const getCPTGrid = catchAsync(async (req, res) => {
  const userId = req.query.userId && isCrmAdminLike(req.user.role)
    ? req.query.userId
    : req.user._id;

  const now = new Date();
  const requestedCycle = req.query.cycleNumber != null
    ? parseInt(req.query.cycleNumber)
    : getCycleNumber(now);

  const cycleStart = getCycleStartDate(requestedCycle);
  const cycleEnd = getCycleEndDate(requestedCycle);
  const currentCycle = getCycleNumber(now);
  const isCurrentCycle = currentCycle === requestedCycle;
  const currentWeek = isCurrentCycle && isWorkDay(now) ? getWeekOfMonth(now) : null;
  const currentDay = isCurrentCycle && isWorkDay(now) ? getDayOfWeek(now) : null;

  // Fetch schedule entries (try loop if empty)
  let entries = await Schedule.find({ user: userId, cycleNumber: requestedCycle })
    .populate('doctor', 'firstName lastName specialization visitFrequency')
    .lean();

  if (entries.length === 0) {
    const looped = await loopScheduleFromPrevious(userId, requestedCycle);
    if (looped.length > 0) {
      entries = await Schedule.find({ user: userId, cycleNumber: requestedCycle })
        .populate('doctor', 'firstName lastName specialization visitFrequency')
        .lean();
    }
  }

  // Fetch VIP visits + ClientVisits in parallel (both independent of reconciliation)
  const [vipVisits, clientVisits] = await Promise.all([
    Visit.find({
      user: userId,
      visitDate: { $gte: cycleStart, $lte: cycleEnd },
      status: 'completed',
    }).select('doctor visitDate weekOfMonth dayOfWeek engagementTypes').lean(),

    ClientVisit.find({
      user: userId,
      visitDate: { $gte: cycleStart, $lte: cycleEnd },
      status: 'completed',
    }).select('client visitDate weekOfMonth dayOfWeek engagementTypes')
      .populate('client', 'firstName lastName specialization')
      .lean(),
  ]);

  // Reconcile with pre-fetched visits (no duplicate Visit query, no re-fetch of entries)
  if (entries.length > 0) {
    const unresolved = entries.filter((e) => e.status === 'planned' || e.status === 'carried');
    if (unresolved.length > 0) {
      await reconcileEntries(userId, requestedCycle, unresolved, vipVisits);
      // entries are mutated in-place by reconcileEntries, no re-fetch needed
    }
  }

  // Build visit lookup: doctorId+week → visit
  const visitLookup = new Map();
  vipVisits.forEach((v) => {
    const key = `${v.doctor.toString()}_W${v.weekOfMonth}`;
    visitLookup.set(key, v);
  });

  // Build doctor rows
  const doctorMap = new Map();
  entries.forEach((entry) => {
    if (!entry.doctor) return;
    const did = entry.doctor._id.toString();
    if (!doctorMap.has(did)) {
      doctorMap.set(did, {
        _id: entry.doctor._id,
        firstName: entry.doctor.firstName,
        lastName: entry.doctor.lastName,
        specialization: entry.doctor.specialization,
        visitFrequency: entry.doctor.visitFrequency || 4,
        grid: Array(20).fill(null).map(() => ({ status: null, scheduleId: null, visitId: null, engagementTypes: [] })),
        totalScheduled: 0,
        totalCompleted: 0,
      });
    }

    const doc = doctorMap.get(did);
    const idx = (entry.scheduledWeek - 1) * 5 + (entry.scheduledDay - 1);
    if (idx >= 0 && idx < 20) {
      const visitKey = `${did}_W${entry.scheduledWeek}`;
      const matchingVisit = visitLookup.get(visitKey);

      doc.grid[idx] = {
        status: entry.status,
        scheduleId: entry._id,
        visitId: entry.visit || null,
        engagementTypes: matchingVisit?.engagementTypes || [],
      };
      doc.totalScheduled++;
      if (entry.status === 'completed') {
        doc.totalCompleted++;
      }
    }
  });

  // Sort doctors by lastName
  const doctors = Array.from(doctorMap.values()).sort((a, b) =>
    (a.lastName || '').localeCompare(b.lastName || '')
  );

  // Build DCR Summary (20 days)
  const DAY_LABELS = [];
  for (let w = 1; w <= 4; w++) {
    for (let d = 1; d <= 5; d++) {
      DAY_LABELS.push(`W${w}D${d}`);
    }
  }

  const dcrSummary = DAY_LABELS.map((label, dayIdx) => {
    // Count VIP visits on this grid day
    let targetEngagements = 0;
    let totalEngagements = 0;
    const engagementBreakdown = {
      TXT_PROMATS: 0,
      MES_VIBER_GIF: 0,
      PICTURE: 0,
      SIGNED_CALL: 0,
      VOICE_CALL: 0,
    };

    doctors.forEach((doc) => {
      const cell = doc.grid[dayIdx];
      if (cell.status) {
        targetEngagements++;
      }
      if (cell.status === 'completed') {
        totalEngagements++;
        cell.engagementTypes.forEach((et) => {
          if (engagementBreakdown[et] !== undefined) {
            engagementBreakdown[et]++;
          }
        });
      }
    });

    const callRate = targetEngagements > 0
      ? Math.round((totalEngagements / targetEngagements) * 100)
      : 0;

    return {
      day: dayIdx + 1,
      label,
      targetEngagements,
      totalEngagements,
      callRate,
      engagementBreakdown,
    };
  });

  // DCR Total
  const dcrTotal = {
    targetEngagements: dcrSummary.reduce((sum, d) => sum + d.targetEngagements, 0),
    totalEngagements: dcrSummary.reduce((sum, d) => sum + d.totalEngagements, 0),
  };
  dcrTotal.callRate = dcrTotal.targetEngagements > 0
    ? Math.round((dcrTotal.totalEngagements / dcrTotal.targetEngagements) * 100)
    : 0;

  // Daily MD count (VIP vs Extra Call)
  const dailyMDCount = DAY_LABELS.map((label, dayIdx) => {
    const week = Math.floor(dayIdx / 5) + 1;
    const day = (dayIdx % 5) + 1;

    // VIP count: completed schedule entries on this day
    let vipCount = 0;
    doctors.forEach((doc) => {
      if (doc.grid[dayIdx].status === 'completed') {
        vipCount++;
      }
    });

    // Extra call count: ClientVisits on this day
    const extraCallCount = clientVisits.filter(
      (cv) => cv.weekOfMonth === week && cv.dayOfWeek === day
    ).length;

    return {
      day: dayIdx + 1,
      label,
      vipCount,
      extraCallCount,
      totalMD: vipCount + extraCallCount,
    };
  });

  // Extra calls grouped by day
  const extraCalls = DAY_LABELS.map((label, dayIdx) => {
    const week = Math.floor(dayIdx / 5) + 1;
    const day = (dayIdx % 5) + 1;

    const dayClientVisits = clientVisits.filter(
      (cv) => cv.weekOfMonth === week && cv.dayOfWeek === day
    );

    return {
      day: dayIdx + 1,
      label,
      clients: dayClientVisits.map((cv) => ({
        _id: cv.client?._id || cv.client,
        firstName: cv.client?.firstName || '',
        lastName: cv.client?.lastName || '',
        engagementTypes: cv.engagementTypes || [],
      })),
    };
  });

  // Summary stats
  const completed = entries.filter((e) => e.status === 'completed').length;
  const carried = entries.filter((e) => e.status === 'carried').length;
  const missed = entries.filter((e) => e.status === 'missed').length;
  const planned = entries.filter((e) => e.status === 'planned').length;

  res.json({
    success: true,
    data: {
      cycleNumber: requestedCycle,
      displayCycleNumber: getDisplayCycleNumber(getCycleStartDate(requestedCycle)),
      cycleStart,
      currentWeek,
      currentDay,
      doctors,
      dcrSummary,
      dcrTotal,
      dailyMDCount,
      extraCalls,
      summary: { completed, carried, missed, planned, total: entries.length },
    },
  });
});

// ─── Batch CPT Grid Summary (Admin) ──────────────────────────────────────────

/**
 * @desc    Get lightweight CPT grid summary for ALL active BDMs in one request
 * @route   GET /api/schedules/cpt-grid-summary
 * @access  Private (Admin)
 * @query   cycleNumber (optional, defaults to current)
 * @returns { success, data: [{ userId, name, dcrTotal, summary }] }
 */
const getCPTGridSummary = catchAsync(async (req, res) => {
  const User = require('../models/User');

  const now = new Date();
  const requestedCycle = req.query.cycleNumber != null
    ? parseInt(req.query.cycleNumber)
    : getCycleNumber(now);

  const cycleStart = getCycleStartDate(requestedCycle);
  const cycleEnd = getCycleEndDate(requestedCycle);

  // Fetch all active BDMs
  const employees = await User.find({ role: ROLES.CONTRACTOR, isActive: true })
    .select('_id name firstName lastName')
    .lean();

  // Process all BDMs in parallel
  const results = await Promise.all(
    employees.map(async (emp) => {
      // Fetch schedule entries
      let entries = await Schedule.find({ user: emp._id, cycleNumber: requestedCycle })
        .select('status scheduledWeek scheduledDay doctor visit')
        .lean();

      if (entries.length === 0) {
        const looped = await loopScheduleFromPrevious(emp._id, requestedCycle);
        if (looped.length > 0) {
          entries = await Schedule.find({ user: emp._id, cycleNumber: requestedCycle })
            .select('status scheduledWeek scheduledDay doctor visit')
            .lean();
        }
      }

      // Fetch visits for reconciliation
      const vipVisits = await Visit.find({
        user: emp._id,
        visitDate: { $gte: cycleStart, $lte: cycleEnd },
        status: 'completed',
      }).select('doctor visitDate weekOfMonth dayOfWeek engagementTypes').lean();

      // Reconcile
      if (entries.length > 0) {
        const unresolved = entries.filter((e) => e.status === 'planned' || e.status === 'carried');
        if (unresolved.length > 0) {
          await reconcileEntries(emp._id, requestedCycle, unresolved, vipVisits);
        }
      }

      // Compute summary stats
      const completed = entries.filter((e) => e.status === 'completed').length;
      const carried = entries.filter((e) => e.status === 'carried').length;
      const missed = entries.filter((e) => e.status === 'missed').length;
      const planned = entries.filter((e) => e.status === 'planned').length;

      // Compute dcrTotal: targetEngagements = all entries with a status, totalEngagements = completed
      const targetEngagements = entries.length;
      const totalEngagements = completed;
      const callRate = targetEngagements > 0
        ? Math.round((totalEngagements / targetEngagements) * 100)
        : 0;

      return {
        userId: emp._id,
        name: emp.name || `${emp.firstName || ''} ${emp.lastName || ''}`.trim(),
        firstName: emp.firstName,
        dcrTotal: { targetEngagements, totalEngagements, callRate },
        summary: { completed, carried, missed, planned, total: entries.length },
      };
    })
  );

  res.json({
    success: true,
    data: results,
  });
});

/**
 * @desc    Get cross-BDM daily visit heatmap for a cycle
 * @route   GET /api/schedules/cross-bdm-heatmap
 * @access  Private (Admin only)
 */
const getCrossBdmHeatmap = catchAsync(async (req, res) => {
  const User = require('../models/User');

  const now = new Date();
  const requestedCycle = req.query.cycleNumber != null
    ? parseInt(req.query.cycleNumber)
    : getCycleNumber(now);

  const cycleStart = getCycleStartDate(requestedCycle);
  const cycleEnd = getCycleEndDate(requestedCycle);

  // 20 working days: W1D1 through W4D5
  const days = [];
  for (let w = 1; w <= 4; w++) {
    for (let d = 1; d <= 5; d++) {
      days.push(`W${w}D${d}`);
    }
  }

  // Fetch all active BDMs
  const employees = await User.find({ role: ROLES.CONTRACTOR, isActive: true })
    .select('_id name firstName lastName')
    .lean();

  // Fetch all completed visits in this cycle (single query)
  const visits = await Visit.find({
    status: 'completed',
    visitDate: { $gte: cycleStart, $lte: cycleEnd },
  }).select('user weekOfMonth dayOfWeek').lean();

  // Fetch schedule entries for targets (single query)
  const scheduleEntries = await Schedule.find({ cycleNumber: requestedCycle })
    .select('user scheduledWeek scheduledDay')
    .lean();

  // Build visit count map: { bdmId → { "W1D1": count, ... } }
  const visitMap = new Map();
  visits.forEach((v) => {
    const uid = v.user.toString();
    if (!visitMap.has(uid)) visitMap.set(uid, {});
    const day = v.weekOfMonth >= 1 && v.weekOfMonth <= 4 && v.dayOfWeek >= 1 && v.dayOfWeek <= 5
      ? `W${v.weekOfMonth}D${v.dayOfWeek}`
      : null;
    if (day) {
      visitMap.get(uid)[day] = (visitMap.get(uid)[day] || 0) + 1;
    }
  });

  // Build target map: { bdmId → { "W1D1": count, ... } }
  const targetMap = new Map();
  scheduleEntries.forEach((s) => {
    const uid = s.user.toString();
    if (!targetMap.has(uid)) targetMap.set(uid, {});
    const day = `W${s.scheduledWeek}D${s.scheduledDay}`;
    targetMap.get(uid)[day] = (targetMap.get(uid)[day] || 0) + 1;
  });

  // Build per-BDM rows
  const bdms = employees.map((emp) => {
    const uid = emp._id.toString();
    const daily = visitMap.get(uid) || {};
    const dailyTarget = targetMap.get(uid) || {};
    const total = Object.values(daily).reduce((sum, c) => sum + c, 0);

    return {
      userId: emp._id,
      name: emp.name || `${emp.firstName || ''} ${emp.lastName || ''}`.trim(),
      daily,
      dailyTarget,
      total,
    };
  }).sort((a, b) => a.name.localeCompare(b.name));

  // Compute team averages per day
  const teamAvg = {};
  const bdmCount = bdms.length || 1;
  days.forEach((day) => {
    const sum = bdms.reduce((acc, b) => acc + (b.daily[day] || 0), 0);
    teamAvg[day] = Math.round((sum / bdmCount) * 10) / 10;
  });

  res.json({
    success: true,
    data: {
      days,
      bdms,
      teamAvg,
      cycleNumber: requestedCycle,
    },
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
  getCPTGrid,
  getCPTGridSummary,
  getCrossBdmHeatmap,
};
