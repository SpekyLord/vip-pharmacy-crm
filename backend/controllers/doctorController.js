/**
 * Doctor Controller
 *
 * Handles doctor CRUD operations with assignment-based access control
 * Follows CLAUDE.md rules:
 * - Employees (BDMs) can ONLY see doctors assigned to them (via assignedTo field)
 * - Admin can see all doctors
 * - visitFrequency: 2 or 4 (NOT A/B/C/D categories)
 */

const mongoose = require('mongoose');
const Doctor = require('../models/Doctor');
const Visit = require('../models/Visit');
const Schedule = require('../models/Schedule');
const ProductAssignment = require('../models/ProductAssignment');
const User = require('../models/User');
const CrmProduct = require('../models/CrmProduct');
const Specialization = require('../models/Specialization');
const { catchAsync, NotFoundError, ForbiddenError } = require('../middleware/errorHandler');
const { sanitizeSearchString } = require('../utils/controllerHelpers');
const { ROLES, isAdminLike } = require('../constants/roles');
const { loadNameRules, generatePreview, findPotentialDuplicates } = require('../utils/nameCleanup');
const {
  getManagePartnershipRoles,
  getSetAgreementDateRoles,
} = require('../utils/mdPartnerAccess');
// Phase A.5.4 follow-on — lookup-driven role gates for `assignedTo[]` membership
// (JOIN_COVERAGE_AUTO) and `primaryAssignee` ownership (REASSIGN_PRIMARY). Inline
// defaults are [admin, president]; subscribers configure per-entity via Control
// Center → Lookup Tables → VIP_CLIENT_LIFECYCLE_ROLES (Rule #3 / #19 / D11).
const { userCanPerformLifecycleAction } = require('../utils/resolveVipClientLifecycleRole');
const { dateToSlot, validateAlternatingWeek, rejectPastCycle } = require('../utils/scheduleSlotMapper');
// Phase A.5.4 — shape-agnostic assignee access. Use isAssignedTo / getAssigneeIds /
// getPrimaryAssigneeId instead of the legacy `doctor.assignedTo?._id || doctor.assignedTo`
// ternary, which silently miscompares against array shapes.
const { isAssignedTo, getAssigneeIds, getPrimaryAssigneeId } = require('../utils/assigneeAccess');

// Phase VIP-1.A — Mirrors Doctor.js schema enum. If you change the schema, change this list.
// Health check asserts the two stay in sync.
const PARTNERSHIP_STATUSES = ['LEAD', 'CONTACTED', 'VISITED', 'PARTNER', 'INACTIVE'];
// BDMs may self-transition their own assigned Doctor through these statuses.
// PARTNER promotion is gated separately on SET_AGREEMENT_DATE roles.
const BDM_SELF_TRANSITIONS = ['LEAD', 'CONTACTED', 'VISITED', 'INACTIVE'];

/**
 * Build access filter based on user role
 * - Admin: no filter (see all)
 * - Employee (BDM): only doctors assigned to them via assignedTo field
 */
const getRegionFilter = (user) => {
  if (isAdminLike(user.role)) {
    return {}; // No filter for admin
  }

  // BDMs see only doctors assigned to them (set by CPT import)
  if (user.role === ROLES.CONTRACTOR) {
    return { assignedTo: user._id };
  }

  // Fallback: no access
  return { _id: null };
};

/**
 * @desc    Get all doctors with pagination and filters
 * @route   GET /api/doctors
 * @access  All authenticated users (filtered by region for employees)
 */
const getAllDoctors = catchAsync(async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const requestedLimit = parseInt(req.query.limit, 10);
  // limit=0 means fetch all (no limit), otherwise default to 20
  const limit = requestedLimit === 0 ? 0 : (requestedLimit || 20);
  const skip = limit === 0 ? 0 : (page - 1) * limit;

  // Start with access filter based on user role
  const regionFilter = getRegionFilter(req.user);
  const filter = { isActive: true, ...regionFilter };

  // Filter by visit frequency
  if (req.query.visitFrequency && [2, 4].includes(parseInt(req.query.visitFrequency))) {
    filter.visitFrequency = parseInt(req.query.visitFrequency);
  }

  // Filter by specialization
  if (req.query.specialization) {
    filter.specialization = req.query.specialization;
  }

  // Filter by assigned employee
  if (req.query.assignedTo) {
    filter.assignedTo = req.query.assignedTo;
  }

  // Filter by support during coverage
  if (req.query.supportDuringCoverage) {
    filter.supportDuringCoverage = { $in: Array.isArray(req.query.supportDuringCoverage)
      ? req.query.supportDuringCoverage : [req.query.supportDuringCoverage] };
  }

  // Filter by programs to implement
  if (req.query.programsToImplement) {
    filter.programsToImplement = { $in: Array.isArray(req.query.programsToImplement)
      ? req.query.programsToImplement : [req.query.programsToImplement] };
  }

  // Filter by client type (Gap 9)
  if (req.query.clientType) {
    filter.clientType = req.query.clientType;
  }

  // Filter by hospital affiliation (Gap 9)
  if (req.query.hospital_id) {
    filter['hospitals.hospital_id'] = req.query.hospital_id;
  }

  // Phase VIP-1.A — partnership_status filter. Accepts a single value
  // ('LEAD') or comma-separated list ('LEAD,CONTACTED,VISITED,PARTNER,INACTIVE')
  // so the MD Leads page can fetch all five buckets in one round-trip and tally
  // counts client-side. Invalid enum values are silently dropped (Rule #21:
  // never fall back to a default that hides data — drop only the bad token).
  if (req.query.partnership_status) {
    const parts = String(req.query.partnership_status)
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .filter((s) => PARTNERSHIP_STATUSES.includes(s));
    if (parts.length === 1) filter.partnership_status = parts[0];
    else if (parts.length > 1) filter.partnership_status = { $in: parts };
  }

  // Compose search + needsCleanup clauses via $and so both $or conditions coexist.
  // Phase G1.6 — Needs Cleanup flags doctors missing structured locality or province;
  // supports the admin backfill workflow (SMER per-diem notes need structured address).
  const andClauses = [];

  // Search by firstName, lastName, or clinicOfficeAddress
  if (req.query.search) {
    const safeSearch = sanitizeSearchString(req.query.search);
    andClauses.push({
      $or: [
        { firstName: { $regex: safeSearch, $options: 'i' } },
        { lastName: { $regex: safeSearch, $options: 'i' } },
        { clinicOfficeAddress: { $regex: safeSearch, $options: 'i' } },
      ],
    });
  }

  if (req.query.needsCleanup === 'true' || req.query.needsCleanup === true) {
    andClauses.push({
      $or: [
        { locality: { $in: [null, ''] } },
        { locality: { $exists: false } },
        { province: { $in: [null, ''] } },
        { province: { $exists: false } },
      ],
    });
  }

  if (andClauses.length) {
    filter.$and = andClauses;
  }

  // Execute query - if limit is 0, don't apply skip/limit (fetch all)
  let query = Doctor.find(filter)
    .populate('assignedTo', 'name email')
    .sort({ lastName: 1, firstName: 1 })
    .lean();

  if (limit > 0) {
    query = query.skip(skip).limit(limit);
  }

  // When fetching all (limit=0), skip countDocuments — use array.length instead
  let doctors, total;
  if (limit === 0) {
    doctors = await query;
    total = doctors.length;
  } else {
    [doctors, total] = await Promise.all([
      query,
      Doctor.countDocuments(filter),
    ]);
  }

  res.status(200).json({
    success: true,
    data: doctors,
    pagination: {
      page,
      limit: limit || total,
      total,
      pages: limit > 0 ? Math.ceil(total / limit) : 1,
    },
  });
});

/**
 * @desc    Get doctor by ID
 * @route   GET /api/doctors/:id
 * @access  All authenticated users (with region check for employees)
 */
const getDoctorById = catchAsync(async (req, res) => {
  const doctor = await Doctor.findById(req.params.id)
    .populate('assignedTo', 'name email phone')
    .populate({
      path: 'assignedProducts',
      populate: { path: 'product', select: 'name genericName dosage category image description usage safety' },
    })
    .populate('targetProducts.product', 'name genericName dosage category image description usage safety');

  if (!doctor) {
    throw new NotFoundError('Doctor not found');
  }

  // Check access for non-admin users: BDMs can only see doctors assigned to them
  if (req.user.role === ROLES.CONTRACTOR) {
    if (!isAssignedTo(doctor, req.user._id)) {
      throw new ForbiddenError('You do not have access to this VIP Client');
    }
  }

  res.status(200).json({
    success: true,
    data: doctor,
  });
});

/**
 * @desc    Create new doctor
 * @route   POST /api/doctors
 * @access  Admin, Employee
 *
 * Phase A.6 (May 05 2026): optionally accepts initialSchedule on the body —
 *   initialSchedule: [{ date: 'YYYY-MM-DD' }, ...]
 * When present, validates each slot, then atomically inserts the Doctor +
 * Schedule entries. If the Schedule insert fails (e.g. duplicate slot for
 * this BDM/doctor pair), the Doctor create is rolled back so the row never
 * appears half-created. Atlas transaction is used when available; standalone
 * Mongo (test fixtures) falls back to compensating delete.
 */
const createDoctor = catchAsync(async (req, res) => {
  const {
    firstName,
    lastName,
    specialization,
    clinicOfficeAddress,
    locality,
    province,
    phone,
    email,
    visitFrequency,
    assignedTo: rawAssignedTo,
    primaryAssignee: rawPrimaryAssignee,
    notes,
    clinicSchedule,
    location,
    outletIndicator,
    programsToImplement,
    supportDuringCoverage,
    levelOfEngagement,
    secretaryName,
    secretaryPhone,
    birthday,
    anniversary,
    otherDetails,
    targetProducts,
    isVipAssociated,
    clientType,
    hospitals,
    initialSchedule,
  } = req.body;

  // Phase A.5.4 — assignedTo is now an array on the schema. Normalize the
  // request body shape (scalar string from legacy clients OR array) into the
  // canonical [<id>, ...] form. Single-BDM scalar input still creates a
  // shared-capable record with one assignee. `firstAssigneeId` is also kept as
  // a scalar for the Schedule rows below (Schedule.user is scalar).
  const assignedTo = Array.isArray(rawAssignedTo)
    ? rawAssignedTo.filter(Boolean)
    : (rawAssignedTo ? [rawAssignedTo] : []);
  const firstAssigneeId = assignedTo.length > 0 ? assignedTo[0] : null;

  // ── Pre-validate initialSchedule before touching the DB. We do not want a
  // half-failed transaction surfacing as a confusing 207 multi-status. If any
  // slot is malformed, reject the whole request with a single 400.
  let validatedSlots = [];
  if (Array.isArray(initialSchedule) && initialSchedule.length > 0) {
    if (!firstAssigneeId) {
      return res.status(400).json({
        success: false,
        message: 'initialSchedule requires assignedTo (BDM owner) so the Schedule rows can be wired to the right BDM.',
      });
    }
    const effectiveFrequency = visitFrequency || 4;
    const seenSlotKeys = new Set();
    const seenWeekDates = new Map(); // weekKey → date string, for alt-week + duplicate-week detection
    const errors = [];
    initialSchedule.forEach((slot, idx) => {
      if (!slot || !slot.date) {
        errors.push({ index: idx, message: 'each slot needs a `date` (YYYY-MM-DD)' });
        return;
      }
      let derived;
      try {
        derived = dateToSlot(slot.date);
      } catch (err) {
        errors.push({ index: idx, message: err.message });
        return;
      }
      const past = rejectPastCycle(derived.cycleNumber);
      if (!past.ok) {
        errors.push({ index: idx, message: past.reason });
        return;
      }
      const slotKey = `${derived.cycleNumber}-${derived.scheduledWeek}-${derived.scheduledDay}`;
      if (seenSlotKeys.has(slotKey)) {
        errors.push({ index: idx, message: `Duplicate slot ${derived.scheduledLabel} in cycle ${derived.cycleNumber}` });
        return;
      }
      seenSlotKeys.add(slotKey);

      // Per-cycle alternating-week + per-week-uniqueness for 2x/mo VIPs.
      // For 4x/mo we expect at most one slot per week per cycle (the existing
      // unique index enforces this anyway via the {scheduledWeek, scheduledDay}
      // tuple, but a same-week two-day-different slot is a planning error).
      const weekKey = `${derived.cycleNumber}-${derived.scheduledWeek}`;
      if (seenWeekDates.has(weekKey)) {
        errors.push({
          index: idx,
          message: `Two visits scheduled in the same week (${derived.scheduledLabel}). One visit per week is the cap.`,
        });
        return;
      }
      seenWeekDates.set(weekKey, slot.date);

      validatedSlots.push({ ...derived, sourceDate: slot.date });
    });

    // Alternating-week rule for 2x/mo, computed across the whole proposed set
    if (effectiveFrequency === 2 && validatedSlots.length > 0) {
      const byCycle = validatedSlots.reduce((acc, s) => {
        (acc[s.cycleNumber] = acc[s.cycleNumber] || []).push(s);
        return acc;
      }, {});
      for (const cycle of Object.keys(byCycle)) {
        const slots = byCycle[cycle];
        for (const candidate of slots) {
          const others = slots.filter((s) => s !== candidate);
          const altCheck = validateAlternatingWeek({ visitFrequency: 2 }, candidate.scheduledWeek, others);
          if (!altCheck.ok) {
            errors.push({ index: -1, message: altCheck.reason });
            break;
          }
        }
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'initialSchedule has invalid slot(s)',
        errors,
      });
    }
  }

  const doctorPayload = {
    firstName,
    lastName,
    specialization,
    clinicOfficeAddress,
    // Phase G1.5 post-audit fix — locality/province were defined in the schema
    // but never whitelisted here, so admin form + ClientAddModal + promotion
    // carryover all silently dropped them. Now persisted end-to-end.
    locality,
    province,
    phone,
    email,
    visitFrequency: visitFrequency || 4,
    assignedTo,
    // Phase A.5.4 — caller-supplied primary is honored only when it's in the
    // assignedTo[] set; otherwise the model's pre-save invariant resets it to
    // assignedTo[0]. We pass it through verbatim and let the hook be the gate.
    primaryAssignee: rawPrimaryAssignee || undefined,
    notes,
    clinicSchedule,
    location,
    outletIndicator,
    programsToImplement,
    supportDuringCoverage,
    levelOfEngagement,
    secretaryName,
    secretaryPhone,
    birthday,
    anniversary,
    otherDetails,
    targetProducts,
    isVipAssociated,
    clientType,
    hospitals,
  };

  let doctor;
  if (validatedSlots.length === 0) {
    doctor = await Doctor.create(doctorPayload);
  } else {
    // Try transactional path first; fall back to compensating delete on standalone Mongo.
    const session = await mongoose.startSession();
    let txnFailed = false;
    try {
      await session.withTransaction(async () => {
        const created = await Doctor.create([doctorPayload], { session });
        doctor = created[0];
        const scheduleRows = validatedSlots.map((s) => ({
          doctor: doctor._id,
          user: firstAssigneeId,
          cycleStart: s.cycleStart,
          cycleNumber: s.cycleNumber,
          scheduledWeek: s.scheduledWeek,
          scheduledDay: s.scheduledDay,
          scheduledLabel: s.scheduledLabel,
          status: 'planned',
        }));
        await Schedule.insertMany(scheduleRows, { session, ordered: true });
      });
    } catch (txnErr) {
      txnFailed = true;
      // Standalone Mongo (no replica set) throws "Transaction numbers are only allowed on a replica set member or mongos".
      // Detect and fall back to non-transactional create + compensating delete.
      const isReplicaSetMissing = /replica set|mongos|Transaction numbers/.test(txnErr.message || '');
      if (!isReplicaSetMissing) {
        await session.endSession().catch(() => {});
        if (txnErr.code === 11000) {
          return res.status(409).json({
            success: false,
            message: 'One of the proposed schedule slots is already taken for this BDM/VIP combination. Adjust the dates and retry.',
          });
        }
        throw txnErr;
      }
      // Fallback path
      doctor = await Doctor.create(doctorPayload);
      try {
        const scheduleRows = validatedSlots.map((s) => ({
          doctor: doctor._id,
          user: firstAssigneeId,
          cycleStart: s.cycleStart,
          cycleNumber: s.cycleNumber,
          scheduledWeek: s.scheduledWeek,
          scheduledDay: s.scheduledDay,
          scheduledLabel: s.scheduledLabel,
          status: 'planned',
        }));
        await Schedule.insertMany(scheduleRows, { ordered: true });
      } catch (schedErr) {
        // Compensating delete so we don't leave an orphan Doctor.
        await Doctor.deleteOne({ _id: doctor._id }).catch(() => {});
        if (schedErr.code === 11000) {
          return res.status(409).json({
            success: false,
            message: 'One of the proposed schedule slots is already taken for this BDM/VIP combination. Adjust the dates and retry.',
          });
        }
        throw schedErr;
      }
    } finally {
      await session.endSession().catch(() => {});
    }
    if (txnFailed && !doctor) {
      // Belt-and-suspenders — should be unreachable.
      throw new Error('Doctor create failed during transaction fallback');
    }
  }

  // Phase A.5.4 — assignedTo is an array; populate when at least one assignee.
  if (Array.isArray(doctor.assignedTo) && doctor.assignedTo.length > 0) {
    await doctor.populate('assignedTo', 'name email');
  }

  res.status(201).json({
    success: true,
    message: validatedSlots.length > 0
      ? `Doctor created with ${validatedSlots.length} scheduled visit${validatedSlots.length === 1 ? '' : 's'}`
      : 'Doctor created successfully',
    data: doctor,
    scheduledCount: validatedSlots.length,
  });
});

/**
 * @desc    Update doctor
 * @route   PUT /api/doctors/:id
 * @access  Admin, Employee
 */
const updateDoctor = catchAsync(async (req, res) => {
  const doctor = await Doctor.findById(req.params.id);

  if (!doctor) {
    throw new NotFoundError('Doctor not found');
  }

  // Ownership check: BDMs can only edit their own assigned VIP Clients
  if (req.user.role === ROLES.CONTRACTOR) {
    if (!isAssignedTo(doctor, req.user._id)) {
      throw new ForbiddenError('You can only edit VIP Clients assigned to you');
    }
  }

  // Allowed fields to update - BDMs cannot change assignedTo, isActive, isVipAssociated
  const adminAllowedFields = [
    'firstName',
    'lastName',
    'specialization',
    'clinicOfficeAddress',
    'locality',   // Phase G1.5 post-audit fix — was being dropped on update
    'province',   // Phase G1.5 post-audit fix — was being dropped on update
    'phone',
    'email',
    'visitFrequency',
    'assignedTo',
    'primaryAssignee',
    'notes',
    'clinicSchedule',
    'location',
    'isActive',
    'outletIndicator',
    'programsToImplement',
    'supportDuringCoverage',
    'levelOfEngagement',
    'secretaryName',
    'secretaryPhone',
    'birthday',
    'anniversary',
    'otherDetails',
    'targetProducts',
    'isVipAssociated',
    'clientType',
    'hospitals',
    'messengerId',
    'viberId',
    'whatsappNumber',
  ];
  const employeeAllowedFields = adminAllowedFields.filter(
    (f) => !['assignedTo', 'primaryAssignee', 'isActive', 'isVipAssociated'].includes(f)
  );
  let allowedFields = isAdminLike(req.user.role) ? adminAllowedFields : employeeAllowedFields;

  // Phase A.5.4 follow-on — Rule #3 / #19 lookup-driven role gates layered on top
  // of the broad admin/employee split. Default [admin, president] is unchanged;
  // subscribers narrow REASSIGN_PRIMARY (e.g. president-only) or loosen
  // JOIN_COVERAGE_AUTO (e.g. allow staff self-join) per entity without a code
  // deploy. Falls back to inline defaults if the Lookup is unreachable.
  const reqEntityId = req.entityId || null;
  const [canReassignPrimary, canJoinCoverage] = await Promise.all([
    userCanPerformLifecycleAction(req.user, 'REASSIGN_PRIMARY', reqEntityId),
    userCanPerformLifecycleAction(req.user, 'JOIN_COVERAGE_AUTO', reqEntityId),
  ]);
  allowedFields = allowedFields.filter((f) => {
    if (f === 'primaryAssignee' && !canReassignPrimary) return false;
    if (f === 'assignedTo' && !canJoinCoverage) return false;
    return true;
  });

  // Update only allowed fields. Phase A.5.4 — normalize assignedTo to array
  // when the caller sent a scalar (legacy clients) so Mongoose's array casting
  // doesn't trip over a bare ObjectId.
  allowedFields.forEach((field) => {
    if (req.body[field] !== undefined) {
      let value = req.body[field];
      if (field === 'assignedTo') {
        if (Array.isArray(value)) value = value.filter(Boolean);
        else if (value) value = [value];
        else value = [];
      }
      doctor[field] = value;
    }
  });

  await doctor.save();
  // Phase A.5.4 — assignedTo is an array; populate when at least one assignee.
  if (Array.isArray(doctor.assignedTo) && doctor.assignedTo.length > 0) {
    await doctor.populate('assignedTo', 'name email');
  }

  res.status(200).json({
    success: true,
    message: 'Doctor updated successfully',
    data: doctor,
  });
});

/**
 * @desc    Delete doctor — soft (deactivate) or hard (permanent with cascade)
 * @route   DELETE /api/doctors/:id
 * @route   DELETE /api/doctors/:id?permanent=true
 * @access  Admin only
 */
const deleteDoctor = catchAsync(async (req, res) => {
  const doctor = await Doctor.findById(req.params.id);

  if (!doctor) {
    throw new NotFoundError('Doctor not found');
  }

  if (req.query.permanent === 'true') {
    const doctorId = doctor._id;

    await Promise.all([
      Visit.deleteMany({ doctor: doctorId }),
      Schedule.deleteMany({ doctor: doctorId }),
      ProductAssignment.deleteMany({ doctor: doctorId }),
    ]);

    await doctor.deleteOne();

    return res.status(200).json({
      success: true,
      message: 'VIP Client and all related data deleted permanently',
    });
  }

  // Soft delete (default)
  doctor.isActive = false;
  await doctor.save();

  res.status(200).json({
    success: true,
    message: 'VIP Client deactivated successfully',
  });
});

/**
 * @desc    Get count of active doctors assigned to a specific user (BDM)
 * @route   GET /api/doctors/count-by-user/:userId
 * @access  Admin only
 */
const countDoctorsByUser = catchAsync(async (req, res) => {
  const { userId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new NotFoundError('Invalid user ID');
  }

  const count = await Doctor.countDocuments({ assignedTo: userId, isActive: true });

  res.status(200).json({
    success: true,
    data: { count, userId },
  });
});

/**
 * @desc    Batch hard delete all doctors assigned to a specific user (BDM) and their related data
 * @route   DELETE /api/doctors/by-user/:userId
 * @access  Admin only
 */
const deleteDoctorsByUser = catchAsync(async (req, res) => {
  const { userId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new NotFoundError('Invalid user ID');
  }

  const user = await User.findById(userId);
  if (!user) {
    throw new NotFoundError('User not found');
  }

  const doctors = await Doctor.find({ assignedTo: userId }).select('_id');
  const doctorIds = doctors.map((d) => d._id);

  await Promise.all([
    Visit.deleteMany({ doctor: { $in: doctorIds } }),
    Schedule.deleteMany({ doctor: { $in: doctorIds } }),
    ProductAssignment.deleteMany({ doctor: { $in: doctorIds } }),
  ]);

  const result = await Doctor.deleteMany({ assignedTo: userId });

  res.status(200).json({
    success: true,
    message: `${result.deletedCount} VIP Client(s) and all related data deleted permanently`,
    data: {
      deletedCount: result.deletedCount,
      userId: userId,
      userName: user.name,
    },
  });
});

/**
 * @desc    Get doctors by region
 * @route   GET /api/doctors/region/:regionId
 * @access  All authenticated users
 */
const getDoctorsByRegion = catchAsync(async (req, res) => {
  const { regionId } = req.params;

  const filter = { region: regionId, isActive: true };

  // BDMs only see their assigned doctors even when filtering by region
  if (req.user.role === ROLES.CONTRACTOR) {
    filter.assignedTo = req.user._id;
  }

  const doctors = await Doctor.find(filter)
    .populate('assignedTo', 'name email')
    .sort({ lastName: 1, firstName: 1 });

  res.status(200).json({
    success: true,
    data: doctors,
    count: doctors.length,
  });
});

/**
 * @desc    Get doctor's visit history
 * @route   GET /api/doctors/:id/visits
 * @access  All authenticated users
 */
const getDoctorVisits = catchAsync(async (req, res) => {
  const doctor = await Doctor.findById(req.params.id);

  if (!doctor) {
    throw new NotFoundError('Doctor not found');
  }

  // Check access for non-admin users: BDMs can only see visits for their assigned doctors
  if (req.user.role === ROLES.CONTRACTOR) {
    if (!isAssignedTo(doctor, req.user._id)) {
      throw new ForbiddenError('You do not have access to this VIP Client');
    }
  }

  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 20;
  const skip = (page - 1) * limit;

  const filter = { doctor: req.params.id };

  // Filter by month
  if (req.query.monthYear) {
    filter.monthYear = req.query.monthYear;
  }

  // Filter by status
  if (req.query.status) {
    filter.status = req.query.status;
  }

  const [visits, total] = await Promise.all([
    Visit.find(filter)
      .populate('user', 'name email')
      .populate({
        path: 'productsDiscussed.product',
        select: 'name category',
      })
      .sort({ visitDate: -1 })
      .skip(skip)
      .limit(limit),
    Visit.countDocuments(filter),
  ]);

  res.status(200).json({
    success: true,
    data: {
      doctor: {
        _id: doctor._id,
        firstName: doctor.firstName,
        lastName: doctor.lastName,
        fullName: doctor.fullName,
        specialization: doctor.specialization,
        clinicOfficeAddress: doctor.clinicOfficeAddress,
      },
      visits,
    },
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  });
});

/**
 * @desc    Get doctor's assigned products
 * @route   GET /api/doctors/:id/products
 * @access  All authenticated users
 */
const getDoctorProducts = catchAsync(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid doctor ID',
    });
  }

  const doctor = await Doctor.findOne({ _id: id, isActive: true }).populate({
    path: 'assignedProducts',
    match: { status: 'active' },
    populate: { path: 'product', select: 'name genericName dosage category image description usage safety' },
  });

  if (!doctor) {
    throw new NotFoundError('Doctor not found');
  }

  // BDMs can only view products for their assigned VIP Clients
  if (req.user.role === ROLES.CONTRACTOR) {
    if (!isAssignedTo(doctor, req.user._id)) {
      throw new ForbiddenError('You do not have access to this VIP Client');
    }
  }

  res.status(200).json({
    success: true,
    data: {
      doctor: {
        _id: doctor._id,
        firstName: doctor.firstName,
        lastName: doctor.lastName,
        fullName: doctor.fullName,
        specialization: doctor.specialization,
      },
      products: doctor.assignedProducts || [],
    },
  });
});

/**
 * @desc    Assign employee to doctor
 * @route   PUT /api/doctors/:id/assign
 * @access  Admin only
 */
const assignEmployee = catchAsync(async (req, res) => {
  const { employeeId } = req.body;

  const doctor = await Doctor.findById(req.params.id);
  if (!doctor) {
    throw new NotFoundError('Doctor not found');
  }

  if (employeeId) {
    const employee = await User.findOne({ _id: employeeId, role: ROLES.CONTRACTOR, isActive: true });
    if (!employee) {
      throw new NotFoundError('Employee not found or inactive');
    }
  }

  // Phase A.5.4 — assignedTo is an array. assignEmployee assigns ONE BDM as the
  // sole owner (existing API contract: previously a scalar overwrite). To add
  // a BDM to an existing share without removing others, use the future
  // /api/doctors/:id/assignees endpoint (A.5.4 follow-on).
  if (employeeId) {
    doctor.assignedTo = [employeeId];
    doctor.primaryAssignee = employeeId;
  } else {
    doctor.assignedTo = [];
    doctor.primaryAssignee = null;
  }
  await doctor.save();

  if (Array.isArray(doctor.assignedTo) && doctor.assignedTo.length > 0) {
    await doctor.populate('assignedTo', 'name email');
  }

  res.status(200).json({
    success: true,
    message: employeeId ? 'Employee assigned to doctor' : 'Employee unassigned from doctor',
    data: doctor,
  });
});

/**
 * @desc    Update target products for a doctor (BDM self-service)
 * @route   PUT /api/doctors/:id/target-products
 * @access  Admin, Employee (owner only)
 */
const updateTargetProducts = catchAsync(async (req, res) => {
  const doctor = await Doctor.findById(req.params.id);
  if (!doctor) {
    throw new NotFoundError('Doctor not found');
  }

  // Ownership check: BDMs can only update their own assigned VIP Clients
  if (req.user.role === ROLES.CONTRACTOR) {
    if (!isAssignedTo(doctor, req.user._id)) {
      throw new ForbiddenError('You can only manage products for your assigned VIP Clients');
    }
  }

  const { targetProducts } = req.body;

  // Validate: max 3 products
  if (!Array.isArray(targetProducts) || targetProducts.length > 3) {
    return res.status(400).json({
      success: false,
      message: 'Target products must be an array with max 3 items',
    });
  }

  // Validate each product entry
  for (const item of targetProducts) {
    if (!item.product || !mongoose.Types.ObjectId.isValid(item.product)) {
      return res.status(400).json({
        success: false,
        message: 'Each target product must have a valid product ID',
      });
    }
    if (item.status && !['showcasing', 'accepted'].includes(item.status)) {
      return res.status(400).json({
        success: false,
        message: 'Product status must be showcasing or accepted',
      });
    }
  }

  // Verify products exist in CRM database
  if (targetProducts.length > 0) {
    const productIds = targetProducts.map((tp) => tp.product);
    const existingProducts = await CrmProduct.find({ _id: { $in: productIds } }).select('_id').lean();
    if (existingProducts.length !== productIds.length) {
      return res.status(400).json({
        success: false,
        message: 'One or more product IDs are invalid',
      });
    }
  }

  doctor.targetProducts = targetProducts.map((tp) => ({
    product: tp.product,
    status: tp.status || 'showcasing',
  }));

  await doctor.save();

  // Populate product data for response
  await doctor.populate('targetProducts.product', 'name category image description');

  res.status(200).json({
    success: true,
    message: 'Target products updated successfully',
    data: {
      _id: doctor._id,
      firstName: doctor.firstName,
      lastName: doctor.lastName,
      fullName: doctor.fullName,
      targetProducts: doctor.targetProducts,
    },
  });
});

/**
 * Get distinct specialization values from all doctors
 */
const getSpecializations = catchAsync(async (req, res) => {
  const specializations = await Specialization.find({ isActive: true })
    .sort({ name: 1 })
    .lean();

  res.status(200).json({
    success: true,
    data: specializations.map((s) => s.name),
  });
});

/**
 * @desc    Get doctors assigned to OR visited by a specific BDM
 * @route   GET /api/doctors/by-bdm/:bdmId
 * @access  Admin, President, Finance
 */
const getDoctorsByBdm = catchAsync(async (req, res) => {
  const bdmId = req.params.bdmId;
  if (!mongoose.Types.ObjectId.isValid(bdmId)) {
    return res.status(400).json({ success: false, message: 'Invalid BDM ID' });
  }
  const oid = new mongoose.Types.ObjectId(bdmId);

  // 1. Doctors assigned to this BDM
  const assigned = await Doctor.find({ assignedTo: oid, isActive: true })
    .select('firstName lastName specialization')
    .lean();

  // 2. Doctor IDs visited by this BDM (not already in assigned set)
  const assignedIds = new Set(assigned.map(d => d._id.toString()));
  const visitedIds = await Visit.distinct('doctor', { user: oid });
  const extraIds = visitedIds.filter(id => !assignedIds.has(id.toString()));

  let visited = [];
  if (extraIds.length) {
    visited = await Doctor.find({ _id: { $in: extraIds }, isActive: true })
      .select('firstName lastName specialization')
      .lean();
  }

  res.status(200).json({ success: true, data: [...assigned, ...visited] });
});

/**
 * GET /api/doctors/name-cleanup/preview
 * Scan all active VIP Clients and return proposed name changes + duplicates.
 * Admin only.
 */
const previewNameCleanup = catchAsync(async (req, res) => {
  const doctors = await Doctor.find({ isActive: true })
    .select('firstName lastName')
    .lean();

  const rules = await loadNameRules(null);
  const changes = generatePreview(doctors, rules);
  const duplicates = findPotentialDuplicates(doctors);

  res.status(200).json({
    success: true,
    data: {
      changes,
      duplicates,
      totalScanned: doctors.length,
    },
  });
});

/**
 * PUT /api/doctors/name-cleanup/apply
 * Apply admin-approved name changes in bulk.
 * Body: { approved: [{ _id, firstName, lastName }] }
 * Admin only.
 */
const applyNameCleanup = catchAsync(async (req, res) => {
  const { approved } = req.body;

  if (!Array.isArray(approved) || approved.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'approved array is required and must not be empty',
    });
  }

  const ops = approved.map((item) => ({
    updateOne: {
      filter: { _id: item._id },
      update: { $set: { firstName: item.firstName, lastName: item.lastName } },
    },
  }));

  const result = await Doctor.bulkWrite(ops, { ordered: false });

  res.status(200).json({
    success: true,
    message: `${result.modifiedCount} VIP Client names updated`,
    data: { modifiedCount: result.modifiedCount },
  });
});

/**
 * @desc    Update a Doctor's partnership_status (LEAD → CONTACTED → VISITED → PARTNER → INACTIVE).
 *          Body shape (matches MdLeadsPage.jsx contract):
 *            {
 *              partnership_status: 'PARTNER',
 *              partner_agreement_date?: '2026-04-26',
 *              partnership_notes?: '...'
 *            }
 *          Authorization cascade:
 *            - PARTNER promotion: requires SET_AGREEMENT_DATE roles (lookup-driven)
 *              AND partner_agreement_date is supplied (3-gate Gate #2 of rebate engine).
 *            - Other transitions: MANAGE_PARTNERSHIP role OR
 *              (BDM owns the record AND target status is in BDM_SELF_TRANSITIONS).
 * @route   PUT /api/doctors/:id/partnership-status
 * @access  Authenticated; controller does the role/ownership cascade
 */
const setPartnershipStatus = catchAsync(async (req, res) => {
  const { id } = req.params;
  const {
    partnership_status: newStatus,
    partner_agreement_date,
    partnership_notes,
  } = req.body || {};

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ success: false, message: 'Invalid doctor ID' });
  }
  if (!newStatus || !PARTNERSHIP_STATUSES.includes(newStatus)) {
    return res.status(400).json({
      success: false,
      message: `partnership_status is required and must be one of: ${PARTNERSHIP_STATUSES.join(', ')}`,
    });
  }

  const doctor = await Doctor.findById(id);
  if (!doctor) throw new NotFoundError('Doctor not found');

  const role = req.user.role;
  const ownsRecord = isAssignedTo(doctor, req.user._id);
  const isBdm = !isAdminLike(role) && role === ROLES.STAFF;

  if (newStatus === 'PARTNER') {
    const setAgreementRoles = await getSetAgreementDateRoles(req.entityId);
    const allowed = isAdminLike(role) || setAgreementRoles.includes(role);
    if (!allowed) {
      throw new ForbiddenError(
        `Promoting to PARTNER requires one of: ${setAgreementRoles.join(', ')}. Your role: ${role}.`,
      );
    }
    if (!partner_agreement_date) {
      return res.status(400).json({
        success: false,
        message: 'partner_agreement_date is required when promoting to PARTNER (rebate gate #2)',
      });
    }
    const parsed = new Date(partner_agreement_date);
    if (Number.isNaN(parsed.getTime())) {
      return res.status(400).json({ success: false, message: 'partner_agreement_date is not a valid date' });
    }
    doctor.partner_agreement_date = parsed;
  } else {
    const manageRoles = await getManagePartnershipRoles(req.entityId);
    const canManageAcrossRecords = isAdminLike(role) || manageRoles.includes(role);
    const canSelfTransition = isBdm && ownsRecord && BDM_SELF_TRANSITIONS.includes(newStatus);
    if (!canManageAcrossRecords && !canSelfTransition) {
      throw new ForbiddenError(
        `Setting partnership_status=${newStatus} requires one of: ${manageRoles.join(', ')} (or BDM ownership for non-PARTNER transitions).`,
      );
    }
    // Optional pre-fill: admin/manage roles can stash partner_agreement_date
    // before the formal PARTNER flip (e.g. to record an agreement-in-progress).
    if (partner_agreement_date !== undefined && canManageAcrossRecords) {
      const parsed = partner_agreement_date ? new Date(partner_agreement_date) : null;
      if (parsed && Number.isNaN(parsed.getTime())) {
        return res.status(400).json({ success: false, message: 'partner_agreement_date is not a valid date' });
      }
      doctor.partner_agreement_date = parsed;
    }
  }

  doctor.partnership_status = newStatus;
  if (partnership_notes !== undefined && typeof partnership_notes === 'string') {
    doctor.partnership_notes = partnership_notes;
  }

  await doctor.save();
  await doctor.populate('assignedTo', 'name email');

  res.status(200).json({
    success: true,
    message: 'Partnership status updated',
    data: doctor,
  });
});

module.exports = {
  getAllDoctors,
  getDoctorById,
  createDoctor,
  updateDoctor,
  deleteDoctor,
  deleteDoctorsByUser,
  countDoctorsByUser,
  getDoctorVisits,
  getDoctorProducts,
  updateTargetProducts,
  getSpecializations,
  getDoctorsByBdm,
  previewNameCleanup,
  applyNameCleanup,
  setPartnershipStatus,
};
