/**
 * PettyCashFund Model — Revolving petty cash fund
 *
 * Phase 19 — Petty Cash, Office Supplies & Collaterals
 * Fund receives cash deposits (from collections), pays small expenses (disbursements).
 * When balance > balance_ceiling (default ₱5,000), eBDM must remit excess to owner.
 * Owner can replenish the fund.
 */
const mongoose = require('mongoose');

const pettyCashFundSchema = new mongoose.Schema({
  entity_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Entity', required: true },
  fund_name: { type: String, required: true, trim: true },
  fund_code: { type: String, required: true, trim: true, uppercase: true },
  custodian_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Custodian (eBDM) is required']
  },
  warehouse_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse' },
  // Fund mode: controls what transactions are allowed
  // REVOLVING = deposits + disbursements (full petty cash)
  // EXPENSE_ONLY = disbursements only (small expenses fund, no deposits from sales)
  // DEPOSIT_ONLY = deposits only (collection point, no expenses paid out)
  fund_mode: {
    type: String,
    enum: ['REVOLVING', 'EXPENSE_ONLY', 'DEPOSIT_ONLY'],
    default: 'REVOLVING'
  },
  coa_code: { type: String, trim: true, default: '1000' },  // Cash on Hand (default for petty cash)
  authorized_amount: { type: Number, default: 10000 },
  current_balance: { type: Number, default: 0 },
  balance_ceiling: { type: Number, default: 5000 },
  status: {
    type: String,
    enum: ['ACTIVE', 'SUSPENDED', 'CLOSED'],
    default: 'ACTIVE'
  },
  created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  created_at: { type: Date, default: Date.now, immutable: true }
}, { timestamps: true, collection: 'erp_petty_cash_funds' });

pettyCashFundSchema.index({ entity_id: 1, fund_code: 1 }, { unique: true });
pettyCashFundSchema.index({ custodian_id: 1 });
pettyCashFundSchema.index({ entity_id: 1, status: 1 });

module.exports = mongoose.model('PettyCashFund', pettyCashFundSchema);
