/**
 * Doctor Controller
 *
 * Handles doctor CRUD operations with region-based access control
 * Follows CLAUDE.md rules:
 * - Employees can ONLY see doctors in their assigned regions
 * - Admin can see all doctors
 * - visitFrequency: 2 or 4 (NOT A/B/C/D categories)
 */

const Doctor = require('../models/Doctor');
const Visit = require('../models/Visit');
const User = require('../models/User');
const { catchAsync, NotFoundError, ForbiddenError } = require('../middleware/errorHandler');

/**
 * Build region filter based on user role
 * - Admin: no filter (see all)
 * - Employee: only assigned regions
 */
const getRegionFilter = (user) => {
  if (user.role === 'admin' && user.canAccessAllRegions) {
    return {}; // No region filter for admin
  }
  // Employees and medreps see only assigned regions
  if (user.assignedRegions && user.assignedRegions.length > 0) {
    return { region: { $in: user.assignedRegions } };
  }
  // If no regions assigned, return empty (no access)
  return { region: null };
};

/**
 * @desc    Get all doctors with pagination and filters
 * @route   GET /api/doctors
 * @access  All authenticated users (filtered by region for employees)
 */
const getAllDoctors = catchAsync(async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 20;
  const skip = (page - 1) * limit;

  // Start with region filter based on user role
  const filter = { isActive: true, ...getRegionFilter(req.user) };

  // Filter by specific region
  if (req.query.region) {
    filter.region = req.query.region;
  }

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

  // Search by name or hospital
  if (req.query.search) {
    filter.$or = [
      { name: { $regex: req.query.search, $options: 'i' } },
      { hospital: { $regex: req.query.search, $options: 'i' } },
    ];
  }

  // Execute query
  const [doctors, total] = await Promise.all([
    Doctor.find(filter)
      .populate('region', 'name code level')
      .populate('assignedTo', 'name email')
      .sort({ name: 1 })
      .skip(skip)
      .limit(limit),
    Doctor.countDocuments(filter),
  ]);

  res.status(200).json({
    success: true,
    data: doctors,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
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
    .populate('region', 'name code level')
    .populate('assignedTo', 'name email phone')
    .populate({
      path: 'assignedProducts',
      populate: { path: 'product', select: 'name category briefDescription image' },
    });

  if (!doctor) {
    throw new NotFoundError('Doctor not found');
  }

  // Check region access for non-admin users
  if (req.user.role !== 'admin') {
    const hasAccess = req.user.canAccessRegion(doctor.region._id || doctor.region);
    if (!hasAccess) {
      throw new ForbiddenError('You do not have access to this doctor');
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
 * @access  Admin, MedRep
 */
const createDoctor = catchAsync(async (req, res) => {
  const {
    name,
    specialization,
    hospital,
    address,
    region,
    phone,
    email,
    visitFrequency,
    assignedTo,
    notes,
    clinicSchedule,
    location,
  } = req.body;

  const doctor = await Doctor.create({
    name,
    specialization,
    hospital,
    address,
    region,
    phone,
    email,
    visitFrequency: visitFrequency || 4,
    assignedTo,
    notes,
    clinicSchedule,
    location,
  });

  await doctor.populate('region', 'name code level');
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
 * @access  Admin, MedRep
 */
const updateDoctor = catchAsync(async (req, res) => {
  const doctor = await Doctor.findById(req.params.id);

  if (!doctor) {
    throw new NotFoundError('Doctor not found');
  }

  // Allowed fields to update
  const allowedFields = [
    'name',
    'specialization',
    'hospital',
    'address',
    'region',
    'phone',
    'email',
    'visitFrequency',
    'assignedTo',
    'notes',
    'clinicSchedule',
    'location',
    'isActive',
  ];

  // Update only allowed fields
  allowedFields.forEach((field) => {
    if (req.body[field] !== undefined) {
      doctor[field] = req.body[field];
    }
  });

  await doctor.save();
  await doctor.populate('region', 'name code level');
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
 * @desc    Deactivate doctor (soft delete)
 * @route   DELETE /api/doctors/:id
 * @access  Admin only
 */
const deleteDoctor = catchAsync(async (req, res) => {
  const doctor = await Doctor.findById(req.params.id);

  if (!doctor) {
    throw new NotFoundError('Doctor not found');
  }

  doctor.isActive = false;
  await doctor.save();

  res.status(200).json({
    success: true,
    message: 'Doctor deactivated successfully',
  });
});

/**
 * @desc    Get doctors by region
 * @route   GET /api/doctors/region/:regionId
 * @access  All authenticated users
 */
const getDoctorsByRegion = catchAsync(async (req, res) => {
  const { regionId } = req.params;

  // Check if user has access to this region
  if (req.user.role !== 'admin') {
    const hasAccess = req.user.canAccessRegion(regionId);
    if (!hasAccess) {
      throw new ForbiddenError('You do not have access to this region');
    }
  }

  const doctors = await Doctor.find({ region: regionId, isActive: true })
    .populate('region', 'name code level')
    .populate('assignedTo', 'name email')
    .sort({ name: 1 });

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

  // Check region access for non-admin users
  if (req.user.role !== 'admin') {
    const hasAccess = req.user.canAccessRegion(doctor.region);
    if (!hasAccess) {
      throw new ForbiddenError('You do not have access to this doctor');
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
        name: doctor.name,
        specialization: doctor.specialization,
        hospital: doctor.hospital,
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
  const doctor = await Doctor.findById(req.params.id).populate({
    path: 'assignedProducts',
    match: { status: 'active' },
    populate: {
      path: 'product',
      select: 'name category briefDescription keyBenefits image price',
    },
  });

  if (!doctor) {
    throw new NotFoundError('Doctor not found');
  }

  res.status(200).json({
    success: true,
    data: {
      doctor: {
        _id: doctor._id,
        name: doctor.name,
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
    const employee = await User.findOne({ _id: employeeId, role: 'employee', isActive: true });
    if (!employee) {
      throw new NotFoundError('Employee not found or inactive');
    }
  }

  doctor.assignedTo = employeeId || null;
  await doctor.save();

  if (doctor.assignedTo) {
    await doctor.populate('assignedTo', 'name email');
  }
  await doctor.populate('region', 'name code level');

  res.status(200).json({
    success: true,
    message: employeeId ? 'Employee assigned to doctor' : 'Employee unassigned from doctor',
    data: doctor,
  });
});

module.exports = {
  getAllDoctors,
  getDoctorById,
  createDoctor,
  updateDoctor,
  deleteDoctor,
  getDoctorsByRegion,
  getDoctorVisits,
  getDoctorProducts,
  assignEmployee,
};
