/**
 * DriveAllocation Controller — Phase P1.2 Slice 4 (May 06 2026, C1/C2 corrected).
 *
 * BDM-owned daily allocation of personal vs official km. Four endpoints:
 *
 *   GET  /erp/drive-allocations/unallocated-workdays
 *        Returns the list of prior workdays the caller hasn't allocated yet.
 *        Includes the CURRENT C1/C2 reporting cycle (full window through
 *        Manila yesterday) AND the PRIOR cycle's still-unallocated workdays
 *        provided we're inside the configurable grace window. Drives the
 *        AllocationPanel UI on Capture Hub. Carries `today_start_km` so the
 *        panel can offer the "missing-EndODO auto-fill" suggestion.
 *
 *   POST /erp/drive-allocations/allocate
 *        Idempotent upsert (status=ALLOCATED). Server-side pre-save snaps
 *        personal_km to nearest 5 and re-derives total_km / official_km.
 *        Gated by ALLOCATE_PERSONAL_OFFICIAL.
 *
 *   POST /erp/drive-allocations/no-drive
 *        Idempotent upsert (status=NO_DRIVE). Zeroes km fields regardless
 *        of body. Closes the gate cleanly for vacation/sick days. Gated by
 *        MARK_NO_DRIVE_DAY.
 *
 *   GET  /erp/drive-allocations/my
 *        BDM's own allocation history (paged). Privileged callers can pass
 *        ?bdmId to view a specific BDM's history.
 *
 * Cycle model: C1 (day 1-15) / C2 (day 16-end of month) — same convention as
 * CarLogbookEntry / SmerEntry / IncomeReport / Payslip / DeductionSchedule.
 * The 28-day BDM-visit cycle (CRM `scheduleCycleUtils`) is the wrong model
 * for ERP reporting and was used in the initial slice by mistake; corrected
 * before any production rows shipped.
 *
 * Backfill window: current cycle + immediately-prior cycle, gated by the
 * lookup-driven `DRIVE_ALLOCATION_PRIOR_CYCLE_GRACE_WORKDAYS` setting (default
 * 5 workdays). Beyond grace, prior-cycle backfill requires admin via
 * `OVERRIDE_ALLOCATION` (Slice 9 — deferred).
 *
 * Rule #19: entity_id stamped at create; cross-entity blocked.
 * Rule #21: bdm_id explicit. Privileged callers (admin/finance/president)
 *           can pass ?bdmId for cross-BDM views; non-privileged callers
 *           always self-scope.
 * Rule #3:  role gates AND grace window lookup-driven (CAPTURE_LIFECYCLE_ROLES,
 *           DRIVE_ALLOCATION_CONFIG).
 */

const DriveAllocation = require('../models/DriveAllocation');
const CaptureSubmission = require('../models/CaptureSubmission');
const CarLogbookEntry = require('../models/CarLogbookEntry');
const Lookup = require('../models/Lookup');
const { catchAsync } = require('../../middleware/errorHandler');
const { userCanPerformCaptureAction } = require('../../utils/captureLifecycleAccess');

// ── Manila offset (UTC+8) — matches scheduleCycleUtils convention ─────
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;

// ── Helpers ────────────────────────────────────────────────────────

/** Manila-local 'YYYY-MM-DD' for a given Date (or now). */
function manilaDateString(date = new Date()) {
  const manila = new Date(date.getTime() + MANILA_OFFSET_MS);
  const yyyy = manila.getUTCFullYear();
  const mm = String(manila.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(manila.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/** Manila-local 'YYYY-MM' (period). */
function manilaPeriod(date = new Date()) {
  return manilaDateString(date).slice(0, 7);
}

/** Day-of-month (1-31) in Manila. */
function manilaDayOfMonth(date = new Date()) {
  return Number(manilaDateString(date).slice(8, 10));
}

/** C1/C2 derivation from drive_date string OR Date. */
function cycleFor(driveDateOrDateObj) {
  let day;
  if (typeof driveDateOrDateObj === 'string') {
    day = Number(driveDateOrDateObj.slice(8, 10));
  } else {
    day = manilaDayOfMonth(driveDateOrDateObj);
  }
  return day <= 15 ? 'C1' : 'C2';
}

/** Period 'YYYY-MM' from drive_date string OR Date. */
function periodFor(driveDateOrDateObj) {
  if (typeof driveDateOrDateObj === 'string') return driveDateOrDateObj.slice(0, 7);
  return manilaPeriod(driveDateOrDateObj);
}

/** Parse a 'YYYY-MM-DD' string to a Manila-midnight Date (UTC representation). */
function parseManilaDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) - MANILA_OFFSET_MS);
}

/** Day-of-week label for a Manila-local date string. */
function manilaDayLabel(s) {
  const d = parseManilaDate(s);
  if (!d) return '';
  const manila = new Date(d.getTime() + MANILA_OFFSET_MS);
  const labels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return labels[manila.getUTCDay()];
}

/** Mon-Fri Manila workday check from a 'YYYY-MM-DD' string. */
function isWorkdayString(s) {
  const d = parseManilaDate(s);
  if (!d) return false;
  const manila = new Date(d.getTime() + MANILA_OFFSET_MS);
  const dow = manila.getUTCDay(); // 0 = Sun
  return dow >= 1 && dow <= 5;
}

/**
 * Enumerate Manila workdays (Mon-Fri) within a given (period, cycle) bucket.
 * Optional `untilDate` clamps to "today" when called for current-cycle.
 *   period: 'YYYY-MM'
 *   cycle:  'C1' | 'C2'
 *   untilDate: optional 'YYYY-MM-DD' upper bound (exclusive)
 * Returns array of 'YYYY-MM-DD' strings, oldest-first.
 */
function workdaysIn(period, cycle, untilDate) {
  const [y, m] = period.split('-').map(Number);
  const startDay = cycle === 'C1' ? 1 : 16;
  // End day: C1 → 15; C2 → last day of month
  const endDay = cycle === 'C1' ? 15 : new Date(Date.UTC(y, m, 0)).getUTCDate();
  const out = [];
  for (let d = startDay; d <= endDay; d += 1) {
    const dayStr = `${period}-${String(d).padStart(2, '0')}`;
    if (untilDate && dayStr >= untilDate) break;
    if (isWorkdayString(dayStr)) out.push(dayStr);
  }
  return out;
}

/**
 * Compute the prior (period, cycle) pair from a current pair.
 *   ('2026-05', 'C1') → ('2026-04', 'C2')
 *   ('2026-05', 'C2') → ('2026-05', 'C1')
 *   ('2026-01', 'C1') → ('2025-12', 'C2')
 */
function priorCycle(period, cycle) {
  if (cycle === 'C2') return { period, cycle: 'C1' };
  // cycle = 'C1' → roll back to prior month's C2
  const [y, m] = period.split('-').map(Number);
  const prevMonth = m === 1 ? 12 : m - 1;
  const prevYear = m === 1 ? y - 1 : y;
  const priorPeriod = `${prevYear}-${String(prevMonth).padStart(2, '0')}`;
  return { period: priorPeriod, cycle: 'C2' };
}

/**
 * Resolve the prior-cycle grace window in workdays.
 * Lookup-driven via DRIVE_ALLOCATION_CONFIG.PRIOR_CYCLE_GRACE_WORKDAYS;
 * falls back to inline default 5 if missing or invalid. Mirrors the lookup-
 * with-fallback pattern used elsewhere (clmPerformanceThresholds, etc.).
 *
 * Year-2 SaaS (Rule #0d): subscribers tune per-entity by editing the lookup
 * row; cache invalidate hook (60s) is wired into lookupGenericController.
 */
const _graceCache = new Map();
const GRACE_TTL_MS = 60_000;
const DEFAULT_GRACE_WORKDAYS = 5;

async function getPriorCycleGraceWorkdays(entityId) {
  const cacheKey = String(entityId || '__GLOBAL__');
  const hit = _graceCache.get(cacheKey);
  if (hit && Date.now() - hit.ts < GRACE_TTL_MS) return hit.value;
  let value = DEFAULT_GRACE_WORKDAYS;
  try {
    const filter = {
      category: 'DRIVE_ALLOCATION_CONFIG',
      code: 'PRIOR_CYCLE_GRACE_WORKDAYS',
      is_active: true,
    };
    if (entityId) filter.entity_id = entityId;
    const doc = await Lookup.findOne(filter).lean();
    const raw = doc?.metadata?.value;
    if (Number.isFinite(Number(raw))) value = Math.max(0, Math.floor(Number(raw)));
  } catch (err) {
    console.warn('[driveAllocationController] grace lookup failed:', err.message);
  }
  _graceCache.set(cacheKey, { ts: Date.now(), value });
  return value;
}

/**
 * Count workdays elapsed in the current cycle up to (and including) today.
 * Used to decide whether the prior-cycle grace window is still open.
 */
function workdaysElapsedInCurrentCycle(period, cycle, todayStr) {
  return workdaysIn(period, cycle).filter(d => d <= todayStr).length;
}

/**
 * Read the BDM's most-recent allocation end_km as a proxy for "today's start
 * km" — used to suggest end_km auto-fill on yesterday's panel row. Slice 6
 * OCR will eventually source this directly from today's SMER capture's
 * typed/OCR'd ODO reading.
 */
async function inferTodayStartKm({ entity_id, bdm_id }) {
  const last = await DriveAllocation.findOne({
    entity_id, bdm_id, status: 'ALLOCATED',
  }).sort({ drive_date: -1 }).select('end_km drive_date').lean();
  return last?.end_km && last.end_km > 0 ? last.end_km : null;
}

// ── Endpoints ─────────────────────────────────────────────────────

/**
 * GET /unallocated-workdays
 *
 * Surfaces unallocated workdays in BOTH the current cycle (clamped to
 * yesterday Manila) AND the immediately-prior cycle (subject to the grace
 * window). Returns the merged list oldest-first so the BDM clears them
 * sequentially.
 */
const getUnallocatedWorkdays = catchAsync(async (req, res) => {
  const bdmId = req.bdmId || req.user._id;
  const entityId = req.entityId;

  const canAllocate = await userCanPerformCaptureAction(
    req.user, 'ALLOCATE_PERSONAL_OFFICIAL', entityId,
  );
  const canMarkNoDrive = await userCanPerformCaptureAction(
    req.user, 'MARK_NO_DRIVE_DAY', entityId,
  );
  const grace = await getPriorCycleGraceWorkdays(entityId);

  const today = manilaDateString();
  const currentPeriod = today.slice(0, 7);
  const currentCycle = cycleFor(today);

  // Current cycle workdays: all workdays from cycle start through Manila yesterday.
  const currentDays = workdaysIn(currentPeriod, currentCycle, today);

  // Prior cycle: include only if today is still inside the grace window.
  // Grace measured in elapsed-workdays in the current cycle (so a BDM gets a
  // ~1-week catch-up window regardless of weekend timing).
  const elapsed = workdaysElapsedInCurrentCycle(currentPeriod, currentCycle, today);
  // elapsed counts up to AND INCLUDING today — grace is "today is within grace
  // workdays of the cycle start," i.e., elapsed <= grace.
  const priorOpen = elapsed <= grace;
  const prior = priorCycle(currentPeriod, currentCycle);
  const priorDays = priorOpen ? workdaysIn(prior.period, prior.cycle) : [];

  const allCandidateDays = [...priorDays, ...currentDays];

  // Subtract existing DriveAllocation rows
  const existing = await DriveAllocation.find({
    entity_id: entityId,
    bdm_id: bdmId,
    drive_date: { $in: allCandidateDays },
  }).select('drive_date').lean();
  const allocatedSet = new Set(existing.map(d => d.drive_date));

  // ── Slice 4+5 hotfix (a) — UNION fallback against CarLogbookEntry ──
  //
  // The SMER tile lock is keyed off `unallocated.length`. If a proxy backfills
  // a day directly in /erp/car-logbook (skipping the BDM AllocationPanel) the
  // day stays in `unallocated` and the SMER tile dead-ends until the BDM also
  // posts a DriveAllocation row — duplicate-entry friction. Treat any
  // CarLogbookEntry in {VALID, POSTED} for the same (bdm × entity × day) as
  // "the day is allocated" for SMER-lock-release purposes.
  //
  // Pure additive: writes still go through `/allocate` and `/no-drive`. Only
  // the unallocated-workdays read sweep widens. Keeps the BDM's source-of-truth
  // (DriveAllocation) intact while letting the proxy-posted logbook clear the
  // gate when it's the operational reality on the ground.
  const logbookCoveredSet = new Set();
  if (allCandidateDays.length > 0) {
    const earliestStr = allCandidateDays[0];
    const latestStr = allCandidateDays[allCandidateDays.length - 1];
    const rangeStart = parseManilaDate(earliestStr);
    // Exclusive upper bound = Manila-midnight at start of (latest + 1 day)
    const latestDate = parseManilaDate(latestStr);
    const rangeEnd = latestDate
      ? new Date(latestDate.getTime() + 24 * 60 * 60 * 1000)
      : null;
    if (rangeStart && rangeEnd) {
      const logbookRows = await CarLogbookEntry.find({
        entity_id: entityId,
        bdm_id: bdmId,
        entry_date: { $gte: rangeStart, $lt: rangeEnd },
        status: { $in: ['VALID', 'POSTED'] },
      }).select('entry_date status').lean();
      logbookRows.forEach(row => {
        const dayStr = manilaDateString(row.entry_date);
        // Intersect against allCandidateDays — guards against a logbook row
        // whose Manila-converted date drifts outside the window (DST-style
        // edge case; theoretically impossible in PHT but cheap to defend).
        if (allCandidateDays.includes(dayStr)) {
          logbookCoveredSet.add(dayStr);
          allocatedSet.add(dayStr);
        }
      });
    }
  }

  const unallocated = allCandidateDays.filter(d => !allocatedSet.has(d));

  // Bulk SMER + FUEL_ENTRY count per day for evidence pills (single round-trip)
  let captureSweep = [];
  if (unallocated.length > 0) {
    const minDateStr = unallocated[0];
    const minDate = parseManilaDate(minDateStr);
    captureSweep = await CaptureSubmission.aggregate([
      {
        $match: {
          entity_id: entityId,
          bdm_id: bdmId,
          workflow_type: { $in: ['SMER', 'FUEL_ENTRY'] },
          created_at: { $gte: minDate, $lt: new Date() },
        },
      },
      {
        $project: {
          workflow_type: 1,
          manilaDate: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: { $add: ['$created_at', MANILA_OFFSET_MS] },
              timezone: 'UTC',
            },
          },
        },
      },
      {
        $group: {
          _id: { date: '$manilaDate', kind: '$workflow_type' },
          count: { $sum: 1 },
        },
      },
    ]);
  }

  const counts = new Map();
  captureSweep.forEach(r => {
    const e = counts.get(r._id.date) || { smer: 0, fuel: 0 };
    if (r._id.kind === 'SMER') e.smer = r.count;
    else if (r._id.kind === 'FUEL_ENTRY') e.fuel = r.count;
    counts.set(r._id.date, e);
  });

  // Suggested start_km per day = the most-recent allocation's end_km BEFORE this date
  const priorAllocated = await DriveAllocation.find({
    entity_id: entityId, bdm_id: bdmId, status: 'ALLOCATED',
  }).sort({ drive_date: -1 }).select('drive_date end_km').lean();

  const todayStartKm = await inferTodayStartKm({ entity_id: entityId, bdm_id: bdmId });

  const days = unallocated.map(date => {
    const c = counts.get(date) || { smer: 0, fuel: 0 };
    const priorAlloc = priorAllocated.find(a => a.drive_date < date);
    const dPeriod = periodFor(date);
    const dCycle = cycleFor(date);
    const isPriorCycle = (dPeriod !== currentPeriod) || (dCycle !== currentCycle);
    return {
      date,
      dayLabel: `${manilaDayLabel(date)}, ${date.slice(5).replace('-', '/')}`,
      period: dPeriod,
      cycle: dCycle,
      priorCycle: isPriorCycle,
      smerCount: c.smer,
      fuelCount: c.fuel,
      suggestedStartKm: priorAlloc?.end_km && priorAlloc.end_km > 0 ? priorAlloc.end_km : null,
    };
  });

  res.json({
    success: true,
    data: {
      currentPeriod,
      currentCycle,
      priorPeriod: prior.period,
      priorCycle: prior.cycle,
      priorCycleOpen: priorOpen,
      priorCycleGraceWorkdays: grace,
      today,
      todayStartKm,
      canAllocate,
      canMarkNoDrive,
      // Hotfix (a): days the SMER lock was released by a CarLogbookEntry rather
      // than a DriveAllocation. UI may render a "covered by Car Logbook" tally;
      // treated as silently-allocated for the lock-release semantics.
      coveredByLogbookDays: Array.from(logbookCoveredSet).sort(),
      days,
    },
  });
});

/**
 * POST /allocate
 *
 * Body: { drive_date, start_km, end_km, personal_km, end_km_auto_filled?,
 *         notes?, source_smer_capture_ids? }
 */
const allocate = catchAsync(async (req, res) => {
  const entityId = req.entityId;

  const can = await userCanPerformCaptureAction(
    req.user, 'ALLOCATE_PERSONAL_OFFICIAL', entityId,
  );
  if (!can) {
    return res.status(403).json({
      success: false,
      message: 'ALLOCATE_PERSONAL_OFFICIAL permission required.',
    });
  }

  const {
    drive_date, start_km, end_km, personal_km,
    end_km_auto_filled, notes, source_smer_capture_ids,
  } = req.body;

  if (!drive_date || !/^\d{4}-\d{2}-\d{2}$/.test(drive_date)) {
    return res.status(400).json({ success: false, message: 'drive_date (YYYY-MM-DD) is required.' });
  }
  if (!isWorkdayString(drive_date)) {
    return res.status(400).json({
      success: false,
      message: 'drive_date must be a workday (Mon-Fri Manila time). Use NO_DRIVE for non-driving days.',
    });
  }

  const today = manilaDateString();
  if (drive_date >= today) {
    return res.status(400).json({
      success: false,
      message: 'Cannot allocate today or future dates. Allocate prior workdays only.',
    });
  }

  // Cycle gate: drive_date must be in current cycle OR in the prior cycle
  // while the grace window is still open. Beyond grace → admin override path
  // (OVERRIDE_ALLOCATION, Slice 9 — deferred).
  const targetPeriod = periodFor(drive_date);
  const targetCycle = cycleFor(drive_date);
  const currentPeriod = today.slice(0, 7);
  const currentCycle = cycleFor(today);
  const isCurrent = (targetPeriod === currentPeriod && targetCycle === currentCycle);
  let isPriorOpen = false;
  if (!isCurrent) {
    const prior = priorCycle(currentPeriod, currentCycle);
    if (targetPeriod === prior.period && targetCycle === prior.cycle) {
      const elapsed = workdaysElapsedInCurrentCycle(currentPeriod, currentCycle, today);
      const grace = await getPriorCycleGraceWorkdays(entityId);
      isPriorOpen = elapsed <= grace;
    }
  }
  if (!isCurrent && !isPriorOpen) {
    return res.status(400).json({
      success: false,
      message: 'drive_date is outside the backfill window. Ask admin to override (OVERRIDE_ALLOCATION).',
    });
  }

  // Cross-BDM allocation: require privileged caller for non-self target.
  const targetBdmId = req.body.bdm_id || req.bdmId || req.user._id;
  const isSelf = String(targetBdmId) === String(req.user._id);
  const privileged = !!(req.isPresident || req.isAdmin || req.isFinance);
  if (!isSelf && !privileged) {
    return res.status(403).json({
      success: false,
      message: 'Cross-BDM allocation requires admin/finance/president role.',
    });
  }

  if (typeof start_km !== 'number' || typeof end_km !== 'number') {
    return res.status(400).json({
      success: false,
      message: 'start_km and end_km must be numbers.',
    });
  }
  if (end_km < start_km) {
    return res.status(400).json({
      success: false,
      message: 'end_km cannot be less than start_km.',
    });
  }
  if (typeof personal_km !== 'number' || personal_km < 0) {
    return res.status(400).json({
      success: false,
      message: 'personal_km must be a non-negative number.',
    });
  }

  const update = {
    bdm_id: targetBdmId,
    entity_id: entityId,
    allocated_by: req.user._id,
    drive_date,
    period: targetPeriod,
    cycle: targetCycle,
    status: 'ALLOCATED',
    start_km,
    end_km,
    end_km_auto_filled: !!end_km_auto_filled,
    personal_km,
    notes: notes || undefined,
    source_smer_capture_ids: Array.isArray(source_smer_capture_ids)
      ? source_smer_capture_ids
      : undefined,
    source: isSelf ? 'BDM_SELF' : 'PROXY_OVERRIDE',
  };

  const filter = {
    bdm_id: targetBdmId,
    entity_id: entityId,
    drive_date,
  };
  let doc = await DriveAllocation.findOne(filter);
  if (doc) {
    Object.assign(doc, update);
  } else {
    doc = new DriveAllocation(update);
  }
  await doc.save();

  res.status(200).json({ success: true, data: doc });
});

/**
 * POST /no-drive
 *
 * Body: { drive_date, notes? }
 */
const markNoDrive = catchAsync(async (req, res) => {
  const entityId = req.entityId;

  const can = await userCanPerformCaptureAction(
    req.user, 'MARK_NO_DRIVE_DAY', entityId,
  );
  if (!can) {
    return res.status(403).json({
      success: false,
      message: 'MARK_NO_DRIVE_DAY permission required.',
    });
  }

  const { drive_date, notes } = req.body;
  if (!drive_date || !/^\d{4}-\d{2}-\d{2}$/.test(drive_date)) {
    return res.status(400).json({ success: false, message: 'drive_date (YYYY-MM-DD) is required.' });
  }
  if (!isWorkdayString(drive_date)) {
    return res.status(400).json({
      success: false,
      message: 'drive_date must be a workday (Mon-Fri Manila time).',
    });
  }
  const today = manilaDateString();
  if (drive_date >= today) {
    return res.status(400).json({
      success: false,
      message: 'Cannot mark no-drive on today or future dates.',
    });
  }

  const targetPeriod = periodFor(drive_date);
  const targetCycle = cycleFor(drive_date);
  const currentPeriod = today.slice(0, 7);
  const currentCycle = cycleFor(today);
  const isCurrent = (targetPeriod === currentPeriod && targetCycle === currentCycle);
  let isPriorOpen = false;
  if (!isCurrent) {
    const prior = priorCycle(currentPeriod, currentCycle);
    if (targetPeriod === prior.period && targetCycle === prior.cycle) {
      const elapsed = workdaysElapsedInCurrentCycle(currentPeriod, currentCycle, today);
      const grace = await getPriorCycleGraceWorkdays(entityId);
      isPriorOpen = elapsed <= grace;
    }
  }
  if (!isCurrent && !isPriorOpen) {
    return res.status(400).json({
      success: false,
      message: 'drive_date is outside the backfill window. Ask admin to override (OVERRIDE_ALLOCATION).',
    });
  }

  const targetBdmId = req.body.bdm_id || req.bdmId || req.user._id;
  const isSelf = String(targetBdmId) === String(req.user._id);
  const privileged = !!(req.isPresident || req.isAdmin || req.isFinance);
  if (!isSelf && !privileged) {
    return res.status(403).json({
      success: false,
      message: 'Cross-BDM no-drive marking requires admin/finance/president role.',
    });
  }

  const filter = { bdm_id: targetBdmId, entity_id: entityId, drive_date };
  let doc = await DriveAllocation.findOne(filter);
  if (!doc) {
    doc = new DriveAllocation({
      bdm_id: targetBdmId,
      entity_id: entityId,
      allocated_by: req.user._id,
      drive_date,
      period: targetPeriod,
      cycle: targetCycle,
      status: 'NO_DRIVE',
      notes: notes || undefined,
      source: isSelf ? 'BDM_SELF' : 'PROXY_OVERRIDE',
    });
  } else {
    doc.status = 'NO_DRIVE';
    doc.period = targetPeriod;
    doc.cycle = targetCycle;
    doc.notes = notes || doc.notes;
    doc.allocated_by = req.user._id;
    doc.source = isSelf ? 'BDM_SELF' : 'PROXY_OVERRIDE';
  }
  await doc.save();

  res.status(200).json({ success: true, data: doc });
});

/**
 * GET /my
 *
 * Lists allocations for the caller (or specified bdmId for privileged callers).
 * Query: ?period=YYYY-MM&cycle=C1|C2&limit=50&skip=0&bdmId=...
 */
const getMyAllocations = catchAsync(async (req, res) => {
  const entityId = req.entityId;
  const privileged = !!(req.isPresident || req.isAdmin || req.isFinance);
  const targetBdmId = (privileged && req.query.bdmId)
    ? req.query.bdmId
    : (req.bdmId || req.user._id);

  const today = manilaDateString();
  const period = req.query.period || today.slice(0, 7);
  const cycle = req.query.cycle || cycleFor(today);

  const filter = {
    entity_id: entityId,
    bdm_id: targetBdmId,
    period,
    cycle,
  };

  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const skip = Number(req.query.skip) || 0;

  const [data, total] = await Promise.all([
    DriveAllocation.find(filter)
      .sort({ drive_date: 1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    DriveAllocation.countDocuments(filter),
  ]);

  res.json({ success: true, data, total, currentPeriod: period, currentCycle: cycle });
});

/** Bust grace cache — wired into lookupGenericController on save/update/remove. */
function invalidateGraceCache(entityId) {
  if (!entityId) {
    _graceCache.clear();
    return;
  }
  _graceCache.delete(String(entityId));
}

module.exports = {
  getUnallocatedWorkdays,
  allocate,
  markNoDrive,
  getMyAllocations,
  invalidateGraceCache,
  // Exposed for healthcheck + tests
  cycleFor,
  periodFor,
  priorCycle,
  workdaysIn,
  workdaysElapsedInCurrentCycle,
};
