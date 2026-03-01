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
const User = require('../models/User');
const { getWebsiteProductModel } = require('../models/WebsiteProduct');
const { catchAsync, NotFoundError, ForbiddenError } = require('../middleware/errorHandler');

/**
 * Build access filter based on user role
 * - Admin: no filter (see all)
 * - Employee (BDM): only doctors assigned to them via assignedTo field
 */
const getRegionFilter = (user) => {
  if (user.role === 'admin') {
    return {}; // No filter for admin
  }

  // BDMs see only doctors assigned to them (set by CPT import)
  if (user.role === 'employee') {
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

  // Search by firstName, lastName, or clinicOfficeAddress
  if (req.query.search) {
    filter.$or = [
      { firstName: { $regex: req.query.search, $options: 'i' } },
      { lastName: { $regex: req.query.search, $options: 'i' } },
      { clinicOfficeAddress: { $regex: req.query.search, $options: 'i' } },
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
  // Note: Products are in a separate database, so we can't use Mongoose populate
  // We populate assignedProducts (ProductAssignment), then manually fetch product data
  const doctor = await Doctor.findById(req.params.id)
    .populate('assignedTo', 'name email phone')
    .populate('assignedProducts');

  if (!doctor) {
    throw new NotFoundError('Doctor not found');
  }

  // Check access for non-admin users: BDMs can only see doctors assigned to them
  if (req.user.role === 'employee') {
    const assignedToId = doctor.assignedTo?._id || doctor.assignedTo;
    if (!assignedToId || assignedToId.toString() !== req.user._id.toString()) {
      throw new ForbiddenError('You do not have access to this VIP Client');
    }
  }

  // Manually populate product data from website database
  const doctorObj = doctor.toObject();

  // Collect all product IDs from both assignedProducts and targetProducts
  const allProductIds = [];
  if (doctorObj.assignedProducts?.length > 0) {
    allProductIds.push(...doctorObj.assignedProducts.map((a) => a.product));
  }
  if (doctorObj.targetProducts?.length > 0) {
    allProductIds.push(...doctorObj.targetProducts.map((tp) => tp.product).filter(Boolean));
  }

  // Single query for all product data
  if (allProductIds.length > 0) {
    const Product = getWebsiteProductModel();
    const uniqueIds = [...new Set(allProductIds.map((id) => id.toString()))];
    const products = await Product.find({ _id: { $in: uniqueIds } })
      .select('name genericName dosage category image price description usage safety')
      .lean();
    const productMap = new Map(products.map((p) => [p._id.toString(), p]));

    if (doctorObj.assignedProducts?.length > 0) {
      doctorObj.assignedProducts = doctorObj.assignedProducts.map((assignment) => ({
        ...assignment,
        product: productMap.get(assignment.product?.toString()) || { _id: assignment.product },
      }));
    }

    if (doctorObj.targetProducts?.length > 0) {
      doctorObj.targetProducts = doctorObj.targetProducts.map((tp) => ({
        ...tp,
        product: productMap.get(tp.product?.toString()) || { _id: tp.product },
      }));
    }
  }

  res.status(200).json({
    success: true,
    data: doctorObj,
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
  if (req.user.role === 'employee') {
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
  ];
  const employeeAllowedFields = adminAllowedFields.filter(
    (f) => !['assignedTo', 'isActive', 'isVipAssociated'].includes(f)
  );
  const allowedFields = req.user.role === 'admin' ? adminAllowedFields : employeeAllowedFields;

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

  const filter = { region: regionId, isActive: true };

  // BDMs only see their assigned doctors even when filtering by region
  if (req.user.role === 'employee') {
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
  if (req.user.role === 'employee') {
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
  // Note: Products are in a separate database, so we can't use Mongoose populate
  const doctor = await Doctor.findById(req.params.id).populate({
    path: 'assignedProducts',
    match: { status: 'active' },
  });

  if (!doctor) {
    throw new NotFoundError('Doctor not found');
  }

  // Manually populate product data from website database
  let assignedProducts = doctor.assignedProducts || [];
  if (assignedProducts.length > 0) {
    const Product = getWebsiteProductModel();
    const productIds = assignedProducts.map((a) => a.product);
    const products = await Product.find({ _id: { $in: productIds } })
      .select('name genericName dosage category image price description usage safety')
      .lean();
    const productMap = new Map(products.map((p) => [p._id.toString(), p]));

    assignedProducts = assignedProducts.map((assignment) => {
      const assignmentObj = assignment.toObject ? assignment.toObject() : assignment;
      return {
        ...assignmentObj,
        product: productMap.get(assignmentObj.product?.toString()) || { _id: assignmentObj.product },
      };
    });
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
      products: assignedProducts,
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
  if (req.user.role === 'employee') {
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

  // Verify products exist in website database
  if (targetProducts.length > 0) {
    const Product = getWebsiteProductModel();
    const productIds = targetProducts.map((tp) => tp.product);
    const existingProducts = await Product.find({ _id: { $in: productIds } }).select('_id').lean();
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
  let populatedProducts = [];
  if (doctor.targetProducts.length > 0) {
    const Product = getWebsiteProductModel();
    const productIds = doctor.targetProducts.map((tp) => tp.product);
    const products = await Product.find({ _id: { $in: productIds } })
      .select('name category image briefDescription')
      .lean();
    const productMap = new Map(products.map((p) => [p._id.toString(), p]));

    populatedProducts = doctor.targetProducts.map((tp) => ({
      product: productMap.get(tp.product.toString()) || { _id: tp.product },
      status: tp.status,
    }));
  }

  res.status(200).json({
    success: true,
    message: 'Target products updated successfully',
    data: {
      _id: doctor._id,
      firstName: doctor.firstName,
      lastName: doctor.lastName,
      fullName: doctor.fullName,
      targetProducts: populatedProducts,
    },
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
  updateTargetProducts,
};
