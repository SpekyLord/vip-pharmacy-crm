/**
 * VatLedger Model — VAT tracking for 2550Q compliance
 *
 * Each entry records either OUTPUT or INPUT VAT from source documents.
 * Finance tags entries as INCLUDE/EXCLUDE/DEFER for the VAT return.
 */
const mongoose = require('mongoose');

const vatLedgerSchema = new mongoose.Schema({
  entity_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Entity',
    required: true
  },
  period: {
    type: String,
    required: true,
    trim: true
  },
  vat_type: {
    type: String,
    enum: ['OUTPUT', 'INPUT'],
    required: true
  },
  source_module: {
    type: String,
    enum: ['COLLECTION', 'SUPPLIER_INVOICE', 'SALES', 'EXPENSE'],
    required: true
  },
  source_doc_ref: { type: String, trim: true },
  source_event_id: { type: mongoose.Schema.Types.ObjectId, ref: 'TransactionEvent' },
  hospital_or_vendor: { type: String, trim: true },
  tin: { type: String, trim: true },
  gross_amount: { type: Number, default: 0 },
  vat_amount: { type: Number, default: 0 },
  finance_tag: {
    type: String,
    enum: ['PENDING', 'INCLUDE', 'EXCLUDE', 'DEFER'],
    default: 'PENDING'
  },
  tagged_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  tagged_at: { type: Date },
  created_at: {
    type: Date,
    immutable: true,
    default: Date.now
  }
}, {
  timestamps: false,
  collection: 'erp_vat_ledger'
});

vatLedgerSchema.index({ entity_id: 1, period: 1, vat_type: 1 });
vatLedgerSchema.index({ entity_id: 1, finance_tag: 1 });
vatLedgerSchema.index({ source_event_id: 1 });

module.exports = mongoose.model('VatLedger', vatLedgerSchema);
