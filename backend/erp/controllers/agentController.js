const AgentRun = require('../models/AgentRun');
const { catchAsync } = require('../../middleware/errorHandler');

/**
 * Agent Intelligence Controller — serves agent run history and stats.
 */

// List recent agent runs (paginated, filterable)
exports.listRuns = catchAsync(async (req, res) => {
  const filter = {};
  if (req.query.agent_key) filter.agent_key = req.query.agent_key;
  if (req.query.status) filter.status = req.query.status;
  if (req.query.from || req.query.to) {
    filter.run_date = {};
    if (req.query.from) filter.run_date.$gte = new Date(req.query.from);
    if (req.query.to) filter.run_date.$lte = new Date(req.query.to);
  }

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const skip = (page - 1) * limit;

  const [runs, total] = await Promise.all([
    AgentRun.find(filter).sort({ run_date: -1 }).skip(skip).limit(limit).lean(),
    AgentRun.countDocuments(filter)
  ]);

  res.json({ success: true, data: runs, pagination: { page, limit, total } });
});

// Aggregate stats — last run per agent, success rates, totals
exports.getStats = catchAsync(async (req, res) => {
  const [agentStats, recentRuns] = await Promise.all([
    AgentRun.aggregate([
      { $sort: { run_date: -1 } },
      { $group: {
        _id: '$agent_key',
        label: { $first: '$agent_label' },
        last_run: { $first: '$run_date' },
        last_status: { $first: '$status' },
        last_summary: { $first: '$summary' },
        total_runs: { $sum: 1 },
        success_count: { $sum: { $cond: [{ $eq: ['$status', 'success'] }, 1, 0] } },
        total_alerts: { $sum: '$summary.alerts_generated' },
        total_messages: { $sum: '$summary.messages_sent' }
      }},
      { $sort: { last_run: -1 } }
    ]),
    AgentRun.find().sort({ run_date: -1 }).limit(5).lean()
  ]);

  res.json({
    success: true,
    data: {
      agents: agentStats,
      recent_runs: recentRuns
    }
  });
});
