const mongoose = require('mongoose');

const creditCardTransactionSchema = new mongoose.Schema({
  entity_id:       { type: mongoose.Schema.Types.ObjectId, ref: 'Entity', required: true },
  credit_card_id:  { type: mongoose.Schema.Types.ObjectId, ref: 'CreditCard', required: true },
  txn_date:        { type: Date, required: true },
  description:     { type: String, required: true, trim: true },
  amount:          { type: Number, required: true, min: 0 },
  reference:       { type: String, trim: true },
  linked_expense_id: { type: mongoose.Schema.Types.ObjectId, ref: 'ExpenseEntry' },
  linked_calf_id:    { type: mongoose.Schema.Types.ObjectId, ref: 'PrfCalf' },
  status:          { type: String, enum: ['PENDING', 'POSTED', 'PAID'], default: 'PENDING' },
  payment_je_id:   { type: mongoose.Schema.Types.ObjectId, ref: 'JournalEntry' },
  created_by:      { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true, collection: 'erp_credit_card_transactions' });

creditCardTransactionSchema.index({ entity_id: 1, credit_card_id: 1, txn_date: -1 });
creditCardTransactionSchema.index({ entity_id: 1, status: 1 });
creditCardTransactionSchema.index({ linked_expense_id: 1 });

module.exports = mongoose.model('CreditCardTransaction', creditCardTransactionSchema);
