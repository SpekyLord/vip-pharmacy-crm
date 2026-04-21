/**
 * Import Controller
 *
 * Handles CPT Excel workbook upload, parsing, staging, and approval.
 * All endpoints are admin-only.
 *
 * Flow: upload → parse → stage (ImportBatch) → approve/reject
 * On approval: upsert Doctor records + create Schedule entries
 */

const ImportBatch = require('../models/ImportBatch');
const Doctor = require('../models/Doctor');
const Schedule = require('../models/Schedule');
const User = require('../models/User');
const CrmProduct = require('../models/CrmProduct');
const Program = require('../models/Program');
const SupportType = require('../models/SupportType');
const { parseCPTWorkbook, detectDuplicates } = require('../utils/excelParser');
const { catchAsync, ApiError } = require('../middleware/errorHandler');
const { getCycleStartDate } = require('../utils/scheduleCycleUtils');
const { ROLES } = require('../constants/roles');
const { loadNameRules, cleanName } = require('../utils/nameCleanup');

/**
 * POST /api/imports/upload
 * Upload and parse a CPT Excel file, stage as ImportBatch.
 */
const upload = catchAsync(async (req, res) => {
  if (!req.file) {
    throw new ApiError(400, 'Excel file is required');
  }

  const { assignedToBDM, cycleNumber } = req.body;

  if (!assignedToBDM) {
    throw new ApiError(400, 'BDM (assignedToBDM) is required');
  }
  if (cycleNumber === undefined || cycleNumber === null || cycleNumber === '') {
    throw new ApiError(400, 'Cycle number is required');
  }

  const cycleNum = parseInt(cycleNumber, 10);
  if (isNaN(cycleNum) || cycleNum < 0) {
    throw new ApiError(400, 'Cycle number must be a non-negative integer');
  }

  // Validate BDM exists and is an employee
  const bdm = await User.findById(assignedToBDM);
  if (!bdm || bdm.role !== ROLES.CONTRACTOR) {
    throw new ApiError(400, 'Invalid BDM user. Must be a contractor.');
  }

  // Parse the Excel file
  const { doctors, daySheets, errors } = await parseCPTWorkbook(req.file.buffer);

  if (doctors.length === 0 && errors.length > 0) {
    throw new ApiError(400, `Failed to parse CPT file: ${errors.join('; ')}`);
  }

  // Fetch existing doctors for this BDM for duplicate detection
  const existingDoctors = await Doctor.find({
    assignedTo: assignedToBDM,
    isActive: true,
  }).lean();

  // Detect duplicates
  const enrichedDoctors = detectDuplicates(doctors, existingDoctors);

  // Calculate stats
  const newCount = enrichedDoctors.filter((d) => !d.isExisting).length;
  const updateCount = enrichedDoctors.filter((d) => d.isExisting).length;
  const invalidCount = enrichedDoctors.filter((d) => d.validationStatus === 'INVALID').length;

  // Create ImportBatch
  const batch = await ImportBatch.create({
    uploadedBy: req.user._id,
    assignedToBDM,
    fileName: req.file.originalname,
    fileSize: req.file.size,
    cycleNumber: cycleNum,
    doctorCount: enrichedDoctors.length,
    newCount,
    updateCount,
    invalidCount,
    parsedDoctors: enrichedDoctors,
    daySheetData: daySheets,
  });

  res.status(201).json({
    success: true,
    message: `CPT file parsed successfully. ${enrichedDoctors.length} VIP Clients found (${newCount} new, ${updateCount} existing, ${invalidCount} invalid).`,
    data: {
      batchId: batch._id,
      doctorCount: enrichedDoctors.length,
      newCount,
      updateCount,
      invalidCount,
      parseErrors: errors,
    },
  });
});

/**
 * GET /api/imports
 * List import batches with pagination.
 */
const list = catchAsync(async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 20;
  const skip = (page - 1) * limit;
  const status = req.query.status;

  const query = {};
  if (status && ['pending', 'approved', 'rejected'].includes(status)) {
    query.status = status;
  }

  const [batches, total] = await Promise.all([
    ImportBatch.find(query)
      .select('-parsedDoctors -daySheetData')
      .populate('uploadedBy', 'name email')
      .populate('assignedToBDM', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    ImportBatch.countDocuments(query),
  ]);

  res.json({
    success: true,
    data: batches,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  });
});

/**
 * GET /api/imports/:id
 * Get full batch detail for preview/review.
 */
const getById = catchAsync(async (req, res) => {
  const batch = await ImportBatch.findById(req.params.id)
    .populate('uploadedBy', 'name email')
    .populate('assignedToBDM', 'name email')
    .lean();

  if (!batch) {
    throw new ApiError(404, 'Import batch not found');
  }

  res.json({
    success: true,
    data: batch,
  });
});

/**
 * Build doctor fields object from parsed data.
 * Shared helper for the approve flow.
 */
const buildDoctorFields = (parsed, bdmId, productMap, activePrograms, activeSupports, nameRules) => {
  const doctorFields = {
    firstName: nameRules ? cleanName(parsed.firstName, nameRules) : parsed.firstName,
    lastName: nameRules ? cleanName(parsed.lastName, nameRules) : parsed.lastName,
    specialization: parsed.specialization || undefined,
    clinicOfficeAddress: parsed.clinicAddress || undefined,
    // Phase G1.5 — structured locality/province from CPT Excel. Optional during
    // import because legacy CPT workbooks may not carry these columns yet;
    // backfillDoctorLocality.js reconciles post-import. When CPT is updated,
    // parser in xlsxParser.js can extract `locality` + `province` columns.
    locality: parsed.locality || undefined,
    province: parsed.province || undefined,
    outletIndicator: parsed.outletIndicator || undefined,
    visitFrequency: parsed.visitFrequency === 2 ? 2 : 4,
    assignedTo: bdmId,
    isActive: true,
  };

  // Programs — match against admin-configured values from DB
  if (parsed.programs) {
    const normalizeStr = (s) => s.trim().replace(/\s+/g, ' ').replace(/\s*\/\s*/g, ' / ').toLowerCase();
    const program = activePrograms.find(
      (p) => normalizeStr(p) === normalizeStr(parsed.programs)
    );
    if (program) {
      doctorFields.programsToImplement = [program];
    }
  }

  // Support — match against admin-configured values from DB
  if (parsed.support) {
    const support = activeSupports.find(
      (s) => s.toLowerCase() === parsed.support.toLowerCase()
    );
    if (support) {
      doctorFields.supportDuringCoverage = [support];
    }
  }

  // Engagement level
  if (parsed.engagementLevel) {
    doctorFields.levelOfEngagement = parsed.engagementLevel;
  }

  // Secretary
  if (parsed.secretaryName) doctorFields.secretaryName = parsed.secretaryName;
  if (parsed.secretaryPhone) doctorFields.secretaryPhone = parsed.secretaryPhone;

  // Dates
  if (parsed.birthday) {
    const d = new Date(parsed.birthday);
    if (!isNaN(d.getTime())) doctorFields.birthday = d;
  }
  if (parsed.anniversary) {
    const d = new Date(parsed.anniversary);
    if (!isNaN(d.getTime())) doctorFields.anniversary = d;
  }

  // Other details
  if (parsed.otherDetails) doctorFields.otherDetails = parsed.otherDetails;

  // Target products
  if (parsed.targetProducts && parsed.targetProducts.length > 0) {
    const tp = [];
    for (const name of parsed.targetProducts) {
      const productId = productMap.get(name.toLowerCase());
      if (productId) {
        tp.push({ product: productId, status: 'showcasing' });
      }
    }
    if (tp.length > 0) {
      doctorFields.targetProducts = tp;
    }
  }

  return doctorFields;
};

/**
 * POST /api/imports/:id/approve
 * Approve a pending batch — writes to Doctor + Schedule collections.
 *
 * Performance: computes parentRegions once, then uses bulk insertMany/updateOne
 * to avoid per-document pre-save hooks (which call Region.getAncestorChain per doc).
 */
const approve = catchAsync(async (req, res) => {
  const batch = await ImportBatch.findById(req.params.id);

  if (!batch) {
    throw new ApiError(404, 'Import batch not found');
  }

  if (batch.status !== 'pending') {
    throw new ApiError(400, `Cannot approve batch with status "${batch.status}". Only pending batches can be approved.`);
  }

  const bdmId = batch.assignedToBDM;
  const cycleNumber = batch.cycleNumber;
  const cycleStart = getCycleStartDate(cycleNumber);

  // Resolve product names to ObjectIds
  const allProductNames = [];
  for (const doc of batch.parsedDoctors) {
    if (doc.targetProducts) {
      allProductNames.push(...doc.targetProducts);
    }
  }
  const uniqueProductNames = [...new Set(allProductNames.filter(Boolean))];

  let productMap = new Map();
  if (uniqueProductNames.length > 0) {
    try {
      const products = await CrmProduct.find({
        name: { $in: uniqueProductNames.map((n) => new RegExp(`^${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')) },
      }).select('_id name').lean();

      for (const p of products) {
        productMap.set(p.name.toLowerCase(), p._id);
      }
    } catch {
      // Product matching is non-critical — continue without it
    }
  }

  // Pre-fetch active programs, support types, and name cleanup rules
  const [activePrograms, activeSupports, nameRules] = await Promise.all([
    Program.find({ isActive: true }).distinct('name'),
    SupportType.find({ isActive: true }).distinct('name'),
    loadNameRules(null),
  ]);

  let doctorsCreated = 0;
  let doctorsUpdated = 0;
  const doctorIdMap = new Map(); // rowNumber → doctorId

  // Separate new vs existing doctors
  const newDoctorDocs = [];
  const newDoctorRowNumbers = [];
  const updateOps = [];

  for (const parsed of batch.parsedDoctors) {
    const fields = buildDoctorFields(parsed, bdmId, productMap, activePrograms, activeSupports, nameRules);

    if (parsed.isExisting && parsed.existingDoctorId) {
      // Queue update
      updateOps.push({
        updateOne: {
          filter: { _id: parsed.existingDoctorId },
          update: { $set: fields },
        },
      });
      doctorIdMap.set(parsed.rowNumber, parsed.existingDoctorId);
      doctorsUpdated++;
    } else {
      // Queue for bulk insert
      newDoctorDocs.push(fields);
      newDoctorRowNumbers.push(parsed.rowNumber);
    }
  }

  // Bulk update existing doctors
  if (updateOps.length > 0) {
    await Doctor.bulkWrite(updateOps, { ordered: false });
  }

  // Bulk insert new doctors
  if (newDoctorDocs.length > 0) {
    const inserted = await Doctor.insertMany(newDoctorDocs, { ordered: false });
    inserted.forEach((doc, idx) => {
      doctorIdMap.set(newDoctorRowNumbers[idx], doc._id);
    });
    doctorsCreated = inserted.length;
  }

  // Unassign old doctors: any doctor currently assigned to this BDM that is
  // NOT in the new CPT file gets unassigned (assignedTo removed).
  // This prevents stale VIP Clients from accumulating across CPT uploads.
  const importedDoctorIds = [...doctorIdMap.values()].map((id) => id.toString());
  const oldDoctors = await Doctor.find({ assignedTo: bdmId, isActive: true }).select('_id').lean();
  const doctorsToUnassign = oldDoctors
    .filter((d) => !importedDoctorIds.includes(d._id.toString()))
    .map((d) => d._id);

  let doctorsUnassigned = 0;
  if (doctorsToUnassign.length > 0) {
    const unassignResult = await Doctor.updateMany(
      { _id: { $in: doctorsToUnassign } },
      { $unset: { assignedTo: '' } }
    );
    doctorsUnassigned = unassignResult.modifiedCount || 0;
  }

  // Clear existing planned/carried schedule entries for this BDM+cycle
  await Schedule.deleteMany({
    user: bdmId,
    cycleNumber,
    status: { $in: ['planned', 'carried'] },
  });

  // Build schedule entries from day flags
  const scheduleEntries = [];
  for (const parsed of batch.parsedDoctors) {
    const doctorId = doctorIdMap.get(parsed.rowNumber);
    if (!doctorId) continue;

    parsed.dayFlags.forEach((flag, dayIndex) => {
      if (!flag) return;

      const week = Math.floor(dayIndex / 5) + 1;
      const day = (dayIndex % 5) + 1;

      scheduleEntries.push({
        doctor: doctorId,
        user: bdmId,
        cycleStart,
        cycleNumber,
        scheduledWeek: week,
        scheduledDay: day,
        scheduledLabel: `W${week}D${day}`,
        status: 'planned',
      });
    });
  }

  let scheduleEntriesCreated = 0;
  if (scheduleEntries.length > 0) {
    try {
      const result = await Schedule.insertMany(scheduleEntries, { ordered: false });
      scheduleEntriesCreated = result.length;
    } catch (err) {
      // Handle duplicate key errors gracefully (some entries may already exist)
      if (err.insertedDocs) {
        scheduleEntriesCreated = err.insertedDocs.length;
      } else if (err.result && err.result.nInserted) {
        scheduleEntriesCreated = err.result.nInserted;
      }
    }
  }

  // Update batch status
  batch.status = 'approved';
  batch.approvedAt = new Date();
  await batch.save();

  const unassignMsg = doctorsUnassigned > 0 ? `, ${doctorsUnassigned} unassigned` : '';
  res.json({
    success: true,
    message: `Batch approved. ${doctorsCreated} VIP Clients created, ${doctorsUpdated} updated${unassignMsg}, ${scheduleEntriesCreated} schedule entries created.`,
    data: {
      doctorsCreated,
      doctorsUpdated,
      doctorsUnassigned,
      scheduleEntriesCreated,
    },
  });
});

/**
 * POST /api/imports/:id/reject
 * Reject a pending batch with a reason.
 */
const reject = catchAsync(async (req, res) => {
  const batch = await ImportBatch.findById(req.params.id);

  if (!batch) {
    throw new ApiError(404, 'Import batch not found');
  }

  if (batch.status !== 'pending') {
    throw new ApiError(400, `Cannot reject batch with status "${batch.status}". Only pending batches can be rejected.`);
  }

  batch.status = 'rejected';
  batch.rejectionReason = req.body.reason || 'Rejected by admin';
  await batch.save();

  res.json({
    success: true,
    message: 'Import batch rejected.',
    data: { id: batch._id, status: 'rejected' },
  });
});

/**
 * DELETE /api/imports/:id
 * Delete a pending import batch.
 */
const deleteBatch = catchAsync(async (req, res) => {
  const batch = await ImportBatch.findById(req.params.id);

  if (!batch) {
    throw new ApiError(404, 'Import batch not found');
  }

  if (batch.status === 'approved') {
    throw new ApiError(400, 'Cannot delete an approved batch. Data has already been written.');
  }

  await ImportBatch.findByIdAndDelete(req.params.id);

  res.json({
    success: true,
    message: 'Import batch deleted.',
  });
});

module.exports = {
  upload,
  list,
  getById,
  approve,
  reject,
  deleteBatch,
};
