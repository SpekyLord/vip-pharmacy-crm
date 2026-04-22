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
const { presidentReverse } = require('../services/documentReversalService');
const JournalEntry = require('../models/JournalEntry');
const ProductMaster = require('../models/ProductMaster');
const { notifyDocumentPosted, notifyDocumentReopened } = require('../services/erpNotificationService');
const { getEditableStatuses } = require('../services/approvalService');
const PettyCashFund = require('../models/PettyCashFund');
const PettyCashTransaction = require('../models/PettyCashTransaction');
const Collection = require('../models/Collection');
const { validateCsiNumber, markUsed: markCsiUsed, unmarkUsed: unmarkCsiUsed } = require('../services/csiBookletService');
const Lookup = require('../models/Lookup');
// Phase G4.5a — proxy entry (record on behalf of another BDM)
const { resolveOwnerForWrite, widenFilterForProxy } = require('../utils/resolveOwnerScope');

/**
 * Read a numeric flag from the per-entity SALES_SETTINGS lookup with a hard
 * fallback when the entry is missing. Mirrors `getGrnSetting` in
 * undertakingService.js — subscription-ready: subscribers tune flags in
 * Control Center → Lookup Tables without a code change. Defaults preserve
 * the pharmacy-ops behavior (photo required) so an entity that never opens
 * Control Center still gets the strict check.
 */
const getSalesSetting = async (entityId, code, fallback) => {
  if (!entityId) return fallback;
  try {
    const entry = await Lookup.findOne({
      entity_id: entityId,
      category: 'SALES_SETTINGS',
      code,
      is_active: true,
    }).lean();
    const value = entry?.metadata?.value;
    if (value === undefined || value === null) return fallback;
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
  } catch (err) {
    console.error(`[salesController] getSalesSetting failed for ${code}:`, err.message);
    return fallback;
  }
};

// ═══════════════════════════════════════════════════════════
// SHARED: Post a single SalesLine row (used by submitSales + approval handler)
// ═══════════════════════════════════════════════════════════

/**
 * Posts a single SalesLine row with full side effects:
 * TransactionEvent, inventory (FIFO/consignment), journal entries.
 *
 * @param {Object} row - Mongoose SalesLine document (mutated in place)
 * @param {ObjectId} userId - The user performing the post
 * @param {Object} [opts] - Optional overrides
 * @param {boolean} [opts.isAdminLike] - true if poster is president/admin/finance (entity-wide FIFO)
 * @returns {Promise<{eventId: ObjectId}>}
 */
const postSaleRow = async (row, userId, opts = {}) => {
  const saleType = row.sale_type || 'CSI';
  const eventType = saleType === 'SERVICE_INVOICE' ? 'SERVICE_INVOICE'
    : saleType === 'CASH_RECEIPT' ? 'CASH_RECEIPT' : 'CSI';

  const session = await mongoose.startSession();
  let eventId;

  try {
    await session.withTransaction(async () => {
      // 1. Create TransactionEvent (immutable)
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
        created_by: userId
      }], { session });

      eventId = event._id;

      // 2. SERVICE_INVOICE or OPENING_AR: no inventory deduction
      if (saleType === 'SERVICE_INVOICE' || row.source === 'OPENING_AR') {
        row.status = 'POSTED';
        row.posted_at = new Date();
        row.posted_by = userId;
        row.event_id = event._id;
        await row.save({ session });

        // Direct petty cash deposit for SERVICE_INVOICE with CASH payment + fund routing
        if (row.petty_cash_fund_id && saleType === 'SERVICE_INVOICE' && row.payment_mode === 'CASH') {
          const fund = await PettyCashFund.findById(row.petty_cash_fund_id).session(session);
          if (!fund) throw new Error(`Petty cash fund not found for ${row.invoice_number || row._id}`);
          if (['SUSPENDED', 'CLOSED'].includes(fund.status)) throw new Error(`Fund ${fund.fund_code} is ${fund.status}`);
          if ((fund.fund_mode || 'REVOLVING') === 'EXPENSE_ONLY') throw new Error(`Fund ${fund.fund_code} is EXPENSE_ONLY`);
          const depositAmount = row.invoice_total || 0;
          if (depositAmount > 0) {
            await PettyCashTransaction.create([{
              entity_id: row.entity_id,
              fund_id: fund._id,
              txn_type: 'DEPOSIT',
              txn_date: row.csi_date || new Date(),
              amount: depositAmount,
              source_description: `${saleType} ${row.invoice_number || row.doc_ref || ''}`.trim(),
              linked_sales_line_id: row._id,
              status: 'POSTED',
              posted_at: new Date(),
              posted_by: userId,
              created_by: userId,
              running_balance: Math.round((fund.current_balance + depositAmount) * 100) / 100
            }], { session });
            await PettyCashFund.findByIdAndUpdate(fund._id, {
              $inc: { current_balance: depositAmount }
            }, { session });
          }
        }
        return;
      }

      // 3. Inventory deduction for CSI + CASH_RECEIPT (SALES_LINE only)
      for (const item of row.line_items) {
        const consignment = await ConsignmentTracker.findOne({
          entity_id: row.entity_id,
          bdm_id: row.bdm_id,
          hospital_id: row.hospital_id,
          product_id: item.product_id,
          status: 'ACTIVE'
        }).session(session);

        if (consignment) {
          consignment.qty_consumed += item.qty;
          consignment.conversions.push({
            csi_doc_ref: row.doc_ref,
            csi_date: row.csi_date,
            qty_converted: item.qty,
            sales_line_id: row._id
          });
          await consignment.save({ session });
        } else {
          const fifoOpts = { ...(row.warehouse_id && { warehouseId: row.warehouse_id.toString() }), session };
          const submitBdmId = opts.isAdminLike && !row.warehouse_id ? null : row.bdm_id;
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
              recorded_by: userId
            }], { session });
          }
        }
      }

      // 4. Update SalesLine status
      row.status = 'POSTED';
      row.posted_at = new Date();
      row.posted_by = userId;
      row.event_id = event._id;
      await row.save({ session });

      // Direct petty cash deposit for CASH_RECEIPT with CASH payment + fund routing
      if (row.petty_cash_fund_id && saleType === 'CASH_RECEIPT' && row.payment_mode === 'CASH') {
        const fund = await PettyCashFund.findById(row.petty_cash_fund_id).session(session);
        if (!fund) throw new Error(`Petty cash fund not found for ${row.invoice_number || row._id}`);
        if (['SUSPENDED', 'CLOSED'].includes(fund.status)) throw new Error(`Fund ${fund.fund_code} is ${fund.status}`);
        if ((fund.fund_mode || 'REVOLVING') === 'EXPENSE_ONLY') throw new Error(`Fund ${fund.fund_code} is EXPENSE_ONLY`);
        const depositAmount = row.invoice_total || 0;
        if (depositAmount > 0) {
          await PettyCashTransaction.create([{
            entity_id: row.entity_id,
            fund_id: fund._id,
            txn_type: 'DEPOSIT',
            txn_date: row.csi_date || new Date(),
            amount: depositAmount,
            source_description: `${saleType} ${row.invoice_number || row.doc_ref || ''}`.trim(),
            linked_sales_line_id: row._id,
            status: 'POSTED',
            posted_at: new Date(),
            posted_by: userId,
            created_by: userId,
            running_balance: Math.round((fund.current_balance + depositAmount) * 100) / 100
          }], { session });
          await PettyCashFund.findByIdAndUpdate(fund._id, {
            $inc: { current_balance: depositAmount }
          }, { session });
        }
      }
    });

    // 5. Link DocumentAttachments (non-blocking)
    await DocumentAttachment.updateMany(
      { source_model: 'SalesLine', source_id: row._id },
      { $set: { event_id: eventId } }
    ).catch(() => {});

    // 6. Journal entries (non-blocking)
    try {
      const jeData = saleType === 'SERVICE_INVOICE'
        ? await journalFromServiceRevenue(row, row.entity_id, userId)
        : await journalFromSale(row, row.entity_id, userId);
      jeData.source_event_id = eventId;
      await createAndPostJournal(row.entity_id, jeData);

      // COGS JE (skip for SERVICE_INVOICE and OPENING_AR)
      if (saleType !== 'SERVICE_INVOICE' && row.source !== 'OPENING_AR' && row.line_items?.length) {
        const productIds = row.line_items.map(li => li.product_id);
        const products = await ProductMaster.find({ _id: { $in: productIds } }).select('purchase_price').lean();
        const costMap = new Map(products.map(p => [p._id.toString(), p.purchase_price || 0]));
        const totalCogs = row.line_items.reduce((sum, li) => sum + (li.qty || 0) * (costMap.get(li.product_id?.toString()) || 0), 0);
        const cogsData = await journalFromCOGS(row, Math.round(totalCogs * 100) / 100, userId);
        if (cogsData) {
          cogsData.source_event_id = eventId;
          await createAndPostJournal(row.entity_id, cogsData);
        }
      }
    } catch (jeErr) {
      console.error('Auto-journal failed for sale:', row.doc_ref || row._id, jeErr.message);
      ErpAuditLog.logChange({
        entity_id: row.entity_id, log_type: 'LEDGER_ERROR',
        target_ref: row.doc_ref || row._id?.toString(), target_model: 'JournalEntry',
        field_changed: 'auto_journal', new_value: jeErr.message,
        changed_by: row.posted_by,
        note: `Auto-journal failed for sale ${row.doc_ref || row._id} (approval hub)`
      }).catch(() => {});
    }

    // 7. Phase 15.2 (softened) — auto-mark CSI number as used. Non-blocking.
    if ((row.sale_type || 'CSI') === 'CSI' && row.doc_ref) {
      try {
        await markCsiUsed(row.entity_id, null, row.doc_ref);
      } catch (csiErr) {
        console.error('CSI markUsed failed (non-blocking, approval hub):', row.doc_ref, csiErr.message);
      }
    }

    // 8. Phase SG-4 #22 — Credit rule assignment. Produces SalesCredit rows
    //    (audit trail of who-earns-what). Always non-blocking: a sale that
    //    posts but fails credit assignment will fall back to sale.bdm_id @
    //    100% on the next engine run, and the failure is logged via
    //    ErpAuditLog. Never reverses the sale itself.
    try {
      const { assign: assignCredits } = require('../services/creditRuleEngine');
      await assignCredits(row, { userId });
    } catch (ceErr) {
      console.error('Credit rule assignment failed (non-blocking):', row.doc_ref || row._id, ceErr.message);
    }

    return { eventId };
  } finally {
    await session.endSession();
  }
};

// ═══════════════════════════════════════════════════════════
// CRUD
// ═══════════════════════════════════════════════════════════

const createSale = catchAsync(async (req, res) => {
  // Determine source first so we can pick the right proxy sub-perm key.
  // Opening AR is gated by `sales.opening_ar_proxy`; live sales by `sales.proxy_entry`.
  const willBeOpeningAr = !!(req.user.live_date && req.body.csi_date &&
    new Date(req.body.csi_date) < new Date(req.user.live_date));
  const proxySubKey = willBeOpeningAr ? 'opening_ar_proxy' : 'proxy_entry';

  let owner;
  try {
    owner = await resolveOwnerForWrite(req, 'sales', { subKey: proxySubKey });
  } catch (err) {
    if (err.statusCode === 403) return res.status(403).json({ success: false, message: err.message });
    throw err;
  }

  const { assigned_to: _discardAssignedTo, ...bodyWithoutAssignedTo } = req.body || {};
  const saleData = {
    ...bodyWithoutAssignedTo,
    entity_id: req.entityId,
    bdm_id: owner.ownerId,
    recorded_on_behalf_of: owner.proxiedBy,
    created_by: req.user._id,
    status: 'DRAFT'
  };

  // Source routing: OPENING_AR if csi_date < user.live_date
  if (req.user.live_date && saleData.csi_date) {
    saleData.source = new Date(saleData.csi_date) < new Date(req.user.live_date)
      ? 'OPENING_AR' : 'SALES_LINE';
  }

  // Validate line items before saving — catch qty ≤ 0 and unit_price ≤ 0 early
  const saleType = saleData.sale_type || 'CSI';
  if (saleType !== 'SERVICE_INVOICE' && Array.isArray(saleData.line_items)) {
    for (const item of saleData.line_items) {
      if (!item.qty || item.qty <= 0) {
        return res.status(400).json({
          success: false,
          message: `Quantity must be greater than 0 for ${item.item_key || 'product'}`
        });
      }
      if (!item.unit_price || item.unit_price <= 0) {
        return res.status(400).json({
          success: false,
          message: `Unit price must be greater than 0 for ${item.item_key || 'product'}`
        });
      }
    }
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

  // Phase G4.5a — audit proxy creation so Activity Monitor can surface it.
  if (owner.isOnBehalf) {
    await ErpAuditLog.logChange({
      entity_id: req.entityId,
      bdm_id: owner.ownerId,
      log_type: 'PROXY_CREATE',
      target_ref: sale._id.toString(),
      target_model: 'SalesLine',
      changed_by: req.user._id,
      note: `Proxy create: ${sale.source || 'SALES_LINE'} ${sale.doc_ref || sale._id} keyed by ${req.user.name || req.user._id} (${req.user.role}) on behalf of BDM ${owner.ownerId}`
    }).catch(err => console.error('[createSale] PROXY_CREATE audit failed (non-critical):', err.message));
  }

  res.status(201).json({ success: true, data: sale });
});

const updateSale = catchAsync(async (req, res) => {
  // Phase G4.5a — proxy can edit any BDM's DRAFT row within the entity when
  // sales.proxy_entry (or opening_ar_proxy) is ticked. Non-proxy callers stay
  // scoped to their own bdm_id via the base tenantFilter.
  const scope = await widenFilterForProxy(req, 'sales', { subKey: 'proxy_entry' });
  const sale = await SalesLine.findOne({
    _id: req.params.id,
    ...scope
  });

  if (!sale) {
    return res.status(404).json({ success: false, message: 'Sale not found' });
  }
  if (sale.status !== 'DRAFT') {
    return res.status(400).json({ success: false, message: 'Only DRAFT sales can be edited' });
  }

  // Phase G4.5a — ownership is locked on edit. Strip assigned_to / bdm_id /
  // recorded_on_behalf_of from the body so a proxy can't silently reassign a
  // row to a different owner via update. Reassignment requires delete + recreate.
  const { assigned_to: _discardAssigned, bdm_id: _discardBdm, recorded_on_behalf_of: _discardProxy, ...editableBody } = req.body || {};

  // Track changes for audit
  const changes = [];
  for (const [key, val] of Object.entries(editableBody)) {
    if (['_id', 'entity_id', 'bdm_id', 'created_at', 'created_by', 'status'].includes(key)) continue;
    if (JSON.stringify(sale[key]) !== JSON.stringify(val)) {
      changes.push({ field: key, old: sale[key], new: val });
    }
  }

  const isProxyEdit = String(sale.bdm_id) !== String(req.user._id);

  Object.assign(sale, editableBody);
  sale.status = 'DRAFT'; // Reset to DRAFT on edit
  sale.validation_errors = [];

  // Re-route source when csi_date changes (same logic as createSale)
  if (req.user.live_date && sale.csi_date) {
    sale.source = new Date(sale.csi_date) < new Date(req.user.live_date)
      ? 'OPENING_AR' : 'SALES_LINE';
  }

  await sale.save();

  // Audit log — bdm_id tracks the owner (not the editor) so owner-scoped audit
  // filtering still works; log_type flips to PROXY_UPDATE when the editor
  // (req.user) is not the owner (Phase G4.5a).
  for (const change of changes) {
    await ErpAuditLog.logChange({
      entity_id: req.entityId,
      bdm_id: sale.bdm_id,
      log_type: isProxyEdit ? 'PROXY_UPDATE' : 'SALES_EDIT',
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
  // Phase G4.5a — proxy can delete another BDM's DRAFT within the entity.
  const scope = await widenFilterForProxy(req, 'sales', { subKey: 'proxy_entry' });
  const sale = await SalesLine.findOne({
    _id: req.params.id,
    ...scope
  });

  if (!sale) {
    return res.status(404).json({ success: false, message: 'Sale not found' });
  }
  if (sale.status !== 'DRAFT') {
    return res.status(400).json({ success: false, message: 'Only DRAFT rows can be deleted' });
  }

  await SalesLine.findByIdAndDelete(sale._id);

  await ErpAuditLog.logChange({
    entity_id: sale.entity_id,
    bdm_id: sale.bdm_id,
    log_type: 'DELETION',
    target_ref: sale._id.toString(),
    target_model: 'SalesLine',
    changed_by: req.user._id,
    note: `Draft deleted: ${sale.doc_ref || sale._id}`
  });

  res.json({ success: true, message: 'Draft row deleted' });
});

const getSales = catchAsync(async (req, res) => {
  // Phase G4.5a — widen filter to all BDMs in entity when caller is an eligible
  // proxy. Non-proxy callers stay scoped to their own bdm_id via tenantFilter.
  const filter = await widenFilterForProxy(req, 'sales', { subKey: 'proxy_entry' });

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

  // Phase 6 — hide reversed rows by default; opt-in via ?include_reversed=true.
  // Reversed rows stay POSTED for audit, but pollute working lists if shown.
  if (req.query.include_reversed !== 'true') {
    filter.deletion_event_id = { $exists: false };
  }

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;
  const skip = (page - 1) * limit;

  const [sales, total] = await Promise.all([
    SalesLine.find(filter)
      .populate('hospital_id', 'hospital_name')
      .populate('customer_id', 'customer_name customer_type')
      .populate('bdm_id', 'name')
      .populate('recorded_on_behalf_of', 'name')
      .populate('created_by', 'name')
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
  // Phase G4.5a — widen for proxy reads.
  const scope = await widenFilterForProxy(req, 'sales', { subKey: 'proxy_entry' });
  const sale = await SalesLine.findOne({
    _id: req.params.id,
    ...scope
  })
    .populate('hospital_id', 'hospital_name')
    .populate('customer_id', 'customer_name customer_type')
    .populate('bdm_id', 'name')
    .populate('recorded_on_behalf_of', 'name')
    .populate('created_by', 'name')
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
  const editable = await getEditableStatuses(req.entityId, 'SALES');
  // Phase G4.5a — proxy can validate rows owned by other BDMs in the entity.
  const scope = await widenFilterForProxy(req, 'sales', { subKey: 'proxy_entry' });
  const filter = {
    ...scope,
    status: { $in: editable }
  };

  // Optionally validate specific rows
  if (req.body.sale_ids && req.body.sale_ids.length) {
    filter._id = { $in: req.body.sale_ids };
  }

  const rows = await SalesLine.find(filter);
  if (!rows.length) {
    return res.json({ success: true, valid_count: 0, error_count: 0, errors: [] });
  }

  // Per-entity lookup-driven flags — fetched once, applied per-row below.
  //
  // REQUIRE_CSI_PHOTO_OPENING_AR (default 1): gate Validate for OPENING_AR
  // rows only. Historical entries should already have the signed CSI in
  // hand at entry time, so we block VALID until one of csi_photo_url OR
  // csi_received_photo_url is populated ("any proof OK"). Subscribers flip
  // to 0 via Control Center if they're backfilling without scans.
  //
  // Live Sales (source=SALES_LINE) deliberately has NO photo gate at
  // Validate or Submit — the signed CSI is a post-delivery artifact and is
  // attached later via PUT /sales/:id/received-csi on SalesList.
  const requireCsiPhotoOpeningAr = (await getSalesSetting(req.entityId, 'REQUIRE_CSI_PHOTO_OPENING_AR', 1)) ? true : false;

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
    const rowWarnings = []; // monitoring-only; never blocks posting

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

      // CSI photo proof — gated by source (see flag comment above).
      // OPENING_AR: any proof OK (entry-time scan OR received signed copy).
      // SALES_LINE: no Validate gate — received photo is a post-posting
      // artifact attached via PUT /sales/:id/received-csi on SalesList.
      if (row.source === 'OPENING_AR' && requireCsiPhotoOpeningAr) {
        const hasAnyProof = !!(row.csi_photo_url || row.csi_received_photo_url);
        if (!hasAnyProof) {
          rowErrors.push('CSI photo is required for Opening AR — attach any scan of the signed historical CSI before validating.');
        }
      }

      // Phase 15.2 (softened) — CSI booklet traceability check.
      // Monitoring only: never blocks posting. A warning is pushed if the
      // CSI # is not in any allocated range, is already used, or was voided.
      // Skipped entirely for BDMs without allocations (Iloilo-based contractors
      // who use booklets directly).
      if (row.doc_ref) {
        try {
          const csiCheck = await validateCsiNumber(row.entity_id, row.bdm_id, row.doc_ref);
          if (!csiCheck.valid && !csiCheck.skipped) {
            rowWarnings.push(`CSI: ${csiCheck.reason}`);
          }
        } catch (csiErr) {
          // Defensive — monitoring call must never block validation
          console.error('CSI booklet check failed (non-blocking):', csiErr.message);
        }
      }
    } else if (saleType === 'CASH_RECEIPT') {
      if (!row.line_items || row.line_items.length === 0) rowErrors.push('At least one line item is required');
    } else if (saleType === 'SERVICE_INVOICE') {
      if (!row.service_description) rowErrors.push('Service description is required');
      if (!row.invoice_total || row.invoice_total <= 0) rowErrors.push('Invoice total must be greater than 0');
    }

    // Petty cash fund validation (CASH_RECEIPT / SERVICE_INVOICE with CASH payment only)
    if (row.petty_cash_fund_id) {
      if (row.payment_mode !== 'CASH') {
        rowErrors.push('Petty cash fund routing is only allowed for CASH payment mode');
      } else if (saleType === 'CSI') {
        rowErrors.push('CSI sales cannot route to petty cash — use Collections');
      } else {
        const pcFund = await PettyCashFund.findById(row.petty_cash_fund_id).lean();
        if (!pcFund) {
          rowErrors.push('Petty cash fund not found');
        } else {
          if (pcFund.entity_id?.toString() !== row.entity_id?.toString()) {
            rowErrors.push('Petty cash fund belongs to a different entity');
          }
          if (pcFund.status !== 'ACTIVE') {
            rowErrors.push(`Petty cash fund is ${pcFund.status} — deposits blocked`);
          }
          if ((pcFund.fund_mode || 'REVOLVING') === 'EXPENSE_ONLY') {
            rowErrors.push('Petty cash fund is EXPENSE_ONLY — deposits not allowed');
          }
        }
      }
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

    // Duplicate check: same doc_ref within the same customer scope, sale_type,
    // and SALE_SOURCE bucket. When no hospital/customer is set, skip — the row
    // already fails with "Hospital or Customer is required" from line 504, so
    // emitting an extra (global-scope) duplicate error is noise.
    //
    // source is a SALE_SOURCE Lookup-driven field (CLAUDE-ERP.md Rule #24).
    // We read it off the row itself (schema default='SALES_LINE') so the rule
    // is not hardcoded to literal enum values — subscribers who rename lookup
    // entries keep coherent behavior as long as writes and reads stay
    // consistent, which they do because source is stamped at create/update.
    if (saleType !== 'SERVICE_INVOICE' && row.doc_ref && (row.hospital_id || row.customer_id)) {
      const dupFilter = {
        _id: { $ne: row._id },
        entity_id: row.entity_id,
        sale_type: saleType,
        source: row.source,
        doc_ref: row.doc_ref,
        status: { $nin: ['DELETION_REQUESTED'] },
        // Reversed sales keep status=POSTED for audit but carry
        // deletion_event_id. Exclude them — the CSI#/doc_ref is free for
        // re-use and the row is hidden from the Reversal Console's reversible
        // tab, so re-uploading the same CSI after a reversal must not be
        // blocked by a ghost row the user cannot reach.
        deletion_event_id: { $exists: false }
      };
      if (row.hospital_id) dupFilter.hospital_id = row.hospital_id;
      if (row.customer_id) dupFilter.customer_id = row.customer_id;

      const dupCheck = await SalesLine.findOne(dupFilter).select('status source').lean();
      if (dupCheck) {
        const scopeLabel = row.hospital_id ? 'this hospital' : 'this customer';
        const bucketLabel = row.source === 'OPENING_AR' ? 'Opening AR' : 'Sales';
        rowErrors.push(
          `Duplicate ${bucketLabel} doc #${row.doc_ref} already exists for ${scopeLabel} (status: ${dupCheck.status}). Edit the existing row instead of creating a new one.`
        );
      }
    }

    // Stock check per line item (skip for SERVICE_INVOICE and OPENING_AR — no inventory)
    if (saleType === 'SERVICE_INVOICE' || row.source === 'OPENING_AR') {
      // SERVICE_INVOICE: no stock check needed, skip line item validation
      // OPENING_AR: pre-live-date CSI — skip allocation check per PRD
      // Still validate basic line item fields for OPENING_AR
      if (row.source === 'OPENING_AR' && saleType !== 'SERVICE_INVOICE') {
        for (const item of row.line_items) {
          if (!item.product_id) rowErrors.push('Product is required for each line item');
          if (!item.qty || item.qty <= 0) rowErrors.push(`Quantity must be greater than 0 for ${item.item_key || 'product'}`);
          if (!item.unit_price || item.unit_price <= 0) rowErrors.push(`Unit price must be greater than 0 for ${item.item_key || 'product'}`);
          if (item.fifo_override && !item.override_reason) rowErrors.push(`FIFO override reason is required for ${item.item_key || 'product'}. Choose: Hospital Policy, QA Replacement, Damaged Batch, or Batch Recall.`);
        }
      }
    } else for (const item of row.line_items) {
      if (!item.product_id) {
        rowErrors.push('Product is required for each line item');
        continue;
      }
      if (!item.qty || item.qty <= 0) {
        rowErrors.push(`Quantity must be greater than 0 for ${item.item_key || 'product'}`);
        continue;
      }
      if (!item.unit_price || item.unit_price <= 0) {
        rowErrors.push(`Unit price must be greater than 0 for ${item.item_key || 'product'}`);
      }

      // FIFO override requires a reason from the allowed list
      if (item.fifo_override && !item.override_reason) {
        rowErrors.push(`FIFO override reason is required for ${item.item_key || 'product'}. Choose: Hospital Policy, QA Replacement, Damaged Batch, or Batch Recall.`);
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
    row.validation_warnings = rowWarnings;
    if (rowErrors.length > 0) {
      row.status = 'ERROR';
      row.validation_errors = rowErrors;
      errorCount++;
      errors.push({
        sale_id: row._id,
        doc_ref: row.doc_ref,
        messages: rowErrors,
        warnings: rowWarnings
      });
    } else {
      row.status = 'VALID';
      row.validation_errors = [];
      validCount++;
      if (rowWarnings.length > 0) {
        errors.push({
          sale_id: row._id,
          doc_ref: row.doc_ref,
          messages: [],
          warnings: rowWarnings
        });
      }
    }

    await row.save();
  }

  res.json({ success: true, valid_count: validCount, error_count: errorCount, errors });
});

// ═══════════════════════════════════════════════════════════
// SUBMIT — POST ALL VALID ROWS (with MongoDB transaction)
// ═══════════════════════════════════════════════════════════

const submitSales = catchAsync(async (req, res) => {
  const { sale_ids } = req.body;
  // Phase G4.5a — proxy can submit rows on behalf of other BDMs in the entity.
  const scope = await widenFilterForProxy(req, 'sales', { subKey: 'proxy_entry' });
  const filter = { ...scope, status: 'VALID' };
  if (sale_ids && sale_ids.length) {
    filter._id = { $in: sale_ids.map(id => new mongoose.Types.ObjectId(id)) };
  }
  const validRows = await SalesLine.find(filter);

  if (!validRows.length) {
    return res.status(400).json({
      success: false,
      message: 'No VALID rows to submit. Run validation first.'
    });
  }

  // Authority matrix gate — split batch by source so Opening AR (pre-cutover
  // historical AR, higher fraud risk) gates on its own MODULE_DEFAULT_ROLES
  // entry instead of inheriting the regular SALES roles.
  const { gateApproval } = require('../services/approvalService');
  const groups = [];
  const salesRows = validRows.filter(r => r.source !== 'OPENING_AR');
  const openingArRows = validRows.filter(r => r.source === 'OPENING_AR');
  if (salesRows.length) groups.push({ module: 'SALES', label: 'sales', rows: salesRows });
  if (openingArRows.length) groups.push({ module: 'OPENING_AR', label: 'Opening AR', rows: openingArRows });

  for (const group of groups) {
    const groupTotal = group.rows.reduce((sum, r) => sum + (r.invoice_total || 0), 0);
    // Phase G4.5a — if ANY row in the group was proxied (recorded_on_behalf_of
    // is set), force the whole group through Approval Hub regardless of the
    // submitter's role. Conservative: never auto-post a batch that contains a
    // proxied row until Phase G4.5b ships owner-chain approval routing.
    const proxiedRow = group.rows.find(r => r.recorded_on_behalf_of);
    const hasProxy = !!proxiedRow;
    const gated = await gateApproval({
      entityId: req.entityId,
      module: group.module,
      docType: group.rows[0]?.sale_type || 'CSI',
      docId: group.rows[0]._id,
      docRef: group.rows.map(r => r.doc_ref || r.invoice_number).filter(Boolean).join(', '),
      amount: groupTotal,
      description: hasProxy
        ? `Submit ${group.rows.length} ${group.label} entr${group.rows.length === 1 ? 'y' : 'ies'} (total ₱${groupTotal.toLocaleString()}) — proxy entry, owner approval required`
        : `Submit ${group.rows.length} ${group.label} entr${group.rows.length === 1 ? 'y' : 'ies'} (total ₱${groupTotal.toLocaleString()})`,
      requesterId: req.user._id,
      requesterName: req.user.name || req.user.email,
      forceApproval: hasProxy,
      ownerBdmId: proxiedRow?.bdm_id,
    }, res);
    if (gated) return;
  }

  // Period lock check — prevent posting to closed/locked months
  // OPENING_AR rows bypass the lock (pre-cutover dates fall in closed periods by design)
  const { checkPeriodOpen, dateToPeriod } = require('../utils/periodLock');
  for (const row of validRows) {
    const period = dateToPeriod(row.csi_date);
    await checkPeriodOpen(row.entity_id, period, { source: row.source });
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
        // OPENING_AR: pre-live-date CSI — skip inventory deduction entirely (no FIFO, no consignment)
        if (row.source === 'OPENING_AR') {
          row.status = 'POSTED';
          row.posted_at = new Date();
          row.posted_by = req.user._id;
          row.event_id = event._id;
          await row.save({ session });
          continue;
        }

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
            const fifoOpts = { ...(row.warehouse_id && { warehouseId: row.warehouse_id.toString() }), session };
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

    // Phase 15.2 (softened) — auto-mark CSI numbers as used on POSTED.
    // Non-blocking: a CSI booklet update failure must never fail the post.
    for (const row of validRows) {
      if ((row.sale_type || 'CSI') !== 'CSI') continue;
      if (!row.doc_ref) continue;
      try {
        const result = await markCsiUsed(row.entity_id, null, row.doc_ref);
        if (!result.ok) {
          // Advisory only — stash for audit, do not fail the post
          ErpAuditLog.logChange({
            entity_id: row.entity_id, bdm_id: row.bdm_id,
            log_type: 'CSI_TRACE',
            target_ref: row.doc_ref, target_model: 'CsiBooklet',
            field_changed: 'used_numbers',
            new_value: `mark-used skipped: ${result.reason}`,
            changed_by: req.user._id,
            note: `CSI ${row.doc_ref} posted on sale ${row._id} but booklet mark-used skipped`
          }).catch(() => {});
        }
      } catch (csiErr) {
        console.error('CSI markUsed failed (non-blocking):', row.doc_ref, csiErr.message);
      }
    }

    // Phase 11: Auto-journal entries (non-blocking — outside transaction)
    for (const row of validRows) {
      try {
        const saleType = row.sale_type || 'CSI';
        // Revenue JE
        const jeData = saleType === 'SERVICE_INVOICE'
          ? await journalFromServiceRevenue(row, row.entity_id, req.user._id)
          : await journalFromSale(row, row.entity_id, req.user._id);
        jeData.source_event_id = row.event_id;
        await createAndPostJournal(row.entity_id, jeData);

        // COGS JE (skip for SERVICE_INVOICE and OPENING_AR — no inventory consumed)
        if (saleType !== 'SERVICE_INVOICE' && row.source !== 'OPENING_AR' && row.line_items?.length) {
          const productIds = row.line_items.map(li => li.product_id);
          const products = await ProductMaster.find({ _id: { $in: productIds } }).select('purchase_price').lean();
          const costMap = new Map(products.map(p => [p._id.toString(), p.purchase_price || 0]));
          const totalCogs = row.line_items.reduce((sum, li) => sum + (li.qty || 0) * (costMap.get(li.product_id?.toString()) || 0), 0);
          const cogsData = await journalFromCOGS(row, Math.round(totalCogs * 100) / 100, req.user._id);
          if (cogsData) {
            cogsData.source_event_id = row.event_id;
            await createAndPostJournal(row.entity_id, cogsData);
          }
        }
      } catch (jeErr) {
        console.error('Auto-journal failed for sale:', row.doc_ref || row._id, jeErr.message);
        ErpAuditLog.logChange({
          entity_id: row.entity_id, log_type: 'LEDGER_ERROR',
          target_ref: row.doc_ref || row._id?.toString(), target_model: 'JournalEntry',
          field_changed: 'auto_journal', new_value: jeErr.message,
          changed_by: req.user._id,
          note: `Auto-journal failed for sale ${row.doc_ref || row._id}`
        }).catch(() => {});
      }
    }

    res.json({
      success: true,
      message: `${validRows.length} sales posted successfully`,
      posted_count: validRows.length,
      event_ids: eventIds
    });

    // Non-blocking: notify management of posted sales
    notifyDocumentPosted({
      entityId: req.entityId,
      module: 'Sales',
      docType: 'CSI',
      docRef: validRows.map(r => r.doc_ref).filter(Boolean).join(', '),
      postedBy: req.user.name || req.user.email,
      amount: validRows.reduce((sum, r) => sum + (r.invoice_total || 0), 0),
      period: validRows[0]?.csi_date ? new Date(validRows[0].csi_date).toISOString().slice(0, 7) : undefined,
    }).catch(err => console.error('Sales post notification failed:', err.message));
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

  // Phase G4.5a — widen filter so proxies can reopen on behalf of other BDMs.
  // Reopen action itself is still gated by the sales.reopen sub-perm middleware.
  const scope = await widenFilterForProxy(req, 'sales', { subKey: 'proxy_entry' });
  const rows = await SalesLine.find({
    _id: { $in: sale_ids },
    ...scope,
    status: 'POSTED'
  });

  if (!rows.length) {
    return res.status(400).json({ success: false, message: 'No POSTED rows found to reopen' });
  }

  const reopened = [];
  const failed = [];

  for (const row of rows) {
    // Step 0: Block reopen if CSI is settled by a POSTED collection.
    // Entity-scoped to prevent cross-entity leaks. Reopen the collection first
    // to release the CSI, then the CSI becomes reopenable.
    const settledBy = await Collection.findOne({
      entity_id: row.entity_id,
      status: 'POSTED',
      deletion_event_id: { $exists: false },
      'settled_csis.sales_line_id': row._id
    }).select('_id cr_no').lean();
    if (settledBy) {
      failed.push({
        _id: row._id,
        doc_ref: row.doc_ref,
        error: `Cannot reopen: settled by Collection ${settledBy.cr_no || settledBy._id}. Reopen the collection first to release this CSI.`
      });
      continue;
    }

    // Step 1: Reverse JEs FIRST — if fails, skip this row (keep POSTED, ledger stays balanced)
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
        failed.push({ _id: row._id, doc_ref: row.doc_ref, error: `Journal reversal failed: ${jeErr.message}` });
        continue; // Do NOT mark as DRAFT — ledger would be unbalanced
      }
    }

    // Step 2: JE reversed successfully — now do inventory/status reversal in a transaction
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        // Create reversal InventoryLedger entries
        const originalEntries = await InventoryLedger.find({ event_id: row.event_id }).session(session);
        for (const entry of originalEntries) {
          await InventoryLedger.create([{
            entity_id: entry.entity_id,
            bdm_id: entry.bdm_id,
            warehouse_id: entry.warehouse_id || undefined,
            product_id: entry.product_id,
            batch_lot_no: entry.batch_lot_no,
            expiry_date: entry.expiry_date,
            transaction_type: 'ADJUSTMENT',
            qty_in: entry.qty_out,
            qty_out: entry.qty_in,
            event_id: row.event_id,
            recorded_by: req.user._id
          }], { session });
        }

        // Reverse ConsignmentTracker if applicable
        for (const item of row.line_items) {
          const consignment = await ConsignmentTracker.findOne({
            entity_id: row.entity_id,
            hospital_id: row.hospital_id,
            product_id: item.product_id,
            'conversions.sales_line_id': row._id
          }).session(session);
          if (consignment) {
            consignment.conversions = consignment.conversions.filter(
              c => !c.sales_line_id || c.sales_line_id.toString() !== row._id.toString()
            );
            consignment.qty_consumed = Math.max(0, consignment.qty_consumed - item.qty);
            await consignment.save({ session });
          }
        }

        // Reverse petty cash deposit if sale was routed to a fund
        if (row.petty_cash_fund_id) {
          const pcTxn = await PettyCashTransaction.findOne({
            linked_sales_line_id: row._id,
            txn_type: 'DEPOSIT',
            status: 'POSTED'
          }).session(session);
          if (pcTxn) {
            pcTxn.status = 'VOIDED';
            pcTxn.voided_at = new Date();
            pcTxn.voided_by = req.user._id;
            pcTxn.void_reason = `Auto-reversed: ${row.sale_type} ${row.invoice_number || row.doc_ref || ''} reopened`;
            await pcTxn.save({ session });
            const fundResult = await PettyCashFund.findByIdAndUpdate(pcTxn.fund_id, {
              $inc: { current_balance: -pcTxn.amount }
            }, { session });
            if (!fundResult) {
              await ErpAuditLog.logChange({
                entity_id: row.entity_id, log_type: 'LEDGER_ERROR',
                target_ref: pcTxn.fund_id?.toString(), target_model: 'PettyCashFund',
                field_changed: 'current_balance', old_value: pcTxn.amount.toString(),
                new_value: 'FUND_NOT_FOUND', changed_by: req.user._id,
                note: `Fund deleted before reopen — balance decrement skipped for ${row.invoice_number || row.doc_ref}`
              });
            }
          }
        }

        // Update SalesLine
        row.status = 'DRAFT';
        row.reopen_count += 1;
        row.posted_at = undefined;
        row.posted_by = undefined;
        row.event_id = undefined;
        row.validation_errors = [];
        await row.save({ session });
      });

      reopened.push(row._id);

      // Phase 15.2 (softened) — release the CSI number back to the BDM's
      // available pool when the sale is reopened. Non-blocking audit on failure.
      if ((row.sale_type || 'CSI') === 'CSI' && row.doc_ref) {
        try {
          await unmarkCsiUsed(row.entity_id, row.doc_ref);
        } catch (csiErr) {
          console.error('CSI unmarkUsed failed on reopen (non-blocking):', row.doc_ref, csiErr.message);
        }
      }

      await ErpAuditLog.logChange({
        entity_id: row.entity_id, bdm_id: row.bdm_id,
        log_type: 'REOPEN', target_ref: row._id.toString(),
        target_model: 'SalesLine', changed_by: req.user._id,
        note: `Reopened CSI ${row.doc_ref || ''}`
      });
    } catch (txErr) {
      console.error('Reopen transaction failed for sale:', row._id, txErr.message);
      failed.push({ _id: row._id, doc_ref: row.doc_ref, error: `Transaction failed: ${txErr.message}` });
    } finally {
      session.endSession();
    }
  }

  if (failed.length && !reopened.length) {
    return res.status(500).json({ success: false, message: 'All sale reopens failed', failed });
  }
  res.json({ success: true, message: `Reopened ${reopened.length} sale(s)${failed.length ? `, ${failed.length} failed` : ''}`, reopened, failed });

  // Non-blocking: notify management of reopened sales
  if (reopened.length) {
    const reopenedRefs = rows.filter(r => reopened.includes(r._id)).map(r => r.doc_ref).filter(Boolean).join(', ');
    notifyDocumentReopened({
      entityId: req.entityId,
      module: 'Sales',
      docType: 'CSI',
      docRef: reopenedRefs,
      reopenedBy: req.user.name || req.user.email,
      reason: req.body.reason,
    }).catch(err => console.error('Sales reopen notification failed:', err.message));
  }
});

// ═══════════════════════════════════════════════════════════
// DELETION — BDM request + Finance/Admin approve (SAP Storno)
// ═══════════════════════════════════════════════════════════

const requestDeletion = catchAsync(async (req, res) => {
  // Phase G4.5a — proxy can request deletion for rows owned by other BDMs.
  const scope = await widenFilterForProxy(req, 'sales', { subKey: 'proxy_entry' });
  const sale = await SalesLine.findOne({
    _id: req.params.id,
    ...scope,
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
  // Phase G4.5a — proxy sees deletion-requested rows across BDMs; gate is the
  // accounting.approve_deletion sub-perm at route middleware, not here.
  const scope = await widenFilterForProxy(req, 'sales', { subKey: 'proxy_entry' });
  const sale = await SalesLine.findOne({
    _id: req.params.id,
    ...scope,
    status: 'DELETION_REQUESTED'
  });

  if (!sale) {
    return res.status(404).json({ success: false, message: 'Deletion-requested sale not found' });
  }

  // Block deletion if CSI is settled by a POSTED collection — keeps AR balanced.
  // Entity-scoped. Collection must be reopened first to release the CSI.
  const settledBy = await Collection.findOne({
    entity_id: sale.entity_id,
    status: 'POSTED',
    deletion_event_id: { $exists: false },
    'settled_csis.sales_line_id': sale._id
  }).select('_id cr_no').lean();
  if (settledBy) {
    return res.status(409).json({
      success: false,
      message: `Cannot delete: CSI is settled by Collection ${settledBy.cr_no || settledBy._id}. Reopen the collection first to release this CSI.`
    });
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

// ═══════════════════════════════════════════════════════════
// PRESIDENT REVERSE — sub-permission gated, applies to any status
// (DRAFT/ERROR → hard delete, POSTED/DELETION_REQUESTED → SAP Storno)
// ═══════════════════════════════════════════════════════════

const presidentReverseSale = catchAsync(async (req, res) => {
  const { reason, confirm } = req.body || {};
  if (confirm !== 'DELETE') {
    return res.status(400).json({ success: false, message: 'Type DELETE in the confirmation field to proceed' });
  }
  if (!reason || !reason.trim()) {
    return res.status(400).json({ success: false, message: 'Reason is required' });
  }

  try {
    // Phase G4.5a — proxy reverse still gated by accounting.reverse_posted danger perm.
    const scope = await widenFilterForProxy(req, 'sales', { subKey: 'proxy_entry' });
    const result = await presidentReverse({
      doc_type: 'SALES_LINE',
      doc_id: req.params.id,
      reason,
      user: req.user,
      tenantFilter: scope,
    });
    res.json({
      success: true,
      message: result.mode === 'HARD_DELETE'
        ? `Deleted ${result.doc_ref || result.doc_id} (no posting side effects)`
        : `Reversed ${result.doc_ref || result.doc_id} (SAP Storno) — original retained for audit`,
      data: result,
    });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }
});

// ═══════════════════════════════════════════════════════════
// ATTACH RECEIVED CSI — post-delivery dunning proof (t=4)
// ═══════════════════════════════════════════════════════════
// Writes csi_received_photo_url + csi_received_attachment_id + csi_received_at
// ONLY. Allowed on DRAFT / VALID / POSTED. Blocked on DELETION_REQUESTED and
// on rows already marked with a deletion_event_id (reversed). Period-lock
// applies so we don't retroactively attach proof to a closed period.
//
// No status transition — the row stays where it was. BDM captures the signed
// pink/yellow/duplicate copy of the CSI after the hospital acknowledges
// delivery; this writes that artifact to the ledger-of-record without
// touching posted inventory/AR side effects.
const attachReceivedCsi = catchAsync(async (req, res) => {
  const { csi_received_photo_url, csi_received_attachment_id } = req.body || {};
  if (!csi_received_photo_url) {
    return res.status(400).json({
      success: false,
      message: 'csi_received_photo_url is required'
    });
  }

  const sale = await SalesLine.findOne({
    _id: req.params.id,
    ...req.tenantFilter
  });
  if (!sale) {
    return res.status(404).json({ success: false, message: 'Sale not found' });
  }

  // Status gate — signed-CSI upload is meaningful only while the row is
  // part of the active ledger. Reversed rows (deletion_event_id) and
  // DELETION_REQUESTED rows are out of scope. ERROR is included so BDMs
  // can pre-stage the signed photo while fixing unrelated validation
  // issues (credit limit, duplicate doc_ref, etc.) — delivery already
  // happened, don't block proof capture on a transient error state.
  if (sale.deletion_event_id) {
    return res.status(400).json({ success: false, message: 'Sale has been reversed — cannot attach received CSI' });
  }
  const attachableStatuses = ['DRAFT', 'VALID', 'ERROR', 'POSTED'];
  if (!attachableStatuses.includes(sale.status)) {
    return res.status(400).json({
      success: false,
      message: `Cannot attach received CSI on a ${sale.status} row`
    });
  }

  // Period-lock — don't let a user retroactively stamp evidence on a
  // closed period. OPENING_AR bypasses by convention (same as submit).
  try {
    const { checkPeriodOpen, dateToPeriod } = require('../utils/periodLock');
    await checkPeriodOpen(sale.entity_id, dateToPeriod(sale.csi_date), { source: sale.source });
  } catch (err) {
    return res.status(err.statusCode || 400).json({ success: false, message: err.message });
  }

  const previousUrl = sale.csi_received_photo_url || null;
  sale.csi_received_photo_url = csi_received_photo_url;
  sale.csi_received_attachment_id = csi_received_attachment_id || undefined;
  sale.csi_received_at = new Date();
  await sale.save();

  await ErpAuditLog.logChange({
    entity_id: sale.entity_id,
    bdm_id: sale.bdm_id,
    log_type: 'SALES_EDIT',
    target_ref: sale._id.toString(),
    target_model: 'SalesLine',
    field_changed: 'csi_received_photo_url',
    old_value: previousUrl,
    new_value: csi_received_photo_url,
    changed_by: req.user._id,
    note: previousUrl ? 'Received CSI photo replaced' : 'Received CSI photo attached (dunning proof)'
  });

  res.json({ success: true, data: sale });
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
  approveDeletion,
  presidentReverseSale,
  attachReceivedCsi,
  postSaleRow, // shared helper for approval handler
};
