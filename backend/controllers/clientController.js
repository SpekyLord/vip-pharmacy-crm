/**
 * Client Controller (Regular / Non-VIP Clients)
 *
 * Handles CRUD for regular clients and their visits (extra calls).
 * Key rules:
 * - BDMs can only see/edit their own clients (createdBy check)
 * - Admin can see all clients
 * - Daily limit: 30 extra calls per day (hard block)
 * - Photo + GPS required per visit
 */

const Client = require('../models/Client');
const ClientVisit = require('../models/ClientVisit');
const { catchAsync, NotFoundError, ForbiddenError } = require('../middleware/errorHandler');
const { signVisitPhotos } = require('../config/s3');

const DAILY_EXTRA_CALL_LIMIT = 30;

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
    filter.$or = [
      { firstName: { $regex: req.query.search, $options: 'i' } },
      { lastName: { $regex: req.query.search, $options: 'i' } },
      { clinicOfficeAddress: { $regex: req.query.search, $options: 'i' } },
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
    notes,
  } = req.body;

  const client = await Client.create({
    firstName,
    lastName,
    specialization,
    clinicOfficeAddress,
    phone,
    notes,
    createdBy: req.user._id,
  });

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
    'notes',
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
      return res.status(400).json({
        success: false,
        message: 'Invalid location data format',
      });
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

  // Enforce 30 daily extra call limit
  const visitDateObj = visitDate ? new Date(visitDate) : new Date();
  const dailyCount = await ClientVisit.countDailyVisits(req.user._id, visitDateObj);

  if (dailyCount >= DAILY_EXTRA_CALL_LIMIT) {
    return res.status(400).json({
      success: false,
      message: `Daily extra call limit reached (${DAILY_EXTRA_CALL_LIMIT}/day). You cannot log more extra calls today.`,
      data: {
        dailyCount,
        dailyLimit: DAILY_EXTRA_CALL_LIMIT,
        remaining: 0,
      },
    });
  }

  // Check photos
  if (!req.uploadedPhotos || req.uploadedPhotos.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'At least one photo is required as proof of visit.',
    });
  }

  const photos = req.uploadedPhotos.map((photo) => ({
    url: photo.url,
    capturedAt: photo.capturedAt || new Date(),
  }));

  // Parse engagementTypes if it's a JSON string (from FormData)
  let engagementData = engagementTypes;
  if (typeof engagementTypes === 'string') {
    try {
      engagementData = JSON.parse(engagementTypes);
    } catch (e) {
      engagementData = [];
    }
  }

  const visit = await ClientVisit.create({
    client: clientId,
    user: req.user._id,
    visitDate: visitDateObj,
    location: {
      latitude: locationData.latitude,
      longitude: locationData.longitude,
      accuracy: locationData.accuracy,
      capturedAt: new Date(),
    },
    photos,
    engagementTypes: engagementData || [],
    purpose,
    notes,
    status: 'completed',
  });

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

  // Sign photo URLs
  const signedVisits = await Promise.all(visits.map((visit) => signVisitPhotos(visit)));

  res.status(200).json({
    success: true,
    data: signedVisits,
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

  // Sign photo URLs
  const signedVisits = await Promise.all(filteredVisits.map((visit) => signVisitPhotos(visit)));

  res.status(200).json({
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
      dailyLimit: DAILY_EXTRA_CALL_LIMIT,
      remaining: Math.max(0, DAILY_EXTRA_CALL_LIMIT - dailyCount),
    },
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
  getMyClientVisits,
  getTodayClientVisitCount,
};
