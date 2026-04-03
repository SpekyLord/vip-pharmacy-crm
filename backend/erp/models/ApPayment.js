/**
 * ApPayment Model — Phase 12.5
 *
 * Tracks payments against supplier invoices.
 * COA resolved at runtime via resolveFundingCoa() — no hardcoded COA codes.
 * Links to auto-posted JournalEntry via je_id.
 */
const mongoose = require('mongoose');

const apPaymentSchema = new mongoose.Schema({
  entity_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Entity', required: true },
  supplier_invoice_id: { type: mongoose.Schema.Types.ObjectId, ref: 'SupplierInvoice', required: true },
  vendor_id: { type: mongoose.Schema.Types.ObjectId, ref: 'VendorMaster', required: true },
  payment_date: { type: Date, required: [true, 'Payment date is required'] },
  amount: { type: Number, required: [true, 'Payment amount is required'], min: 0.01 },
  payment_mode: { type: String, trim: true },
  check_no: { type: String, trim: true },
  check_date: { type: Date },
  bank_account_id: { type: mongoose.Schema.Types.ObjectId, ref: 'BankAccount' },
  funding_card_id: { type: mongoose.Schema.Types.ObjectId, ref: 'CreditCard' },
  reference: { type: String, trim: true },
  je_id: { type: mongoose.Schema.Types.ObjectId, ref: 'JournalEntry' },
  notes: { type: String, trim: true },
  created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  created_at: { type: Date, default: Date.now, immutable: true }
}, {
  timestamps: false,
  collection: 'erp_ap_payments'
});

apPaymentSchema.index({ entity_id: 1, vendor_id: 1 });
apPaymentSchema.index({ supplier_invoice_id: 1 });
apPaymentSchema.index({ payment_date: -1 });

module.exports = mongoose.model('ApPayment', apPaymentSchema);
