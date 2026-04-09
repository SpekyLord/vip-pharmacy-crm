const mongoose = require('mongoose');
const { ROLES, ROLE_SETS } = require('../../constants/roles');

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
    default: [ROLES.PRESIDENT],
    validate: {
      validator: arr => arr.every(r => ROLE_SETS.MANAGEMENT.includes(r)),
      message: 'notify_roles must be president, admin, or finance'
    }
  },
  updated_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, {
  timestamps: true,
  collection: 'erp_agent_config'
});

module.exports = mongoose.model('AgentConfig', agentConfigSchema);
