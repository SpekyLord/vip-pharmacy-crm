/**
 * OfficeSupplyTransaction Model — Movements for office supply items
 * Phase 19 — PURCHASE, ISSUE, RETURN, ADJUSTMENT
 */
const mongoose = require('mongoose');

const officeSupplyTransactionSchema = new mongoose.Schema({
  entity_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Entity', required: true },
  supply_id: { type: mongoose.Schema.Types.ObjectId, ref: 'OfficeSupply', required: true },
  txn_type: {
    type: String,
    enum: ['PURCHASE', 'ISSUE', 'RETURN', 'ADJUSTMENT'],
    required: true
  },
  txn_date: { type: Date, required: true, default: Date.now },
  qty: { type: Number, required: true },
  unit_cost: { type: Number, default: 0 },
  total_cost: { type: Number, default: 0 },
  issued_to: { type: String, trim: true },
  or_number: { type: String, trim: true },
  notes: { type: String, trim: true },
  cost_center_id: { type: mongoose.Schema.Types.ObjectId, ref: 'CostCenter' },
  created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  created_at: { type: Date, default: Date.now, immutable: true }
}, { timestamps: false, collection: 'erp_office_supply_transactions' });

// Pre-save: compute total_cost
officeSupplyTransactionSchema.pre('save', function (next) {
  this.total_cost = Math.round((this.qty || 0) * (this.unit_cost || 0) * 100) / 100;
  next();
});

officeSupplyTransactionSchema.index({ supply_id: 1, txn_date: -1 });
officeSupplyTransactionSchema.index({ entity_id: 1, txn_type: 1 });

module.exports = mongoose.model('OfficeSupplyTransaction', officeSupplyTransactionSchema);
