/**
 * Sales Controller — SAP Park → Check → Post
 *
 * DRAFT → VALIDATE → POSTED → RE-OPEN lifecycle.
 * Uses MongoDB transactions for atomicity on submit.
 */
const mongoose = require('mongoose');
const SalesLine = require('../models/SalesLine');
const InventoryLedger = require('../models/InventoryLedger');
const ErpAuditLog = require('../models/ErpAuditLog');
const TransactionEvent = require('../models/TransactionEvent');
const ConsignmentTracker = require('../models/ConsignmentTracker');
const DocumentAttachment = require('../models/DocumentAttachment');
const { catchAsync } = require('../../middleware/errorHandler');
const { consumeFIFO, consumeSpecificBatch, buildStockSnapshot } = require('../services/fifoEngine');
const { journalFromSale, journalFromServiceRevenue, journalFromCOGS } = require('../services/autoJournal');
const { createAndPostJournal, reverseJournal } = require('../services/journalEngine');
const JournalEntry = require('../models/JournalEntry');
const ProductMaster = require('../models/ProductMaster');

// ═══════════════════════════════════════════════════════════
// CRUD
// ═══════════════════════════════════════════════════════════

const createSale = catchAsync(async (req, res) => {
  const saleData = {
    ...req.body,
    entity_id: req.entityId,
    bdm_id: req.bdmId,
    created_by: req.user._id,
    status: 'DRAFT'
  };

  // Source routing: OPENING_AR if csi_date < user.live_date
  if (req.user.live_date && saleData.csi_date) {
    saleData.source = new Date(saleData.csi_date) < new Date(req.user.live_date)
      ? 'OPENING_AR' : 'SALES_LINE';
  }

  // Phase 18: auto-generate invoice_number for non-CSI sales
  if (saleData.sale_type && saleData.sale_type !== 'CSI' && !saleData.invoice_number) {
    const { generateDocNumber } = require('../services/docNumbering');
    const prefix = saleData.sale_type === 'SERVICE_INVOICE' ? 'SVC' : 'RCT';
    saleData.invoice_number = await generateDocNumber({
      prefix,
      bdmId: req.bdmId,
      date: saleData.csi_date || new Date()
    });
    // Also set doc_ref to invoice_number for non-CSI (used in displays)
    if (!saleData.doc_ref) saleData.doc_ref = saleData.invoice_number;
  }

  const sale = await SalesLine.create(saleData);
  res.status(201).json({ success: true, data: sale });
});

const updateSale = catchAsync(async (req, res) => {
  const sale = await SalesLine.findOne({
    _id: req.params.id,
    ...req.tenantFilter
  });

  if (!sale) {
    return res.status(404).json({ success: false, message: 'Sale not found' });
  }
  if (sale.status !== 'DRAFT') {
    return res.status(400).json({ success: false, message: 'Only DRAFT sales can be edited' });
  }

  // Track changes for audit
  const changes = [];
  for (const [key, val] of Object.entries(req.body)) {
    if (['_id', 'entity_id', 'bdm_id', 'created_at', 'created_by', 'status'].includes(key)) continue;
    if (JSON.stringify(sale[key]) !== JSON.stringify(val)) {
      changes.push({ field: key, old: sale[key], new: val });
    }
  }

  Object.assign(sale, req.body);
  sale.status = 'DRAFT'; // Reset to DRAFT on edit
  sale.validation_errors = [];
  await sale.save();

  // Audit log
  for (const change of changes) {
    await ErpAuditLog.logChange({
      entity_id: req.entityId,
      bdm_id: req.bdmId,
      log_type: 'SALES_EDIT',
      target_ref: sale._id.toString(),
      target_model: 'SalesLine',
      field_changed: change.field,
      old_value: change.old,
      new_value: change.new,
      changed_by: req.user._id
    });
  }

  res.json({ success: true, data: sale });
});

const deleteDraftRow = catchAsync(async (req, res) => {
  const sale = await SalesLine.findOne({
    _id: req.params.id,
    ...req.tenantFilter
  });

  if (!sale) {
    return res.status(404).json({ success: false, message: 'Sale not found' });
  }
  if (sale.status !== 'DRAFT') {
    return res.status(400).json({ success: false, message: 'Only DRAFT rows can be deleted' });
  }

  await SalesLine.findByIdAndDelete(sale._id);
  res.json({ success: true, message: 'Draft row deleted' });
});

const getSales = catchAsync(async (req, res) => {
  const filter = { ...req.tenantFilter };

  if (req.query.status) filter.status = req.query.status;
  if (req.query.hospital_id) filter.hospital_id = req.query.hospital_id;
  if (req.query.customer_id) filter.customer_id = req.query.customer_id;
  if (req.query.sale_type) filter.sale_type = req.query.sale_type;
  if (req.query.source) filter.source = req.query.source;
  if (req.query.csi_date_from || req.query.csi_date_to) {
    filter.csi_date = {};
    if (req.query.csi_date_from) filter.csi_date.$gte = new Date(req.query.csi_date_from);
    if (req.query.csi_date_to) filter.csi_date.$lte = new Date(req.query.csi_date_to);
  }

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;
  const skip = (page - 1) * limit;

  const [sales, total] = await Promise.all([
    SalesLine.find(filter)
      .populate('hospital_id', 'hospital_name')
      .populate('customer_id', 'customer_name customer_type')
      .populate('bdm_id', 'name')
      .sort({ csi_date: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    SalesLine.countDocuments(filter)
  ]);

  res.json({
    success: true,
    data: sales,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) }
  });
});

const getSaleById = catchAsync(async (req, res) => {
  const sale = await SalesLine.findOne({
    _id: req.params.id,
    ...req.tenantFilter
  })
    .populate('hospital_id', 'hospital_name')
    .populate('customer_id', 'customer_name customer_type')
    .populate('bdm_id', 'name')
    .lean();

  if (!sale) {
    return res.status(404).json({ success: false, message: 'Sale not found' });
  }

  res.json({ success: true, data: sale });
});

// ═══════════════════════════════════════════════════════════
// VALIDATE — THE CORE ENDPOINT
// ═══════════════════════════════════════════════════════════

const validateSales = catchAsync(async (req, res) => {
  const filter = {
    ...req.tenantFilter,
    status: { $in: ['DRAFT', 'ERROR'] }
  };

  // Optionally validate specific rows
  if (req.body.sale_ids && req.body.sale_ids.length) {
    filter._id = { $in: req.body.sale_ids };
  }

  const rows = await SalesLine.find(filter);
  if (!rows.length) {
    return res.json({ success: true, valid_count: 0, error_count: 0, errors: [] });
  }

  // Build fresh stock snapshot from InventoryLedger
  // Phase 17: If rows have warehouse_id, scope snapshot to that warehouse.
  // For now, all rows for a BDM share one warehouse, so first row's warehouse is used.
  const firstWarehouseId = rows[0]?.warehouse_id;
  const snapOpts = firstWarehouseId ? { warehouseId: firstWarehouseId.toString() } : undefined;
  // President/admin/finance without a warehouse scope → query all entity stock
  const bdmId = (req.isPresident || req.isAdmin || req.isFinance) && !firstWarehouseId ? null : req.bdmId;
  const { productTotals } = await buildStockSnapshot(req.entityId, bdmId, snapOpts);

  // In-memory deduction tracker (prevents double-allocation across rows)
  const deducted = new Map(); // productId → qty deducted so far

  const errors = [];
  let validCount = 0;
  let errorCount = 0;

  for (const row of rows) {
    const rowErrors = [];

    // Phase 18: type-aware required field validation
    const saleType = row.sale_type || 'CSI';

    // At least one customer reference required
    if (!row.hospital_id && !row.customer_id) {
      rowErrors.push('Hospital or Customer is required');
    }
    if (!row.csi_date) rowErrors.push('Invoice date is required');

    if (saleType === 'CSI') {
      if (!row.doc_ref) rowErrors.push('Document reference (CSI#) is required');
      if (!row.line_items || row.line_items.length === 0) rowErrors.push('At least one line item is required');
    } else if (saleType === 'CASH_RECEIPT') {
      if (!row.line_items || row.line_items.length === 0) rowErrors.push('At least one line item is required');
    } else if (saleType === 'SERVICE_INVOICE') {
      if (!row.service_description) rowErrors.push('Service description is required');
      if (!row.invoice_total || row.invoice_total <= 0) rowErrors.push('Invoice total must be greater than 0');
    }

    // No future dates
    if (row.csi_date && row.csi_date > new Date()) {
      rowErrors.push('CSI date cannot be in the future');
    }

    // Credit limit check
    if (row.hospital_id) {
      try {
        const hospital = await require('../models/Hospital').findById(row.hospital_id).select('credit_limit credit_limit_action hospital_name').lean();
        if (hospital?.credit_limit != null && hospital.credit_limit > 0) {
          const { getHospitalArBalance } = require('../services/arEngine');
          const currentAr = await getHospitalArBalance(row.hospital_id, row.entity_id);
          const projectedAr = currentAr + (row.invoice_total || 0);
          if (projectedAr > hospital.credit_limit) {
            const msg = `Credit limit: AR P${currentAr.toFixed(2)} + invoice P${(row.invoice_total || 0).toFixed(2)} = P${projectedAr.toFixed(2)} exceeds limit P${hospital.credit_limit.toFixed(2)} for ${hospital.hospital_name}`;
            if (hospital.credit_limit_action === 'BLOCK') {
              rowErrors.push(msg);
            } else {
              rowErrors.push(`WARNING: ${msg}`);
            }
          }
        }
      } catch { /* AR engine not critical for validation */ }
    }

    // Duplicate check: same doc_ref + hospital/customer (CSI and CASH_RECEIPT only)
    if (saleType !== 'SERVICE_INVOICE' && row.doc_ref) {
      const dupFilter = {
        _id: { $ne: row._id },
        entity_id: row.entity_id,
        doc_ref: row.doc_ref,
        status: { $nin: ['DELETION_REQUESTED'] }
      };
      if (row.hospital_id) dupFilter.hospital_id = row.hospital_id;
      if (row.customer_id) dupFilter.customer_id = row.customer_id;

      const dupCheck = await SalesLine.findOne(dupFilter);
      if (dupCheck) {
        rowErrors.push(`Duplicate: ${row.doc_ref} already exists for this customer`);
      }
    }

    // Stock check per line item (skip for SERVICE_INVOICE — no inventory)
    if (saleType === 'SERVICE_INVOICE') {
      // SERVICE_INVOICE: no stock check needed, skip line item validation
    } else for (const item of row.line_items) {
      if (!item.product_id) {
        rowErrors.push('Product is required for each line item');
        continue;
      }

      const pid = item.product_id.toString();
      const available = (productTotals.get(pid) || 0) - (deducted.get(pid) || 0);

      if (item.qty > available) {
        rowErrors.push(
          `Insufficient stock for product ${item.item_key || pid}: available ${available}, requested ${item.qty}`
        );
      } else {
        // Deduct from snapshot for subsequent rows
        deducted.set(pid, (deducted.get(pid) || 0) + item.qty);
      }
    }

    // VAT balance check
    if (row.line_items.length > 0) {
      const computedTotal = row.line_items.reduce((sum, li) => sum + (li.qty * li.unit_price), 0);
      const diff = Math.abs(computedTotal - row.invoice_total);
      if (diff > 0.01) {
        rowErrors.push(`Invoice total mismatch: computed ${computedTotal.toFixed(2)}, recorded ${row.invoice_total.toFixed(2)}`);
      }
    }

    // Update row status
    if (rowErrors.length > 0) {
      row.status = 'ERROR';
      row.validation_errors = rowErrors;
      errorCount++;
      errors.push({
        sale_id: row._id,
        doc_ref: row.doc_ref,
        messages: rowErrors
      });
    } else {
      row.status = 'VALID';
      row.validation_errors = [];
      validCount++;
    }

    await row.save();
  }

  res.json({ success: true, valid_count: validCount, error_count: errorCount, errors });
});

// ═══════════════════════════════════════════════════════════
// SUBMIT — POST ALL VALID ROWS (with MongoDB transaction)
// ═══════════════════════════════════════════════════════════

const submitSales = catchAsync(async (req, res) => {
  const validRows = await SalesLine.find({
    ...req.tenantFilter,
    status: 'VALID'
  });

  if (!validRows.length) {
    return res.status(400).json({
      success: false,
      message: 'No VALID rows to submit. Run validation first.'
    });
  }

  // Period lock check — prevent posting to closed/locked months
  const { checkPeriodOpen, dateToPeriod } = require('../utils/periodLock');
  for (const row of validRows) {
    const period = dateToPeriod(row.csi_date);
    await checkPeriodOpen(row.entity_id, period);
  }

  const session = await mongoose.startSession();
  const eventIds = [];

  try {
    await session.withTransaction(async () => {
      for (const row of validRows) {
        const saleType = row.sale_type || 'CSI';

        // 1. Create TransactionEvent (immutable)
        const eventType = saleType === 'SERVICE_INVOICE' ? 'SERVICE_INVOICE'
          : saleType === 'CASH_RECEIPT' ? 'CASH_RECEIPT' : 'CSI';

        const [event] = await TransactionEvent.create([{
          entity_id: row.entity_id,
          bdm_id: row.bdm_id,
          event_type: eventType,
          event_date: row.csi_date,
          document_ref: row.doc_ref || row.invoice_number,
          payload: {
            hospital_id: row.hospital_id,
            customer_id: row.customer_id,
            sale_type: saleType,
            line_items: row.line_items,
            invoice_total: row.invoice_total,
            service_description: row.service_description,
            source: row.source
          },
          created_by: req.user._id
        }], { session });

        eventIds.push(event._id);

        // 2. SERVICE_INVOICE: no inventory deduction — skip to posting
        if (saleType === 'SERVICE_INVOICE') {
          row.status = 'POSTED';
          row.posted_at = new Date();
          row.posted_by = req.user._id;
          row.event_id = event._id;
          await row.save({ session });
          continue;
        }

        // 3. Create InventoryLedger entries per line item (CSI + CASH_RECEIPT)
        for (const item of row.line_items) {
          // Check if this CSI references a DR (consignment)
          const consignment = await ConsignmentTracker.findOne({
            entity_id: row.entity_id,
            bdm_id: row.bdm_id,
            hospital_id: row.hospital_id,
            product_id: item.product_id,
            status: 'ACTIVE'
          }).session(session);

          if (consignment) {
            // CSI-DR: inventory already deducted at DR. Update ConsignmentTracker only
            consignment.qty_consumed += item.qty;
            consignment.conversions.push({
              csi_doc_ref: row.doc_ref,
              csi_date: row.csi_date,
              qty_converted: item.qty,
              sales_line_id: row._id
            });
            await consignment.save({ session });
          } else {
            // Regular CSI: consume inventory via FIFO
            // Phase 17: warehouse-scoped FIFO consumption
            const fifoOpts = row.warehouse_id ? { warehouseId: row.warehouse_id.toString() } : undefined;
            // President/admin/finance without warehouse → entity-wide FIFO
            const submitBdmId = (req.isPresident || req.isAdmin || req.isFinance) && !row.warehouse_id
              ? null : row.bdm_id;
            let consumed;
            if (item.fifo_override && item.batch_lot_no) {
              consumed = [await consumeSpecificBatch(
                row.entity_id, submitBdmId, item.product_id, item.batch_lot_no, item.qty, fifoOpts
              )];
            } else {
              consumed = await consumeFIFO(
                row.entity_id, submitBdmId, item.product_id, item.qty, fifoOpts
              );
            }

            // Create ledger entries for each consumed batch
            for (const c of consumed) {
              await InventoryLedger.create([{
                entity_id: row.entity_id,
                bdm_id: c.bdm_id || row.bdm_id,
                warehouse_id: row.warehouse_id || undefined,
                product_id: item.product_id,
                batch_lot_no: c.batch_lot_no,
                expiry_date: c.expiry_date,
                transaction_type: 'CSI',
                qty_out: c.qty_consumed,
                event_id: event._id,
                fifo_override: item.fifo_override || false,
                override_reason: item.override_reason,
                recorded_by: req.user._id
              }], { session });
            }
          }
        }

        // 3. Update SalesLine status
        row.status = 'POSTED';
        row.posted_at = new Date();
        row.posted_by = req.user._id;
        row.event_id = event._id;
        await row.save({ session });
      }
    });

    // Phase 9.1b: Link DocumentAttachments to events (outside transaction — non-blocking)
    for (let i = 0; i < validRows.length; i++) {
      await DocumentAttachment.updateMany(
        { source_model: 'SalesLine', source_id: validRows[i]._id },
        { $set: { event_id: eventIds[i] } }
      ).catch(() => {});
    }

    // Phase 11: Auto-journal entries (non-blocking — outside transaction)
    for (const row of validRows) {
      try {
        const saleType = row.sale_type || 'CSI';
        // Revenue JE
        const jeData = saleType === 'SERVICE_INVOICE'
          ? journalFromServiceRevenue(row, row.entity_id, req.user._id)
          : journalFromSale(row, row.entity_id, req.user._id);
        jeData.source_event_id = row.event_id;
        await createAndPostJournal(row.entity_id, jeData);

        // COGS JE (skip for SERVICE_INVOICE — no inventory)
        if (saleType !== 'SERVICE_INVOICE' && row.line_items?.length) {
          const productIds = row.line_items.map(li => li.product_id);
          const products = await ProductMaster.find({ _id: { $in: productIds } }).select('purchase_price').lean();
          const costMap = new Map(products.map(p => [p._id.toString(), p.purchase_price || 0]));
          const totalCogs = row.line_items.reduce((sum, li) => sum + (li.qty || 0) * (costMap.get(li.product_id?.toString()) || 0), 0);
          const cogsData = journalFromCOGS(row, Math.round(totalCogs * 100) / 100, req.user._id);
          if (cogsData) {
            cogsData.source_event_id = row.event_id;
            await createAndPostJournal(row.entity_id, cogsData);
          }
        }
      } catch (jeErr) {
        console.error('Auto-journal failed for sale:', row.doc_ref || row._id, jeErr.message);
      }
    }

    res.json({
      success: true,
      message: `${validRows.length} sales posted successfully`,
      posted_count: validRows.length,
      event_ids: eventIds
    });
  } finally {
    await session.endSession();
  }
});

// ═══════════════════════════════════════════════════════════
// REOPEN — Un-post for corrections
// ═══════════════════════════════════════════════════════════

const reopenSales = catchAsync(async (req, res) => {
  const { sale_ids } = req.body;
  if (!sale_ids || !sale_ids.length) {
    return res.status(400).json({ success: false, message: 'sale_ids required' });
  }

  const rows = await SalesLine.find({
    _id: { $in: sale_ids },
    ...req.tenantFilter,
    status: 'POSTED'
  });

  if (!rows.length) {
    return res.status(400).json({ success: false, message: 'No POSTED rows found to reopen' });
  }

  let reopenedCount = 0;

  for (const row of rows) {
    // Create reversal InventoryLedger entries
    const originalEntries = await InventoryLedger.find({ event_id: row.event_id });

    for (const entry of originalEntries) {
      await InventoryLedger.create({
        entity_id: entry.entity_id,
        bdm_id: entry.bdm_id,
        warehouse_id: entry.warehouse_id || undefined,
        product_id: entry.product_id,
        batch_lot_no: entry.batch_lot_no,
        expiry_date: entry.expiry_date,
        transaction_type: 'ADJUSTMENT',
        qty_in: entry.qty_out,  // Reverse: what went out comes back in
        qty_out: entry.qty_in,  // Reverse: what came in goes out
        event_id: row.event_id,
        recorded_by: req.user._id
      });
    }

    // Reverse ConsignmentTracker if applicable
    for (const item of row.line_items) {
      const consignment = await ConsignmentTracker.findOne({
        entity_id: row.entity_id,
        hospital_id: row.hospital_id,
        product_id: item.product_id,
        'conversions.sales_line_id': row._id
      });

      if (consignment) {
        // Remove the conversion and reduce qty_consumed
        consignment.conversions = consignment.conversions.filter(
          c => !c.sales_line_id || c.sales_line_id.toString() !== row._id.toString()
        );
        consignment.qty_consumed = Math.max(0, consignment.qty_consumed - item.qty);
        await consignment.save();
      }
    }

    // Reverse journal entries (SAP Storno)
    if (row.event_id) {
      try {
        const jes = await JournalEntry.find({
          source_event_id: row.event_id, status: 'POSTED', is_reversal: { $ne: true }
        });
        for (const je of jes) {
          await reverseJournal(je._id, 'Auto-reversal: SalesLine reopen', req.user._id);
        }
      } catch (jeErr) {
        console.error('JE reversal failed for sale reopen:', row._id, jeErr.message);
      }
    }

    // Update SalesLine
    row.status = 'DRAFT';
    row.reopen_count += 1;
    row.posted_at = undefined;
    row.posted_by = undefined;
    row.event_id = undefined;
    row.validation_errors = [];
    await row.save();

    // Audit log
    await ErpAuditLog.logChange({
      entity_id: row.entity_id,
      bdm_id: row.bdm_id,
      log_type: 'REOPEN',
      target_ref: row._id.toString(),
      target_model: 'SalesLine',
      changed_by: req.user._id,
      note: `Reopened (count: ${row.reopen_count})`
    });

    reopenedCount++;
  }

  res.json({ success: true, reopened_count: reopenedCount });
});

// ═══════════════════════════════════════════════════════════
// DELETION — BDM request + Finance/Admin approve (SAP Storno)
// ═══════════════════════════════════════════════════════════

const requestDeletion = catchAsync(async (req, res) => {
  const sale = await SalesLine.findOne({
    _id: req.params.id,
    ...req.tenantFilter,
    status: 'POSTED'
  });

  if (!sale) {
    return res.status(404).json({ success: false, message: 'Posted sale not found' });
  }

  sale.status = 'DELETION_REQUESTED';
  await sale.save();

  await ErpAuditLog.logChange({
    entity_id: sale.entity_id,
    bdm_id: sale.bdm_id,
    log_type: 'DELETION',
    target_ref: sale._id.toString(),
    target_model: 'SalesLine',
    changed_by: req.user._id,
    note: 'Deletion requested by BDM'
  });

  res.json({ success: true, message: 'Deletion requested', data: sale });
});

const approveDeletion = catchAsync(async (req, res) => {
  const sale = await SalesLine.findOne({
    _id: req.params.id,
    status: 'DELETION_REQUESTED'
  });

  if (!sale) {
    return res.status(404).json({ success: false, message: 'Deletion-requested sale not found' });
  }

  // SAP Storno: create reversal TransactionEvent
  const reversalEvent = await TransactionEvent.create({
    entity_id: sale.entity_id,
    bdm_id: sale.bdm_id,
    event_type: 'CSI_REVERSAL',
    event_date: new Date(),
    document_ref: `REV-${sale.doc_ref}`,
    payload: {
      original_sale_id: sale._id,
      original_event_id: sale.event_id,
      reason: req.body.reason || 'Approved deletion'
    },
    corrects_event_id: sale.event_id,
    created_by: req.user._id
  });

  // Reverse InventoryLedger entries
  const originalEntries = await InventoryLedger.find({ event_id: sale.event_id });
  for (const entry of originalEntries) {
    await InventoryLedger.create({
      entity_id: entry.entity_id,
      bdm_id: entry.bdm_id,
      warehouse_id: entry.warehouse_id || undefined,
      product_id: entry.product_id,
      batch_lot_no: entry.batch_lot_no,
      expiry_date: entry.expiry_date,
      transaction_type: 'ADJUSTMENT',
      qty_in: entry.qty_out,
      qty_out: entry.qty_in,
      event_id: reversalEvent._id,
      recorded_by: req.user._id
    });
  }

  // Reverse journal entries (SAP Storno)
  if (sale.event_id) {
    try {
      const jes = await JournalEntry.find({
        source_event_id: sale.event_id, status: 'POSTED', is_reversal: { $ne: true }
      });
      for (const je of jes) {
        await reverseJournal(je._id, `Auto-reversal: SalesLine deletion approved`, req.user._id);
      }
    } catch (jeErr) {
      console.error('JE reversal failed for sale deletion:', sale._id, jeErr.message);
    }
  }

  // Mark original with deletion_event_id (original stays POSTED for audit trail)
  sale.deletion_event_id = reversalEvent._id;
  await sale.save();

  // Audit log
  await ErpAuditLog.logChange({
    entity_id: sale.entity_id,
    bdm_id: sale.bdm_id,
    log_type: 'DELETION',
    target_ref: sale._id.toString(),
    target_model: 'SalesLine',
    changed_by: req.user._id,
    note: `Deletion approved. Reversal event: ${reversalEvent._id}`
  });

  res.json({
    success: true,
    message: 'Deletion approved — reversal created (SAP Storno)',
    reversal_event_id: reversalEvent._id
  });
});

module.exports = {
  createSale,
  updateSale,
  deleteDraftRow,
  getSales,
  getSaleById,
  validateSales,
  submitSales,
  reopenSales,
  requestDeletion,
  approveDeletion
};
