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
  // Day-4.5 #4 (2026-04-25): flipped to required:true. Both write paths
  // (collectionController.js:586 + :975) inherit bdm_id from a Collection,
  // and Collection.bdm_id is itself required. cwtService.createCwtEntry is
  // the only writer. Hardening here makes the schema match the runtime
  // bdmGuard's expectation.
  bdm_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
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
