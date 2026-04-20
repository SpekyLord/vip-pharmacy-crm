/**
 * Credit Note / Return Model — Phase 25
 *
 * Handles product returns from hospitals/customers.
 * Lifecycle: DRAFT → VALID → POSTED (with inventory RETURN_IN + AR reversal)
 * Links to original SalesLine for traceability.
 */
const mongoose = require('mongoose');
const { cleanBatchNo } = require('../utils/normalize');

const returnLineSchema = new mongoose.Schema({
  product_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ProductMaster',
    required: true
  },
  item_key: { type: String },
  batch_lot_no: { type: String, trim: true, required: true },
  expiry_date: { type: Date },
  qty: { type: Number, required: true, min: 1 },
  unit: { type: String, trim: true },
  unit_price: { type: Number, required: true, min: 0 },
  line_total: { type: Number },
  return_reason: {
    type: String,
    required: true
  }, // Lookup: RETURN_REASON
  return_condition: {
    type: String,
    default: 'RESALEABLE'
  }, // Lookup: RETURN_CONDITION
  notes: { type: String, trim: true }
}, { _id: true });

const creditNoteSchema = new mongoose.Schema({
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
  warehouse_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse' },

  // Credit note number (auto-generated)
  cn_number: { type: String, trim: true },

  // Link to original sale
  original_sale_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SalesLine'
  },
  original_doc_ref: { type: String, trim: true },

  // Customer reference
  hospital_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' },
  customer_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },

  cn_date: { type: Date, required: true },

  line_items: [returnLineSchema],

  // Totals (auto-computed on save)
  credit_total: { type: Number, default: 0 },
  total_vat: { type: Number, default: 0 },
  total_net_of_vat: { type: Number, default: 0 },

  // Photo proof of returned goods
  photo_urls: [{ type: String }],

  // Workflow
  status: {
    type: String,
    enum: ['DRAFT', 'VALID', 'ERROR', 'POSTED'],
    default: 'DRAFT'
  },
  validation_errors: [{ type: String }],
  rejection_reason: { type: String, trim: true },
  posted_at: { type: Date },
  posted_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  // Journal + inventory event refs
  event_id: { type: mongoose.Schema.Types.ObjectId, ref: 'TransactionEvent' },
  deletion_event_id: { type: mongoose.Schema.Types.ObjectId, ref: 'TransactionEvent' },

  notes: { type: String, trim: true },

  created_at: { type: Date, immutable: true, default: Date.now },
  created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, {
  timestamps: true,
  collection: 'erp_credit_notes'
});

// Pre-save: compute totals, normalize batches
creditNoteSchema.pre('save', async function () {
  if (!this.hospital_id && !this.customer_id) {
    throw new Error('Either hospital_id or customer_id is required');
  }

  const Settings = require('./Settings');
  const VAT_RATE = await Settings.getVatRate();

  let creditTotal = 0;
  let totalVat = 0;
  let totalNetOfVat = 0;

  for (const item of this.line_items) {
    if (item.batch_lot_no) item.batch_lot_no = cleanBatchNo(item.batch_lot_no);
    item.line_total = item.qty * item.unit_price;
    const vatAmount = item.line_total / (1 + VAT_RATE) * VAT_RATE;
    creditTotal += item.line_total;
    totalVat += vatAmount;
    totalNetOfVat += item.line_total - vatAmount;
  }

  this.credit_total = Math.round(creditTotal * 100) / 100;
  this.total_vat = Math.round(totalVat * 100) / 100;
  this.total_net_of_vat = Math.round(totalNetOfVat * 100) / 100;
});

creditNoteSchema.index({ entity_id: 1, bdm_id: 1, status: 1 });
creditNoteSchema.index({ entity_id: 1, hospital_id: 1, cn_date: -1 });
creditNoteSchema.index({ entity_id: 1, customer_id: 1, cn_date: -1 });
creditNoteSchema.index({ original_sale_id: 1 });
creditNoteSchema.index({ status: 1 });

module.exports = mongoose.model('CreditNote', creditNoteSchema);
