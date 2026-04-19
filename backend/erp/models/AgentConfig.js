const mongoose = require('mongoose');
const { ROLES, ROLE_SETS } = require('../../constants/roles');

/**
 * AgentConfig Model — per-agent settings controlled by president/admin.
 * Governs enable/disable and notification routing.
 */
const agentConfigSchema = new mongoose.Schema({
  // Phase G8 — enum removed. agentRegistry.AGENT_KEYS is the source of truth;
  // controller validates via isKnownAgent before calling update/upsert. Keeping
  // the hardcoded enum silently blocked writes for every agent added after the
  // original 13. Unique index preserved so each agent has exactly one config row.
  agent_key: {
    type: String,
    required: true,
    unique: true,
    trim: true,
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
