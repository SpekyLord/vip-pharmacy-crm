/**
 * SupplierInvoice Model — Phase 12.3
 *
 * Vendor invoices with 3-way matching (PO → GRN → Invoice).
 * Denormalized vendor_name + po_number for journalFromAP() descriptions.
 * Pre-save computes line totals and header totals (12% PH VAT).
 */
const mongoose = require('mongoose');

const siLineItemSchema = new mongoose.Schema({
  product_id: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductMaster' },
  item_key: { type: String, trim: true, required: [true, 'Item description is required'] },
  qty_invoiced: { type: Number, required: [true, 'Quantity invoiced is required'], min: 1 },
  unit_price: { type: Number, required: [true, 'Unit price is required'], min: 0 },
  line_total: { type: Number, default: 0 },
  po_line_matched: { type: Boolean, default: false },
  grn_line_matched: { type: Boolean, default: false }
}, { _id: false });

const supplierInvoiceSchema = new mongoose.Schema({
  entity_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Entity', required: true },
  vendor_id: { type: mongoose.Schema.Types.ObjectId, ref: 'VendorMaster', required: [true, 'Vendor is required'] },
  vendor_name: { type: String, trim: true },
  invoice_ref: { type: String, required: [true, 'Invoice reference is required'], trim: true },
  invoice_date: { type: Date, required: [true, 'Invoice date is required'] },
  due_date: { type: Date },
  po_id: { type: mongoose.Schema.Types.ObjectId, ref: 'PurchaseOrder' },
  po_number: { type: String, trim: true },
  grn_id: { type: mongoose.Schema.Types.ObjectId, ref: 'GrnEntry' },
  line_items: {
    type: [siLineItemSchema],
    validate: [arr => arr.length > 0, 'At least one line item is required']
  },
  total_amount: { type: Number, default: 0 },
  vat_amount: { type: Number, default: 0 },
  net_amount: { type: Number, default: 0 },
  input_vat: { type: Number, default: 0 },
  match_status: {
    type: String,
    enum: ['UNMATCHED', 'PARTIAL_MATCH', 'FULL_MATCH', 'DISCREPANCY'],
    default: 'UNMATCHED'
  },
  payment_status: {
    type: String,
    enum: ['UNPAID', 'PARTIAL', 'PAID'],
    default: 'UNPAID'
  },
  status: {
    type: String,
    enum: ['DRAFT', 'VALIDATED', 'POSTED'],
    default: 'DRAFT'
  },
  amount_paid: { type: Number, default: 0 },
  event_id: { type: mongoose.Schema.Types.ObjectId, ref: 'TransactionEvent' },
  created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  created_at: { type: Date, default: Date.now, immutable: true }
}, {
  timestamps: false,
  collection: 'erp_supplier_invoices'
});

// Pre-save: compute line totals and header totals
supplierInvoiceSchema.pre('save', async function () {
  let total = 0;
  for (const item of this.line_items) {
    item.line_total = Math.round((item.qty_invoiced * item.unit_price) * 100) / 100;
    total += item.line_total;
  }
  const Settings = require('./Settings');
  const vatRate = await Settings.getVatRate();
  this.total_amount = Math.round(total * 100) / 100;
  this.net_amount = Math.round((total / (1 + vatRate)) * 100) / 100;
  this.vat_amount = Math.round((total - this.net_amount) * 100) / 100;
  this.input_vat = this.vat_amount;
});

supplierInvoiceSchema.index({ entity_id: 1, status: 1 });
supplierInvoiceSchema.index({ entity_id: 1, vendor_id: 1, invoice_date: -1 });
supplierInvoiceSchema.index({ entity_id: 1, match_status: 1 });
supplierInvoiceSchema.index({ entity_id: 1, payment_status: 1 });
supplierInvoiceSchema.index({ po_id: 1 });

module.exports = mongoose.model('SupplierInvoice', supplierInvoiceSchema);
