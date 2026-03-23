const Program = require('../models/Program');
const Doctor = require('../models/Doctor');
const Client = require('../models/Client');
const { catchAsync } = require('../middleware/errorHandler');

/**
 * GET /api/programs
 * Returns all programs (optionally filtered by isActive)
 */
const getAllPrograms = catchAsync(async (req, res) => {
  const filter = {};
  if (req.query.active === 'true') filter.isActive = true;
  if (req.query.active === 'false') filter.isActive = false;

  const programs = await Program.find(filter).sort({ name: 1 }).lean();

  res.json({
    success: true,
    data: programs,
  });
});

/**
 * POST /api/programs
 * Admin creates a new program
 */
const createProgram = catchAsync(async (req, res) => {
  const { name } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({
      success: false,
      message: 'Program name is required',
    });
  }

  // Check for duplicate (case-insensitive)
  const existing = await Program.findOne({
    name: { $regex: new RegExp(`^${name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
  });

  if (existing) {
    return res.status(409).json({
      success: false,
      message: `Program "${existing.name}" already exists`,
    });
  }

  const program = await Program.create({ name: name.trim() });

  res.status(201).json({
    success: true,
    message: 'Program created successfully',
    data: program,
  });
});

/**
 * PUT /api/programs/:id
 * Admin updates a program
 */
const updateProgram = catchAsync(async (req, res) => {
  const { name, isActive } = req.body;
  const program = await Program.findById(req.params.id);

  if (!program) {
    return res.status(404).json({
      success: false,
      message: 'Program not found',
    });
  }

  if (name !== undefined) {
    if (!name.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Program name cannot be empty',
      });
    }

    // Check duplicate on rename
    const existing = await Program.findOne({
      _id: { $ne: program._id },
      name: { $regex: new RegExp(`^${name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
    });

    if (existing) {
      return res.status(409).json({
        success: false,
        message: `Program "${existing.name}" already exists`,
      });
    }

    program.name = name.trim();
  }

  if (isActive !== undefined) {
    program.isActive = isActive;
  }

  await program.save();

  res.json({
    success: true,
    message: 'Program updated successfully',
    data: program,
  });
});

/**
 * DELETE /api/programs/:id
 * Soft delete — sets isActive to false
 */
const deleteProgram = catchAsync(async (req, res) => {
  const program = await Program.findById(req.params.id);

  if (!program) {
    return res.status(404).json({
      success: false,
      message: 'Program not found',
    });
  }

  program.isActive = false;
  await program.save();

  res.json({
    success: true,
    message: 'Program deactivated successfully',
  });
});

/**
 * POST /api/programs/seed
 * Import existing programs from Doctor + Client records
 */
const seedFromExisting = catchAsync(async (req, res) => {
  const doctorPrograms = await Doctor.distinct('programsToImplement', {
    isActive: { $ne: false },
    programsToImplement: { $ne: null },
  });

  const clientPrograms = await Client.distinct('programsToImplement', {
    programsToImplement: { $ne: null },
  });

  // Merge and deduplicate case-insensitively
  const allPrograms = [...doctorPrograms, ...clientPrograms].filter(Boolean);
  const seen = new Map();
  allPrograms.forEach((s) => {
    const key = s.trim().toLowerCase();
    if (!seen.has(key) && key) {
      seen.set(key, s.trim());
    }
  });

  let created = 0;
  let skipped = 0;

  for (const name of seen.values()) {
    try {
      await Program.create({ name });
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
 * GET /api/programs/stats
 * Program implementation monitoring — per-program VIP client coverage
 */
const getProgramStats = catchAsync(async (req, res) => {
  const Visit = require('../models/Visit');
  const { getCycleNumber, getCycleStartDate, getCycleEndDate } = require('../utils/scheduleCycleUtils');

  const now = new Date();
  const currentCycle = getCycleNumber(now);
  const cycleStart = getCycleStartDate(currentCycle);
  const cycleEnd = getCycleEndDate(currentCycle);

  const programs = await Program.find({ isActive: true }).lean();

  const stats = await Promise.all(
    programs.map(async (prog) => {
      // Count doctors enrolled in this program
      const enrolledCount = await Doctor.countDocuments({
        programsToImplement: prog.name,
        isActive: { $ne: false },
      });

      // Count distinct doctors in this program who have at least one completed visit this cycle
      const doctorIds = await Doctor.find({
        programsToImplement: prog.name,
        isActive: { $ne: false },
      }).distinct('_id');

      const visitedDoctorIds = await Visit.distinct('doctor', {
        doctor: { $in: doctorIds },
        status: 'completed',
        visitDate: { $gte: cycleStart, $lte: cycleEnd },
      });

      return {
        program: prog.name,
        programId: prog._id,
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
  getAllPrograms,
  createProgram,
  updateProgram,
  deleteProgram,
  seedFromExisting,
  getProgramStats,
};
