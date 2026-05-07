/**
 * Print Controller — renders printable HTML for receipts and forms
 * Phase 18: Sales receipts/invoices
 * Phase 19: Petty cash remittance/replenishment forms
 *
 * Phase 15.3-fix-2 (May 07 2026): Resource-first access on every print
 * endpoint. Print URLs are opened via `window.open()` from the SPA, which
 * bypasses the axios interceptor that injects `X-Entity-Id`. Without that
 * header, `req.entityId` falls back to the caller's primary entity and
 * `req.tenantFilter.entity_id` masks any resource that lives in a different
 * (but still authorized) entity, producing false 404s like
 * "Purchase order not found" for an admin whose primary is VIP looking at
 * an MG and CO PO. Pattern mirrors the salesController.generateCsiDraft fix
 * in commit 3c28fca.
 *
 * Decision rule per `assertResourceReadAccess`:
 *   - president / ceo  → always allowed
 *   - admin  / finance → resource.entity_id must be in caller.entity_ids
 *   - staff  (BDM)     → entity match AND (own the row OR eligible proxy)
 * No silent self-fill (Rule #21).
 */
const SalesLine = require('../models/SalesLine');
const { renderSalesReceipt } = require('../templates/salesReceipt');
const { catchAsync } = require('../../middleware/errorHandler');
const { assertResourceReadAccess } = require('../utils/resolveOwnerScope');

const getReceiptHtml = catchAsync(async (req, res) => {
  // eslint-disable-next-line vip-tenant/require-entity-filter -- resource-first read; entity gate enforced by assertResourceReadAccess on sale.entity_id
  const sale = await SalesLine.findById(req.params.id)
    .populate('hospital_id', 'hospital_name')
    .populate('customer_id', 'customer_name customer_type')
    .lean();

  if (!sale) {
    return res.status(404).json({ success: false, message: 'Sale not found' });
  }

  await assertResourceReadAccess(req, sale, {
    moduleKey: 'sales',
    subKey: 'proxy_entry',
    resourceLabel: 'sale',
  });

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

  // eslint-disable-next-line vip-tenant/require-entity-filter -- resource-first read; entity gate enforced below (custodian-aliased to bdm_id for shared helper)
  const doc = await PettyCashRemittance.findById(req.params.id)
    .populate('custodian_id', 'name email')
    .lean();

  if (!doc) {
    return res.status(404).json({ success: false, message: 'Document not found' });
  }

  // Petty cash uses `custodian_id` instead of `bdm_id` for ownership. Alias
  // it onto the lean copy so the shared helper's staff-ownership branch
  // checks the right field. No moduleKey passed — petty cash has no
  // PROXY_ENTRY_ROLES row today, so non-custodian staff get 403 (matches
  // the privileged-only intent of remittance/replenishment forms).
  const custodianId = doc.custodian_id?._id || doc.custodian_id;
  await assertResourceReadAccess(req, { entity_id: doc.entity_id, bdm_id: custodianId }, {
    resourceLabel: 'petty cash document',
  });

  // eslint-disable-next-line vip-tenant/require-entity-filter -- fund_id from same-entity-scoped doc above
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

  // eslint-disable-next-line vip-tenant/require-entity-filter -- resource-first read; entity gate enforced by assertResourceReadAccess on grn.entity_id
  const grn = await GrnEntry.findById(req.params.id)
    .populate('vendor_id', 'vendor_name')
    .lean();
  if (!grn) return res.status(404).json({ success: false, message: 'GRN not found' });

  await assertResourceReadAccess(req, grn, {
    moduleKey: 'inventory',
    subKey: 'grn_proxy_entry',
    resourceLabel: 'GRN',
  });

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

  // eslint-disable-next-line vip-tenant/require-entity-filter -- resource-first read; entity gate enforced by assertResourceReadAccess on cn.entity_id
  const cn = await CreditNote.findById(req.params.id)
    .populate('hospital_id', 'hospital_name')
    .populate('customer_id', 'customer_name customer_type')
    .lean();

  if (!cn) return res.status(404).json({ success: false, message: 'Credit note not found' });

  await assertResourceReadAccess(req, cn, {
    moduleKey: 'sales',
    subKey: 'proxy_entry',
    resourceLabel: 'credit note',
  });

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

  // eslint-disable-next-line vip-tenant/require-entity-filter -- resource-first read; entity gate enforced by assertResourceReadAccess on po.entity_id
  const po = await PurchaseOrder.findById(req.params.id)
    .populate('entity_id', 'entity_name')
    .populate('vendor_id', 'vendor_name vendor_code')
    .populate('warehouse_id', 'warehouse_name warehouse_code location contact_person contact_phone')
    .populate('approved_by', 'firstName lastName')
    .populate('created_by', 'firstName lastName')
    .populate('activity_log.created_by', 'firstName lastName')
    .lean();
  if (!po) return res.status(404).json({ success: false, message: 'Purchase order not found' });

  // The populated entity_id is an object after .populate(); pass the raw id
  // to the helper. (Mongoose populates in-place; the underlying ObjectId is
  // on `po.entity_id._id`.)
  const poEntityId = po.entity_id?._id || po.entity_id;
  await assertResourceReadAccess(req, { entity_id: poEntityId, bdm_id: po.bdm_id }, {
    moduleKey: 'purchasing',
    subKey: 'proxy_entry',
    resourceLabel: 'purchase order',
  });

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
