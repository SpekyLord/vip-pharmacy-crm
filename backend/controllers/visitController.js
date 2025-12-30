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
const { getWebsiteProductModel } = require('../models/WebsiteProduct');
const { catchAsync, NotFoundError } = require('../middleware/errorHandler');
const { canVisitDoctor, canVisitDoctorsBatch, getComplianceReport, checkBehindSchedule, getMonthYear } = require('../utils/validateWeeklyVisit');
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

  // Parse productsDiscussed if it's a JSON string (from FormData)
  let productsData = productsDiscussed;
  if (typeof productsDiscussed === 'string') {
    try {
      productsData = JSON.parse(productsDiscussed);
    } catch (e) {
      productsData = [];
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

  // Prepare photos array
  const photos = req.uploadedPhotos.map((photo) => ({
    url: photo.url,
    capturedAt: photo.capturedAt || new Date(),
  }));

  // Create visit
  const visit = await Visit.create({
    doctor: doctorId,
    user: req.user._id,
    visitDate: visitDateObj,
    visitType: visitType || 'regular',
    location: {
      latitude: locationData.latitude,
      longitude: locationData.longitude,
      accuracy: locationData.accuracy,
      capturedAt: new Date(),
    },
    photos,
    productsDiscussed: productsData,
    purpose,
    doctorFeedback,
    notes,
    duration,
    nextVisitDate,
    status: 'completed',
  });

  // Populate doctor info for response
  await visit.populate('doctor', 'name specialization hospital');

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

  const skip = (page - 1) * limit;

  const [visits, total] = await Promise.all([
    Visit.find(query)
      .populate('doctor', 'name specialization hospital')
      .populate('user', 'name email')
      .sort({ visitDate: -1 })
      .skip(skip)
      .limit(parseInt(limit)),
    Visit.countDocuments(query),
  ]);

  // Sign photo URLs for private S3 access
  const signedVisits = await Promise.all(visits.map((visit) => signVisitPhotos(visit)));

  res.json({
    success: true,
    data: signedVisits,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / limit),
    },
  });
});

/**
 * @desc    Get visit by ID
 * @route   GET /api/visits/:id
 * @access  Private
 */
const getVisitById = catchAsync(async (req, res) => {
  // Note: productsDiscussed.product is NOT populated because products are in a separate database
  const visit = await Visit.findById(req.params.id)
    .populate('doctor', 'name specialization hospital address phone')
    .populate('user', 'name email');

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

  // Manually populate product data from website database
  const visitObj = visit.toObject();
  if (visitObj.productsDiscussed?.length > 0) {
    const productIds = visitObj.productsDiscussed.map((item) => item.product);
    const Product = getWebsiteProductModel();
    const products = await Product.find({ _id: { $in: productIds } })
      .select('name category briefDescription image')
      .lean();
    const productMap = new Map(products.map((p) => [p._id.toString(), p]));

    visitObj.productsDiscussed = visitObj.productsDiscussed.map((item) => ({
      ...item,
      product: productMap.get(item.product?.toString()) || { _id: item.product },
    }));
  }

  // Sign photo URLs for private S3 access
  const signedVisit = await signVisitPhotos(visitObj);

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
  ).populate('doctor', 'name specialization hospital');

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
      .populate('doctor', 'name specialization hospital')
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

  const stats = await Visit.aggregate([
    { $match: matchQuery },
    {
      $group: {
        _id: null,
        totalVisits: { $sum: 1 },
        uniqueDoctors: { $addToSet: '$doctor' },
        avgDuration: { $avg: '$duration' },
        visitsByType: {
          $push: '$visitType',
        },
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
  ]);

  // Get weekly breakdown
  const weeklyBreakdown = await Visit.aggregate([
    { $match: matchQuery },
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
  ]);

  res.json({
    success: true,
    data: {
      summary: stats[0] || {
        totalVisits: 0,
        uniqueDoctorsCount: 0,
        avgDuration: 0,
      },
      weeklyBreakdown,
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
  }).populate('doctor', 'name specialization hospital');

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

  const skip = (page - 1) * limit;

  // Build the base query
  // Note: productsDiscussed.product is NOT populated because products are in a separate database
  let visitQuery = Visit.find(query)
    .populate('doctor', 'name specialization hospital')
    .sort({ visitDate: -1 })
    .skip(skip)
    .limit(parseInt(limit));

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

  // Manually populate product data from website database
  const allProductIds = new Set();
  filteredVisits.forEach((visit) => {
    visit.productsDiscussed?.forEach((item) => {
      if (item.product) allProductIds.add(item.product.toString());
    });
  });

  let productMap = new Map();
  if (allProductIds.size > 0) {
    const Product = getWebsiteProductModel();
    const products = await Product.find({ _id: { $in: [...allProductIds] } })
      .select('name category briefDescription image')
      .lean();
    productMap = new Map(products.map((p) => [p._id.toString(), p]));
  }

  // Enrich visits with product data
  const enrichedVisits = filteredVisits.map((visit) => {
    const visitObj = visit.toObject ? visit.toObject() : visit;
    if (visitObj.productsDiscussed?.length > 0) {
      visitObj.productsDiscussed = visitObj.productsDiscussed.map((item) => ({
        ...item,
        product: productMap.get(item.product?.toString()) || { _id: item.product },
      }));
    }
    return visitObj;
  });

  // Sign photo URLs for private S3 access
  const signedVisits = await Promise.all(enrichedVisits.map((visit) => signVisitPhotos(visit)));

  res.json({
    success: true,
    data: signedVisits,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total: search ? signedVisits.length : total,
      pages: Math.ceil((search ? signedVisits.length : total) / limit),
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
  const employee = await User.findById(userId).populate('assignedRegions', 'name');

  if (!employee) {
    throw new NotFoundError('Employee not found');
  }

  // Get all region IDs the employee has access to (including descendants)
  const Region = require('../models/Region');
  const allRegionIds = [];

  for (const region of employee.assignedRegions) {
    const descendants = await Region.getDescendantIds(region._id);
    allRegionIds.push(...descendants);
  }

  // Remove duplicates
  const uniqueRegionIds = [...new Set(allRegionIds.map((id) => id.toString()))];

  // Fetch all doctors in those regions
  const doctors = await Doctor.find({
    region: { $in: uniqueRegionIds },
    isActive: true,
  })
    .select('name specialization hospital region visitFrequency')
    .populate('region', 'name')
    .lean();

  // Fetch all visits by this employee for the selected month
  const visits = await Visit.find({
    user: userId,
    monthYear: monthYear,
    status: 'completed',
  })
    .select('doctor visitDate weekOfMonth dayOfWeek productsDiscussed')
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

  // Fetch product details from website database
  const productIds = [...new Set(assignments.map((a) => a.product.toString()))];
  let productMap = new Map();

  if (productIds.length > 0) {
    const Product = getWebsiteProductModel();
    const products = await Product.find({ _id: { $in: productIds } })
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
      name: doctor.name,
      specialization: doctor.specialization,
      hospital: doctor.hospital,
      region: doctor.region,
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

  // Get region names for display
  const regionNames = employee.assignedRegions.map((r) => r.name).join(', ') || 'No regions assigned';

  res.json({
    success: true,
    data: {
      employee: {
        _id: employee._id,
        name: employee.name,
        email: employee.email,
        assignedRegions: employee.assignedRegions,
      },
      monthYear: monthYear,
      areaAssigned: regionNames,
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
};
