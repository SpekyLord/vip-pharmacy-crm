const mongoose = require('mongoose');

const bankStatementEntrySchema = new mongoose.Schema({
  line_no:      { type: Number },
  txn_date:     { type: Date },
  description:  { type: String, trim: true },
  reference:    { type: String, trim: true },
  debit:        { type: Number, default: 0 },
  credit:       { type: Number, default: 0 },
  balance:      { type: Number },
  match_status: { type: String, enum: ['UNMATCHED', 'MATCHED', 'RECONCILING_ITEM'], default: 'UNMATCHED' },
  je_id:        { type: mongoose.Schema.Types.ObjectId, ref: 'JournalEntry' }
}, { _id: false });

const bankStatementSchema = new mongoose.Schema({
  entity_id:       { type: mongoose.Schema.Types.ObjectId, ref: 'Entity', required: true },
  bank_account_id: { type: mongoose.Schema.Types.ObjectId, ref: 'BankAccount', required: true },
  statement_date:  { type: Date, required: true },
  period:          { type: String, required: true },           // "YYYY-MM"
  entries:         [bankStatementEntrySchema],
  closing_balance: { type: Number, default: 0 },
  status:          { type: String, enum: ['DRAFT', 'IN_PROGRESS', 'FINALIZED'], default: 'DRAFT' },
  uploaded_at:     { type: Date },
  uploaded_by:     { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true, collection: 'erp_bank_statements' });

bankStatementSchema.index({ entity_id: 1, bank_account_id: 1, period: 1 }, { unique: true });
bankStatementSchema.index({ entity_id: 1, status: 1 });

module.exports = mongoose.model('BankStatement', bankStatementSchema);
