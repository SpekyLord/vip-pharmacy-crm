/**
 * Credit Note Controller — Return/Credit Note Workflow
 *
 * DRAFT → VALIDATE → POSTED lifecycle.
 * On post: creates RETURN_IN inventory entries + reversal journal.
 */
const mongoose = require('mongoose');
const CreditNote = require('../models/CreditNote');
const SalesLine = require('../models/SalesLine');
const InventoryLedger = require('../models/InventoryLedger');
const TransactionEvent = require('../models/TransactionEvent');
const ProductMaster = require('../models/ProductMaster');
const { catchAsync } = require('../../middleware/errorHandler');
const { buildStockSnapshot } = require('../services/fifoEngine');
const { createAndPostJournal } = require('../services/journalEngine');
const { getCoaMap } = require('../services/autoJournal');

// ═══════════════════════════════════════════════════════════
// CRUD
// ═══════════════════════════════════════════════════════════

const createCreditNote = catchAsync(async (req, res) => {
  // Validate line items
  for (const item of (req.body.line_items || [])) {
    if (!item.qty || item.qty <= 0) {
      return res.status(400).json({ success: false, message: `Quantity must be > 0 for ${item.item_key || 'product'}` });
    }
    if (!item.return_reason) {
      return res.status(400).json({ success: false, message: `Return reason is required for ${item.item_key || 'product'}` });
    }
  }

  const { generateDocNumber } = require('../services/docNumbering');
  const cn_number = await generateDocNumber({
    prefix: 'CN',
    bdmId: req.bdmId,
    date: req.body.cn_date || new Date()
  });

  const cn = await CreditNote.create({
    ...req.body,
    cn_number,
    entity_id: req.entityId,
    bdm_id: req.bdmId,
    created_by: req.user._id,
    status: 'DRAFT'
  });

  res.status(201).json({ success: true, data: cn });
});

const updateCreditNote = catchAsync(async (req, res) => {
  const cn = await CreditNote.findOne({ _id: req.params.id, ...req.tenantFilter });
  if (!cn) return res.status(404).json({ success: false, message: 'Credit note not found' });
  if (cn.status !== 'DRAFT') return res.status(400).json({ success: false, message: 'Only DRAFT credit notes can be edited' });

  Object.assign(cn, req.body);
  cn.status = 'DRAFT';
  cn.validation_errors = [];
  await cn.save();

  res.json({ success: true, data: cn });
});

const deleteCreditNote = catchAsync(async (req, res) => {
  const result = await CreditNote.findOneAndDelete({ _id: req.params.id, ...req.tenantFilter, status: 'DRAFT' });
  if (!result) return res.status(404).json({ success: false, message: 'Draft credit note not found' });
  res.json({ success: true, message: 'Draft credit note deleted' });
});

const getCreditNotes = catchAsync(async (req, res) => {
  const filter = { ...req.tenantFilter };
  if (req.query.status) filter.status = req.query.status;
  if (req.query.hospital_id) filter.hospital_id = req.query.hospital_id;
  if (req.query.customer_id) filter.customer_id = req.query.customer_id;

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;
  const skip = (page - 1) * limit;

  const [docs, total] = await Promise.all([
    CreditNote.find(filter)
      .populate('hospital_id', 'hospital_name')
      .populate('customer_id', 'customer_name customer_type')
      .populate('bdm_id', 'name')
      .sort({ cn_date: -1 })
      .skip(skip).limit(limit).lean(),
    CreditNote.countDocuments(filter)
  ]);

  res.json({ success: true, data: docs, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
});

const getCreditNoteById = catchAsync(async (req, res) => {
  const cn = await CreditNote.findOne({ _id: req.params.id, ...req.tenantFilter })
    .populate('hospital_id', 'hospital_name')
    .populate('customer_id', 'customer_name customer_type')
    .populate('original_sale_id', 'doc_ref invoice_number csi_date')
    .populate('bdm_id', 'name')
    .lean();

  if (!cn) return res.status(404).json({ success: false, message: 'Credit note not found' });
  res.json({ success: true, data: cn });
});

// ═══════════════════════════════════════════════════════════
// VALIDATE
// ═══════════════════════════════════════════════════════════

const validateCreditNotes = catchAsync(async (req, res) => {
  const filter = { ...req.tenantFilter, status: { $in: ['DRAFT', 'ERROR'] } };
  if (req.body.cn_ids?.length) {
    filter._id = { $in: req.body.cn_ids.map(id => new mongoose.Types.ObjectId(id)) };
  }

  const rows = await CreditNote.find(filter);
  if (!rows.length) return res.json({ success: true, valid_count: 0, error_count: 0, errors: [] });

  const errors = [];
  let validCount = 0;
  let errorCount = 0;

  for (const row of rows) {
    const rowErrors = [];

    if (!row.hospital_id && !row.customer_id) rowErrors.push('Hospital or Customer is required');
    if (!row.cn_date) rowErrors.push('Credit note date is required');
    if (row.cn_date && row.cn_date > new Date()) rowErrors.push('Credit note date cannot be in the future');
    if (!row.line_items?.length) rowErrors.push('At least one return line item is required');

    for (let i = 0; i < (row.line_items || []).length; i++) {
      const item = row.line_items[i];
      if (!item.product_id) rowErrors.push(`Line ${i + 1}: product is required`);
      if (!item.qty || item.qty <= 0) rowErrors.push(`Line ${i + 1}: quantity must be > 0`);
      if (!item.batch_lot_no) rowErrors.push(`Line ${i + 1}: batch/lot number is required for returns`);
      if (!item.return_reason) rowErrors.push(`Line ${i + 1}: return reason is required`);
    }

    // Verify original sale exists if referenced
    if (row.original_sale_id) {
      const sale = await SalesLine.findById(row.original_sale_id).select('status doc_ref').lean();
      if (!sale) rowErrors.push('Original sale reference not found');
      else if (sale.status !== 'POSTED') rowErrors.push(`Original sale ${sale.doc_ref || ''} is not POSTED`);
    }

    // Photo proof recommended
    if (!row.photo_urls?.length) {
      rowErrors.push('WARNING: No photo proof of returned goods — recommended for audit');
    }

    row.validation_errors = rowErrors;
    row.status = rowErrors.filter(e => !e.startsWith('WARNING')).length > 0 ? 'ERROR' : 'VALID';
    if (row.status === 'ERROR') errorCount++;
    else validCount++;

    if (row.status === 'ERROR') {
      errors.push({ cn_id: row._id, cn_number: row.cn_number, messages: rowErrors });
    }

    await row.save();
  }

  res.json({ success: true, valid_count: validCount, error_count: errorCount, errors });
});

// ═══════════════════════════════════════════════════════════
// SUBMIT — POST ALL VALID CREDIT NOTES
// ═══════════════════════════════════════════════════════════

const submitCreditNotes = catchAsync(async (req, res) => {
  const filter = { ...req.tenantFilter, status: 'VALID' };
  if (req.body.cn_ids?.length) {
    filter._id = { $in: req.body.cn_ids.map(id => new mongoose.Types.ObjectId(id)) };
  }

  const validRows = await CreditNote.find(filter);
  if (!validRows.length) {
    return res.status(400).json({ success: false, message: 'No VALID credit notes to submit. Run validation first.' });
  }

  // Authority matrix gate
  const { gateApproval } = require('../services/approvalService');
  const cnTotal = validRows.reduce((sum, cn) => sum + (cn.credit_total || 0), 0);
  const gated = await gateApproval({
    entityId: req.entityId,
    module: 'SALES',
    docType: 'CREDIT_NOTE',
    docId: validRows[0]._id,
    docRef: validRows.map(cn => cn.cn_number).filter(Boolean).join(', '),
    amount: cnTotal,
    description: `Submit ${validRows.length} credit note${validRows.length === 1 ? '' : 's'} (total ₱${cnTotal.toLocaleString()})`,
    requesterId: req.user._id,
    requesterName: req.user.name || req.user.email,
  }, res);
  if (gated) return;

  // Period lock check
  const { checkPeriodOpen } = require('../utils/periodLock');
  const { dateToPeriod } = require('../utils/periodLock');
  for (const cn of validRows) {
    await checkPeriodOpen(cn.entity_id, dateToPeriod(cn.cn_date || new Date()));
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    let postedCount = 0;

    for (const cn of validRows) {
      // 1. Create transaction event
      const event = await TransactionEvent.create([{
        entity_id: cn.entity_id,
        event_type: 'CREDIT_NOTE',
        source_ref: cn._id,
        source_model: 'CreditNote',
        description: `Credit Note ${cn.cn_number} — return from ${cn.hospital_id || cn.customer_id}`,
        event_date: cn.cn_date,
        created_by: req.user._id
      }], { session });

      // 2. Create RETURN_IN inventory entries for resaleable items
      for (const item of cn.line_items) {
        if (item.return_condition === 'RESALEABLE') {
          await InventoryLedger.create([{
            entity_id: cn.entity_id,
            bdm_id: cn.bdm_id,
            warehouse_id: cn.warehouse_id,
            product_id: item.product_id,
            batch_lot_no: item.batch_lot_no,
            expiry_date: item.expiry_date || new Date(),
            transaction_type: 'RETURN_IN',
            qty_in: item.qty,
            qty_out: 0,
            event_id: event[0]._id,
            recorded_by: req.user._id
          }], { session });
        }
      }

      // 3. Create reversal journal (Debit: Sales Revenue contra, Credit: AR Trade)
      try {
        const coa = await getCoaMap();
        const cnPeriod = dateToPeriod(cn.cn_date || new Date());
        const jeData = {
          je_date: cn.cn_date,
          period: cnPeriod,
          description: `Credit Note ${cn.cn_number}`,
          source_module: 'CREDIT_NOTE',
          source_event_id: event[0]._id,
          source_doc_ref: cn.cn_number || cn._id.toString(),
          lines: [
            { account_code: coa.SALES_REVENUE || '4000', account_name: 'Sales Returns', debit: cn.credit_total, credit: 0, description: `CN ${cn.cn_number}` },
            { account_code: coa.AR_TRADE || '1100', account_name: 'AR Trade', debit: 0, credit: cn.credit_total, description: `CN ${cn.cn_number}` }
          ],
          bir_flag: 'BOTH',
          vat_flag: 'N/A',
          created_by: req.user._id
        };
        await createAndPostJournal(cn.entity_id, jeData, { session });
      } catch (jeErr) {
        console.error(`[CreditNote] Journal failed for ${cn.cn_number}:`, jeErr.message);
      }

      // 4. Update credit note status
      cn.status = 'POSTED';
      cn.posted_at = new Date();
      cn.posted_by = req.user._id;
      cn.event_id = event[0]._id;
      await cn.save({ session });

      postedCount++;
    }

    await session.commitTransaction();
    res.json({ success: true, posted_count: postedCount });
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
});

module.exports = {
  createCreditNote, updateCreditNote, deleteCreditNote,
  getCreditNotes, getCreditNoteById,
  validateCreditNotes, submitCreditNotes
};
