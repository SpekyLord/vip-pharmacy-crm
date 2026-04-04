const mongoose = require('mongoose');
const { cleanBatchNo, normalizeUnit } = require('../utils/normalize');

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
    type: String,
    enum: ['HOSPITAL_POLICY', 'QA_REPLACEMENT', 'DAMAGED_BATCH', 'BATCH_RECALL']
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
  event_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TransactionEvent'
  },
  source: {
    type: String,
    enum: ['SALES_LINE', 'OPENING_AR'],
    default: 'SALES_LINE'
  },
  hospital_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Hospital',
    required: [true, 'Hospital is required']
  },
  csi_date: {
    type: Date,
    required: [true, 'CSI date is required']
  },
  doc_ref: {
    type: String,
    required: [true, 'Document reference (CSI#) is required'],
    trim: true
  },

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
  }
}, {
  timestamps: true,
  collection: 'erp_sales_lines'
});

// Pre-save: normalize line items + auto-compute totals
salesLineSchema.pre('save', function (next) {
  // Default VAT rate (Philippines 12%)
  const VAT_RATE = 0.12;

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

  next();
});

// Indexes
salesLineSchema.index({ entity_id: 1, bdm_id: 1, status: 1 });
salesLineSchema.index({ entity_id: 1, bdm_id: 1, csi_date: -1 });
salesLineSchema.index({ entity_id: 1, doc_ref: 1, hospital_id: 1 });
salesLineSchema.index({ status: 1 });

module.exports = mongoose.model('SalesLine', salesLineSchema);
