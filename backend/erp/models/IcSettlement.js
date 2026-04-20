/**
 * IC Settlement Model — subsidiary pays parent for IC Transfers
 *
 * VIP issues CSI (IC Transfer) → MG issues CR (IC Settlement) to VIP.
 * Simpler than hospital Collection: no commission, no partner rebate, no MD tagging.
 * CWT applies based on debtor entity VAT registration status.
 */
const mongoose = require('mongoose');

const settledTransferSchema = new mongoose.Schema({
  transfer_id: { type: mongoose.Schema.Types.ObjectId, ref: 'InterCompanyTransfer', required: true },
  transfer_ref: { type: String, required: true },
  vip_csi_ref: { type: String }, // VIP's CSI number (may differ from transfer_ref)
  transfer_amount: { type: Number, required: true, min: 0 },
  amount_settled: { type: Number, required: true, min: 0 }
}, { _id: false });

const icSettlementSchema = new mongoose.Schema({
  creditor_entity_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Entity', required: true },
  debtor_entity_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Entity', required: true },
  settled_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  cr_no: { type: String, required: true, trim: true },
  cr_date: { type: Date, required: true },
  cr_amount: { type: Number, required: true, min: 0 },

  settled_transfers: { type: [settledTransferSchema], default: [] },

  // Auto-computed
  total_transfer_amount: { type: Number, default: 0 },
  total_settled: { type: Number, default: 0 },

  // CWT (depends on debtor entity VAT status)
  cwt_rate: { type: Number, default: 0 },
  cwt_amount: { type: Number, default: 0 },
  cwt_na: { type: Boolean, default: false },

  // Payment
  payment_mode: { type: String, default: 'CHECK' }, // Validated against PaymentMode lookup
  check_no: { type: String, trim: true },
  check_date: { type: Date },
  bank: { type: String, trim: true },
  deposit_slip_url: { type: String },

  // Proof
  cr_photo_url: { type: String },

  // Lifecycle
  status: { type: String, enum: ['DRAFT', 'POSTED', 'REJECTED'], default: 'DRAFT' },
  posted_at: { type: Date },
  posted_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  event_id: { type: mongoose.Schema.Types.ObjectId, ref: 'TransactionEvent' },
  deletion_event_id: { type: mongoose.Schema.Types.ObjectId, ref: 'TransactionEvent' },

  // Rejection (Phase G6)
  rejection_reason: { type: String, trim: true, default: '' },
  rejected_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  rejected_at: { type: Date },

  created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', immutable: true },
  created_at: { type: Date, default: Date.now, immutable: true }
}, {
  timestamps: true,
  collection: 'erp_ic_settlements'
});

// Pre-save: auto-compute totals
icSettlementSchema.pre('save', function () {
  if (this.settled_transfers?.length) {
    this.total_transfer_amount = this.settled_transfers.reduce((s, t) => s + (t.transfer_amount || 0), 0);
    this.total_settled = this.settled_transfers.reduce((s, t) => s + (t.amount_settled || 0), 0);
  }
});

// Indexes
icSettlementSchema.index({ creditor_entity_id: 1, debtor_entity_id: 1, status: 1 });
icSettlementSchema.index({ debtor_entity_id: 1, cr_date: -1 });

module.exports = mongoose.model('IcSettlement', icSettlementSchema);
