/**
 * Consignment Controller — DR Entry & Consignment Tracking
 *
 * DR creation, consignment pool, aging, and manual CSI conversion.
 * All endpoints BDM-scoped via tenantFilter.
 */
const mongoose = require('mongoose');
const ConsignmentTracker = require('../models/ConsignmentTracker');
const InventoryLedger = require('../models/InventoryLedger');
const TransactionEvent = require('../models/TransactionEvent');
const ProductMaster = require('../models/ProductMaster');
const Hospital = require('../models/Hospital');
const ErpAuditLog = require('../models/ErpAuditLog');
const { catchAsync } = require('../../middleware/errorHandler');
const { consumeFIFO, consumeSpecificBatch } = require('../services/fifoEngine');
const { cleanBatchNo, parseExpiry } = require('../utils/normalize');

/**
 * POST /dr — BDM creates a Delivery Receipt
 * Creates InventoryLedger entries (stock out) + ConsignmentTracker (if consignment).
 */
const createDR = catchAsync(async (req, res) => {
  const { hospital_id, dr_ref, dr_date, dr_type, line_items, dr_photo_url, ocr_data, notes } = req.body;

  if (!['DR_SAMPLING', 'DR_CONSIGNMENT', 'DR_DONATION'].includes(dr_type)) {
    return res.status(400).json({ success: false, message: 'dr_type must be DR_SAMPLING, DR_CONSIGNMENT, or DR_DONATION' });
  }
  if (!hospital_id || !dr_ref || !line_items?.length) {
    return res.status(400).json({ success: false, message: 'hospital_id, dr_ref, and line_items are required' });
  }

  // Validate hospital exists
  const hospital = await Hospital.findById(hospital_id).select('hospital_name').lean();
  if (!hospital) {
    return res.status(404).json({ success: false, message: 'Hospital not found' });
  }

  // Validate products exist
  const productIds = line_items.map(li => li.product_id);
  const products = await ProductMaster.find({ _id: { $in: productIds } })
    .select('_id item_key brand_name').lean();
  const productMap = new Map(products.map(p => [p._id.toString(), p]));

  for (const li of line_items) {
    if (!productMap.has(li.product_id?.toString())) {
      return res.status(400).json({ success: false, message: `Product ${li.product_id} not found` });
    }
  }

  const session = await mongoose.startSession();
  try {
    let event;
    const consignments = [];
    const ledgerEntries = [];

    await session.withTransaction(async () => {
      // Create TransactionEvent
      const [evt] = await TransactionEvent.create([{
        entity_id: req.entityId,
        bdm_id: req.bdmId,
        event_type: dr_type,
        event_date: dr_date || new Date(),
        document_ref: dr_ref,
        source_image_url: dr_photo_url,
        ocr_raw_json: ocr_data,
        payload: { hospital_id, hospital_name: hospital.hospital_name, line_items },
        created_by: req.user._id
      }], { session });
      event = evt;

      for (const item of line_items) {
        const product = productMap.get(item.product_id.toString());
        const normalizedBatch = item.batch_lot_no ? cleanBatchNo(item.batch_lot_no) : null;
        const qty = parseFloat(item.qty);

        // Phase 17: warehouse-scoped FIFO
        const warehouseId = req.body.warehouse_id;
        const fifoOpts = warehouseId ? { warehouseId } : undefined;

        // Deduct stock via FIFO or specific batch
        let consumption;
        if (normalizedBatch) {
          consumption = await consumeSpecificBatch(req.entityId, req.bdmId, item.product_id, normalizedBatch, qty, fifoOpts);
        } else {
          consumption = await consumeFIFO(req.entityId, req.bdmId, item.product_id, qty, fifoOpts);
        }

        // Create InventoryLedger entries for each consumed batch
        const consumedBatches = Array.isArray(consumption) ? consumption : [consumption];
        for (const cb of consumedBatches) {
          const [ledger] = await InventoryLedger.create([{
            entity_id: req.entityId,
            bdm_id: req.bdmId,
            warehouse_id: warehouseId || undefined,
            product_id: item.product_id,
            batch_lot_no: cb.batch_lot_no,
            expiry_date: cb.expiry_date,
            transaction_type: dr_type,
            qty_in: 0,
            qty_out: cb.qty_consumed,
            event_id: event._id,
            recorded_by: req.user._id
          }], { session });
          ledgerEntries.push(ledger);
        }

        // Create ConsignmentTracker entries (only for DR_CONSIGNMENT)
        if (dr_type === 'DR_CONSIGNMENT') {
          const [tracker] = await ConsignmentTracker.create([{
            entity_id: req.entityId,
            bdm_id: req.bdmId,
            warehouse_id: warehouseId || undefined,
            hospital_id,
            hospital_name: hospital.hospital_name,
            dr_ref,
            dr_date: dr_date || new Date(),
            product_id: item.product_id,
            item_key: product.item_key,
            batch_lot_no: normalizedBatch || consumedBatches[0]?.batch_lot_no,
            qty_delivered: qty,
            dr_photo_url,
            created_by: req.user._id
          }], { session });
          consignments.push(tracker);
        }
      }
    });

    await ErpAuditLog.logChange({
      entity_id: req.entityId,
      bdm_id: req.bdmId,
      log_type: 'STATUS_CHANGE',
      target_ref: event._id.toString(),
      target_model: 'TransactionEvent',
      field_changed: 'dr_created',
      new_value: dr_type,
      changed_by: req.user._id,
      note: `DR ${dr_ref} created (${dr_type}): ${line_items.length} item(s) to ${hospital.hospital_name}`
    });

    res.status(201).json({
      success: true,
      message: `DR created — ${ledgerEntries.length} inventory deduction(s)${consignments.length ? `, ${consignments.length} consignment(s) tracked` : ''}`,
      data: { event_id: event._id, ledger_count: ledgerEntries.length, consignment_count: consignments.length }
    });
  } finally {
    await session.endSession();
  }
});

/**
 * GET /dr — List DRs for BDM
 * Queries TransactionEvent with dr_type filter.
 */
const getDRsByBdm = catchAsync(async (req, res) => {
  const filter = { ...req.tenantFilter };
  filter.event_type = { $in: ['DR_SAMPLING', 'DR_CONSIGNMENT', 'DR_DONATION'] };
  if (req.query.dr_type) filter.event_type = req.query.dr_type;

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;
  const skip = (page - 1) * limit;

  const [drs, total] = await Promise.all([
    TransactionEvent.find(filter)
      .populate('bdm_id', 'name email')
      .sort({ event_date: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    TransactionEvent.countDocuments(filter)
  ]);

  res.json({
    success: true,
    data: drs,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) }
  });
});

/**
 * GET /pool — Open consignments grouped by hospital with live aging
 */
const getConsignmentPool = catchAsync(async (req, res) => {
  const filter = { ...req.tenantFilter, status: 'ACTIVE' };
  if (req.query.hospital_id) filter.hospital_id = new mongoose.Types.ObjectId(req.query.hospital_id);

  const consignments = await ConsignmentTracker.find(filter)
    .populate('product_id', 'brand_name generic_name item_key selling_price unit_code')
    .sort({ dr_date: 1 })
    .lean();

  // Compute live aging (pre-save hook only runs at save-time)
  // Phase H6 — SAMPLING dispatches skip FORCE_CSI (samples never convert to sale).
  const now = new Date();
  for (const c of consignments) {
    c.days_outstanding = Math.floor((now - new Date(c.dr_date)) / (1000 * 60 * 60 * 24));
    const isSampling = c.dispatch_type === 'SAMPLING';
    if (c.qty_remaining <= 0) {
      c.aging_status = 'COLLECTED';
    } else if (!isSampling && c.days_outstanding >= (c.max_days_force_csi || 90)) {
      c.aging_status = 'FORCE_CSI';
    } else if (c.days_outstanding >= (c.max_days_alert || 60)) {
      c.aging_status = 'OVERDUE';
    } else {
      c.aging_status = 'OPEN';
    }
  }

  // Group by hospital
  const hospitalMap = new Map();
  for (const c of consignments) {
    const hid = c.hospital_id.toString();
    if (!hospitalMap.has(hid)) {
      hospitalMap.set(hid, {
        hospital_id: c.hospital_id,
        hospital_name: c.hospital_name,
        consignments: []
      });
    }
    hospitalMap.get(hid).consignments.push(c);
  }

  const hospitals = [...hospitalMap.values()];

  // Summary
  const totalOpen = consignments.filter(c => c.aging_status === 'OPEN').length;
  const totalOverdue = consignments.filter(c => c.aging_status === 'OVERDUE').length;
  const totalForceCsi = consignments.filter(c => c.aging_status === 'FORCE_CSI').length;
  const totalValue = consignments.reduce((sum, c) => {
    const price = c.product_id?.selling_price || 0;
    return sum + (c.qty_remaining * price);
  }, 0);

  res.json({
    success: true,
    data: hospitals,
    summary: {
      total_open: totalOpen,
      total_overdue: totalOverdue,
      total_force_csi: totalForceCsi,
      total_value: Math.round(totalValue * 100) / 100
    }
  });
});

/**
 * POST /convert — Manually convert consignment to CSI
 * Updates ConsignmentTracker only (inventory was already deducted at DR creation).
 */
const convertConsignment = catchAsync(async (req, res) => {
  const { consignment_id, qty_converted, csi_doc_ref, csi_date } = req.body;

  if (!consignment_id || !qty_converted || !csi_doc_ref) {
    return res.status(400).json({ success: false, message: 'consignment_id, qty_converted, and csi_doc_ref are required' });
  }

  const consignment = await ConsignmentTracker.findOne({
    _id: consignment_id,
    ...req.tenantFilter
  });

  if (!consignment) {
    return res.status(404).json({ success: false, message: 'Consignment not found' });
  }

  if (qty_converted > consignment.qty_remaining) {
    return res.status(400).json({
      success: false,
      message: `Cannot convert ${qty_converted} — only ${consignment.qty_remaining} remaining`
    });
  }

  consignment.qty_consumed += qty_converted;
  consignment.conversions.push({
    csi_doc_ref,
    csi_date: csi_date || new Date(),
    qty_converted
  });

  // Pre-save hook recalculates qty_remaining, days_outstanding, aging_status
  await consignment.save();

  await ErpAuditLog.logChange({
    entity_id: consignment.entity_id,
    bdm_id: consignment.bdm_id,
    log_type: 'ITEM_CHANGE',
    target_ref: consignment._id.toString(),
    target_model: 'ConsignmentTracker',
    field_changed: 'qty_consumed',
    old_value: consignment.qty_consumed - qty_converted,
    new_value: consignment.qty_consumed,
    changed_by: req.user._id,
    note: `Converted ${qty_converted} to CSI ${csi_doc_ref}`
  });

  res.json({
    success: true,
    message: `Converted ${qty_converted} units to CSI ${csi_doc_ref}`,
    data: consignment
  });
});

// President-only: Remove a DR/Consignment row that has zero conversions. Blocks
// when any qty_consumed > 0 — caller must reverse the converting CSIs first.
const { buildPresidentReverseHandler } = require('../services/documentReversalService');
const presidentReverseDr = buildPresidentReverseHandler('CONSIGNMENT_TRANSFER');

module.exports = { createDR, getDRsByBdm, getConsignmentPool, convertConsignment, presidentReverseDr };
