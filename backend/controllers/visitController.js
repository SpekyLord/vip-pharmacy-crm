/**
 * Visit Controller
 *
 * This file handles:
 * - Visit CRUD operations
 * - Weekly visit enforcement (one per doctor per week)
 * - Monthly quota tracking (2x or 4x)
 * - Compliance reporting
 * - Visit statistics
 */

const Visit = require('../models/Visit');
const Doctor = require('../models/Doctor');
const CrmProduct = require('../models/CrmProduct');
const { catchAsync, NotFoundError } = require('../middleware/errorHandler');
const { canVisitDoctor, canVisitDoctorsBatch, getComplianceReport, checkBehindSchedule, getMonthYear, getScheduleMatchForVisit } = require('../utils/validateWeeklyVisit');
const { signVisitPhotos } = require('../config/s3');

/**
 * @desc    Create a new visit
 * @route   POST /api/visits
 * @access  Private (Employee, Admin)
 */
const createVisit = catchAsync(async (req, res) => {
  const {
    doctor: doctorId,
    visitDate,
    visitType,
    location,
    productsDiscussed,
    engagementTypes,
    photoMetadata,
    purpose,
    doctorFeedback,
    notes,
    duration,
    nextVisitDate,
  } = req.body;

  // Parse location if it's a JSON string (from FormData)
  let locationData = location;
  if (typeof location === 'string') {
    try {
      locationData = JSON.parse(location);
    } catch (e) {
      return res.status(400).json({
        success: false,
        message: 'Invalid location data format',
      });
    }
  }

  // Validate GPS coordinates bounds
  if (locationData) {
    const lat = parseFloat(locationData.latitude);
    const lng = parseFloat(locationData.longitude);
    if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return res.status(400).json({
        success: false,
        message: 'Invalid GPS coordinates. Latitude must be -90 to 90, longitude -180 to 180.',
      });
    }
  }

  // Parse productsDiscussed if it's a JSON string (from FormData)
  let productsData = productsDiscussed;
  if (typeof productsDiscussed === 'string') {
    try {
      productsData = JSON.parse(productsDiscussed);
    } catch (e) {
      productsData = [];
    }
  }

  // Parse engagementTypes if it's a JSON string (from FormData)
  let engagementData = engagementTypes;
  if (typeof engagementTypes === 'string') {
    try {
      engagementData = JSON.parse(engagementTypes);
    } catch (e) {
      engagementData = [];
    }
  }

  const visitDateObj = visitDate ? new Date(visitDate) : new Date();

  // Check if user can visit this doctor (region access, weekly and monthly limits)
  const visitCheck = await canVisitDoctor(doctorId, req.user, visitDateObj);

  if (!visitCheck.canVisit) {
    return res.status(400).json({
      success: false,
      message: visitCheck.reason,
      data: {
        weeklyCount: visitCheck.weeklyCount,
        monthlyCount: visitCheck.monthlyCount,
        monthlyLimit: visitCheck.monthlyLimit,
      },
    });
  }

  // Check if photos are uploaded (from middleware)
  if (!req.uploadedPhotos || req.uploadedPhotos.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'At least one photo is required as proof of visit.',
    });
  }

  // Parse photoMetadata if it's a JSON string (from FormData)
  let parsedPhotoMeta = [];
  if (photoMetadata) {
    try {
      parsedPhotoMeta = typeof photoMetadata === 'string' ? JSON.parse(photoMetadata) : photoMetadata;
    } catch (e) {
      parsedPhotoMeta = [];
    }
  }

  // Prepare photos array — merge S3 upload result with frontend EXIF metadata
  const photos = req.uploadedPhotos.map((photo, index) => {
    const meta = parsedPhotoMeta[index] || {};
    return {
      url: photo.url,
      capturedAt: meta.capturedAt ? new Date(meta.capturedAt) : (photo.capturedAt || new Date()),
      source: meta.source || 'camera',
    };
  });

  // Create visit with race condition protection
  // The unique index on (doctor, user, yearWeekKey) prevents duplicate visits
  // but we need to handle the case where two requests arrive simultaneously
  let visit;
  try {
    const visitData = {
      doctor: doctorId,
      user: req.user._id,
      visitDate: visitDateObj,
      visitType: visitType || 'regular',
      photos,
      productsDiscussed: productsData,
      engagementTypes: engagementData || [],
      purpose,
      doctorFeedback,
      notes,
      duration,
      nextVisitDate,
      status: 'completed',
    };

    // Add location only if GPS data is available
    if (locationData && locationData.latitude != null && locationData.longitude != null) {
      visitData.location = {
        latitude: locationData.latitude,
        longitude: locationData.longitude,
        accuracy: locationData.accuracy,
        capturedAt: new Date(),
      };
    }

    visit = await Visit.create(visitData);
  } catch (error) {
    // Handle duplicate key error (race condition - another visit was created first)
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'A visit to this VIP Client has already been logged this week. Only one visit per week is allowed.',
      });
    }
    // Re-throw other errors for the error handler
    throw error;
  }

  // Link visit to schedule entry (current week first, then oldest carried)
  try {
    const match = await getScheduleMatchForVisit(doctorId, req.user._id, visitDateObj);
    if (match.entry) {
      match.entry.visit = visit._id;
      await match.entry.save();
    }
  } catch (scheduleErr) {
    // Non-fatal: visit is still valid even if schedule linking fails
    console.error('Schedule linking error (non-fatal):', scheduleErr.message);
  }

  // Populate doctor info for response
  await visit.populate('doctor', 'firstName lastName specialization clinicOfficeAddress');

  res.status(201).json({
    success: true,
    message: 'Visit logged successfully',
    data: visit,
  });
});

/**
 * @desc    Get all visits with filtering
 * @route   GET /api/visits
 * @access  Private (Admin sees all, Employee sees own)
 */
const getAllVisits = catchAsync(async (req, res) => {
  const { page = 1, limit = 20, status, monthYear, userId, doctorId } = req.query;

  const query = {};

  // Role-based filtering
  if (req.user.role === 'employee') {
    query.user = req.user._id;
  } else if (userId) {
    query.user = userId;
  }

  // Filter by doctor
  if (doctorId) {
    query.doctor = doctorId;
  }

  // Filter by status
  if (status) {
    query.status = status;
  }

  // Filter by month-year
  if (monthYear) {
    query.monthYear = monthYear;
  }

  // Filter by date range
  if (req.query.dateFrom || req.query.dateTo) {
    query.visitDate = {};
    if (req.query.dateFrom) query.visitDate.$gte = new Date(req.query.dateFrom);
    if (req.query.dateTo) {
      const d = new Date(req.query.dateTo);
      d.setHours(23, 59, 59, 999);
      query.visitDate.$lte = d;
    }
  }

  const parsedLimit = parseInt(limit);
  const skip = parsedLimit === 0 ? 0 : (page - 1) * parsedLimit;

  let visitQuery = Visit.find(query)
    .populate('doctor', 'firstName lastName specialization clinicOfficeAddress')
    .populate('user', 'name email')
    .sort({ visitDate: -1 })
    .skip(skip);

  if (parsedLimit > 0) {
    visitQuery = visitQuery.limit(parsedLimit);
  }

  const [visits, total] = await Promise.all([
    visitQuery,
    Visit.countDocuments(query),
  ]);

  // Sign photo URLs for private S3 access
  const signedVisits = await Promise.all(visits.map((visit) => signVisitPhotos(visit)));

  res.json({
    success: true,
    data: signedVisits,
    pagination: {
      page: parseInt(page),
      limit: parsedLimit,
      total,
      pages: parsedLimit === 0 ? 1 : Math.ceil(total / parsedLimit),
    },
  });
});

/**
 * @desc    Get visit by ID
 * @route   GET /api/visits/:id
 * @access  Private
 */
const getVisitById = catchAsync(async (req, res) => {
  const visit = await Visit.findById(req.params.id)
    .populate('doctor', 'firstName lastName specialization clinicOfficeAddress phone')
    .populate('user', 'name email')
    .populate('productsDiscussed.product', 'name category description image');

  if (!visit) {
    throw new NotFoundError('Visit not found');
  }

  // Check access
  if (req.user.role === 'employee' && visit.user._id.toString() !== req.user._id.toString()) {
    return res.status(403).json({
      success: false,
      message: 'Access denied',
    });
  }

  // Sign photo URLs for private S3 access
  const signedVisit = await signVisitPhotos(visit);

  res.json({
    success: true,
    data: signedVisit,
  });
});

/**
 * @desc    Update visit
 * @route   PUT /api/visits/:id
 * @access  Private
 */
const updateVisit = catchAsync(async (req, res) => {
  const visit = await Visit.findById(req.params.id);

  if (!visit) {
    throw new NotFoundError('Visit not found');
  }

  // Check access
  if (req.user.role === 'employee' && visit.user.toString() !== req.user._id.toString()) {
    return res.status(403).json({
      success: false,
      message: 'Access denied',
    });
  }

  // Only allow updating certain fields
  const allowedUpdates = ['doctorFeedback', 'notes', 'productsDiscussed', 'nextVisitDate'];
  const updates = {};

  allowedUpdates.forEach((field) => {
    if (req.body[field] !== undefined) {
      updates[field] = req.body[field];
    }
  });

  const updatedVisit = await Visit.findByIdAndUpdate(
    req.params.id,
    updates,
    { new: true, runValidators: true }
  ).populate('doctor', 'firstName lastName specialization clinicOfficeAddress');

  res.json({
    success: true,
    message: 'Visit updated successfully',
    data: updatedVisit,
  });
});

/**
 * @desc    Cancel visit
 * @route   PUT /api/visits/:id/cancel
 * @access  Private
 */
const cancelVisit = catchAsync(async (req, res) => {
  const { reason } = req.body;

  const visit = await Visit.findById(req.params.id);

  if (!visit) {
    throw new NotFoundError('Visit not found');
  }

  // Check access
  if (req.user.role === 'employee' && visit.user.toString() !== req.user._id.toString()) {
    return res.status(403).json({
      success: false,
      message: 'Access denied',
    });
  }

  visit.status = 'cancelled';
  visit.cancelReason = reason;
  await visit.save();

  res.json({
    success: true,
    message: 'Visit cancelled',
    data: visit,
  });
});

/**
 * @desc    Get visits by user
 * @route   GET /api/visits/user/:userId
 * @access  Private
 */
const getVisitsByUser = catchAsync(async (req, res) => {
  const { userId } = req.params;
  const { page = 1, limit = 20, monthYear } = req.query;

  // Check access
  if (req.user.role === 'employee' && userId !== req.user._id.toString()) {
    return res.status(403).json({
      success: false,
      message: 'Access denied',
    });
  }

  const query = { user: userId, status: 'completed' };

  if (monthYear) {
    query.monthYear = monthYear;
  }

  const skip = (page - 1) * limit;

  const [visits, total] = await Promise.all([
    Visit.find(query)
      .populate('doctor', 'firstName lastName specialization clinicOfficeAddress')
      .sort({ visitDate: -1 })
      .skip(skip)
      .limit(parseInt(limit)),
    Visit.countDocuments(query),
  ]);

  res.json({
    success: true,
    data: visits,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / limit),
    },
  });
});

/**
 * @desc    Get weekly compliance stats for a user
 * @route   GET /api/visits/weekly
 * @access  Private
 */
const getWeeklyCompliance = catchAsync(async (req, res) => {
  const { monthYear } = req.query;
  // Default to current user if no userId provided in params
  const userId = req.params.userId || req.user._id.toString();

  // Check access - employees can only see their own compliance
  if (req.user.role === 'employee' && userId !== req.user._id.toString()) {
    return res.status(403).json({
      success: false,
      message: 'Access denied',
    });
  }

  const targetMonthYear = monthYear || getMonthYear(new Date());
  const report = await getComplianceReport(userId, targetMonthYear);

  res.json({
    success: true,
    data: {
      monthYear: targetMonthYear,
      ...report,
    },
  });
});

/**
 * @desc    Check if user can visit a doctor
 * @route   GET /api/visits/can-visit/:doctorId
 * @access  Private (Employee)
 */
const checkCanVisit = catchAsync(async (req, res) => {
  const { doctorId } = req.params;

  const result = await canVisitDoctor(doctorId, req.user._id);

  res.json({
    success: true,
    data: result,
  });
});

/**
 * @desc    Batch check if user can visit multiple doctors (eliminates N+1 problem)
 * @route   POST /api/visits/can-visit-batch
 * @access  Private (Employee)
 */
const checkCanVisitBatch = catchAsync(async (req, res) => {
  const { doctorIds } = req.body;

  if (!doctorIds || !Array.isArray(doctorIds) || doctorIds.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'doctorIds array is required',
    });
  }

  // Limit batch size to prevent abuse
  if (doctorIds.length > 100) {
    return res.status(400).json({
      success: false,
      message: 'Maximum 100 doctors per batch request',
    });
  }

  // OPTIMIZED: Use batch function that loads all data in 3 queries instead of N+1
  const results = await canVisitDoctorsBatch(doctorIds, req.user);

  // Convert to object keyed by doctorId for O(1) lookup on frontend
  const resultMap = {};
  results.forEach((result) => {
    resultMap[result.doctorId] = result;
  });

  res.json({
    success: true,
    data: resultMap,
  });
});

/**
 * @desc    Get compliance alerts (behind schedule employees)
 * @route   GET /api/visits/compliance-alerts
 * @access  Private (Admin)
 */
const getComplianceAlerts = catchAsync(async (req, res) => {
  const User = require('../models/User');

  // Get all active employees
  const employees = await User.find({ role: 'employee', isActive: true });

  const alerts = [];

  for (const employee of employees) {
    const result = await checkBehindSchedule(employee._id);

    if (result.isBehind) {
      alerts.push({
        employee: {
          _id: employee._id,
          name: employee.name,
          email: employee.email,
        },
        ...result.details,
      });
    }
  }

  res.json({
    success: true,
    data: alerts,
    count: alerts.length,
  });
});

/**
 * @desc    Get visit statistics
 * @route   GET /api/visits/stats
 * @access  Private
 */
const getVisitStats = catchAsync(async (req, res) => {
  const { monthYear, userId } = req.query;
  const mongoose = require('mongoose');

  const matchQuery = { status: 'completed' };

  if (req.user.role === 'employee') {
    matchQuery.user = req.user._id;
  } else if (userId) {
    matchQuery.user = new mongoose.Types.ObjectId(userId);
  }

  if (monthYear) {
    matchQuery.monthYear = monthYear;
  }

  // Single aggregation with $facet to avoid two DB round-trips
  const [result] = await Visit.aggregate([
    { $match: matchQuery },
    {
      $facet: {
        summary: [
          {
            $group: {
              _id: null,
              totalVisits: { $sum: 1 },
              uniqueDoctors: { $addToSet: '$doctor' },
              avgDuration: { $avg: '$duration' },
              visitsByType: { $push: '$visitType' },
            },
          },
          {
            $project: {
              _id: 0,
              totalVisits: 1,
              uniqueDoctorsCount: { $size: '$uniqueDoctors' },
              avgDuration: { $round: ['$avgDuration', 0] },
              visitsByType: 1,
            },
          },
        ],
        weeklyBreakdown: [
          {
            $group: {
              _id: '$weekOfMonth',
              count: { $sum: 1 },
              uniqueDoctors: { $addToSet: '$doctor' },
            },
          },
          {
            $project: {
              week: '$_id',
              visitCount: '$count',
              doctorCount: { $size: '$uniqueDoctors' },
            },
          },
          { $sort: { week: 1 } },
        ],
      },
    },
  ]);

  res.json({
    success: true,
    data: {
      summary: result?.summary[0] || {
        totalVisits: 0,
        uniqueDoctorsCount: 0,
        avgDuration: 0,
      },
      weeklyBreakdown: result?.weeklyBreakdown || [],
    },
  });
});

/**
 * @desc    Get today's visits for employee dashboard
 * @route   GET /api/visits/today
 * @access  Private (Employee)
 */
const getTodayVisits = catchAsync(async (req, res) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const visits = await Visit.find({
    user: req.user._id,
    visitDate: { $gte: today, $lt: tomorrow },
    status: 'completed',
  }).populate('doctor', 'firstName lastName specialization clinicOfficeAddress');

  // Sign photo URLs for private S3 access
  const signedVisits = await Promise.all(visits.map((visit) => signVisitPhotos(visit)));

  res.json({
    success: true,
    data: signedVisits,
    count: signedVisits.length,
  });
});

/**
 * @desc    Get current user's visits (for /my route)
 * @route   GET /api/visits/my
 * @access  Private (Employee)
 */
const getMyVisits = catchAsync(async (req, res) => {
  const { page = 1, limit = 20, status, monthYear, doctorId, dateFrom, dateTo, search } = req.query;

  const query = { user: req.user._id };

  // Filter by status
  if (status && status !== 'all') {
    query.status = status;
  }

  // Filter by month-year
  if (monthYear) {
    query.monthYear = monthYear;
  }

  // Filter by doctor
  if (doctorId) {
    query.doctor = doctorId;
  }

  // Filter by date range
  if (dateFrom || dateTo) {
    query.visitDate = {};
    if (dateFrom) {
      query.visitDate.$gte = new Date(dateFrom);
    }
    if (dateTo) {
      const toDate = new Date(dateTo);
      toDate.setHours(23, 59, 59, 999);
      query.visitDate.$lte = toDate;
    }
  }

  const parsedLimit = parseInt(limit);
  const skip = parsedLimit === 0 ? 0 : (page - 1) * parsedLimit;

  // Build the base query
  let visitQuery = Visit.find(query)
    .populate('doctor', 'firstName lastName specialization clinicOfficeAddress')
    .populate('productsDiscussed.product', 'name category description image')
    .sort({ visitDate: -1 })
    .skip(skip);

  // limit=0 means "return all" (MongoDB .limit(0) returns nothing, so skip it)
  if (parsedLimit > 0) {
    visitQuery = visitQuery.limit(parsedLimit);
  }

  const [visits, total] = await Promise.all([
    visitQuery,
    Visit.countDocuments(query),
  ]);

  // If search term provided, filter results (doctor name search)
  let filteredVisits = visits;
  if (search) {
    const searchLower = search.toLowerCase();
    filteredVisits = visits.filter(v =>
      v.doctor?.name?.toLowerCase().includes(searchLower) ||
      v.doctor?.hospital?.toLowerCase().includes(searchLower)
    );
  }

  // Sign photo URLs for private S3 access
  const signedVisits = await Promise.all(filteredVisits.map((visit) => signVisitPhotos(visit)));

  const totalCount = search ? signedVisits.length : total;

  res.json({
    success: true,
    data: signedVisits,
    pagination: {
      page: parseInt(page),
      limit: parsedLimit,
      total: totalCount,
      pages: parsedLimit === 0 ? 1 : Math.ceil(totalCount / parsedLimit),
    },
  });
});

/**
 * @desc    Refresh photo URLs for a visit (generates fresh presigned URLs)
 * @route   GET /api/visits/:id/refresh-photos
 * @access  Private
 */
const refreshPhotoUrls = catchAsync(async (req, res) => {
  const visit = await Visit.findById(req.params.id);

  if (!visit) {
    throw new NotFoundError('Visit not found');
  }

  // Check if user has access to this visit
  if (req.user.role !== 'admin' && visit.user.toString() !== req.user._id.toString()) {
    return res.status(403).json({
      success: false,
      message: 'You do not have permission to access this visit',
    });
  }

  // Re-sign photo URLs
  const signedVisit = await signVisitPhotos(visit);

  res.status(200).json({
    success: true,
    message: 'Photo URLs refreshed successfully',
    data: {
      visitId: visit._id,
      photos: signedVisit.photos,
    },
  });
});

/**
 * @desc    Get employee visit report (Call Plan Template format)
 * @route   GET /api/visits/employee-report/:userId
 * @access  Private (Admin)
 *
 * Returns all doctors assigned to employee's regions with their actual logged visits
 * for the specified month, mapped to Day1-Day20 grid format.
 */
const getEmployeeReport = catchAsync(async (req, res) => {
  const { userId } = req.params;
  const { monthYear } = req.query;

  if (!monthYear) {
    return res.status(400).json({
      success: false,
      message: 'monthYear query parameter is required (format: YYYY-MM)',
    });
  }

  // Get the employee
  const User = require('../models/User');
  const employee = await User.findById(userId);

  if (!employee) {
    throw new NotFoundError('Employee not found');
  }

  // Fetch all doctors assigned to this BDM
  const doctors = await Doctor.find({
    assignedTo: userId,
    isActive: true,
  })
    .select('firstName lastName specialization clinicOfficeAddress visitFrequency')
    .lean();

  // Fetch all visits by this employee for the selected month
  const visits = await Visit.find({
    user: userId,
    monthYear: monthYear,
    status: 'completed',
  })
    .select('doctor visitDate weekOfMonth dayOfWeek productsDiscussed engagementTypes')
    .lean();

  // Create a map of doctor visits: doctorId -> array of visits
  const visitsByDoctor = new Map();
  visits.forEach((visit) => {
    const doctorId = visit.doctor.toString();
    if (!visitsByDoctor.has(doctorId)) {
      visitsByDoctor.set(doctorId, []);
    }
    visitsByDoctor.get(doctorId).push(visit);
  });

  // Fetch all active product assignments for these doctors
  const ProductAssignment = require('../models/ProductAssignment');
  const doctorIds = doctors.map((d) => d._id);
  const assignments = await ProductAssignment.find({
    doctor: { $in: doctorIds },
    status: 'active',
  })
    .select('doctor product priority')
    .lean();

  // Fetch product details from CRM database
  const productIds = [...new Set(assignments.map((a) => a.product.toString()))];
  let productMap = new Map();

  if (productIds.length > 0) {
    const products = await CrmProduct.find({ _id: { $in: productIds } })
      .select('name')
      .lean();
    productMap = new Map(products.map((p) => [p._id.toString(), p]));
  }

  // Group assignments by doctor
  const assignmentsByDoctor = new Map();
  assignments.forEach((assignment) => {
    const doctorId = assignment.doctor.toString();
    if (!assignmentsByDoctor.has(doctorId)) {
      assignmentsByDoctor.set(doctorId, []);
    }
    const product = productMap.get(assignment.product.toString());
    if (product) {
      assignmentsByDoctor.get(doctorId).push({
        name: product.name,
        priority: assignment.priority,
      });
    }
  });

  // Calculate daily VIP counts (visits per day in the grid)
  const dailyVIPCounts = Array(20).fill(0);

  // Build the doctor data with visits mapped to grid days
  const doctorsWithVisits = doctors.map((doctor) => {
    const doctorId = doctor._id.toString();
    const doctorVisits = visitsByDoctor.get(doctorId) || [];

    // Map visits to Day1-Day20 grid
    // Grid calculation: gridDay = ((weekOfMonth - 1) * 5) + dayOfWeek
    // weekOfMonth: 1-5, dayOfWeek: 1-5 (Mon=1, Fri=5)
    const visitGrid = Array(20).fill(0);
    const visitDetails = [];

    doctorVisits.forEach((visit) => {
      // Calculate grid day (1-indexed to 0-indexed for array)
      const gridDay = ((visit.weekOfMonth - 1) * 5) + visit.dayOfWeek;
      if (gridDay >= 1 && gridDay <= 20) {
        visitGrid[gridDay - 1] = 1;
        dailyVIPCounts[gridDay - 1]++;
        visitDetails.push({
          visitDate: visit.visitDate,
          weekOfMonth: visit.weekOfMonth,
          dayOfWeek: visit.dayOfWeek,
          gridDay: gridDay,
        });
      }
    });

    // Get top 3 assigned products (sorted by priority)
    const assignedProducts = (assignmentsByDoctor.get(doctorId) || [])
      .sort((a, b) => a.priority - b.priority)
      .slice(0, 3);

    return {
      _id: doctor._id,
      firstName: doctor.firstName,
      lastName: doctor.lastName,
      fullName: doctor.fullName,
      specialization: doctor.specialization,
      clinicOfficeAddress: doctor.clinicOfficeAddress,
      visitFrequency: doctor.visitFrequency || 4,
      visitGrid: visitGrid,
      visitCount: doctorVisits.length,
      visits: visitDetails,
      assignedProducts: assignedProducts,
    };
  });

  // Calculate summary stats
  const count2x = doctors.filter((d) => d.visitFrequency === 2).length;
  const count4x = doctors.filter((d) => d.visitFrequency === 4 || !d.visitFrequency).length;
  const totalVisits = visits.length;

  res.json({
    success: true,
    data: {
      employee: {
        _id: employee._id,
        name: employee.name,
        email: employee.email,
      },
      areaAssigned: '',
      monthYear: monthYear,
      doctors: doctorsWithVisits,
      summary: {
        totalDoctors: doctors.length,
        count2x: count2x,
        count4x: count4x,
        totalVisits: totalVisits,
        dailyVIPCounts: dailyVIPCounts,
      },
    },
  });
});

/**
 * Haversine distance between two lat/lng points (returns meters)
 */
function calculateHaversine(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * @desc    Detect quota dumping (many visits in short time)
 * @route   GET /api/visits/quota-dumping
 * @access  Private (Admin)
 */
const getQuotaDumpingAlerts = catchAsync(async (req, res) => {
  const { dateFrom, dateTo } = req.query;

  const matchStage = { status: 'completed' };
  if (dateFrom || dateTo) {
    matchStage.visitDate = {};
    if (dateFrom) matchStage.visitDate.$gte = new Date(dateFrom);
    if (dateTo) {
      const d = new Date(dateTo);
      d.setHours(23, 59, 59, 999);
      matchStage.visitDate.$lte = d;
    }
  } else {
    // Default: last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    matchStage.visitDate = { $gte: thirtyDaysAgo };
  }

  // Group visits by user+date, find days with 4+ visits
  const dayGroups = await Visit.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: {
          user: '$user',
          date: { $dateToString: { format: '%Y-%m-%d', date: '$visitDate' } },
        },
        visits: {
          $push: {
            doctor: '$doctor',
            visitDate: '$visitDate',
          },
        },
        count: { $sum: 1 },
        minTime: { $min: '$visitDate' },
        maxTime: { $max: '$visitDate' },
      },
    },
    { $match: { count: { $gte: 4 } } },
    { $sort: { '_id.date': -1 } },
  ]);

  if (dayGroups.length === 0) {
    return res.json({ success: true, data: [], count: 0 });
  }

  // Fetch user and doctor details
  const User = require('../models/User');
  const userIds = [...new Set(dayGroups.map((g) => g._id.user.toString()))];
  const users = await User.find({ _id: { $in: userIds } })
    .select('name email')
    .lean();
  const userMap = new Map(users.map((u) => [u._id.toString(), u]));

  const allDoctorIds = new Set();
  dayGroups.forEach((g) => g.visits.forEach((v) => allDoctorIds.add(v.doctor.toString())));
  const doctors = await Doctor.find({ _id: { $in: [...allDoctorIds] } })
    .select('firstName lastName')
    .lean();
  const doctorMap = new Map(doctors.map((d) => [d._id.toString(), d]));

  const alerts = dayGroups.map((group, idx) => {
    const user = userMap.get(group._id.user.toString()) || {};
    const timeSpanMs = new Date(group.maxTime) - new Date(group.minTime);
    const timeSpanHours = Math.round(timeSpanMs / (1000 * 60 * 60) * 10) / 10;

    const visitDetails = group.visits.map((v) => {
      const doc = doctorMap.get(v.doctor.toString());
      const docName = doc ? `${doc.firstName} ${doc.lastName}` : 'Unknown';
      const time = new Date(v.visitDate).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
      });
      return { doctor: docName, time };
    });

    return {
      _id: `alert-${idx}`,
      employeeId: group._id.user.toString(),
      employeeName: user.name || 'Unknown',
      email: user.email || '',
      alertType: 'quota_dumping',
      severity: group.count >= 6 ? 'high' : group.count >= 5 ? 'medium' : 'low',
      description: `${group.count} visits logged within ${timeSpanHours} hours on ${group._id.date}`,
      visitCount: group.count,
      timeSpan: `${timeSpanHours} hours`,
      detectedAt: group.maxTime,
      visits: visitDetails,
      status: 'pending_review',
    };
  });

  res.json({
    success: true,
    data: alerts,
    count: alerts.length,
  });
});

/**
 * @desc    Get visits with GPS data for verification review
 * @route   GET /api/visits/gps-review
 * @access  Private (Admin)
 */
const getGPSReview = catchAsync(async (req, res) => {
  const { page = 1, limit = 20, status: statusFilter } = req.query;
  const parsedLimit = parseInt(limit);
  const skip = (page - 1) * parsedLimit;

  // Find completed visits that have GPS data
  const query = {
    status: 'completed',
    'location.latitude': { $exists: true, $ne: null },
    'location.longitude': { $exists: true, $ne: null },
  };

  const [visits, total] = await Promise.all([
    Visit.find(query)
      .populate('doctor', 'firstName lastName clinicOfficeAddress location')
      .populate('user', 'name email')
      .sort({ visitDate: -1 })
      .skip(skip)
      .limit(parsedLimit)
      .lean(),
    Visit.countDocuments(query),
  ]);

  let stats = { verified: 0, suspicious: 0, noData: 0 };

  const enrichedVisits = visits.map((visit) => {
    const empLat = visit.location?.latitude;
    const empLng = visit.location?.longitude;
    const docCoords = visit.doctor?.location?.coordinates; // [lng, lat]

    let distance = null;
    let verification = 'no_data';

    if (
      empLat && empLng &&
      docCoords && docCoords.length === 2 &&
      (docCoords[0] !== 0 || docCoords[1] !== 0)
    ) {
      distance = Math.round(calculateHaversine(empLat, empLng, docCoords[1], docCoords[0]));
      verification = distance <= 400 ? 'verified' : 'suspicious';
    }

    if (verification === 'verified') stats.verified++;
    else if (verification === 'suspicious') stats.suspicious++;
    else stats.noData++;

    return {
      _id: visit._id,
      visitDate: visit.visitDate,
      user: visit.user,
      doctor: {
        _id: visit.doctor?._id,
        firstName: visit.doctor?.firstName,
        lastName: visit.doctor?.lastName,
        clinicOfficeAddress: visit.doctor?.clinicOfficeAddress,
      },
      employeeLocation: empLat && empLng ? { lat: empLat, lng: empLng } : null,
      clinicLocation:
        docCoords && docCoords.length === 2 && (docCoords[0] !== 0 || docCoords[1] !== 0)
          ? { lat: docCoords[1], lng: docCoords[0] }
          : null,
      accuracy: visit.location?.accuracy || null,
      distance,
      verification,
    };
  });

  // Filter by status if requested
  let filteredVisits = enrichedVisits;
  if (statusFilter && statusFilter !== 'all') {
    filteredVisits = enrichedVisits.filter((v) => v.verification === statusFilter);
  }

  res.json({
    success: true,
    data: filteredVisits,
    stats,
    pagination: {
      page: parseInt(page),
      limit: parsedLimit,
      total,
      pages: Math.ceil(total / parsedLimit),
    },
  });
});

module.exports = {
  createVisit,
  getAllVisits,
  getVisitById,
  updateVisit,
  cancelVisit,
  getVisitsByUser,
  getMyVisits,
  getWeeklyCompliance,
  checkCanVisit,
  checkCanVisitBatch,
  getComplianceAlerts,
  getVisitStats,
  getTodayVisits,
  refreshPhotoUrls,
  getEmployeeReport,
  getQuotaDumpingAlerts,
  getGPSReview,
};
