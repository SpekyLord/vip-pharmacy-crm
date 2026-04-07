const mongoose = require('mongoose');

const componentBudgetSchema = new mongoose.Schema({
  component_code: { type: String, required: true },
  budgeted_amount: { type: Number, required: true }
}, { _id: false });

const budgetAllocationSchema = new mongoose.Schema({
  entity_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Entity',
    required: true
  },
  target_type: {
    type: String,
    enum: ['BDM', 'DEPARTMENT', 'EMPLOYEE'],
    required: true
  },
  target_id: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  target_name: { type: String, trim: true },
  period: {
    type: String,
    required: true,
    match: [/^\d{4}-\d{2}$/, 'Period must be YYYY-MM format']
  },
  components: [componentBudgetSchema],
  total_budget: { type: Number, default: 0 },
  approved_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  approved_at: { type: Date },
  status: {
    type: String,
    enum: ['DRAFT', 'APPROVED', 'CLOSED'],
    default: 'DRAFT'
  }
}, {
  timestamps: true,
  collection: 'erp_budget_allocations'
});

// Auto-compute total_budget
budgetAllocationSchema.pre('save', function (next) {
  if (this.components && this.components.length > 0) {
    this.total_budget = this.components.reduce((sum, c) => sum + (c.budgeted_amount || 0), 0);
  }
  next();
});

// Indexes
budgetAllocationSchema.index({ entity_id: 1, period: 1, target_type: 1 });
budgetAllocationSchema.index({ entity_id: 1, target_id: 1, period: 1 }, { unique: true });

module.exports = mongoose.model('BudgetAllocation', budgetAllocationSchema);
