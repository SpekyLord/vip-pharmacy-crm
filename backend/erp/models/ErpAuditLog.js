const mongoose = require('mongoose');

const erpAuditLogSchema = new mongoose.Schema({
  entity_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Entity',
    required: true
  },
  bdm_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  log_type: {
    type: String,
    // Phase G7: COPILOT_TOOL_CALL, AI_BUDGET_CHANGE, AI_COWORK_CONFIG_CHANGE added so
    // the President's Copilot, spend-cap edits, and AI Cowork prompt edits all
    // persist in the audit ledger instead of failing silently.
    enum: [
      'SALES_EDIT', 'PRICE_CHANGE', 'ITEM_CHANGE', 'DELETION', 'REOPEN',
      'STATUS_CHANGE', 'PRESIDENT_REVERSAL',
      'COPILOT_TOOL_CALL', 'AI_BUDGET_CHANGE', 'AI_COWORK_CONFIG_CHANGE',
    ],
    required: true
  },
  target_ref: { type: String },
  target_model: { type: String },
  field_changed: { type: String },
  old_value: { type: mongoose.Schema.Types.Mixed },
  new_value: { type: mongoose.Schema.Types.Mixed },
  changed_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  changed_at: {
    type: Date,
    immutable: true,
    default: Date.now
  },
  note: { type: String }
}, {
  timestamps: false,
  collection: 'erp_audit_logs'
});

// Immutable — no updates on existing documents
erpAuditLogSchema.pre('save', function (next) {
  if (!this.isNew) {
    return next(new Error('ErpAuditLog entries are immutable.'));
  }
  this.changed_at = new Date();
  next();
});

/**
 * Convenience static: ErpAuditLog.logChange({ ... })
 */
erpAuditLogSchema.statics.logChange = function (data) {
  return this.create(data);
};

// Indexes
erpAuditLogSchema.index({ entity_id: 1, target_model: 1, target_ref: 1 });
erpAuditLogSchema.index({ changed_at: -1 });
erpAuditLogSchema.index({ log_type: 1 });

module.exports = mongoose.model('ErpAuditLog', erpAuditLogSchema);
