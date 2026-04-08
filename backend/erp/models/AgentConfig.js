const mongoose = require('mongoose');

/**
 * AgentConfig Model — per-agent settings controlled by president/admin.
 * Governs enable/disable and notification routing.
 */
const agentConfigSchema = new mongoose.Schema({
  agent_key: {
    type: String,
    required: true,
    unique: true,
    enum: ['performance_coach', 'visit_planner', 'engagement_decay', 'smart_collection', 'bir_filing', 'expense_anomaly', 'inventory_reorder', 'credit_risk', 'document_expiry', 'visit_compliance', 'photo_audit', 'org_intelligence', 'system_integrity']
  },
  enabled: { type: Boolean, default: true },
  notify_roles: {
    type: [String],
    default: ['president'],
    validate: {
      validator: arr => arr.every(r => ['president', 'admin', 'finance'].includes(r)),
      message: 'notify_roles must be president, admin, or finance'
    }
  },
  is_running: { type: Boolean, default: false, index: true },
  current_run_id: { type: mongoose.Schema.Types.ObjectId, ref: 'AgentRun', default: null },
  last_started_at: { type: Date, default: null },
  last_finished_at: { type: Date, default: null },
  run_lock_until: { type: Date, default: null, index: true },
  updated_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, {
  timestamps: true,
  collection: 'erp_agent_config'
});

module.exports = mongoose.model('AgentConfig', agentConfigSchema);
