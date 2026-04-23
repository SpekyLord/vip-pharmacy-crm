/**
 * CLM Controller
 *
 * Handles Closed Loop Marketing session CRUD and analytics:
 * - Start / end / update sessions
 * - Record slide events
 * - Product selection and interest tracking (scalable, from CRM)
 * - Mark QR scanned (webhook-ready)
 * - Analytics aggregation for admin dashboard
 */
const CLMSession = require('../models/CLMSession');
const CrmProduct = require('../models/CrmProduct');

// ── Helpers ─────────────────────────────────────────────────────────
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ── Start a new CLM session ───────────────────────────────────────
const startSession = asyncHandler(async (req, res) => {
  const { doctorId, location, productIds } = req.body;
  if (!doctorId) {
    return res.status(400).json({ success: false, message: 'doctorId is required' });
  }

  // Idempotency check — prevent duplicate offline syncs
  // If client sends X-Idempotency-Key header, check if a session with that key already exists.
  // If so, return 409 Conflict so the client knows to delete the draft.
  const idempotencyKey = req.headers['x-idempotency-key'];
  if (idempotencyKey) {
    const existing = await CLMSession.findOne({ idempotencyKey }).lean();
    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'Duplicate session — already synced.',
        data: existing,
      });
    }
  }

  // Build productsPresented with snapshot data from CRM
  let productsPresented = [];
  if (productIds && Array.isArray(productIds) && productIds.length > 0) {
    const products = await CrmProduct.find({
      _id: { $in: productIds },
      isActive: true,
    }).lean();

    productsPresented = products.map((p) => ({
      product: p._id,
      productName: p.name,
      productGenericName: p.genericName || '',
      productDosage: p.dosage || '',
      productImage: p.image || '',
      interestShown: false,
      timeSpentMs: 0,
      notes: '',
    }));
  }

  const session = await CLMSession.create({
    user: req.user._id,
    doctor: doctorId,
    startedAt: new Date(),
    location: location || {},
    productsPresented,
    status: 'in_progress',
    ...(idempotencyKey ? { idempotencyKey } : {}),
  });

  // Build the Messenger ref for QR tracking
  const messengerRef = `CLM_${session._id}_${doctorId}_${req.user._id}`;
  session.messengerRef = messengerRef;
  await session.save();

  // Return with populated refs
  const populated = await CLMSession.findById(session._id)
    .populate('doctor', 'firstName lastName specialization clinicOfficeAddress');

  res.status(201).json({ success: true, data: populated });
});

// ── End / complete a session ────────────────────────────────────────
const endSession = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { interestLevel, bdmNotes, followUpDate, outcome, productsPresented } = req.body;

  const session = await CLMSession.findById(id);
  if (!session) {
    return res.status(404).json({ success: false, message: 'Session not found' });
  }

  session.endedAt = new Date();
  session.totalDurationMs = session.endedAt - session.startedAt;
  session.status = 'completed';
  session.slidesViewedCount = new Set(session.slideEvents.map((e) => e.slideIndex)).size;

  if (interestLevel) session.interestLevel = interestLevel;
  if (bdmNotes) session.bdmNotes = bdmNotes;
  if (followUpDate) session.followUpDate = followUpDate;
  if (outcome) session.outcome = outcome;

  // Update product interest data if provided
  if (productsPresented && Array.isArray(productsPresented)) {
    for (const update of productsPresented) {
      const existing = session.productsPresented.find(
        (p) => p.product.toString() === update.productId
      );
      if (existing) {
        if (update.interestShown !== undefined) existing.interestShown = update.interestShown;
        if (update.timeSpentMs !== undefined) existing.timeSpentMs = update.timeSpentMs;
        if (update.notes !== undefined) existing.notes = update.notes;
      }
    }
  }

  await session.save();
  res.json({ success: true, data: session });
});

// ── Add products to an in-progress session ──────────────────────────
const addProducts = asyncHandler(async (req, res) => {
  const session = await CLMSession.findById(req.params.id);
  if (!session) {
    return res.status(404).json({ success: false, message: 'Session not found' });
  }

  const { productIds } = req.body;
  if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
    return res.status(400).json({ success: false, message: 'productIds array is required' });
  }

  // Fetch product data and add only new ones (avoid duplicates)
  const existingIds = new Set(session.productsPresented.map((p) => p.product.toString()));
  const newIds = productIds.filter((id) => !existingIds.has(id));

  if (newIds.length > 0) {
    const products = await CrmProduct.find({
      _id: { $in: newIds },
      isActive: true,
    }).lean();

    const newEntries = products.map((p) => ({
      product: p._id,
      productName: p.name,
      productGenericName: p.genericName || '',
      productDosage: p.dosage || '',
      productImage: p.image || '',
      interestShown: false,
      timeSpentMs: 0,
      notes: '',
    }));

    session.productsPresented.push(...newEntries);
    await session.save();
  }

  res.json({ success: true, data: session });
});

// ── Update product interest for a session ───────────────────────────
const updateProductInterest = asyncHandler(async (req, res) => {
  const session = await CLMSession.findById(req.params.id);
  if (!session) {
    return res.status(404).json({ success: false, message: 'Session not found' });
  }

  const { productId, interestShown, timeSpentMs, notes } = req.body;
  if (!productId) {
    return res.status(400).json({ success: false, message: 'productId is required' });
  }

  const entry = session.productsPresented.find(
    (p) => p.product.toString() === productId
  );

  if (!entry) {
    return res.status(404).json({ success: false, message: 'Product not found in this session' });
  }

  if (interestShown !== undefined) entry.interestShown = interestShown;
  if (timeSpentMs !== undefined) entry.timeSpentMs = timeSpentMs;
  if (notes !== undefined) entry.notes = notes;

  await session.save();
  res.json({ success: true, data: session });
});

// ── Record slide events (batch) ─────────────────────────────────────
const recordSlideEvents = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { slideEvents } = req.body;

  const session = await CLMSession.findById(id);
  if (!session) {
    return res.status(404).json({ success: false, message: 'Session not found' });
  }

  if (Array.isArray(slideEvents)) {
    session.slideEvents.push(...slideEvents);
    session.slidesViewedCount = new Set(
      session.slideEvents.map((e) => e.slideIndex)
    ).size;
  }

  await session.save();
  res.json({ success: true, data: session });
});

// ── Mark QR as displayed ────────────────────────────────────────────
const markQrDisplayed = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const session = await CLMSession.findById(id);
  if (!session) {
    return res.status(404).json({ success: false, message: 'Session not found' });
  }
  session.qrDisplayedAt = new Date();
  await session.save();
  res.json({ success: true, data: session });
});

// ── Mark QR as scanned (called by Messenger webhook or manually) ────
const markQrScanned = asyncHandler(async (req, res) => {
  const { messengerRef } = req.body;

  let session;
  if (messengerRef) {
    session = await CLMSession.findOne({ messengerRef });
  } else if (req.params.id) {
    session = await CLMSession.findById(req.params.id);
  }

  if (!session) {
    return res.status(404).json({ success: false, message: 'Session not found' });
  }

  session.qrScanned = true;
  session.qrScannedAt = new Date();
  await session.save();
  res.json({ success: true, data: session });
});

// ── Get my sessions (BDM) ───────────────────────────────────────────
const getMySessions = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, status, doctorId } = req.query;
  const filter = { user: req.user._id };
  if (status) filter.status = status;
  if (doctorId) filter.doctor = doctorId;

  const sessions = await CLMSession.find(filter)
    .populate('doctor', 'firstName lastName specialization clinicOfficeAddress')
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(Number(limit));

  const total = await CLMSession.countDocuments(filter);

  res.json({
    success: true,
    data: sessions,
    pagination: { page: Number(page), limit: Number(limit), total },
  });
});

// ── Get all sessions (admin) ────────────────────────────────────────
const getAllSessions = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, status, userId, doctorId } = req.query;
  const filter = {};
  if (status) filter.status = status;
  if (userId) filter.user = userId;
  if (doctorId) filter.doctor = doctorId;

  const sessions = await CLMSession.find(filter)
    .populate('user', 'firstName lastName')
    .populate('doctor', 'firstName lastName specialization clinicOfficeAddress')
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(Number(limit));

  const total = await CLMSession.countDocuments(filter);

  res.json({
    success: true,
    data: sessions,
    pagination: { page: Number(page), limit: Number(limit), total },
  });
});

// ── Get single session detail ───────────────────────────────────────
const getSessionById = asyncHandler(async (req, res) => {
  const session = await CLMSession.findById(req.params.id)
    .populate('user', 'firstName lastName')
    .populate('doctor', 'firstName lastName specialization clinicOfficeAddress')
    .populate('productsPresented.product', 'name genericName dosage category image');

  if (!session) {
    return res.status(404).json({ success: false, message: 'Session not found' });
  }
  res.json({ success: true, data: session });
});

// ── Analytics summary ───────────────────────────────────────────────
const getAnalytics = asyncHandler(async (req, res) => {
  const { startDate, endDate, userId } = req.query;
  const match = { status: 'completed' };
  if (startDate || endDate) {
    match.createdAt = {};
    if (startDate) match.createdAt.$gte = new Date(startDate);
    if (endDate) match.createdAt.$lte = new Date(endDate);
  }
  if (userId) match.user = new (require('mongoose').Types.ObjectId)(userId);

  const [summary] = await CLMSession.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        totalSessions: { $sum: 1 },
        avgDurationMs: { $avg: '$totalDurationMs' },
        avgInterestLevel: { $avg: '$interestLevel' },
        avgSlidesViewed: { $avg: '$slidesViewedCount' },
        qrDisplayedCount: { $sum: { $cond: [{ $ifNull: ['$qrDisplayedAt', false] }, 1, 0] } },
        qrScannedCount: { $sum: { $cond: ['$qrScanned', 1, 0] } },
        interestedCount: { $sum: { $cond: [{ $eq: ['$outcome', 'interested'] }, 1, 0] } },
        maybeCount: { $sum: { $cond: [{ $eq: ['$outcome', 'maybe'] }, 1, 0] } },
        notInterestedCount: { $sum: { $cond: [{ $eq: ['$outcome', 'not_interested'] }, 1, 0] } },
      },
    },
  ]);

  // Slide-level heatmap
  const slideHeatmap = await CLMSession.aggregate([
    { $match: match },
    { $unwind: '$slideEvents' },
    {
      $group: {
        _id: '$slideEvents.slideIndex',
        avgDurationMs: { $avg: '$slideEvents.durationMs' },
        viewCount: { $sum: 1 },
        slideTitle: { $first: '$slideEvents.slideTitle' },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  // Top BDMs by conversion
  const topBdms = await CLMSession.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$user',
        totalSessions: { $sum: 1 },
        conversions: { $sum: { $cond: ['$qrScanned', 1, 0] } },
        avgInterest: { $avg: '$interestLevel' },
      },
    },
    { $sort: { conversions: -1 } },
    { $limit: 10 },
    {
      $lookup: {
        from: 'users',
        localField: '_id',
        foreignField: '_id',
        as: 'bdm',
      },
    },
    { $unwind: '$bdm' },
    {
      $project: {
        bdmName: { $concat: ['$bdm.firstName', ' ', '$bdm.lastName'] },
        totalSessions: 1,
        conversions: 1,
        avgInterest: 1,
        conversionRate: {
          $cond: [
            { $gt: ['$totalSessions', 0] },
            { $multiply: [{ $divide: ['$conversions', '$totalSessions'] }, 100] },
            0,
          ],
        },
      },
    },
  ]);

  // Product interest analytics — which products generate the most interest
  const productAnalytics = await CLMSession.aggregate([
    { $match: match },
    { $unwind: '$productsPresented' },
    {
      $group: {
        _id: '$productsPresented.product',
        productName: { $first: '$productsPresented.productName' },
        timesPresentedCount: { $sum: 1 },
        interestCount: { $sum: { $cond: ['$productsPresented.interestShown', 1, 0] } },
        avgTimeSpentMs: { $avg: '$productsPresented.timeSpentMs' },
      },
    },
    {
      $addFields: {
        interestRate: {
          $cond: [
            { $gt: ['$timesPresentedCount', 0] },
            { $multiply: [{ $divide: ['$interestCount', '$timesPresentedCount'] }, 100] },
            0,
          ],
        },
      },
    },
    { $sort: { interestCount: -1 } },
    { $limit: 20 },
  ]);

  res.json({
    success: true,
    data: {
      summary: summary || {
        totalSessions: 0,
        avgDurationMs: 0,
        avgInterestLevel: 0,
        avgSlidesViewed: 0,
        qrDisplayedCount: 0,
        qrScannedCount: 0,
        interestedCount: 0,
        maybeCount: 0,
        notInterestedCount: 0,
      },
      slideHeatmap,
      topBdms,
      productAnalytics,
    },
  });
});

module.exports = {
  startSession,
  endSession,
  addProducts,
  updateProductInterest,
  recordSlideEvents,
  markQrDisplayed,
  markQrScanned,
  getMySessions,
  getAllSessions,
  getSessionById,
  getAnalytics,
};
