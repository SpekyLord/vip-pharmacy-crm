const mongoose = require('mongoose');

const expenseComponentSchema = new mongoose.Schema({
  component_code: { type: String, required: true, trim: true, unique: true },
  component_name: { type: String, required: true, trim: true },
  or_required: { type: Boolean, default: true },
  calf_required: { type: Boolean, default: false },
  is_active: { type: Boolean, default: true }
}, { timestamps: true, collection: 'erp_expense_components' });

module.exports = mongoose.model('ExpenseComponent', expenseComponentSchema);
