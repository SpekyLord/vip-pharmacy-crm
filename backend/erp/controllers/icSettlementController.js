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
  const entityFilter = req.isPresident ? {} : {
    $or: [{ creditor_entity_id: req.entityId }, { debtor_entity_id: req.entityId }]
  };
  const settlement = await IcSettlement.findOne({ _id: req.params.id, ...entityFilter })
    .populate('creditor_entity_id', 'entity_name')
    .populate('debtor_entity_id', 'entity_name')
    .lean();
  if (!settlement) return res.status(404).json({ success: false, message: 'Settlement not found' });
  res.json({ success: true, data: settlement });
});

// ═══ POST (DRAFT → POSTED) ═══

/**
 * Phase G6.7-PC6 (May 01 2026) — Shared lifecycle helper for IC Settlement
 * post. Single source of truth for the DRAFT → POSTED transition.
 *
 * Used by:
 *   1. postSettlement (BDM-direct route): runs gateApproval + entity scope,
 *      then calls this helper.
 *   2. universalApprovalController.approvalHandlers.ic_transfer (Approval Hub,
 *      doc_type === 'IC_SETTLEMENT'): gate has already passed; calls helper directly.
 *
 * Idempotency: short-circuits when settlement.status === 'POSTED'. Period lock
 * uses settlement.creditor_entity_id (cross-entity-safe for Hub approvers).
 *
 * Atomicity: TransactionEvent creation + status flip wrapped in
 * mongoose.withTransaction so a failure rolls back both writes.
 */
async function postSingleIcSettlement(settlementId, userId) {
  // eslint-disable-next-line vip-tenant/require-entity-filter -- helper resolves entity from settlement; caller provides authorization
  const settlement = await IcSettlement.findById(settlementId);
  if (!settlement) throw Object.assign(new Error('Settlement not found'), { statusCode: 404 });

  if (settlement.status === 'POSTED') {
    return { settlement, event: null, already_posted: true };
  }
  if (settlement.status !== 'DRAFT') {
    throw Object.assign(new Error(`Cannot post settlement in ${settlement.status} status`), { statusCode: 400 });
  }
  if (!settlement.settled_transfers?.length) {
    throw Object.assign(new Error('No transfers settled'), { statusCode: 400 });
  }

  // Period lock against the creditor entity (the side recording the receipt).
  const { checkPeriodOpen, dateToPeriod } = require('../utils/periodLock');
  const settlPeriod = dateToPeriod(settlement.cr_date || new Date());
  try {
    await checkPeriodOpen(settlement.creditor_entity_id, settlPeriod);
  } catch (err) {
    if (err.code === 'PERIOD_LOCKED') {
      throw Object.assign(new Error(err.message), { statusCode: err.status || 400, code: err.code });
    }
    throw err;
  }

  let event;
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const [created] = await TransactionEvent.create([{
        entity_id: settlement.creditor_entity_id,
        bdm_id: userId,
        event_type: 'IC_SETTLEMENT',
        event_date: settlement.cr_date,
        document_ref: settlement.cr_no,
        payload: {
          settlement_id: settlement._id,
          debtor_entity_id: settlement.debtor_entity_id,
          cr_amount: settlement.cr_amount,
          total_settled: settlement.total_settled,
          settled_transfers: settlement.settled_transfers,
        },
        created_by: userId,
      }], { session });

      event = created;
      settlement.status = 'POSTED';
      settlement.posted_at = new Date();
      settlement.posted_by = userId;
      settlement.event_id = event._id;
      await settlement.save({ session });
    });
  } finally {
    await session.endSession();
  }

  await ErpAuditLog.logChange({
    entity_id: settlement.creditor_entity_id,
    log_type: 'STATUS_CHANGE',
    target_ref: settlement._id.toString(),
    target_model: 'IcSettlement',
    field_changed: 'status',
    old_value: 'DRAFT', new_value: 'POSTED',
    changed_by: userId,
    note: `IC Settlement ${settlement.cr_no} posted: ${settlement.settled_transfers.length} transfer(s), P${settlement.cr_amount}`,
  });

  return { settlement, event, already_posted: false };
}

const postSettlement = catchAsync(async (req, res) => {
  const entityFilter = req.isPresident ? {} : {
    $or: [{ creditor_entity_id: req.entityId }, { debtor_entity_id: req.entityId }]
  };
  const settlementPre = await IcSettlement.findOne({ _id: req.params.id, ...entityFilter }).lean();
  if (!settlementPre) return res.status(404).json({ success: false, message: 'Settlement not found' });
  if (settlementPre.status !== 'DRAFT') {
    return res.status(400).json({ success: false, message: `Cannot post settlement in ${settlementPre.status} status` });
  }

  // Authority matrix gate (caller-responsibility — helper does NOT gate)
  const { gateApproval } = require('../services/approvalService');
  const gated = await gateApproval({
    entityId: settlementPre.creditor_entity_id,
    module: 'IC_TRANSFER',
    docType: 'IC_SETTLEMENT',
    docId: settlementPre._id,
    docRef: settlementPre.cr_no || settlementPre._id.toString(),
    amount: settlementPre.cr_amount || 0,
    description: `IC settlement ${settlementPre.cr_no || ''}`.trim(),
    requesterId: req.user._id,
    requesterName: req.user.name || req.user.email,
  }, res);
  if (gated) return;

  if (!settlementPre.settled_transfers?.length) {
    return res.status(400).json({ success: false, message: 'No transfers settled' });
  }

  try {
    const { settlement } = await postSingleIcSettlement(settlementPre._id, req.user._id);
    res.json({ success: true, message: 'IC Settlement posted', data: settlement });
  } catch (err) {
    return res.status(err.statusCode || 400).json({ success: false, message: err.message, code: err.code });
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
  // Phase G6.7-PC6 — shared helper for the Approval Hub.
  postSingleIcSettlement,
  getIcArSummaryEndpoint
};
