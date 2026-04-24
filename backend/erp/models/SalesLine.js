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
  line_total: { type: Number },
  vat_amount: { type: Number },
  net_of_vat: { type: Number },
  fifo_override: { type: Boolean, default: false },
  override_reason: {
    type: String
  } // Lookup: OVERRIDE_REASON
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

  for (const item of this.line_items) {
    // Normalize batch and unit
    if (item.batch_lot_no) {
      item.batch_lot_no = cleanBatchNo(item.batch_lot_no);
    }
    if (item.unit) {
      item.unit = normalizeUnit(item.unit);
    }

    // Auto-compute line totals
    item.line_total = item.qty * item.unit_price;

    // VAT computation (assume VATABLE unless product says otherwise)
    // The controller should set vat_amount explicitly for EXEMPT/ZERO products
    if (item.vat_amount === undefined || item.vat_amount === null) {
      item.vat_amount = item.line_total / (1 + VAT_RATE) * VAT_RATE;
    }
    item.net_of_vat = item.line_total - item.vat_amount;

    invoiceTotal += item.line_total;
    totalVat += item.vat_amount;
    totalNetOfVat += item.net_of_vat;
  }

  this.invoice_total = Math.round(invoiceTotal * 100) / 100;
  this.total_vat = Math.round(totalVat * 100) / 100;
  this.total_net_of_vat = Math.round(totalNetOfVat * 100) / 100;
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

module.exports = mongoose.model('SalesLine', salesLineSchema);
