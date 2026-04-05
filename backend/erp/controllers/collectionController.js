/**
 * Collection Controller — SAP-style Validate → Submit → Re-open
 *
 * P5: One CR = One Hospital. Hard gate on submit.
 * AR is computed on-read via arEngine (never stored on SalesLine).
 */
const mongoose = require('mongoose');
const Collection = require('../models/Collection');
const SalesLine = require('../models/SalesLine');
const TransactionEvent = require('../models/TransactionEvent');
const ErpAuditLog = require('../models/ErpAuditLog');
const Hospital = require('../models/Hospital');
const DocumentAttachment = require('../models/DocumentAttachment');
const { catchAsync } = require('../../middleware/errorHandler');
const { getOpenCsis, getArAging, getCollectionRate, getHospitalArBalance } = require('../services/arEngine');
const { enrichArWithDunning } = require('../services/dunningService');
const { generateSoaWorkbook } = require('../services/soaGenerator');

// ═══ CRUD ═══

const createCollection = catchAsync(async (req, res) => {
  const data = {
    ...req.body,
    entity_id: req.entityId,
    bdm_id: req.bdmId,
    created_by: req.user._id,
    status: 'DRAFT'
  };
  const collection = await Collection.create(data);
  res.status(201).json({ success: true, data: collection });
});

const updateCollection = catchAsync(async (req, res) => {
  const collection = await Collection.findOne({ _id: req.params.id, ...req.tenantFilter, status: 'DRAFT' });
  if (!collection) return res.status(404).json({ success: false, message: 'Draft collection not found' });

  Object.assign(collection, req.body);
  await collection.save();
  res.json({ success: true, data: collection });
});

const deleteDraftCollection = catchAsync(async (req, res) => {
  const result = await Collection.findOneAndDelete({ _id: req.params.id, ...req.tenantFilter, status: 'DRAFT' });
  if (!result) return res.status(404).json({ success: false, message: 'Draft collection not found' });
  res.json({ success: true, message: 'Draft deleted' });
});

const getCollections = catchAsync(async (req, res) => {
  const filter = { ...req.tenantFilter };
  if (req.query.status) filter.status = req.query.status;
  if (req.query.hospital_id) filter.hospital_id = req.query.hospital_id;
  if (req.query.cr_date_from || req.query.cr_date_to) {
    filter.cr_date = {};
    if (req.query.cr_date_from) filter.cr_date.$gte = new Date(req.query.cr_date_from);
    if (req.query.cr_date_to) filter.cr_date.$lte = new Date(req.query.cr_date_to);
  }

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const skip = (page - 1) * limit;

  const [data, total] = await Promise.all([
    Collection.find(filter).sort({ cr_date: -1 }).skip(skip).limit(limit)
      .populate('hospital_id', 'hospital_name')
      .populate('customer_id', 'customer_name customer_type')
      .populate('bdm_id', 'name')
      .lean(),
    Collection.countDocuments(filter)
  ]);

  res.json({ success: true, data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
});

const getCollectionById = catchAsync(async (req, res) => {
  const collection = await Collection.findOne({ _id: req.params.id })
    .populate('hospital_id', 'hospital_name tin cwt_rate payment_terms')
    .populate('customer_id', 'customer_name customer_type tin payment_terms')
    .populate('bdm_id', 'name')
    .lean();
  if (!collection) return res.status(404).json({ success: false, message: 'Collection not found' });
  res.json({ success: true, data: collection });
});

// ═══ AR QUERIES ═══

const getOpenCsisEndpoint = catchAsync(async (req, res) => {
  const hospitalId = req.query.hospital_id;
  const customerId = req.query.customer_id;
  if (!hospitalId && !customerId) return res.status(400).json({ success: false, message: 'hospital_id or customer_id required' });

  const entityId = (req.isPresident || req.isAdmin || req.isFinance) && req.query.entity_id
    ? req.query.entity_id : req.entityId;
  const bdmId = (req.isPresident || req.isAdmin || req.isFinance) && req.query.bdm_id
    ? req.query.bdm_id : req.bdmId;

  const csis = await getOpenCsis(entityId, bdmId, hospitalId, customerId);
  res.json({ success: true, data: csis });
});

const getArAgingEndpoint = catchAsync(async (req, res) => {
  const entityId = (req.isPresident || req.isAdmin || req.isFinance) && req.query.entity_id
    ? req.query.entity_id : req.entityId;
  const bdmId = (req.isPresident || req.isAdmin || req.isFinance) && req.query.bdm_id
    ? req.query.bdm_id : req.bdmId;

  const arData = await getArAging(entityId, bdmId, req.query.hospital_id);
  const enriched = enrichArWithDunning(arData);
  res.json({ success: true, data: enriched });
});

const getCollectionRateEndpoint = catchAsync(async (req, res) => {
  const entityId = (req.isPresident || req.isAdmin || req.isFinance) && req.query.entity_id
    ? req.query.entity_id : req.entityId;
  const bdmId = (req.isPresident || req.isAdmin || req.isFinance) && req.query.bdm_id
    ? req.query.bdm_id : req.bdmId;

  const rate = await getCollectionRate(entityId, bdmId, req.query.date_from, req.query.date_to);
  res.json({ success: true, data: rate });
});

// ═══ VALIDATE ═══

const validateCollections = catchAsync(async (req, res) => {
  const filter = { ...req.tenantFilter, status: { $in: ['DRAFT', 'ERROR'] } };
  if (req.body.collection_ids?.length) filter._id = { $in: req.body.collection_ids };

  const rows = await Collection.find(filter);
  if (!rows.length) return res.json({ success: true, valid_count: 0, error_count: 0 });

  let validCount = 0, errorCount = 0;

  for (const row of rows) {
    const errors = [];

    // Required fields — Phase 18: hospital_id OR customer_id
    if (!row.hospital_id && !row.customer_id) errors.push('Hospital or Customer is required');
    if (!row.cr_no) errors.push('CR number is required');
    if (!row.cr_date) errors.push('CR date is required');
    if (!row.cr_amount) errors.push('CR amount is required');
    if (!row.settled_csis?.length) errors.push('At least one CSI must be selected');

    // Future date check
    if (row.cr_date && row.cr_date > new Date()) errors.push('CR date cannot be in the future');

    // Hard gate: required documents — CASH mode skips CR photo and deposit slip
    const isCash = row.payment_mode === 'CASH';
    if (!isCash && !row.cr_photo_url) errors.push('CR photo is required');
    if (!isCash && !row.deposit_slip_url) errors.push('Deposit slip photo is required');
    if (!row.cwt_na && !row.cwt_certificate_url) errors.push('CWT certificate is required (or mark CWT as N/A)');

    // Validate settled CSIs reference valid POSTED SalesLines
    if (row.settled_csis?.length) {
      const slIds = row.settled_csis.map(s => s.sales_line_id);
      const validSales = await SalesLine.find({
        _id: { $in: slIds }, status: 'POSTED', hospital_id: row.hospital_id
      }).select('_id').lean();
      const validIds = new Set(validSales.map(s => s._id.toString()));

      for (const csi of row.settled_csis) {
        if (!validIds.has(csi.sales_line_id?.toString())) {
          errors.push(`CSI ${csi.doc_ref || csi.sales_line_id} is not a valid POSTED sale for this hospital`);
        }
      }

      // Double-settlement check: ensure CSIs aren't already fully settled
      for (const csi of row.settled_csis) {
        const otherSettlements = await Collection.aggregate([
          { $match: { status: 'POSTED', _id: { $ne: row._id } } },
          { $unwind: '$settled_csis' },
          { $match: { 'settled_csis.sales_line_id': csi.sales_line_id } },
          { $group: { _id: null, total: { $sum: '$settled_csis.invoice_amount' } } }
        ]);
        const alreadyCollected = otherSettlements[0]?.total || 0;
        const originalSale = await SalesLine.findById(csi.sales_line_id).select('invoice_total').lean();
        if (originalSale && alreadyCollected + csi.invoice_amount > originalSale.invoice_total + 1) {
          errors.push(`CSI ${csi.doc_ref} would exceed invoice total (already collected: P${alreadyCollected.toFixed(2)})`);
        }
      }
    }

    // CR formula validation
    const expectedCr = (row.total_csi_amount || 0) - (row.cwt_amount || 0);
    if (Math.abs((row.cr_amount || 0) - expectedCr) > 1.00) {
      errors.push(`CR amount (P${row.cr_amount}) does not match expected (P${expectedCr.toFixed(2)} = CSI total - CWT)`);
    }

    if (errors.length) {
      row.status = 'ERROR';
      row.validation_errors = errors;
      errorCount++;
    } else {
      row.status = 'VALID';
      row.validation_errors = [];
      validCount++;
    }
    await row.save();
  }

  res.json({ success: true, valid_count: validCount, error_count: errorCount });
});

// ═══ SUBMIT ═══

const submitCollections = catchAsync(async (req, res) => {
  const validRows = await Collection.find({ ...req.tenantFilter, status: 'VALID' });
  if (!validRows.length) {
    return res.status(400).json({ success: false, message: 'No VALID collections to submit' });
  }

  // Period lock check
  const { checkPeriodOpen, dateToPeriod } = require('../utils/periodLock');
  for (const row of validRows) {
    const period = dateToPeriod(row.cr_date);
    await checkPeriodOpen(row.entity_id, period);
  }

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      for (const row of validRows) {
        const [event] = await TransactionEvent.create([{
          entity_id: row.entity_id,
          bdm_id: row.bdm_id,
          event_type: 'CR',
          event_date: row.cr_date,
          document_ref: row.cr_no,
          payload: {
            hospital_id: row.hospital_id,
            settled_csis: row.settled_csis,
            cr_amount: row.cr_amount,
            cwt_amount: row.cwt_amount,
            total_commission: row.total_commission,
            total_partner_rebates: row.total_partner_rebates,
            payment_mode: row.payment_mode
          },
          created_by: req.user._id
        }], { session });

        row.status = 'POSTED';
        row.posted_at = new Date();
        row.posted_by = req.user._id;
        row.event_id = event._id;
        await row.save({ session });
      }
    });

    // Phase 9.1b: Link DocumentAttachments to events (outside transaction — non-blocking)
    for (const row of validRows) {
      if (row.event_id) {
        await DocumentAttachment.updateMany(
          { source_model: 'Collection', source_id: row._id },
          { $set: { event_id: row.event_id } }
        ).catch(() => {});
      }
    }

    // Phase 9.3: Auto-link CR events to settled CSI events (document flow)
    for (const row of validRows) {
      if (!row.event_id || !row.settled_csis?.length) continue;
      try {
        // Find CSI events for the settled sales lines
        const salesLineIds = row.settled_csis.map(c => c.sales_line_id);
        const csiEvents = await TransactionEvent.find({
          entity_id: row.entity_id,
          event_type: 'CSI',
          status: 'ACTIVE',
          'payload.hospital_id': row.hospital_id
        }).lean();

        // Match CSI events by checking if their source SalesLine is in settled list
        const csiSalesLines = await SalesLine.find({
          _id: { $in: salesLineIds },
          event_id: { $ne: null }
        }).select('event_id').lean();

        const csiEventIds = csiSalesLines
          .map(sl => sl.event_id?.toString())
          .filter(Boolean);

        if (csiEventIds.length) {
          const linkedEvents = csiEventIds.map(eid => ({
            event_id: eid,
            relationship: 'SETTLES'
          }));
          await TransactionEvent.findByIdAndUpdate(row.event_id, {
            $push: { linked_events: { $each: linkedEvents } }
          });
        }
      } catch (err) {
        console.error('Document flow linking failed for CR:', row.cr_no, err.message);
      }
    }

    res.json({
      success: true,
      message: `${validRows.length} collection(s) posted`,
      posted_count: validRows.length
    });
  } finally {
    await session.endSession();
  }
});

// ═══ REOPEN ═══

const reopenCollections = catchAsync(async (req, res) => {
  const { collection_ids } = req.body;
  if (!collection_ids?.length) return res.status(400).json({ success: false, message: 'collection_ids required' });

  const rows = await Collection.find({ _id: { $in: collection_ids }, ...req.tenantFilter, status: 'POSTED' });
  if (!rows.length) return res.status(404).json({ success: false, message: 'No POSTED collections found' });

  for (const row of rows) {
    if (row.event_id) {
      await TransactionEvent.findByIdAndUpdate(row.event_id, { status: 'DELETED' });
    }
    row.status = 'DRAFT';
    row.reopen_count = (row.reopen_count || 0) + 1;
    row.posted_at = undefined;
    row.posted_by = undefined;
    row.event_id = undefined;
    await row.save();

    await ErpAuditLog.logChange({
      entity_id: row.entity_id, bdm_id: row.bdm_id,
      log_type: 'STATUS_CHANGE', target_ref: row._id.toString(),
      target_model: 'Collection', field_changed: 'status',
      old_value: 'POSTED', new_value: 'DRAFT',
      changed_by: req.user._id, note: `CR ${row.cr_no} reopened (count: ${row.reopen_count})`
    });
  }

  res.json({ success: true, message: `${rows.length} collection(s) reopened` });
});

// ═══ DELETION ═══

const requestDeletion = catchAsync(async (req, res) => {
  const collection = await Collection.findOne({ _id: req.params.id, ...req.tenantFilter, status: 'POSTED' });
  if (!collection) return res.status(404).json({ success: false, message: 'Posted collection not found' });

  collection.status = 'DELETION_REQUESTED';
  await collection.save();

  await ErpAuditLog.logChange({
    entity_id: collection.entity_id, bdm_id: collection.bdm_id,
    log_type: 'STATUS_CHANGE', target_ref: collection._id.toString(),
    target_model: 'Collection', field_changed: 'status',
    old_value: 'POSTED', new_value: 'DELETION_REQUESTED',
    changed_by: req.user._id, note: `CR ${collection.cr_no} deletion requested`
  });

  res.json({ success: true, message: 'Deletion requested' });
});

const approveDeletion = catchAsync(async (req, res) => {
  const collection = await Collection.findOne({ _id: req.params.id, status: 'DELETION_REQUESTED' });
  if (!collection) return res.status(404).json({ success: false, message: 'Collection not found' });

  // Reversal event
  const [reversalEvent] = await TransactionEvent.create([{
    entity_id: collection.entity_id, bdm_id: collection.bdm_id,
    event_type: 'CR_REVERSAL', event_date: new Date(),
    document_ref: `REV-${collection.cr_no}`,
    corrects_event_id: collection.event_id,
    // Phase 9.3: Link reversal to original CR
    linked_events: collection.event_id ? [{ event_id: collection.event_id, relationship: 'REVERSES' }] : [],
    payload: { original_cr_no: collection.cr_no, reason: req.body.reason },
    created_by: req.user._id
  }]);

  collection.deletion_event_id = reversalEvent._id;
  await collection.save();

  res.json({ success: true, message: 'Deletion approved — reversal event created' });
});

// ═══ SOA ═══

const generateSoaEndpoint = catchAsync(async (req, res) => {
  const { hospital_id } = req.body;
  if (!hospital_id) return res.status(400).json({ success: false, message: 'hospital_id required' });

  const entityId = (req.isPresident || req.isAdmin || req.isFinance) && req.body.entity_id
    ? req.body.entity_id : req.entityId;
  const bdmId = (req.isPresident || req.isAdmin || req.isFinance) && req.body.bdm_id
    ? req.body.bdm_id : req.bdmId;

  const buffer = await generateSoaWorkbook(hospital_id, entityId, bdmId);

  const hospital = await Hospital.findById(hospital_id).select('hospital_name').lean();
  const filename = `SOA_${(hospital?.hospital_name || 'Hospital').replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().slice(0, 10)}.xlsx`;

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buffer);
});

module.exports = {
  createCollection, updateCollection, deleteDraftCollection,
  getCollections, getCollectionById, getOpenCsisEndpoint,
  validateCollections, submitCollections, reopenCollections,
  getArAgingEndpoint, getCollectionRateEndpoint, generateSoaEndpoint,
  requestDeletion, approveDeletion
};
