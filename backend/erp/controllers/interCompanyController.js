/**
 * Inter-Company Transfer Controller
 *
 * Endpoints for creating, approving, shipping, receiving, posting,
 * and cancelling inter-company stock transfers between entities.
 * Also manages transfer pricing.
 */
const mongoose = require('mongoose');
const InterCompanyTransfer = require('../models/InterCompanyTransfer');
const TransferPriceList = require('../models/TransferPriceList');
const Entity = require('../models/Entity');
const ProductMaster = require('../models/ProductMaster');
const ErpAuditLog = require('../models/ErpAuditLog');
const { catchAsync } = require('../../middleware/errorHandler');
const interCompanyService = require('../services/interCompanyService');

/**
 * POST /transfers — Create DRAFT transfer (president/admin only)
 */
const createTransfer = catchAsync(async (req, res) => {
  const { source_entity_id, target_entity_id, transfer_date, line_items, notes, source_bdm_id, target_bdm_id, source_warehouse_id, target_warehouse_id, csi_ref } = req.body;

  if (!source_entity_id || !target_entity_id) {
    return res.status(400).json({ success: false, message: 'Source and target entities are required' });
  }
  if (source_entity_id === target_entity_id) {
    return res.status(400).json({ success: false, message: 'Source and target entities must be different' });
  }
  if (!line_items?.length) {
    return res.status(400).json({ success: false, message: 'At least one line item is required' });
  }

  // Validate entities exist
  const [source, target] = await Promise.all([
    Entity.findById(source_entity_id).lean(),
    Entity.findById(target_entity_id).lean()
  ]);
  if (!source) return res.status(404).json({ success: false, message: 'Source entity not found' });
  if (!target) return res.status(404).json({ success: false, message: 'Target entity not found' });

  // Auto-fill transfer prices from TransferPriceList if not provided
  for (const item of line_items) {
    if (!item.transfer_price) {
      const price = await TransferPriceList.findOne({
        source_entity_id,
        target_entity_id,
        product_id: item.product_id,
        is_active: true
      }).lean();
      if (price) {
        item.transfer_price = price.transfer_price;
      }
    }
  }

  const transfer = await InterCompanyTransfer.create({
    source_entity_id,
    target_entity_id,
    transfer_date: transfer_date || new Date(),
    line_items,
    notes,
    source_bdm_id: source_bdm_id || undefined,
    target_bdm_id: target_bdm_id || undefined,
    source_warehouse_id: source_warehouse_id || undefined,
    target_warehouse_id: target_warehouse_id || undefined,
    csi_ref: csi_ref || undefined,
    requested_by: req.user._id,
    created_by: req.user._id
  });

  await ErpAuditLog.logChange({
    entity_id: source_entity_id,
    log_type: 'STATUS_CHANGE',
    target_ref: transfer._id.toString(),
    target_model: 'InterCompanyTransfer',
    field_changed: 'status',
    new_value: 'DRAFT',
    changed_by: req.user._id,
    note: `IC Transfer ${transfer.transfer_ref} created: ${line_items.length} item(s) to ${target.entity_name}`
  });

  res.status(201).json({ success: true, data: transfer });
});

/**
 * GET /transfers — List transfers with pagination & filters
 */
const getTransfers = catchAsync(async (req, res) => {
  const filter = {};

  // President sees all; others see their entity's transfers
  if (!req.isPresident) {
    filter.$or = [
      { source_entity_id: req.entityId },
      { target_entity_id: req.entityId }
    ];
  }

  if (req.query.status) filter.status = req.query.status;
  if (req.query.source_entity_id) filter.source_entity_id = req.query.source_entity_id;
  if (req.query.target_entity_id) filter.target_entity_id = req.query.target_entity_id;

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;
  const skip = (page - 1) * limit;

  const [transfers, total] = await Promise.all([
    InterCompanyTransfer.find(filter)
      .populate('source_entity_id', 'entity_name')
      .populate('target_entity_id', 'entity_name')
      .populate('requested_by', 'name')
      .populate('approved_by', 'name')
      .populate('shipped_by', 'name')
      .populate('received_by', 'name')
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    InterCompanyTransfer.countDocuments(filter)
  ]);

  res.json({
    success: true,
    data: transfers,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) }
  });
});

/**
 * GET /transfers/:id — Single transfer detail with enriched line items
 */
const getTransferById = catchAsync(async (req, res) => {
  const transfer = await InterCompanyTransfer.findById(req.params.id)
    .populate('source_entity_id', 'entity_name brand_color brand_text_color')
    .populate('target_entity_id', 'entity_name brand_color brand_text_color')
    .populate('source_bdm_id', 'name role')
    .populate('target_bdm_id', 'name role')
    .populate('requested_by', 'name')
    .populate('approved_by', 'name')
    .populate('shipped_by', 'name')
    .populate('received_by', 'name')
    .populate('posted_by', 'name')
    .populate('cancelled_by', 'name')
    .lean();

  if (!transfer) {
    return res.status(404).json({ success: false, message: 'Transfer not found' });
  }

  // Enrich line items with product details
  const productIds = transfer.line_items.map(li => li.product_id);
  const products = await ProductMaster.find({ _id: { $in: productIds } })
    .select('brand_name generic_name item_key unit_code')
    .lean();
  const productMap = new Map(products.map(p => [p._id.toString(), p]));

  for (const item of transfer.line_items) {
    item.product = productMap.get(item.product_id?.toString()) || null;
  }

  res.json({ success: true, data: transfer });
});

/**
 * PATCH /transfers/:id/approve — DRAFT → APPROVED (president only)
 */
const approveTransfer = catchAsync(async (req, res) => {
  const transfer = await InterCompanyTransfer.findById(req.params.id);
  if (!transfer) return res.status(404).json({ success: false, message: 'Transfer not found' });
  if (transfer.status !== 'DRAFT') {
    return res.status(400).json({ success: false, message: `Cannot approve transfer in ${transfer.status} status` });
  }

  transfer.status = 'APPROVED';
  transfer.approved_by = req.user._id;
  transfer.approved_at = new Date();
  await transfer.save();

  await ErpAuditLog.logChange({
    entity_id: transfer.source_entity_id,
    log_type: 'STATUS_CHANGE',
    target_ref: transfer._id.toString(),
    target_model: 'InterCompanyTransfer',
    field_changed: 'status',
    old_value: 'DRAFT',
    new_value: 'APPROVED',
    changed_by: req.user._id,
    note: `IC Transfer ${transfer.transfer_ref} approved`
  });

  res.json({ success: true, message: 'Transfer approved', data: transfer });
});

/**
 * PATCH /transfers/:id/ship — APPROVED → SHIPPED
 * Calls interCompanyService.shipTransfer for FIFO stock deduction.
 */
const shipTransfer = catchAsync(async (req, res) => {
  const transfer = await interCompanyService.shipTransfer(req.params.id, req.user._id);
  res.json({ success: true, message: 'Transfer shipped — source stock deducted', data: transfer });
});

/**
 * PATCH /transfers/:id/receive — SHIPPED → RECEIVED
 * Target entity BDM/admin confirms receipt.
 */
const receiveTransfer = catchAsync(async (req, res) => {
  const transfer = await interCompanyService.receiveTransfer(req.params.id, req.user._id);
  res.json({ success: true, message: 'Transfer received — target stock updated', data: transfer });
});

/**
 * PATCH /transfers/:id/post — RECEIVED → POSTED
 */
const postTransfer = catchAsync(async (req, res) => {
  const transfer = await interCompanyService.postTransfer(req.params.id, req.user._id);
  res.json({ success: true, message: 'Transfer posted (final)', data: transfer });
});

/**
 * PATCH /transfers/:id/cancel — Cancel with reason
 */
const cancelTransfer = catchAsync(async (req, res) => {
  const { reason } = req.body;
  const transfer = await interCompanyService.cancelTransfer(req.params.id, req.user._id, reason);
  res.json({ success: true, message: 'Transfer cancelled', data: transfer });
});

/**
 * GET /transfer-prices — List transfer prices for an entity pair
 */
const getTransferPrices = catchAsync(async (req, res) => {
  const filter = {};
  if (req.query.source_entity_id) filter.source_entity_id = req.query.source_entity_id;
  if (req.query.target_entity_id) filter.target_entity_id = req.query.target_entity_id;
  if (req.query.is_active !== undefined) filter.is_active = req.query.is_active === 'true';
  else filter.is_active = true;

  const prices = await TransferPriceList.find(filter)
    .populate('product_id', 'brand_name generic_name item_key unit_code selling_price')
    .populate('source_entity_id', 'entity_name')
    .populate('target_entity_id', 'entity_name')
    .populate('set_by', 'name')
    .sort({ 'product_id.brand_name': 1 })
    .lean();

  res.json({ success: true, data: prices });
});

/**
 * PUT /transfer-prices — Create or update a transfer price
 */
const setTransferPrice = catchAsync(async (req, res) => {
  const { source_entity_id, target_entity_id, product_id, transfer_price, notes } = req.body;

  if (!source_entity_id || !target_entity_id || !product_id || !transfer_price) {
    return res.status(400).json({
      success: false,
      message: 'source_entity_id, target_entity_id, product_id, and transfer_price are required'
    });
  }

  const price = await TransferPriceList.findOneAndUpdate(
    { source_entity_id, target_entity_id, product_id },
    {
      $set: {
        transfer_price,
        effective_date: new Date(),
        set_by: req.user._id,
        is_active: true,
        notes: notes || ''
      }
    },
    { upsert: true, new: true, runValidators: true }
  );

  res.json({ success: true, data: price });
});

/**
 * GET /entities — List all entities (for dropdowns)
 */
const getEntities = catchAsync(async (req, res) => {
  const filter = { status: 'ACTIVE' };
  const entities = await Entity.find(filter)
    .sort({ entity_type: 1, entity_name: 1 })
    .lean();
  res.json({ success: true, data: entities });
});

/**
 * GET /bdms?entity_id=xxx — List BDMs (employees) for an entity (for source/target BDM dropdowns)
 * Includes president/admin users who may hold warehouse stock.
 */
const getBdmsByEntity = catchAsync(async (req, res) => {
  const User = require('../../models/User');
  const filter = { isActive: { $ne: false } };
  if (req.query.entity_id) filter.entity_id = req.query.entity_id;
  // Include employees + president/admin (warehouse keepers)
  filter.role = { $in: ['employee', 'president', 'admin'] };

  const users = await User.find(filter)
    .select('name email role entity_id bdm_stage')
    .sort({ role: 1, name: 1 })
    .lean();

  // Optionally include unassigned BDMs (no entity_id — contractors not yet assigned)
  if (req.query.include_unassigned === 'true') {
    const unassigned = await User.find({
      $or: [{ entity_id: { $exists: false } }, { entity_id: null }],
      role: 'employee',
      isActive: { $ne: false }
    }).select('name email role entity_id bdm_stage').lean();

    for (const u of unassigned) {
      // Avoid duplicates if somehow already in results
      if (!users.some(existing => existing._id.toString() === u._id.toString())) {
        users.push({ ...u, _unassigned: true });
      }
    }
  }

  res.json({ success: true, data: users });
});

// ═══ Internal Stock Reassignment (same entity, GRN-like approval) ═══

const StockReassignment = require('../models/StockReassignment');
const InventoryLedger = require('../models/InventoryLedger');
const TransactionEvent = require('../models/TransactionEvent');
const { consumeSpecificBatch } = require('../services/fifoEngine');

/**
 * POST /reassign — Create PENDING reassignment (president/admin)
 * Same entity, different BDMs. Requires finance approval.
 */
const createReassignment = catchAsync(async (req, res) => {
  const { source_bdm_id, target_bdm_id, source_warehouse_id, target_warehouse_id, reassignment_date, line_items, undertaking_photo_url, ocr_data, notes, territory_code } = req.body;

  if (!source_bdm_id || !target_bdm_id) {
    return res.status(400).json({ success: false, message: 'Source and target custodians are required' });
  }
  if (source_bdm_id === target_bdm_id) {
    return res.status(400).json({ success: false, message: 'Source and target must be different' });
  }
  if (!line_items?.length) {
    return res.status(400).json({ success: false, message: 'At least one line item is required' });
  }

  // Validate products exist
  const productIds = line_items.map(li => li.product_id);
  const products = await ProductMaster.find({ _id: { $in: productIds } }).select('_id item_key').lean();
  const productMap = new Map(products.map(p => [p._id.toString(), p]));

  for (const li of line_items) {
    if (!productMap.has(li.product_id?.toString())) {
      return res.status(400).json({ success: false, message: `Product ${li.product_id} not found` });
    }
    if (!li.item_key) li.item_key = productMap.get(li.product_id.toString()).item_key;
  }

  // Use requesting user's entity_id, or allow override for president
  const entityId = req.entityId || req.body.entity_id;
  if (!entityId) {
    return res.status(400).json({ success: false, message: 'Entity ID required' });
  }

  // Auto-generate reassignment_ref: TERRITORY-MMDDYY-SEQ
  const refDate = reassignment_date ? new Date(reassignment_date) : new Date();
  const mm = String(refDate.getMonth() + 1).padStart(2, '0');
  const dd = String(refDate.getDate()).padStart(2, '0');
  const yy = String(refDate.getFullYear()).slice(-2);
  const dateCode = `${mm}${dd}${yy}`;
  const prefix = territory_code ? territory_code.toUpperCase() : 'STR';
  const dayCount = await StockReassignment.countDocuments({
    reassignment_ref: new RegExp(`^${prefix}-${dateCode}-`)
  });
  const seq = String(dayCount + 1).padStart(3, '0');
  const reassignment_ref = `${prefix}-${dateCode}-${seq}`;

  const reassignment = await StockReassignment.create({
    reassignment_ref,
    entity_id: entityId,
    source_bdm_id,
    target_bdm_id,
    source_warehouse_id: source_warehouse_id || undefined,
    target_warehouse_id: target_warehouse_id || undefined,
    reassignment_date: refDate,
    line_items,
    undertaking_photo_url,
    ocr_data,
    notes,
    created_by: req.user._id
  });

  await ErpAuditLog.logChange({
    entity_id: entityId,
    bdm_id: source_bdm_id,
    log_type: 'STATUS_CHANGE',
    target_ref: reassignment._id.toString(),
    target_model: 'StockReassignment',
    field_changed: 'status',
    new_value: 'PENDING',
    changed_by: req.user._id,
    note: `Stock reassignment created: ${line_items.length} item(s)`
  });

  res.status(201).json({ success: true, data: reassignment });
});

/**
 * POST /reassign/:id/approve — Finance/Admin approves or rejects
 * On APPROVED: FIFO consume from source → TRANSFER_OUT + TRANSFER_IN ledger entries
 */
const approveReassignment = catchAsync(async (req, res) => {
  const { action, rejection_reason } = req.body;

  if (!['APPROVED', 'REJECTED'].includes(action)) {
    return res.status(400).json({ success: false, message: 'Action must be APPROVED or REJECTED' });
  }

  const reassignment = await StockReassignment.findOne({ _id: req.params.id, status: 'PENDING' });
  if (!reassignment) {
    return res.status(404).json({ success: false, message: 'Reassignment not found or not in PENDING status' });
  }

  if (action === 'REJECTED') {
    reassignment.status = 'REJECTED';
    reassignment.rejection_reason = rejection_reason || '';
    reassignment.reviewed_by = req.user._id;
    reassignment.reviewed_at = new Date();
    await reassignment.save();

    await ErpAuditLog.logChange({
      entity_id: reassignment.entity_id,
      log_type: 'STATUS_CHANGE',
      target_ref: reassignment._id.toString(),
      target_model: 'StockReassignment',
      field_changed: 'status',
      old_value: 'PENDING',
      new_value: 'REJECTED',
      changed_by: req.user._id,
      note: rejection_reason || 'Reassignment rejected'
    });

    return res.json({ success: true, message: 'Reassignment rejected', data: reassignment });
  }

  // APPROVED — atomic transaction
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      // Create TransactionEvent
      const [event] = await TransactionEvent.create([{
        entity_id: reassignment.entity_id,
        bdm_id: reassignment.source_bdm_id,
        event_type: 'STOCK_REASSIGNMENT',
        event_date: reassignment.reassignment_date,
        document_ref: reassignment._id.toString(),
        payload: {
          source_bdm_id: reassignment.source_bdm_id,
          target_bdm_id: reassignment.target_bdm_id,
          line_items: reassignment.line_items
        },
        created_by: req.user._id
      }], { session });

      // Phase 17: warehouse context for FIFO and ledger entries
      const srcWhId = reassignment.source_warehouse_id;
      const tgtWhId = reassignment.target_warehouse_id;
      const fifoOpts = srcWhId ? { warehouseId: srcWhId.toString() } : undefined;

      // For each line item: consume from source, create in target
      for (const item of reassignment.line_items) {
        // Validate stock available via FIFO
        await consumeSpecificBatch(
          reassignment.entity_id, reassignment.source_bdm_id,
          item.product_id, item.batch_lot_no, item.qty, fifoOpts
        );

        // TRANSFER_OUT from source
        await InventoryLedger.create([{
          entity_id: reassignment.entity_id,
          bdm_id: reassignment.source_bdm_id,
          warehouse_id: srcWhId || undefined,
          product_id: item.product_id,
          batch_lot_no: item.batch_lot_no,
          expiry_date: item.expiry_date,
          transaction_type: 'TRANSFER_OUT',
          qty_in: 0,
          qty_out: item.qty,
          event_id: event._id,
          recorded_by: req.user._id
        }], { session });

        // TRANSFER_IN to target
        await InventoryLedger.create([{
          entity_id: reassignment.entity_id,
          bdm_id: reassignment.target_bdm_id,
          warehouse_id: tgtWhId || undefined,
          product_id: item.product_id,
          batch_lot_no: item.batch_lot_no,
          expiry_date: item.expiry_date,
          transaction_type: 'TRANSFER_IN',
          qty_in: item.qty,
          qty_out: 0,
          event_id: event._id,
          recorded_by: req.user._id
        }], { session });
      }

      // Update reassignment status
      reassignment.status = 'APPROVED';
      reassignment.reviewed_by = req.user._id;
      reassignment.reviewed_at = new Date();
      reassignment.event_id = event._id;
      await reassignment.save({ session });
    });

    await ErpAuditLog.logChange({
      entity_id: reassignment.entity_id,
      log_type: 'STATUS_CHANGE',
      target_ref: reassignment._id.toString(),
      target_model: 'StockReassignment',
      field_changed: 'status',
      old_value: 'PENDING',
      new_value: 'APPROVED',
      changed_by: req.user._id,
      note: `Reassignment approved: ${reassignment.line_items.length} item(s) moved`
    });

    res.json({ success: true, message: 'Reassignment approved — stock moved', data: reassignment });
  } finally {
    await session.endSession();
  }
});

/**
 * GET /reassign — List reassignments with status filter
 */
const getReassignments = catchAsync(async (req, res) => {
  const filter = {};

  // President sees all; others see their entity
  if (!req.isPresident && req.entityId) {
    filter.entity_id = req.entityId;
  }
  if (req.query.status) filter.status = req.query.status;

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;
  const skip = (page - 1) * limit;

  const [reassignments, total] = await Promise.all([
    StockReassignment.find(filter)
      .populate('source_bdm_id', 'name role')
      .populate('target_bdm_id', 'name role')
      .populate('reviewed_by', 'name')
      .populate('created_by', 'name')
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    StockReassignment.countDocuments(filter)
  ]);

  res.json({
    success: true,
    data: reassignments,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) }
  });
});

module.exports = {
  createTransfer,
  getTransfers,
  getTransferById,
  approveTransfer,
  shipTransfer,
  receiveTransfer,
  postTransfer,
  cancelTransfer,
  getTransferPrices,
  setTransferPrice,
  getEntities,
  getBdmsByEntity,
  createReassignment,
  approveReassignment,
  getReassignments
};
