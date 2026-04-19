const mongoose = require('mongoose');

/**
 * AgentRun Model — tracks AI agent execution history.
 * Created by agents after each cron run for audit trail and dashboard visibility.
 */
const agentRunSchema = new mongoose.Schema({
  // Phase G8 — enum removed. agent_key is validated against agentRegistry.AGENT_KEYS
  // at the controller level (isKnownAgent); hardcoding the list in a mongoose enum
  // required a schema migration every time a new agent shipped and blocked runs
  // for kpi_snapshot / kpi_variance / dispute_sla / daily_briefing / Phase G8
  // agents since they were never added. Registry is the single source of truth.
  agent_key: {
    type: String,
    required: true,
    trim: true,
    index: true,
  },
  agent_label: { type: String, required: true },
  run_date: { type: Date, default: Date.now, index: true },
  status: {
    type: String,
    enum: ['running', 'success', 'error', 'partial'],
    default: 'success'
  },
  trigger_source: {
    type: String,
    enum: ['manual', 'scheduled'],
    default: 'scheduled',
    index: true,
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
agentRunSchema.index({ agent_key: 1, trigger_source: 1, run_date: -1 });

module.exports = mongoose.model('AgentRun', agentRunSchema);
