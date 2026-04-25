/**
 * Document Controller — Phase 9.1b
 *
 * Query and browse DocumentAttachment records (scanned document photos).
 * Also serves the document flow chain endpoint (Phase 9.3).
 */
const mongoose = require('mongoose');
const { catchAsync, ApiError } = require('../../middleware/errorHandler');
const DocumentAttachment = require('../models/DocumentAttachment');
const TransactionEvent = require('../models/TransactionEvent');

/**
 * GET /documents/by-event/:event_id
 * All attachments linked to a specific TransactionEvent
 */
const getByEvent = catchAsync(async (req, res) => {
  const { event_id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(event_id)) {
    throw new ApiError(400, 'Invalid event_id');
  }

  const docs = await DocumentAttachment.find({
    event_id,
    ...req.tenantFilter
  }).sort({ uploaded_at: -1 }).lean();

  res.json({ success: true, data: docs });
});

/**
 * GET /documents/by-type?type=CSI&from=2026-01-01&to=2026-04-01
 * Browse documents by type and optional date range
 */
const getByType = catchAsync(async (req, res) => {
  const { type, from, to } = req.query;
  if (!type) throw new ApiError(400, 'type query param is required');

  const filter = { document_type: type, ...req.tenantFilter };
  if (from || to) {
    filter.uploaded_at = {};
    if (from) filter.uploaded_at.$gte = new Date(from);
    if (to) filter.uploaded_at.$lte = new Date(to);
  }

  const docs = await DocumentAttachment.find(filter)
    .sort({ uploaded_at: -1 })
    .limit(100)
    .lean();

  res.json({ success: true, data: docs, count: docs.length });
});

/**
 * GET /documents/by-source?model=Collection&id=xxx
 * All documents linked to a specific source record
 */
const getBySource = catchAsync(async (req, res) => {
  const { model, id } = req.query;
  if (!model || !id) throw new ApiError(400, 'model and id query params are required');
  if (!mongoose.Types.ObjectId.isValid(id)) throw new ApiError(400, 'Invalid id');

  const docs = await DocumentAttachment.find({
    source_model: model,
    source_id: id,
    ...req.tenantFilter
  }).sort({ uploaded_at: -1 }).lean();

  res.json({ success: true, data: docs });
});

/**
 * GET /document-flow/:event_id
 * Phase 9.3: Traverse linked_events to build full document chain
 * Returns ordered chain: e.g. CSI → CR → CWT_2307 → DEPOSIT
 */
const getDocumentFlow = catchAsync(async (req, res) => {
  const { event_id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(event_id)) {
    throw new ApiError(400, 'Invalid event_id');
  }

  // Entity-scope the entry point so foreign-entity event_ids can't be probed.
  const startFilter = { _id: event_id };
  if (!req.isPresident) startFilter.entity_id = req.entityId;
  const startEvent = await TransactionEvent.findOne(startFilter).lean();
  if (!startEvent) throw new ApiError(404, 'Event not found');

  // Build flow chain by traversing linked_events in both directions
  const visited = new Set();
  const chain = [];

  async function traverse(eventId) {
    const idStr = eventId.toString();
    if (visited.has(idStr)) return;
    visited.add(idStr);

    // eslint-disable-next-line vip-tenant/require-entity-filter -- by-_id traversal: eventId reached via linked_events from entity-scoped startEvent above
    const event = await TransactionEvent.findById(eventId)
      .select('event_type event_date document_ref status payload linked_events corrects_event_id')
      .lean();
    if (!event) return;

    chain.push(event);

    // Forward links
    if (event.linked_events?.length) {
      for (const link of event.linked_events) {
        await traverse(link.event_id);
      }
    }

    // Reverse links — find events that link TO this one
    // eslint-disable-next-line vip-tenant/require-entity-filter -- by-linked_events.event_id traversal: eventId came from entity-scoped startEvent chain
    const reverseLinked = await TransactionEvent.find({
      'linked_events.event_id': eventId,
      status: 'ACTIVE'
    }).select('_id').lean();

    for (const rev of reverseLinked) {
      await traverse(rev._id);
    }

    // Correction chain
    if (event.corrects_event_id) {
      await traverse(event.corrects_event_id);
    }
  }

  await traverse(new mongoose.Types.ObjectId(event_id));

  // Sort by event_date ascending for chronological display
  chain.sort((a, b) => new Date(a.event_date) - new Date(b.event_date));

  res.json({ success: true, data: chain });
});

module.exports = {
  getByEvent,
  getByType,
  getBySource,
  getDocumentFlow
};
