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
const Warehouse = require('../models/Warehouse');
const { catchAsync } = require('../../middleware/errorHandler');
const { generateDocNumber } = require('../services/docNumbering');
const { matchInvoice } = require('../services/threeWayMatch');
const { journalFromAP } = require('../services/autoJournal');
const { createAndPostJournal } = require('../services/journalEngine');
const { getApLedger, getApAging, getApConsolidated, getGrni } = require('../services/apService');
const { recordApPayment, getPaymentHistory } = require('../services/apPaymentService');
const { createVatEntry } = require('../services/vatService');
const ErpAuditLog = require('../models/ErpAuditLog');
const XLSX = require('xlsx');
const { notifyDocumentPosted } = require('../services/erpNotificationService');
const { checkApprovalRequired } = require('../services/approvalService');

/* ═══════════════════════════════════════════════════════════════════════
   PURCHASE ORDERS
   ═══════════════════════════════════════════════════════════════════════ */

const ProductMaster = require('../models/ProductMaster');

const createPO = catchAsync(async (req, res) => {
  // Resolve territory code from the selected warehouse, not the user's territory
  let warehouseCode;
  if (req.body.warehouse_id) {
    const wh = await Warehouse.findById(req.body.warehouse_id).select('warehouse_code').lean();
    warehouseCode = wh?.warehouse_code || null;
  }

  // Enrich line items with UOM snapshot from ProductMaster
  if (req.body.line_items && req.body.line_items.length > 0) {
    const productIds = req.body.line_items.filter(l => l.product_id).map(l => l.product_id);
    if (productIds.length > 0) {
      const products = await ProductMaster.find({ _id: { $in: productIds } })
        .select('purchase_uom selling_uom conversion_factor unit_code')
        .lean();
      const productMap = new Map(products.map(p => [p._id.toString(), p]));
      for (const line of req.body.line_items) {
        if (line.product_id) {
          const prod = productMap.get(line.product_id.toString());
          if (prod) {
            line.uom = line.uom || prod.purchase_uom || prod.unit_code || '';
            line.selling_uom = line.selling_uom || prod.selling_uom || prod.unit_code || '';
            line.conversion_factor = line.conversion_factor || prod.conversion_factor || 1;
          }
        }
      }
    }
  }

  const poNumber = await generateDocNumber({
    prefix: 'PO',
    territoryCode: warehouseCode,
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

  const allowed = ['vendor_id', 'warehouse_id', 'po_date', 'expected_delivery_date', 'line_items', 'notes'];
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
  if (req.query.warehouse_id) filter.warehouse_id = req.query.warehouse_id;
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
      .populate('warehouse_id', 'warehouse_code warehouse_name')
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
    .populate('warehouse_id', 'warehouse_code warehouse_name')
    .populate('approved_by', 'firstName lastName')
    .populate('created_by', 'firstName lastName')
    .lean();
  if (!po) return res.status(404).json({ success: false, message: 'Purchase order not found' });

  // Cross-document references: linked supplier invoices and GRNs
  const GrnEntry = require('../models/GrnEntry');
  const [linked_invoices, linked_grns] = await Promise.all([
    SupplierInvoice.find({ po_id: po._id, entity_id: req.entityId })
      .select('invoice_ref invoice_date status total_amount match_status payment_status')
      .lean(),
    GrnEntry.find({ po_id: po._id, entity_id: req.entityId })
      .select('grn_date status line_items reviewed_at reviewed_by')
      .populate('reviewed_by', 'name')
      .lean()
  ]);
  po.linked_invoices = linked_invoices;
  po.linked_grns = linked_grns;

  res.json({ success: true, data: po });
});

const approvePO = catchAsync(async (req, res) => {
  const poQuery = { _id: req.params.id };
  if (!req.isPresident) poQuery.entity_id = req.entityId;
  const po = await PurchaseOrder.findOne(poQuery);
  if (!po) return res.status(404).json({ success: false, message: 'Purchase order not found' });
  if (po.status !== 'DRAFT') return res.status(400).json({ success: false, message: 'Only DRAFT POs can be approved' });

  // Authority matrix check — if enabled, verify approval chain before allowing
  const approvalCheck = await checkApprovalRequired({
    entityId: req.entityId,
    module: 'PURCHASING',
    docType: 'PO',
    docId: po._id,
    docRef: po.po_number,
    amount: po.total_amount,
    description: `PO for ${po.vendor_name || 'vendor'}`,
    requesterId: req.user._id,
    requesterName: req.user.name || req.user.email,
  });

  if (approvalCheck.required) {
    return res.status(202).json({
      success: true,
      message: approvalCheck.message,
      approval_pending: true,
      requests: approvalCheck.requests,
    });
  }

  po.status = 'APPROVED';
  po.approved_by = req.user._id;
  po.approved_at = new Date();
  await po.save();
  res.json({ success: true, data: po });

  // Non-blocking: notify management of approved PO
  notifyDocumentPosted({
    entityId: req.entityId,
    module: 'Purchasing',
    docType: 'Purchase Order',
    docRef: po.po_number || po._id.toString(),
    postedBy: req.user.name || req.user.email,
    amount: po.total_amount,
  }).catch(err => console.error('PO approval notification failed:', err.message));
});

const cancelPO = catchAsync(async (req, res) => {
  const poQuery = { _id: req.params.id };
  if (!req.isPresident) poQuery.entity_id = req.entityId;
  const po = await PurchaseOrder.findOne(poQuery);
  if (!po) return res.status(404).json({ success: false, message: 'Purchase order not found' });
  if (!['DRAFT', 'APPROVED'].includes(po.status)) {
    return res.status(400).json({ success: false, message: 'Only DRAFT or APPROVED POs can be cancelled' });
  }

  po.status = 'CANCELLED';
  await po.save();
  res.json({ success: true, data: po });
});

/**
 * POST /purchasing/orders/:id/receive — DEPRECATED
 * Receipt tracking is now unified through the GRN workflow.
 * GRN approval atomically updates PO qty_received and status.
 * This endpoint returns a redirect hint to the GRN page.
 */
const receivePO = catchAsync(async (req, res) => {
  return res.status(400).json({
    success: false,
    message: 'Direct PO receipt is deprecated. Please use the GRN workflow to receive goods against this PO.',
    redirect: `/erp/grn?po_id=${req.params.id}`
  });
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

  const allowed = ['vendor_id', 'vendor_name', 'warehouse_id', 'invoice_ref', 'invoice_date', 'due_date', 'po_id', 'po_number', 'grn_id', 'line_items'];
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
  if (req.query.warehouse_id) filter.warehouse_id = req.query.warehouse_id;
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
      .populate('warehouse_id', 'warehouse_code warehouse_name')
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
    .populate('warehouse_id', 'warehouse_code warehouse_name')
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
  invoice = await SupplierInvoice.findOne({ _id: req.params.id, entity_id: req.entityId });

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

  // Period lock check
  const { checkPeriodOpen, dateToPeriod } = require('../utils/periodLock');
  const invPeriod = dateToPeriod(invoice.invoice_date || new Date());
  await checkPeriodOpen(req.entityId, invPeriod);

  // Fetch vendor TIN for VAT ledger entry
  const vendor = await VendorMaster.findById(invoice.vendor_id).select('tin').lean();

  // Build JE data using existing journalFromAP
  const jeData = await journalFromAP(invoice.toObject(), req.user._id);
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
      tin: vendor?.tin || '',
      gross_amount: invoice.total_amount || (invoice.net_amount + inputVat),
      vat_amount: inputVat
    }).catch(async (err) => {
      console.error('VAT entry failed for SI:', invoice.invoice_ref, err.message);
      await ErpAuditLog.logChange({ entity_id: req.entityId, log_type: 'LEDGER_ERROR', target_ref: invoice.invoice_ref, target_model: 'VatLedger', field_changed: 'vat_entry', old_value: '', new_value: err.message, changed_by: req.user._id, note: `INPUT VAT entry failed for SI ${invoice.invoice_ref}` }).catch(() => {});
    });
  }

  res.json({ success: true, data: { invoice, journal_entry: je } });

  // Non-blocking: notify management of posted supplier invoice
  notifyDocumentPosted({
    entityId: req.entityId,
    module: 'Purchasing',
    docType: 'Supplier Invoice',
    docRef: invoice.invoice_ref,
    postedBy: req.user.name || req.user.email,
    amount: invoice.total_amount,
    period: je?.period,
  }).catch(err => console.error('SI post notification failed:', err.message));
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
  const filter = { entity_id: req.entityId };
  if (req.query.warehouse_id) filter.warehouse_id = req.query.warehouse_id;
  const pos = await PurchaseOrder.find(filter)
    .populate('vendor_id', 'vendor_name vendor_code')
    .populate('warehouse_id', 'warehouse_code warehouse_name')
    .sort({ created_at: -1 })
    .lean();

  const rows = [];
  for (const po of pos) {
    for (const li of po.line_items || []) {
      rows.push({
        'PO Number': po.po_number || '',
        'Warehouse': po.warehouse_id?.warehouse_code || '',
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
