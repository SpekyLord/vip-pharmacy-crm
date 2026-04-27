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
const { isAdminLike, isPresidentLike } = require('../constants/roles');

// ── Helpers ─────────────────────────────────────────────────────────
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Ownership gate. Admin-like roles (admin/finance/president/ceo) see every
// session; contractors see only their own. Caller sends the 403 so each
// handler can early-return cleanly.
// Handles both raw ObjectId (plain find) and populated user sub-doc
// (getSessionById populates name fields) by reading `._id || self`.
const ownsOrAdmin = (session, req) => {
  if (!session || !req.user) return false;
  if (isAdminLike(req.user.role)) return true;
  const ownerId = session.user && session.user._id ? session.user._id : session.user;
  if (!ownerId) return false;
  return ownerId.toString() === req.user._id.toString();
};

// Resolve the entity filter for a CLM read/write.
//
// Rule #21 alignment — privileged users (president/CEO) must NOT be silently
// filtered to their own working entity; that's the same anti-pattern that
// produced the "admin sees empty list" bug G4.5d plugged. Instead:
//   - president / ceo → cross-entity by default (null = no filter).
//                       Honor explicit ?entity_id=<X> when they want to scope.
//   - admin / finance → working entity by default.
//                       Honor explicit ?entity_id=<X> to override to another entity.
//   - contractor + everyone else → working entity, no override (they can't
//                                  cross-entity no matter what query param they pass).
//
// Role groupings come from backend/constants/roles.js (ROLE_SETS). A future PR
// can promote those constants to a CROSS_ENTITY_VIEW_ROLES lookup when more
// CRM models get entity-scoped — one lookup covering all models is cheaper
// than a bespoke one per model.
const resolveEntityId = (req) => {
  const role = req.user?.role;
  const queryOverride = typeof req.query?.entity_id === 'string' && req.query.entity_id.trim()
    ? req.query.entity_id.trim()
    : null;

  // President / CEO — cross-entity by default. Explicit query param narrows.
  if (isPresidentLike(role)) {
    return queryOverride;
  }

  // Admin / finance — working entity by default, can override to another entity.
  if (isAdminLike(role) && queryOverride) {
    return queryOverride;
  }

  // Contractors + default admin/finance — working entity, no cross-entity view.
  return req.user?.entity_id
    || (Array.isArray(req.user?.entity_ids) && req.user.entity_ids[0])
    || null;
};

// ── Start a new CLM session ───────────────────────────────────────
const startSession = asyncHandler(async (req, res) => {
  const { doctorId, location, productIds, mode } = req.body;
  if (!doctorId) {
    return res.status(400).json({ success: false, message: 'doctorId is required' });
  }

  // Phase N — mode validation. 'in_person' (default) keeps the existing
  // behavior; 'remote' is for shareable deck links sent via Viber/Messenger/
  // WhatsApp from the BDM's CommLog page. Any other value falls back to
  // 'in_person' (avoids 400 on a hostile/buggy client value).
  const sessionMode = mode === 'remote' ? 'remote' : 'in_person';

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

  // Race-safe create: two concurrent offline syncs with the same idempotency
  // key can both pass the findOne() check above, then race on insert. The
  // sparse unique index on idempotencyKey guarantees only one wins (the other
  // hits E11000). Convert that duplicate-key error into a clean 409 — same
  // shape as the pre-check path — instead of surfacing a 500.
  const entityId = resolveEntityId(req);
  let session;
  try {
    session = await CLMSession.create({
      user: req.user._id,
      doctor: doctorId,
      ...(entityId ? { entity_id: entityId } : {}),
      startedAt: new Date(),
      // Remote sessions never carry GPS — they're sent via shareable URL.
      // Discard any incoming location field so it can't be back-filled by
      // a hostile client to fake an in-person attribution.
      location: sessionMode === 'remote' ? {} : (location || {}),
      productsPresented,
      status: 'in_progress',
      mode: sessionMode,
      ...(idempotencyKey ? { idempotencyKey } : {}),
    });
  } catch (err) {
    if (err && err.code === 11000 && idempotencyKey) {
      const existing = await CLMSession.findOne({ idempotencyKey }).lean();
      if (existing) {
        return res.status(409).json({
          success: false,
          message: 'Duplicate session — already synced.',
          data: existing,
        });
      }
    }
    throw err;
  }

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
  if (!ownsOrAdmin(session, req)) {
    return res.status(403).json({ success: false, message: 'Access denied. This session belongs to another BDM.' });
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
  if (!ownsOrAdmin(session, req)) {
    return res.status(403).json({ success: false, message: 'Access denied. This session belongs to another BDM.' });
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
  if (!ownsOrAdmin(session, req)) {
    return res.status(403).json({ success: false, message: 'Access denied. This session belongs to another BDM.' });
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
  if (!ownsOrAdmin(session, req)) {
    return res.status(403).json({ success: false, message: 'Access denied. This session belongs to another BDM.' });
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
  if (!ownsOrAdmin(session, req)) {
    return res.status(403).json({ success: false, message: 'Access denied. This session belongs to another BDM.' });
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
  if (!ownsOrAdmin(session, req)) {
    return res.status(403).json({ success: false, message: 'Access denied. This session belongs to another BDM.' });
  }

  session.qrScanned = true;
  session.qrScannedAt = new Date();
  await session.save();
  res.json({ success: true, data: session });
});

// ── Phase N — Public deck viewer (anonymous, no JWT) ────────────────
// GET /api/clm/deck/:id — mounted OUTSIDE router.use(protect). Returns a
// branding-hydrated payload + a minimal session-view record for read-only
// rendering by DeckViewerPage.jsx. The endpoint is rate-limited per IP at
// the route layer (see clmRoutes.js); this handler enforces the data shape
// guarantees:
//   - Only sessions in mode='remote' are exposed publicly. in-person sessions
//     are NEVER returned by this route — those decks are presented live by
//     the BDM and don't need a shareable URL.
//   - PII redaction: VIP Client first name only, no BDM email/phone, no GPS.
//   - Stamps deckOpenedAt + increments deckOpenCount each call. Idempotent
//     for analytics — even if the same recipient refreshes 10 times we still
//     count opens (intentional; visibility into engagement matters).
//   - 404s on bad/expired IDs and on in-person sessions to prevent enumeration.
const getPublicDeck = asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Validate ObjectId shape FIRST so we don't leak existence vs malformed-id
  // distinctions to drive-by attackers.
  const mongoose = require('mongoose');
  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    return res.status(404).json({ success: false, message: 'Deck not found.' });
  }

  // Only remote-mode sessions are publicly viewable. in-person sessions
  // get a 404 even if the ID is correct — keeps the public surface narrow.
  const session = await CLMSession.findOne({ _id: id, mode: 'remote' })
    .populate('doctor', 'firstName')
    .populate('user', 'firstName lastName')
    .populate('entity_id', 'name');

  if (!session) {
    return res.status(404).json({ success: false, message: 'Deck not found.' });
  }

  // Stamp open analytics. Best-effort save — if it fails, still return the
  // deck (analytics is observability, not a blocker for the recipient).
  try {
    session.deckOpenedAt = new Date();
    session.deckOpenCount = (session.deckOpenCount || 0) + 1;
    await session.save();
  } catch (analyticsErr) {
    console.error('[Phase N] Public deck open analytics save failed:', analyticsErr.message);
  }

  // Lazy-load Entity branding hydration. Same shape as the authenticated
  // CLM entity branding endpoint, but executed via the public route — public
  // viewers SHOULD see the entity's slide content + logos. resolveClmConfig
  // (frontend) deep-merges this over defaults so any missing field falls
  // back to the neutral placeholder.
  let branding = null;
  if (session.entity_id?._id) {
    try {
      const Entity = require('../erp/models/Entity');
      const entity = await Entity.findById(session.entity_id._id)
        .select('name clmBranding')
        .lean();
      if (entity?.clmBranding) {
        branding = entity.clmBranding;
      }
    } catch (brandingErr) {
      // Non-fatal: deck still renders with neutral placeholders
      console.error('[Phase N] Public deck branding hydration failed:', brandingErr.message);
    }
  }

  // PII redaction — only first name of doctor and BDM exposed. No email,
  // no phone, no clinic address, no GPS, no full BDM identity.
  const doctorFirstName = session.doctor?.firstName || 'there';
  const bdmFirstName = session.user?.firstName || '';

  res.json({
    success: true,
    data: {
      _id: session._id,
      mode: session.mode,
      doctorFirstName,
      bdmFirstName,
      productsPresented: (session.productsPresented || []).map((p) => ({
        productName: p.productName,
        productGenericName: p.productGenericName,
        productDosage: p.productDosage,
        productImage: p.productImage,
      })),
      messengerRef: session.messengerRef,
      branding,
      // Analytics fields (informational; the public viewer doesn't need them
      // but exposing them here lets the BDM-side admin UI fetch a single
      // source of truth without duplicate queries).
      deckOpenedAt: session.deckOpenedAt,
      deckOpenCount: session.deckOpenCount,
      qrScanned: session.qrScanned,
    },
  });
});

// ── Messenger webhook conversion (internal helper, not HTTP) ────────
// Called from webhookRoutes.js when a Messenger event carries a CLM ref.
// Idempotent: if already scanned, returns the session without overwriting
// qrScannedAt so the original conversion attribution is preserved.
const markClmSessionConverted = async (messengerRef) => {
  if (!messengerRef) return null;
  const session = await CLMSession.findOne({ messengerRef });
  if (!session) return null;
  if (!session.qrScanned) {
    session.qrScanned = true;
    session.qrScannedAt = new Date();
    await session.save();
  }
  return session;
};

// ── Get my sessions (BDM) ───────────────────────────────────────────
const getMySessions = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, status, doctorId } = req.query;
  const filter = { user: req.user._id };
  const entityId = resolveEntityId(req);
  if (entityId) filter.entity_id = entityId;
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
  const entityId = resolveEntityId(req);
  if (entityId) filter.entity_id = entityId;
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
  const entityId = resolveEntityId(req);
  const lookupFilter = { _id: req.params.id, ...(entityId ? { entity_id: entityId } : {}) };
  const session = await CLMSession.findOne(lookupFilter)
    .populate('user', 'firstName lastName')
    .populate('doctor', 'firstName lastName specialization clinicOfficeAddress')
    .populate('productsPresented.product', 'name genericName dosage category image');

  if (!session) {
    return res.status(404).json({ success: false, message: 'Session not found' });
  }
  if (!ownsOrAdmin(session, req)) {
    return res.status(403).json({ success: false, message: 'Access denied. This session belongs to another BDM.' });
  }
  res.json({ success: true, data: session });
});

// ── Analytics summary ───────────────────────────────────────────────
const getAnalytics = asyncHandler(async (req, res) => {
  const { startDate, endDate, userId } = req.query;
  const match = { status: 'completed' };
  const entityId = resolveEntityId(req);
  if (entityId) match.entity_id = new (require('mongoose').Types.ObjectId)(entityId);
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
  markClmSessionConverted,
  getMySessions,
  getAllSessions,
  getSessionById,
  getAnalytics,
  // Phase N — public deck viewer (anonymous, rate-limited)
  getPublicDeck,
};
