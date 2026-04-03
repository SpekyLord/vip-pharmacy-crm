/**
 * CashflowStatement Model — persisted snapshot per period
 *
 * Sections: Operating, Investing, Financing
 * Net change + opening cash + closing cash
 */
const mongoose = require('mongoose');

const cashflowLineSchema = new mongoose.Schema({
  label: { type: String, required: true },
  amount: { type: Number, default: 0 },
  source_module: { type: String }
}, { _id: false });

const cashflowStatementSchema = new mongoose.Schema({
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
  operating: {
    lines: [cashflowLineSchema],
    total: { type: Number, default: 0 }
  },
  investing: {
    lines: [cashflowLineSchema],
    total: { type: Number, default: 0 }
  },
  financing: {
    lines: [cashflowLineSchema],
    total: { type: Number, default: 0 }
  },
  net_change: { type: Number, default: 0 },
  opening_cash: { type: Number, default: 0 },
  closing_cash: { type: Number, default: 0 },
  generated_at: { type: Date, default: Date.now },
  generated_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, {
  timestamps: true,
  collection: 'erp_cashflow_statements'
});

cashflowStatementSchema.index({ entity_id: 1, period: 1 }, { unique: true });

module.exports = mongoose.model('CashflowStatement', cashflowStatementSchema);
