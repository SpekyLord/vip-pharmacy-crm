const SupportType = require('../models/SupportType');
const Doctor = require('../models/Doctor');
const Client = require('../models/Client');
const { catchAsync } = require('../middleware/errorHandler');

/**
 * GET /api/support-types
 * Returns all support types (optionally filtered by isActive)
 */
const getAllSupportTypes = catchAsync(async (req, res) => {
  const filter = {};
  if (req.query.active === 'true') filter.isActive = true;
  if (req.query.active === 'false') filter.isActive = false;

  const supportTypes = await SupportType.find(filter).sort({ name: 1 }).lean();

  res.json({
    success: true,
    data: supportTypes,
  });
});

/**
 * POST /api/support-types
 * Admin creates a new support type
 */
const createSupportType = catchAsync(async (req, res) => {
  const { name } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({
      success: false,
      message: 'Support type name is required',
    });
  }

  const existing = await SupportType.findOne({
    name: { $regex: new RegExp(`^${name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
  });

  if (existing) {
    return res.status(409).json({
      success: false,
      message: `Support type "${existing.name}" already exists`,
    });
  }

  const supportType = await SupportType.create({ name: name.trim() });

  res.status(201).json({
    success: true,
    message: 'Support type created successfully',
    data: supportType,
  });
});

/**
 * PUT /api/support-types/:id
 * Admin updates a support type
 */
const updateSupportType = catchAsync(async (req, res) => {
  const { name, isActive } = req.body;
  const supportType = await SupportType.findById(req.params.id);

  if (!supportType) {
    return res.status(404).json({
      success: false,
      message: 'Support type not found',
    });
  }

  if (name !== undefined) {
    if (!name.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Support type name cannot be empty',
      });
    }

    const existing = await SupportType.findOne({
      _id: { $ne: supportType._id },
      name: { $regex: new RegExp(`^${name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
    });

    if (existing) {
      return res.status(409).json({
        success: false,
        message: `Support type "${existing.name}" already exists`,
      });
    }

    supportType.name = name.trim();
  }

  if (isActive !== undefined) {
    supportType.isActive = isActive;
  }

  await supportType.save();

  res.json({
    success: true,
    message: 'Support type updated successfully',
    data: supportType,
  });
});

/**
 * DELETE /api/support-types/:id
 * Soft delete — sets isActive to false
 */
const deleteSupportType = catchAsync(async (req, res) => {
  const supportType = await SupportType.findById(req.params.id);

  if (!supportType) {
    return res.status(404).json({
      success: false,
      message: 'Support type not found',
    });
  }

  supportType.isActive = false;
  await supportType.save();

  res.json({
    success: true,
    message: 'Support type deactivated successfully',
  });
});

/**
 * POST /api/support-types/seed
 * Import existing support types from Doctor + Client records
 */
const seedFromExisting = catchAsync(async (req, res) => {
  const doctorSupports = await Doctor.distinct('supportDuringCoverage', {
    isActive: { $ne: false },
    supportDuringCoverage: { $ne: null },
  });

  const clientSupports = await Client.distinct('supportDuringCoverage', {
    supportDuringCoverage: { $ne: null },
  });

  const allSupports = [...doctorSupports, ...clientSupports].filter(Boolean);
  const seen = new Map();
  allSupports.forEach((s) => {
    const key = s.trim().toLowerCase();
    if (!seen.has(key) && key) {
      seen.set(key, s.trim());
    }
  });

  let created = 0;
  let skipped = 0;

  for (const name of seen.values()) {
    try {
      await SupportType.create({ name });
      created++;
    } catch (err) {
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

/**
 * GET /api/support-types/stats
 * Support type implementation monitoring — per-type VIP client coverage
 */
const getSupportTypeStats = catchAsync(async (req, res) => {
  const Visit = require('../models/Visit');
  const { getCycleNumber, getCycleStartDate, getCycleEndDate } = require('../utils/scheduleCycleUtils');

  const now = new Date();
  const currentCycle = getCycleNumber(now);
  const cycleStart = getCycleStartDate(currentCycle);
  const cycleEnd = getCycleEndDate(currentCycle);

  const supportTypes = await SupportType.find({ isActive: true }).lean();

  const stats = await Promise.all(
    supportTypes.map(async (st) => {
      const enrolledCount = await Doctor.countDocuments({
        supportDuringCoverage: st.name,
        isActive: { $ne: false },
      });

      const doctorIds = await Doctor.find({
        supportDuringCoverage: st.name,
        isActive: { $ne: false },
      }).distinct('_id');

      const visitedDoctorIds = await Visit.distinct('doctor', {
        doctor: { $in: doctorIds },
        status: 'completed',
        visitDate: { $gte: cycleStart, $lte: cycleEnd },
      });

      return {
        supportType: st.name,
        supportTypeId: st._id,
        enrolledVipClients: enrolledCount,
        visitedVipClients: visitedDoctorIds.length,
        coverageRate: enrolledCount > 0 ? Math.round((visitedDoctorIds.length / enrolledCount) * 100) : 0,
      };
    })
  );

  res.json({
    success: true,
    data: stats,
    cycleNumber: currentCycle,
  });
});

module.exports = {
  getAllSupportTypes,
  createSupportType,
  updateSupportType,
  deleteSupportType,
  seedFromExisting,
  getSupportTypeStats,
};
