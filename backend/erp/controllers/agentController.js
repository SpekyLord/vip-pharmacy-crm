const AgentRun = require('../models/AgentRun');
const AgentConfig = require('../models/AgentConfig');
const { catchAsync } = require('../../middleware/errorHandler');
const { startManualAgentRun } = require('../../agents/agentExecutor');
const { AGENT_KEYS } = require('../../agents/agentRegistry');

/**
 * Agent Intelligence Controller - serves agent run history, stats, and on-demand triggers.
 */

exports.listRuns = catchAsync(async (req, res) => {
  const filter = {};
  if (req.query.agent_key) filter.agent_key = req.query.agent_key;
  if (req.query.status) filter.status = req.query.status;
  if (req.query.from || req.query.to) {
    filter.run_date = {};
    if (req.query.from) filter.run_date.$gte = new Date(req.query.from);
    if (req.query.to) filter.run_date.$lte = new Date(req.query.to);
  }

  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 20;
  const skip = (page - 1) * limit;

  const [runs, total] = await Promise.all([
    AgentRun.find(filter).sort({ run_date: -1 }).skip(skip).limit(limit).lean(),
    AgentRun.countDocuments(filter),
  ]);

  res.json({ success: true, data: runs, pagination: { page, limit, total } });
});

exports.getStats = catchAsync(async (req, res) => {
  const [agentStats, recentRuns] = await Promise.all([
    AgentRun.aggregate([
      { $sort: { run_date: -1 } },
      {
        $group: {
          _id: '$agent_key',
          label: { $first: '$agent_label' },
          last_run: { $first: '$run_date' },
          last_status: { $first: '$status' },
          last_error_msg: { $first: '$error_msg' },
          last_summary: { $first: '$summary' },
          total_runs: { $sum: 1 },
          success_count: { $sum: { $cond: [{ $eq: ['$status', 'success'] }, 1, 0] } },
          total_alerts: { $sum: '$summary.alerts_generated' },
          total_messages: { $sum: '$summary.messages_sent' },
        },
      },
      { $sort: { last_run: -1 } },
    ]),
    AgentRun.find().sort({ run_date: -1 }).limit(10).lean(),
  ]);

  res.json({
    success: true,
    data: {
      agents: agentStats,
      recent_runs: recentRuns,
    },
  });
});

exports.runAgent = catchAsync(async (req, res) => {
  const { agentKey } = req.params;

  if (!AGENT_KEYS.includes(agentKey)) {
    return res.status(400).json({ success: false, message: `Unknown agent: ${agentKey}` });
  }

  const result = await startManualAgentRun(agentKey);

  if (!result.started && result.reason === 'already_running') {
    return res.status(409).json({ success: false, message: `Agent "${agentKey}" is already running` });
  }

  res.status(202).json({
    success: true,
    message: `Agent "${agentKey}" started in background`,
    data: result.run,
  });
});

exports.getConfig = catchAsync(async (req, res) => {
  const configs = await AgentConfig.find().sort({ agent_key: 1 }).lean();

  const merged = AGENT_KEYS.map((key) => {
    const existing = configs.find((config) => config.agent_key === key);
    return existing || {
      agent_key: key,
      enabled: true,
      schedule: null,
      notify_roles: ['president'],
      is_running: false,
      current_run_id: null,
      last_started_at: null,
      last_finished_at: null,
    };
  });

  res.json({ success: true, data: merged });
});

exports.updateConfig = catchAsync(async (req, res) => {
  const { agentKey } = req.params;
  const { enabled, notify_roles } = req.body;

  if (!AGENT_KEYS.includes(agentKey)) {
    return res.status(400).json({ success: false, message: `Unknown agent: ${agentKey}` });
  }

  const updates = { updated_by: req.user._id };
  if (enabled !== undefined) updates.enabled = enabled;
  if (notify_roles !== undefined) updates.notify_roles = notify_roles;

  const config = await AgentConfig.findOneAndUpdate(
    { agent_key: agentKey },
    { $set: updates, $setOnInsert: { agent_key: agentKey } },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
  );

  res.json({ success: true, data: config });
});
