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

  // Search by firstName, lastName, or clinicOfficeAddress
  if (req.query.search) {
    const safeSearch = sanitizeSearchString(req.query.search);
    filter.$or = [
      { firstName: { $regex: safeSearch, $options: 'i' } },
      { lastName: { $regex: safeSearch, $options: 'i' } },
      { clinicOfficeAddress: { $regex: safeSearch, $options: 'i' } },
    ];
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
    const assignedToId = doctor.assignedTo?._id || doctor.assignedTo;
    if (!assignedToId || assignedToId.toString() !== req.user._id.toString()) {
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
 */
const createDoctor = catchAsync(async (req, res) => {
  const {
    firstName,
    lastName,
    specialization,
    clinicOfficeAddress,
    phone,
    email,
    visitFrequency,
    assignedTo,
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
  } = req.body;

  const doctor = await Doctor.create({
    firstName,
    lastName,
    specialization,
    clinicOfficeAddress,
    phone,
    email,
    visitFrequency: visitFrequency || 4,
    assignedTo,
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
  });

  if (doctor.assignedTo) {
    await doctor.populate('assignedTo', 'name email');
  }

  res.status(201).json({
    success: true,
    message: 'Doctor created successfully',
    data: doctor,
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
    const assignedToId = doctor.assignedTo?._id || doctor.assignedTo;
    if (!assignedToId || assignedToId.toString() !== req.user._id.toString()) {
      throw new ForbiddenError('You can only edit VIP Clients assigned to you');
    }
  }

  // Allowed fields to update - BDMs cannot change assignedTo, isActive, isVipAssociated
  const adminAllowedFields = [
    'firstName',
    'lastName',
    'specialization',
    'clinicOfficeAddress',
    'phone',
    'email',
    'visitFrequency',
    'assignedTo',
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
  ];
  const employeeAllowedFields = adminAllowedFields.filter(
    (f) => !['assignedTo', 'isActive', 'isVipAssociated'].includes(f)
  );
  const allowedFields = isAdminLike(req.user.role) ? adminAllowedFields : employeeAllowedFields;

  // Update only allowed fields
  allowedFields.forEach((field) => {
    if (req.body[field] !== undefined) {
      doctor[field] = req.body[field];
    }
  });

  await doctor.save();
  if (doctor.assignedTo) {
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
    const assignedToId = doctor.assignedTo?._id || doctor.assignedTo;
    if (!assignedToId || assignedToId.toString() !== req.user._id.toString()) {
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

  doctor.assignedTo = employeeId || null;
  await doctor.save();

  if (doctor.assignedTo) {
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
    const assignedToId = doctor.assignedTo?._id || doctor.assignedTo;
    if (!assignedToId || assignedToId.toString() !== req.user._id.toString()) {
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

module.exports = {
  getAllDoctors,
  getDoctorById,
  createDoctor,
  updateDoctor,
  deleteDoctor,
  deleteDoctorsByUser,
  countDoctorsByUser,
  getDoctorsByRegion,
  getDoctorVisits,
  getDoctorProducts,
  assignEmployee,
  updateTargetProducts,
  getSpecializations,
  getDoctorsByBdm,
};
