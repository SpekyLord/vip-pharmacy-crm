/**
 * Purchasing & AP Controller — Phase 12.6
 *
 * PO CRUD + approve/cancel/receive
 * Supplier Invoice CRUD + validate (3-way match) + post (auto-JE)
 * AP ledger, aging, GRNI, payment recording
 */
const PurchaseOrder = require('../models/PurchaseOrder');
const SupplierInvoice = require('../models/SupplierInvoice');
const VendorMaster = require('../models/VendorMaster');
const { catchAsync } = require('../../middleware/errorHandler');
const { generateDocNumber } = require('../services/docNumbering');
const { matchInvoice } = require('../services/threeWayMatch');
const { journalFromAP } = require('../services/autoJournal');
const { createAndPostJournal } = require('../services/journalEngine');
const { getApLedger, getApAging, getApConsolidated, getGrni } = require('../services/apService');
const { recordApPayment, getPaymentHistory } = require('../services/apPaymentService');
const { createVatEntry } = require('../services/vatService');
const XLSX = require('xlsx');

/* ═══════════════════════════════════════════════════════════════════════
   PURCHASE ORDERS
   ═══════════════════════════════════════════════════════════════════════ */

const createPO = catchAsync(async (req, res) => {
  const poNumber = await generateDocNumber({
    prefix: 'PO',
    bdmId: req.bdmId || req.user._id,
    date: req.body.po_date || new Date()
  });

  const po = await PurchaseOrder.create({
    ...req.body,
    entity_id: req.entityId,
    bdm_id: req.bdmId || req.user._id,
    po_number: poNumber,
    status: 'DRAFT',
    created_by: req.user._id
  });

  res.status(201).json({ success: true, data: po });
});

const updatePO = catchAsync(async (req, res) => {
  const po = await PurchaseOrder.findOne({ _id: req.params.id, entity_id: req.entityId });
  if (!po) return res.status(404).json({ success: false, message: 'Purchase order not found' });
  if (po.status !== 'DRAFT') return res.status(400).json({ success: false, message: 'Only DRAFT POs can be edited' });

  const allowed = ['vendor_id', 'po_date', 'expected_delivery_date', 'line_items', 'notes'];
  for (const key of allowed) {
    if (req.body[key] !== undefined) po[key] = req.body[key];
  }
  await po.save();
  res.json({ success: true, data: po });
});

const getPOs = catchAsync(async (req, res) => {
  const filter = { entity_id: req.entityId };
  if (req.query.status) {
    const statuses = req.query.status.split(',').map(s => s.trim()).filter(Boolean);
    filter.status = statuses.length === 1 ? statuses[0] : { $in: statuses };
  }
  if (req.query.vendor_id) filter.vendor_id = req.query.vendor_id;
  if (req.query.from || req.query.to) {
    filter.po_date = {};
    if (req.query.from) filter.po_date.$gte = new Date(req.query.from);
    if (req.query.to) filter.po_date.$lte = new Date(req.query.to);
  }

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;

  const [data, total] = await Promise.all([
    PurchaseOrder.find(filter)
      .populate('vendor_id', 'vendor_name vendor_code')
      .sort({ created_at: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    PurchaseOrder.countDocuments(filter)
  ]);

  res.json({ success: true, data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
});

const getPOById = catchAsync(async (req, res) => {
  const po = await PurchaseOrder.findOne({ _id: req.params.id, entity_id: req.entityId })
    .populate('vendor_id', 'vendor_name vendor_code tin address payment_terms_days vat_status')
    .lean();
  if (!po) return res.status(404).json({ success: false, message: 'Purchase order not found' });
  res.json({ success: true, data: po });
});

const approvePO = catchAsync(async (req, res) => {
  const po = await PurchaseOrder.findOne({ _id: req.params.id, entity_id: req.entityId });
  if (!po) return res.status(404).json({ success: false, message: 'Purchase order not found' });
  if (po.status !== 'DRAFT') return res.status(400).json({ success: false, message: 'Only DRAFT POs can be approved' });

  po.status = 'APPROVED';
  po.approved_by = req.user._id;
  po.approved_at = new Date();
  await po.save();
  res.json({ success: true, data: po });
});

const cancelPO = catchAsync(async (req, res) => {
  const po = await PurchaseOrder.findOne({ _id: req.params.id, entity_id: req.entityId });
  if (!po) return res.status(404).json({ success: false, message: 'Purchase order not found' });
  if (!['DRAFT', 'APPROVED'].includes(po.status)) {
    return res.status(400).json({ success: false, message: 'Only DRAFT or APPROVED POs can be cancelled' });
  }

  po.status = 'CANCELLED';
  await po.save();
  res.json({ success: true, data: po });
});

const receivePO = catchAsync(async (req, res) => {
  const po = await PurchaseOrder.findOne({ _id: req.params.id, entity_id: req.entityId });
  if (!po) return res.status(404).json({ success: false, message: 'Purchase order not found' });
  if (!['APPROVED', 'PARTIALLY_RECEIVED'].includes(po.status)) {
    return res.status(400).json({ success: false, message: 'PO must be APPROVED or PARTIALLY_RECEIVED to receive goods' });
  }

  // req.body.receipts: [{ product_id, qty_received }]
  const receipts = req.body.receipts || [];
  if (!receipts.length) return res.status(400).json({ success: false, message: 'No receipt data provided' });

  // Validate receipt quantities
  for (const receipt of receipts) {
    if (!receipt.qty_received || receipt.qty_received < 0) {
      return res.status(400).json({ success: false, message: 'Receipt quantity must be a positive number' });
    }
  }

  let allReceived = true;
  for (const receipt of receipts) {
    const line = po.line_items.find(l =>
      (l.product_id && l.product_id.toString() === receipt.product_id) ||
      (l.item_key && l.item_key === receipt.item_key)
    );
    if (line) {
      line.qty_received = Math.min(line.qty_ordered, Math.max(0, (line.qty_received || 0) + receipt.qty_received));
      if (line.qty_received < line.qty_ordered) allReceived = false;
    }
  }

  // Check if any lines still have outstanding qty
  if (allReceived) {
    allReceived = po.line_items.every(l => l.qty_received >= l.qty_ordered);
  }

  po.status = allReceived ? 'RECEIVED' : 'PARTIALLY_RECEIVED';
  await po.save();
  res.json({ success: true, data: po });
});

/* ═══════════════════════════════════════════════════════════════════════
   SUPPLIER INVOICES
   ═══════════════════════════════════════════════════════════════════════ */

const createInvoice = catchAsync(async (req, res) => {
  // Denormalize vendor_name and po_number for JE descriptions
  let vendor_name = req.body.vendor_name;
  if (!vendor_name && req.body.vendor_id) {
    const vendor = await VendorMaster.findById(req.body.vendor_id).select('vendor_name').lean();
    vendor_name = vendor?.vendor_name || '';
  }

  let po_number = req.body.po_number;
  if (!po_number && req.body.po_id) {
    const po = await PurchaseOrder.findById(req.body.po_id).select('po_number').lean();
    po_number = po?.po_number || '';
  }

  const invoice = await SupplierInvoice.create({
    ...req.body,
    entity_id: req.entityId,
    vendor_name,
    po_number,
    status: 'DRAFT',
    created_by: req.user._id
  });

  res.status(201).json({ success: true, data: invoice });
});

const updateInvoice = catchAsync(async (req, res) => {
  const invoice = await SupplierInvoice.findOne({ _id: req.params.id, entity_id: req.entityId });
  if (!invoice) return res.status(404).json({ success: false, message: 'Supplier invoice not found' });
  if (invoice.status !== 'DRAFT') return res.status(400).json({ success: false, message: 'Only DRAFT invoices can be edited' });

  const allowed = ['vendor_id', 'vendor_name', 'invoice_ref', 'invoice_date', 'due_date', 'po_id', 'po_number', 'grn_id', 'line_items'];
  for (const key of allowed) {
    if (req.body[key] !== undefined) invoice[key] = req.body[key];
  }
  await invoice.save();
  res.json({ success: true, data: invoice });
});

const getInvoices = catchAsync(async (req, res) => {
  const filter = { entity_id: req.entityId };
  if (req.query.status) filter.status = req.query.status;
  if (req.query.vendor_id) filter.vendor_id = req.query.vendor_id;
  if (req.query.match_status) filter.match_status = req.query.match_status;
  if (req.query.payment_status) filter.payment_status = req.query.payment_status;
  if (req.query.from || req.query.to) {
    filter.invoice_date = {};
    if (req.query.from) filter.invoice_date.$gte = new Date(req.query.from);
    if (req.query.to) filter.invoice_date.$lte = new Date(req.query.to);
  }

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;

  const [data, total] = await Promise.all([
    SupplierInvoice.find(filter)
      .populate('vendor_id', 'vendor_name vendor_code')
      .sort({ created_at: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    SupplierInvoice.countDocuments(filter)
  ]);

  res.json({ success: true, data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
});

const getInvoiceById = catchAsync(async (req, res) => {
  const invoice = await SupplierInvoice.findOne({ _id: req.params.id, entity_id: req.entityId })
    .populate('vendor_id', 'vendor_name vendor_code tin payment_terms_days vat_status')
    .populate('po_id', 'po_number po_date status')
    .lean();
  if (!invoice) return res.status(404).json({ success: false, message: 'Supplier invoice not found' });
  res.json({ success: true, data: invoice });
});

const validateInvoice = catchAsync(async (req, res) => {
  let invoice = await SupplierInvoice.findOne({ _id: req.params.id, entity_id: req.entityId });
  if (!invoice) return res.status(404).json({ success: false, message: 'Supplier invoice not found' });

  const matchResult = await matchInvoice(invoice._id, req.body.tolerance || 0.02);

  // Re-fetch after matchInvoice (it saves match_status + per-line flags on its own copy)
  invoice = await SupplierInvoice.findById(req.params.id);

  // Auto-validate if no discrepancies, or force with override
  if (matchResult.overall_status !== 'DISCREPANCY' || req.body.force) {
    invoice.status = 'VALIDATED';
    await invoice.save();
  }

  res.json({
    success: true,
    data: {
      invoice_id: invoice._id,
      status: invoice.status,
      match_status: invoice.match_status,
      match_result: matchResult
    }
  });
});

const postInvoice = catchAsync(async (req, res) => {
  const invoice = await SupplierInvoice.findOne({ _id: req.params.id, entity_id: req.entityId });
  if (!invoice) return res.status(404).json({ success: false, message: 'Supplier invoice not found' });
  if (invoice.status === 'POSTED') return res.status(400).json({ success: false, message: 'Invoice is already posted' });
  if (invoice.status === 'DRAFT' && !req.body.force) {
    return res.status(400).json({ success: false, message: 'Invoice must be VALIDATED before posting. Use force=true to bypass.' });
  }

  // Build JE data using existing journalFromAP
  const jeData = journalFromAP(invoice.toObject(), req.user._id);
  const je = await createAndPostJournal(req.entityId, jeData);

  invoice.status = 'POSTED';
  invoice.event_id = je._id;
  await invoice.save();

  // VAT Ledger — INPUT VAT from supplier invoice
  const inputVat = invoice.input_vat || invoice.vat_amount || 0;
  if (inputVat > 0) {
    await createVatEntry({
      entity_id: req.entityId,
      period: je.period,
      vat_type: 'INPUT',
      source_module: 'SUPPLIER_INVOICE',
      source_doc_ref: invoice.invoice_ref,
      source_event_id: je._id,
      hospital_or_vendor: invoice.vendor_id,
      tin: invoice.vendor_tin,
      gross_amount: invoice.total_amount || (invoice.net_amount + inputVat),
      vat_amount: inputVat
    }).catch(err => console.error('VAT entry failed for SI:', invoice.invoice_ref, err.message));
  }

  res.json({ success: true, data: { invoice, journal_entry: je } });
});

/* ═══════════════════════════════════════════════════════════════════════
   AP LEDGER, AGING, GRNI
   ═══════════════════════════════════════════════════════════════════════ */

const apLedger = catchAsync(async (req, res) => {
  const data = await getApLedger(req.entityId);
  res.json({ success: true, data });
});

const apAging = catchAsync(async (req, res) => {
  const data = await getApAging(req.entityId);
  res.json({ success: true, data });
});

const apConsolidated = catchAsync(async (req, res) => {
  const data = await getApConsolidated(req.entityId);
  res.json({ success: true, data });
});

const grni = catchAsync(async (req, res) => {
  const data = await getGrni(req.entityId);
  res.json({ success: true, data });
});

/* ═══════════════════════════════════════════════════════════════════════
   AP PAYMENTS
   ═══════════════════════════════════════════════════════════════════════ */

const recordPayment = catchAsync(async (req, res) => {
  const payment = await recordApPayment(req.params.id, req.body, req.entityId, req.user._id);
  res.status(201).json({ success: true, data: payment });
});

const paymentHistory = catchAsync(async (req, res) => {
  const data = await getPaymentHistory(req.entityId, req.query.vendor_id);
  res.json({ success: true, data });
});

// ═══ Export Purchase Orders (Excel) ═══
const exportPOs = catchAsync(async (req, res) => {
  const pos = await PurchaseOrder.find({ entity_id: req.entityId })
    .populate('vendor_id', 'vendor_name vendor_code')
    .sort({ created_at: -1 })
    .lean();

  const rows = [];
  for (const po of pos) {
    for (const li of po.line_items || []) {
      rows.push({
        'PO Number': po.po_number || '',
        'PO Date': po.po_date ? new Date(po.po_date).toISOString().slice(0, 10) : '',
        'Vendor Code': po.vendor_id?.vendor_code || '',
        'Vendor Name': po.vendor_id?.vendor_name || '',
        'Status': po.status || '',
        'Expected Delivery': po.expected_delivery_date ? new Date(po.expected_delivery_date).toISOString().slice(0, 10) : '',
        'Item Key': li.item_key || '',
        'Qty Ordered': li.qty_ordered || 0,
        'Unit Price': li.unit_price || 0,
        'Line Total': li.line_total || 0,
        'Qty Received': li.qty_received || 0,
        'Qty Invoiced': li.qty_invoiced || 0,
        'PO Total': po.total_amount || 0,
        'VAT': po.vat_amount || 0,
        'Net': po.net_amount || 0,
        'Notes': po.notes || ''
      });
    }
  }

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [{ wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 25 }, { wch: 12 }, { wch: 14 }, { wch: 30 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 25 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Purchase Orders');

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Disposition', 'attachment; filename="purchase-orders-export.xlsx"');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
});

module.exports = {
  // PO
  createPO, updatePO, getPOs, getPOById, approvePO, cancelPO, receivePO, exportPOs,
  // Supplier Invoices
  createInvoice, updateInvoice, getInvoices, getInvoiceById, validateInvoice, postInvoice,
  // AP
  apLedger, apAging, apConsolidated, grni, recordPayment, paymentHistory
};
