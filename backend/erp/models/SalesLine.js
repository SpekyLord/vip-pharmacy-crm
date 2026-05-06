const mongoose = require('mongoose');
const { cleanBatchNo, normalizeUnit, normalizeDocRef } = require('../utils/normalize');

const lineItemSchema = new mongoose.Schema({
  product_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ProductMaster',
    required: true
  },
  item_key: { type: String },
  batch_lot_no: { type: String, trim: true },
  qty: { type: Number, required: true, min: 1 },
  unit: { type: String, trim: true },
  unit_price: { type: Number, required: true },
  // Phase R2 — Sales Discount. BDM-entered per-line discount percentage
  // (0-100). Applied as a trade discount on the face of the invoice, BIR-
  // standard treatment per RR 16-2005: VAT base shrinks to the discounted
  // amount. NET METHOD — SALES_REVENUE is booked at the discounted amount,
  // no contra account. Backwards-compat: missing/null defaults to 0.
  line_discount_percent: { type: Number, default: 0, min: 0, max: 100 },
  // Computed in pre-save: qty * unit_price * (line_discount_percent / 100).
  // Stored for audit + report use; never trust client-supplied value.
  line_discount_amount: { type: Number, default: 0 },
  // Computed in pre-save: qty * unit_price (gross BEFORE discount, VAT-
  // inclusive). Useful for reporting "list price vs realized" without
  // re-deriving on every read.
  line_gross_amount: { type: Number, default: 0 },
  line_total: { type: Number },
  vat_amount: { type: Number },
  net_of_vat: { type: Number },
  fifo_override: { type: Boolean, default: false },
  override_reason: {
    type: String
  }, // Lookup: OVERRIDE_REASON
  // Phase CSI-X1 — link this CSI line to a HospitalPOLine. When set, posting
  // the parent CSI auto-increments HospitalPOLine.qty_served by item.qty
  // and recomputes parent HospitalPO.status. Optional — direct (non-PO) sales
  // continue to work unchanged.
  po_line_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'HospitalPOLine',
    default: null
  }
}, { _id: true });

const salesLineSchema = new mongoose.Schema({
  entity_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Entity',
    required: true
  },
  bdm_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  warehouse_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse' }, // Phase 17 — stock source warehouse
  event_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TransactionEvent'
  },
  source: {
    type: String,
    default: 'SALES_LINE'
  }, // Lookup: SALE_SOURCE
  // Phase 18: sale_type determines document flow and validation rules
  sale_type: {
    type: String,
    default: 'CSI'
  }, // Lookup: SALE_TYPE
  hospital_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Hospital'
    // No longer unconditionally required — CSI to hospitals requires it, others use customer_id
  },
  customer_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer'
    // Phase 18: for non-hospital customers (PERSON, PHARMACY, INDUSTRIAL, etc.)
  },
  csi_date: {
    type: Date,
    required: [true, 'Invoice date is required']
  },
  doc_ref: {
    type: String,
    trim: true
    // Canonicalization happens in pre('save') where `this.sale_type` is
    // available — CSI gets aggressive digits-only normalization (so
    // "4852" / "004852" / "CSI 004852" / "INV 004852" collapse to the
    // same canonical value), while CASH_RECEIPT / SERVICE_INVOICE keep
    // their auto-generated "RCT-ILO040326-001" format intact.
    // Required for CSI (booklet number), auto-generated for SERVICE_INVOICE/CASH_RECEIPT.
  },
  // Phase 18: system-generated invoice number for non-CSI sales
  invoice_number: { type: String, trim: true },
  // Phase 18: payment mode for non-CSI sales
  payment_mode: { type: String }, // Validated against PaymentMode lookup
  // Phase 18: service description (SERVICE_INVOICE only — FNB, rental, consulting)
  service_description: { type: String, trim: true },
  // Phase 15.3: optional PO# written on the physical CSI booklet (overlay draft source).
  // Not system-generated; captured at entry when the customer provided a PO reference.
  po_number: { type: String, trim: true },
  // Phase CSI-X1: link to the HospitalPO this CSI fulfills (full or partial).
  // When set, the per-line `po_line_id` on each line_items entry decrements
  // the corresponding HospitalPOLine.qty_served on POST. Denormalizing the
  // header link enables fast "all CSIs for this PO" queries on the PO detail page.
  po_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'HospitalPO',
    default: null
  },
  // Direct petty cash routing for CASH_RECEIPT/SERVICE_INVOICE with cash payment
  // When set, sale bypasses AR and deposits directly to the fund
  petty_cash_fund_id: { type: mongoose.Schema.Types.ObjectId, ref: 'PettyCashFund' },

  // CSI photo captured at entry time. For live Sales (source=SALES_LINE) this
  // is the OCR-source image — data-entry assist, optional audit crumb. For
  // historical Opening AR (source=OPENING_AR) this is the signed CSI itself,
  // since delivery already happened before the row was keyed.
  csi_photo_url: { type: String },
  csi_attachment_id: { type: String },

  // Received CSI photo — the signed/stamped pink/yellow/duplicate copy the
  // hospital returns after delivery acknowledgment. Captured post-posting via
  // "Attach Received CSI" on SalesList. Drives dunning-readiness and AR
  // aging reports; never gates Validate/Submit for live Sales.
  // For OPENING_AR, validateSales accepts either csi_photo_url OR this field
  // as "any proof" when REQUIRE_CSI_PHOTO_OPENING_AR is on.
  csi_received_photo_url: { type: String },
  csi_received_attachment_id: { type: String },
  csi_received_at: { type: Date },

  line_items: [lineItemSchema],

  invoice_total: { type: Number, default: 0 },
  total_vat: { type: Number, default: 0 },
  total_net_of_vat: { type: Number, default: 0 },
  // Phase R2 — Sales Discount. Sum of all line_items[].line_discount_amount.
  // Computed in pre-save. VAT-inclusive (matches the units of line_gross_amount
  // and invoice_total: gross_before_discount = invoice_total + total_discount).
  total_discount: { type: Number, default: 0 },
  // Sum of line_gross_amount (qty × unit_price, before any discount). Used by
  // CSI overlay totals block and salesReceipt print template to show "Total
  // Sales (VAT Inclusive) → Less: Discount → Net" without recomputing.
  total_gross_before_discount: { type: Number, default: 0 },

  // Phase A.4 — AR sub-ledger materialized fields.
  // outstanding_amount = invoice_total − Σ Collection.settled_csis hits − Σ CWT
  // applied to this CSI (CWT closes AR via journalFromCWT). Maintained by
  // services/arAgingService.recomputeOutstandingForSale() on Collection POST/
  // void/reopen — never set client-side. AR aging report reads this directly
  // (O(1) instead of joining Collection per row).
  // Initial value: invoice_total at the time the SalesLine first POSTs.
  // Migration: backend/erp/scripts/migrateSalesLineOutstanding.js backfills
  // all existing POSTED rows.
  outstanding_amount: { type: Number, default: null },
  paid_amount: { type: Number, default: 0 },
  last_payment_at: { type: Date, default: null },

  // Phase A.4 — JE-asymmetry capture. Tracks whether the autoJournal write
  // succeeded when this row POSTed. POSTED docs with je_status='FAILED' are
  // the precise class the orphan-ledger audit was built to catch — but with
  // this field, the orphan agent's job is reduced from "scan everything" to
  // "list FAILED rows." Period-close blocks if any FAILED rows are in scope.
  // Backwards-compat: legacy rows ship with je_status=null and are treated
  // as POSTED-with-JE by the integrity sweep (verified via JournalEntry sweep).
  je_status: {
    type: String,
    enum: ['PENDING', 'POSTED', 'FAILED', null],
    default: null,
  },
  je_failure_reason: { type: String, default: null },
  je_attempts: { type: Number, default: 0 },
  last_je_attempt_at: { type: Date, default: null },

  status: {
    type: String,
    enum: ['DRAFT', 'VALID', 'ERROR', 'POSTED', 'DELETION_REQUESTED'],
    default: 'DRAFT'
  },
  posted_at: { type: Date },
  posted_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  reopen_count: { type: Number, default: 0 },
  validation_errors: [{ type: String }],
  // Informational-only notices that never block posting (e.g. CSI # not in any
  // allocation, CSI # voided, etc.). Surfaced as yellow chips in the UI.
  validation_warnings: [{ type: String }],
  rejection_reason: { type: String },
  // Phase 15.5: Cost Center dimension
  cost_center_id: { type: mongoose.Schema.Types.ObjectId, ref: 'CostCenter' },

  deletion_event_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TransactionEvent'
  },

  created_at: {
    type: Date,
    immutable: true,
    default: Date.now
  },
  created_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  // Phase G4.5a — Proxy Entry. Present when the caller (created_by) keyed the
  // row on behalf of another BDM. Value = the proxy's User._id. bdm_id is the
  // owner (assigned_to). Absence means self-entry. See resolveOwnerScope.js.
  recorded_on_behalf_of: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: undefined
  },
  edit_history: [{ type: mongoose.Schema.Types.Mixed }]
}, {
  timestamps: true,
  collection: 'erp_sales_lines'
});

// Pre-save: validate customer reference + normalize line items + auto-compute totals
salesLineSchema.pre('save', async function () {
  // Canonicalize doc_ref first — must happen before the CSI required-field
  // check so that a user typing only "CSI" (with no digits) collapses to an
  // empty string and fails cleanly. For CSI, aggressive digits-only stripping
  // ensures "4852", "004852", "CSI 004852", "INV 004852" all land on the
  // same canonical value. For non-CSI (CASH_RECEIPT / SERVICE_INVOICE), the
  // normalizer is a no-op so auto-generated formats like "RCT-ILO040326-001"
  // stay intact.
  if (this.doc_ref) {
    this.doc_ref = normalizeDocRef(this.doc_ref, this.sale_type);
  }

  // Phase 18: at least one customer reference required
  if (!this.hospital_id && !this.customer_id) {
    throw new Error('Either hospital_id or customer_id is required');
  }
  // CSI requires doc_ref (booklet number)
  if (this.sale_type === 'CSI' && !this.doc_ref) {
    throw new Error('Document reference (CSI#) is required for CSI sales');
  }
  // VAT rate from Settings (cached 5min), fallback to PH default
  const Settings = require('./Settings');
  const VAT_RATE = await Settings.getVatRate();

  // SERVICE_INVOICE: preserve user-entered invoice_total (no line items to compute from)
  if (this.sale_type === 'SERVICE_INVOICE') {
    const gross = this.invoice_total || 0;
    if (gross > 0 && (!this.total_vat || this.isModified('invoice_total'))) {
      this.total_vat = Math.round(gross * (VAT_RATE / (1 + VAT_RATE)) * 100) / 100;
      this.total_net_of_vat = Math.round((gross - this.total_vat) * 100) / 100;
    }
    return;
  }

  let invoiceTotal = 0;
  let totalVat = 0;
  let totalNetOfVat = 0;
  let totalDiscount = 0;
  let totalGrossBeforeDiscount = 0;

  for (const item of this.line_items) {
    // Normalize batch and unit
    if (item.batch_lot_no) {
      item.batch_lot_no = cleanBatchNo(item.batch_lot_no);
    }
    if (item.unit) {
      item.unit = normalizeUnit(item.unit);
    }

    // Phase R2 — Sales Discount. BIR-standard trade-discount-on-face-of-invoice.
    // VAT base shrinks to the discounted amount (RR 16-2005). Net method — no
    // contra account; SALES_REVENUE is booked at the discounted figure.
    //
    //   gross_before_discount  = qty × unit_price                       (VAT-inclusive)
    //   line_discount_amount   = gross × (discount_pct / 100)           (VAT-inclusive)
    //   line_total             = gross - discount                       (VAT-inclusive, after discount)
    //   vat_amount             = line_total × VAT_RATE / (1 + VAT_RATE) (VAT on shrunk base)
    //   net_of_vat             = line_total - vat_amount                (post-discount net)
    //
    // Clamp discount_pct to [0, 100] defensively — schema validators run before
    // this hook but a hand-crafted save() bypassing validation could slip through.
    const discountPct = Math.max(0, Math.min(100, Number(item.line_discount_percent) || 0));
    item.line_discount_percent = discountPct;

    const gross = item.qty * item.unit_price;
    item.line_gross_amount = Math.round(gross * 100) / 100;
    item.line_discount_amount = Math.round(gross * (discountPct / 100) * 100) / 100;
    item.line_total = Math.round((gross - item.line_discount_amount) * 100) / 100;

    // VAT computation (assume VATABLE unless product says otherwise)
    // The controller should set vat_amount explicitly for EXEMPT/ZERO products.
    // VAT is computed on the post-discount line_total — discount reduces VAT.
    if (item.vat_amount === undefined || item.vat_amount === null) {
      item.vat_amount = item.line_total / (1 + VAT_RATE) * VAT_RATE;
    }
    item.net_of_vat = item.line_total - item.vat_amount;

    invoiceTotal += item.line_total;
    totalVat += item.vat_amount;
    totalNetOfVat += item.net_of_vat;
    totalDiscount += item.line_discount_amount;
    totalGrossBeforeDiscount += item.line_gross_amount;
  }

  this.invoice_total = Math.round(invoiceTotal * 100) / 100;
  this.total_vat = Math.round(totalVat * 100) / 100;
  this.total_net_of_vat = Math.round(totalNetOfVat * 100) / 100;
  this.total_discount = Math.round(totalDiscount * 100) / 100;
  this.total_gross_before_discount = Math.round(totalGrossBeforeDiscount * 100) / 100;

  // Phase A.4 — initialize outstanding_amount on first POST. arAgingService
  // owns subsequent maintenance on Collection POST/void/reopen — DO NOT
  // recompute here on every save (would clobber paid_amount accumulated by
  // the recompute hook). Only seed on first transition to POSTED.
  if (this.status === 'POSTED' && this.outstanding_amount === null) {
    this.outstanding_amount = this.invoice_total;
    this.paid_amount = 0;
  }
});

// Indexes
salesLineSchema.index({ entity_id: 1, bdm_id: 1, status: 1 });
salesLineSchema.index({ entity_id: 1, bdm_id: 1, csi_date: -1 });
salesLineSchema.index({ entity_id: 1, doc_ref: 1, hospital_id: 1 });
salesLineSchema.index({ status: 1 });
salesLineSchema.index({ entity_id: 1, sale_type: 1, status: 1 });
salesLineSchema.index({ entity_id: 1, customer_id: 1, csi_date: -1 });
salesLineSchema.index({ petty_cash_fund_id: 1 });
// Covers validateSales duplicate-detection (scoped by entity + sale_type +
// SALE_SOURCE bucket + doc_ref). Prevents COLLSCAN on high-volume entities.
salesLineSchema.index({ entity_id: 1, sale_type: 1, source: 1, doc_ref: 1 });
// Phase A.4 — partial index for AR aging surface (open invoices only). Skipping
// fully-paid + closed rows keeps the index tiny on a long-tail Sale collection.
salesLineSchema.index(
  { entity_id: 1, csi_date: 1 },
  { partialFilterExpression: { outstanding_amount: { $gt: 0 }, status: 'POSTED' }, name: 'ar_aging_open' }
);
// Phase A.4 — list-page badge filter for FAILED JE rows. Sparse so legacy
// rows with je_status=null don't bloat the index.
salesLineSchema.index(
  { entity_id: 1, je_status: 1, status: 1 },
  { sparse: true, name: 'je_status_failed' }
);

module.exports = mongoose.model('SalesLine', salesLineSchema);
