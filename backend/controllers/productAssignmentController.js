/**
 * Product Assignment Controller
 *
 * Handles product-to-doctor assignments
 * Follows CLAUDE.md rules:
 * - Only MedRep can manage assignments
 * - Used to show relevant products during employee visits
 */

const ProductAssignment = require('../models/ProductAssignment');
const { getWebsiteProductModel } = require('../models/WebsiteProduct');
const Doctor = require('../models/Doctor');
const { catchAsync, NotFoundError, ForbiddenError } = require('../middleware/errorHandler');

/**
 * Helper to manually populate product data from website database
 * Mongoose populate() doesn't work across different database connections
 * @param {Array} assignments - Array of assignment documents
 * @param {string} fields - Space-separated field names to include (e.g., 'name category image')
 * @returns {Array} Assignments with populated product data
 */
const populateProductData = async (assignments, fields = 'name category image briefDescription') => {
  if (!assignments || assignments.length === 0) return assignments;

  const Product = getWebsiteProductModel();
  const productIds = [...new Set(assignments.map((a) => a.product?.toString() || a.product))];

  const fieldList = fields.split(' ').join(' ');
  const products = await Product.find({ _id: { $in: productIds } })
    .select(fieldList)
    .lean();

  const productMap = new Map(products.map((p) => [p._id.toString(), p]));

  return assignments.map((assignment) => {
    const assignmentObj = assignment.toObject ? assignment.toObject() : assignment;
    const productId = assignmentObj.product?.toString() || assignmentObj.product;
    assignmentObj.product = productMap.get(productId) || { _id: productId };
    return assignmentObj;
  });
};

/**
 * @desc    Get all assignments with pagination and filters
 * @route   GET /api/assignments
 * @access  MedRep, Admin
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

  // Filter by assigned by (for medrep to see their own assignments)
  if (req.query.assignedBy) {
    filter.assignedBy = req.query.assignedBy;
  }

  // Filter by priority
  if (req.query.priority) {
    filter.priority = parseInt(req.query.priority);
  }

  // Execute query - don't populate 'product' (it's in a different database)
  const [assignments, total] = await Promise.all([
    ProductAssignment.find(filter)
      .populate('doctor', 'firstName lastName specialization clinicOfficeAddress region')
      .populate('assignedBy', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    ProductAssignment.countDocuments(filter),
  ]);

  // Manually populate product data from website database
  const populatedAssignments = await populateProductData(assignments, 'name category briefDescription image');

  res.status(200).json({
    success: true,
    data: populatedAssignments,
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
    .populate('doctor')
    .populate('assignedBy', 'name email');

  if (!assignment) {
    throw new NotFoundError('Assignment not found');
  }

  // Manually populate product data from website database
  const populatedAssignments = await populateProductData([assignment]);

  res.status(200).json({
    success: true,
    data: populatedAssignments[0],
  });
});

/**
 * @desc    Create new assignment
 * @route   POST /api/assignments
 * @access  MedRep only
 */
const createAssignment = catchAsync(async (req, res) => {
  const { product, doctor, priority, notes } = req.body;

  // Verify product exists in website database
  const Product = getWebsiteProductModel();
  const productDoc = await Product.findById(product);
  if (!productDoc || !productDoc.inStock) {
    throw new NotFoundError('Product not found or out of stock');
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

  // Populate doctor and assignedBy from CRM database
  await assignment.populate('doctor', 'firstName lastName specialization clinicOfficeAddress');
  await assignment.populate('assignedBy', 'name email');

  // Manually attach product data from website database (already fetched above)
  const assignmentData = assignment.toObject();
  assignmentData.product = {
    _id: productDoc._id,
    name: productDoc.name,
    category: productDoc.category,
    briefDescription: productDoc.briefDescription || productDoc.description,
    image: productDoc.image,
  };

  res.status(201).json({
    success: true,
    message: 'Product assigned to doctor successfully',
    data: assignmentData,
  });
});

/**
 * @desc    Update assignment
 * @route   PUT /api/assignments/:id
 * @access  MedRep only
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
  await assignment.populate('doctor', 'firstName lastName specialization clinicOfficeAddress');
  await assignment.populate('assignedBy', 'name email');

  // Manually populate product data from website database
  const populatedAssignments = await populateProductData([assignment], 'name category briefDescription image');

  res.status(200).json({
    success: true,
    message: 'Assignment updated successfully',
    data: populatedAssignments[0],
  });
});

/**
 * @desc    Deactivate assignment
 * @route   DELETE /api/assignments/:id
 * @access  MedRep only
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
    .populate('assignedBy', 'name')
    .sort({ priority: 1 });

  // Manually populate product data from website database
  const populatedAssignments = await populateProductData(
    assignments,
    'name category briefDescription keyBenefits usageInformation image price'
  );

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
      assignments: populatedAssignments,
    },
    count: populatedAssignments.length,
  });
});

/**
 * @desc    Get assignments for a product
 * @route   GET /api/assignments/product/:productId
 * @access  MedRep, Admin
 */
const getAssignmentsByProduct = catchAsync(async (req, res) => {
  const { productId } = req.params;

  const Product = getWebsiteProductModel();
  const product = await Product.findById(productId);
  if (!product) {
    throw new NotFoundError('Product not found');
  }

  const assignments = await ProductAssignment.find({
    product: productId,
    status: 'active',
  })
    .populate('doctor', 'firstName lastName specialization clinicOfficeAddress region')
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
 * @access  MedRep only
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
 * @desc    Get my assignments (for MedRep)
 * @route   GET /api/assignments/my
 * @access  MedRep
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
      .populate('doctor', 'firstName lastName specialization clinicOfficeAddress')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    ProductAssignment.countDocuments(filter),
  ]);

  // Manually populate product data from website database
  const populatedAssignments = await populateProductData(assignments, 'name category image');

  res.status(200).json({
    success: true,
    data: populatedAssignments,
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
