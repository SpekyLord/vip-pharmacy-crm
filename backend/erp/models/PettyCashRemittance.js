/**
 * PettyCashRemittance Model — Remittance/Replenishment batch documents
 *
 * Phase 19:
 * REMITTANCE — eBDM sends excess cash to owner (when balance > ceiling)
 * REPLENISHMENT — owner puts money back into fund
 *
 * Both generate printable forms requiring signatures.
 * JE: REMITTANCE = DR 3100 Owner Drawings / CR 1015 Petty Cash
 *     REPLENISHMENT = DR 1015 Petty Cash / CR 3100 Owner Drawings
 */
const mongoose = require('mongoose');

const pettyCashRemittanceSchema = new mongoose.Schema({
  entity_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Entity', required: true },
  fund_id: { type: mongoose.Schema.Types.ObjectId, ref: 'PettyCashFund', required: true },
  doc_type: {
    type: String,
    enum: ['REMITTANCE', 'REPLENISHMENT'],
    required: true
  },
  doc_number: { type: String, trim: true },
  doc_date: { type: Date, required: true },
  amount: { type: Number, required: true, min: 0 },
  custodian_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  // Linked transactions covered by this batch
  transaction_ids: [{ type: mongoose.Schema.Types.ObjectId, ref: 'PettyCashTransaction' }],

  // Signatures
  custodian_signed: { type: Boolean, default: false },
  custodian_signed_at: { type: Date },
  custodian_signed_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  owner_signed: { type: Boolean, default: false },
  owner_signed_at: { type: Date },
  owner_signed_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  // Posted JE reference
  je_id: { type: mongoose.Schema.Types.ObjectId, ref: 'JournalEntry' },

  // Processing
  processed_at: { type: Date },
  processed_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  // Status
  status: {
    type: String,
    enum: ['PENDING', 'SIGNED', 'APPROVED', 'PROCESSED'],
    default: 'PENDING'
  },
  notes: { type: String, trim: true },

  created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  created_at: { type: Date, default: Date.now, immutable: true }
}, { timestamps: false, collection: 'erp_petty_cash_remittances' });

// Pre-save: auto-generate doc_number
pettyCashRemittanceSchema.pre('save', async function () {
  if (this.isNew && !this.doc_number) {
    const { generateDocNumber } = require('../services/docNumbering');
    const prefix = this.doc_type === 'REMITTANCE' ? 'REM' : 'RPL';
    this.doc_number = await generateDocNumber({
      prefix,
      bdmId: this.custodian_id,
      date: this.doc_date || new Date()
    });
  }
});

pettyCashRemittanceSchema.index({ fund_id: 1, status: 1 });
pettyCashRemittanceSchema.index({ entity_id: 1, doc_date: -1 });

module.exports = mongoose.model('PettyCashRemittance', pettyCashRemittanceSchema);
