/**
 * Document Detail Hydrator — Reversal Console single-doc enrichment
 *
 * Purpose:
 *   The Approval Hub (universalApprovalService.getUniversalPending) already
 *   runs three enrichment passes on its list-time output:
 *     1) .populate() of ref fields (hospital/customer/warehouse/vendor/fund/etc.)
 *     2) Cross-DB product-name + inventory stock lookup for line_items
 *     3) S3 URL signing for photo/receipt URLs
 *
 *   The President Reversal Console (/api/erp/president/reversals/detail) was
 *   going through REVERSAL_HANDLERS[].load() which only does a plain findOne
 *   with tenant filter — no populate, no cross-DB products, no URL signing.
 *   Result: the expanded detail row showed empty Product/Stock/Customer/photos.
 *
 *   This module centralizes the same enrichment the Approval Hub performs, but
 *   for a single doc looked up by (doc_type, doc_id). Tenant scope is still
 *   enforced (same filter the reversal loader would apply). The builder from
 *   documentDetailBuilder.js is the single source of truth for the shape —
 *   this file only adds the resolved refs and S3 URLs on top.
 *
 * Subscription/scalability:
 *   - One POPULATED_LOADERS entry per reversible doc_type. Adding a new module
 *     to REVERSAL_HANDLERS also means adding a loader entry here so its detail
 *     shows with full context. Otherwise the hydrator falls back to the raw
 *     handler.load() and the UI degrades gracefully (same as before this file).
 *   - No hardcoded business values (Rule #3); labels come from populated docs.
 *   - Tenant filter honored so cross-entity leaks are impossible.
 *
 * Called from: backend/erp/controllers/presidentReversalController.getDetail
 */

const mongoose = require('mongoose');
const { getSignedDownloadUrl, extractKeyFromUrl } = require('../../config/s3');

// Models — mirror the set used by documentReversalService.REVERSAL_HANDLERS.
const SalesLine = require('../models/SalesLine');
const Collection = require('../models/Collection');
const ExpenseEntry = require('../models/ExpenseEntry');
const PrfCalf = require('../models/PrfCalf');
const IncomeReport = require('../models/IncomeReport');
const Payslip = require('../models/Payslip');
const GrnEntry = require('../models/GrnEntry');
const InterCompanyTransfer = require('../models/InterCompanyTransfer');
const ConsignmentTracker = require('../models/ConsignmentTracker');
const PettyCashTransaction = require('../models/PettyCashTransaction');
const JournalEntry = require('../models/JournalEntry');
const InventoryLedger = require('../models/InventoryLedger');
// Phase 31R
const SmerEntry = require('../models/SmerEntry');
const CarLogbookEntry = require('../models/CarLogbookEntry');
const SupplierInvoice = require('../models/SupplierInvoice');
const CreditNote = require('../models/CreditNote');
const IcSettlement = require('../models/IcSettlement');
// Phase 31R-OS
const OfficeSupply = require('../models/OfficeSupply');
const OfficeSupplyTransaction = require('../models/OfficeSupplyTransaction');
// Phase G6.7 — Reversal Console SALES_GOAL_PLAN detail
const SalesGoalPlan = require('../models/SalesGoalPlan');

const { buildDocumentDetails, REVERSAL_DOC_TYPE_TO_MODULE } = require('./documentDetailBuilder');

// Lazy ProductMaster (same pattern as universalApprovalService).
function getProductMaster() {
  try { return mongoose.model('ProductMaster'); } catch { return null; }
}

/* ────────────────────────────────────────────────────────────────────────────
 * Populated loaders — one per doc_type. Each re-applies tenant scope + does
 * the .populate() calls the Approval Hub performs at list time.
 * ────────────────────────────────────────────────────────────────────────── */

const POPULATED_LOADERS = {
  SALES_LINE: async (id, filter) => {
    return SalesLine.findOne({ _id: id, ...filter })
      .populate('bdm_id', 'name email')
      .populate('hospital_id', 'hospital_name')
      .populate('customer_id', 'customer_name')
      .populate('warehouse_id', 'warehouse_name warehouse_code')
      .populate('posted_by', 'name')
      .lean();
  },

  COLLECTION: async (id, filter) => {
    return Collection.findOne({ _id: id, ...filter })
      .populate('bdm_id', 'name email')
      .populate('hospital_id', 'hospital_name')
      .populate('customer_id', 'customer_name')
      .populate('posted_by', 'name')
      .lean();
  },

  EXPENSE: async (id, filter) => {
    return ExpenseEntry.findOne({ _id: id, ...filter })
      .populate('bdm_id', 'name email')
      .populate('recorded_on_behalf_of', 'name')
      .populate('posted_by', 'name')
      .lean();
  },

  CALF: async (id, filter) => {
    return PrfCalf.findOne({ _id: id, doc_type: 'CALF', ...filter })
      .populate('bdm_id', 'name email')
      .populate('posted_by', 'name')
      .lean();
  },

  PRF: async (id, filter) => {
    return PrfCalf.findOne({ _id: id, doc_type: 'PRF', ...filter })
      .populate('bdm_id', 'name email')
      .populate('posted_by', 'name')
      .lean();
  },

  GRN: async (id, filter) => {
    return GrnEntry.findOne({ _id: id, ...filter })
      .populate('warehouse_id', 'warehouse_name warehouse_code')
      .populate('vendor_id', 'vendor_name')
      .populate('bdm_id', 'name email')
      .populate('reviewed_by', 'name')
      .populate('posted_by', 'name')
      .lean();
  },

  // Phase 32 — Undertaking hydrator. Populates the linked GRN (with nested vendor)
  // so buildUndertakingDetails can surface waybill + source context to the
  // Reversal Console + Approval Hub uniformly.
  UNDERTAKING: async (id, filter) => {
    const Undertaking = require('../models/Undertaking');
    return Undertaking.findOne({ _id: id, ...filter })
      .populate('warehouse_id', 'warehouse_name warehouse_code')
      .populate('bdm_id', 'name email')
      .populate('acknowledged_by', 'name')
      .populate({
        path: 'linked_grn_id',
        select: 'grn_number grn_date source_type po_id po_number vendor_id waybill_photo_url undertaking_photo_url reassignment_id status',
        populate: { path: 'vendor_id', select: 'vendor_name' }
      })
      .lean();
  },

  IC_TRANSFER: async (id, filter) => {
    // IC docs live under either source OR target entity — mirror the reversal
    // loader's scope rule.
    const q = { _id: id };
    if (filter?.entity_id) {
      q.$or = [
        { source_entity_id: filter.entity_id },
        { target_entity_id: filter.entity_id },
      ];
    }
    return InterCompanyTransfer.findOne(q)
      .populate('source_entity_id', 'entity_name entity_code')
      .populate('target_entity_id', 'entity_name entity_code')
      .populate('source_warehouse_id', 'warehouse_name warehouse_code')
      .populate('target_warehouse_id', 'warehouse_name warehouse_code')
      .populate('creditor_entity_id', 'entity_name entity_code')
      .populate('debtor_entity_id', 'entity_name entity_code')
      .populate('approved_by', 'name')
      .populate('shipped_by', 'name')
      .populate('received_by', 'name')
      .populate('posted_by', 'name')
      .populate('cancelled_by', 'name')
      .lean();
  },

  CONSIGNMENT_TRANSFER: async (id, filter) => {
    return ConsignmentTracker.findOne({ _id: id, ...filter })
      .populate('hospital_id', 'hospital_name')
      .populate('warehouse_id', 'warehouse_name warehouse_code')
      .populate('bdm_id', 'name email')
      .lean();
  },

  INCOME_REPORT: async (id, filter) => {
    return IncomeReport.findOne({ _id: id, ...filter })
      .populate('bdm_id', 'name email')
      .populate('reviewed_by', 'name')
      .populate('credited_by', 'name')
      .lean();
  },

  PAYSLIP: async (id, filter) => {
    return Payslip.findOne({ _id: id, ...filter })
      .populate('person_id', 'first_name last_name full_name')
      .populate('reviewed_by', 'name')
      .populate('approved_by', 'name')
      .lean();
  },

  PETTY_CASH_TXN: async (id, filter) => {
    const q = { _id: id };
    if (filter?.entity_id) q.entity_id = filter.entity_id;
    return PettyCashTransaction.findOne(q)
      .populate('fund_id', 'fund_name fund_code current_balance')
      .populate('approved_by', 'name')
      .populate('posted_by', 'name')
      .populate('voided_by', 'name')
      .lean();
  },

  JOURNAL_ENTRY: async (id, filter) => {
    const q = { _id: id };
    if (filter?.entity_id) q.entity_id = filter.entity_id;
    return JournalEntry.findOne(q)
      .populate('posted_by', 'name')
      .populate('created_by', 'name')
      .populate('corrects_je_id', 'je_number je_date')
      .lean();
  },

  // ── Phase 31R ──
  SMER_ENTRY: async (id, filter) => {
    return SmerEntry.findOne({ _id: id, ...filter })
      .populate('bdm_id', 'name email')
      .populate('posted_by', 'name')
      .populate({ path: 'daily_entries.overridden_by', select: 'name' })
      .lean();
  },

  CAR_LOGBOOK: async (id, filter) => {
    return CarLogbookEntry.findOne({ _id: id, ...filter })
      .populate('bdm_id', 'name email')
      .populate('posted_by', 'name')
      .lean();
  },

  SUPPLIER_INVOICE: async (id, filter) => {
    return SupplierInvoice.findOne({ _id: id, ...filter })
      .populate('vendor_id', 'vendor_name tin')
      .populate('po_id', 'po_number')
      .populate('warehouse_id', 'warehouse_name warehouse_code')
      .lean();
  },

  CREDIT_NOTE: async (id, filter) => {
    return CreditNote.findOne({ _id: id, ...filter })
      .populate('bdm_id', 'name email')
      .populate('hospital_id', 'hospital_name')
      .populate('customer_id', 'customer_name')
      .populate('warehouse_id', 'warehouse_name warehouse_code')
      .populate('posted_by', 'name')
      .lean();
  },

  IC_SETTLEMENT: async (id, filter) => {
    // IcSettlement uses creditor_entity_id / debtor_entity_id (not entity_id).
    // Mirror loadIcSettlement's scope rule: caller entity matches either side.
    const q = { _id: id };
    if (filter?.entity_id) {
      q.$or = [
        { creditor_entity_id: filter.entity_id },
        { debtor_entity_id: filter.entity_id },
      ];
    }
    return IcSettlement.findOne(q)
      .populate('creditor_entity_id', 'entity_name entity_code')
      .populate('debtor_entity_id', 'entity_name entity_code')
      .populate('posted_by', 'name')
      .lean();
  },

  // ── Phase 31R-OS ──
  OFFICE_SUPPLY_ITEM: async (id, filter) => {
    return OfficeSupply.findOne({ _id: id, ...filter })
      .populate('created_by', 'name')
      .populate('cost_center_id', 'cost_center_name cost_center_code')
      .populate('warehouse_id', 'warehouse_name warehouse_code')
      .lean();
  },

  OFFICE_SUPPLY_TXN: async (id, filter) => {
    return OfficeSupplyTransaction.findOne({ _id: id, ...filter })
      .populate('supply_id', 'item_name item_code category unit qty_on_hand')
      .populate('cost_center_id', 'cost_center_name cost_center_code')
      .populate('created_by', 'name')
      .lean();
  },

  // Phase G6.7 — mirrors the Approval Hub populate for SalesGoalPlan so the
  // Reversal Console shows the same plan summary when previewing a reversal.
  SALES_GOAL_PLAN: async (id, filter) => {
    return SalesGoalPlan.findOne({ _id: id, ...filter })
      .populate('created_by', 'name')
      .populate('approved_by', 'name')
      .lean();
  },
};

/* ────────────────────────────────────────────────────────────────────────────
 * Line-item enrichment — cross-DB product names + available stock.
 * Mirrors universalApprovalService (lines ~861-971) but for a single doc.
 * ────────────────────────────────────────────────────────────────────────── */

async function enrichLineItems(details) {
  if (!details || !Array.isArray(details.line_items) || details.line_items.length === 0) return;

  // 1. Collect valid product IDs
  const productIds = [];
  for (const li of details.line_items) {
    if (li.product_id && mongoose.Types.ObjectId.isValid(li.product_id)) {
      productIds.push(li.product_id.toString());
    }
  }

  // 2. Bulk-fetch product master records (brand + dosage = Rule #4 full identifier)
  const productMap = new Map();
  if (productIds.length) {
    const ProductMaster = getProductMaster();
    if (ProductMaster) {
      try {
        const objIds = productIds.map(id => new mongoose.Types.ObjectId(id));
        const products = await ProductMaster.find({ _id: { $in: objIds } })
          .select('brand_name dosage_strength item_key unit_code')
          .lean();
        for (const p of products) productMap.set(p._id.toString(), p);
      } catch (err) {
        console.error('[detailHydrator] product enrichment failed:', err.message);
      }
    }
  }

  // 3. Bulk-fetch stock from the appropriate ledger scope
  const whId = details._warehouse_id?.toString?.()
    || (details._warehouse_id ? String(details._warehouse_id) : null);
  const bdmId = details._bdm_id?.toString?.()
    || (details._bdm_id ? String(details._bdm_id) : null);

  const stockMap = new Map();
  if ((whId || bdmId) && productIds.length) {
    try {
      const objIds = productIds.map(id => new mongoose.Types.ObjectId(id));
      const match = { product_id: { $in: objIds } };
      if (whId) match.warehouse_id = new mongoose.Types.ObjectId(whId);
      else if (bdmId) match.bdm_id = new mongoose.Types.ObjectId(bdmId);
      const rows = await InventoryLedger.aggregate([
        { $match: match },
        {
          $group: {
            _id: '$product_id',
            total_in: { $sum: '$qty_in' },
            total_out: { $sum: '$qty_out' },
          },
        },
        { $addFields: { available: { $subtract: ['$total_in', '$total_out'] } } },
      ]);
      for (const r of rows) stockMap.set(r._id.toString(), r.available);
    } catch (err) {
      console.error('[detailHydrator] stock enrichment failed:', err.message);
    }
  }

  // 4. Apply enrichments
  for (const li of details.line_items) {
    if (li.product_id) {
      const pid = li.product_id.toString();
      const prod = productMap.get(pid);
      if (prod) {
        // Rule #4: brand_name + dosage_strength (never just brand). Unit code
        // appended when available (matches feedback_product_dropdown memo).
        const base = `${prod.brand_name || ''} ${prod.dosage_strength || ''}`.trim();
        li.product_name = prod.unit_code ? `${base} ${prod.unit_code}`.trim() : base;
      } else {
        li.product_name = li.item_key || String(li.product_id);
      }
      li.available_stock = stockMap.get(pid) ?? null;
    }
  }

  // 5. Strip internal markers so they don't leak to the client
  delete details._warehouse_id;
  delete details._bdm_id;
}

/* ────────────────────────────────────────────────────────────────────────────
 * S3 URL signing — same mapping as Approval Hub's signer block. One entry per
 * module key (not doc_type, since builder keys on module).
 * ────────────────────────────────────────────────────────────────────────── */

async function signUrl(url) {
  if (!url) return url;
  try {
    const key = extractKeyFromUrl(url);
    return await getSignedDownloadUrl(key, 3600);
  } catch (err) {
    // Preserve original on failure (matches Approval Hub behavior)
    return url;
  }
}

async function signUrls(urls) {
  return Promise.all((urls || []).map(u => signUrl(u)));
}

async function signPhotoUrls(details, moduleKey) {
  if (!details) return;
  switch (moduleKey) {
    case 'SALES':
      [details.csi_photo_url, details.csi_received_photo_url] = await Promise.all([
        signUrl(details.csi_photo_url),
        signUrl(details.csi_received_photo_url),
      ]);
      break;
    case 'COLLECTION':
      [details.deposit_slip_url, details.cr_photo_url, details.cwt_certificate_url] = await Promise.all([
        signUrl(details.deposit_slip_url),
        signUrl(details.cr_photo_url),
        signUrl(details.cwt_certificate_url),
      ]);
      details.csi_photo_urls = await signUrls(details.csi_photo_urls);
      break;
    case 'EXPENSES':
      await Promise.all((details.lines || []).map(async (l) => {
        l.or_photo_url = await signUrl(l.or_photo_url);
      }));
      break;
    case 'CAR_LOGBOOK':
      await Promise.all([
        ...(details.fuel_receipts || []).map(async (fr) => {
          [fr.receipt_url, fr.starting_km_photo_url, fr.ending_km_photo_url] = await Promise.all([
            signUrl(fr.receipt_url),
            signUrl(fr.starting_km_photo_url),
            signUrl(fr.ending_km_photo_url),
          ]);
        }),
        (async () => {
          [details.starting_km_photo_url, details.ending_km_photo_url] = await Promise.all([
            signUrl(details.starting_km_photo_url),
            signUrl(details.ending_km_photo_url),
          ]);
        })(),
      ]);
      break;
    case 'INVENTORY':
      [details.waybill_photo_url, details.undertaking_photo_url] = await Promise.all([
        signUrl(details.waybill_photo_url),
        signUrl(details.undertaking_photo_url),
      ]);
      break;
    case 'UNDERTAKING':
      // Phase 32 — same two photo slots as INVENTORY (read through linked GRN
      // by the builder, so we sign them here identically).
      [details.waybill_photo_url, details.undertaking_photo_url] = await Promise.all([
        signUrl(details.waybill_photo_url),
        signUrl(details.undertaking_photo_url),
      ]);
      break;
    case 'PRF_CALF':
      details.photo_urls = await signUrls(details.photo_urls);
      break;
    case 'CREDIT_NOTE':
      details.photo_urls = await signUrls(details.photo_urls);
      break;
    case 'IC_TRANSFER':
      if (details.kind === 'IC_SETTLEMENT') {
        [details.deposit_slip_url, details.cr_photo_url] = await Promise.all([
          signUrl(details.deposit_slip_url),
          signUrl(details.cr_photo_url),
        ]);
      } else {
        details.waybill_photo_url = await signUrl(details.waybill_photo_url);
      }
      break;
    case 'PETTY_CASH':
      details.or_photo_url = await signUrl(details.or_photo_url);
      break;
    // JOURNAL / BANKING / PURCHASING / PAYROLL / INCOME / SMER / KPI — no S3 URLs
  }
}

/* ────────────────────────────────────────────────────────────────────────────
 * Main entry — hydrate one document for the Reversal Console's expanded row.
 *
 * Returns `{ doc, details, module, doc_ref, status }` or throws:
 *   - 404 if the doc is not in the caller's tenant scope
 *   - 409 if the doc is already reversed (deletion_event_id set)
 *
 * If no POPULATED_LOADERS entry exists for the doc_type, returns `null` so the
 * caller can fall back to the raw reversal-handler load (graceful degradation).
 * ────────────────────────────────────────────────────────────────────────── */

async function hydrateReversalDetail(docType, docId, tenantFilter = {}) {
  const loader = POPULATED_LOADERS[docType];
  if (!loader) return null;

  const doc = await loader(docId, tenantFilter);
  if (!doc) {
    const err = new Error(`${docType} not found in your scope`);
    err.statusCode = 404;
    throw err;
  }
  if (doc.deletion_event_id) {
    const err = new Error(`${docType} already reversed`);
    err.statusCode = 409;
    throw err;
  }

  const moduleKey = REVERSAL_DOC_TYPE_TO_MODULE[docType] || docType;
  const details = buildDocumentDetails(moduleKey, doc) || {};

  await enrichLineItems(details);
  await signPhotoUrls(details, moduleKey);

  return {
    doc,
    details,
    module: moduleKey,
    doc_ref: doc.doc_ref || doc.cr_no || doc.calf_number || doc.prf_number
      || doc.transfer_ref || doc.je_number || doc.invoice_number
      || doc.txn_number || String(doc._id),
    status: doc.status,
  };
}

module.exports = {
  hydrateReversalDetail,
  // Exported for unit tests / future Approval Hub consolidation.
  enrichLineItems,
  signPhotoUrls,
};
