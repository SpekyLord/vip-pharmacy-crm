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
const { catchAsync, NotFoundError } = require('../middleware/errorHandler');
const { canVisitDoctor, getComplianceReport, checkBehindSchedule, getMonthYear } = require('../utils/validateWeeklyVisit');

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

  const visitDateObj = visitDate ? new Date(visitDate) : new Date();

  // Check if user can visit this doctor (weekly and monthly limits)
  const visitCheck = await canVisitDoctor(doctorId, req.user._id, visitDateObj);

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
      latitude: location.latitude,
      longitude: location.longitude,
      accuracy: location.accuracy,
      capturedAt: new Date(),
    },
    photos,
    productsDiscussed,
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
 * @desc    Get visit by ID
 * @route   GET /api/visits/:id
 * @access  Private
 */
const getVisitById = catchAsync(async (req, res) => {
  const visit = await Visit.findById(req.params.id)
    .populate('doctor', 'name specialization hospital address phone')
    .populate('user', 'name email')
    .populate('productsDiscussed.product', 'name briefDescription image');

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

  res.json({
    success: true,
    data: visit,
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
 * @route   GET /api/visits/weekly-compliance/:userId
 * @access  Private
 */
const getWeeklyCompliance = catchAsync(async (req, res) => {
  const { userId } = req.params;
  const { monthYear } = req.query;

  // Check access
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

  res.json({
    success: true,
    data: visits,
    count: visits.length,
  });
});

module.exports = {
  createVisit,
  getAllVisits,
  getVisitById,
  updateVisit,
  cancelVisit,
  getVisitsByUser,
  getWeeklyCompliance,
  checkCanVisit,
  getComplianceAlerts,
  getVisitStats,
  getTodayVisits,
};
