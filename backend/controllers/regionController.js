/**
 * Region Controller
 *
 * Handles region/territory management
 * Follows CLAUDE.md rules:
 * - Admin can manage regions
 * - Hierarchical structure (country > province > city > district > area)
 * - Used for employee assignment and doctor filtering
 */

const Region = require('../models/Region');
const Doctor = require('../models/Doctor');
const User = require('../models/User');
const { catchAsync, NotFoundError, ForbiddenError } = require('../middleware/errorHandler');

/**
 * @desc    Get all regions with filters
 * @route   GET /api/regions
 * @access  All authenticated users
 */
const getAllRegions = catchAsync(async (req, res) => {
  const filter = { isActive: true };

  // Filter by level
  if (req.query.level) {
    filter.level = req.query.level;
  }

  // Filter by parent
  if (req.query.parent) {
    filter.parent = req.query.parent;
  }

  // Get root regions (no parent)
  if (req.query.root === 'true') {
    filter.parent = null;
  }

  // Search by name
  if (req.query.search) {
    filter.name = { $regex: req.query.search, $options: 'i' };
  }

  const regions = await Region.find(filter)
    .populate('parent', 'name code level')
    .sort({ level: 1, name: 1 });

  res.status(200).json({
    success: true,
    data: regions,
    count: regions.length,
  });
});

/**
 * @desc    Get region by ID
 * @route   GET /api/regions/:id
 * @access  All authenticated users
 */
const getRegionById = catchAsync(async (req, res) => {
  const region = await Region.findById(req.params.id)
    .populate('parent', 'name code level')
    .populate({
      path: 'children',
      match: { isActive: true },
      select: 'name code level',
    });

  if (!region) {
    throw new NotFoundError('Region not found');
  }

  // Get full path
  const fullPath = await region.getFullPath();

  res.status(200).json({
    success: true,
    data: {
      ...region.toJSON(),
      fullPath,
    },
  });
});

/**
 * @desc    Create new region
 * @route   POST /api/regions
 * @access  Admin only
 */
const createRegion = catchAsync(async (req, res) => {
  const { name, code, parent, level, description } = req.body;

  // If parent is specified, verify it exists
  if (parent) {
    const parentRegion = await Region.findById(parent);
    if (!parentRegion) {
      throw new NotFoundError('Parent region not found');
    }
  }

  const region = await Region.create({
    name,
    code,
    parent: parent || null,
    level,
    description,
  });

  if (region.parent) {
    await region.populate('parent', 'name code level');
  }

  res.status(201).json({
    success: true,
    message: 'Region created successfully',
    data: region,
  });
});

/**
 * @desc    Update region
 * @route   PUT /api/regions/:id
 * @access  Admin only
 */
const updateRegion = catchAsync(async (req, res) => {
  const region = await Region.findById(req.params.id);

  if (!region) {
    throw new NotFoundError('Region not found');
  }

  // Allowed fields to update
  const allowedFields = ['name', 'code', 'parent', 'level', 'description', 'isActive'];

  // Update only allowed fields
  allowedFields.forEach((field) => {
    if (req.body[field] !== undefined) {
      region[field] = req.body[field];
    }
  });

  await region.save();

  if (region.parent) {
    await region.populate('parent', 'name code level');
  }

  res.status(200).json({
    success: true,
    message: 'Region updated successfully',
    data: region,
  });
});

/**
 * @desc    Deactivate region
 * @route   DELETE /api/regions/:id
 * @access  Admin only
 */
const deleteRegion = catchAsync(async (req, res) => {
  const region = await Region.findById(req.params.id);

  if (!region) {
    throw new NotFoundError('Region not found');
  }

  // Check if region has child regions
  const childCount = await Region.countDocuments({ parent: region._id, isActive: true });
  if (childCount > 0) {
    throw new ForbiddenError(
      `Cannot deactivate region with ${childCount} active child regions. Deactivate children first.`
    );
  }

  // Check if region has doctors
  const doctorCount = await Doctor.countDocuments({ region: region._id, isActive: true });
  if (doctorCount > 0) {
    throw new ForbiddenError(
      `Cannot deactivate region with ${doctorCount} active doctors. Reassign doctors first.`
    );
  }

  region.isActive = false;
  await region.save();

  res.status(200).json({
    success: true,
    message: 'Region deactivated successfully',
  });
});

/**
 * @desc    Get region hierarchy (tree structure)
 * @route   GET /api/regions/hierarchy
 * @access  All authenticated users
 */
const getRegionHierarchy = catchAsync(async (req, res) => {
  const hierarchy = await Region.getHierarchy();

  res.status(200).json({
    success: true,
    data: hierarchy,
  });
});

/**
 * @desc    Get child regions
 * @route   GET /api/regions/:id/children
 * @access  All authenticated users
 */
const getChildRegions = catchAsync(async (req, res) => {
  const parentRegion = await Region.findById(req.params.id);

  if (!parentRegion) {
    throw new NotFoundError('Parent region not found');
  }

  const children = await Region.find({
    parent: req.params.id,
    isActive: true,
  })
    .select('name code level')
    .sort({ name: 1 });

  res.status(200).json({
    success: true,
    data: {
      parent: {
        _id: parentRegion._id,
        name: parentRegion.name,
        code: parentRegion.code,
        level: parentRegion.level,
      },
      children,
    },
    count: children.length,
  });
});

/**
 * @desc    Get region statistics
 * @route   GET /api/regions/:id/stats
 * @access  Admin
 */
const getRegionStats = catchAsync(async (req, res) => {
  const region = await Region.findById(req.params.id);

  if (!region) {
    throw new NotFoundError('Region not found');
  }

  // Get all descendant region IDs
  const regionIds = await Region.getDescendantIds(region._id);

  // Count doctors in this region and descendants
  const doctorCount = await Doctor.countDocuments({
    region: { $in: regionIds },
    isActive: true,
  });

  // Count employees assigned to this region
  const employeeCount = await User.countDocuments({
    assignedRegions: region._id,
    role: 'employee',
    isActive: true,
  });

  // Count child regions
  const childCount = await Region.countDocuments({
    parent: region._id,
    isActive: true,
  });

  // Get doctors by visit frequency
  const doctorsByFrequency = await Doctor.aggregate([
    { $match: { region: { $in: regionIds }, isActive: true } },
    { $group: { _id: '$visitFrequency', count: { $sum: 1 } } },
  ]);

  res.status(200).json({
    success: true,
    data: {
      region: {
        _id: region._id,
        name: region.name,
        code: region.code,
        level: region.level,
      },
      stats: {
        doctorCount,
        employeeCount,
        childRegionCount: childCount,
        doctorsByFrequency: doctorsByFrequency.reduce((acc, curr) => {
          acc[`frequency${curr._id}`] = curr.count;
          return acc;
        }, {}),
      },
    },
  });
});

/**
 * @desc    Get regions by level
 * @route   GET /api/regions/level/:level
 * @access  All authenticated users
 */
const getRegionsByLevel = catchAsync(async (req, res) => {
  const { level } = req.params;

  const validLevels = ['country', 'province', 'city', 'district', 'area'];
  if (!validLevels.includes(level)) {
    throw new ForbiddenError('Invalid region level');
  }

  const regions = await Region.find({ level, isActive: true })
    .populate('parent', 'name code')
    .sort({ name: 1 });

  res.status(200).json({
    success: true,
    data: regions,
    count: regions.length,
  });
});

module.exports = {
  getAllRegions,
  getRegionById,
  createRegion,
  updateRegion,
  deleteRegion,
  getRegionHierarchy,
  getChildRegions,
  getRegionStats,
  getRegionsByLevel,
};
