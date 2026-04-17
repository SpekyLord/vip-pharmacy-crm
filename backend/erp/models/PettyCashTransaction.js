/**
 * PettyCashTransaction Model — Individual transactions on a petty cash fund
 *
 * Phase 19:
 * DEPOSIT — cash from collections deposited into fund
 * DISBURSEMENT — expense paid from fund
 * REMITTANCE — excess cash sent to owner (Owner's Drawing)
 * REPLENISHMENT — owner puts money back into fund
 * ADJUSTMENT — correction entry
 *
 * Lifecycle: DRAFT → VALID → ERROR → POSTED
 */
const mongoose = require('mongoose');

const pettyCashTransactionSchema = new mongoose.Schema({
  entity_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Entity', required: true },
  fund_id: { type: mongoose.Schema.Types.ObjectId, ref: 'PettyCashFund', required: true },
  txn_type: {
    type: String,
    required: true
  }, // Lookup: PETTY_CASH_TXN_TYPE
  txn_number: { type: String, trim: true },
  txn_date: { type: Date, required: true },
  amount: { type: Number, required: true, min: 0 },
  running_balance: { type: Number },

  // DEPOSIT fields
  source_description: { type: String, trim: true },
  linked_collection_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Collection' },
  linked_sales_line_id: { type: mongoose.Schema.Types.ObjectId, ref: 'SalesLine' },

  // DISBURSEMENT fields
  payee: { type: String, trim: true },
  particulars: { type: String, trim: true },
  expense_category: { type: String, trim: true },
  cost_center_id: { type: mongoose.Schema.Types.ObjectId, ref: 'CostCenter' },
  or_number: { type: String, trim: true },
  or_photo_url: { type: String },
  is_pcv: { type: Boolean, default: false },       // true = Petty Cash Voucher (no OR)
  pcv_remarks: { type: String, trim: true },        // required when is_pcv — describes purchase
  vat_amount: { type: Number, default: 0 },
  net_of_vat: { type: Number, default: 0 },

  // Link to remittance/replenishment document
  remittance_id: { type: mongoose.Schema.Types.ObjectId, ref: 'PettyCashRemittance' },

  // Approval
  approved_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  // Lifecycle
  status: {
    type: String,
    enum: ['DRAFT', 'VALID', 'ERROR', 'POSTED', 'VOIDED'],
    default: 'DRAFT'
  },
  posted_at: { type: Date },
  posted_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  validation_errors: [{ type: String }],
  event_id: { type: mongoose.Schema.Types.ObjectId, ref: 'TransactionEvent' },

  // Void fields
  voided_at: { type: Date },
  voided_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  void_reason: { type: String, trim: true },

  created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  created_at: { type: Date, default: Date.now, immutable: true }
}, { timestamps: false, collection: 'erp_petty_cash_transactions' });

// Pre-save: auto-generate txn_number + compute VAT
pettyCashTransactionSchema.pre('save', async function () {
  if (this.isNew && !this.txn_number) {
    const { generateDocNumber } = require('../services/docNumbering');
    this.txn_number = await generateDocNumber({
      prefix: 'PCF',
      bdmId: this.created_by,
      date: this.txn_date || new Date()
    });
  }

  // VAT computation for disbursements
  if (this.txn_type === 'DISBURSEMENT' && this.amount > 0) {
    const Settings = require('./Settings');
    const vatRate = await Settings.getVatRate();
    if (!this.vat_amount) {
      this.vat_amount = Math.round(this.amount * (vatRate / (1 + vatRate)) * 100) / 100;
    }
    this.net_of_vat = Math.round((this.amount - this.vat_amount) * 100) / 100;
  }
});

pettyCashTransactionSchema.index({ fund_id: 1, txn_date: -1 });
pettyCashTransactionSchema.index({ entity_id: 1, status: 1 });
pettyCashTransactionSchema.index({ fund_id: 1, txn_type: 1, status: 1 });
pettyCashTransactionSchema.index({ linked_collection_id: 1 });
pettyCashTransactionSchema.index({ linked_sales_line_id: 1 });

module.exports = mongoose.model('PettyCashTransaction', pettyCashTransactionSchema);
