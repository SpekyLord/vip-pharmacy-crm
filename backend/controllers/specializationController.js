const Specialization = require('../models/Specialization');
const Doctor = require('../models/Doctor');
const CrmProduct = require('../models/CrmProduct');
const { catchAsync } = require('../middleware/errorHandler');

/**
 * GET /api/specializations
 * Returns all specializations (optionally filtered by isActive)
 */
const getAllSpecializations = catchAsync(async (req, res) => {
  const filter = {};
  if (req.query.active === 'true') filter.isActive = true;
  if (req.query.active === 'false') filter.isActive = false;

  const specializations = await Specialization.find(filter)
    .sort({ name: 1 })
    .lean();

  res.json({
    success: true,
    data: specializations,
  });
});

/**
 * POST /api/specializations
 * Admin creates a new specialization
 */
const createSpecialization = catchAsync(async (req, res) => {
  const { name } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({
      success: false,
      message: 'Specialization name is required',
    });
  }

  // Check for duplicate (case-insensitive)
  const existing = await Specialization.findOne({
    name: { $regex: new RegExp(`^${name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
  });

  if (existing) {
    return res.status(409).json({
      success: false,
      message: `Specialization "${existing.name}" already exists`,
    });
  }

  const specialization = await Specialization.create({ name: name.trim() });

  res.status(201).json({
    success: true,
    message: 'Specialization created successfully',
    data: specialization,
  });
});

/**
 * PUT /api/specializations/:id
 * Admin updates a specialization
 */
const updateSpecialization = catchAsync(async (req, res) => {
  const { name, isActive } = req.body;
  const specialization = await Specialization.findById(req.params.id);

  if (!specialization) {
    return res.status(404).json({
      success: false,
      message: 'Specialization not found',
    });
  }

  if (name !== undefined) {
    if (!name.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Specialization name cannot be empty',
      });
    }

    // Check duplicate on rename
    const existing = await Specialization.findOne({
      _id: { $ne: specialization._id },
      name: { $regex: new RegExp(`^${name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
    });

    if (existing) {
      return res.status(409).json({
        success: false,
        message: `Specialization "${existing.name}" already exists`,
      });
    }

    specialization.name = name.trim();
  }

  if (isActive !== undefined) {
    specialization.isActive = isActive;
  }

  await specialization.save();

  res.json({
    success: true,
    message: 'Specialization updated successfully',
    data: specialization,
  });
});

/**
 * DELETE /api/specializations/:id
 * Soft delete — sets isActive to false
 */
const deleteSpecialization = catchAsync(async (req, res) => {
  const specialization = await Specialization.findById(req.params.id);

  if (!specialization) {
    return res.status(404).json({
      success: false,
      message: 'Specialization not found',
    });
  }

  specialization.isActive = false;
  await specialization.save();

  res.json({
    success: true,
    message: 'Specialization deactivated successfully',
  });
});

/**
 * POST /api/specializations/seed
 * Import existing specializations from Doctor + CrmProduct records
 */
const seedFromExisting = catchAsync(async (req, res) => {
  // Gather from Doctor.specialization
  const doctorSpecs = await Doctor.distinct('specialization', {
    isActive: { $ne: false },
    specialization: { $ne: null },
  });

  // Gather from CrmProduct.targetSpecializations
  const productSpecs = await CrmProduct.distinct('targetSpecializations', {
    isActive: true,
  });

  // Merge and deduplicate case-insensitively
  const allSpecs = [...doctorSpecs, ...productSpecs].filter(Boolean);
  const seen = new Map();
  allSpecs.forEach((s) => {
    const key = s.trim().toLowerCase();
    if (!seen.has(key) && key) {
      seen.set(key, s.trim());
    }
  });

  let created = 0;
  let skipped = 0;

  for (const name of seen.values()) {
    try {
      await Specialization.create({ name });
      created++;
    } catch (err) {
      // Duplicate key — already exists
      if (err.code === 11000) {
        skipped++;
      } else {
        throw err;
      }
    }
  }

  res.json({
    success: true,
    message: `Seed complete: ${created} created, ${skipped} already existed`,
    data: { created, skipped, total: created + skipped },
  });
});

module.exports = {
  getAllSpecializations,
  createSpecialization,
  updateSpecialization,
  deleteSpecialization,
  seedFromExisting,
};
