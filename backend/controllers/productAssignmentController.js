/**
 * Product Assignment Controller
 *
 * Handles product-to-doctor assignments
 * Follows CLAUDE.md rules:
 * - Admin can manage assignments
 * - Used to show relevant products during BDM visits
 */

const ProductAssignment = require('../models/ProductAssignment');
const CrmProduct = require('../models/CrmProduct');
const Doctor = require('../models/Doctor');
const { catchAsync, NotFoundError, ForbiddenError } = require('../middleware/errorHandler');

/**
 * @desc    Get all assignments with pagination and filters
 * @route   GET /api/assignments
 * @access  Admin, Employee
 */
const getAllAssignments = catchAsync(async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 20;
  const skip = (page - 1) * limit;

  // Build filter query
  const filter = {};

  // Filter by status
  if (req.query.status) {
    filter.status = req.query.status;
  } else {
    filter.status = 'active'; // Default to active
  }

  // Filter by product
  if (req.query.product) {
    filter.product = req.query.product;
  }

  // Filter by doctor
  if (req.query.doctor) {
    filter.doctor = req.query.doctor;
  }

  // Filter by assigned by (for admin to see their own assignments)
  if (req.query.assignedBy) {
    filter.assignedBy = req.query.assignedBy;
  }

  // Filter by priority
  if (req.query.priority) {
    filter.priority = parseInt(req.query.priority);
  }

  const [assignments, total] = await Promise.all([
    ProductAssignment.find(filter)
      .populate('product', 'name category image description')
      .populate('doctor', 'firstName lastName specialization clinicOfficeAddress locality province')
      .populate('assignedBy', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    ProductAssignment.countDocuments(filter),
  ]);

  res.status(200).json({
    success: true,
    data: assignments,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  });
});

/**
 * @desc    Get assignment by ID
 * @route   GET /api/assignments/:id
 * @access  All authenticated users
 */
const getAssignmentById = catchAsync(async (req, res) => {
  const assignment = await ProductAssignment.findById(req.params.id)
    .populate('product', 'name category image description')
    .populate('doctor')
    .populate('assignedBy', 'name email');

  if (!assignment) {
    throw new NotFoundError('Assignment not found');
  }

  res.status(200).json({
    success: true,
    data: assignment,
  });
});

/**
 * @desc    Create new assignment
 * @route   POST /api/assignments
 * @access  Admin only
 */
const createAssignment = catchAsync(async (req, res) => {
  const { product, doctor, priority, notes } = req.body;

  // Verify product exists and is active
  const productDoc = await CrmProduct.findById(product);
  if (!productDoc || !productDoc.isActive) {
    throw new NotFoundError('Product not found or inactive');
  }

  // Verify doctor exists and is active
  const doctorDoc = await Doctor.findById(doctor);
  if (!doctorDoc || !doctorDoc.isActive) {
    throw new NotFoundError('Doctor not found or inactive');
  }

  // Check if already assigned
  const existingAssignment = await ProductAssignment.findOne({
    product,
    doctor,
    status: 'active',
  });

  if (existingAssignment) {
    throw new ForbiddenError('Product is already assigned to this doctor');
  }

  const assignment = await ProductAssignment.create({
    product,
    doctor,
    assignedBy: req.user._id,
    priority: priority || 2,
    notes,
  });

  await assignment.populate('product', 'name category image description');
  await assignment.populate('doctor', 'firstName lastName specialization clinicOfficeAddress locality province');
  await assignment.populate('assignedBy', 'name email');

  res.status(201).json({
    success: true,
    message: 'Product assigned to doctor successfully',
    data: assignment,
  });
});

/**
 * @desc    Update assignment
 * @route   PUT /api/assignments/:id
 * @access  Admin only
 */
const updateAssignment = catchAsync(async (req, res) => {
  const assignment = await ProductAssignment.findById(req.params.id);

  if (!assignment) {
    throw new NotFoundError('Assignment not found');
  }

  // Only allow updating priority and notes
  if (req.body.priority !== undefined) {
    assignment.priority = req.body.priority;
  }
  if (req.body.notes !== undefined) {
    assignment.notes = req.body.notes;
  }

  await assignment.save();
  await assignment.populate('product', 'name category image description');
  await assignment.populate('doctor', 'firstName lastName specialization clinicOfficeAddress locality province');
  await assignment.populate('assignedBy', 'name email');

  res.status(200).json({
    success: true,
    message: 'Assignment updated successfully',
    data: assignment,
  });
});

/**
 * @desc    Deactivate assignment
 * @route   DELETE /api/assignments/:id
 * @access  Admin only
 */
const deleteAssignment = catchAsync(async (req, res) => {
  const { reason } = req.body;

  const assignment = await ProductAssignment.findById(req.params.id);

  if (!assignment) {
    throw new NotFoundError('Assignment not found');
  }

  if (assignment.status === 'inactive') {
    throw new ForbiddenError('Assignment is already inactive');
  }

  await assignment.deactivate(req.user._id, reason);

  res.status(200).json({
    success: true,
    message: 'Assignment deactivated successfully',
  });
});

/**
 * @desc    Get assignments for a doctor
 * @route   GET /api/assignments/doctor/:doctorId
 * @access  All authenticated users
 */
const getAssignmentsByDoctor = catchAsync(async (req, res) => {
  const { doctorId } = req.params;

  const doctor = await Doctor.findById(doctorId);
  if (!doctor) {
    throw new NotFoundError('Doctor not found');
  }

  const assignments = await ProductAssignment.find({
    doctor: doctorId,
    status: 'active',
  })
    .populate('product', 'name genericName dosage category image description usage safety')
    .populate('assignedBy', 'name')
    .sort({ priority: 1 });

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
      assignments,
    },
    count: assignments.length,
  });
});

/**
 * @desc    Get assignments for a product
 * @route   GET /api/assignments/product/:productId
 * @access  Admin
 */
const getAssignmentsByProduct = catchAsync(async (req, res) => {
  const { productId } = req.params;

  const product = await CrmProduct.findById(productId);
  if (!product) {
    throw new NotFoundError('Product not found');
  }

  const assignments = await ProductAssignment.find({
    product: productId,
    status: 'active',
  })
    .populate('doctor', 'firstName lastName specialization clinicOfficeAddress locality province')
    .populate('assignedBy', 'name')
    .sort({ priority: 1 });

  res.status(200).json({
    success: true,
    data: {
      product: {
        _id: product._id,
        name: product.name,
        category: product.category,
      },
      assignments,
    },
    count: assignments.length,
  });
});

/**
 * @desc    Bulk assign products to a doctor
 * @route   POST /api/assignments/bulk
 * @access  Admin only
 */
const bulkAssign = catchAsync(async (req, res) => {
  const { doctorId, productIds, priority } = req.body;

  if (!doctorId || !productIds || !Array.isArray(productIds) || productIds.length === 0) {
    throw new ForbiddenError('Doctor ID and product IDs array are required');
  }

  // Validate array size to prevent abuse
  if (productIds.length > 100) {
    throw new ForbiddenError('Maximum 100 products per bulk assignment');
  }

  // Verify doctor exists
  const doctor = await Doctor.findById(doctorId);
  if (!doctor || !doctor.isActive) {
    throw new NotFoundError('Doctor not found or inactive');
  }

  // Get existing active assignments for this doctor
  const existingAssignments = await ProductAssignment.find({
    doctor: doctorId,
    product: { $in: productIds },
    status: 'active',
  }).select('product');

  const existingProductIds = existingAssignments.map((a) => a.product.toString());

  // Filter out already assigned products
  const newProductIds = productIds.filter((id) => !existingProductIds.includes(id));

  if (newProductIds.length === 0) {
    return res.status(200).json({
      success: true,
      message: 'All products are already assigned to this doctor',
      data: {
        created: 0,
        skipped: productIds.length,
      },
    });
  }

  // Create assignments for new products
  const assignments = newProductIds.map((productId) => ({
    product: productId,
    doctor: doctorId,
    assignedBy: req.user._id,
    priority: priority || 2,
    status: 'active',
  }));

  const created = await ProductAssignment.insertMany(assignments, { ordered: false });

  res.status(201).json({
    success: true,
    message: `${created.length} products assigned to doctor`,
    data: {
      created: created.length,
      skipped: productIds.length - newProductIds.length,
    },
  });
});

/**
 * @desc    Get my assignments (for current user)
 * @route   GET /api/assignments/my
 * @access  Admin, Employee
 */
const getMyAssignments = catchAsync(async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 20;
  const skip = (page - 1) * limit;

  const filter = {
    assignedBy: req.user._id,
    status: req.query.status || 'active',
  };

  const [assignments, total] = await Promise.all([
    ProductAssignment.find(filter)
      .populate('product', 'name category image')
      .populate('doctor', 'firstName lastName specialization clinicOfficeAddress locality province')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    ProductAssignment.countDocuments(filter),
  ]);

  res.status(200).json({
    success: true,
    data: assignments,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  });
});

module.exports = {
  getAllAssignments,
  getAssignmentById,
  createAssignment,
  updateAssignment,
  deleteAssignment,
  getAssignmentsByDoctor,
  getAssignmentsByProduct,
  bulkAssign,
  getMyAssignments,
};
