const mongoose = require('mongoose');

const periodLockSchema = new mongoose.Schema({
  entity_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Entity', required: true },
  module: {
    type: String,
    enum: ['SALES', 'COLLECTION', 'EXPENSE', 'JOURNAL', 'PAYROLL',
           'PURCHASING', 'INVENTORY', 'BANKING', 'PETTY_CASH', 'IC_TRANSFER', 'INCOME'],
    required: true
  },
  year: { type: Number, required: true },
  month: { type: Number, required: true, min: 1, max: 12 },
  is_locked: { type: Boolean, default: false },
  locked_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  locked_at: { type: Date },
  unlocked_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  unlocked_at: { type: Date }
}, {
  timestamps: false,
  collection: 'erp_period_locks'
});

periodLockSchema.index({ entity_id: 1, module: 1, year: 1, month: 1 }, { unique: true });

module.exports = mongoose.model('PeriodLock', periodLockSchema);
