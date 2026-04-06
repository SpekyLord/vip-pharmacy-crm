const mongoose = require('mongoose');

const jeLineSchema = new mongoose.Schema({
  account_code: { type: String, required: true },
  account_name: { type: String, required: true },
  debit: { type: Number, default: 0 },
  credit: { type: Number, default: 0 },
  description: { type: String },
  bdm_id: { type: mongoose.Schema.Types.ObjectId, ref: 'PeopleMaster' },
  cost_center: { type: String }
}, { _id: false });

const recurringJournalTemplateSchema = new mongoose.Schema({
  entity_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Entity', required: true },
  name: { type: String, required: true, trim: true },
  description: { type: String, trim: true },
  frequency: {
    type: String,
    enum: ['MONTHLY', 'QUARTERLY', 'ANNUALLY'],
    required: true
  },
  day_of_month: { type: Number, default: 1, min: 1, max: 28 },
  lines: [jeLineSchema],
  auto_post: { type: Boolean, default: false },
  source_module: { type: String, default: 'MANUAL' },
  next_run_date: { type: Date },
  last_run_date: { type: Date },
  is_active: { type: Boolean, default: true },
  created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  created_at: { type: Date, default: Date.now }
}, {
  timestamps: false,
  collection: 'erp_recurring_journal_templates'
});

recurringJournalTemplateSchema.index({ entity_id: 1, is_active: 1, next_run_date: 1 });

module.exports = mongoose.model('RecurringJournalTemplate', recurringJournalTemplateSchema);
