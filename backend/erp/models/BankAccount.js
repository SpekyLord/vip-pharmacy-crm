const mongoose = require('mongoose');

const bankAccountSchema = new mongoose.Schema({
  entity_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Entity', required: true },
  bank_code: { type: String, required: true, trim: true },
  bank_name: { type: String, required: true, trim: true },
  account_no: { type: String, trim: true },
  account_type: { type: String, enum: ['SAVINGS', 'CHECKING', 'CURRENT'], default: 'SAVINGS' },
  coa_code: { type: String, trim: true },
  opening_balance: { type: Number, default: 0 },
  current_balance: { type: Number, default: 0 },
  statement_import_format: { type: String, enum: ['CSV', 'OFX', 'MT940'], default: 'CSV' },
  // Multiple users can be assigned to deposit/use this account
  assigned_users: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  is_active: { type: Boolean, default: true }
}, { timestamps: true, collection: 'erp_bank_accounts' });

bankAccountSchema.index({ entity_id: 1, bank_code: 1 }, { unique: true });
bankAccountSchema.index({ entity_id: 1, assigned_users: 1 });

module.exports = mongoose.model('BankAccount', bankAccountSchema);
