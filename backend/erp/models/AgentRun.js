const mongoose = require('mongoose');

/**
 * AgentRun Model — tracks AI agent execution history.
 * Created by agents after each cron run for audit trail and dashboard visibility.
 */
const agentRunSchema = new mongoose.Schema({
  agent_key: {
    type: String,
    required: true,
    enum: ['performance_coach', 'visit_planner', 'engagement_decay', 'smart_collection', 'bir_filing', 'expense_anomaly', 'inventory_reorder', 'credit_risk', 'document_expiry', 'visit_compliance', 'photo_audit', 'org_intelligence', 'system_integrity'],
    index: true
  },
  agent_label: { type: String, required: true },
  run_date: { type: Date, default: Date.now, index: true },
  status: {
    type: String,
    enum: ['success', 'error', 'partial'],
    default: 'success'
  },
  summary: {
    bdms_processed: { type: Number, default: 0 },
    alerts_generated: { type: Number, default: 0 },
    messages_sent: { type: Number, default: 0 },
    key_findings: [String]
  },
  error_msg: { type: String },
  message_ids: [{ type: mongoose.Schema.Types.ObjectId, ref: 'MessageInbox' }],
  entity_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Entity' },
  execution_ms: { type: Number, default: 0 }
}, {
  timestamps: true,
  collection: 'erp_agent_runs'
});

agentRunSchema.index({ agent_key: 1, run_date: -1 });
agentRunSchema.index({ status: 1, run_date: -1 });

module.exports = mongoose.model('AgentRun', agentRunSchema);
