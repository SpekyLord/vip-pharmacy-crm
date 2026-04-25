/**
 * Print Controller — renders printable HTML for receipts and forms
 * Phase 18: Sales receipts/invoices
 * Phase 19: Petty cash remittance/replenishment forms
 */
const SalesLine = require('../models/SalesLine');
const { renderSalesReceipt } = require('../templates/salesReceipt');
const { catchAsync } = require('../../middleware/errorHandler');

const getReceiptHtml = catchAsync(async (req, res) => {
  const sale = await SalesLine.findOne({
    _id: req.params.id,
    ...req.tenantFilter
  })
    .populate('hospital_id', 'hospital_name')
    .populate('customer_id', 'customer_name customer_type')
    .lean();

  if (!sale) {
    return res.status(404).json({ success: false, message: 'Sale not found' });
  }

  // Fetch product names for line items (cross-DB pattern)
  let lineProducts = [];
  if (sale.line_items?.length) {
    try {
      const ProductMaster = require('../models/ProductMaster');
      const productIds = sale.line_items.map(li => li.product_id).filter(Boolean);
      // eslint-disable-next-line vip-tenant/require-entity-filter -- productIds harvested from same-entity-scoped sale.line_items; _id is globally unique
      lineProducts = await ProductMaster.find({ _id: { $in: productIds } })
        .select('product_name brand_name')
        .lean();
    } catch { /* non-critical */ }
  }

  const html = renderSalesReceipt(sale, lineProducts);
  res.setHeader('Content-Type', 'text/html');
  res.send(html);
});

const getPettyCashFormHtml = catchAsync(async (req, res) => {
  const PettyCashRemittance = require('../models/PettyCashRemittance');
  const PettyCashFund = require('../models/PettyCashFund');
  const PettyCashTransaction = require('../models/PettyCashTransaction');
  const { renderPettyCashForm } = require('../templates/pettyCashForm');

  const doc = await PettyCashRemittance.findOne({
    _id: req.params.id,
    entity_id: req.entityId
  }).populate('custodian_id', 'name email').lean();

  if (!doc) {
    return res.status(404).json({ success: false, message: 'Document not found' });
  }

  // eslint-disable-next-line vip-tenant/require-entity-filter -- fund_id from same-entity-scoped doc above (entity_id: req.entityId)
  const fund = await PettyCashFund.findById(doc.fund_id).lean();

  // Fetch linked transactions
  let transactions = [];
  if (doc.transaction_ids?.length) {
    // eslint-disable-next-line vip-tenant/require-entity-filter -- transaction_ids harvested from same-entity-scoped doc.transaction_ids; _id is globally unique
    transactions = await PettyCashTransaction.find({ _id: { $in: doc.transaction_ids } })
      .sort({ txn_date: 1 })
      .lean();
  }

  const html = renderPettyCashForm(doc, fund, transactions);
  res.setHeader('Content-Type', 'text/html');
  res.send(html);
});

// Phase 25: GRN printable HTML
const getGrnHtml = catchAsync(async (req, res) => {
  const GrnEntry = require('../models/GrnEntry');
  const { renderGrnReceipt } = require('../templates/grnReceipt');

  const grn = await GrnEntry.findOne({ _id: req.params.id, ...req.tenantFilter })
    .populate('vendor_id', 'vendor_name')
    .lean();
  if (!grn) return res.status(404).json({ success: false, message: 'GRN not found' });

  // Denormalize vendor_name for the template
  if (grn.vendor_id?.vendor_name && !grn.vendor_name) {
    grn.vendor_name = grn.vendor_id.vendor_name;
  }

  let lineProducts = [];
  if (grn.line_items?.length) {
    try {
      const ProductMaster = require('../models/ProductMaster');
      const productIds = grn.line_items.map(li => li.product_id).filter(Boolean);
      // eslint-disable-next-line vip-tenant/require-entity-filter -- productIds harvested from same-entity-scoped grn.line_items; _id is globally unique
      lineProducts = await ProductMaster.find({ _id: { $in: productIds } })
        .select('product_name brand_name').lean();
    } catch { /* non-critical */ }
  }

  const html = renderGrnReceipt(grn, lineProducts);
  res.setHeader('Content-Type', 'text/html');
  res.send(html);
});

// Phase 25: Credit Note printable HTML
const getCreditNoteHtml = catchAsync(async (req, res) => {
  const CreditNote = require('../models/CreditNote');
  const { renderCreditNote } = require('../templates/creditNoteReceipt');

  const cn = await CreditNote.findOne({ _id: req.params.id, ...req.tenantFilter })
    .populate('hospital_id', 'hospital_name')
    .populate('customer_id', 'customer_name customer_type')
    .lean();

  if (!cn) return res.status(404).json({ success: false, message: 'Credit note not found' });

  let lineProducts = [];
  if (cn.line_items?.length) {
    try {
      const ProductMaster = require('../models/ProductMaster');
      const productIds = cn.line_items.map(li => li.product_id).filter(Boolean);
      // eslint-disable-next-line vip-tenant/require-entity-filter -- productIds harvested from same-entity-scoped cn.line_items; _id is globally unique
      lineProducts = await ProductMaster.find({ _id: { $in: productIds } })
        .select('product_name brand_name').lean();
    } catch { /* non-critical */ }
  }

  const html = renderCreditNote(cn, lineProducts);
  res.setHeader('Content-Type', 'text/html');
  res.send(html);
});

// Purchase Order printable HTML
const getPurchaseOrderHtml = catchAsync(async (req, res) => {
  const PurchaseOrder = require('../models/PurchaseOrder');
  const { renderPurchaseOrderHtml } = require('../templates/purchaseOrderPrint');

  const po = await PurchaseOrder.findOne({ _id: req.params.id, ...req.tenantFilter })
    .populate('entity_id', 'entity_name')
    .populate('vendor_id', 'vendor_name vendor_code')
    .populate('warehouse_id', 'warehouse_name warehouse_code location contact_person contact_phone')
    .populate('approved_by', 'firstName lastName')
    .populate('created_by', 'firstName lastName')
    .populate('activity_log.created_by', 'firstName lastName')
    .lean();
  if (!po) return res.status(404).json({ success: false, message: 'Purchase order not found' });

  let lineProducts = [];
  if (po.line_items?.length) {
    try {
      const ProductMaster = require('../models/ProductMaster');
      const productIds = po.line_items.map(li => li.product_id).filter(Boolean);
      // eslint-disable-next-line vip-tenant/require-entity-filter -- productIds harvested from same-entity-scoped po.line_items; _id is globally unique
      lineProducts = await ProductMaster.find({ _id: { $in: productIds } })
        .select('product_name brand_name dosage_strength unit_code purchase_uom').lean();
    } catch { /* non-critical */ }
  }

  const html = renderPurchaseOrderHtml(po, lineProducts);
  res.setHeader('Content-Type', 'text/html');
  res.send(html);
});

// Shared PO (public, no auth — accessed via share_token)
const getSharedPOHtml = catchAsync(async (req, res) => {
  const PurchaseOrder = require('../models/PurchaseOrder');
  const { renderPurchaseOrderHtml } = require('../templates/purchaseOrderPrint');

  // eslint-disable-next-line vip-tenant/require-entity-filter -- public-share route: share_token IS the auth mechanism, no req.entityId in scope; cross-entity access by design (vendor-facing PO link)
  const po = await PurchaseOrder.findOne({ share_token: req.params.token })
    .populate('entity_id', 'entity_name')
    .populate('vendor_id', 'vendor_name vendor_code')
    .populate('warehouse_id', 'warehouse_name warehouse_code location contact_person contact_phone')
    .populate('approved_by', 'firstName lastName')
    .populate('created_by', 'firstName lastName')
    .populate('activity_log.created_by', 'firstName lastName')
    .lean();
  if (!po) return res.status(404).send('<h1>Purchase order not found or link has expired.</h1>');

  let lineProducts = [];
  if (po.line_items?.length) {
    try {
      const ProductMaster = require('../models/ProductMaster');
      const productIds = po.line_items.map(li => li.product_id).filter(Boolean);
      // eslint-disable-next-line vip-tenant/require-entity-filter -- productIds harvested from share-token-validated po.line_items; _id is globally unique
      lineProducts = await ProductMaster.find({ _id: { $in: productIds } })
        .select('product_name brand_name dosage_strength unit_code purchase_uom').lean();
    } catch { /* non-critical */ }
  }

  const html = renderPurchaseOrderHtml(po, lineProducts);
  res.setHeader('Content-Type', 'text/html');
  res.send(html);
});

module.exports = { getReceiptHtml, getPettyCashFormHtml, getGrnHtml, getCreditNoteHtml, getPurchaseOrderHtml, getSharedPOHtml };
