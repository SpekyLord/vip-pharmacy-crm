/**
 * Client Controller (Regular Clients)
 *
 * Handles CRUD for regular clients and their visits.
 * Key rules:
 * - BDMs can only see/edit their own clients (createdBy check)
 * - Admin can see all clients
 * - Same visit enforcement as VIP: weekly unique constraint + monthly limit
 * - Photo + GPS required per visit
 */

const Client = require('../models/Client');
const ClientVisit = require('../models/ClientVisit');
const { catchAsync, NotFoundError, ForbiddenError } = require('../middleware/errorHandler');
const { sanitizeSearchString } = require('../utils/controllerHelpers');
const { signVisitPhotos } = require('../config/s3');
const { getWeekOfMonth, getDayOfWeek, isWorkDay, MANILA_OFFSET_MS } = require('../utils/scheduleCycleUtils');

/**
 * Build access filter based on user role
 * - Admin: no filter (see all)
 * - Employee: only their own clients (createdBy)
 */
const getAccessFilter = (user) => {
  if (user.role === 'admin') {
    return {};
  }
  return { createdBy: user._id };
};

/**
 * @desc    Get all clients (region-filtered, BDM sees own only)
 * @route   GET /api/clients
 * @access  Private
 */
const getAllClients = catchAsync(async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const requestedLimit = parseInt(req.query.limit, 10);
  const limit = requestedLimit === 0 ? 0 : (requestedLimit || 20);
  const skip = limit === 0 ? 0 : (page - 1) * limit;

  const accessFilter = getAccessFilter(req.user);
  const filter = { isActive: true, ...accessFilter };

  // Search
  if (req.query.search) {
    const safeSearch = sanitizeSearchString(req.query.search);
    filter.$or = [
      { firstName: { $regex: safeSearch, $options: 'i' } },
      { lastName: { $regex: safeSearch, $options: 'i' } },
      { clinicOfficeAddress: { $regex: safeSearch, $options: 'i' } },
    ];
  }

  let query = Client.find(filter)
    .populate('createdBy', 'name email')
    .sort({ lastName: 1, firstName: 1 })
    .lean();

  if (limit > 0) {
    query = query.skip(skip).limit(limit);
  }

  // When fetching all (limit=0), skip countDocuments — use array.length instead
  let clients, total;
  if (limit === 0) {
    clients = await query;
    total = clients.length;
  } else {
    [clients, total] = await Promise.all([
      query,
      Client.countDocuments(filter),
    ]);
  }

  res.status(200).json({
    success: true,
    data: clients,
    pagination: {
      page,
      limit: limit || total,
      total,
      pages: limit > 0 ? Math.ceil(total / limit) : 1,
    },
  });
});

/**
 * @desc    Get client by ID
 * @route   GET /api/clients/:id
 * @access  Private (ownership check for BDMs)
 */
const getClientById = catchAsync(async (req, res) => {
  const client = await Client.findById(req.params.id)
    .populate('createdBy', 'name email');

  if (!client) {
    throw new NotFoundError('Client not found');
  }

  // Ownership check for BDMs
  if (req.user.role === 'employee') {
    if (client.createdBy._id.toString() !== req.user._id.toString()) {
      throw new ForbiddenError('You can only view your own clients');
    }
  }

  res.status(200).json({
    success: true,
    data: client,
  });
});

/**
 * @desc    Create new client
 * @route   POST /api/clients
 * @access  Private (Employee, Admin)
 */
const createClient = catchAsync(async (req, res) => {
  const {
    firstName,
    lastName,
    specialization,
    clinicOfficeAddress,
    phone,
    email,
    notes,
    schedulingMode,
    visitFrequency,
    weekSchedule,
    outletIndicator,
    programsToImplement,
    supportDuringCoverage,
    levelOfEngagement,
    secretaryName,
    secretaryPhone,
    birthday,
    anniversary,
    otherDetails,
  } = req.body;

  const clientData = {
    firstName,
    lastName,
    specialization,
    clinicOfficeAddress,
    phone,
    notes,
    createdBy: req.user._id,
  };

  if (email) clientData.email = email;
  if (schedulingMode) clientData.schedulingMode = schedulingMode;
  if (visitFrequency) clientData.visitFrequency = visitFrequency;
  if (weekSchedule) clientData.weekSchedule = weekSchedule;
  if (outletIndicator) clientData.outletIndicator = outletIndicator;
  if (programsToImplement) clientData.programsToImplement = programsToImplement;
  if (supportDuringCoverage) clientData.supportDuringCoverage = supportDuringCoverage;
  if (levelOfEngagement) clientData.levelOfEngagement = levelOfEngagement;
  if (secretaryName) clientData.secretaryName = secretaryName;
  if (secretaryPhone) clientData.secretaryPhone = secretaryPhone;
  if (birthday) clientData.birthday = birthday;
  if (anniversary) clientData.anniversary = anniversary;
  if (otherDetails) clientData.otherDetails = otherDetails;

  const client = await Client.create(clientData);

  await client.populate('createdBy', 'name email');

  res.status(201).json({
    success: true,
    message: 'Client created successfully',
    data: client,
  });
});

/**
 * @desc    Update client
 * @route   PUT /api/clients/:id
 * @access  Private (ownership check for BDMs)
 */
const updateClient = catchAsync(async (req, res) => {
  const client = await Client.findById(req.params.id);

  if (!client) {
    throw new NotFoundError('Client not found');
  }

  // Ownership check for BDMs
  if (req.user.role === 'employee') {
    if (client.createdBy.toString() !== req.user._id.toString()) {
      throw new ForbiddenError('You can only edit your own clients');
    }
  }

  const allowedFields = [
    'firstName',
    'lastName',
    'specialization',
    'clinicOfficeAddress',
    'phone',
    'email',
    'notes',
    'schedulingMode',
    'visitFrequency',
    'weekSchedule',
    'outletIndicator',
    'programsToImplement',
    'supportDuringCoverage',
    'levelOfEngagement',
    'secretaryName',
    'secretaryPhone',
    'birthday',
    'anniversary',
    'otherDetails',
  ];

  allowedFields.forEach((field) => {
    if (req.body[field] !== undefined) {
      client[field] = req.body[field];
    }
  });

  await client.save();
  await client.populate('createdBy', 'name email');

  res.status(200).json({
    success: true,
    message: 'Client updated successfully',
    data: client,
  });
});

/**
 * @desc    Delete client (soft delete)
 * @route   DELETE /api/clients/:id
 * @access  Private (ownership check for BDMs)
 */
const deleteClient = catchAsync(async (req, res) => {
  const client = await Client.findById(req.params.id);

  if (!client) {
    throw new NotFoundError('Client not found');
  }

  // Ownership check for BDMs
  if (req.user.role === 'employee') {
    if (client.createdBy.toString() !== req.user._id.toString()) {
      throw new ForbiddenError('You can only delete your own clients');
    }
  }

  client.isActive = false;
  await client.save();

  res.status(200).json({
    success: true,
    message: 'Client deactivated successfully',
  });
});

/**
 * @desc    Create a client visit (extra call)
 * @route   POST /api/clients/visits
 * @access  Private (Employee, Admin)
 */
const createClientVisit = catchAsync(async (req, res) => {
  const { client: clientId, visitDate, location, purpose, notes, engagementTypes } = req.body;

  // Parse location if it's a JSON string (from FormData)
  let locationData = location;
  if (typeof location === 'string') {
    try {
      locationData = JSON.parse(location);
    } catch (e) {
      locationData = null; // Discard invalid GPS, don't block the visit
    }
  }

  // Validate GPS coordinates bounds — skip silently if invalid (GPS is optional)
  if (locationData) {
    const lat = parseFloat(locationData.latitude);
    const lng = parseFloat(locationData.longitude);
    if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      locationData = null;
    }
  }

  // Verify client exists and BDM owns it
  const client = await Client.findById(clientId);
  if (!client || !client.isActive) {
    throw new NotFoundError('Client not found');
  }

  if (req.user.role === 'employee') {
    if (client.createdBy.toString() !== req.user._id.toString()) {
      throw new ForbiddenError('You can only log visits for your own clients');
    }
  }

  // Regular clients can be visited any day (including weekends) - no weekend restrictions
  const visitDateObj = visitDate ? new Date(visitDate) : new Date();
  const manilaVisitDate = new Date(visitDateObj.getTime() + MANILA_OFFSET_MS);
  const isWeekendVisit = manilaVisitDate.getUTCDay() === 0 || manilaVisitDate.getUTCDay() === 6;

  // Enforce weekly/monthly visit limits (only for strict mode)
  const visitMonth = `${visitDateObj.getFullYear()}-${String(visitDateObj.getMonth() + 1).padStart(2, '0')}`;

  if (client.schedulingMode === 'strict') {
    // Count how many times this client has been visited this month
    const monthlyCount = await ClientVisit.countDocuments({
      client: clientId,
      user: req.user._id,
      monthYear: visitMonth,
      status: 'completed',
    });

    const clientFreq = client.visitFrequency || 4;
    if (monthlyCount >= clientFreq) {
      return res.status(400).json({
        success: false,
        message: `Monthly visit limit reached for this client (${clientFreq}x/month)`,
        data: {
          monthlyCount,
          monthlyLimit: clientFreq,
        },
      });
    }
  }

  // Check photos
  if (!req.uploadedPhotos || req.uploadedPhotos.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'At least one photo is required as proof of visit.',
    });
  }

  // Parse photoMetadata if provided (from FormData)
  let photoMetadata = [];
  if (req.body.photoMetadata) {
    try {
      photoMetadata = typeof req.body.photoMetadata === 'string'
        ? JSON.parse(req.body.photoMetadata)
        : req.body.photoMetadata;
    } catch (e) {
      photoMetadata = [];
    }
  }

  // Build photos array with hash and source
  const photos = req.uploadedPhotos.map((photo, index) => {
    const metadata = photoMetadata[index] || {};
    return {
      url: photo.url,
      capturedAt: metadata.capturedAt ? new Date(metadata.capturedAt) : photo.capturedAt || new Date(),
      source: metadata.source || 'camera',
      hash: photo.hash,
    };
  });

  // Detect photo flags
  const photoFlags = [];
  const photoFlagDetails = [];
  const visitDateStart = new Date(visitDateObj);
  visitDateStart.setHours(0, 0, 0, 0);
  const visitDateEnd = new Date(visitDateObj);
  visitDateEnd.setHours(23, 59, 59, 999);

  // Check for date mismatch (photo taken on different day than visit)
  photos.forEach((photo, index) => {
    if (photo.capturedAt) {
      const photoDate = new Date(photo.capturedAt);
      if (photoDate < visitDateStart || photoDate > visitDateEnd) {
        if (!photoFlags.includes('date_mismatch')) {
          photoFlags.push('date_mismatch');
        }
        photoFlagDetails.push({
          flag: 'date_mismatch',
          photoIndex: index,
          detail: `Photo taken on ${photoDate.toISOString().split('T')[0]}, visit logged for ${visitDateObj.toISOString().split('T')[0]}`,
        });
      }
    }
  });

  // Check for duplicate photos (hash matches existing visits)
  const hashes = photos.map(p => p.hash).filter(Boolean);
  if (hashes.length > 0) {
    const Visit = require('../models/Visit');
    const [existingVisitPhotos, existingClientPhotos] = await Promise.all([
      Visit.find({ 'photos.hash': { $in: hashes } }).select('photos.hash').lean(),
      ClientVisit.find({ 'photos.hash': { $in: hashes } }).select('photos.hash').lean(),
    ]);

    const hashToVisit = new Map();
    existingVisitPhotos.forEach(v => v.photos.forEach(p => {
      if (p.hash && !hashToVisit.has(p.hash)) {
        hashToVisit.set(p.hash, { visitId: v._id, visitType: 'vip' });
      }
    }));
    existingClientPhotos.forEach(v => v.photos.forEach(p => {
      if (p.hash && !hashToVisit.has(p.hash)) {
        hashToVisit.set(p.hash, { visitId: v._id, visitType: 'regular' });
      }
    }));

    photos.forEach((photo, index) => {
      const match = photo.hash ? hashToVisit.get(photo.hash) : null;
      if (match) {
        if (!photoFlags.includes('duplicate_photo')) {
          photoFlags.push('duplicate_photo');
        }
        photoFlagDetails.push({
          flag: 'duplicate_photo',
          photoIndex: index,
          detail: 'This photo has been used in a previous visit',
          matchedVisitId: match.visitId,
          matchedVisitType: match.visitType,
        });
      }
    });
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

  const visitData = {
    client: clientId,
    user: req.user._id,
    visitDate: visitDateObj,
    photos,
    engagementTypes: engagementData || [],
    purpose,
    notes,
    status: 'completed',
    isWeekendVisit,
  };

  // Add photo flags if any
  if (photoFlags.length > 0) {
    visitData.photoFlags = photoFlags;
    visitData.photoFlagDetails = photoFlagDetails;
  }

  // Attach location if provided (optional)
  if (locationData && locationData.latitude != null && locationData.longitude != null) {
    visitData.location = {
      latitude: locationData.latitude,
      longitude: locationData.longitude,
      accuracy: locationData.accuracy,
      capturedAt: new Date(),
    };
  }

  const visit = await ClientVisit.create(visitData);

  await visit.populate('client', 'firstName lastName specialization clinicOfficeAddress');

  res.status(201).json({
    success: true,
    message: 'Extra call logged successfully',
    data: visit,
  });
});

/**
 * @desc    Get visits for a specific client
 * @route   GET /api/clients/:id/visits
 * @access  Private
 */
const getClientVisits = catchAsync(async (req, res) => {
  const client = await Client.findById(req.params.id);

  if (!client) {
    throw new NotFoundError('Client not found');
  }

  // Ownership check for BDMs
  if (req.user.role === 'employee') {
    if (client.createdBy.toString() !== req.user._id.toString()) {
      throw new ForbiddenError('You can only view visits for your own clients');
    }
  }

  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 20;
  const skip = (page - 1) * limit;

  const filter = { client: req.params.id };

  if (req.query.monthYear) {
    filter.monthYear = req.query.monthYear;
  }

  const [visits, total] = await Promise.all([
    ClientVisit.find(filter)
      .populate('user', 'name email')
      .sort({ visitDate: -1 })
      .skip(skip)
      .limit(limit),
    ClientVisit.countDocuments(filter),
  ]);

  // Skip photo signing in list view — photos signed on-demand in getClientVisitById
  res.status(200).json({
    success: true,
    data: visits,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  });
});

/**
 * @desc    Get current user's client visits (extra calls history)
 * @route   GET /api/clients/visits/my
 * @access  Private
 */
const getMyClientVisits = catchAsync(async (req, res) => {
  const { page = 1, limit = 20, monthYear, dateFrom, dateTo, search } = req.query;

  const query = { user: req.user._id };

  if (monthYear) {
    query.monthYear = monthYear;
  }

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

  const [visits, total] = await Promise.all([
    ClientVisit.find(query)
      .populate('client', 'firstName lastName specialization clinicOfficeAddress phone')
      .sort({ visitDate: -1 })
      .skip(skip)
      .limit(parseInt(limit)),
    ClientVisit.countDocuments(query),
  ]);

  // Filter by client name if search provided
  let filteredVisits = visits;
  if (search) {
    const searchLower = search.toLowerCase();
    filteredVisits = visits.filter((v) => {
      const fullName = `${v.client?.firstName || ''} ${v.client?.lastName || ''}`.toLowerCase();
      return (
        fullName.includes(searchLower) ||
        v.client?.clinicOfficeAddress?.toLowerCase().includes(searchLower)
      );
    });
  }

  // Skip photo signing in list view — photos signed on-demand in getClientVisitById
  res.status(200).json({
    success: true,
    data: filteredVisits,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total: search ? filteredVisits.length : total,
      pages: Math.ceil((search ? filteredVisits.length : total) / limit),
    },
  });
});

/**
 * @desc    Get a BDM's regular client visits (admin only)
 * @route   GET /api/clients/visits/by-user/:userId
 * @access  Admin
 */
const getClientVisitsByUser = catchAsync(async (req, res) => {
  const { userId } = req.params;
  const { page = 1, limit = 20, monthYear, dateFrom, dateTo } = req.query;

  const query = { user: userId };

  if (monthYear) query.monthYear = monthYear;

  if (dateFrom || dateTo) {
    query.visitDate = {};
    if (dateFrom) query.visitDate.$gte = new Date(dateFrom);
    if (dateTo) {
      const toDate = new Date(dateTo);
      toDate.setHours(23, 59, 59, 999);
      query.visitDate.$lte = toDate;
    }
  }

  const skip = (parseInt(page) - 1) * parseInt(limit);

  const [visits, total] = await Promise.all([
    ClientVisit.find(query)
      .populate('client', 'firstName lastName specialization clinicOfficeAddress phone')
      .populate('user', 'name email')
      .sort({ visitDate: -1 })
      .skip(skip)
      .limit(parseInt(limit)),
    ClientVisit.countDocuments(query),
  ]);

  const signedVisits = await Promise.all(visits.map((visit) => signVisitPhotos(visit)));

  res.status(200).json({
    success: true,
    data: signedVisits,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / parseInt(limit)),
    },
  });
});

/**
 * @desc    Get today's client visit count for current user
 * @route   GET /api/clients/visit-count/today
 * @access  Private
 */
const getTodayClientVisitCount = catchAsync(async (req, res) => {
  const dailyCount = await ClientVisit.countDailyVisits(req.user._id, new Date());

  res.status(200).json({
    success: true,
    data: {
      dailyCount,
    },
  });
});

/**
 * @desc    Get regular client visit statistics
 * @route   GET /api/clients/visits/stats
 * @access  Private
 */
const getClientVisitStats = catchAsync(async (req, res) => {
  const { monthYear, userId } = req.query;
  const mongoose = require('mongoose');

  const matchQuery = {};

  // Role-based filtering
  if (req.user.role === 'employee') {
    matchQuery.user = req.user._id;
  } else if (userId) {
    matchQuery.user = new mongoose.Types.ObjectId(userId);
  }

  // Month/year filtering
  if (monthYear) {
    matchQuery.monthYear = monthYear;
  }

  // Aggregation to get stats
  const [result] = await ClientVisit.aggregate([
    { $match: matchQuery },
    {
      $facet: {
        summary: [
          {
            $group: {
              _id: null,
              totalVisits: { $sum: 1 },
              uniqueClients: { $addToSet: '$client' },
            },
          },
          {
            $project: {
              _id: 0,
              totalVisits: 1,
              uniqueClientsCount: { $size: '$uniqueClients' },
            },
          },
        ],
        weeklyBreakdown: [
          {
            $group: {
              _id: '$weekOfMonth',
              count: { $sum: 1 },
              uniqueClients: { $addToSet: '$client' },
            },
          },
          {
            $project: {
              week: '$_id',
              visitCount: '$count',
              clientCount: { $size: '$uniqueClients' },
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
        uniqueClientsCount: 0,
      },
      weeklyBreakdown: result?.weeklyBreakdown || [],
    },
  });
});

/**
 * @desc    Get strict-mode regular clients scheduled for today
 * @route   GET /api/clients/scheduled/today
 * @access  Private (Employee, Admin)
 */
const getScheduledToday = catchAsync(async (req, res) => {
  const now = new Date();

  // Only return results on work days
  if (!isWorkDay(now)) {
    return res.json({ success: true, data: [], count: 0 });
  }

  const currentWeek = getWeekOfMonth(now); // 1-4
  const currentDay = getDayOfWeek(now);    // 1-5 (Mon-Fri)
  const weekKey = `w${currentWeek}`;       // e.g. "w2"

  // Find strict-mode clients owned by this BDM whose weekSchedule matches today
  const filter = {
    isActive: true,
    schedulingMode: 'strict',
    [`weekSchedule.${weekKey}`]: currentDay,
  };

  // BDMs see only their own; admin sees all
  if (req.user.role !== 'admin') {
    filter.createdBy = req.user._id;
  }

  const clients = await Client.find(filter)
    .populate('createdBy', 'name email')
    .sort({ lastName: 1, firstName: 1 })
    .lean();

  // Check which clients have already been visited this week
  if (clients.length > 0) {
    const clientIds = clients.map(c => c._id);

    // Compute yearWeekKey the same way ClientVisit pre-save does (ISO week)
    const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNumber = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
    const weekYear = d.getUTCFullYear();
    const yearWeekKey = `${weekYear}-W${String(weekNumber).padStart(2, '0')}`;

    const visits = await ClientVisit.find({
      client: { $in: clientIds },
      user: req.user._id,
      yearWeekKey,
      status: 'completed',
    }).select('client').lean();
    const visitedIds = new Set(visits.map(v => v.client.toString()));

    // Annotate each client with visitedThisWeek flag
    clients.forEach(c => {
      c.visitedThisWeek = visitedIds.has(c._id.toString());
      c.scheduledLabel = `W${currentWeek}D${currentDay}`;
    });
  }

  res.json({
    success: true,
    data: clients,
    count: clients.length,
  });
});

/**
 * @desc    Get client visit by ID
 * @route   GET /api/clients/visits/:visitId
 * @access  Private (ownership check for BDMs)
 */
const getClientVisitById = catchAsync(async (req, res) => {
  const visit = await ClientVisit.findById(req.params.visitId)
    .populate('client', 'firstName lastName specialization clinicOfficeAddress')
    .populate('user', 'name email');

  if (!visit) {
    throw new NotFoundError('Client visit not found');
  }

  // Ownership check for BDMs
  if (req.user.role === 'employee') {
    if (visit.user._id.toString() !== req.user._id.toString()) {
      throw new ForbiddenError('You can only view your own visits');
    }
  }

  // Sign photo URLs
  const signedVisit = await signVisitPhotos(visit);

  res.status(200).json({
    success: true,
    data: signedVisit,
  });
});

/**
 * @desc    Refresh photo URLs for a client visit (re-sign S3 URLs)
 * @route   GET /api/clients/visits/:visitId/refresh-photos
 * @access  Private (ownership check for BDMs)
 */
const refreshClientVisitPhotos = catchAsync(async (req, res) => {
  const visit = await ClientVisit.findById(req.params.visitId);

  if (!visit) {
    throw new NotFoundError('Client visit not found');
  }

  // Check if user has access to this visit
  if (req.user.role !== 'admin' && visit.user.toString() !== req.user._id.toString()) {
    throw new ForbiddenError('You do not have permission to access this visit');
  }

  // Re-sign photo URLs
  const signedVisit = await signVisitPhotos(visit);

  res.status(200).json({
    success: true,
    message: 'Photo URLs refreshed successfully',
    data: signedVisit,
  });
});

module.exports = {
  getAllClients,
  getClientById,
  createClient,
  updateClient,
  deleteClient,
  createClientVisit,
  getClientVisits,
  getClientVisitById,
  refreshClientVisitPhotos,
  getMyClientVisits,
  getClientVisitsByUser,
  getTodayClientVisitCount,
  getClientVisitStats,
  getScheduledToday,
};
