/**
 * CwtLedger Model — Creditable Withholding Tax tracking for BIR 2307
 *
 * Each entry records a CWT certificate received from a hospital.
 * Aggregated per hospital per quarter for 2307 summary filing.
 */
const mongoose = require('mongoose');

const cwtLedgerSchema = new mongoose.Schema({
  entity_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Entity',
    required: true
  },
  bdm_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  period: {
    type: String,
    required: true,
    trim: true
  },
  hospital_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Hospital'
  },
  hospital_tin: { type: String, trim: true },
  cr_no: { type: String, trim: true },
  cr_date: { type: Date },
  cr_amount: { type: Number, default: 0 },
  cwt_rate: { type: Number, default: 0.02 },
  cwt_amount: { type: Number, default: 0 },
  atc_code: { type: String, trim: true },
  quarter: {
    type: String,
    enum: ['Q1', 'Q2', 'Q3', 'Q4'],
    required: true
  },
  year: {
    type: Number,
    required: true
  },
  created_at: {
    type: Date,
    immutable: true,
    default: Date.now
  }
}, {
  timestamps: false,
  collection: 'erp_cwt_ledger'
});

cwtLedgerSchema.index({ entity_id: 1, period: 1 });
cwtLedgerSchema.index({ entity_id: 1, quarter: 1, year: 1 });
cwtLedgerSchema.index({ entity_id: 1, hospital_id: 1 });

module.exports = mongoose.model('CwtLedger', cwtLedgerSchema);
