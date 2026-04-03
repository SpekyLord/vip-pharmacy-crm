/**
 * IC Settlement Controller — VIP collects from subsidiaries
 *
 * IC Transfer = VIP's CSI to subsidiary (invoice at transfer price).
 * IC Settlement = subsidiary's CR to VIP (payment receipt).
 * Simpler lifecycle: DRAFT → POSTED (president/admin records directly).
 */
const mongoose = require('mongoose');
const IcSettlement = require('../models/IcSettlement');
const TransactionEvent = require('../models/TransactionEvent');
const ErpAuditLog = require('../models/ErpAuditLog');
const Entity = require('../models/Entity');
const { catchAsync } = require('../../middleware/errorHandler');
const { getOpenIcTransfers, getIcArSummary } = require('../services/icArEngine');

// ═══ OPEN IC TRANSFERS (VIP's unpaid CSIs to a subsidiary) ═══

const getOpenIcTransfersEndpoint = catchAsync(async (req, res) => {
  const debtorEntityId = req.query.debtor_entity_id;
  if (!debtorEntityId) return res.status(400).json({ success: false, message: 'debtor_entity_id required' });

  const creditorEntityId = req.query.creditor_entity_id || req.entityId;
  const transfers = await getOpenIcTransfers(creditorEntityId, debtorEntityId);
  res.json({ success: true, data: transfers });
});

// ═══ CRUD ═══

const createSettlement = catchAsync(async (req, res) => {
  const data = {
    ...req.body,
    creditor_entity_id: req.body.creditor_entity_id || req.entityId,
    settled_by: req.user._id,
    created_by: req.user._id,
    status: 'DRAFT'
  };
  const settlement = await IcSettlement.create(data);
  res.status(201).json({ success: true, data: settlement });
});

const getSettlements = catchAsync(async (req, res) => {
  const filter = {};
  if (req.query.creditor_entity_id) filter.creditor_entity_id = req.query.creditor_entity_id;
  else filter.creditor_entity_id = req.entityId;
  if (req.query.debtor_entity_id) filter.debtor_entity_id = req.query.debtor_entity_id;
  if (req.query.status) filter.status = req.query.status;

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const skip = (page - 1) * limit;

  const [data, total] = await Promise.all([
    IcSettlement.find(filter).sort({ cr_date: -1 }).skip(skip).limit(limit)
      .populate('creditor_entity_id', 'entity_name')
      .populate('debtor_entity_id', 'entity_name')
      .lean(),
    IcSettlement.countDocuments(filter)
  ]);

  res.json({ success: true, data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
});

const getSettlementById = catchAsync(async (req, res) => {
  const settlement = await IcSettlement.findById(req.params.id)
    .populate('creditor_entity_id', 'entity_name')
    .populate('debtor_entity_id', 'entity_name')
    .lean();
  if (!settlement) return res.status(404).json({ success: false, message: 'Settlement not found' });
  res.json({ success: true, data: settlement });
});

// ═══ POST (DRAFT → POSTED) ═══

const postSettlement = catchAsync(async (req, res) => {
  const settlement = await IcSettlement.findById(req.params.id);
  if (!settlement) return res.status(404).json({ success: false, message: 'Settlement not found' });
  if (settlement.status !== 'DRAFT') {
    return res.status(400).json({ success: false, message: `Cannot post settlement in ${settlement.status} status` });
  }

  // Validate: must have settled_transfers and cr_no
  if (!settlement.settled_transfers?.length) {
    return res.status(400).json({ success: false, message: 'No transfers settled' });
  }

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      // Create IC_SETTLEMENT TransactionEvent
      const [event] = await TransactionEvent.create([{
        entity_id: settlement.creditor_entity_id,
        bdm_id: req.user._id,
        event_type: 'IC_SETTLEMENT',
        event_date: settlement.cr_date,
        document_ref: settlement.cr_no,
        payload: {
          settlement_id: settlement._id,
          debtor_entity_id: settlement.debtor_entity_id,
          cr_amount: settlement.cr_amount,
          total_settled: settlement.total_settled,
          settled_transfers: settlement.settled_transfers
        },
        created_by: req.user._id
      }], { session });

      settlement.status = 'POSTED';
      settlement.posted_at = new Date();
      settlement.posted_by = req.user._id;
      settlement.event_id = event._id;
      await settlement.save({ session });
    });

    await ErpAuditLog.logChange({
      entity_id: settlement.creditor_entity_id,
      log_type: 'STATUS_CHANGE',
      target_ref: settlement._id.toString(),
      target_model: 'IcSettlement',
      field_changed: 'status',
      old_value: 'DRAFT', new_value: 'POSTED',
      changed_by: req.user._id,
      note: `IC Settlement ${settlement.cr_no} posted: ${settlement.settled_transfers.length} transfer(s), P${settlement.cr_amount}`
    });

    res.json({ success: true, message: 'IC Settlement posted', data: settlement });
  } finally {
    await session.endSession();
  }
});

// ═══ IC AR SUMMARY ═══

const getIcArSummaryEndpoint = catchAsync(async (req, res) => {
  const creditorEntityId = req.query.creditor_entity_id || req.entityId;
  const summary = await getIcArSummary(creditorEntityId);
  res.json({ success: true, data: summary });
});

module.exports = {
  getOpenIcTransfersEndpoint,
  createSettlement,
  getSettlements,
  getSettlementById,
  postSettlement,
  getIcArSummaryEndpoint
};
