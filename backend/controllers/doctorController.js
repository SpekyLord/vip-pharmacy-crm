/**
 * Doctor Controller
 *
 * Handles doctor CRUD operations with region-based access control
 * Follows CLAUDE.md rules:
 * - Employees can ONLY see doctors in their assigned regions
 * - Admin can see all doctors
 * - visitFrequency: 2 or 4 (NOT A/B/C/D categories)
 */

const mongoose = require('mongoose');
const Doctor = require('../models/Doctor');
const Visit = require('../models/Visit');
const User = require('../models/User');
const Region = require('../models/Region');
const { getWebsiteProductModel } = require('../models/WebsiteProduct');
const { catchAsync, NotFoundError, ForbiddenError } = require('../middleware/errorHandler');

/**
 * Build region filter based on user role
 * - Admin: no filter (see all)
 * - Employee: assigned regions AND all their descendants (child regions)
 *
 * This enables cascading region access:
 * - Employee assigned to Region VI sees doctors in all provinces/cities/districts under Region VI
 */
const getRegionFilter = async (user) => {
  if (user.role === 'admin' && user.canAccessAllRegions) {
    return {}; // No region filter for admin
  }

  // Employees see assigned regions AND all descendant regions
  if (user.assignedRegions && user.assignedRegions.length > 0) {
    const allRegionIds = [];

    // For each assigned region, get all descendant region IDs
    for (const region of user.assignedRegions) {
      // Handle both populated objects and plain ObjectIds
      const regionId = region._id || region;
      const descendants = await Region.getDescendantIds(regionId);
      allRegionIds.push(...descendants);
    }

    // Remove duplicates and convert to ObjectIds for MongoDB query
    const uniqueRegionIds = [...new Set(allRegionIds.map((id) => id.toString()))];
    const objectIdRegions = uniqueRegionIds.map((id) => new mongoose.Types.ObjectId(id));

    return { region: { $in: objectIdRegions } };
  }

  // If no regions assigned, return impossible filter (matches nothing)
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

  // Start with region filter based on user role (includes descendant regions)
  const regionFilter = await getRegionFilter(req.user);
  const filter = { isActive: true, ...regionFilter };

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
    .populate('region', 'name code level')
    .populate('assignedTo', 'name email')
    .sort({ lastName: 1, firstName: 1 });

  if (limit > 0) {
    query = query.skip(skip).limit(limit);
  }

  const [doctors, total] = await Promise.all([
    query,
    Doctor.countDocuments(filter),
  ]);

  res.status(200).json({
    success: true,
    data: doctors,
    pagination: {
      page,
      limit: limit || total, // If no limit, show total as limit
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
    .populate('region', 'name code level')
    .populate('assignedTo', 'name email phone')
    .populate('assignedProducts');

  if (!doctor) {
    throw new NotFoundError('Doctor not found');
  }

  // Check region access for non-admin users
  if (req.user.role !== 'admin') {
    const hasAccess = await req.user.canAccessRegion(doctor.region._id || doctor.region);
    if (!hasAccess) {
      throw new ForbiddenError('You do not have access to this doctor');
    }
  }

  // Manually populate product data from website database
  const doctorObj = doctor.toObject();
  if (doctorObj.assignedProducts && doctorObj.assignedProducts.length > 0) {
    const Product = getWebsiteProductModel();
    const productIds = doctorObj.assignedProducts.map((a) => a.product);
    const products = await Product.find({ _id: { $in: productIds } })
      .select('name category briefDescription image')
      .lean();
    const productMap = new Map(products.map((p) => [p._id.toString(), p]));

    doctorObj.assignedProducts = doctorObj.assignedProducts.map((assignment) => ({
      ...assignment,
      product: productMap.get(assignment.product?.toString()) || { _id: assignment.product },
    }));
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
    region,
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
    region,
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
    'region',
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
    const hasAccess = await req.user.canAccessRegion(regionId);
    if (!hasAccess) {
      throw new ForbiddenError('You do not have access to this region');
    }
  }

  const doctors = await Doctor.find({ region: regionId, isActive: true })
    .populate('region', 'name code level')
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

  // Check region access for non-admin users
  if (req.user.role !== 'admin') {
    const hasAccess = await req.user.canAccessRegion(doctor.region);
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
      .select('name category briefDescription keyBenefits image price')
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
  await doctor.populate('region', 'name code level');

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
